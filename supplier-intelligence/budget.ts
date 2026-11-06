/**
 * Supplier Intelligence - Deterministic Budget Optimization Engine
 */

import {
  Member2InventoryReportItem,
  SupplierData,
  BudgetOptimizationOptions,
  BudgetOptimizationResult,
  PurchaseOrderLine,
  UnfundedInventoryItem,
} from "./types.js";
import { compare_suppliers } from "./suppliers.js";

/**
 * Validates Member 2's inventory report items
 */
export function validateInventoryReportItem(item: Member2InventoryReportItem, index: number): void {
  if (!item || typeof item !== "object") {
    throw new Error(`Invalid inventory report item at index ${index}: must be an object`);
  }
  if (!item.sku || typeof item.sku !== "string" || item.sku.trim() === "") {
    throw new Error(`Invalid inventory report item at index ${index}: sku must be a non-empty string`);
  }
  if (!item.productName || typeof item.productName !== "string") {
    throw new Error(`Invalid inventory report item ${item.sku}: productName must be a string`);
  }
  if (typeof item.currentStock !== "number" || !Number.isFinite(item.currentStock) || item.currentStock < 0) {
    throw new Error(`Invalid inventory report item ${item.sku}: currentStock must be a non-negative number`);
  }
  if (!item.inventoryAnalysis || typeof item.inventoryAnalysis !== "object") {
    throw new Error(`Invalid inventory report item ${item.sku}: missing inventoryAnalysis object`);
  }

  const { recommendedQuantity, riskLevel, daysUntilStockout } = item.inventoryAnalysis;
  if (typeof recommendedQuantity !== "number" || !Number.isFinite(recommendedQuantity) || recommendedQuantity < 0) {
    throw new Error(`Invalid inventory report item ${item.sku}: recommendedQuantity must be a non-negative number`);
  }
  if (!["HIGH", "MEDIUM", "LOW", "NO_DEMAND"].includes(riskLevel)) {
    throw new Error(`Invalid inventory report item ${item.sku}: unknown riskLevel '${riskLevel}'`);
  }
  if (daysUntilStockout !== null && (typeof daysUntilStockout !== "number" || !Number.isFinite(daysUntilStockout) || daysUntilStockout < 0)) {
    throw new Error(`Invalid inventory report item ${item.sku}: daysUntilStockout must be a non-negative number or null`);
  }
}

/**
 * Optimizes procurement budget based on stockout risk urgency and supplier offers
 * Guarantees: Total allocated budget will NEVER exceed availableBudget.
 */
export function optimize_budget(
  inventoryReport: Member2InventoryReportItem[],
  suppliers: SupplierData[],
  availableBudget: number,
  options: BudgetOptimizationOptions = {}
): BudgetOptimizationResult {
  if (!Array.isArray(inventoryReport)) {
    throw new Error("inventoryReport must be an array of Member 2 inventory items");
  }
  if (!Array.isArray(suppliers)) {
    throw new Error("suppliers must be an array");
  }
  if (typeof availableBudget !== "number" || !Number.isFinite(availableBudget) || availableBudget < 0) {
    throw new Error("availableBudget must be a non-negative finite number");
  }

  // Validate report items
  inventoryReport.forEach((item, idx) => validateInventoryReportItem(item, idx));

  const preference = options.preference || "CHEAPEST";
  const allowPartial = options.allowPartialRestock ?? true;
  const buffer = Math.max(0, options.minBudgetBuffer || 0);
  const effectiveBudget = Math.max(0, Number((availableBudget - buffer).toFixed(2)));

  // Separate items that need replenishment vs items with zero needed
  const candidateItems: Member2InventoryReportItem[] = [];
  const zeroDemandItems: UnfundedInventoryItem[] = [];

  for (const item of inventoryReport) {
    if (item.inventoryAnalysis.recommendedQuantity > 0) {
      candidateItems.push(item);
    } else {
      zeroDemandItems.push({
        sku: item.sku,
        productName: item.productName,
        recommendedQuantity: 0,
        estimatedCost: 0,
        reason: "ZERO_QUANTITY_NEEDED",
        riskLevel: item.inventoryAnalysis.riskLevel,
        daysUntilStockout: item.inventoryAnalysis.daysUntilStockout,
      });
    }
  }

  // Prioritization sorting:
  // 1. Risk Level: HIGH (0) -> MEDIUM (1) -> LOW (2) -> NO_DEMAND (3)
  // 2. Fewer days until stockout (ascending). Null values placed at the end.
  // 3. Higher 30-day forecast demand
  const riskRank = { HIGH: 0, MEDIUM: 1, LOW: 2, NO_DEMAND: 3 };

  candidateItems.sort((a, b) => {
    const rankA = riskRank[a.inventoryAnalysis.riskLevel];
    const rankB = riskRank[b.inventoryAnalysis.riskLevel];
    if (rankA !== rankB) return rankA - rankB;

    const daysA = a.inventoryAnalysis.daysUntilStockout;
    const daysB = b.inventoryAnalysis.daysUntilStockout;
    if (daysA !== null && daysB !== null) {
      if (daysA !== daysB) return daysA - daysB; // Fewer days first!
    } else if (daysA !== null && daysB === null) {
      return -1;
    } else if (daysA === null && daysB !== null) {
      return 1;
    }

    const demandA = a.forecasting?.forecast30Days || 0;
    const demandB = b.forecasting?.forecast30Days || 0;
    return demandB - demandA;
  });

  const itemsPurchased: PurchaseOrderLine[] = [];
  const unfundedItems: UnfundedInventoryItem[] = [...zeroDemandItems];
  let remainingBudget = effectiveBudget;

  for (const item of candidateItems) {
    const neededQty = item.inventoryAnalysis.recommendedQuantity;

    // Compare suppliers for this item
    const comparison = compare_suppliers(item.sku, suppliers, neededQty, preference);

    if (comparison.offersCount === 0 || !comparison.recommendedOffer) {
      unfundedItems.push({
        sku: item.sku,
        productName: item.productName,
        recommendedQuantity: neededQty,
        estimatedCost: null,
        reason: "NO_MATCHING_SUPPLIER_OFFER",
        riskLevel: item.inventoryAnalysis.riskLevel,
        daysUntilStockout: item.inventoryAnalysis.daysUntilStockout,
      });
      continue;
    }

    const offer = comparison.recommendedOffer;
    const unitPrice = offer.unitPrice;
    const fullLineCost = Number((unitPrice * neededQty).toFixed(2));

    // Can we afford the full recommended quantity?
    if (fullLineCost <= remainingBudget) {
      itemsPurchased.push({
        sku: item.sku,
        productName: item.productName,
        requestedQuantity: neededQty,
        allocatedQuantity: neededQty,
        isPartial: false,
        unitPrice,
        lineTotal: fullLineCost,
        selectedSupplier: {
          id: offer.supplierId,
          name: offer.supplierName,
          reliability: offer.reliability,
          leadTimeDays: offer.leadTimeDays,
        },
        urgencyContext: {
          riskLevel: item.inventoryAnalysis.riskLevel,
          daysUntilStockout: item.inventoryAnalysis.daysUntilStockout,
          demandTrend: item.forecasting.demandTrend,
        },
      });

      remainingBudget = Number((remainingBudget - fullLineCost).toFixed(2));
    } else if (allowPartial) {
      // Calculate how many units we can afford deterministically
      const affordableUnits = Math.floor(remainingBudget / unitPrice);

      // Check if affordable units satisfies supplier MOQ or if MOQ is 0/1
      const minimumAcceptable = offer.moq > 1 ? offer.moq : 1;

      if (affordableUnits >= minimumAcceptable && affordableUnits > 0) {
        const partialCost = Number((unitPrice * affordableUnits).toFixed(2));
        itemsPurchased.push({
          sku: item.sku,
          productName: item.productName,
          requestedQuantity: neededQty,
          allocatedQuantity: affordableUnits,
          isPartial: true,
          unitPrice,
          lineTotal: partialCost,
          selectedSupplier: {
            id: offer.supplierId,
            name: offer.supplierName,
            reliability: offer.reliability,
            leadTimeDays: offer.leadTimeDays,
          },
          urgencyContext: {
            riskLevel: item.inventoryAnalysis.riskLevel,
            daysUntilStockout: item.inventoryAnalysis.daysUntilStockout,
            demandTrend: item.forecasting.demandTrend,
          },
        });

        remainingBudget = Number((remainingBudget - partialCost).toFixed(2));
      } else {
        // Cannot afford even MOQ or 1 unit
        unfundedItems.push({
          sku: item.sku,
          productName: item.productName,
          recommendedQuantity: neededQty,
          estimatedCost: fullLineCost,
          reason: affordableUnits < offer.moq && offer.moq > 1 ? "MOQ_EXCEEDS_BUDGET" : "BUDGET_EXCEEDED",
          riskLevel: item.inventoryAnalysis.riskLevel,
          daysUntilStockout: item.inventoryAnalysis.daysUntilStockout,
        });
      }
    } else {
      // Partial restock is not allowed and full cost exceeds remaining budget
      unfundedItems.push({
        sku: item.sku,
        productName: item.productName,
        recommendedQuantity: neededQty,
        estimatedCost: fullLineCost,
        reason: "BUDGET_EXCEEDED",
        riskLevel: item.inventoryAnalysis.riskLevel,
        daysUntilStockout: item.inventoryAnalysis.daysUntilStockout,
      });
    }
  }

  // Exact deterministic financial aggregation
  const allocatedBudget = Number(itemsPurchased.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  const finalRemainingBudget = Number((availableBudget - allocatedBudget).toFixed(2));
  const totalUnitsOrdered = itemsPurchased.reduce((sum, item) => sum + item.allocatedQuantity, 0);
  const utilization = availableBudget > 0 ? Number(((allocatedBudget / availableBudget) * 100).toFixed(2)) : 0;

  return {
    availableBudget: Number(availableBudget.toFixed(2)),
    allocatedBudget,
    remainingBudget: finalRemainingBudget,
    budgetUtilizationPercentage: utilization,
    totalItemsConsidered: inventoryReport.length,
    itemsPurchasedCount: itemsPurchased.length,
    totalUnitsOrdered,
    itemsPurchased,
    unfundedItems,
  };
}


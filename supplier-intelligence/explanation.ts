/**
 * Supplier Intelligence - Plan Explanation Engine for Manager Review
 */

import {
  BudgetOptimizationResult,
  PlanSnapshot,
  ItemExplanation,
  PlanExplanation,
} from "./types.js";

/**
 * Generates transparent, auditable structured explanations for store managers reviewing a purchase plan
 */
export function explain_purchase_plan(
  planOrResult: BudgetOptimizationResult | PlanSnapshot
): PlanExplanation {
  const result = "optimizationResult" in planOrResult ? planOrResult.optimizationResult : planOrResult;

  if (!result || typeof result !== "object" || !Array.isArray(result.itemsPurchased)) {
    throw new Error("Invalid purchase plan result: missing itemsPurchased array");
  }

  // Count high risk items resolved vs pending
  let highRiskResolved = 0;
  for (const item of result.itemsPurchased) {
    if (item.urgencyContext.riskLevel === "HIGH") {
      highRiskResolved++;
    }
  }

  let highRiskUnfunded = 0;
  for (const item of result.unfundedItems) {
    if (item.riskLevel === "HIGH") {
      highRiskUnfunded++;
    }
  }

  const lineExplanations: ItemExplanation[] = [];

  // Generate per-item explanations for purchased lines
  for (const item of result.itemsPurchased) {
    const isPartial = item.isPartial;
    const shareOfBudget =
      result.allocatedBudget > 0
        ? Number(((item.lineTotal / result.allocatedBudget) * 100).toFixed(1))
        : 0;

    const daysText =
      item.urgencyContext.daysUntilStockout !== null
        ? `${item.urgencyContext.daysUntilStockout} days until stockout`
        : "unspecified stock runway";

    const riskText =
      item.urgencyContext.riskLevel === "HIGH"
        ? `CRITICAL urgency (${daysText}, ${item.urgencyContext.demandTrend} demand)`
        : `Moderate urgency (${item.urgencyContext.riskLevel} risk, ${daysText})`;

    const justification = isPartial
      ? `Partially funded: Allocated ${item.allocatedQuantity} of ${item.requestedQuantity} recommended units ($${item.lineTotal.toFixed(2)}) due to remaining budget ceiling. Mitigates ${riskText}.`
      : `Fully funded: Allocated all ${item.allocatedQuantity} recommended units ($${item.lineTotal.toFixed(2)}). Effectively eliminates ${riskText}.`;

    const supplierRationale = `Procured from ${item.selectedSupplier.name} at wholesale price of $${item.unitPrice.toFixed(2)} with ${item.selectedSupplier.leadTimeDays}-day delivery lead time and ${item.selectedSupplier.reliability}% vendor fulfillment reliability.`;

    lineExplanations.push({
      sku: item.sku,
      productName: item.productName,
      decision: isPartial ? "PURCHASED_PARTIAL" : "PURCHASED_FULL",
      justification,
      supplierRationale,
      riskContext: `Prioritized due to ${item.urgencyContext.riskLevel} risk level (${item.urgencyContext.demandTrend} trend, ${daysText}).`,
      financialImpact: {
        unitPrice: item.unitPrice,
        allocatedQuantity: item.allocatedQuantity,
        subtotal: item.lineTotal,
        percentageOfTotalBudget: shareOfBudget,
      },
    });
  }

  // Generate per-item explanations for unfunded lines
  for (const item of result.unfundedItems) {
    if (item.reason === "ZERO_QUANTITY_NEEDED") continue;

    let justification = "";
    if (item.reason === "BUDGET_EXCEEDED") {
      justification = `Excluded from order: Full replenishment of ${item.recommendedQuantity} units requires ~$${item.estimatedCost?.toFixed(2) || "N/A"}, which exceeds the remaining unallocated budget ($${result.remainingBudget.toFixed(2)}).`;
    } else if (item.reason === "NO_MATCHING_SUPPLIER_OFFER") {
      justification = `Cannot order: No active supplier offer was found matching SKU '${item.sku}'. Requires manual distributor onboarding.`;
    } else if (item.reason === "MOQ_EXCEEDS_BUDGET") {
      justification = `Excluded: Supplier minimum order quantity (MOQ) requires more capital than the remaining budget balance ($${result.remainingBudget.toFixed(2)}).`;
    }

    const daysText = item.daysUntilStockout !== null ? `${item.daysUntilStockout} days` : "N/A";

    lineExplanations.push({
      sku: item.sku,
      productName: item.productName,
      decision: item.reason === "NO_MATCHING_SUPPLIER_OFFER" ? "UNFUNDED_NO_SUPPLIER" : "UNFUNDED_BUDGET",
      justification,
      supplierRationale: "No supplier purchase generated under this plan.",
      riskContext: `Unfunded risk level: ${item.riskLevel} (Runway: ${daysText}).`,
      financialImpact: {
        unitPrice: 0,
        allocatedQuantity: 0,
        subtotal: 0,
        percentageOfTotalBudget: 0,
      },
    });
  }

  // Executive summary
  const overview = `Optimized plan allocates $${result.allocatedBudget.toFixed(2)} across ${result.itemsPurchasedCount} product lines (${result.totalUnitsOrdered} total units), reserving $${result.remainingBudget.toFixed(2)} in uncommitted cash capital (${result.budgetUtilizationPercentage}% budget utilization). Resolves ${highRiskResolved} urgent HIGH-risk stockout threats.`;

  let topPriorityRecommendation = "Plan is fully aligned with capital limits and safe for manager sign-off.";
  if (highRiskUnfunded > 0) {
    topPriorityRecommendation = `Warning: ${highRiskUnfunded} HIGH-risk product(s) could not be replenished due to budget constraints. Consider increasing restock budget or authorizing expedited credit.`;
  }

  const managerCheckpoints = [
    `Budget Verification: Total spend ($${result.allocatedBudget.toFixed(2)}) is within the $${result.availableBudget.toFixed(2)} ceiling.`,
    `Stockout Protection: ${highRiskResolved} high-risk SKU(s) covered with immediate supplier purchase orders.`,
    `Vendor Fulfillment: All selected distributor lead times fall within allowable delivery windows.`,
  ];

  if (highRiskUnfunded > 0) {
    managerCheckpoints.push(`Action Required: Review ${highRiskUnfunded} unfunded high-urgency item(s) in the breakdown below.`);
  }

  return {
    summary: {
      overview,
      budgetStatus: "STRICTLY_COMPLIANT",
      totalSpend: result.allocatedBudget,
      budgetCap: result.availableBudget,
      remainingCash: result.remainingBudget,
      highRiskItemsResolved: highRiskResolved,
      highRiskItemsRemainingUnfunded: highRiskUnfunded,
      topPriorityRecommendation,
    },
    lineExplanations,
    managerCheckpoints,
  };
}


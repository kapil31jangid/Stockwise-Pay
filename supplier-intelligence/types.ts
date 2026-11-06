/**
 * StockWise Pay - Supplier Intelligence & Budget Optimization Types
 * Designed for Member 4 integration with Member 2's Inventory Intelligence module.
 */

/**
 * Exact schema emitted by Member 2's `generateInventoryReport()`
 */
export interface Member2InventoryReportItem {
  sku: string;
  productName: string;
  currentStock: number;
  forecasting: {
    averageDailyDemand: number;
    smaForecast7Days: number;
    emaForecast7Days: number;
    forecast30Days: number;
    demandTrend: "INCREASING" | "DECREASING" | "STABLE";
  };
  inventoryAnalysis: {
    daysUntilStockout: number | null;
    reorderPoint: number;
    recommendedQuantity: number;
    riskLevel: "HIGH" | "MEDIUM" | "LOW" | "NO_DEMAND";
  };
}

/**
 * Supplier Offer for a specific SKU
 */
export interface SupplierSkuOffer {
  sku: string;
  unitPrice: number;        // Deterministic wholesale unit price > 0
  leadTimeDays: number;     // Fulfillment time in business days >= 0
  moq: number;              // Minimum Order Quantity >= 0
  bulkDiscountNote?: string;// e.g. "5% off > 50 units"
}

/**
 * Supplier entity
 */
export interface SupplierData {
  id: string;
  name: string;
  reliability: number;      // Fulfillment reliability percentage: 0 to 100
  rating?: number;          // e.g. 1.0 - 5.0
  paymentTerms?: string;    // e.g. "Net 30", "PayPal Verified"
  location?: string;
  contactEmail?: string;
  offers: SupplierSkuOffer[];
}

/**
 * Supplier offer evaluated and ranked
 */
export interface RankedSupplierOffer extends SupplierSkuOffer {
  supplierId: string;
  supplierName: string;
  reliability: number;
  totalEstimatedCost: number;  // unitPrice * quantity
  meetsMoq: boolean;
  score: number;               // Normalized composite score (0-100)
}

/**
 * Comparison result for a single SKU across suppliers
 */
export interface SupplierComparisonResult {
  sku: string;
  requestedQuantity: number;
  offersCount: number;
  allOffers: RankedSupplierOffer[];
  bestPriceOffer?: RankedSupplierOffer;
  fastestDeliveryOffer?: RankedSupplierOffer;
  mostReliableOffer?: RankedSupplierOffer;
  recommendedOffer?: RankedSupplierOffer;
}

export type SupplierPreference = "CHEAPEST" | "FASTEST" | "MOST_RELIABLE" | "BALANCED";

export interface BudgetOptimizationOptions {
  preference?: SupplierPreference;
  allowPartialRestock?: boolean;  // If true, buy partial quantity if budget cannot afford full recommendedQuantity (respecting MOQ)
  minBudgetBuffer?: number;       // Optional reserve amount left unspent
}

/**
 * Final approved order line for an item
 */
export interface PurchaseOrderLine {
  sku: string;
  productName: string;
  requestedQuantity: number;
  allocatedQuantity: number;
  isPartial: boolean;
  unitPrice: number;
  lineTotal: number;
  selectedSupplier: {
    id: string;
    name: string;
    reliability: number;
    leadTimeDays: number;
  };
  urgencyContext: {
    riskLevel: "HIGH" | "MEDIUM" | "LOW" | "NO_DEMAND";
    daysUntilStockout: number | null;
    demandTrend: "INCREASING" | "DECREASING" | "STABLE";
  };
}

/**
 * Item that could not be funded or fulfilled under the budget
 */
export interface UnfundedInventoryItem {
  sku: string;
  productName: string;
  recommendedQuantity: number;
  estimatedCost: number | null;
  reason: "BUDGET_EXCEEDED" | "NO_MATCHING_SUPPLIER_OFFER" | "MOQ_EXCEEDS_BUDGET" | "ZERO_QUANTITY_NEEDED";
  riskLevel: "HIGH" | "MEDIUM" | "LOW" | "NO_DEMAND";
  daysUntilStockout: number | null;
}

/**
 * Output of optimize_budget
 */
export interface BudgetOptimizationResult {
  availableBudget: number;
  allocatedBudget: number;       // Exact sum of line totals, <= availableBudget
  remainingBudget: number;       // availableBudget - allocatedBudget, >= 0
  budgetUtilizationPercentage: number;
  totalItemsConsidered: number;
  itemsPurchasedCount: number;
  totalUnitsOrdered: number;
  itemsPurchased: PurchaseOrderLine[];
  unfundedItems: UnfundedInventoryItem[];
}

/**
 * Snapshot of a simulated purchase plan
 */
export interface PlanSnapshot {
  version: number;
  planId: string;
  timestamp: string;
  scenarioName?: string;
  budgetCap: number;
  optimizationResult: BudgetOptimizationResult;
  deltaFromPrevious?: {
    budgetDelta: number;
    allocatedCostDelta: number;
    unitsOrderedDelta: number;
    itemsFundedDelta: number;
  };
}

/**
 * Plan simulation history container
 */
export interface PlanSimulationHistory {
  planId: string;
  currentVersion: number;
  activePlan: PlanSnapshot;
  history: PlanSnapshot[];
}

/**
 * Explanation item per product
 */
export interface ItemExplanation {
  sku: string;
  productName: string;
  decision: "PURCHASED_FULL" | "PURCHASED_PARTIAL" | "UNFUNDED_BUDGET" | "UNFUNDED_NO_SUPPLIER";
  justification: string;
  supplierRationale: string;
  riskContext: string;
  financialImpact: {
    unitPrice: number;
    allocatedQuantity: number;
    subtotal: number;
    percentageOfTotalBudget: number;
  };
}

/**
 * Structured explanation report for manager review
 */
export interface PlanExplanation {
  summary: {
    overview: string;
    budgetStatus: "STRICTLY_COMPLIANT";
    totalSpend: number;
    budgetCap: number;
    remainingCash: number;
    highRiskItemsResolved: number;
    highRiskItemsRemainingUnfunded: number;
    topPriorityRecommendation: string;
  };
  lineExplanations: ItemExplanation[];
  managerCheckpoints: string[];
}


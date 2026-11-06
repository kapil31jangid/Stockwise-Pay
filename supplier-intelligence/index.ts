/**
 * StockWise Pay - Supplier Intelligence and Budget Optimization Module
 * Authored for Member 4 integration with Member 2's Inventory Intelligence module.
 */

export {
  compare_suppliers,
  validateSupplierData,
  validateSupplierOffer,
} from "./suppliers.js";

export {
  optimize_budget,
  validateInventoryReportItem,
} from "./budget.js";

export {
  simulate_purchase_plan,
  type SimulationOptions,
} from "./simulation.js";

export {
  explain_purchase_plan,
} from "./explanation.js";

export {
  runSupplierBudgetPipeline,
  type FullProcurementPipelineResult,
  type InventoryProduct,
} from "./integration.js";

export {
  DEMO_SUPPLIERS,
  DEMO_MEMBER2_INVENTORY_REPORT,
} from "./demo-data.js";

export type {
  Member2InventoryReportItem,
  SupplierData,
  SupplierSkuOffer,
  RankedSupplierOffer,
  SupplierComparisonResult,
  SupplierPreference,
  BudgetOptimizationOptions,
  PurchaseOrderLine,
  UnfundedInventoryItem,
  BudgetOptimizationResult,
  PlanSnapshot,
  PlanSimulationHistory,
  ItemExplanation,
  PlanExplanation,
} from "./types.js";

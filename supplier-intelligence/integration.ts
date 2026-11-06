/**
 * Integration Bridge between Member 2's Inventory Intelligence
 * and Member 4's Supplier Intelligence & Budget Optimization
 */

import { generateInventoryReport, type InventoryProduct } from "../intelligence/index.js";
import { optimize_budget } from "./budget.js";
import { explain_purchase_plan } from "./explanation.js";
import {
  Member2InventoryReportItem,
  SupplierData,
  BudgetOptimizationOptions,
  BudgetOptimizationResult,
  PlanExplanation,
} from "./types.js";

export interface FullProcurementPipelineResult {
  inventoryReport: Member2InventoryReportItem[];
  optimizedPlan: BudgetOptimizationResult;
  explanation: PlanExplanation;
}

/**
 * End-to-end procurement orchestration function:
 * 1. Generates Member 2's inventory demand & stockout analysis
 * 2. Feeds report into Member 4's deterministic budget & supplier optimizer
 * 3. Prepares structured manager explanations for review
 */
export function runSupplierBudgetPipeline(
  products: InventoryProduct[],
  suppliers: SupplierData[],
  budget: number,
  options?: BudgetOptimizationOptions
): FullProcurementPipelineResult {
  if (!Array.isArray(products)) {
    throw new Error("products must be an array conforming to Member 2's InventoryProduct schema");
  }

  // Step 1: Run Member 2's deterministic inventory intelligence module
  const inventoryReport = generateInventoryReport(products) as unknown as Member2InventoryReportItem[];

  // Step 2: Run Member 4's budget and supplier optimizer
  const optimizedPlan = optimize_budget(inventoryReport, suppliers, budget, options);

  // Step 3: Generate structured manager review explanations
  const explanation = explain_purchase_plan(optimizedPlan);

  return {
    inventoryReport,
    optimizedPlan,
    explanation,
  };
}

export type { InventoryProduct };


/**
 * Supplier Intelligence - Plan Simulation & Versioning Engine
 */

import {
  Member2InventoryReportItem,
  SupplierData,
  PlanSnapshot,
  PlanSimulationHistory,
  BudgetOptimizationOptions,
} from "./types.js";
import { optimize_budget } from "./budget.js";

export interface SimulationOptions extends BudgetOptimizationOptions {
  planId?: string;
  scenarioName?: string;
  timestamp?: string;
}

/**
 * Recalculates a purchase plan under a new budget ceiling while strictly preserving previous snapshots
 */
export function simulate_purchase_plan(
  historyOrPrevious: PlanSimulationHistory | PlanSnapshot | null,
  newBudget: number,
  inventoryReport: Member2InventoryReportItem[],
  suppliers: SupplierData[],
  options: SimulationOptions = {}
): PlanSimulationHistory {
  if (typeof newBudget !== "number" || !Number.isFinite(newBudget) || newBudget < 0) {
    throw new Error("newBudget must be a non-negative finite number");
  }

  // Run deterministic budget optimization with the new budget
  const optimizationResult = optimize_budget(inventoryReport, suppliers, newBudget, options);

  // Normalize previous history
  let existingHistory: PlanSnapshot[] = [];
  let previousPlan: PlanSnapshot | null = null;
  let planId = options.planId || `PLAN-${Date.now()}`;
  let nextVersion = 1;

  if (historyOrPrevious) {
    if ("history" in historyOrPrevious && Array.isArray(historyOrPrevious.history)) {
      existingHistory = [...historyOrPrevious.history];
      previousPlan = historyOrPrevious.activePlan || null;
      planId = historyOrPrevious.planId || planId;
      nextVersion = historyOrPrevious.currentVersion + 1;
    } else if ("version" in historyOrPrevious) {
      existingHistory = [historyOrPrevious];
      previousPlan = historyOrPrevious;
      planId = historyOrPrevious.planId || planId;
      nextVersion = historyOrPrevious.version + 1;
    }
  }

  // Calculate deterministic deltas if a prior snapshot exists
  let deltaFromPrevious: PlanSnapshot["deltaFromPrevious"] = undefined;
  if (previousPlan) {
    deltaFromPrevious = {
      budgetDelta: Number((newBudget - previousPlan.budgetCap).toFixed(2)),
      allocatedCostDelta: Number(
        (optimizationResult.allocatedBudget - previousPlan.optimizationResult.allocatedBudget).toFixed(2)
      ),
      unitsOrderedDelta:
        optimizationResult.totalUnitsOrdered - previousPlan.optimizationResult.totalUnitsOrdered,
      itemsFundedDelta:
        optimizationResult.itemsPurchasedCount - previousPlan.optimizationResult.itemsPurchasedCount,
    };
  }

  const newSnapshot: PlanSnapshot = {
    version: nextVersion,
    planId,
    timestamp: options.timestamp || new Date().toISOString(),
    scenarioName: options.scenarioName || `Simulation v${nextVersion} ($${newBudget.toLocaleString()})`,
    budgetCap: Number(newBudget.toFixed(2)),
    optimizationResult,
    deltaFromPrevious,
  };

  const updatedHistory = [...existingHistory, newSnapshot];

  return {
    planId,
    currentVersion: nextVersion,
    activePlan: newSnapshot,
    history: updatedHistory,
  };
}


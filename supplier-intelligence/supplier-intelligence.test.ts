import test from "node:test";
import assert from "node:assert/strict";

import {
  compare_suppliers,
  optimize_budget,
  simulate_purchase_plan,
  explain_purchase_plan,
  runSupplierBudgetPipeline,
  DEMO_SUPPLIERS,
  DEMO_MEMBER2_INVENTORY_REPORT,
  type Member2InventoryReportItem,
  type InventoryProduct,
} from "./index.js";

// Test 1: compare_suppliers - input validation
test("compare_suppliers rejects invalid inputs", () => {
  assert.throws(() => compare_suppliers("", DEMO_SUPPLIERS), /SKU must be a non-empty string/);
  assert.throws(() => compare_suppliers("HP101", null as any), /Suppliers must be an array/);
  assert.throws(() => compare_suppliers("HP101", DEMO_SUPPLIERS, -5), /Quantity must be a positive number/);
});

// Test 2: compare_suppliers - matching & superlative identification
test("compare_suppliers correctly identifies best price, fastest delivery, and most reliable offers", () => {
  const comparison = compare_suppliers("HP101", DEMO_SUPPLIERS, 26, "BALANCED");

  assert.equal(comparison.sku, "HP101");
  assert.equal(comparison.offersCount, 4);
  assert.ok(comparison.bestPriceOffer);
  assert.ok(comparison.fastestDeliveryOffer);
  assert.ok(comparison.mostReliableOffer);

  // Shenzhen has lowest unit price ($13.10)
  assert.equal(comparison.bestPriceOffer?.supplierId, "sup-shenzhen");
  assert.equal(comparison.bestPriceOffer?.unitPrice, 13.1);

  // VoltCore has fastest delivery (2 days)
  assert.equal(comparison.fastestDeliveryOffer?.supplierId, "sup-voltcore");
  assert.equal(comparison.fastestDeliveryOffer?.leadTimeDays, 2);

  // Apex has highest reliability (99.2%)
  assert.equal(comparison.mostReliableOffer?.supplierId, "sup-apex");
  assert.equal(comparison.mostReliableOffer?.reliability, 99.2);
});

// Test 3: compare_suppliers - preferences
test("compare_suppliers respects user preferences (CHEAPEST vs FASTEST vs MOST_RELIABLE)", () => {
  const cheapest = compare_suppliers("HP101", DEMO_SUPPLIERS, 26, "CHEAPEST");
  assert.equal(cheapest.recommendedOffer?.supplierId, "sup-shenzhen");

  const fastest = compare_suppliers("HP101", DEMO_SUPPLIERS, 26, "FASTEST");
  assert.equal(fastest.recommendedOffer?.supplierId, "sup-voltcore");

  const reliable = compare_suppliers("HP101", DEMO_SUPPLIERS, 26, "MOST_RELIABLE");
  assert.equal(reliable.recommendedOffer?.supplierId, "sup-apex");
});

// Test 4: compare_suppliers - unknown SKU returns 0 offers gracefully
test("compare_suppliers returns 0 offers when SKU is not found", () => {
  const result = compare_suppliers("NON_EXISTENT_SKU_999", DEMO_SUPPLIERS, 10);
  assert.equal(result.offersCount, 0);
  assert.equal(result.allOffers.length, 0);
  assert.equal(result.recommendedOffer, undefined);
});

// Test 5: optimize_budget - input validation
test("optimize_budget validates input parameters", () => {
  assert.throws(() => optimize_budget(null as any, DEMO_SUPPLIERS, 1000), /inventoryReport must be an array/);
  assert.throws(() => optimize_budget(DEMO_MEMBER2_INVENTORY_REPORT, null as any, 1000), /suppliers must be an array/);
  assert.throws(() => optimize_budget(DEMO_MEMBER2_INVENTORY_REPORT, DEMO_SUPPLIERS, -100), /availableBudget must be a non-negative finite number/);
});

// Test 6: optimize_budget - prioritizes HIGH risk and fewer days until stockout
test("optimize_budget prioritizes HIGH risk and fewer days until stockout", () => {
  // In DEMO_MEMBER2_INVENTORY_REPORT:
  // KB201: HIGH risk, 3.75 days runway (recommends 10 units @ ~$22.50-$24.00 = ~$225-$240)
  // HP101: HIGH risk, 5.09 days runway (recommends 26 units @ ~$13.10-$16.00 = ~$340-$377)
  // CB301: LOW risk, 25.0 days runway (recommends 0 units)

  // With a small budget of $250:
  // KB201 (3.75 days) MUST be prioritized ahead of HP101 (5.09 days)!
  const result = optimize_budget(DEMO_MEMBER2_INVENTORY_REPORT, DEMO_SUPPLIERS, 250);

  assert.ok(result.allocatedBudget <= 250, "Allocated budget must NEVER exceed available budget");
  assert.equal(result.itemsPurchasedCount, 1);
  assert.equal(result.itemsPurchased[0].sku, "KB201");
  assert.equal(result.itemsPurchased[0].allocatedQuantity, 10);
  assert.ok(result.remainingBudget >= 0);

  // HP101 should be in unfunded due to budget exceeded or MOQ constraint
  const hpUnfunded = result.unfundedItems.find((u) => u.sku === "HP101");
  assert.ok(hpUnfunded);
  assert.ok(
    hpUnfunded?.reason === "BUDGET_EXCEEDED" || hpUnfunded?.reason === "MOQ_EXCEEDS_BUDGET",
    "Unfunded reason should indicate budget or MOQ constraint"
  );
});

// Test 7: optimize_budget - never exceeds budget ceiling under all circumstances
test("optimize_budget strictly adheres to budget constraints", () => {
  const testBudgets = [0, 50, 100, 240, 500, 1000, 5000];

  for (const b of testBudgets) {
    const res = optimize_budget(DEMO_MEMBER2_INVENTORY_REPORT, DEMO_SUPPLIERS, b);
    assert.ok(
      res.allocatedBudget <= b,
      `Allocated ($${res.allocatedBudget}) must not exceed budget ($${b})`
    );
    assert.equal(
      Number((res.allocatedBudget + res.remainingBudget).toFixed(2)),
      b,
      "Sum of allocated and remaining must equal available budget"
    );
  }
});

// Test 8: optimize_budget - partial fulfillment when budget cannot afford full order
test("optimize_budget performs partial restock when full quantity cannot be afforded", () => {
  // HP101 alone: 26 units @ $14.50 = $377.00 (VoltCore, MOQ 10)
  // If budget is $200:
  // Can afford 13 units @ $14.50 = $188.50 (which is >= MOQ 10)
  const reportHP101Only: Member2InventoryReportItem[] = [DEMO_MEMBER2_INVENTORY_REPORT[0]];

  const result = optimize_budget(reportHP101Only, DEMO_SUPPLIERS, 200, {
    allowPartialRestock: true,
    preference: "FASTEST", // VoltCore: $14.50, MOQ 10
  });

  assert.equal(result.itemsPurchasedCount, 1);
  const purchased = result.itemsPurchased[0];
  assert.equal(purchased.sku, "HP101");
  assert.equal(purchased.isPartial, true);
  assert.equal(purchased.allocatedQuantity, 13);
  assert.equal(purchased.lineTotal, 188.5);
  assert.ok(result.allocatedBudget <= 200);
  assert.equal(result.remainingBudget, 11.5);
});

// Test 9: simulate_purchase_plan - versions and calculates deltas
test("simulate_purchase_plan versioning and preserving previous snapshots", () => {
  // Step 1: Initial Plan with $300 budget
  const sim1 = simulate_purchase_plan(
    null,
    300,
    DEMO_MEMBER2_INVENTORY_REPORT,
    DEMO_SUPPLIERS,
    { scenarioName: "Initial Conservative Cap" }
  );

  assert.equal(sim1.currentVersion, 1);
  assert.equal(sim1.history.length, 1);
  assert.equal(sim1.activePlan.budgetCap, 300);
  assert.equal(sim1.activePlan.version, 1);
  assert.equal(sim1.activePlan.deltaFromPrevious, undefined);

  // Step 2: Recalculate with $700 budget
  const sim2 = simulate_purchase_plan(
    sim1,
    700,
    DEMO_MEMBER2_INVENTORY_REPORT,
    DEMO_SUPPLIERS,
    { scenarioName: "Expanded Restock Cap" }
  );

  assert.equal(sim2.currentVersion, 2);
  assert.equal(sim2.history.length, 2);
  assert.equal(sim2.activePlan.budgetCap, 700);
  assert.equal(sim2.activePlan.version, 2);

  // Verify previous version 1 was preserved immutably
  assert.equal(sim2.history[0].version, 1);
  assert.equal(sim2.history[0].budgetCap, 300);

  // Check delta calculation
  assert.ok(sim2.activePlan.deltaFromPrevious);
  assert.equal(sim2.activePlan.deltaFromPrevious?.budgetDelta, 400); // 700 - 300
  assert.ok((sim2.activePlan.deltaFromPrevious?.unitsOrderedDelta ?? 0) > 0);
});

// Test 10: simulate_purchase_plan - multi-step simulation preserves all versions without overwriting
test("simulate_purchase_plan preserves entire version history without mutating earlier plans", () => {
  // v1: $250 -> v2: $600 -> v3: $400 -> v4: $1000
  const sim1 = simulate_purchase_plan(null, 250, DEMO_MEMBER2_INVENTORY_REPORT, DEMO_SUPPLIERS);
  const sim2 = simulate_purchase_plan(sim1, 600, DEMO_MEMBER2_INVENTORY_REPORT, DEMO_SUPPLIERS);
  const sim3 = simulate_purchase_plan(sim2, 400, DEMO_MEMBER2_INVENTORY_REPORT, DEMO_SUPPLIERS);
  const sim4 = simulate_purchase_plan(sim3, 1000, DEMO_MEMBER2_INVENTORY_REPORT, DEMO_SUPPLIERS);

  assert.equal(sim4.currentVersion, 4);
  assert.equal(sim4.history.length, 4);

  // Ensure each version in history is intact and unchanged
  assert.equal(sim4.history[0].version, 1);
  assert.equal(sim4.history[0].budgetCap, 250);

  assert.equal(sim4.history[1].version, 2);
  assert.equal(sim4.history[1].budgetCap, 600);

  assert.equal(sim4.history[2].version, 3);
  assert.equal(sim4.history[2].budgetCap, 400);

  assert.equal(sim4.history[3].version, 4);
  assert.equal(sim4.history[3].budgetCap, 1000);
});

// Test 11: explain_purchase_plan - creates structured manager explanations
test("explain_purchase_plan produces auditable manager explanations", () => {
  const result = optimize_budget(DEMO_MEMBER2_INVENTORY_REPORT, DEMO_SUPPLIERS, 700);
  const explanation = explain_purchase_plan(result);

  assert.equal(explanation.summary.budgetStatus, "STRICTLY_COMPLIANT");
  assert.equal(explanation.summary.totalSpend, result.allocatedBudget);
  assert.equal(explanation.summary.budgetCap, result.availableBudget);
  assert.ok(explanation.summary.overview.includes("Optimized plan allocates"));
  assert.ok(explanation.lineExplanations.length > 0);
  assert.ok(explanation.managerCheckpoints.length >= 3);

  // Verify per-line justification
  const hpExpl = explanation.lineExplanations.find((l) => l.sku === "HP101");
  assert.ok(hpExpl);
  assert.ok(hpExpl?.supplierRationale.includes("Procured from"));
  assert.ok(hpExpl?.riskContext.includes("HIGH"));
});

// Test 12: End-to-End integration test with Member 2's direct report output
test("End-to-End pipeline: Member 2 report -> compare_suppliers -> optimize_budget -> explain_purchase_plan", () => {
  // Member 2's report structure with 3 items
  const budget = 1000;
  const plan = optimize_budget(DEMO_MEMBER2_INVENTORY_REPORT, DEMO_SUPPLIERS, budget);

  assert.ok(plan.allocatedBudget <= budget);
  assert.ok(plan.itemsPurchasedCount >= 2); // Both HP101 and KB201 funded under $1,000

  const explanation = explain_purchase_plan(plan);
  assert.equal(explanation.summary.highRiskItemsResolved, 2);
  assert.equal(explanation.summary.highRiskItemsRemainingUnfunded, 0);
  assert.equal(explanation.summary.budgetStatus, "STRICTLY_COMPLIANT");
});

// Test 13: Live Integration with Member 2's module function `generateInventoryReport`
test("runSupplierBudgetPipeline directly executes Member 2's generateInventoryReport and optimizes budget", () => {
  const rawProducts: InventoryProduct[] = [
    {
      sku: "HP101",
      name: "Wireless Headphones",
      currentStock: 40,
      salesHistory: [3, 4, 3, 5, 4, 3, 4, 6, 7, 8, 7, 9, 10, 8],
      leadTimeDays: 7,
      safetyStock: 10,
    },
    {
      sku: "KB201",
      name: "Mechanical Keyboard",
      currentStock: 15,
      salesHistory: [2, 3, 2, 4, 3, 2, 3, 3, 4, 3, 5, 4, 4, 5],
      leadTimeDays: 5,
      safetyStock: 5,
    },
    {
      sku: "CB301",
      name: "USB-C Cable",
      currentStock: 100,
      salesHistory: [4, 3, 5, 4, 3, 4, 5, 4, 5, 3, 4, 3, 4, 5],
      leadTimeDays: 3,
      safetyStock: 15,
    },
  ];

  const pipeline = runSupplierBudgetPipeline(rawProducts, DEMO_SUPPLIERS, 800);

  // Verify Member 2's report output was returned and accurate
  assert.equal(pipeline.inventoryReport.length, 3);
  assert.equal(pipeline.inventoryReport[0].sku, "HP101");
  assert.equal(pipeline.inventoryReport[0].inventoryAnalysis.riskLevel, "HIGH");

  // Verify Member 4's budget optimizer output
  assert.ok(pipeline.optimizedPlan.allocatedBudget <= 800);
  assert.equal(pipeline.optimizedPlan.itemsPurchasedCount, 2);

  // Verify Member 4's manager explanation output
  assert.equal(pipeline.explanation.summary.budgetStatus, "STRICTLY_COMPLIANT");
  assert.equal(pipeline.explanation.summary.highRiskItemsResolved, 2);
});

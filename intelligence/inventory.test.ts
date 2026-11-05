
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  analyzeDemand,
  exponentialMovingAverage
} from "./forecast.js";

import { predictStockout } from "./stockout.js";
import { generateInventoryReport } from "./inventory-report.js";

const risingSales = [
  3, 4, 3, 5, 4, 3, 4,
  6, 7, 8, 7, 9, 10, 8
];

// TEST 1: Detect increasing demand
test("Detects increasing demand", () => {
  const forecast = analyzeDemand(risingSales);

  assert.equal(forecast.demandTrend, "INCREASING");
  assert.equal(forecast.forecast7Days, 55);
});

// TEST 2: EMA produces a valid prediction
test("EMA returns a non-negative forecast", () => {
  const forecast = exponentialMovingAverage(risingSales);

  assert.ok(Number.isFinite(forecast));
  assert.ok(forecast >= 0);
});

// TEST 3: Detect stockout risk
test("Detects high stockout risk", () => {
  const result = predictStockout(
    "HP101", 40, risingSales, 7, 10
  );

  assert.equal(result.riskLevel, "HIGH");
  assert.equal(result.reorderPoint, 66);
});

// TEST 4: Detect zero-stock situation
test("Detects an out-of-stock product", () => {
  const result = predictStockout(
    "HP101", 0, risingSales, 7, 10
  );

  assert.equal(result.riskLevel, "HIGH");
  assert.equal(result.daysUntilStockout, 0);
});

// TEST 5: Detect sufficient inventory
test("Detects low stockout risk", () => {
  const result = predictStockout(
    "HP101", 200, risingSales, 7, 10
  );

  assert.equal(result.riskLevel, "LOW");
  assert.equal(result.recommendedOrderQuantity, 0);
});

// TEST 6: Reject invalid sales data
test("Rejects negative historical sales", () => {
  assert.throws(() => {
    analyzeDemand([
      ...risingSales.slice(0, 13), -5
    ]);
  });
});

// TEST 7: Multi-product report
test("Generates a report for multiple products", () => {
  const report = generateInventoryReport([
    {
      sku: "HP101",
      name: "Headphones",
      currentStock: 40,
      salesHistory: risingSales,
      leadTimeDays: 7,
      safetyStock: 10
    },
    {
      sku: "KB201",
      name: "Keyboard",
      currentStock: 100,
      salesHistory: risingSales,
      leadTimeDays: 5,
      safetyStock: 5
    }
  ]);

  assert.equal(report.length, 2);
  assert.equal(report[0].sku, "HP101");
  assert.equal(report[1].sku, "KB201");
});

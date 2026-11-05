
import { averageDailyDemand } from "./forecast.js";

export interface EvaluationResult {
  testDays: number;
  mae: number;
  actual: number[];
  predicted: number[];
}

export function evaluateForecast(
  salesHistory: number[],
  trainingDays = 7
): EvaluationResult {

  if (
    !Number.isInteger(trainingDays) ||
    trainingDays < 1 ||
    salesHistory.length <= trainingDays ||
    salesHistory.some(
      v => !Number.isFinite(v) || v < 0
    )
  ) {
    throw new Error("Invalid evaluation data");
  }

  const actual: number[] = [];
  const predicted: number[] = [];

  // Walk forward through historical sales.
  for (
    let i = trainingDays;
    i < salesHistory.length;
    i++
  ) {
    const previousSales = salesHistory.slice(
      i - trainingDays, i
    );

    const prediction = averageDailyDemand(
      previousSales, trainingDays
    );

    predicted.push(prediction);
    actual.push(salesHistory[i]);
  }

  const totalError = actual.reduce(
    (sum, value, i) =>
      sum + Math.abs(value - predicted[i]), 0
  );

  return {
    testDays: actual.length,
    mae: Number(
      (totalError / actual.length).toFixed(2)
    ),
    actual,
    predicted: predicted.map(
      value => Number(value.toFixed(2))
    )
  };
}

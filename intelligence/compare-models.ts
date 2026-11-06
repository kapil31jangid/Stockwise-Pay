
import {
  averageDailyDemand,
  exponentialMovingAverage
} from "./forecast.js";

const salesHistory = [
  3, 4, 3, 5, 4, 3, 4,
  6, 7, 8, 7, 9, 10, 8
];

const actual: number[] = [];
const smaPredictions: number[] = [];
const emaPredictions: number[] = [];

// Evaluate days 8 through 14.
for (let i = 7; i < salesHistory.length; i++) {
  const past = salesHistory.slice(0, i);

  // SMA uses the last 7 observations.
  const sma = averageDailyDemand(past.slice(-7));

  // EMA uses all observations available before day i.
  const ema = exponentialMovingAverage(past);

  actual.push(salesHistory[i]);
  smaPredictions.push(sma);
  emaPredictions.push(ema);
}

function calculateMAE(
  predicted: number[],
  actual: number[]
): number {
  const total = predicted.reduce(
    (sum, value, i) =>
      sum + Math.abs(value - actual[i]), 0
  );

  return total / actual.length;
}

const smaMAE = calculateMAE(smaPredictions, actual);
const emaMAE = calculateMAE(emaPredictions, actual);

console.log("FORECAST MODEL COMPARISON");
console.log("SMA MAE:", smaMAE.toFixed(2));
console.log("EMA MAE:", emaMAE.toFixed(2));

console.log(
  "\nBetter on this sample:",
  emaMAE < smaMAE
    ? "EMA"
    : smaMAE < emaMAE
      ? "SMA"
      : "TIE"
);


import {
  averageDailyDemand,
  exponentialMovingAverage
} from "./forecast.js";

const salesHistory = [3, 4, 5, 6, 8, 10, 12];

const sma = averageDailyDemand(salesHistory);
const ema = exponentialMovingAverage(salesHistory);

console.log("SMA forecast:", sma.toFixed(2));
console.log("EMA forecast:", ema.toFixed(2));

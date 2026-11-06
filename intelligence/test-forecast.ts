
import {
  averageDailyDemand,
  forecastDemand
} from "./forecast.js";

// Sales over the previous 7 days
const salesHistory = [2, 3, 4, 6, 8, 10, 12];

// Calculate average sales per day
const dailyAverage = averageDailyDemand(salesHistory);

// Predict sales for the next 7 days
const predictedSales = forecastDemand(salesHistory, 7);

console.log("Average daily sales:", dailyAverage);
console.log("Predicted demand for 7 days:", predictedSales);
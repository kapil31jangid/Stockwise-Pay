
import { analyzeDemand } from "./forecast.js";

const salesHistory = [
  3, 4, 3, 5, 4, 3, 4,
  6, 7, 8, 7, 9, 10, 8
];

const forecast = analyzeDemand(salesHistory);

console.log("DEMAND FORECAST:");
console.log(forecast);

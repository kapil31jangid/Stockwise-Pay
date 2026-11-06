
import { predictStockout } from "./stockout.js";

const salesHistory = [
  3, 4, 3, 5, 4, 3, 4,
  6, 7, 8, 7, 9, 10, 8
];

const result = predictStockout(
  "HP101",       // SKU
  100,            // Current stock
  salesHistory,  // Previous 14 days of sales
  7,             // Supplier delivery time
  10             // Safety stock
);

console.log("STOCKOUT ANALYSIS:");
console.log(result);

import { writeFileSync } from "node:fs";
import {
  generateInventoryReport,
  type InventoryProduct
} from "./inventory-report.js";

const products: InventoryProduct[] = [
  {
    sku: "HP101",
    name: "Wireless Headphones",
    currentStock: 40,
    salesHistory: [
      3, 4, 3, 5, 4, 3, 4,
      6, 7, 8, 7, 9, 10, 8
    ],
    leadTimeDays: 7,
    safetyStock: 10
  },
  {
    sku: "KB201",
    name: "Mechanical Keyboard",
    currentStock: 15,
    salesHistory: [
      2, 3, 2, 4, 3, 2, 3,
      3, 4, 3, 5, 4, 4, 5
    ],
    leadTimeDays: 5,
    safetyStock: 5
  },
  {
    sku: "CB301",
    name: "USB-C Cable",
    currentStock: 100,
    salesHistory: [
      4, 3, 5, 4, 3, 4, 5,
      4, 5, 3, 4, 3, 4, 5
    ],
    leadTimeDays: 3,
    safetyStock: 15
  }
];

const report = generateInventoryReport(products);

console.log("\nINVENTORY INTELLIGENCE REPORT");

console.log(JSON.stringify(report, null, 2));
writeFileSync(
  "inventory-report.json",
  JSON.stringify(report, null, 2)
);

console.log("Inventory report saved!");
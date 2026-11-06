
export {
  analyzeDemand,
  averageDailyDemand,
  forecastDemand,
  exponentialMovingAverage
} from "./forecast.js";

export {
  predictStockout
} from "./stockout.js";

export {
  generateInventoryReport
} from "./inventory-report.js";

export type {
  InventoryProduct
} from "./inventory-report.js";

export type {
  DemandForecast
} from "./forecast.js";

export type {
  StockoutResult
} from "./stockout.js";

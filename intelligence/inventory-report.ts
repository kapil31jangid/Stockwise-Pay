
import {
  analyzeDemand,
  exponentialMovingAverage
} from "./forecast.js";

import { predictStockout } from "./stockout.js";

export interface InventoryProduct {
  sku: string;
  name: string;
  currentStock: number;
  salesHistory: number[];
  leadTimeDays: number;
  safetyStock: number;
}

export function generateInventoryReport(
  products: InventoryProduct[]
) {
  return products.map(product => {

    // Step 1: Analyze sales and demand trends
    const demand = analyzeDemand(
      product.salesHistory
    );

    // Step 2: Calculate EMA forecast
    const ema = exponentialMovingAverage(
      product.salesHistory
    );

    // Step 3: Calculate stockout risk using
    // the existing SMA-based analysis
    const stockout = predictStockout(
      product.sku,
      product.currentStock,
      product.salesHistory,
      product.leadTimeDays,
      product.safetyStock
    );

    // Step 4: Combine results
    return {
      sku: product.sku,
      productName: product.name,

      currentStock: product.currentStock,

      forecasting: {
        averageDailyDemand:
          demand.averageDailyDemand,

        smaForecast7Days:
          demand.forecast7Days,

        emaForecast7Days:
          Math.ceil(ema * 7),

        forecast30Days:
          demand.forecast30Days,

        demandTrend:
          demand.demandTrend
      },

      inventoryAnalysis: {
        daysUntilStockout:
          stockout.daysUntilStockout,

        reorderPoint:
          stockout.reorderPoint,

        recommendedQuantity:
          stockout.recommendedOrderQuantity,

        riskLevel:
          stockout.riskLevel
      }
    };
  });
}

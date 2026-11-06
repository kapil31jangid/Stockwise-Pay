
import { analyzeDemand } from "./forecast.js";

export interface StockoutResult {
  sku: string;
  currentStock: number;
  averageDailyDemand: number;
  daysUntilStockout: number | null;
  leadTimeDays: number;
  reorderPoint: number;
  recommendedOrderQuantity: number;
  riskLevel: "HIGH" | "MEDIUM" | "LOW" | "NO_DEMAND";
}

export function predictStockout(
  sku: string,
  currentStock: number,
  salesHistory: number[],
  leadTimeDays: number,
  safetyStock: number
): StockoutResult {

  if (
    !Number.isInteger(currentStock) ||
    currentStock < 0 ||
    !Number.isFinite(leadTimeDays) ||
    leadTimeDays < 0 ||
    !Number.isInteger(safetyStock) ||
    safetyStock < 0
  ) {
    throw new Error("Invalid inventory inputs");
  }

  const forecast = analyzeDemand(salesHistory);
  const dailyDemand = forecast.averageDailyDemand;

  const daysUntilStockout =
    dailyDemand > 0
      ? Number((currentStock / dailyDemand).toFixed(2))
      : null;

  const leadTimeDemand = dailyDemand * leadTimeDays;

  const reorderPoint = Math.ceil(
    leadTimeDemand + safetyStock
  );

  const recommendedOrderQuantity = Math.max(
    0,
    reorderPoint - currentStock
  );

  let riskLevel: StockoutResult["riskLevel"];

  if (currentStock === 0 && dailyDemand > 0) {
    riskLevel = "HIGH";
  } else if (dailyDemand === 0) {
    riskLevel = "NO_DEMAND";
  } else if (currentStock <= leadTimeDemand) {
    riskLevel = "HIGH";
  } else if (currentStock <= reorderPoint) {
    riskLevel = "MEDIUM";
  } else {
    riskLevel = "LOW";
  }

  return {
    sku,
    currentStock,
    averageDailyDemand: dailyDemand,
    daysUntilStockout,
    leadTimeDays,
    reorderPoint,
    recommendedOrderQuantity,
    riskLevel
  };
}

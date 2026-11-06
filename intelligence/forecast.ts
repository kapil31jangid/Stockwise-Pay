export function averageDailyDemand(history: number[], window = 7): number {
  if (!history.length || history.some(v => !Number.isFinite(v) || v < 0)) {
    throw new Error('Sales history must contain nonnegative daily sales');
  }
  const recent = history.slice(-window);
  return recent.reduce((sum, value) => sum + value, 0) / recent.length;
}
export function forecastDemand(history: number[], days: number): number {
  if (!Number.isInteger(days) || days < 1) throw new Error('days must be a positive integer');
  return Math.ceil(averageDailyDemand(history) * days);
}

export interface DemandForecast {
  averageDailyDemand: number;
  forecast7Days: number;
  forecast30Days: number;
  demandTrend: "INCREASING" | "DECREASING" | "STABLE";
}

export function analyzeDemand(
  salesHistory: number[]
): DemandForecast {

  if (
    salesHistory.length < 14 ||
    salesHistory.some(
      value => !Number.isFinite(value) || value < 0
    )
  ) {
    throw new Error(
      "At least 14 valid daily sales records are required"
    );
  }

  const recent7 = salesHistory.slice(-7);
  const previous7 = salesHistory.slice(-14, -7);

  const average = (data: number[]) =>
    data.reduce((sum, value) => sum + value, 0)
    / data.length;

  const recentAverage = average(recent7);
  const previousAverage = average(previous7);

  let demandTrend: DemandForecast["demandTrend"] = "STABLE";

  if (previousAverage === 0) {
    if (recentAverage > 0) demandTrend = "INCREASING";
  } else {
    const change =
      (recentAverage - previousAverage) / previousAverage;

    if (change > 0.10) demandTrend = "INCREASING";
    else if (change < -0.10) demandTrend = "DECREASING";
  }

  return {
    averageDailyDemand: Number(recentAverage.toFixed(2)),
    forecast7Days: Math.ceil(recentAverage * 7),
    forecast30Days: Math.ceil(recentAverage * 30),
    demandTrend
  };
}

export function exponentialMovingAverage(
  salesHistory: number[],
  alpha = 0.4
): number {
  if (
    salesHistory.length === 0 ||
    salesHistory.some(
      value => !Number.isFinite(value) || value < 0
    )
  ) {
    throw new Error("Invalid sales history");
  }

  if (alpha <= 0 || alpha > 1) {
    throw new Error("Alpha must be between 0 and 1");
  }

  // Initialize using the first observation.
  let ema = salesHistory[0];

  for (let i = 1; i < salesHistory.length; i++) {
    ema =
      alpha * salesHistory[i] +
      (1 - alpha) * ema;
  }

  return Number(ema.toFixed(2));
}

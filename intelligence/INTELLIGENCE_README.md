# StockWise Pay — Inventory Intelligence Module

## Overview

This module provides inventory analysis and demand forecasting for StockWise Pay.

It uses statistical forecasting and deterministic inventory calculations. It does not require an LLM API or a separate backend server.

## Features

- 7-day and 30-day demand forecasting
- Simple Moving Average (SMA)
- Exponential Moving Average (EMA)
- Demand trend detection
- Stockout risk prediction
- Reorder point calculation
- Preliminary replenishment quantities
- Forecast evaluation using Mean Absolute Error (MAE)
- Multi-product inventory reports

## Input Data

Each product requires:

| Field | Description |
|---|---|
| `sku` | Unique product identifier |
| `name` | Product name |
| `currentStock` | Available stock quantity |
| `salesHistory` | Daily units sold, ordered from oldest to newest |
| `leadTimeDays` | Expected supplier delivery time |
| `safetyStock` | Minimum safety stock quantity |

At least 14 daily sales observations are required for the demand trend analysis.

## Main Function

`generateInventoryReport(products)`

Accepts an array of product records and returns an array of inventory intelligence results.

## Output

Each product result includes:

- Product SKU and name
- Current stock
- Average daily demand
- SMA and EMA demand forecasts
- Demand trend
- Estimated days until stockout
- Reorder point
- Preliminary reorder quantity
- Inventory risk level

## Running the Module

Install dependencies:

`npm install`

Run the demonstration:

`npx tsx test-inventory-report.ts`

Run automated tests:

`npx tsx --test inventory.test.ts`

## Integration

The backend can import `generateInventoryReport()` from `index.ts` and provide current product records.

The returned results can also be supplied to the separate AI procurement agent for reasoning and explanations.

## Limitations

- The forecasting methods are statistical baselines, not trained machine-learning models.
- Forecasts assume recent sales reasonably represent future demand.
- Current calculations do not model promotions, holidays, missing sales days, or incoming inventory.
- EMA is reported as an alternative forecast; it is not automatically selected for stockout calculations.
- Reorder quantities are preliminary and must be checked against supplier minimum quantities, budgets, and existing purchase orders.
- Sample data is illustrative and should not be treated as real retail performance data.

/**
 * DEMO DATA ONLY
 * Clearly labeled mock supplier catalogs and sample Member 2 inventory reports.
 * For testing and demonstration purposes. In production, this data is fetched from live DB/APIs.
 */

import { SupplierData, Member2InventoryReportItem } from "./types.js";

/**
 * DEMO SUPPLIERS: Realistic distributors with competitive offers for electronics SKUs
 */
export const DEMO_SUPPLIERS: SupplierData[] = [
  {
    id: "sup-voltcore",
    name: "VoltCore Electronics Distro",
    reliability: 98.6,
    rating: 4.8,
    paymentTerms: "PayPal Instant / Net 30",
    location: "Chicago, IL (Midwest Depot)",
    contactEmail: "dispatch@voltcore-distro.com",
    offers: [
      {
        sku: "HP101",
        unitPrice: 14.5,
        leadTimeDays: 2,
        moq: 10,
        bulkDiscountNote: "5% off > 50 units",
      },
      {
        sku: "KB201",
        unitPrice: 24.0,
        leadTimeDays: 3,
        moq: 5,
        bulkDiscountNote: "4% off > 20 units",
      },
      {
        sku: "CB301",
        unitPrice: 3.2,
        leadTimeDays: 2,
        moq: 20,
      },
      {
        sku: "EL-CHG-01",
        unitPrice: 14.5,
        leadTimeDays: 2,
        moq: 20,
      },
    ],
  },
  {
    id: "sup-apex",
    name: "Apex Wholesale Direct",
    reliability: 99.2,
    rating: 4.9,
    paymentTerms: "PayPal Sandbox / Net 30",
    location: "Dallas, TX (Domestic Hub)",
    contactEmail: "orders@apexwholesale.com",
    offers: [
      {
        sku: "HP101",
        unitPrice: 15.2,
        leadTimeDays: 3,
        moq: 15,
        bulkDiscountNote: "3% off > 30 units",
      },
      {
        sku: "KB201",
        unitPrice: 22.5,
        leadTimeDays: 4,
        moq: 10,
        bulkDiscountNote: "5% off > 25 units",
      },
      {
        sku: "CB301",
        unitPrice: 2.8,
        leadTimeDays: 3,
        moq: 50,
        bulkDiscountNote: "8% off > 100 units",
      },
      {
        sku: "EL-CAB-12",
        unitPrice: 3.8,
        leadTimeDays: 2,
        moq: 50,
      },
    ],
  },
  {
    id: "sup-shenzhen",
    name: "Shenzhen Precision Micro",
    reliability: 96.8,
    rating: 4.7,
    paymentTerms: "PayPal Escrow / Net 15",
    location: "Shenzhen, CN / Los Angeles CFS",
    contactEmail: "sales@precisionmicro.sz",
    offers: [
      {
        sku: "HP101",
        unitPrice: 13.1,
        leadTimeDays: 9,
        moq: 30,
        bulkDiscountNote: "10% off > 60 units",
      },
      {
        sku: "CB301",
        unitPrice: 2.1,
        leadTimeDays: 8,
        moq: 100,
        bulkDiscountNote: "15% off > 200 units",
      },
    ],
  },
  {
    id: "sup-nexus",
    name: "Nexus Acoustic Labs",
    reliability: 99.0,
    rating: 4.9,
    paymentTerms: "PayPal Verified / Net 30",
    location: "Seattle, WA",
    contactEmail: "partner@nexusacoustic.io",
    offers: [
      {
        sku: "HP101",
        unitPrice: 16.0,
        leadTimeDays: 4,
        moq: 10,
        bulkDiscountNote: "Premium Acoustic Certification",
      },
      {
        sku: "EL-AUD-02",
        unitPrice: 28.0,
        leadTimeDays: 4,
        moq: 15,
      },
    ],
  },
];

/**
 * DEMO MEMBER 2 INVENTORY REPORT: Actual output generated from Member 2's module
 */
export const DEMO_MEMBER2_INVENTORY_REPORT: Member2InventoryReportItem[] = [
  {
    sku: "HP101",
    productName: "Wireless Headphones",
    currentStock: 40,
    forecasting: {
      averageDailyDemand: 7.86,
      smaForecast7Days: 55,
      emaForecast7Days: 59,
      forecast30Days: 236,
      demandTrend: "INCREASING",
    },
    inventoryAnalysis: {
      daysUntilStockout: 5.09,
      reorderPoint: 66,
      recommendedQuantity: 26,
      riskLevel: "HIGH",
    },
  },
  {
    sku: "KB201",
    productName: "Mechanical Keyboard",
    currentStock: 15,
    forecasting: {
      averageDailyDemand: 4.0,
      smaForecast7Days: 28,
      emaForecast7Days: 31,
      forecast30Days: 120,
      demandTrend: "INCREASING",
    },
    inventoryAnalysis: {
      daysUntilStockout: 3.75,
      reorderPoint: 25,
      recommendedQuantity: 10,
      riskLevel: "HIGH",
    },
  },
  {
    sku: "CB301",
    productName: "USB-C Cable",
    currentStock: 100,
    forecasting: {
      averageDailyDemand: 4.0,
      smaForecast7Days: 28,
      emaForecast7Days: 30,
      forecast30Days: 120,
      demandTrend: "STABLE",
    },
    inventoryAnalysis: {
      daysUntilStockout: 25.0,
      reorderPoint: 27,
      recommendedQuantity: 0,
      riskLevel: "LOW",
    },
  },
];


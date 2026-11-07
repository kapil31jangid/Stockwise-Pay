import { generateInventoryReport, forecastDemand, InventoryProduct } from '../../../intelligence/index.js';
import {
  compare_suppliers,
  optimize_budget,
  simulate_purchase_plan,
  explain_purchase_plan,
  SupplierData,
  SupplierPreference,
  BudgetOptimizationResult,
  Member2InventoryReportItem
} from '../../../supplier-intelligence/index.js';
import { db } from '../db/index.js';

export class ProcurementAgentService {
  /**
   * Helper: Build SupplierData structures from database products & supplier offers
   */
  async buildSupplierCatalog(): Promise<SupplierData[]> {
    const suppliers = await db.getSuppliers();
    const offers = await db.getSupplierOffers();

    return suppliers.map(s => {
      const supplierOffers = offers
        .filter(o => o.supplierId === s.id)
        .map(o => ({
          sku: o.sku,
          unitPrice: o.unitPrice,
          shippingCost: o.shippingCost,
          leadTimeDays: o.leadTimeDays,
          moq: o.moq,
          bulkDiscountNote: o.bulkDiscountNote
        }));

      return {
        id: s.id,
        name: s.name,
        reliability: s.reliabilityScore,
        paymentTerms: s.paymentTerms,
        location: s.location,
        contactEmail: s.contactEmail,
        offers: supplierOffers
      };
    });
  }

  /**
   * Helper: Build InventoryProduct[] from database products
   */
  async buildInventoryProducts(): Promise<InventoryProduct[]> {
    const products = await db.getProducts();
    return products.map(p => {
      let history = Array.isArray(p.salesHistory) && p.salesHistory.length > 0 ? [...p.salesHistory] : [2, 3, 2, 4, 3, 2, 5, 3, 4, 2, 3, 4, 3, 4];
      while (history.length < 14) {
        history = [...history, ...history];
      }
      history = history.slice(0, 30).map(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 2);
      return {
        sku: p.sku,
        name: p.name,
        currentStock: Number(p.currentStock || 0),
        salesHistory: history,
        leadTimeDays: 4, // default modeled lead time
        safetyStock: Number(p.safetyStock || 10)
      };
    });
  }

  /**
   * Tool 1: analyze_inventory
   */
  async toolAnalyzeInventory(): Promise<Member2InventoryReportItem[]> {
    const products = await this.buildInventoryProducts();
    return generateInventoryReport(products) as Member2InventoryReportItem[];
  }

  /**
   * Tool 2: forecast_demand
   */
  toolForecastDemand(salesHistory: number[], leadTimeDays: number = 7) {
    return forecastDemand(salesHistory, leadTimeDays);
  }

  /**
   * Tool 3: compare_suppliers
   */
  async toolCompareSuppliers(sku: string, quantity: number = 20, preference: SupplierPreference = 'BALANCED') {
    const catalog = await this.buildSupplierCatalog();
    return compare_suppliers(sku, catalog, quantity, preference);
  }

  /**
   * Tool 4: optimize_budget
   */
  async toolOptimizeBudget(budgetAmount?: number, preference: SupplierPreference = 'BALANCED') {
    const budgetConfig = await db.getBudget();
    const targetBudget = budgetAmount !== undefined ? budgetAmount : (budgetConfig.monthlyBudget - budgetConfig.spentAmount);
    
    const inventoryReport = await this.toolAnalyzeInventory();
    const supplierCatalog = await this.buildSupplierCatalog();

    return optimize_budget(
      inventoryReport,
      supplierCatalog,
      targetBudget,
      {
        preference,
        allowPartialRestock: true,
        minBudgetBuffer: 0
      }
    );
  }

  /**
   * Tool 5: simulate_purchase_plan
   */
  async toolSimulatePurchasePlan(newBudget: number, preference: SupplierPreference = 'BALANCED') {
    const inventoryReport = await this.toolAnalyzeInventory();
    const supplierCatalog = await this.buildSupplierCatalog();

    // Baseline plan
    const baseline = optimize_budget(
      inventoryReport,
      supplierCatalog,
      2000.00,
      { preference }
    );

    const simulationHistory = simulate_purchase_plan(
      null,
      newBudget,
      inventoryReport,
      supplierCatalog,
      { preference, scenarioName: `Budget Simulation $${newBudget}` }
    );

    return {
      baseline,
      simulationHistory
    };
  }

  /**
   * Tool 6: explain_purchase_plan
   */
  toolExplainPurchasePlan(optimizationResult: BudgetOptimizationResult) {
    return explain_purchase_plan(optimizationResult);
  }

  /**
   * Full AI Agent Orchestrated Procurement Run
   */
  async runFullAnalysis(userPrompt: string = 'Run standard procurement optimization', targetBudget?: number, preference: SupplierPreference = 'BALANCED') {
    const startTime = Date.now();
    const toolsCalled: string[] = [];

    // Step 1: Run analyze_inventory
    toolsCalled.push('analyze_inventory');
    const inventoryReport = await this.toolAnalyzeInventory();

    // Step 2: Run optimize_budget
    toolsCalled.push('optimize_budget');
    const catalog = await this.buildSupplierCatalog();
    const budgetConfig = await db.getBudget();
    const budgetToUse = targetBudget !== undefined ? targetBudget : Math.max(500, budgetConfig.monthlyBudget - budgetConfig.spentAmount);

    const optimizedPlan = optimize_budget(
      inventoryReport,
      catalog,
      budgetToUse,
      { preference }
    );

    // Step 3: Run explain_purchase_plan
    toolsCalled.push('explain_purchase_plan');
    const explanation = explain_purchase_plan(optimizedPlan);

    const duration = Date.now() - startTime;
    const runId = `RUN-${Date.now()}`;

    const result = {
      runId,
      userPrompt,
      inventorySummary: {
        totalProducts: inventoryReport.length,
        criticalCount: inventoryReport.filter(i => i.inventoryAnalysis.riskLevel === 'HIGH').length,
        mediumRiskCount: inventoryReport.filter(i => i.inventoryAnalysis.riskLevel === 'MEDIUM').length
      },
      inventoryReport,
      optimizedPlan,
      explanation,
      executionStats: {
        toolsCalled,
        durationMs: duration
      }
    };

    // Save run in DB
    await db.saveAgentRun({
      id: runId,
      requestType: 'PROCUREMENT_ANALYSIS',
      userPrompt,
      toolsCalled,
      results: result,
      executionStatus: 'success',
      executionDurationMs: duration,
      createdAt: new Date().toISOString()
    });

    return result;
  }
}

export const agentService = new ProcurementAgentService();

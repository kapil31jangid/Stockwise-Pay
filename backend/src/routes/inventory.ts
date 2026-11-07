import { Router, Request, Response } from 'express';
import multer from 'multer';
import { db } from '../db/index.js';
import { agentService } from '../services/agent.js';
import { Member2InventoryReportItem } from '../../../supplier-intelligence/index.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * GET /api/inventory
 * Retrieve inventory records and stockout-risk indicators
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const products = await db.getProducts();
    const report = await agentService.toolAnalyzeInventory();

    const suppliers = await db.getSuppliers();

    // Augment products with risk indicators and frontend-expected fields
    const items = products.map((p, idx) => {
      const pSku = (p.sku || '').toUpperCase();
      const reportItem = report.find((r: Member2InventoryReportItem) => (r.sku || '').toUpperCase() === pSku);
      const supplier = suppliers.find(s => s.id === p.preferredVendorId) || suppliers[0];
      const reorderPoint = reportItem ? reportItem.inventoryAnalysis.reorderPoint : (p.safetyStock || 15);
      const retailPrice = Number(p.sellingPrice || (p.unitCost ? p.unitCost * 2 : 25));
      const unitCost = Number(p.unitCost || 10);
      const avgDaily = reportItem ? reportItem.forecasting.averageDailyDemand : 2;
      const salesVelocityPerWeek = Math.max(1, Math.round(avgDaily * 7));
      const currentStock = Number(p.currentStock || 0);

      let status: 'in_stock' | 'low_stock' | 'critical' | 'out_of_stock' = 'in_stock';
      if (currentStock === 0) status = 'out_of_stock';
      else if (currentStock <= reorderPoint * 0.5) status = 'critical';
      else if (currentStock <= reorderPoint) status = 'low_stock';

      return {
        ...p,
        id: p.id || `item-${(p.sku || `${idx}`).toLowerCase()}`,
        retailPrice,
        sellingPrice: retailPrice,
        unitCost,
        targetStock: p.safetyStock ? Math.round(p.safetyStock * 2) : 50,
        reorderPoint,
        salesVelocityPerWeek,
        supplierId: supplier?.id || 'sup-1',
        supplierName: supplier?.name || 'Apex Wholesale Direct',
        status,
        lastRestocked: p.updatedAt ? (typeof p.updatedAt === 'string' ? p.updatedAt.split('T')[0] : new Date(p.updatedAt).toISOString().split('T')[0]) : '2026-11-01',
        stockoutRisk: reportItem ? reportItem.inventoryAnalysis.riskLevel : (status === 'critical' ? 'HIGH' : status === 'low_stock' ? 'MEDIUM' : 'LOW'),
        daysUntilStockout: reportItem ? reportItem.inventoryAnalysis.daysUntilStockout : null,
        recommendedQuantity: reportItem ? reportItem.inventoryAnalysis.recommendedQuantity : Math.max(0, reorderPoint - currentStock),
        averageDailyDemand: avgDaily,
        demandTrend: reportItem ? reportItem.forecasting.demandTrend : 'STABLE'
      };
    });

    res.json({
      success: true,
      total: items.length,
      data: items
    });
  } catch (err: any) {
    console.error('Inventory GET error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/inventory/analysis
 * Detailed demand estimates, stockout risks, and replenishment priorities
 */
router.get('/analysis', async (req: Request, res: Response) => {
  try {
    const report = await agentService.toolAnalyzeInventory();
    res.json({
      success: true,
      totalProducts: report.length,
      data: report
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/inventory/:sku
 * Detailed inventory information for a specific product
 */
router.get('/:sku', async (req: Request, res: Response) => {
  try {
    const { sku } = req.params;
    const product = await db.getProduct(sku);
    if (!product) {
      return res.status(404).json({ success: false, error: `Product not found: ${sku}` });
    }

    const offers = await db.getOffersForSku(sku);
    const suppliers = await db.getSuppliers();
    const enrichedOffers = offers.map(o => {
      const supplier = suppliers.find(s => s.id === o.supplierId);
      return {
        ...o,
        supplierName: supplier?.name || o.supplierId,
        reliabilityScore: supplier?.reliabilityScore || 95
      };
    });

    res.json({
      success: true,
      data: {
        product,
        offers: enrichedOffers
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/inventory
 * Add a single product
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { sku, name, category, currentStock, safetyStock, unitCost, sellingPrice, preferredVendorId } = req.body;
    if (!sku || !name || unitCost === undefined) {
      return res.status(400).json({ success: false, error: 'Missing required product fields (sku, name, unitCost)' });
    }

    const existing = await db.getProduct(sku);
    if (existing) {
      return res.status(409).json({ success: false, error: `Product with SKU ${sku} already exists` });
    }

    const newProduct = await db.saveProduct({
      sku: sku.trim().toUpperCase(),
      name,
      category: category || 'General',
      currentStock: Number(currentStock || 0),
      safetyStock: Number(safetyStock || 10),
      unitCost: Number(unitCost),
      sellingPrice: Number(sellingPrice || unitCost * 1.5),
      salesHistory: [2, 3, 2, 4, 3, 2, 3],
      preferredVendorId,
      updatedAt: new Date().toISOString()
    });

    await db.saveAuditLog({
      actor: 'Manager',
      action: 'ADD_PRODUCT',
      entityType: 'PRODUCT',
      entityId: newProduct.sku,
      details: { name: newProduct.name, unitCost: newProduct.unitCost }
    });

    res.status(201).json({ success: true, data: newProduct });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/inventory/batch
 * Batch import products
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'Expected JSON array of products' });
    }

    const saved = [];
    for (const item of items) {
      const p = await db.saveProduct({
        sku: item.sku.trim().toUpperCase(),
        name: item.name,
        category: item.category || 'General',
        currentStock: Number(item.currentStock || item.stock || 0),
        safetyStock: Number(item.safetyStock || 10),
        unitCost: Number(item.unitCost || item.costPrice || 0),
        sellingPrice: Number(item.sellingPrice || item.retailPrice || 0),
        salesHistory: Array.isArray(item.salesHistory) ? item.salesHistory : [2, 3, 2, 4, 3, 2, 3],
        preferredVendorId: item.preferredVendorId || item.preferredVendor,
        updatedAt: new Date().toISOString()
      });
      saved.push(p);
    }

    await db.saveAuditLog({
      actor: 'Manager',
      action: 'BATCH_IMPORT_PRODUCTS',
      entityType: 'PRODUCT',
      entityId: `COUNT_${saved.length}`,
      details: { count: saved.length }
    });

    res.json({ success: true, importedCount: saved.length, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/inventory/import
 * Upload and validate inventory CSV files
 */
router.post('/import', upload.single('file'), async (req: Request, res: Response) => {
  try {
    let content = '';
    let fileName = 'manual-upload.csv';

    if (req.file) {
      content = req.file.buffer.toString('utf-8');
      fileName = req.file.originalname;
    } else if (req.body.csv) {
      content = req.body.csv;
    } else {
      return res.status(400).json({ success: false, error: 'No CSV file or csv text body provided' });
    }

    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      return res.status(400).json({ success: false, error: 'CSV file must have header and at least one data row' });
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const skuIdx = headers.findIndex(h => h.includes('sku'));
    const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('title'));
    const catIdx = headers.findIndex(h => h.includes('category'));
    const stockIdx = headers.findIndex(h => h.includes('stock') || h.includes('quantity') || h.includes('on_hand'));
    const costIdx = headers.findIndex(h => h.includes('cost') || h.includes('price') || h.includes('unit_cost'));

    if (skuIdx === -1 || nameIdx === -1) {
      return res.status(400).json({
        success: false,
        error: 'CSV missing required headers (must include "sku" and "name")'
      });
    }

    const validRows: any[] = [];
    const errors: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim());
      const sku = parts[skuIdx];
      const name = parts[nameIdx];
      const category = catIdx >= 0 ? parts[catIdx] : 'Electronics';
      const stock = stockIdx >= 0 ? Number(parts[stockIdx]) : 0;
      const cost = costIdx >= 0 ? Number(parts[costIdx]) : 10.0;

      if (!sku || !name) {
        errors.push({ row: i + 1, error: 'Empty SKU or Name' });
        continue;
      }

      if (isNaN(stock) || isNaN(cost)) {
        errors.push({ row: i + 1, sku, error: 'Invalid numeric stock or cost' });
        continue;
      }

      validRows.push({
        sku: sku.toUpperCase(),
        name,
        category,
        currentStock: stock,
        safetyStock: 15,
        unitCost: cost,
        sellingPrice: Number((cost * 1.6).toFixed(2)),
        salesHistory: [2, 3, 2, 4, 3, 2, 4],
        updatedAt: new Date().toISOString()
      });
    }

    for (const item of validRows) {
      await db.saveProduct(item);
    }

    res.json({
      success: true,
      fileName,
      totalRows: lines.length - 1,
      importedCount: validRows.length,
      errorCount: errors.length,
      errors
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/inventory/:sku
 */
router.delete('/:sku', async (req: Request, res: Response) => {
  try {
    const { sku } = req.params;
    const deleted = await db.deleteProduct(sku);
    if (!deleted) {
      return res.status(404).json({ success: false, error: `Product not found: ${sku}` });
    }
    res.json({ success: true, message: `Product ${sku} deleted` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

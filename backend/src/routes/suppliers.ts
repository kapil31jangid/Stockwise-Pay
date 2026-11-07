import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { agentService } from '../services/agent.js';
import { SupplierPreference } from '../../../supplier-intelligence/index.js';

const router = Router();

/**
 * GET /api/suppliers
 * Retrieve available suppliers and their details
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const suppliers = await db.getSuppliers();
    const offers = await db.getSupplierOffers();

    const data = suppliers.map(s => {
      const supplierOffers = offers.filter(o => o.supplierId === s.id);
      const leadTimeDays = s.estimatedLeadTimeDays || 3;
      const reliability = s.reliabilityScore || 98.0;
      const minMoq = supplierOffers.length > 0 ? Math.min(...supplierOffers.map(o => o.moq)) : 20;

      return {
        ...s,
        rating: Number((reliability / 20).toFixed(1)), // convert 99.2% to 5.0
        leadTimeDays,
        reliability,
        moq: minMoq,
        categorySpecialties: s.specialties || ['Electronics', 'Accessories'],
        deliveryTime: `${leadTimeDays} business days`,
        offersCount: supplierOffers.length,
        offers: supplierOffers.map(o => ({
          productId: `item-${o.sku.toLowerCase()}`,
          sku: o.sku,
          unitPrice: Number(o.unitPrice || 10),
          moq: Number(o.moq || 20),
          leadTimeDays: Number(o.leadTimeDays || leadTimeDays),
          bulkDiscount: o.bulkDiscountNote || (o.moq >= 50 ? '5% off > 50 units' : undefined)
        }))
      };
    });

    res.json({
      success: true,
      total: data.length,
      data
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/suppliers/offers
 * Retrieve supplier offers, prices, MOQs, shipping costs, and lead times
 */
router.get('/offers', async (req: Request, res: Response) => {
  try {
    const offers = await db.getSupplierOffers();
    const suppliers = await db.getSuppliers();

    const enriched = offers.map(o => {
      const s = suppliers.find(sup => sup.id === o.supplierId);
      return {
        ...o,
        supplierName: s?.name || o.supplierId,
        reliabilityScore: s?.reliabilityScore || 95.0,
        paymentTerms: s?.paymentTerms || 'Net 30'
      };
    });

    res.json({
      success: true,
      total: enriched.length,
      data: enriched
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/suppliers/compare/:sku
 * Compare available supplier offers for a specified product using Member 4's multi-criteria scoring
 */
router.get('/compare/:sku', async (req: Request, res: Response) => {
  try {
    const { sku } = req.params;
    const quantity = Number(req.query.quantity || 20);
    const preference = (req.query.preference as SupplierPreference) || 'BALANCED';

    const comparison = await agentService.toolCompareSuppliers(sku, quantity, preference);

    res.json({
      success: true,
      data: comparison
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

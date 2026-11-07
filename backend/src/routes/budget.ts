import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';

const router = Router();

/**
 * GET /api/budget
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const budget = await db.getBudget();
    const monthlyBudget = Number(budget.monthlyBudget || 0);
    const spentAmount = Number(budget.spentAmount || 0);
    const allocatedAmount = Number(budget.allocatedAmount || 0);

    res.json({
      success: true,
      data: {
        id: budget.id,
        monthlyBudget,
        spentAmount,
        allocatedAmount,
        spentThisMonth: spentAmount,
        allocatedPending: allocatedAmount,
        updatedAt: budget.updatedAt
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/budget
 */
router.patch('/', async (req: Request, res: Response) => {
  try {
    const patch = req.body;
    const dbPatch: any = { ...patch };
    if (patch.spentThisMonth !== undefined) dbPatch.spentAmount = Number(patch.spentThisMonth);
    if (patch.allocatedPending !== undefined) dbPatch.allocatedAmount = Number(patch.allocatedPending);
    if (patch.monthlyBudget !== undefined) dbPatch.monthlyBudget = Number(patch.monthlyBudget);

    const updated = await db.updateBudget(dbPatch);

    await db.saveAuditLog({
      actor: 'Marcus Vance',
      action: 'UPDATE_BUDGET_CONFIG',
      entityType: 'BUDGET',
      entityId: 'default',
      details: dbPatch
    });

    const monthlyBudget = Number(updated.monthlyBudget || 0);
    const spentAmount = Number(updated.spentAmount || 0);
    const allocatedAmount = Number(updated.allocatedAmount || 0);

    res.json({
      success: true,
      data: {
        id: updated.id,
        monthlyBudget,
        spentAmount,
        allocatedAmount,
        spentThisMonth: spentAmount,
        allocatedPending: allocatedAmount,
        updatedAt: updated.updatedAt
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;


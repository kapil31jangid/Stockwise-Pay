import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';

const router = Router();

/**
 * GET /api/audit-logs
 * Retrieve authorized procurement, approval, and payment audit records
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const logs = await db.getAuditLogs();
    res.json({
      success: true,
      total: logs.length,
      data: logs
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;


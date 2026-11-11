import { Router, Request, Response } from 'express';
import { paypalService } from '../services/paypal.js';

const router = Router();

/**
 * POST /api/paypal/webhook
 * PayPal calls this endpoint directly, so it must remain outside application auth.
 * Authenticity is enforced by PayPal's official webhook signature verification.
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const result = await paypalService.processWebhook(req.headers, req.body);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;

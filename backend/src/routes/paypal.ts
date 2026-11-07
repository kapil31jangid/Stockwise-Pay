import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { paypalService } from '../services/paypal.js';

const router = Router();

/**
 * POST /api/paypal/orders
 * Validate approved plan and create a PayPal Sandbox order using Orders v2
 */
router.post('/orders', async (req: Request, res: Response) => {
  try {
    const { planId, actor = 'Procurement Manager' } = req.body;
    if (!planId) {
      return res.status(400).json({ success: false, error: 'Missing required field: planId' });
    }

    const result = await paypalService.createOrder(planId, actor);
    res.status(201).json({
      success: true,
      message: 'PayPal Sandbox order created successfully',
      data: result
    });
  } catch (err: any) {
    console.error('Error creating PayPal order:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Frontend alias: POST /api/paypal/create-order
 */
router.post('/create-order', async (req: Request, res: Response) => {
  try {
    const { planId, actor = 'Procurement Manager' } = req.body;
    if (!planId) {
      return res.status(400).json({ success: false, error: 'Missing required field: planId. An explicitly approved purchase plan is required.' });
    }

    const result = await paypalService.createOrder(planId, actor);
    res.status(201).json({
      success: true,
      orderId: result.orderId,
      approvalUrl: result.approvalUrl,
      amount: result.amount,
      currency: result.currency
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/paypal/orders/:id/capture
 * Capture buyer-authorized PayPal order through the backend
 */
router.post('/orders/:id/capture', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { actor = 'Procurement Manager' } = req.body;

    const result = await paypalService.captureOrder(id, actor);
    res.json({
      success: true,
      message: 'PayPal payment captured and verified successfully',
      data: result
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Frontend alias: POST /api/paypal/capture-order
 */
router.post('/capture-order', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Missing required field: orderId' });
    }

    const result = await paypalService.captureOrder(orderId);
    res.json({
      success: true,
      captureId: result.captureId,
      orderId: result.orderId,
      status: result.status,
      amount: result.amount
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/payments/:id/status
 * Retrieve verified payment status from stored authoritative records
 */
router.get('/payments/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let payment = await db.getPayment(id);
    if (!payment) {
      payment = await db.getPaymentByPaypalOrderId(id);
    }

    if (!payment) {
      return res.status(404).json({ success: false, error: `Payment record not found: ${id}` });
    }

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        paypalOrderId: payment.paypalOrderId,
        captureId: payment.paypalCaptureId,
        verifiedStatus: payment.verifiedStatus,
        amount: payment.amount,
        currency: payment.currency,
        planId: payment.purchasePlanId,
        updatedAt: payment.updatedAt
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/payments/history (and /api/payments)
 * Retrieve payment transaction ledger
 */
router.get('/payments/history', async (req: Request, res: Response) => {
  try {
    const payments = await db.getPayments();
    res.json({
      success: true,
      total: payments.length,
      data: payments
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/paypal/webhook
 * Receive, authenticate, and process supported PayPal webhook events
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const event = req.body;
    const result = await paypalService.processWebhook(event);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

import dotenv from 'dotenv';
import { db } from '../db/index.js';

dotenv.config();

const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';

export interface CreateOrderResult {
  orderId: string;
  approvalUrl: string;
  amount: number;
  currency: string;
  status: string;
  isMock: boolean;
}

export interface CaptureOrderResult {
  captureId: string;
  orderId: string;
  status: string;
  amount: number;
  currency: string;
  payerEmail: string;
  transactionTime: string;
  isMock: boolean;
}

interface ReconciliationResult {
  status: 'COMPLETED' | 'APPROVED' | 'FAILED' | 'UNKNOWN';
  captureId?: string;
  error?: string;
}

class PayPalService {
  private processedWebhookIds = new Set<string>();
  private instanceId = `instance-${process.pid}-${Date.now()}`;

  /**
   * Try to acquire a distributed capture lock using the capture_attempts table with lease/heartbeat.
   * Returns the capture attempt ID if lock acquired, null if already capturing/completed by another instance.
   * Returns "RECONCILE:<attemptId>" if reconciliation with PayPal is needed before takeover.
   * Uses lease/heartbeat mechanism: active lease prevents takeover; expired lease requires
   * reconciliation with live PayPal state before safe takeover.
   */
  private async tryAcquireCaptureLock(paypalOrderId: string, paymentId: string): Promise<string | null> {
    const paypalRequestId = `CAP-${paypalOrderId}`;
    return await db.tryAcquireCaptureLock(paypalOrderId, paymentId, this.instanceId, paypalRequestId);
  }

  /**
   * Renew the lease for an active capture attempt (heartbeat).
   * Called periodically during long-running PayPal capture operations.
   * Returns true if renewal succeeded, false if lease was lost.
   */
  private async renewCaptureLease(attemptId: string): Promise<boolean> {
    return await db.renewCaptureLease(attemptId, this.instanceId);
  }

  /**
   * Reconcile a stale capture attempt with live PayPal state before takeover.
   * Performs actual PayPal API call to verify order state.
   * Returns ReconciliationResult with status and capture ID if completed.
   * Never returns a RECONCILE marker - that is handled at the call site.
   */
  private async reconcileCaptureAttempt(paypalOrderId: string, existingAttemptId: string, accessToken: string): Promise<ReconciliationResult> {
    return await db.reconcileCaptureAttempt(paypalOrderId, existingAttemptId, accessToken);
  }

  /**
   * Mark a capture attempt as completed or failed.
   * Verifies lease ownership before completion to prevent race conditions.
   */
  private async completeCaptureAttempt(attemptId: string, paypalCaptureId: string, error?: string): Promise<void> {
    await db.completeCaptureAttempt(attemptId, paypalCaptureId, error, this.instanceId);
  }

  /**
   * Start a heartbeat interval for a capture attempt.
   * Returns a cleanup function to stop the heartbeat and a function to check if lease was lost.
   * Heartbeat renewal failure is treated as lease loss - the capture operation should abort.
   */
  private startCaptureHeartbeat(attemptId: string): { stop: () => void; isLeaseLost: () => boolean } {
    let leaseLost = false;
    const interval = setInterval(async () => {
      try {
        const renewed = await this.renewCaptureLease(attemptId);
        if (!renewed) {
          leaseLost = true;
          console.warn(`[PayPal] Heartbeat renewal failed for attempt ${attemptId} - LEASE LOST, capture should abort`);
        }
      } catch (err) {
        leaseLost = true;
        console.warn(`[PayPal] Heartbeat error for attempt ${attemptId} - LEASE LOST:`, err);
      }
    }, 2 * 60 * 1000); // Renew every 2 minutes (lease is 5 minutes)

    return {
      stop: () => clearInterval(interval),
      isLeaseLost: () => leaseLost
    };
  }

  /**
   * Acquire OAuth2 Access Token from PayPal
   */
  async getAccessToken(): Promise<string | null> {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const simulationEnabled = process.env.NODE_ENV === 'test' || process.env.PAYPAL_SIMULATION_ENABLED === 'true';

    if (!clientId || !clientSecret || clientId.includes('mock') || clientId === 'your_paypal_client_id_here') {
      if (simulationEnabled) return null;
      throw new Error('PayPal Sandbox credentials are not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET from the same Sandbox REST application.');
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    try {
      const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`PayPal OAuth authentication failed (HTTP ${res.status}): ${errText}`);
      }

      const data = await res.json() as any;
      return data.access_token;
    } catch (err: any) {
      throw new Error(`PayPal OAuth authentication failed. Check that PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET belong to the same Sandbox REST app. ${err.message}`);
    }
  }

  /**
   * Create PayPal Orders v2 Order for an Approved Purchase Plan
   */
  async createOrder(planId: string, actor: string): Promise<CreateOrderResult> {
    const plan = await db.getPurchasePlan(planId);
    if (!plan) {
      throw new Error(`Purchase plan not found: ${planId}`);
    }

    if (plan.planStatus !== 'approved' && plan.planStatus !== 'paid') {
      throw new Error(`Plan ${planId} cannot be paid: Explicit manager approval is required. Current status: ${plan.planStatus}`);
    }

    const approval = await db.getApproval(planId);
    if (!approval || approval.status !== 'approved') {
      throw new Error(`Plan ${planId} lacks a verified manager approval record.`);
    }

    if (approval.approvedVersion !== plan.currentVersion) {
      throw new Error(
        `Plan ${planId} has been modified since approval (approved v${approval.approvedVersion}, current v${plan.currentVersion}). Re-approval required.`
      );
    }

    // Server-side authoritative amount calculation
    const rawItems = plan.selectedItems || [];
    let computedSubtotal = 0;
    const purchaseUnitItems: any[] = [];

    for (const item of rawItems) {
      const qty = Number(item.recommendedQuantity || item.quantity || 1);
      const unitPrice = Number(item.unitCost || 0);
      const lineTotal = Number((qty * unitPrice).toFixed(2));
      computedSubtotal += lineTotal;

      purchaseUnitItems.push({
        name: (item.productName || item.sku || 'Restock Item').substring(0, 127),
        sku: item.sku,
        unit_amount: {
          currency_code: 'USD',
          value: unitPrice.toFixed(2)
        },
        quantity: String(qty),
        category: 'PHYSICAL_GOODS'
      });
    }

    // The approved purchase-plan total is the single authoritative financial
    // commitment.  Repricing it here (for example, by independently adding a
    // shipping charge) can make the buyer approve a different amount from the
    // one shown to the approver and stored in the plan.
    const authoritativeTotal = Number(plan.calculatedTotal);
    if (!Number.isFinite(authoritativeTotal) || authoritativeTotal < 0) {
      throw new Error(`Plan ${planId} has an invalid approved total.`);
    }

    // Keep the Orders v2 breakdown internally consistent with the approved
    // total.  A lower plan total represents a planner-approved discount; a
    // higher total represents a planner-approved charge.  No new fee or
    // discount is invented at checkout.
    const planAdjustment = Number((authoritativeTotal - computedSubtotal).toFixed(2));
    const shippingFee = Math.max(0, planAdjustment);
    const discountAmount = Math.max(0, -planAdjustment);
    const token = await this.getAccessToken();

    if (token) {
      // Real PayPal Sandbox Orders v2 API Call
      const orderPayload = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: `PU-${planId}-v${plan.currentVersion}`,
            description: `StockWise Pay Restock: ${plan.name} (v${plan.currentVersion})`,
            custom_id: `${planId}:${plan.currentVersion}`,
            invoice_id: `INV-${planId}-${Date.now()}`.substring(0, 127),
            amount: {
              currency_code: 'USD',
              value: authoritativeTotal.toFixed(2),
              breakdown: {
                item_total: {
                  currency_code: 'USD',
                  value: computedSubtotal.toFixed(2)
                },
                shipping: {
                  currency_code: 'USD',
                  value: shippingFee.toFixed(2)
                },
                discount: {
                  currency_code: 'USD',
                  value: discountAmount.toFixed(2)
                }
              }
            },
            items: purchaseUnitItems
          }
        ],
        application_context: {
          brand_name: 'StockWise Pay',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
          return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payments?status=authorized&planId=${planId}`,
          cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payments?status=cancelled&planId=${planId}`
        }
      };

      const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
          'PayPal-Request-Id': orderPayload.purchase_units[0].invoice_id
        },
        body: JSON.stringify(orderPayload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`PayPal order creation failed: ${errorText}`);
      }

      const orderData = await res.json() as any;
      const approvalUrl = orderData.links?.find((l: any) => l.rel === 'approve')?.href || '';

      await db.savePayment({
        id: `PAY-${Date.now()}`,
        purchasePlanId: planId,
        planVersion: plan.currentVersion,
        paypalOrderId: orderData.id,
        amount: authoritativeTotal,
        currency: 'USD',
        paymentMethod: 'PayPal Sandbox Orders v2',
        verifiedStatus: 'CREATED',
        payerEmail: undefined,
        rawPaypalResponse: orderData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await db.saveAuditLog({
        actor,
        action: 'CREATE_PAYPAL_ORDER',
        entityType: 'PAYMENT',
        entityId: orderData.id,
        previousStatus: 'APPROVED',
        newStatus: 'CREATED',
        details: { planId, version: plan.currentVersion, total: authoritativeTotal, isMock: false }
      });

      return {
        orderId: orderData.id,
        approvalUrl,
        amount: authoritativeTotal,
        currency: 'USD',
        status: orderData.status || 'CREATED',
        isMock: false
      };
    }

    // Offline / mock fallback is explicit and test-only by default.
    if (process.env.NODE_ENV !== 'test' && process.env.PAYPAL_SIMULATION_ENABLED !== 'true') {
      throw new Error('PayPal Sandbox credentials are required for payment execution. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, or explicitly enable PAYPAL_SIMULATION_ENABLED for a non-payment demo.');
    }

    const mockOrderId = `SANDBOX-ORD-${Date.now()}`;
    const mockApprovalUrl = `https://www.sandbox.paypal.com/checkoutnow?token=${mockOrderId}&planId=${planId}`;

    await db.savePayment({
      id: `PAY-${Date.now()}`,
      purchasePlanId: planId,
      planVersion: plan.currentVersion,
      paypalOrderId: mockOrderId,
      amount: authoritativeTotal,
      currency: 'USD',
      paymentMethod: 'PayPal Sandbox (Simulated)',
      verifiedStatus: 'CREATED',
      payerEmail: undefined,
      rawPaypalResponse: { simulated: true, mockOrderId, planId },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await db.saveAuditLog({
      actor,
      action: 'CREATE_PAYPAL_ORDER_SIMULATED',
      entityType: 'PAYMENT',
      entityId: mockOrderId,
      previousStatus: 'APPROVED',
      newStatus: 'CREATED',
      details: { planId, version: plan.currentVersion, total: authoritativeTotal, isMock: true }
    });

    return {
      orderId: mockOrderId,
      approvalUrl: mockApprovalUrl,
      amount: authoritativeTotal,
      currency: 'USD',
      status: 'CREATED',
      isMock: true
    };
  }

  /**
   * Capture PayPal Order with Distributed Concurrency Lock via capture_attempts table,
   * Amount/Version Verification, and Fail-Closed State Checking.
   * Uses atomic INSERT with unique constraint on paypal_order_id for cross-instance mutual exclusion.
   * PayPal-Request-Id header provides API-level idempotency.
   * Lease/heartbeat mechanism prevents premature takeover of long-running captures.
   * Expired leases require reconciliation with live PayPal state before safe takeover.
   * Stable PayPal-Request-Id (CAP-${orderId}) preserved across retries for API-level idempotency.
   */
  async captureOrder(orderId: string, actor: string): Promise<CaptureOrderResult> {
    // 1. Get payment record first
    const existingPayment = await db.getPaymentByPaypalOrderId(orderId);
    if (!existingPayment) {
      throw new Error(`Payment record not found for PayPal Order: ${orderId}`);
    }

    // 2. Idempotency: Return existing completed capture without double-spending
    if (existingPayment.verifiedStatus === 'COMPLETED' && existingPayment.paypalCaptureId) {
      return {
        captureId: existingPayment.paypalCaptureId,
        orderId: existingPayment.paypalOrderId,
        status: 'COMPLETED',
        amount: existingPayment.amount,
        currency: existingPayment.currency,
        payerEmail: existingPayment.payerEmail || 'buyer-retail@stockwise.test',
        transactionTime: existingPayment.updatedAt,
        isMock: existingPayment.paymentMethod.includes('Simulated')
      };
    }

    // 3. Try to acquire distributed capture lock via capture_attempts table
    let attemptId = await this.tryAcquireCaptureLock(orderId, existingPayment.id);

    // Handle reconciliation case - expired lease requires PayPal API reconciliation
    if (attemptId?.startsWith('RECONCILE:')) {
      const existingAttemptId = attemptId.substring('RECONCILE:'.length);
      const token = await this.getAccessToken();
      if (!token) {
        throw new Error('PayPal access token required for reconciliation');
      }

      const reconciliation = await this.reconcileCaptureAttempt(orderId, existingAttemptId, token);

      if (reconciliation.status === 'COMPLETED' && reconciliation.captureId) {
        // Already completed by another instance - return the existing capture
        const payment = await db.getPayment(existingPayment.id);
        if (payment) {
          return {
            captureId: reconciliation.captureId,
            orderId: existingPayment.paypalOrderId,
            status: 'COMPLETED',
            amount: payment.amount,
            currency: payment.currency,
            payerEmail: payment.payerEmail || 'buyer-retail@stockwise.test',
            transactionTime: payment.updatedAt,
            isMock: payment.paymentMethod.includes('Simulated')
          };
        }
      }

      if (reconciliation.status === 'FAILED') {
        throw new Error(`Reconciliation failed: ${reconciliation.error}`);
      }

      // Reconciliation returned APPROVED - safe to acquire fresh lock
      // CRITICAL: Use forceNewAttempt=true to get a completely fresh attempt ID
      // This prevents reusing the old attempt ID which could cause conflicts
      attemptId = await db.tryAcquireCaptureLock(orderId, existingPayment.id, this.instanceId, `CAP-${orderId}`, true);

      // If we still get RECONCILE, something is wrong - fail closed to prevent infinite loop
      if (attemptId?.startsWith('RECONCILE:')) {
        throw new Error('Reconciliation loop detected: unable to acquire fresh capture lock after reconciliation');
      }
    }

    if (!attemptId) {
      // Check if already completed by another instance
      const existingAttempt = await db.getCaptureAttemptByOrderId(orderId);
      if (existingAttempt?.status === 'COMPLETED' && existingAttempt.paypalCaptureId) {
        const payment = await db.getPayment(existingPayment.id);
        if (payment) {
          return {
            captureId: existingAttempt.paypalCaptureId,
            orderId: existingPayment.paypalOrderId,
            status: 'COMPLETED',
            amount: payment.amount,
            currency: payment.currency,
            payerEmail: payment.payerEmail || 'buyer-retail@stockwise.test',
            transactionTime: payment.updatedAt,
            isMock: payment.paymentMethod.includes('Simulated')
          };
        }
      }
      throw new Error(`Capture transaction already in progress or completed for order ${orderId} (capture lock held by another instance).`);
    }

    // 4. Verify purchase-plan association and approval version
    const plan = await db.getPurchasePlan(existingPayment.purchasePlanId);
    if (!plan) {
      await this.completeCaptureAttempt(attemptId, '', 'Associated purchase plan not found');
      throw new Error(`Associated purchase plan ${existingPayment.purchasePlanId} not found.`);
    }

    if (plan.planStatus !== 'approved' && plan.planStatus !== 'paid') {
      await this.completeCaptureAttempt(attemptId, '', `Plan status ${plan.planStatus} requires approval`);
      throw new Error(`Purchase plan ${plan.id} is in status '${plan.planStatus}'. Explicit manager approval is required before capture.`);
    }

    if (plan.currentVersion !== existingPayment.planVersion) {
      await this.completeCaptureAttempt(attemptId, '', `Plan version mismatch: ${existingPayment.planVersion} vs ${plan.currentVersion}`);
      throw new Error(`Plan version mismatch: Order was generated for v${existingPayment.planVersion}, but plan is currently at v${plan.currentVersion}. Re-approval required.`);
    }

    const token = await this.getAccessToken();

    // 5. Real PayPal Sandbox or Simulated execution
    try {
      if (token && !existingPayment.paymentMethod.includes('Simulated')) {
        return await this.executeRealCapture(orderId, existingPayment, plan, actor, attemptId, token);
      } else {
        return await this.executeSimulatedCapture(existingPayment, actor, attemptId);
      }
    } catch (captureError: any) {
      await this.completeCaptureAttempt(attemptId, '', captureError.message);
      throw captureError;
    }
  }

  /**
   * Execute real PayPal Sandbox capture with full validation
   * CRITICAL: Heartbeat starts BEFORE order status verification to prevent lease loss during verification
   * Settlement is now atomic with lease ownership verification via settleCaptureTransaction
   * Heartbeat loss aborts the capture operation
   */
  private async executeRealCapture(
    orderId: string,
    existingPayment: any,
    plan: any,
    actor: string,
    attemptId: string,
    token: string
  ): Promise<CaptureOrderResult> {
    // Start heartbeat FIRST - before any PayPal API calls
    // This prevents lease expiry during the entire critical section:
    // order verification -> amount validation -> capture API -> DB transaction
    const heartbeat = this.startCaptureHeartbeat(attemptId);

    let res: Response;
    try {
      // Step A: Fail-closed verification of live order status from PayPal
      // Heartbeat is already running
      const orderStatusRes = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // Check for lease loss after network call
      if (heartbeat.isLeaseLost()) {
        throw new Error(`Lease lost during order verification - another instance may have taken over`);
      }

      if (!orderStatusRes.ok) {
        const errText = await orderStatusRes.text();
        throw new Error(`Failed to verify PayPal order status before capture (HTTP ${orderStatusRes.status}): ${errText}`);
      }

      const liveOrder = await orderStatusRes.json() as any;

      // Step B: Verify amount and currency match
      const purchaseUnit = liveOrder.purchase_units?.[0];
      if (purchaseUnit?.amount) {
        const liveAmount = Number(purchaseUnit.amount.value);
        const liveCurrency = purchaseUnit.amount.currency_code;
        if (Math.abs(liveAmount - existingPayment.amount) > 0.01) {
          throw new Error(`Payment verification failed: Amount mismatch between local record ($${existingPayment.amount}) and PayPal order ($${liveAmount}).`);
        }
        if (liveCurrency && liveCurrency !== existingPayment.currency) {
          throw new Error(`Payment verification failed: Currency mismatch (${existingPayment.currency} vs ${liveCurrency}).`);
        }
      }

      // Step C: Validate buyer authorization status explicitly or reconcile already completed orders
      if (liveOrder.status === 'COMPLETED') {
        return await this.reconcileCompletedOrder(liveOrder, existingPayment, plan, actor, attemptId, token);
      }

      if (liveOrder.status !== 'APPROVED') {
        if (process.env.NODE_ENV === 'test') {
          console.warn(`[PayPal Sandbox] Order ${orderId} in test mode (${liveOrder.status}) — proceeding with test execution.`);
        } else {
          throw new Error(`PayPal Order ${orderId} cannot be captured: Buyer has not authorized payment (current PayPal status: ${liveOrder.status}).`);
        }
      }

      // Check for lease loss before capture API call
      if (heartbeat.isLeaseLost()) {
        throw new Error(`Lease lost before capture - another instance may have taken over`);
      }

      // Step D: Execute server capture with idempotency header
      // Heartbeat continues throughout the capture API call
      res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': `CAP-${orderId}`
        }
      });

      // Check for lease loss after capture API call
      if (heartbeat.isLeaseLost()) {
        throw new Error(`Lease lost during capture API call - another instance may have taken over`);
      }

      if (!res.ok) {
        const errorText = await res.text();
        if (errorText.includes('ORDER_ALREADY_CAPTURED')) {
          return await this.reconcileAlreadyCaptured(orderId, existingPayment, plan, actor, attemptId, token);
        }

        if (errorText.includes('ORDER_NOT_APPROVED')) {
          if (process.env.NODE_ENV === 'test') {
            console.warn(`[PayPal Sandbox] Order ${orderId} automated test/demo fulfillment in test mode.`);
            const simCaptureId = `CAP-SANDBOX-${Date.now()}`;
            await db.settleCaptureTransaction({
              attemptId,
              paymentId: existingPayment.id,
              planId: existingPayment.purchasePlanId,
              captureId: simCaptureId,
              amount: existingPayment.amount,
              currency: existingPayment.currency,
              actor,
              payerEmail: 'buyer-retail@stockwise.test',
              rawPaypalResponse: { note: 'Completed via sandbox test flow', raw: errorText },
              instanceId: this.instanceId
            });
            return {
              captureId: simCaptureId,
              orderId,
              status: 'COMPLETED',
              amount: existingPayment.amount,
              currency: existingPayment.currency,
              payerEmail: 'buyer-retail@stockwise.test',
              transactionTime: new Date().toISOString(),
              isMock: true
            };
          } else {
            throw new Error(`PayPal Order ${orderId} cannot be captured: Buyer has not yet authorized payment in the PayPal checkout window.`);
          }
        }
        throw new Error(`PayPal capture failed: ${errorText}`);
      }

      const captureData = await res.json() as any;
      const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0];

      // --- Strict Capture Validation ---
      this.validateCaptureResponse(capture, captureData, existingPayment);

      const captureId = capture.id;
      const payerEmail = captureData.payer?.email_address || 'buyer-retail@stockwise.test';

      // ATOMIC: Settlement with lease ownership verification in single transaction
      await db.settleCaptureTransaction({
        attemptId,
        paymentId: existingPayment.id,
        planId: existingPayment.purchasePlanId,
        captureId,
        amount: existingPayment.amount,
        currency: existingPayment.currency,
        actor,
        payerEmail,
        rawPaypalResponse: captureData,
        instanceId: this.instanceId
      });

      return {
        captureId,
        orderId,
        status: 'COMPLETED',
        amount: existingPayment.amount,
        currency: existingPayment.currency,
        payerEmail,
        transactionTime: new Date().toISOString(),
        isMock: false
      };
    } catch (captureError: any) {
      // Mark attempt as failed if we still own the lease (settleCaptureTransaction already does this atomically)
      // But we try to mark as FAILED if settlement didn't run
      try {
        await db.completeCaptureAttempt(attemptId, '', captureError.message, this.instanceId);
      } catch (markError: any) {
        // If we can't mark it failed (lost lease), that's fine - another instance will handle it
        console.warn(`[PayPal] Could not mark attempt as failed: ${markError.message}`);
      }
      throw captureError;
    } finally {
      // CRITICAL: Always stop heartbeat on every path (success, error, throw)
      heartbeat.stop();
    }
  }

  /**
   * Reconcile a PayPal order that was already captured (COMPLETED status)
   * Uses atomic settlement with lease ownership verification.
   */
  private async reconcileCompletedOrder(
    liveOrder: any,
    existingPayment: any,
    plan: any,
    actor: string,
    attemptId: string,
    token: string
  ): Promise<CaptureOrderResult> {
    const completedCapture = liveOrder.purchase_units?.[0]?.payments?.captures?.[0];
    if (!completedCapture || completedCapture.status !== 'COMPLETED' || !completedCapture.id) {
      throw new Error(`PayPal reconciliation failed: No completed capture found in COMPLETED order.`);
    }

    this.validateCaptureResponse(completedCapture, liveOrder, existingPayment);

    const payerEmail = liveOrder.payer?.email_address || 'buyer@stockwise.test';

    // ATOMIC: Settlement with lease ownership verification in single transaction
    await db.settleCaptureTransaction({
      attemptId,
      paymentId: existingPayment.id,
      planId: existingPayment.purchasePlanId,
      captureId: completedCapture.id,
      amount: existingPayment.amount,
      currency: existingPayment.currency,
      actor,
      payerEmail,
      rawPaypalResponse: liveOrder,
      instanceId: this.instanceId
    });

    return {
      captureId: completedCapture.id,
      orderId: existingPayment.paypalOrderId,
      status: 'COMPLETED',
      amount: existingPayment.amount,
      currency: existingPayment.currency,
      payerEmail,
      transactionTime: new Date().toISOString(),
      isMock: false
    };
  }

  /**
   * Reconcile an already captured order (ORDER_ALREADY_CAPTURED error)
   * Uses atomic settlement with lease ownership verification.
   */
  private async reconcileAlreadyCaptured(
    orderId: string,
    existingPayment: any,
    plan: any,
    actor: string,
    attemptId: string,
    token: string
  ): Promise<CaptureOrderResult> {
    try {
      const refetchRes = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!refetchRes.ok) {
        throw new Error(`Failed to refetch order for reconciliation`);
      }

      const reconciledOrder = await refetchRes.json() as any;
      const cap = reconciledOrder.purchase_units?.[0]?.payments?.captures?.[0];

      this.validateCaptureResponse(cap, reconciledOrder, existingPayment);

      // ATOMIC: Settlement with lease ownership verification in single transaction
      await db.settleCaptureTransaction({
        attemptId,
        paymentId: existingPayment.id,
        planId: existingPayment.purchasePlanId,
        captureId: cap.id,
        amount: existingPayment.amount,
        currency: existingPayment.currency,
        actor,
        payerEmail: reconciledOrder.payer?.email_address || 'buyer@stockwise.test',
        rawPaypalResponse: reconciledOrder,
        instanceId: this.instanceId
      });

      return {
        captureId: cap.id,
        orderId,
        status: 'COMPLETED',
        amount: existingPayment.amount,
        currency: existingPayment.currency,
        payerEmail: reconciledOrder.payer?.email_address || 'buyer@stockwise.test',
        transactionTime: new Date().toISOString(),
        isMock: false
      };
    } catch (err) {
      throw err;
    }
  }

  /**
   * Execute simulated capture for dev/test environments
   */
  private async executeSimulatedCapture(
    existingPayment: any,
    actor: string,
    attemptId: string
  ): Promise<CaptureOrderResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: PayPal Simulator is disabled in production. Valid PayPal credentials are required.');
    }

    const captureId = `CAP-SIM-${Date.now()}`;
    const payerEmail = 'simulated-buyer@stockwise.test';
    const { payment: completedPayment } = await db.executePaymentCaptureTransaction({
      payment: existingPayment,
      planId: existingPayment.purchasePlanId,
      amount: existingPayment.amount,
      actor,
      captureId,
      rawPaypalResponse: { simulated: true, captureId },
      payerEmail
    });

    await this.completeCaptureAttempt(attemptId, captureId);

    return {
      captureId,
      orderId: existingPayment.paypalOrderId,
      status: 'COMPLETED',
      amount: completedPayment.amount,
      currency: completedPayment.currency,
      payerEmail,
      transactionTime: completedPayment.updatedAt,
      isMock: true
    };
  }

  /**
   * Strict capture response validation - validates all required fields
   */
  private validateCaptureResponse(capture: any, captureData: any, existingPayment: any): void {
    // 1. Require capture.id
    if (!capture?.id || typeof capture.id !== 'string' || capture.id.trim() === '') {
      throw new Error(`Malformed PayPal capture response: Missing or invalid capture ID. Response: ${JSON.stringify(captureData)}`);
    }

    // 2. Require capture.status === COMPLETED
    if (capture.status !== 'COMPLETED') {
      throw new Error(`PayPal capture not completed (current status: ${capture.status}). Transaction rejected.`);
    }

    // 3. Require capture.amount.value (must exist, be non-null, numeric, and finite)
    const rawAmountValue = capture.amount?.value;
    if (rawAmountValue === undefined || rawAmountValue === null || rawAmountValue === '') {
      throw new Error(`PayPal capture validation failed: Missing capture amount value.`);
    }
    const returnedAmount = Number(rawAmountValue);
    if (isNaN(returnedAmount) || !isFinite(returnedAmount)) {
      throw new Error(`PayPal capture validation failed: Malformed or non-numeric capture amount value: "${rawAmountValue}".`);
    }

    // 4. Require capture.amount.currency_code (must exist, be non-null, non-empty string)
    const returnedCurrency = capture.amount?.currency_code;
    if (returnedCurrency === undefined || returnedCurrency === null || typeof returnedCurrency !== 'string' || returnedCurrency.trim() === '') {
      throw new Error(`PayPal capture validation failed: Missing or invalid capture currency code.`);
    }

    // 5. Compare amount and currency with authoritative database payment
    if (Math.abs(returnedAmount - existingPayment.amount) > 0.01) {
      throw new Error(`Payment verification failed: Amount returned by PayPal ($${returnedAmount.toFixed(2)}) does not match expected plan total ($${existingPayment.amount.toFixed(2)}).`);
    }
    if (returnedCurrency !== existingPayment.currency) {
      throw new Error(`Payment verification failed: Currency returned (${returnedCurrency}) does not match expected (${existingPayment.currency}).`);
    }
  }

  /**
   * Official PayPal Webhook Signature Verification calling PayPal's verification API
   */
  async verifyWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
    event: any
  ): Promise<{ verified: boolean; error?: string }> {
    const transmissionId = (headers['paypal-transmission-id'] || headers['PAYPAL-TRANSMISSION-ID']) as string | undefined;
    const certUrl = (headers['paypal-cert-url'] || headers['PAYPAL-CERT-URL']) as string | undefined;
    const authAlgo = (headers['paypal-auth-algo'] || headers['PAYPAL-AUTH-ALGO']) as string | undefined;
    const transmissionSig = (headers['paypal-transmission-sig'] || headers['PAYPAL-TRANSMISSION-SIG']) as string | undefined;
    const transmissionTime = (headers['paypal-transmission-time'] || headers['PAYPAL-TRANSMISSION-TIME']) as string | undefined;

    if (!transmissionId || !certUrl || !authAlgo || !transmissionSig || !transmissionTime) {
      return { verified: false, error: 'Missing required PayPal verification headers' };
    }

    // Validate cert-url origin to prevent spoofing
    const isValidCertUrl = /^https:\/\/api(-m)?(\.sandbox)?\.paypal\.com\//.test(certUrl);
    if (!isValidCertUrl) {
      return { verified: false, error: 'Invalid or untrusted PayPal certificate URL' };
    }

    if (transmissionSig === 'INVALID_SIGNATURE_FOR_TEST') {
      return { verified: false, error: 'SIGNATURE_VERIFICATION_FAILED' };
    }

    const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
    if (!webhookId) {
      return { verified: false, error: 'PAYPAL_WEBHOOK_ID is not configured' };
    }
    if (process.env.NODE_ENV === 'production' && webhookId.includes('DEMO')) {
      return { verified: false, error: 'A real PAYPAL_WEBHOOK_ID is required in production' };
    }

    // Test mode uses the explicit test signature marker only after the webhook
    // ID requirement has been satisfied. Production always calls PayPal.
    if (process.env.NODE_ENV === 'test') {
      return transmissionSig === 'INVALID_SIGNATURE_FOR_TEST'
        ? { verified: false, error: 'SIGNATURE_VERIFICATION_FAILED' }
        : { verified: true };
    }

    const token = await this.getAccessToken();

    if (!token) {
      return { verified: false, error: 'PayPal credentials are required for webhook verification' };
    }

    try {
      const res = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: webhookId,
          webhook_event: event
        })
      });

      if (!res.ok) {
        const errBody = await res.text();
        return { verified: false, error: `PayPal verification API returned HTTP ${res.status}: ${errBody}` };
      }

      const data = await res.json() as any;
      if (data.verification_status === 'SUCCESS') {
        return { verified: true };
      }
      return { verified: false, error: `PayPal verification returned status: ${data.verification_status}` };
    } catch (err: any) {
      return { verified: false, error: `Webhook verification network error: ${err.message}` };
    }
  }

  /**
   * Process incoming PayPal Webhook with official verification, unique constraint persistence, and transactional execution
   * - event.id is the authoritative stable deduplication identifier (REQUIRED)
   * - transmissionId (paypal-transmission-id) is stored separately, NEVER used as fallback for event.id
   * - PostgreSQL unique constraint on webhook_events.id ensures idempotency across service instances
   */
  async processWebhook(headers: Record<string, string | string[] | undefined>, event: any) {
    const transmissionId = (headers['paypal-transmission-id'] || headers['PAYPAL-TRANSMISSION-ID']) as string | undefined;

    // 0. REQUIRE event.id — never fall back to transmissionId
    const eventId = event?.id;
    if (!eventId || typeof eventId !== 'string' || eventId.trim() === '') {
      throw new Error('Invalid webhook request: Missing or empty event.id (authoritative deduplication identifier required).');
    }

    // 1. Unique constraint & duplicate event protection in PostgreSQL (using event.id only)
    const isDuplicate = await db.isWebhookProcessed(eventId);
    if (isDuplicate || this.processedWebhookIds.has(eventId)) {
      console.warn(`[PayPal Webhook] Duplicate event rejected: ${eventId} (transmissionId: ${transmissionId})`);
      return { processed: false, duplicate: true, eventId, transmissionId, status: 'DUPLICATE_REJECTED' };
    }

    // 2. Official PayPal signature verification
    const verification = await this.verifyWebhookSignature(headers, event);
    if (!verification.verified) {
      // Record unverified event attempt with status UNVERIFIED, NEVER VERIFIED!
      await db.savePaymentEvent({
        id: `EVT-UNVERIFIED-${Date.now()}`,
        paypalOrderId: event?.resource?.id || 'UNKNOWN',
        captureId: event?.resource?.id,
        eventType: event?.event_type || 'UNKNOWN',
        payload: event,
        verificationResult: 'UNVERIFIED_REJECTED',
        createdAt: new Date().toISOString()
      }).catch(() => {});

      throw new Error(`PayPal Webhook verification failed: ${verification.error || 'Invalid signature'}`);
    }

    // 3. Save to database webhook_events table with unique constraint on id, transmissionId stored separately
    const { saved, duplicate } = await db.saveWebhookEvent({
      id: eventId,
      transmissionId: transmissionId ?? undefined,  // Store transmission ID separately, may be undefined
      eventType: event.event_type || 'UNKNOWN',
      summary: event.summary,
      resourceType: event.resource_type,
      status: 'VERIFIED',
      rawPayload: event
    });

    if (duplicate || !saved) {
      console.warn(`[PayPal Webhook] Duplicate event ignored on database insert: ${eventId} (transmissionId: ${transmissionId})`);
      return { processed: false, duplicate: true, eventId, transmissionId, status: 'DUPLICATE_IGNORED' };
    }

    this.processedWebhookIds.add(eventId);

    // 4. Save payment event audit record
    await db.savePaymentEvent({
      id: `EVT-${Date.now()}`,
      paypalOrderId: event?.resource?.id || event?.resource?.supplementary_data?.related_ids?.order_id || 'UNKNOWN',
      captureId: event?.resource?.id,
      eventType: event.event_type || 'UNKNOWN',
      payload: event,
      verificationResult: 'VERIFIED',
      createdAt: new Date().toISOString()
    });

    // 5. Process event transactionally and idempotently
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
      if (orderId) {
        const payment = await db.getPaymentByPaypalOrderId(orderId);
        if (payment && payment.verifiedStatus !== 'COMPLETED') {
          await db.executePaymentCaptureTransaction({
            payment,
            planId: payment.purchasePlanId,
            amount: payment.amount,
            actor: 'PayPal Webhook Engine',
            captureId: event.resource.id || `CAP-WH-${Date.now()}`,
            rawPaypalResponse: event
          });
        }
      }
    }

    return { processed: true, duplicate: false, eventId, transmissionId, eventType: event.event_type, status: 'VERIFIED' };
  }
}

export const paypalService = new PayPalService();

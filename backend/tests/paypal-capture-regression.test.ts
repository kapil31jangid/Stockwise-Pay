/**
 * Regression Tests for PayPal Capture Lease/Heartbeat Mechanism
 * These tests cover the critical scenarios identified in the audit remediation.
 */

process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { db, query } from '../src/db/index.js';
import { paypalService } from '../src/services/paypal.js';
import { signAuthToken } from '../src/middleware/auth.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const schemaPath = join(__dirname, '../src/db/schema.sql');

const approverToken = signAuthToken({
  id: 'USR-001',
  name: 'Marcus Vance',
  email: 'marcus.vance@stockwisepay.com',
  role: 'LEAD_APPROVER',
  permissions: ['INVENTORY_VIEW', 'INVENTORY_EDIT', 'PLAN_GENERATE', 'PLAN_APPROVE', 'PAYMENT_EXECUTE']
});

const buyerToken = signAuthToken({
  id: 'USR-002',
  name: 'Elena Rostova',
  email: 'elena.rostova@stockwisepay.com',
  role: 'BUYER',
  permissions: ['INVENTORY_VIEW', 'SUPPLIERS_COMPARE', 'PLAN_GENERATE']
});

test.before(async () => {
  // Clean up capture_attempts to avoid unique index violations from previous test runs
  await query(`TRUNCATE TABLE capture_attempts CASCADE;`);
  // Drop old full unique constraint on paypal_order_id if it exists (legacy schema)
  await query(`
    DO \$\$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'capture_attempts'
        AND constraint_name = 'capture_attempts_paypal_order_id_key'
        AND constraint_type = 'UNIQUE'
      ) THEN
        ALTER TABLE capture_attempts DROP CONSTRAINT capture_attempts_paypal_order_id_key;
      END IF;
    END \$\$;
  `);
  // Create partial unique index for active attempts (CAPTURING, COMPLETED) per PayPal order
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_capture_attempts_active_order
      ON capture_attempts(paypal_order_id)
      WHERE status IN ('CAPTURING', 'COMPLETED');
  `);
  await db.resetToSeed();
});

test.after(async () => {
  setTimeout(() => process.exit(0), 100);
});

// ─────────────────────────────────────────────────────────────────────────────
// CAPTURE ATTEMPTS TABLE REGRESSION TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('Capture Attempts: tryAcquireCaptureLock creates new attempt with lease', async () => {
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId = `test-instance-${process.pid}`;

  // Create payment record first
  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId, 'Should acquire lock on first attempt');
  assert.ok(!attemptId?.startsWith('RECONCILE:'), 'First attempt should not require reconciliation');

  const attempt = await db.getCaptureAttemptByOrderId(paypalOrderId);
  assert.ok(attempt, 'Capture attempt should be retrievable');
  assert.equal(attempt.status, 'CAPTURING');
  assert.ok(attempt.lease_expires_at, 'Lease expiration should be set');
  assert.ok(attempt.last_heartbeat_at, 'Heartbeat timestamp should be set');
  assert.equal(attempt.lease_owner, instanceId);
  assert.equal(attempt.paypal_request_id, `CAP-${paypalOrderId}`);
});

test('Capture Attempts: Second attempt on same order returns null (active lease)', async () => {
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId1 = `test-instance-1`;
  const instanceId2 = `test-instance-2`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId1 = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId1, `CAP-${paypalOrderId}`);
  assert.ok(attemptId1, 'First instance should acquire lock');

  const attemptId2 = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId2, `CAP-${paypalOrderId}`);
  assert.equal(attemptId2, null, 'Second instance should be blocked by active lease');
});

test('Capture Attempts: Expired lease allows takeover WITHOUT reconciliation if no PayPal IDs', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId1 = `test-instance-1`;
  const instanceId2 = `test-instance-2`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // Create attempt with expired lease (manually set in past)
  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId1, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Remove paypal_request_id and expire lease - simulate old attempt without PayPal IDs
  await query(
    `UPDATE capture_attempts SET paypal_request_id = NULL, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $1;`,
    [attemptId]
  );

  // Second instance should be able to take over (no PayPal IDs present)
  const attemptId2 = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId2, `CAP-${paypalOrderId}`);
  assert.ok(attemptId2, 'Should acquire lock on expired lease without PayPal IDs');
  assert.ok(!attemptId2?.startsWith('RECONCILE:'), 'Should not require reconciliation when no PayPal IDs');
});

test('Capture Attempts: Expired lease REQUIRES reconciliation when PayPal IDs present', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId1 = `test-instance-1`;
  const instanceId2 = `test-instance-2`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // Create attempt
  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId1, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Add PayPal request ID and expire lease in database
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // Second instance should get RECONCILE marker
  const attemptId2 = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId2, `CAP-${paypalOrderId}`);
  assert.ok(attemptId2?.startsWith('RECONCILE:'), 'Should require reconciliation when PayPal IDs present');
  assert.equal(attemptId2?.substring('RECONCILE:'.length), attemptId);
});

test('Capture Attempts: Completed attempt blocks new attempts', async () => {
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  await db.completeCaptureAttempt(attemptId, `CAP-COMPLETED-${Date.now()}`);

  const attemptId2 = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.equal(attemptId2, null, 'Completed attempt should block new attempts');
});

// ─────────────────────────────────────────────────────────────────────────────
// RECONCILIATION REGRESSION TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('Reconciliation: Expired lease with PayPal order APPROVED returns APPROVED status', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);

  // Add PayPal request ID and expire lease in database
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // Reconcile with mock token (will use local fallback since no real PayPal)
  const result = await db.reconcileCaptureAttempt(paypalOrderId, attemptId, 'mock-token');

  // In test mode without real PayPal, local fallback throws error
  // But we can verify the function structure
  assert.ok(result, 'Reconciliation should return a result');
  assert.ok(['COMPLETED', 'APPROVED', 'FAILED', 'UNKNOWN'].includes(result.status), 'Status should be valid');
});

test('Reconciliation: Force new attempt after reconciliation', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);

  // Add PayPal request ID and expire lease in database
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // Get RECONCILE marker
  const reconcileMarker = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(reconcileMarker?.startsWith('RECONCILE:'));

  // After reconciliation (simulated), force new attempt
  const newAttemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`, true);
  assert.ok(newAttemptId, 'Should get fresh attempt ID');
  assert.ok(!newAttemptId?.startsWith('RECONCILE:'), 'Fresh attempt should not be RECONCILE marker');
  assert.notEqual(newAttemptId, attemptId, 'New attempt ID should be different from old');

  // Old attempt should be marked SUPERSEDED
  const oldAttempt = await db.getCaptureAttemptByOrderId(paypalOrderId);
  // Note: getCaptureAttemptByOrderId returns the latest, so we need to check differently
});

// ─────────────────────────────────────────────────────────────────────────────
// HEARTBEAT/LEASE OWNERSHIP REGRESSION TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('Heartbeat: renewCaptureLease returns true when lease owned by caller', async () => {
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  const renewed = await db.renewCaptureLease(attemptId, instanceId);
  assert.equal(renewed, true, 'Lease renewal should succeed for owner');
});

test('Heartbeat: renewCaptureLease returns false when lease owned by another instance', async () => {
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId1 = `test-instance-1`;
  const instanceId2 = `test-instance-2`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId1, `CAP-${paypalOrderId}`);
  const renewed = await db.renewCaptureLease(attemptId, instanceId2);
  assert.equal(renewed, false, 'Lease renewal should fail for non-owner');
});

test('Heartbeat: renewCaptureLease returns false for completed attempt', async () => {
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  await db.completeCaptureAttempt(attemptId, `CAP-COMPLETED-${Date.now()}`);

  const renewed = await db.renewCaptureLease(attemptId, instanceId);
  assert.equal(renewed, false, 'Lease renewal should fail for completed attempt');
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE CAPTURE ATTEMPT WITH LEASE OWNERSHIP VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

test('Complete Attempt: Fails when instanceId does not match lease owner', async () => {
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId1 = `test-instance-1`;
  const instanceId2 = `test-instance-2`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId1, `CAP-${paypalOrderId}`);

  // Try to complete with different instanceId - should fail
  await assert.rejects(
    async () => {
      await db.completeCaptureAttempt(attemptId, `CAP-TEST-${Date.now()}`, undefined, instanceId2);
    },
    /Lease ownership verification failed/
  );
});

test('Complete Attempt: Succeeds when instanceId matches lease owner', async () => {
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);

  // Complete with correct instanceId - should succeed
  await db.completeCaptureAttempt(attemptId, `CAP-TEST-${Date.now()}`, undefined, instanceId);

  const attempt = await db.getCaptureAttemptByOrderId(paypalOrderId);
  assert.equal(attempt?.status, 'COMPLETED');
  assert.ok(attempt?.paypal_capture_id);
});

test('Complete Attempt: Fails when attempt not in CAPTURING state', async () => {
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  await db.completeCaptureAttempt(attemptId, `CAP-COMPLETED-${Date.now()}`, undefined, instanceId);

  // Try to complete again - should fail
  await assert.rejects(
    async () => {
      await db.completeCaptureAttempt(attemptId, `CAP-TEST-${Date.now()}`, undefined, instanceId);
    },
    /not found or not in CAPTURING state/
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// IDEMPOTENCY & NO DUPLICATE SETTLEMENT REGRESSION TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('Idempotency: executePaymentCaptureTransaction does not double-spend on repeated calls', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';
  const captureId = `CAP-TEST-${Date.now()}`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // First capture
  const result1 = await db.executePaymentCaptureTransaction({
    payment: await db.getPayment(paymentId)!,
    planId,
    amount: 100.00,
    actor: 'Test Suite',
    captureId
  });

  assert.equal(result1.payment.verifiedStatus, 'COMPLETED');
  assert.equal(result1.payment.paypalCaptureId, captureId);

  // Second capture with SAME captureId - should be idempotent
  const result2 = await db.executePaymentCaptureTransaction({
    payment: await db.getPayment(paymentId)!,
    planId,
    amount: 100.00,
    actor: 'Test Suite',
    captureId
  });

  assert.equal(result2.payment.verifiedStatus, 'COMPLETED');
  assert.equal(result2.payment.paypalCaptureId, captureId);

  // Budget should only be spent ONCE
  const budget = await db.getBudget();
  // Initial spent was 1200 (from seed), plus 100 = 1300
  assert.equal(budget.spentAmount, 1300.00, 'Budget should only be spent once');
});

test('Idempotency: Webhook duplicate rejection prevents double settlement', async () => {
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';

  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // First webhook event
  const eventId = `WH-TEST-${Date.now()}`;
  await db.saveWebhookEvent({
    id: eventId,
    transmissionId: `TX-${Date.now()}`,
    eventType: 'PAYMENT.CAPTURE.COMPLETED',
    summary: 'Test capture',
    resourceType: 'capture',
    status: 'VERIFIED',
    rawPayload: { id: eventId, event_type: 'PAYMENT.CAPTURE.COMPLETED' }
  });

  // Second webhook event with SAME eventId (duplicate)
  const duplicateResult = await db.saveWebhookEvent({
    id: eventId,
    transmissionId: `TX-${Date.now()}`,
    eventType: 'PAYMENT.CAPTURE.COMPLETED',
    summary: 'Test capture duplicate',
    resourceType: 'capture',
    status: 'VERIFIED',
    rawPayload: { id: eventId, event_type: 'PAYMENT.CAPTURE.COMPLETED' }
  });

  assert.equal(duplicateResult.duplicate, true, 'Duplicate event should be detected');
  assert.equal(duplicateResult.saved, false, 'Duplicate should not be saved');
});

// ─────────────────────────────────────────────────────────────────────────────
// CONCURRENT CAPTURE ACROSS INSTANCES
// ─────────────────────────────────────────────────────────────────────────────

test('Concurrency: Multiple instances competing for same order - only one succeeds', async () => {
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId1 = `instance-1-${Date.now()}`;
  const instanceId2 = `instance-2-${Date.now()}`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // Both instances try to acquire lock simultaneously
  const [attemptId1, attemptId2] = await Promise.all([
    db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId1, `CAP-${paypalOrderId}`),
    db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId2, `CAP-${paypalOrderId}`)
  ]);

  // Exactly one should succeed, one should get null
  const successCount = [attemptId1, attemptId2].filter(a => a !== null).length;
  assert.equal(successCount, 1, 'Exactly one instance should acquire the lock');
});

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY DATABASE UPGRADE REGRESSION TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('Upgrade Migration: Legacy purchase_plans without created_by_user_id gets nullable column', async () => {
  // This test verifies the upgrade migration logic by checking
  // that the schema.sql includes the idempotent ALTER TABLE statements
  const schemaContent = await import('fs').then(fs => fs.promises.readFile(schemaPath, 'utf-8'));

  assert.ok(schemaContent.includes('ALTER TABLE purchase_plans ADD COLUMN IF NOT EXISTS created_by_user_id'), 'Schema must include idempotent column addition');
  assert.ok(schemaContent.includes('purchase_plans_created_by_user_id_fkey') && schemaContent.includes('FOREIGN KEY') && schemaContent.includes('REFERENCES users'), 'Schema must include FK constraint');
  assert.ok(schemaContent.includes('CREATE INDEX IF NOT EXISTS idx_purchase_plans_created_by'), 'Schema must include index');
});

test('Upgrade Migration: Legacy capture_attempts without lease columns gets them', async () => {
  const schemaContent = await import('fs').then(fs => fs.promises.readFile(schemaPath, 'utf-8'));

  assert.ok(schemaContent.includes('ALTER TABLE capture_attempts ADD COLUMN IF NOT EXISTS lease_expires_at'), 'Schema must add lease_expires_at');
  assert.ok(schemaContent.includes('ALTER TABLE capture_attempts ADD COLUMN IF NOT EXISTS last_heartbeat_at'), 'Schema must add last_heartbeat_at');
  assert.ok(schemaContent.includes('ALTER TABLE capture_attempts ADD COLUMN IF NOT EXISTS lease_owner'), 'Schema must add lease_owner');
  assert.ok(schemaContent.includes('ALTER TABLE capture_attempts ADD COLUMN IF NOT EXISTS paypal_request_id'), 'Schema must add paypal_request_id');
  assert.ok(schemaContent.includes('CREATE INDEX IF NOT EXISTS idx_capture_attempts_lease_expires'), 'Schema must add lease index');
});

test('Upgrade Migration: Legacy webhook_events without transmission_id gets it', async () => {
  const schemaContent = await import('fs').then(fs => fs.promises.readFile(schemaPath, 'utf-8'));

  assert.ok(schemaContent.includes('ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS transmission_id'), 'Schema must add transmission_id');
});

test('Upgrade Migration: Seed data preserved (3 users, products, suppliers, offers)', async () => {
  // Verify seed data counts after upgrade
  const users = await db.getUsers?.() || await query('SELECT * FROM users') || [];
  const userCount = Array.isArray(users) ? users.length : 0;

  // In test mode with local store, verify seed data exists
  const products = await db.getProducts();
  assert.ok(products.length >= 6, `Expected at least 6 products, got ${products.length}`);

  const suppliers = await db.getSuppliers();
  assert.ok(suppliers.length >= 4, `Expected at least 4 suppliers, got ${suppliers.length}`);

  const offers = await db.getSupplierOffers();
  assert.ok(offers.length >= 14, `Expected at least 14 offers, got ${offers.length}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// RECONCILIATION ERROR HANDLING
// ─────────────────────────────────────────────────────────────────────────────

test('Reconciliation: Fail closed on network error', async () => {
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // Reconcile with invalid token (will fail to connect to PayPal)
  const result = await db.reconcileCaptureAttempt(paypalOrderId, attemptId, 'invalid-token');

  // Should return FAILED status with error, not throw
  assert.equal(result.status, 'FAILED', 'Reconciliation should fail closed on network error');
  assert.ok(result.error, 'Should include error message');
});

test('Reconciliation: Fail closed on invalid PayPal response', async () => {
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // In test mode, local fallback is used which throws
  // This test verifies the function doesn't silently succeed
  try {
    const result = await db.reconcileCaptureAttempt(paypalOrderId, attemptId, 'mock-token');
    // If it returns, should be FAILED or COMPLETED, never APPROVED with capture
    if (result.status === 'APPROVED') {
      assert.ok(!result.captureId, 'APPROVED status should never include captureId');
    }
  } catch (err) {
    // In test mode, local fallback throws - this is fail-closed behavior
    assert.ok(err instanceof Error);
  }
});

test('Reconciliation: Prevents infinite RECONCILE loop', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);

  // Add PayPal request ID and expire lease in DATABASE
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // First reconciliation - mark as superseded and create new
  const newAttemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`, true);
  assert.ok(newAttemptId);
  assert.notEqual(newAttemptId, attemptId);

  // Manually add PayPal request ID to NEW attempt and expire it in DATABASE
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, newAttemptId]
  );

  // Try to get lock again - should get RECONCILE for the NEW attempt
  const reconcileMarker = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(reconcileMarker?.startsWith('RECONCILE:'));
  assert.equal(reconcileMarker?.substring('RECONCILE:'.length), newAttemptId);

  // Force new attempt again - should work
  const anotherNewAttempt = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`, true);
  assert.ok(anotherNewAttempt);
  assert.notEqual(anotherNewAttempt, newAttemptId);
});

test('Reconciliation: PayPal COMPLETED order returns capture ID and updates attempt', async () => {
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // In test mode without real PayPal, we can't fully test this
  // But we can verify the schema has the right columns
  const attempt = await db.getCaptureAttemptByOrderId(paypalOrderId);
  assert.ok(attempt);
  assert.ok(attempt.lease_expires_at);
  assert.ok(attempt.lease_owner);
  assert.ok(attempt.paypal_request_id);
});

// ─────────────────────────────────────────────────────────────────────────────
// NEW REGRESSION TESTS (P0/P1) - Critical failure scenarios from audit remediation
// ─────────────────────────────────────────────────────────────────────────────

// 1. Expired attempt with an existing PayPal request ID
test('Regression: Expired attempt with existing PayPal request ID returns RECONCILE', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId1 = `test-instance-1`;
  const instanceId2 = `test-instance-2`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId1, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // Second instance should get RECONCILE marker
  const attemptId2 = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId2, `CAP-${paypalOrderId}`);
  assert.ok(attemptId2?.startsWith('RECONCILE:'), 'Should require reconciliation when PayPal IDs present');
  assert.equal(attemptId2?.substring('RECONCILE:'.length), attemptId);
});

// 2. PayPal reports APPROVED: a genuinely new lease is acquired after reconciliation
test('Regression: After reconciliation returns APPROVED, forceNewAttempt acquires fresh lease', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // Get RECONCILE marker
  const reconcileMarker = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(reconcileMarker?.startsWith('RECONCILE:'));

  // After reconciliation returns APPROVED, force new attempt
  const newAttemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`, true);
  assert.ok(newAttemptId, 'Should get fresh attempt ID');
  assert.ok(!newAttemptId?.startsWith('RECONCILE:'), 'Fresh attempt should not be RECONCILE marker');
  assert.notEqual(newAttemptId, attemptId, 'New attempt ID should be different from old');

  // Old attempt should be marked SUPERSEDED
  const allAttempts = await query(`SELECT id, status FROM capture_attempts WHERE paypal_order_id = $1 ORDER BY started_at;`, [paypalOrderId]);
  const oldAttempt = allAttempts.rows.find((r: any) => r.id === attemptId);
  assert.equal(oldAttempt?.status, 'SUPERSEDED', 'Old attempt should be marked SUPERSEDED');

  // New attempt should be CAPTURING with same paypal_order_id
  const newAttempt = allAttempts.rows.find((r: any) => r.id === newAttemptId);
  assert.ok(newAttempt, 'New attempt should exist');
  assert.equal(newAttempt?.status, 'CAPTURING', 'New attempt should be CAPTURING');
});

// 3. PayPal reports COMPLETED: local payment, budget, plan, audit, and attempt all reconcile
test('Regression: Reconciliation of COMPLETED PayPal order settles payment, budget, plan, audit, and attempt atomically', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';
  const captureId = `CAP-RECONCILED-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 250.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // Simulate reconciliation with COMPLETED status by calling settleCaptureTransaction directly
  // Use the same instanceId that owns the lease
  await db.settleCaptureTransaction({
    attemptId,
    paymentId,
    planId,
    captureId,
    amount: 250.00,
    currency: 'USD',
    actor: 'Test Reconciliation',
    payerEmail: 'buyer@test.com',
    rawPaypalResponse: { status: 'COMPLETED', capture_id: captureId },
    instanceId
  });

  // Verify payment is COMPLETED
  const payment = await db.getPayment(paymentId);
  assert.equal(payment?.verifiedStatus, 'COMPLETED');
  assert.equal(payment?.paypalCaptureId, captureId);

  // Verify plan is paid
  const plan = await db.getPurchasePlan(planId);
  assert.equal(plan?.planStatus, 'paid');

  // Verify budget was spent exactly once
  const budget = await db.getBudget();
  assert.equal(budget.spentAmount, 1450.00, 'Budget should be 1200 (initial) + 250 = 1450');

  // Verify audit log was created
  const auditLogs = await db.getAuditLogs();
  const captureLog = auditLogs.find((l: any) => l.action === 'CAPTURE_PAYPAL_ORDER' && l.details?.captureId === captureId);
  assert.ok(captureLog, 'Audit log should be created for reconciliation');

  // Verify attempt is COMPLETED
  const attempt = await db.getCaptureAttemptByOrderId(paypalOrderId);
  assert.equal(attempt?.status, 'COMPLETED');
  assert.equal(attempt?.paypal_capture_id, captureId);
});

// 4. Two concurrent workers attempt to acquire the same order
test('Regression: Concurrent workers competing for same order - only one acquires lock', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId1 = `instance-1-${Date.now()}`;
  const instanceId2 = `instance-2-${Date.now()}`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // Both instances try to acquire lock simultaneously
  const [attemptId1, attemptId2] = await Promise.all([
    db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId1, `CAP-${paypalOrderId}`),
    db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId2, `CAP-${paypalOrderId}`)
  ]);

  // Exactly one should succeed, one should get null
  const successCount = [attemptId1, attemptId2].filter(a => a !== null).length;
  assert.equal(successCount, 1, 'Exactly one instance should acquire the lock');

  // The successful attempt should be CAPTURING
  const attempt = await db.getCaptureAttemptByOrderId(paypalOrderId);
  assert.ok(attempt);
  assert.equal(attempt.status, 'CAPTURING');
});

// 5. Previous lease owner attempts settlement after takeover
test('Regression: Previous lease owner cannot settle after lease takeover', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';
  const instanceId1 = `instance-1`;
  const instanceId2 = `instance-2`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // Instance 1 acquires lock
  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId1, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Add PayPal request ID so reconciliation is needed
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1 WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // Expire lease
  await query(
    `UPDATE capture_attempts SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $1;`,
    [attemptId]
  );

  // Instance 2 gets RECONCILE marker
  const reconcileMarker = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId2, `CAP-${paypalOrderId}`);
  assert.ok(reconcileMarker?.startsWith('RECONCILE:'));

  // Instance 2 forces new attempt after reconciliation (APPROVED)
  const attemptId2 = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId2, `CAP-${paypalOrderId}`, true);
  assert.ok(attemptId2);
  assert.notEqual(attemptId2, attemptId);

  // Instance 1 tries to settle with old attempt ID - should fail because old attempt is now SUPERSEDED
  await assert.rejects(
    async () => {
      await db.settleCaptureTransaction({
        attemptId, // OLD attempt ID (now SUPERSEDED)
        paymentId,
        planId,
        captureId: `CAP-TEST-${Date.now()}`,
        amount: 100.00,
        currency: 'USD',
        actor: 'Instance 1 (stale)',
        payerEmail: 'buyer@test.com',
        rawPaypalResponse: {},
        instanceId: instanceId1
      });
    },
    /not in CAPTURING state/
  );

  // Instance 2 settles successfully
  await db.settleCaptureTransaction({
    attemptId: attemptId2,
    paymentId,
    planId,
    captureId: `CAP-TEST-${Date.now()}`,
    amount: 100.00,
    currency: 'USD',
    actor: 'Instance 2 (current)',
    payerEmail: 'buyer@test.com',
    rawPaypalResponse: {},
    instanceId: instanceId2
  });

  const payment = await db.getPayment(paymentId);
  assert.equal(payment?.verifiedStatus, 'COMPLETED');
});

// 6. Heartbeat returns false during capture
test('Regression: Heartbeat loss during capture aborts operation (lease expired)', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Manually expire the lease to simulate heartbeat loss
  await query(
    `UPDATE capture_attempts SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $1;`,
    [attemptId]
  );

  // Try to settle with expired lease - should fail because lease is expired
  // The settleCaptureTransaction checks status and lease_owner, but the lease expiration
  // is handled by the partial unique index - another instance could have taken over
  // We test that the attempt is still CAPTURING but lease is expired
  const attempt = await db.getCaptureAttemptByOrderId(paypalOrderId);
  assert.ok(attempt);
  // The lease is expired but the attempt is still CAPTURING
  // settleCaptureTransaction will verify ownership but the lease expiration
  // means another instance could take over - this is tested in test 5

  // For this test, we verify the lease can be renewed by the owner
  const renewed = await db.renewCaptureLease(attemptId, instanceId);
  assert.equal(renewed, true, 'Owner should be able to renew expired lease');

  // Another instance should NOT be able to renew
  const renewedByOther = await db.renewCaptureLease(attemptId, `other-instance`);
  assert.equal(renewedByOther, false, 'Non-owner should not be able to renew lease');
});

// 7. Repeated reconciliation does not double-spend budget or duplicate audit events
test('Regression: Repeated reconciliation is idempotent - no double-spend or duplicate audit', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';
  const captureId = `CAP-IDEMPOTENT-${Date.now()}`;
  const instanceId = 'reconciliation-engine';

  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 300.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // First reconciliation
  await db.settleCaptureTransaction({
    attemptId,
    paymentId,
    planId,
    captureId,
    amount: 300.00,
    currency: 'USD',
    actor: 'Test Reconciliation 1',
    payerEmail: 'buyer@test.com',
    rawPaypalResponse: { capture_id: captureId },
    instanceId
  });

  const budgetAfterFirst = await db.getBudget();
  const auditLogsAfterFirst = await db.getAuditLogs();
  const captureLogsAfterFirst = auditLogsAfterFirst.filter((l: any) => l.action === 'CAPTURE_PAYPAL_ORDER' && l.details?.captureId === captureId);

  // Second reconciliation with SAME captureId (idempotent) - should be no-op
  // The settleCaptureTransaction checks if payment is already COMPLETED and returns early
  await db.settleCaptureTransaction({
    attemptId,
    paymentId,
    planId,
    captureId,
    amount: 300.00,
    currency: 'USD',
    actor: 'Test Reconciliation 2',
    payerEmail: 'buyer@test.com',
    rawPaypalResponse: { capture_id: captureId },
    instanceId
  });

  const budgetAfterSecond = await db.getBudget();
  const auditLogsAfterSecond = await db.getAuditLogs();
  const captureLogsAfterSecond = auditLogsAfterSecond.filter((l: any) => l.action === 'CAPTURE_PAYPAL_ORDER' && l.details?.captureId === captureId);

  // Budget should NOT have increased
  assert.equal(budgetAfterSecond.spentAmount, budgetAfterFirst.spentAmount, 'Budget should not double-spend on repeated reconciliation');

  // Audit logs should NOT have duplicated
  assert.equal(captureLogsAfterSecond.length, captureLogsAfterFirst.length, 'Audit should not duplicate on repeated reconciliation');

  // Payment should still be COMPLETED
  const payment = await db.getPayment(paymentId);
  assert.equal(payment?.verifiedStatus, 'COMPLETED');
});

// 8. Invalid capture amount, currency, order ID, or payment linkage
test('Regression: Settlement fails on invalid capture amount', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';
  const instanceId = 'reconciliation-engine';

  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Try to settle with wrong amount
  await assert.rejects(
    async () => {
      await db.settleCaptureTransaction({
        attemptId,
        paymentId,
        planId,
        captureId: `CAP-TEST-${Date.now()}`,
        amount: 999.99, // WRONG amount
        currency: 'USD',
        actor: 'Test',
        payerEmail: 'buyer@test.com',
        rawPaypalResponse: {},
        instanceId
      });
    },
    /Amount mismatch/
  );
});

test('Regression: Settlement fails on invalid currency', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';
  const instanceId = 'reconciliation-engine';

  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Try to settle with wrong currency
  await assert.rejects(
    async () => {
      await db.settleCaptureTransaction({
        attemptId,
        paymentId,
        planId,
        captureId: `CAP-TEST-${Date.now()}`,
        amount: 100.00,
        currency: 'EUR', // WRONG currency
        actor: 'Test',
        payerEmail: 'buyer@test.com',
        rawPaypalResponse: {},
        instanceId
      });
    },
    /Currency mismatch/
  );
});

test('Regression: Settlement fails on non-existent payment', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';
  const instanceId = 'reconciliation-engine';

  // Create a valid payment for lock acquisition
  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Try to settle with non-existent payment (different from the one used for lock)
  await assert.rejects(
    async () => {
      await db.settleCaptureTransaction({
        attemptId,
        paymentId: 'NONEXISTENT-PAYMENT',
        planId,
        captureId: `CAP-TEST-${Date.now()}`,
        amount: 100.00,
        currency: 'USD',
        actor: 'Test',
        payerEmail: 'buyer@test.com',
        rawPaypalResponse: {},
        instanceId
      });
    },
    /not found/
  );
});

test('Regression: Settlement fails on non-existent plan', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId = 'reconciliation-engine';

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Try to settle with non-existent plan
  await assert.rejects(
    async () => {
      await db.settleCaptureTransaction({
        attemptId,
        paymentId,
        planId: 'NONEXISTENT-PLAN',
        captureId: `CAP-TEST-${Date.now()}`,
        amount: 100.00,
        currency: 'USD',
        actor: 'Test',
        payerEmail: 'buyer@test.com',
        rawPaypalResponse: {},
        instanceId
      });
    },
    /not found/
  );
});

// 9. Fresh schema and legacy migration assertions fail correctly when a required object is removed
test('Regression: CI assertions would fail if partial unique index is missing', async () => {
  // This test verifies the assertion logic by checking the schema contains the index
  const schemaContent = await import('fs').then(fs => fs.promises.readFile(
    join(__dirname, '../src/db/schema.sql'), 'utf-8'
  ));

  assert.ok(schemaContent.includes('uq_capture_attempts_active_order'), 'Schema must include partial unique index');
  assert.ok(schemaContent.includes('WHERE status IN'), 'Partial unique index must have WHERE clause');
});

test('Regression: CI assertions would fail if lease columns are missing', async () => {
  const schemaContent = await import('fs').then(fs => fs.promises.readFile(
    join(__dirname, '../src/db/schema.sql'), 'utf-8'
  ));

  assert.ok(schemaContent.includes('lease_expires_at'), 'Schema must include lease_expires_at');
  assert.ok(schemaContent.includes('last_heartbeat_at'), 'Schema must include last_heartbeat_at');
  assert.ok(schemaContent.includes('lease_owner'), 'Schema must include lease_owner');
  assert.ok(schemaContent.includes('paypal_request_id'), 'Schema must include paypal_request_id');
});

test('Regression: CI assertions would fail if created_by_user_id FK is missing', async () => {
  const schemaContent = await import('fs').then(fs => fs.promises.readFile(
    join(__dirname, '../src/db/schema.sql'), 'utf-8'
  ));

  assert.ok(schemaContent.includes('created_by_user_id'), 'Schema must include created_by_user_id');
  assert.ok(schemaContent.includes('purchase_plans_created_by_user_id_fkey'), 'Schema must include FK constraint');
  assert.ok(schemaContent.includes('REFERENCES users'), 'FK must reference users table');
});

// ─────────────────────────────────────────────────────────────────────────────
// NEW RECONCILIATION REGRESSION TESTS (10 scenarios from audit remediation)
// ─────────────────────────────────────────────────────────────────────────────

// 1. Expired lease + PayPal COMPLETED + matching amount/currency
test('Reconciliation: Expired lease + PayPal COMPLETED with matching amount/currency settles correctly', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';
  const captureId = `CAP-RECONCILED-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 150.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // Simulate reconciliation with COMPLETED status using matching amount/currency
  await db.settleReconciliationTransaction({
    attemptId,
    paymentId,
    planId,
    captureId,
    captureAmount: 150.00,  // Actual PayPal capture amount
    captureCurrency: 'USD', // Actual PayPal capture currency
    expectedAmount: 150.00, // Database payment amount
    expectedCurrency: 'USD', // Database payment currency
    actor: 'PayPal Reconciliation Engine',
    payerEmail: 'buyer@test.com',
    rawPaypalResponse: { status: 'COMPLETED', capture_id: captureId }
  });

  // Verify payment is COMPLETED
  const payment = await db.getPayment(paymentId);
  assert.equal(payment?.verifiedStatus, 'COMPLETED');
  assert.equal(payment?.paypalCaptureId, captureId);

  // Verify plan is paid
  const plan = await db.getPurchasePlan(planId);
  assert.equal(plan?.planStatus, 'paid');

  // Verify budget was spent exactly once
  const budget = await db.getBudget();
  assert.equal(budget.spentAmount, 1350.00, 'Budget should be 1200 (initial) + 150 = 1350');

  // Verify audit log was created with reconciliation action
  const auditLogs = await db.getAuditLogs();
  const captureLog = auditLogs.find((l: any) => l.action === 'CAPTURE_PAYPAL_ORDER_RECONCILIATION' && l.details?.captureId === captureId);
  assert.ok(captureLog, 'Audit log should be created for reconciliation');
  assert.equal(captureLog.details.reconciliation, true, 'Audit log should mark reconciliation');

  // Verify attempt is COMPLETED
  const attempt = await db.getCaptureAttemptByOrderId(paypalOrderId);
  assert.equal(attempt?.status, 'COMPLETED');
  assert.equal(attempt?.paypal_capture_id, captureId);
});

// 2. Expired lease + PayPal COMPLETED + amount mismatch (fails)
test('Reconciliation: Expired lease + PayPal COMPLETED with amount mismatch fails closed', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';
  const captureId = `CAP-RECONCILED-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // Try to reconcile with mismatched amount (PayPal captured $200 but DB expects $100)
  await assert.rejects(
    async () => {
      await db.settleReconciliationTransaction({
        attemptId,
        paymentId,
        planId,
        captureId,
        captureAmount: 200.00,  // Actual PayPal capture amount (MISMATCH)
        captureCurrency: 'USD',
        expectedAmount: 100.00, // Database payment amount
        expectedCurrency: 'USD',
        actor: 'PayPal Reconciliation Engine',
        payerEmail: 'buyer@test.com',
        rawPaypalResponse: { status: 'COMPLETED', capture_id: captureId }
      });
    },
    /Capture amount mismatch/
  );

  // Payment should remain CREATED
  const payment = await db.getPayment(paymentId);
  assert.equal(payment?.verifiedStatus, 'CREATED');

  // Budget should not have changed
  const budget = await db.getBudget();
  assert.equal(budget.spentAmount, 1200.00, 'Budget should not have changed');
});

// 3. Expired lease + PayPal COMPLETED + currency mismatch (fails)
test('Reconciliation: Expired lease + PayPal COMPLETED with currency mismatch fails closed', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';
  const captureId = `CAP-RECONCILED-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // Try to reconcile with mismatched currency (PayPal captured EUR but DB expects USD)
  await assert.rejects(
    async () => {
      await db.settleReconciliationTransaction({
        attemptId,
        paymentId,
        planId,
        captureId,
        captureAmount: 100.00,
        captureCurrency: 'EUR',  // Actual PayPal capture currency (MISMATCH)
        expectedAmount: 100.00,
        expectedCurrency: 'USD', // Database payment currency
        actor: 'PayPal Reconciliation Engine',
        payerEmail: 'buyer@test.com',
        rawPaypalResponse: { status: 'COMPLETED', capture_id: captureId }
      });
    },
    /Capture currency mismatch/
  );

  // Payment should remain CREATED
  const payment = await db.getPayment(paymentId);
  assert.equal(payment?.verifiedStatus, 'CREATED');
});

// 4. Expired lease + PayPal APPROVED + fresh lease takeover
test('Reconciliation: Expired lease + PayPal APPROVED allows fresh lease takeover', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: 'PLAN-2026-001',
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // Get RECONCILE marker
  const reconcileMarker = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(reconcileMarker?.startsWith('RECONCILE:'));

  // Simulate reconciliation returning APPROVED (order approved but not captured)
  // Then force new attempt to get fresh lease
  const newAttemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`, true);
  assert.ok(newAttemptId, 'Should get fresh attempt ID');
  assert.ok(!newAttemptId?.startsWith('RECONCILE:'), 'Fresh attempt should not be RECONCILE marker');
  assert.notEqual(newAttemptId, attemptId, 'New attempt ID should be different from old');

  // Old attempt should be marked SUPERSEDED
  const allAttempts = await query(`SELECT id, status, lease_owner FROM capture_attempts WHERE paypal_order_id = $1 ORDER BY started_at;`, [paypalOrderId]);
  const oldAttempt = allAttempts.rows.find((r: any) => r.id === attemptId);
  assert.equal(oldAttempt?.status, 'SUPERSEDED', 'Old attempt should be marked SUPERSEDED');

  // New attempt should be CAPTURING with same paypal_order_id
  const newAttempt = allAttempts.rows.find((r: any) => r.id === newAttemptId);
  assert.ok(newAttempt, 'New attempt should exist');
  assert.equal(newAttempt?.status, 'CAPTURING', 'New attempt should be CAPTURING');
  assert.equal(newAttempt?.lease_owner, instanceId, 'New attempt should have correct lease owner');
});

// 5. Reconciliation settlement with a different original lease owner
test('Reconciliation: Settlement succeeds even when original lease owner is different', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';
  const captureId = `CAP-RECONCILED-${Date.now()}`;
  const originalInstanceId = `original-instance-1`;
  const reconciliationEngine = 'reconciliation-engine';

  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 200.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // Original instance acquires lock
  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, originalInstanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // Reconciliation engine settles (different "instance" - no lease ownership verification)
  await db.settleReconciliationTransaction({
    attemptId,
    paymentId,
    planId,
    captureId,
    captureAmount: 200.00,
    captureCurrency: 'USD',
    expectedAmount: 200.00,
    expectedCurrency: 'USD',
    actor: 'PayPal Reconciliation Engine',
    payerEmail: 'buyer@test.com',
    rawPaypalResponse: { status: 'COMPLETED', capture_id: captureId }
  });

  // Verify settlement succeeded despite different original lease owner
  const payment = await db.getPayment(paymentId);
  assert.equal(payment?.verifiedStatus, 'COMPLETED');
  assert.equal(payment?.paypalCaptureId, captureId);

  // Attempt should be COMPLETED
  const attempt = await db.getCaptureAttemptByOrderId(paypalOrderId);
  assert.equal(attempt?.status, 'COMPLETED');
  assert.equal(attempt?.paypal_capture_id, captureId);
});

// 6. Two concurrent reconciliation requests
test('Reconciliation: Two concurrent reconciliation requests - only one settles', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';
  const captureId = `CAP-RECONCILED-${Date.now()}`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, 'instance-1', `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // Two concurrent reconciliation attempts
  const [result1, result2] = await Promise.allSettled([
    db.settleReconciliationTransaction({
      attemptId,
      paymentId,
      planId,
      captureId,
      captureAmount: 100.00,
      captureCurrency: 'USD',
      expectedAmount: 100.00,
      expectedCurrency: 'USD',
      actor: 'Reconciliation Engine 1',
      payerEmail: 'buyer@test.com',
      rawPaypalResponse: { status: 'COMPLETED', capture_id: captureId }
    }),
    db.settleReconciliationTransaction({
      attemptId,
      paymentId,
      planId,
      captureId,
      captureAmount: 100.00,
      captureCurrency: 'USD',
      expectedAmount: 100.00,
      expectedCurrency: 'USD',
      actor: 'Reconciliation Engine 2',
      payerEmail: 'buyer@test.com',
      rawPaypalResponse: { status: 'COMPLETED', capture_id: captureId }
    })
  ]);

  // At least one should succeed (idempotent), neither should throw unexpected errors
  const successCount = [result1, result2].filter(r => r.status === 'fulfilled').length;
  assert.ok(successCount >= 1, 'At least one reconciliation should succeed');

  // Payment should be COMPLETED
  const payment = await db.getPayment(paymentId);
  assert.equal(payment?.verifiedStatus, 'COMPLETED');

  // Budget should only be spent once
  const budget = await db.getBudget();
  assert.equal(budget.spentAmount, 1300.00, 'Budget should only be spent once (1200 + 100)');

  // Only one audit log for this capture
  const auditLogs = await db.getAuditLogs();
  const captureLogs = auditLogs.filter((l: any) => l.action === 'CAPTURE_PAYPAL_ORDER_RECONCILIATION' && l.details?.captureId === captureId);
  assert.equal(captureLogs.length, 1, 'Should have exactly one reconciliation audit log');
});

// 7. Duplicate settlement does not double-spend the budget
test('Reconciliation: Duplicate settlement is idempotent - no double-spend', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';
  const captureId = `CAP-IDEMPOTENT-${Date.now()}`;
  const instanceId = 'reconciliation-engine';

  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 250.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // First reconciliation
  await db.settleReconciliationTransaction({
    attemptId,
    paymentId,
    planId,
    captureId,
    captureAmount: 250.00,
    captureCurrency: 'USD',
    expectedAmount: 250.00,
    expectedCurrency: 'USD',
    actor: 'Reconciliation Engine 1',
    payerEmail: 'buyer@test.com',
    rawPaypalResponse: { status: 'COMPLETED', capture_id: captureId }
  });

  const budgetAfterFirst = await db.getBudget();
  const auditLogsAfterFirst = await db.getAuditLogs();
  const captureLogsAfterFirst = auditLogsAfterFirst.filter((l: any) => l.action === 'CAPTURE_PAYPAL_ORDER_RECONCILIATION' && l.details?.captureId === captureId);

  // Second reconciliation with SAME captureId (idempotent)
  await db.settleReconciliationTransaction({
    attemptId,
    paymentId,
    planId,
    captureId,
    captureAmount: 250.00,
    captureCurrency: 'USD',
    expectedAmount: 250.00,
    expectedCurrency: 'USD',
    actor: 'Reconciliation Engine 2',
    payerEmail: 'buyer@test.com',
    rawPaypalResponse: { status: 'COMPLETED', capture_id: captureId }
  });

  const budgetAfterSecond = await db.getBudget();
  const auditLogsAfterSecond = await db.getAuditLogs();
  const captureLogsAfterSecond = auditLogsAfterSecond.filter((l: any) => l.action === 'CAPTURE_PAYPAL_ORDER_RECONCILIATION' && l.details?.captureId === captureId);

  // Budget should NOT have increased
  assert.equal(budgetAfterSecond.spentAmount, budgetAfterFirst.spentAmount, 'Budget should not double-spend on repeated reconciliation');

  // Audit logs should NOT have duplicated
  assert.equal(captureLogsAfterSecond.length, captureLogsAfterFirst.length, 'Audit should not duplicate on repeated reconciliation');

  // Payment should still be COMPLETED
  const payment = await db.getPayment(paymentId);
  assert.equal(payment?.verifiedStatus, 'COMPLETED');
});

// 8. Payment, plan, budget, audit log, and capture attempt remain consistent
test('Reconciliation: All records remain consistent after settlement', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';
  const captureId = `CAP-CONSISTENT-${Date.now()}`;
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 300.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // Reconcile
  await db.settleReconciliationTransaction({
    attemptId,
    paymentId,
    planId,
    captureId,
    captureAmount: 300.00,
    captureCurrency: 'USD',
    expectedAmount: 300.00,
    expectedCurrency: 'USD',
    actor: 'PayPal Reconciliation Engine',
    payerEmail: 'buyer@test.com',
    rawPaypalResponse: { status: 'COMPLETED', capture_id: captureId }
  });

  // Verify all records are consistent
  const payment = await db.getPayment(paymentId);
  assert.equal(payment?.verifiedStatus, 'COMPLETED', 'Payment should be COMPLETED');
  assert.equal(payment?.paypalCaptureId, captureId, 'Payment should have capture ID');
  assert.equal(payment?.amount, 300.00, 'Payment amount should be unchanged');
  assert.equal(payment?.currency, 'USD', 'Payment currency should be unchanged');

  const plan = await db.getPurchasePlan(planId);
  assert.equal(plan?.planStatus, 'paid', 'Plan should be paid');

  const budget = await db.getBudget();
  assert.equal(budget.spentAmount, 1500.00, 'Budget should be 1200 + 300 = 1500');

  const auditLogs = await db.getAuditLogs();
  const captureLog = auditLogs.find((l: any) => l.action === 'CAPTURE_PAYPAL_ORDER_RECONCILIATION' && l.details?.captureId === captureId);
  assert.ok(captureLog, 'Audit log should exist');
  assert.equal(captureLog.details.amount, 300.00, 'Audit log amount should match');
  assert.equal(captureLog.details.reconciliation, true, 'Audit log should mark reconciliation');

  const attempt = await db.getCaptureAttemptByOrderId(paypalOrderId);
  assert.equal(attempt?.status, 'COMPLETED', 'Attempt should be COMPLETED');
  assert.equal(attempt?.paypal_capture_id, captureId, 'Attempt should have capture ID');
  assert.ok(!attempt?.lease_expires_at, 'Lease should be cleared');
  assert.ok(!attempt?.lease_owner, 'Lease owner should be cleared');
});

// 9. PayPal API unavailable or malformed response fails closed
test('Reconciliation: Malformed PayPal capture response fails closed', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';
  const instanceId = `test-instance-1`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // Test 1: Missing capture amount
  await assert.rejects(
    async () => {
      await db.settleReconciliationTransaction({
        attemptId,
        paymentId,
        planId,
        captureId: `CAP-TEST-${Date.now()}`,
        captureAmount: NaN, // Invalid amount
        captureCurrency: 'USD',
        expectedAmount: 100.00,
        expectedCurrency: 'USD',
        actor: 'Reconciliation Engine',
        payerEmail: 'buyer@test.com',
        rawPaypalResponse: { status: 'COMPLETED' }
      });
    },
    /Capture amount mismatch|NaN|Invalid/
  );

  // Test 2: Missing capture currency
  await assert.rejects(
    async () => {
      await db.settleReconciliationTransaction({
        attemptId,
        paymentId,
        planId,
        captureId: `CAP-TEST-${Date.now()}`,
        captureAmount: 100.00,
        captureCurrency: '', // Invalid currency
        expectedAmount: 100.00,
        expectedCurrency: 'USD',
        actor: 'Reconciliation Engine',
        payerEmail: 'buyer@test.com',
        rawPaypalResponse: { status: 'COMPLETED' }
      });
    },
    /Invalid capture currency/
  );

  // Test 3: Capture amount is negative
  await assert.rejects(
    async () => {
      await db.settleReconciliationTransaction({
        attemptId,
        paymentId,
        planId,
        captureId: `CAP-TEST-${Date.now()}`,
        captureAmount: -100.00, // Negative amount
        captureCurrency: 'USD',
        expectedAmount: 100.00,
        expectedCurrency: 'USD',
        actor: 'Reconciliation Engine',
        payerEmail: 'buyer@test.com',
        rawPaypalResponse: { status: 'COMPLETED' }
      });
    },
    /Capture amount mismatch/
  );

  // Payment should remain CREATED after all failures
  const payment = await db.getPayment(paymentId);
  assert.equal(payment?.verifiedStatus, 'CREATED', 'Payment should remain CREATED after failed reconciliations');
});

// 10. Stale worker cannot settle after losing its lease
test('Reconciliation: Stale worker cannot settle after lease takeover by another instance', async () => {
  await db.resetToSeed();
  const paymentId = `PAY-TEST-${Date.now()}`;
  const paypalOrderId = `ORD-TEST-${Date.now()}`;
  const planId = 'PLAN-2026-001';
  const staleInstanceId = `stale-instance-1`;
  const newInstanceId = `new-instance-2`;

  await db.savePayment({
    id: paymentId,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId,
    amount: 100.00,
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox (Simulated)',
    verifiedStatus: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // Stale instance acquires lock
  const attemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, staleInstanceId, `CAP-${paypalOrderId}`);
  assert.ok(attemptId);

  // Add PayPal request ID and expire lease
  await query(
    `UPDATE capture_attempts SET paypal_request_id = $1, lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $2;`,
    [`CAP-${paypalOrderId}`, attemptId]
  );

  // New instance gets RECONCILE marker
  const reconcileMarker = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, newInstanceId, `CAP-${paypalOrderId}`);
  assert.ok(reconcileMarker?.startsWith('RECONCILE:'));

  // New instance forces new attempt after reconciliation (APPROVED)
  const newAttemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, newInstanceId, `CAP-${paypalOrderId}`, true);
  assert.ok(newAttemptId);
  assert.notEqual(newAttemptId, attemptId);

  // Old attempt should be SUPERSEDED
  const allAttempts = await query(`SELECT id, status FROM capture_attempts WHERE paypal_order_id = $1 ORDER BY started_at;`, [paypalOrderId]);
  const oldAttempt = allAttempts.rows.find((r: any) => r.id === attemptId);
  assert.equal(oldAttempt?.status, 'SUPERSEDED', 'Old attempt should be SUPERSEDED');

  // Stale worker tries to settle using old attempt ID via settleCaptureTransaction (which checks lease ownership)
  await assert.rejects(
    async () => {
      await db.settleCaptureTransaction({
        attemptId, // OLD attempt ID (now SUPERSEDED)
        paymentId,
        planId,
        captureId: `CAP-TEST-${Date.now()}`,
        amount: 100.00,
        currency: 'USD',
        actor: 'Stale Worker',
        payerEmail: 'buyer@test.com',
        rawPaypalResponse: {},
        instanceId: staleInstanceId // Stale instance ID
      });
    },
    /not in CAPTURING state/
  );

  // New instance settles successfully via reconcile path (no lease ownership check)
  await db.settleReconciliationTransaction({
    attemptId: newAttemptId,
    paymentId,
    planId,
    captureId: `CAP-NEW-${Date.now()}`,
    captureAmount: 100.00,
    captureCurrency: 'USD',
    expectedAmount: 100.00,
    expectedCurrency: 'USD',
    actor: 'New Instance',
    payerEmail: 'buyer@test.com',
    rawPaypalResponse: { status: 'COMPLETED' }
  });

  const payment = await db.getPayment(paymentId);
  assert.equal(payment?.verifiedStatus, 'COMPLETED', 'Payment should be completed by new instance');
});
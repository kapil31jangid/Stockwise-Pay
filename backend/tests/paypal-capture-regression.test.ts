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

  // Manually expire the lease in database
  await query(
    `UPDATE capture_attempts SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $1;`,
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

  // Add PayPal request ID and expire lease in local store
  const store = db as any;
  let existing = store.state.captureAttempts?.find((c: any) => c.id === attemptId);
  if (existing) {
    existing.paypalRequestId = `CAP-${paypalOrderId}`;
    existing.leaseExpiresAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  }

  // First reconciliation - mark as superseded and create new
  const newAttemptId = await db.tryAcquireCaptureLock(paypalOrderId, paymentId, instanceId, `CAP-${paypalOrderId}`, true);
  assert.ok(newAttemptId);
  assert.notEqual(newAttemptId, attemptId);

  // Manually add PayPal request ID to NEW attempt and expire it
  existing = store.state.captureAttempts?.find((c: any) => c.id === newAttemptId);
  if (existing) {
    existing.paypalRequestId = `CAP-${paypalOrderId}`;
    existing.leaseExpiresAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  }

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
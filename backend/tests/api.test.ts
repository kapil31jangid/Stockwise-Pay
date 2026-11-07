process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index.js';
import { db } from '../src/db/index.js';
import { signAuthToken, verifyAuthToken } from '../src/middleware/auth.js';

let server: any;
let baseUrl = 'http://localhost:5055';

export const approverToken = signAuthToken({
  id: 'USR-001',
  name: 'Marcus Vance',
  email: 'marcus.vance@stockwisepay.com',
  role: 'LEAD_APPROVER',
  permissions: ['INVENTORY_VIEW', 'INVENTORY_EDIT', 'PLAN_GENERATE', 'PLAN_APPROVE', 'PAYMENT_EXECUTE']
});

export const buyerToken = signAuthToken({
  id: 'USR-002',
  name: 'Elena Rostova',
  email: 'elena.rostova@stockwisepay.com',
  role: 'BUYER',
  permissions: ['INVENTORY_VIEW', 'SUPPLIERS_COMPARE', 'PLAN_GENERATE']
});

export const treasuryToken = signAuthToken({
  id: 'USR-003',
  name: 'David Chen',
  email: 'david.chen@stockwisepay.com',
  role: 'TREASURY',
  permissions: ['BUDGET_EDIT', 'AUDIT_VIEW', 'PAYMENT_AUDIT', 'PLAN_APPROVE', 'PAYMENT_EXECUTE']
});

const authHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${approverToken}`
};

const authFetch = (url: string, init?: RequestInit) => {
  return fetch(url, {
    ...init,
    headers: {
      ...authHeaders,
      ...(init?.headers || {})
    }
  });
};

test.before(async () => {
  await db.resetToSeed();
  await new Promise<void>((resolve) => {
    server = app.listen(5055, () => {
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
  setTimeout(() => process.exit(0), 100);
});

test('GET /api/health returns 200 and server status', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json() as any;
  assert.equal(data.status, 'ok');
  assert.equal(data.service, 'StockWise Pay API Server');
});

test('API Security Enforcement: Unauthenticated requests to protected endpoints return 401 Unauthorized', async () => {
  // Attempt to call protected endpoint without Authorization header
  const unauthRes = await fetch(`${baseUrl}/api/inventory`);
  assert.equal(unauthRes.status, 401);
  const unauthData = await unauthRes.json() as any;
  assert.equal(unauthData.success, false);
  assert.match(unauthData.error, /Unauthorized/i);
});

test('GET /api/inventory returns products with stockout risk indicators', async () => {
  const res = await authFetch(`${baseUrl}/api/inventory`);
  assert.equal(res.status, 200);
  const data = await res.json() as any;
  assert.equal(data.success, true);
  assert.ok(data.data.length >= 6);

  const hp101 = data.data.find((p: any) => p.sku === 'HP101');
  assert.ok(hp101);
  assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(hp101.stockoutRisk));
});

test('GET /api/inventory/analysis returns full demand estimates and replenishment priorities', async () => {
  const res = await authFetch(`${baseUrl}/api/inventory/analysis`);
  assert.equal(res.status, 200);
  const data = await res.json() as any;
  assert.equal(data.success, true);
  assert.ok(data.data.length >= 6);
  assert.ok(data.data[0].forecasting);
  assert.ok(data.data[0].inventoryAnalysis);
});

test('GET /api/suppliers/compare/:sku compares offers across suppliers', async () => {
  const res = await authFetch(`${baseUrl}/api/suppliers/compare/HP101?quantity=25&preference=BALANCED`);
  assert.equal(res.status, 200);
  const data = await res.json() as any;
  assert.equal(data.success, true);
  assert.equal(data.data.sku, 'HP101');
  assert.ok(data.data.offersCount >= 2);
  assert.ok(data.data.recommendedOffer);
});

test('POST /api/plans/generate generates budget-constrained plan with verified totals', async () => {
  const res = await authFetch(`${baseUrl}/api/plans/generate`, {
    method: 'POST',
    body: JSON.stringify({ budget: 1500, preference: 'BALANCED' })
  });
  assert.equal(res.status, 201);
  const data = await res.json() as any;
  assert.equal(data.success, true);
  assert.ok(data.plan.id);
  assert.ok(data.plan.calculatedTotal <= 1500);
  assert.equal(data.plan.planStatus, 'pending_approval');
  assert.ok(data.explanation);
  assert.equal(data.explanation.summary.budgetStatus, 'STRICTLY_COMPLIANT');
});

test('Approval Safety: Unapproved plan cannot create PayPal order', async () => {
  // 1. Generate new unapproved plan
  const genRes = await authFetch(`${baseUrl}/api/plans/generate`, {
    method: 'POST',
    body: JSON.stringify({ budget: 1200, preference: 'CHEAPEST' })
  });
  const genData = await genRes.json() as any;
  const planId = genData.plan.id;

  // 2. Attempt to create PayPal order without approval -> Must fail
  const payRes = await authFetch(`${baseUrl}/api/paypal/orders`, {
    method: 'POST',
    body: JSON.stringify({ planId })
  });
  assert.equal(payRes.status, 400);
  const payData = await payRes.json() as any;
  assert.equal(payData.success, false);
  assert.match(payData.error, /Explicit manager approval is required/i);
});

test('Full Procurement-to-Payment Lifecycle: Approve -> PayPal Order -> Capture -> Audit', async () => {
  // 1. Generate plan
  const genRes = await authFetch(`${baseUrl}/api/plans/generate`, {
    method: 'POST',
    body: JSON.stringify({ budget: 1000, preference: 'BALANCED' })
  });
  const genData = await genRes.json() as any;
  const planId = genData.plan.id;

  // 2. Approve plan
  const appRes = await authFetch(`${baseUrl}/api/plans/${planId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approverName: 'Marcus Vance', notes: 'Approved for Q4 Restock' })
  });
  assert.equal(appRes.status, 200);
  const appData = await appRes.json() as any;
  assert.equal(appData.plan.planStatus, 'approved');

  // 3. Create PayPal Sandbox Order
  const orderRes = await authFetch(`${baseUrl}/api/paypal/orders`, {
    method: 'POST',
    body: JSON.stringify({ planId })
  });
  assert.equal(orderRes.status, 201);
  const orderData = await orderRes.json() as any;
  assert.ok(orderData.data.orderId);
  assert.ok(orderData.data.approvalUrl);
  const paypalOrderId = orderData.data.orderId;

  // 4. Capture PayPal Order
  const capRes = await authFetch(`${baseUrl}/api/paypal/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.equal(capRes.status, 200);
  const capData = await capRes.json() as any;
  assert.equal(capData.data.status, 'COMPLETED');
  assert.ok(capData.data.captureId);

  // 5. Idempotent re-capture protection: second capture returns existing completed capture
  const capRes2 = await authFetch(`${baseUrl}/api/paypal/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.equal(capRes2.status, 200);
  const capData2 = await capRes2.json() as any;
  assert.equal(capData2.data.status, 'COMPLETED');
  assert.equal(capData2.data.captureId, capData.data.captureId);

  // 6. Verify payment status endpoint
  const statusRes = await authFetch(`${baseUrl}/api/paypal/payments/${paypalOrderId}/status`);
  assert.equal(statusRes.status, 200);
  const statusData = await statusRes.json() as any;
  assert.equal(statusData.data.verifiedStatus, 'COMPLETED');

  // 7. Verify plan marked as paid
  const planCheckRes = await authFetch(`${baseUrl}/api/plans/${planId}`);
  const planCheckData = await planCheckRes.json() as any;
  assert.equal(planCheckData.data.planStatus, 'paid');

  // 8. Verify audit logs record this full event sequence
  const auditRes = await authFetch(`${baseUrl}/api/audit-logs`);
  const auditData = await auditRes.json() as any;
  assert.ok(auditData.data.length >= 3);
  const captureLog = auditData.data.find((l: any) => l.action.includes('CAPTURE_PAYPAL_ORDER'));
  assert.ok(captureLog);
});

test('Plan Invalidation: Modifying plan bumps version and invalidates prior approval', async () => {
  // 1. Generate & approve plan
  const genRes = await authFetch(`${baseUrl}/api/plans/generate`, {
    method: 'POST',
    body: JSON.stringify({ budget: 900 })
  });
  const planId = (await genRes.json() as any).plan.id;

  await authFetch(`${baseUrl}/api/plans/${planId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approverName: 'Marcus Vance' })
  });

  // 2. Recalculate plan with lower budget $600
  const recalcRes = await authFetch(`${baseUrl}/api/plans/${planId}/recalculate`, {
    method: 'POST',
    body: JSON.stringify({ newBudget: 600 })
  });
  assert.equal(recalcRes.status, 200);
  const recalcData = await recalcRes.json() as any;
  assert.equal(recalcData.plan.currentVersion, 2);
  assert.equal(recalcData.plan.planStatus, 'pending_approval');

  // 3. Attempting checkout must now fail because v2 is unapproved!
  const checkoutRes = await authFetch(`${baseUrl}/api/paypal/orders`, {
    method: 'POST',
    body: JSON.stringify({ planId })
  });
  assert.equal(checkoutRes.status, 400);
  const checkoutData = await checkoutRes.json() as any;
  assert.match(checkoutData.error, /approval/i);
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH EDGE CASE TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('Auth: Malformed token (non-Bearer scheme) returns 401', async () => {
  const res = await fetch(`${baseUrl}/api/inventory`, {
    headers: { 'Authorization': 'Basic dXNlcjpwYXNz' }
  });
  assert.equal(res.status, 401);
  const data = await res.json() as any;
  assert.equal(data.success, false);
});

test('Auth: Empty Authorization header returns 401', async () => {
  const res = await fetch(`${baseUrl}/api/inventory`, {
    headers: { 'Authorization': '' }
  });
  assert.equal(res.status, 401);
});

test('Auth: Completely invalid token string returns 401', async () => {
  const res = await fetch(`${baseUrl}/api/inventory`, {
    headers: { 'Authorization': 'Bearer totally-invalid-random-token-xyz' }
  });
  assert.equal(res.status, 401);
  const data = await res.json() as any;
  assert.equal(data.success, false);
  assert.match(data.error, /Unauthorized/i);
});

test('Auth: Forged token with tampered signature returns 401', async () => {
  const parts = approverToken.split('.');
  const tamperedSig = parts[2].slice(0, -3) + 'XYZ';
  const forgedToken = `${parts[0]}.${parts[1]}.${tamperedSig}`;
  const res = await fetch(`${baseUrl}/api/inventory`, {
    headers: { 'Authorization': `Bearer ${forgedToken}` }
  });
  assert.equal(res.status, 401);
  const data = await res.json() as any;
  assert.equal(data.success, false);
  assert.match(data.error, /forged|invalid/i);
});

test('Auth: Arbitrary-user self-registration is strictly rejected', async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'unauthorized-hacker@external.com', password: 'password123' })
  });
  assert.equal(res.status, 401);
  const data = await res.json() as any;
  assert.equal(data.success, false);
  assert.match(data.error, /Arbitrary self-registration is disabled/i);
});

test('Auth: Registered demo persona login succeeds with cryptographic JWT', async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'marcus.vance@stockwisepay.com', password: 'ApproverPass2026!' })
  });
  assert.equal(res.status, 200);
  const data = await res.json() as any;
  assert.equal(data.success, true);
  assert.ok(data.token);
  assert.equal(data.user.role, 'Inventory Lead / Approver');
});

test('RBAC: Buyer (Elena) is forbidden from approving purchase plans', async () => {
  const genRes = await authFetch(`${baseUrl}/api/plans/generate`, {
    method: 'POST',
    body: JSON.stringify({ budget: 600, preference: 'CHEAPEST' })
  });
  const planId = (await genRes.json() as any).plan.id;

  const approveRes = await fetch(`${baseUrl}/api/plans/${planId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${buyerToken}`
    },
    body: JSON.stringify({ notes: 'Elena trying to approve' })
  });
  assert.equal(approveRes.status, 403);
  const data = await approveRes.json() as any;
  assert.equal(data.success, false);
  assert.match(data.error, /Forbidden/i);
});

test('RBAC: Buyer (Elena) is forbidden from executing PayPal payments', async () => {
  const genRes = await authFetch(`${baseUrl}/api/plans/generate`, {
    method: 'POST',
    body: JSON.stringify({ budget: 600, preference: 'CHEAPEST' })
  });
  const planId = (await genRes.json() as any).plan.id;

  await authFetch(`${baseUrl}/api/plans/${planId}/approve`, {
    method: 'POST',
    body: JSON.stringify({})
  });

  const orderRes = await fetch(`${baseUrl}/api/paypal/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${buyerToken}`
    },
    body: JSON.stringify({ planId })
  });
  assert.equal(orderRes.status, 403);
  const data = await orderRes.json() as any;
  assert.equal(data.success, false);
  assert.match(data.error, /Forbidden/i);
});

test('Webhook Security: Rejects invalid certificate origin and detects duplicates', async () => {
  const invalidCertRes = await fetch(`${baseUrl}/api/paypal/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'paypal-transmission-id': 'TX-1001',
      'paypal-cert-url': 'https://attacker.evil.com/fake-cert.pem',
      'paypal-transmission-sig': 'dummy-sig'
    },
    body: JSON.stringify({ event_type: 'PAYMENT.CAPTURE.COMPLETED' })
  });
  assert.equal(invalidCertRes.status, 400);

  const validRes1 = await fetch(`${baseUrl}/api/paypal/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'paypal-transmission-id': 'TX-DUP-999',
      'paypal-cert-url': 'https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-123',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-transmission-sig': 'dummy-sig',
      'paypal-transmission-time': new Date().toISOString()
    },
    body: JSON.stringify({ event_type: 'PAYMENT.CAPTURE.COMPLETED', id: 'WH-EVT-1' })
  });
  assert.equal(validRes1.status, 200);

  const dupRes = await fetch(`${baseUrl}/api/paypal/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'paypal-transmission-id': 'TX-DUP-999',
      'paypal-cert-url': 'https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-123',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-transmission-sig': 'dummy-sig',
      'paypal-transmission-time': new Date().toISOString()
    },
    body: JSON.stringify({ event_type: 'PAYMENT.CAPTURE.COMPLETED', id: 'WH-EVT-1' })
  });
  assert.equal(dupRes.status, 200);
  const dupData = await dupRes.json() as any;
  assert.equal(dupData.duplicate, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// PLAN REJECTION & EDGE CASE TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('Plan Rejection: Reject a plan sets planStatus to rejected', async () => {
  // 1. Generate plan
  const genRes = await authFetch(`${baseUrl}/api/plans/generate`, {
    method: 'POST',
    body: JSON.stringify({ budget: 800, preference: 'CHEAPEST' })
  });
  const genData = await genRes.json() as any;
  const planId = genData.plan.id;
  assert.equal(genData.plan.planStatus, 'pending_approval');

  // 2. Reject plan
  const rejectRes = await authFetch(`${baseUrl}/api/plans/${planId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ approverName: 'Marcus Vance', notes: 'Budget too high this week' })
  });
  assert.equal(rejectRes.status, 200);
  const rejectData = await rejectRes.json() as any;
  assert.equal(rejectData.success, true);
  assert.equal(rejectData.plan.planStatus, 'rejected');

  // 3. Attempting checkout on rejected plan must fail
  const checkoutRes = await authFetch(`${baseUrl}/api/paypal/orders`, {
    method: 'POST',
    body: JSON.stringify({ planId })
  });
  assert.equal(checkoutRes.status, 400);
  const checkoutData = await checkoutRes.json() as any;
  assert.equal(checkoutData.success, false);
});

test('Plan Approval: Approving an empty plan returns 400', async () => {
  // Create a plan via PUT with an empty items list
  const emptyPlanId = `PLAN-EMPTY-${Date.now()}`;
  await authFetch(`${baseUrl}/api/plans/${emptyPlanId}`, {
    method: 'PUT',
    body: JSON.stringify({
      id: emptyPlanId,
      name: 'Empty Test Plan',
      purchasingBudget: 500,
      calculatedTotal: 0,
      currentVersion: 1,
      planStatus: 'pending_approval',
      selectedItems: [],
      deferredItems: [],
      scenarioMode: 'balanced'
    })
  });

  const approveRes = await authFetch(`${baseUrl}/api/plans/${emptyPlanId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approverName: 'Marcus Vance' })
  });
  assert.equal(approveRes.status, 400);
  const approveData = await approveRes.json() as any;
  assert.equal(approveData.success, false);
  assert.match(approveData.error, /empty/i);
});

test('Plan not found returns 404', async () => {
  const res = await authFetch(`${baseUrl}/api/plans/PLAN-NONEXISTENT-99999`);
  assert.equal(res.status, 404);
  const data = await res.json() as any;
  assert.equal(data.success, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYPAL EDGE CASE TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('PayPal: Create order for non-existent plan returns 400/404', async () => {
  const res = await authFetch(`${baseUrl}/api/paypal/orders`, {
    method: 'POST',
    body: JSON.stringify({ planId: 'PLAN-DOES-NOT-EXIST-99999' })
  });
  assert.ok([400, 404].includes(res.status), `Expected 400 or 404, got ${res.status}`);
  const data = await res.json() as any;
  assert.equal(data.success, false);
});

test('PayPal: Capture non-existent PayPal order returns error', async () => {
  const res = await authFetch(`${baseUrl}/api/paypal/orders/FAKE-PAYPAL-ORDER-ID-99999/capture`, {
    method: 'POST',
    body: JSON.stringify({})
  });
  // Should be 400 or 500 — anything but 2xx
  assert.ok(res.status >= 400, `Expected error status, got ${res.status}`);
  const data = await res.json() as any;
  assert.equal(data.success, false);
});

test('PayPal: Missing planId in create-order body returns 400', async () => {
  const res = await authFetch(`${baseUrl}/api/paypal/orders`, {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.equal(res.status, 400);
  const data = await res.json() as any;
  assert.equal(data.success, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// CSV IMPORT TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('CSV Import: Valid CSV with header + rows imports products', async () => {
  const csvContent = `sku,name,category,currentStock,unitCost\nTEST-CSV-001,Test Widget Alpha,Electronics,25,19.99\nTEST-CSV-002,Test Widget Beta,Electronics,10,34.99`;
  const res = await authFetch(`${baseUrl}/api/inventory/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv: csvContent })
  });
  assert.equal(res.status, 200);
  const data = await res.json() as any;
  assert.equal(data.success, true);
  assert.equal(data.importedCount, 2);
  assert.equal(data.errorCount, 0);
});

test('CSV Import: Empty CSV body (no rows) returns 400', async () => {
  const res = await authFetch(`${baseUrl}/api/inventory/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv: 'sku,name,category' })  // header only, no data rows
  });
  assert.equal(res.status, 400);
  const data = await res.json() as any;
  assert.equal(data.success, false);
  assert.match(data.error, /header|data row/i);
});

test('CSV Import: CSV missing required "sku" header returns 400', async () => {
  const csvContent = `product_code,title,stock\nABC,Widget,10`;
  const res = await authFetch(`${baseUrl}/api/inventory/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv: csvContent })
  });
  assert.equal(res.status, 400);
  const data = await res.json() as any;
  assert.equal(data.success, false);
  assert.match(data.error, /sku|required/i);
});

test('CSV Import: No file and no csv body returns 400', async () => {
  const res = await authFetch(`${baseUrl}/api/inventory/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(res.status, 400);
  const data = await res.json() as any;
  assert.equal(data.success, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// AI AGENT TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('AI Agent analyze and simulate endpoints', async () => {
  const analyzeRes = await authFetch(`${baseUrl}/api/agent/analyze`, {
    method: 'POST',
    body: JSON.stringify({ prompt: 'Simulate high volume restock', budget: 1800 })
  });
  const analyzeData = await analyzeRes.json() as any;
  assert.equal(analyzeRes.status, 200, `Expected 200, got ${analyzeRes.status}: ${JSON.stringify(analyzeData)}`);
  assert.ok(analyzeData.data.runId);
  assert.ok(analyzeData.data.executionStats.toolsCalled.includes('analyze_inventory'));
  assert.ok(analyzeData.data.executionStats.toolsCalled.includes('optimize_budget'));
  assert.ok(analyzeData.data.executionStats.toolsCalled.includes('explain_purchase_plan'));

  const simRes = await authFetch(`${baseUrl}/api/agent/simulate`, {
    method: 'POST',
    body: JSON.stringify({ newBudget: 800, preference: 'CHEAPEST' })
  });
  assert.equal(simRes.status, 200);
  const simData = await simRes.json() as any;
  assert.ok(simData.data.simulationHistory);
});

// ─────────────────────────────────────────────────────────────────────────────
// THIRD-PASS REMEDIATION SUITE: AUTH, DB, WEBHOOKS, CONCURRENCY & ROLES
// ─────────────────────────────────────────────────────────────────────────────

test('Auth: Bcrypt password verification rejects incorrect password', async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'marcus.vance@stockwisepay.com', password: 'IncorrectPassword123' })
  });
  assert.equal(res.status, 401);
  const data = await res.json() as any;
  assert.equal(data.success, false);
  assert.match(data.error, /Incorrect password/i);
});

test('Auth: Logout persistently revokes token across subsequent requests', async () => {
  // 1. Log in to get fresh token
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'david.chen@stockwisepay.com', password: 'TreasuryPass2026!' })
  });
  assert.equal(loginRes.status, 200);
  const { token } = await loginRes.json() as any;
  assert.ok(token);

  // 2. Verify token works before logout
  const meBefore = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.equal(meBefore.status, 200);

  // 3. Perform logout
  const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ actor: 'David Chen' })
  });
  assert.equal(logoutRes.status, 200);

  // 4. Verify token is now strictly revoked and returns 401
  const meAfter = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.equal(meAfter.status, 401);
  const afterData = await meAfter.json() as any;
  assert.match(afterData.error, /invalid|expired|forged/i);
});

test('Auth: Expired JWT is rejected with 401', async () => {
  // Sign a token that expired 10 seconds ago
  const expiredToken = signAuthToken(
    {
      id: 'USR-001',
      name: 'Marcus Vance',
      email: 'marcus.vance@stockwisepay.com',
      role: 'LEAD_APPROVER'
    },
    -10 // Expired in the past
  );

  const res = await fetch(`${baseUrl}/api/inventory`, {
    headers: { 'Authorization': `Bearer ${expiredToken}` }
  });
  assert.equal(res.status, 401);
  const data = await res.json() as any;
  assert.equal(data.success, false);
});

test('Database: Empty query returns null/empty array and never falls back to seed data', async () => {
  const missingSku = 'NON-EXISTENT-SKU-TEST-99999';
  const product = await db.getProduct(missingSku);
  assert.equal(product, null, 'Expected non-existent SKU to return null, not seed data');

  const offers = await db.getOffersForSku(missingSku);
  assert.ok(Array.isArray(offers), 'Expected array for offers query');
  assert.equal(offers.length, 0, 'Expected 0 offers for non-existent SKU, not seed offers');
});

test('PayPal Webhook: Invalid signature is rejected with 400 and never marked VERIFIED', async () => {
  const invalidSigRes = await fetch(`${baseUrl}/api/paypal/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'paypal-transmission-id': `TX-INVALID-${Date.now()}`,
      'paypal-cert-url': 'https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-123',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-transmission-sig': 'INVALID_SIGNATURE_FOR_TEST',
      'paypal-transmission-time': new Date().toISOString()
    },
    body: JSON.stringify({
      id: `WH-TEST-INVALID-${Date.now()}`,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAP-INVALID-999' }
    })
  });

  assert.equal(invalidSigRes.status, 400);
  const data = await invalidSigRes.json() as any;
  assert.equal(data.success, false);
  assert.match(data.error, /verification failed/i);
});

test('PayPal Webhook: Valid event is processed and duplicate is safely rejected', async () => {
  const eventId = `WH-EVT-VALID-${Date.now()}`;
  const transmissionId = `TX-VAL-${Date.now()}`;

  // 1. First event submission
  const firstRes = await fetch(`${baseUrl}/api/paypal/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'paypal-transmission-id': transmissionId,
      'paypal-cert-url': 'https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-123',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-transmission-sig': 'VALID_TEST_SIG',
      'paypal-transmission-time': new Date().toISOString()
    },
    body: JSON.stringify({
      id: eventId,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      summary: 'Payment capture completed for retail order',
      resource: { id: `CAP-REC-${Date.now()}` }
    })
  });

  assert.equal(firstRes.status, 200);
  const firstData = await firstRes.json() as any;
  assert.equal(firstData.success, true);
  assert.equal(firstData.duplicate, false);

  // 2. Replayed event submission (duplicate transmission)
  const dupRes = await fetch(`${baseUrl}/api/paypal/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'paypal-transmission-id': transmissionId,
      'paypal-cert-url': 'https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-123',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-transmission-sig': 'VALID_TEST_SIG',
      'paypal-transmission-time': new Date().toISOString()
    },
    body: JSON.stringify({
      id: eventId,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: `CAP-REC-${Date.now()}` }
    })
  });

  assert.equal(dupRes.status, 200);
  const dupData = await dupRes.json() as any;
  assert.equal(dupData.duplicate, true);
  assert.equal(dupData.processed, false);
});

test('Payment History: Protected endpoint requires authorization', async () => {
  const unauthRes = await fetch(`${baseUrl}/api/paypal/payments`);
  assert.equal(unauthRes.status, 401);

  const authRes = await authFetch(`${baseUrl}/api/paypal/payments`);
  assert.equal(authRes.status, 200);
  const data = await authRes.json() as any;
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.data));
});

test('Auth Security: Fail-closed verification rejects tokens when database revocation checks fail', async () => {
  const validToken = signAuthToken({
    id: 'USR-001',
    name: 'Marcus Vance',
    email: 'marcus.vance@stockwisepay.com',
    role: 'LEAD_APPROVER'
  });

  // Temporarily stub db.isTokenRevoked to throw a database connection error
  const originalIsTokenRevoked = db.isTokenRevoked;
  db.isTokenRevoked = async () => {
    throw new Error('Connection terminated unexpectedly (Simulated PostgreSQL partition)');
  };

  try {
    const verified = await verifyAuthToken(validToken);
    assert.equal(verified, null, 'Must fail closed and return null when database verification fails');
  } finally {
    db.isTokenRevoked = originalIsTokenRevoked;
  }
});

test('Budget Safety: Database transaction rejects payment capture when budget ceiling is exceeded', async () => {
  const planId = `PLAN-OVER-${Date.now()}`;
  await db.savePurchasePlan({
    id: planId,
    name: 'Overbudget Test Plan',
    purchasingBudget: 1000.00,
    calculatedTotal: 999999.00,
    currentVersion: 1,
    planStatus: 'approved',
    selectedItems: [],
    deferredItems: [],
    scenarioMode: 'balanced',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const mockPayment = {
    id: `PAY-EXCEED-${Date.now()}`,
    purchasePlanId: planId,
    planVersion: 1,
    paypalOrderId: `ORD-EXCEED-${Date.now()}`,
    amount: 999999.00, // Massive amount exceeding $5,000 budget
    currency: 'USD',
    paymentMethod: 'PayPal Sandbox',
    verifiedStatus: 'CREATED' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Save the payment first so the row exists to be locked FOR UPDATE
  await db.savePayment(mockPayment);

  await assert.rejects(
    async () => {
      await db.executePaymentCaptureTransaction({
        payment: mockPayment,
        planId: mockPayment.purchasePlanId,
        amount: mockPayment.amount,
        actor: 'Test Suite',
        captureId: `CAP-OVER-${Date.now()}`
      });
    },
    /Budget ceiling exceeded/i
  );
});


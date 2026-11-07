import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index.js';
import { db } from '../src/db/index.js';

let server: any;
let baseUrl = 'http://localhost:5055';
const authHeaders = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer jwt-stockwise-USR-001-test'
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
  assert.match(checkoutData.error, /Re-approval required/i);
});

test('AI Agent analyze and simulate endpoints', async () => {
  const analyzeRes = await authFetch(`${baseUrl}/api/agent/analyze`, {
    method: 'POST',
    body: JSON.stringify({ prompt: 'Simulate high volume restock', budget: 1800 })
  });
  assert.equal(analyzeRes.status, 200);
  const analyzeData = await analyzeRes.json() as any;
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

process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'https://stockwise-pay-alpha.vercel.app';

import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db/index.js';
const { default: app } = await import('../src/index.js');

const allowedOrigin = 'https://stockwise-pay-alpha.vercel.app';
const disallowedOrigin = 'https://attacker.example';
const baseUrl = 'http://localhost:5056';
let server: ReturnType<typeof app.listen>;

function assertCorsHeaders(response: Response, origin = allowedOrigin) {
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
}

test.before(async () => {
  await db.resetToSeed();
  await new Promise<void>((resolve) => {
    server = app.listen(5056, resolve);
  });
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('allows the production Vercel origin', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: allowedOrigin }
  });

  assert.equal(response.status, 200);
  assertCorsHeaders(response);
});

test('does not allow an unconfigured origin', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: disallowedOrigin }
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
});

test('handles OPTIONS /api/auth/login before authentication', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: allowedOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type, authorization'
    }
  });

  assert.equal(response.status, 204);
  assertCorsHeaders(response);
  assert.match(response.headers.get('access-control-allow-methods') || '', /\bPOST\b/);
  assert.match(response.headers.get('access-control-allow-methods') || '', /\bOPTIONS\b/);
  assert.match(response.headers.get('access-control-allow-headers') || '', /Content-Type/i);
  assert.match(response.headers.get('access-control-allow-headers') || '', /Authorization/i);
});

test('adds CORS headers to an actual login error response', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      Origin: allowedOrigin,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: 'not-a-real-user@example.com', password: 'invalid' })
  });

  assert.equal(response.status, 401);
  assertCorsHeaders(response);
});

test('adds CORS headers to an authenticated-route 401 response', async () => {
  const response = await fetch(`${baseUrl}/api/inventory`, {
    method: 'GET',
    headers: {
      Origin: allowedOrigin,
      Authorization: 'Bearer invalid-token'
    }
  });

  assert.equal(response.status, 401);
  assertCorsHeaders(response);
});

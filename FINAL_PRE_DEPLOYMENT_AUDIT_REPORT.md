# STOCKWISE PAY — FINAL PRE-DEPLOYMENT AUDIT REPORT (PATCH RELEASE)

**Date:** November 10, 2026  
**Auditor:** Principal Software Architect, Security & QA Engineering Team  
**Repository:** https://github.com/kapil31jangid/Stockwise-Pay  
**Latest Verified Implementation Commit:** `728064849771d9d166e5c4724bdd1840d836be08`
**CI Configuration Baseline:** `10e8dce8347be3fe52f854d1006098e9b83f0957`
**GitHub Actions:** [Run 42815619041](https://github.com/kapil31jangid/Stockwise-Pay/actions/runs/42815619041) — **passed**
**Final Decision:** `NOT READY — REAL PAYPAL SANDBOX TRANSACTION NOT EVIDENCED`

---

## 1. Executive Summary

StockWise Pay underwent a comprehensive, four-pass architectural, cryptographic security, database persistence, and payment gateway audit. All high-severity and medium-severity findings across Authentication, PayPal Orders v2 Sandbox, PostgreSQL Persistence, Role-Based Access Control (RBAC), and Frontend-Backend Client Synchronization have been resolved and verified with automated test suites and production builds.

The platform executes the complete intended workflow:
```
CSV Inventory Import (Elena - Buyer)
  ➔ Inventory Stockout & Demand Analysis (Member 2 Module - EMA Algorithm)
  ➔ Multi-Supplier Price & Lead Time Comparison (Member 4 Module)
  ➔ Deterministic AI Knapsack Budget Optimization & Restock Pipeline
  ➔ Purchase Plan Versioning & Explanation Generation
  ➔ Manager Approval / Rejection Gate (Marcus - Approver)
  ➔ PayPal Orders v2 Sandbox Checkout & Mutex Lock Capture (David - Finance)
  ➔ Transaction Status Verification & Webhook Deduplication
  ➔ PostgreSQL Immutable Audit Trail & Double-Entry Ledger Logging
```

The verified GitHub Actions run passed 139 tests: 7 intelligence, 13 supplier-intelligence, and 119 backend tests, including the new in-memory reconciliation fail-closed regressions. The local intelligence, supplier-intelligence, build, lint, and dependency checks passed; the local backend database suite was blocked by the workstation's unreachable Supabase hostname, while the CI PostgreSQL-backed suite passed. PayPal capture paths remain automated test/demo fulfillment; no real Sandbox transaction is evidenced.

---

## 2. Final Deployment Decision

```
================================================================================
FINAL VERDICT: NOT READY — REAL PAYPAL SANDBOX TRANSACTION NOT EVIDENCED
================================================================================
```

### Rationale:
- **Sandbox Readiness:** Automated tests use mocked/test-mode PayPal fulfillment and a local PostgreSQL database. The code is suitable for a separately controlled Sandbox demonstration, but no real PayPal Sandbox transaction was independently executed or evidenced in this audit.
- **Production Pre-requisites:** Prior to processing real customer funds, the team must configure live PayPal production credentials, register an HTTPS webhook endpoint with PayPal Developer Portal, and configure production TLS certificates.

---

## 3. Comprehensive Remediation Matrix

### P0 — Authentication & Session Management
| Issue | Remediation | Verification |
|---|---|---|
| Prefix-based fake tokens (`jwt-stockwise-...`) | Replaced with standard HMAC-SHA256 signed JWTs with JTI, claims, and expiration. | `frontend/src/services/api.ts` validates 3-part JWT; backend tests reject malformed/forged tokens. |
| Hardcoded plaintext passwords in source | Passwords removed from source code; hashed using `bcrypt` (10 rounds). | `backend/src/routes/auth.ts`, `backend/src/db/supabase.sql` |
| Default `password123` bypass | Removed completely. Login strictly validates against bcrypt hashes. | `backend/tests/api.test.ts` ("Bcrypt password verification rejects incorrect password") PASS |
| In-memory arbitrary user login | Database-backed user management via PostgreSQL `users` table. | `backend/src/db/index.ts` (`getUserByEmail`, `saveUser`) |
| No session revocation on logout | Persistent token revocation table `revoked_tokens` tracks revoked JTIs with timestamp. | `backend/tests/api.test.ts` ("Logout persistently revokes token across subsequent requests") PASS |
| Fail-open on database outage | Middleware fails closed: if database cannot verify token revocation, request is rejected with 401. | `backend/tests/api.test.ts` ("Auth Security: Fail-closed verification rejects tokens when database revocation checks fail") PASS |
| Preset persona account switching | Preset buttons now provide valid bcrypt demo credentials from `DEMO_CREDENTIALS`. | `frontend/src/context/AuthContext.tsx`, `frontend/src/app/login/page.tsx` |

### P0 — PayPal Capture & Webhook Security
| Issue | Remediation | Verification |
|---|---|---|
| Unverified webhook payload acceptance | Implemented official PayPal `/v1/notifications/verify-webhook-signature` API verification. | `backend/src/services/paypal.ts` (`verifyWebhookSignature`) |
| Unverified events marked `VERIFIED` | Events failing verification return 400 Bad Request and are never marked VERIFIED. | `backend/tests/api.test.ts` ("Invalid signature is rejected with 400") PASS |
| Webhook replay / duplicate processing | Uses `event.id` as primary stable deduplication identifier, storing `transmission_id` separately. Unique constraint in PostgreSQL. | `backend/tests/api.test.ts` ("Valid event is processed and duplicate is safely rejected") PASS |
| Synthetic capture IDs in real transactions | Replaced synthetic IDs with required actual PayPal capture ID from response. Malformed/missing responses rejected. | `backend/src/services/paypal.ts` (`captureOrder`) |
| Missing capture status check | Strictly requires capture status `COMPLETED`. Verifies returned amount and currency match approved plan. | `backend/src/services/paypal.ts` (`captureOrder`) |
| Idempotency controls | Added `PayPal-Request-Id` headers to order creation and order capture requests. | `backend/src/services/paypal.ts` |
| Concurrent double capture | Database row-level locking (`FOR UPDATE` on payments and budget) plus in-flight capture lock. | `backend/src/db/index.ts` (`executePaymentCaptureTransaction`) |
| Reconciliation on network failure | If PayPal order was already captured (`ORDER_ALREADY_CAPTURED`), fetches live order capture and reconciles DB. | `backend/src/services/paypal.ts` |

### P0 — Database Persistence & Fail-Safe Operation
| Issue | Remediation | Verification |
|---|---|---|
| Silent fallback to local JSON in production | In `NODE_ENV=production`, database errors throw and fail safely; no silent fallback. | `backend/src/db/index.ts` (`query` helper throws in production) |
| Empty DB query returned seed data | Removed `res.rows.length === 0` fallback; empty queries return empty arrays or null. | `backend/tests/api.test.ts` ("Empty query returns null/empty array") PASS |
| Local state as alternative truth | Database serves as single source of truth for plans, payments, users, and audit logs. | Verified across all route handlers in `backend/src/routes/` |
| Budget ceiling double spending | Atomic transaction strictly verifies `newSpent <= monthlyBudget`, rolling back on violation. | `backend/tests/api.test.ts` ("Budget Safety: Database transaction rejects payment capture when budget ceiling is exceeded") PASS |

### P1 — Payment Integrity & Authorization
| Issue | Remediation | Verification |
|---|---|---|
| Client-supplied amount accepted | Payment amounts strictly loaded from approved purchase plan in database. | `backend/src/routes/paypal.ts`, `backend/src/services/paypal.ts` |
| Buyer role paying or approving | Enforced RBAC: Buyer (`Elena`) cannot approve plans (403) or capture payments (403). | `backend/tests/api.test.ts` ("RBAC tests") PASS |
| Payment history unprotected | Added `requireAuth` to `GET /api/paypal/payments`. | `backend/tests/api.test.ts` ("Payment History: Protected endpoint requires authorization") PASS |
| Misleading security UI claims | Removed false "PCI-DSS Compliant" and "TLS 1.3 End-to-End Encrypted" claims; accurately displays "PayPal Orders v2 Verified Gateway". | `frontend/src/app/payments/page.tsx` |
| Misleading buyer email in UI | Removed hardcoded `buyer-retail@stockwise.test`; displays dynamic mode and actual settlement channel. | `frontend/src/app/payments/page.tsx` |

### P1 — Frontend Integrity
| Issue | Remediation | Verification |
|---|---|---|
| Silent localStorage fallbacks in production | In production, failures surface explicit errors rather than falling back to local storage. | `frontend/src/services/api.ts` |
| Route protection bypass | Next.js Edge Middleware validates JWT authentication cookie on all protected routes. | `frontend/src/middleware.ts` |
| TypeScript compilation failure | Fixed `PaymentRecord.method` union type in `frontend/src/types/index.ts`. | `npm --prefix frontend run build` exited with code 0 (11/11 static pages generated) |

---

## 4. Test Suite Execution & Verification Evidence

The following results were collected on November 10, 2026. Local commands and GitHub Actions evidence are separated. PayPal capture paths in the automated suite use test-mode/demo fulfillment and mocked reconciliation responses; they are not evidence of a real PayPal Sandbox transaction.

### 4.1 Unit & Integration Test Summary
| Suite | Command | Total | Passed | Failed | Skipped | Duration |
|---|---|---|---|---|---|---|
| **Inventory Intelligence (Demand Forecasting)** | `npm --prefix intelligence test` | 7 | 7 | 0 | 0 | 240 ms |
| **Supplier Intelligence (Optimization & Scoring)** | `npm --prefix supplier-intelligence test` | 13 | 13 | 0 | 0 | 299 ms |
| **Backend API, Security, DB & PayPal (local)** | `npm --prefix backend test` | 119 | 46 | 73 | 0 | 280 s; blocked by unreachable Supabase DNS |
| **Combined local test total (completed suites only)** | 7 + 13 | **20** | **20** | **0** | **0** | Recorded per-suite |

The local backend run is not reported as passing: its database-backed setup failed with `getaddrinfo ENOTFOUND db.fkldxvyzmmkzeqkciolh.supabase.co`. The authoritative PostgreSQL-backed result is the GitHub Actions run below.

### 4.2 Production Build Verification
| Component | Command | Result | Output Details |
|---|---|---|---|
| **Backend Build** | `npm --prefix backend run build` | **EXIT 0** | Clean TypeScript compilation to `dist/` |
| **Frontend Next.js Build** | `npm --prefix frontend run build` | **EXIT 0** | 11/11 static pages prerendered, all chunks optimized |
| **Frontend Code Quality** | `npm --prefix frontend run lint` | **EXIT 0** | ESLint verified across all routes and components; warnings only |
| **Fresh PostgreSQL schema** | CI `psql -v ON_ERROR_STOP=1` validation | **PASS** | Run 42815619041 |
| **Legacy PostgreSQL upgrade** | CI legacy fixture + idempotent upgrade validation | **PASS** | Run 42815619041; existing records and required constraints preserved |
| **Dependency vulnerability audit** | `npm audit --audit-level=critical` | **PASS** | 0 vulnerabilities |

### 4.3 Sandbox Integration Evidence
No real PayPal Sandbox transaction evidence was produced during this audit. The backend output explicitly identifies its PayPal fulfillment as automated test/demo mode.

---

## 5. Architecture & Deterministic AI Orchestration

### 5.1 Deterministic Knapsack & Scoring Pipeline
Unlike non-deterministic LLM agents that may hallucinate purchase amounts or invent suppliers, StockWise Pay implements a **strictly bounded deterministic AI pipeline**:
1. **Sales History Analysis & EMA Demand Forecast**:
   - Computes weighted Exponential Moving Average (EMA) with $\alpha = 0.35$ over normalized 14-day trailing retail sales.
   - Computes stockout runway in days: $\text{runoutDays} = \frac{\text{currentStock}}{\text{dailyDemand}}$.
2. **Multi-Supplier Comparative Scoring**:
   - Ranks suppliers by Composite Score: $\text{Score} = (0.50 \times \text{PriceRatio}) + (0.30 \times \text{Reliability}) + (0.20 \times \text{Speed})$.
   - Respects user preferences (`CHEAPEST`, `FASTEST`, `MOST_RELIABLE`, `BALANCED`).
3. **Knapsack Budget Optimization**:
   - Prioritizes CRITICAL and HIGH stockout risk SKUs.
   - Knapsack greedy allocation fills orders strictly within `purchasingBudget`.
   - Supports fractional/partial restock when remaining budget cannot cover full safety stock.
4. **Natural Language Explanation & Audit Generator**:
   - Generates auditable explanation cards for managerial review specifying runway delta, savings percentage, and freight fee logic.

### 5.2 Secure Demo Personas & Credentials
Initialized in database with bcrypt (10 rounds):
- **Marcus Vance** (`marcus.vance@stockwisepay.com` / `ApproverPass2026!`): Lead Approver. Permissions: `PLAN_APPROVE`, `PAYMENT_EXECUTE`, `INVENTORY_VIEW`, `INVENTORY_EDIT`.
- **Elena Rostova** (`elena.rostova@stockwisepay.com` / `BuyerPass2026!`): Procurement Specialist. Permissions: `INVENTORY_VIEW`, `SUPPLIERS_COMPARE`, `PLAN_GENERATE`. Forbidden from approving plans or executing payments.
- **David Chen** (`david.chen@stockwisepay.com` / `TreasuryPass2026!`): CFO / Treasury. Permissions: `BUDGET_EDIT`, `AUDIT_VIEW`, `PAYMENT_AUDIT`, `PLAN_APPROVE`, `PAYMENT_EXECUTE`.

### 5.3 Required Environment Variables
```env
# Backend Environment Configuration (.env in backend/)
PORT=5000
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/postgres
JWT_SECRET=your-cryptographically-secure-random-secret-min-32-chars
PAYPAL_CLIENT_ID=your-paypal-sandbox-client-id
PAYPAL_CLIENT_SECRET=your-paypal-sandbox-client-secret
PAYPAL_WEBHOOK_ID=your-paypal-webhook-id
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
FRONTEND_URL=http://localhost:3000

# Frontend Environment Configuration (.env.local in frontend/)
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_PAYPAL_CLIENT_ID=your-paypal-sandbox-client-id
```

---

## 6. Final Patch Audit Findings & Remediation (Commit `0deb314`)

The following findings were identified and remediated in the final patch release:

### 6.1 PayPal Capture Validation (Finding 1)
- **Issue:** Capture response validation was incomplete; missing checks for `capture.id`, `capture.status`, `capture.amount.value`, `capture.amount.currency_code`.
- **Fix:** Added strict validation in `backend/src/services/paypal.ts` (`captureOrder`):
  - Requires `capture.id` (non-empty string)
  - Requires `capture.status === 'COMPLETED'`
  - Requires `capture.amount.value` (numeric, finite, non-null)
  - Requires `capture.amount.currency_code` (non-empty string)
  - Compares returned amount and currency with authoritative database payment
  - Rejects transaction if any verification field is missing, null, malformed, or non-numeric
  - Applied to primary capture path, `ORDER_ALREADY_CAPTURED` reconciliation, and `COMPLETED` order reconciliation

### 6.2 Webhook Event Identity (Finding 2)
- **Issue:** `event.id` was not strictly required; fell back to `paypal-transmission-id` as deduplication identifier.
- **Fix:** Modified `processWebhook` in `backend/src/services/paypal.ts`:
  - Strictly requires `event.id` (throws if missing, empty, or non-string)
  - Never uses `paypal-transmission-id` as fallback for event identity
  - Stores `transmission_id` separately in `webhook_events` table
  - PostgreSQL `PRIMARY KEY (id)` on `webhook_events` enforces unique constraint
  - Duplicate events with different transmission IDs correctly rejected by DB constraint

### 6.3 Distributed Capture Protection (Finding 3)
- **Issue:** In-memory `Set` for capture locking only protected single instance; no cross-instance protection.
- **Fix:** Implemented persistent `capture_attempts` table with lease/heartbeat mechanism in `backend/src/db/index.ts` and `backend/src/services/paypal.ts`:
  - Atomic `INSERT` with unique constraint on `paypal_order_id` ensures exactly one capture attempt per order across instances
  - 5-minute lease (`lease_expires_at`) with 2-minute heartbeat renewal (`last_heartbeat_at`, `lease_owner`)
  - Stale lease detection (>5 min expiry) with safe reconciliation before takeover
  - `PayPal-Request-Id` header (`CAP-${orderId}`) provides API-level idempotency on capture requests
  - Database row-level locking (`FOR UPDATE` on `payments` and `budget_config`) in `executePaymentCaptureTransaction`
  - Ensures exactly one financial settlement per order across separate service instances
  - Schema: `backend/src/db/schema.sql` and `supabase.sql` include `capture_attempts` table with lease/heartbeat fields and indexes

### 6.4 CI Reproducibility (Finding 4)
- **Issue:** `npm ci || npm install` fallback masked missing lockfiles; schema validation was string-only.
- **Fix:** Updated `.github/workflows/ci.yml`:
  - Strict `npm ci` only (no fallback) for all modules
  - Pre-flight lockfile existence check for all 5 modules
  - PostgreSQL migration validation: applies `schema.sql` and `supabase.sql` to live PostgreSQL, verifies constraints
  - Test counts extracted from actual test output (not hardcoded)
  - Critical dependency vulnerability scanning remains blocking

### 6.5 Documentation (Finding 5)
- **Fix:** Removed `FINAL_PRE_DEPLOYMENT_AUDIT_REPORT.md` and `PRE_DEPLOYMENT_AUDIT_REPORT.md` from `.gitignore`
- **Fix:** This report identifies the audited implementation commit and records the verification commit separately.
- **Fix:** Test counts updated post-execution (see Section 7)

---

## 7. Test Suite Execution & Verification Evidence (Post-Patch)

*Local verification was executed on November 10, 2026. The local backend suite was blocked by the unreachable workstation Supabase hostname. GitHub Actions run 42815619041 independently verified the PostgreSQL migrations and full CI pipeline. PayPal tests used automated test/demo fulfillment and mocked reconciliation responses; no real Sandbox transaction is claimed.*

### 7.1 Unit & Integration Test Summary
| Suite | Command | Total | Passed | Failed | Skipped | Duration |
|---|---|---|---|---|---|---|---|
| **Inventory Intelligence (Demand Forecasting)** | `npm --prefix intelligence test` | 7 | 7 | 0 | 0 | 240 ms |
| **Supplier Intelligence (Optimization & Scoring)** | `npm --prefix supplier-intelligence test` | 13 | 13 | 0 | 0 | 299 ms |
| **Backend API, Security, DB & PayPal (CI)** | `npm --prefix backend test` | 119 | 119 | 0 | 0 | 2.8 s |
| **Combined CI test total** | 7 + 13 + 119 | **139** | **139** | **0** | **0** | Run 42815619041 |

### 7.2 Production Build Verification
| Component | Command | Result | Output Details |
|---|---|---|---|
| **Backend Build** | `npm --prefix backend run build` (tsc) | **EXIT 0** | Clean TypeScript compilation to `dist/` |
| **Frontend Next.js Build** | `npm --prefix frontend run build` | **EXIT 0** | 11/11 static pages prerendered, all chunks optimized |
| **Frontend Code Quality** | `npm --prefix frontend run lint` | **EXIT 0** | ESLint verified across all routes and components (warnings only) |

### 7.3 PayPal Capture & Webhook Validation Tests
*Specific test results for the patched findings from backend test suite:*
- ✅ **PayPal capture validation (strict field requirements)** — Tests: "Full Procurement-to-Payment Lifecycle", "PayPal Webhook: Invalid signature rejected", "PayPal Webhook: Valid event processed and duplicate rejected"
- ✅ **Webhook duplicate with different transmission IDs** — Tests: "Webhook Security: Rejects invalid certificate origin and detects duplicates", "PayPal Webhook: Valid event is processed and duplicate is safely rejected" — Both verify duplicate rejection by `event.id` with different `transmissionId`
- ✅ **Procurement-to-payment integration test** — "Full Procurement-to-Payment Lifecycle: Approve -> PayPal Order -> Capture -> Audit" (PASS, 24.7s)
- ✅ **Idempotent re-capture protection** — "Full Procurement-to-Payment Lifecycle" verifies second capture returns existing completed capture
- ✅ **Budget ceiling protection** — "Budget Safety: Database transaction rejects payment capture when budget ceiling is exceeded" (PASS)
- ✅ **Fail-closed auth on DB outage** — "Auth Security: Fail-closed verification rejects tokens when database revocation checks fail" (PASS)

### 7.4 Distributed Capture & Reconciliation Regression Tests
*New regression test suite covering critical PayPal capture scenarios from audit remediation:*
- ✅ **Capture lease/heartbeat** — Lock acquisition, renewal, expiry detection, takeover after 5-min lease expiry
- ✅ **Reconciliation** — Expired lease with PayPal IDs triggers RECONCILE, forceNewAttempt after APPROVED/COMPLETED
- ✅ **Idempotency** — Repeated reconciliation is idempotent (no double-spend), webhook duplicate rejection
- ✅ **Concurrency** — Multiple instances competing for same order; exactly one succeeds via partial unique index
- ✅ **Lease ownership** — Previous lease owner cannot settle after takeover; verifyLeaseOwnership prevents race conditions
- ✅ **Heartbeat loss** — Heartbeat loss during capture aborts operation (lease expired)
- ✅ **Legacy upgrade** — Migration from legacy schema (no lease columns, no created_by_user_id) works correctly
- ✅ **CI assertions** — Validates partial unique index, lease columns, created_by_user_id FK exist

### 7.4 Sandbox Integration Evidence (Post-Patch)
No real PayPal Sandbox transaction was independently executed or evidenced in this audit. The observed backend captures were explicitly automated test/demo fulfillment.

---

## 8. Pre-Deployment Checklist

- [x] GitHub Actions module tests passing: intelligence 7/7, supplier-intelligence 13/13, backend 119/119.
- [ ] Local backend suite independently rerun against reachable PostgreSQL (blocked by workstation Supabase DNS failure).
- [x] Backend TypeScript build succeeds without errors (`tsc`).
- [x] Frontend Next.js build succeeds with all 11 routes compiled (`next build`).
- [x] Frontend linting passes without errors (`next lint`).
- [x] Bcrypt password hashing active for all user credentials (10 rounds).
- [x] Cryptographic JWT signature, expiration, and header verification active.
- [x] Persistent session and token revocation enabled via `revoked_tokens` table.
- [x] Fail-closed authentication active when database connection fails.
- [x] Fresh PostgreSQL schema validation passed in GitHub Actions.
- [x] Legacy PostgreSQL upgrade validation passed in GitHub Actions.
- [x] Manager approval required prior to PayPal order creation; modifications invalidate approval.
- [x] In-flight mutual-exclusion capture lock active on PayPal captures (distributed via `capture_attempts` table with lease/heartbeat).
- [x] PayPal webhook signature verification and duplicate event rejection active using `event.id`.
- [x] Role-Based Access Control verified (Buyer vs Approver vs Treasury).
- [x] CI pipeline is configured with reproducible `npm ci`, migration validation, builds, tests, and blocking critical audit checks.
- [x] Latest GitHub Actions run independently verified: [42815619041](https://github.com/kapil31jangid/Stockwise-Pay/actions/runs/42815619041).
- [ ] Configure production PayPal Live credentials (for real customer payments).
- [ ] Register HTTPS production webhook URL in PayPal Developer Portal.

---

**Report Approved by:** Lead Application Security Architect & Full-Stack Engineering Team  
**StockWise Pay Version:** 1.0.0-rc3  
**Latest Verified Implementation Commit:** `728064849771d9d166e5c4724bdd1840d836be08`
**GitHub Actions Run:** `42815619041` — PASS
**Audit documentation commit:** updated after implementation verification; see repository history.

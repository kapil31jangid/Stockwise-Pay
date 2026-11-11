# PayPal Sandbox Testing Guide

This guide covers creating Sandbox test accounts, configuring the StockWise Pay application, testing the complete checkout and capture lifecycle, and troubleshooting common issues.

---

## Table of Contents

1. [Sandbox vs Live Environment](#sandbox-vs-live-environment)
2. [Creating a PayPal Developer Account](#creating-a-paypal-developer-account)
3. [Creating a Sandbox REST Application](#creating-a-sandbox-rest-application)
4. [Creating Sandbox Test Accounts](#creating-sandbox-test-accounts)
5. [Configuring StockWise Pay](#configuring-stockwise-pay)
6. [Testing the Complete Payment Flow](#testing-the-complete-payment-flow)
7. [Verifying Payments in Sandbox Accounts](#verifying-payments-in-sandbox-accounts)
8. [Webhook Configuration](#webhook-configuration)
9. [Common Issues and Solutions](#common-issues-and-solutions)
10. [Test Account Credentials Template](#test-account-credentials-template)

---

## Sandbox vs Live Environment

| Aspect | Sandbox | Live |
|--------|---------|------|
| **Base URL** | `https://api-m.sandbox.paypal.com` | `https://api-m.paypal.com` |
| **Money** | Fake/test currency | Real money |
| **Accounts** | Developer-created test accounts | Real PayPal accounts |
| **Credentials** | From Sandbox REST app | From Live REST app |
| **Webhooks** | Sandbox webhook simulator | Production webhooks |
| **Use Case** | Development, testing, CI/CD | Production transactions |

> **Critical**: StockWise Pay is currently configured for **Sandbox only**. The `PAYPAL_API_BASE` defaults to `https://api-m.sandbox.paypal.com`. Live mode would require changing this URL and using Live credentials.

---

## Creating a PayPal Developer Account

1. Go to [https://developer.paypal.com/](https://developer.paypal.com/)
2. Click **Sign Up** or **Log In**
3. Use a real email address (you'll receive verification emails)
4. Complete email verification
5. Access the **Developer Dashboard**

---

## Creating a Sandbox REST Application

The REST application provides the **Client ID** and **Client Secret** used by both frontend and backend.

1. In Developer Dashboard → **My Apps & Credentials**
2. Under **Sandbox** section, click **Create App**
3. Fill in:
   - **App Name**: `StockWise Pay Sandbox` (or your preferred name)
   - **App Type**: **Merchant** (Business)
   - **Sandbox Business Account**: Select or create one (see below)
4. Click **Create App**
5. **Copy and save**:
   - **Client ID** (public, used in frontend and backend)
   - **Secret** (private, **backend only**)

> **Important**: Use the **same REST application** for both frontend (`NEXT_PUBLIC_PAYPAL_CLIENT_ID`) and backend (`PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`). The Client ID must match exactly.

---

## Creating Sandbox Test Accounts

You need **two** Sandbox accounts:

### 1. Business Sandbox Seller (Merchant)

**Purpose**: Receives test payments, acts as the supplier/merchant

1. Developer Dashboard → **Sandbox** → **Accounts**
2. Click **Create Account**
3. Configure:
   - **Account Type**: **Business**
   - **Country**: United States (or your target market)
   - **Currency**: **USD** (StockWise Pay uses USD exclusively)
   - **Email**: Auto-generated (e.g., `sb-xxxxx_business@example.com`)
   - **Password**: Auto-generated or set custom
   - **PayPal Balance**: Set a high amount (e.g., 999999) for testing
4. Click **Create Account**
5. **Note the email and password** — you'll use these to log in as the merchant

### 2. Personal Sandbox Buyer (Customer)

**Purpose**: Approves test payments, acts as the buyer

1. Developer Dashboard → **Sandbox** → **Accounts**
2. Click **Create Account**
3. Configure:
   - **Account Type**: **Personal**
   - **Country**: United States
   - **Currency**: **USD**
   - **Email**: Auto-generated (e.g., `sb-xxxxx_personal@example.com`)
   - **Password**: Auto-generated or set custom
   - **Bank/Credit Card**: Add a test card (Sandbox provides test card numbers)
   - **PayPal Balance**: Set a high amount
4. Click **Create Account**
5. **Note the email and password** — you'll use these during checkout

### Test Card Numbers (Sandbox)

Use these in the Personal account for funding:

| Card Type | Number | Expiry | CVV |
|-----------|--------|--------|-----|
| Visa | 4032039318482098 | 12/2030 | 123 |
| Mastercard | 5555555555554444 | 12/2030 | 123 |
| Amex | 378282246310005 | 12/2030 | 1234 |

---

## Configuring StockWise Pay

### Backend Environment (`backend/.env`)

```bash
# PayPal Sandbox Configuration
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
PAYPAL_CLIENT_ID=AbCdEfGhIjKlMnOpQrStUvWxYz1234567890  # From Sandbox REST app
PAYPAL_CLIENT_SECRET=ZyXwVuTsRqPoNmLkJiHgFeDcBa0987654321  # From Sandbox REST app
PAYPAL_WEBHOOK_ID=WH-Sandbox-Webhook-Id-Here  # From webhook config (optional)
PAYPAL_SIMULATION_ENABLED=false  # Must be false for real Sandbox transactions
```

### Frontend Environment (`frontend/.env.local`)

```bash
# Frontend PayPal Configuration
NEXT_PUBLIC_API_URL=http://localhost:5000/api  # Or deployed backend URL
NEXT_PUBLIC_PAYPAL_CLIENT_ID=AbCdEfGhIjKlMnOpQrStUvWxYz1234567890  # SAME as backend
```

### Production/Deployed Environment

**Render (Backend)**:
- Set all backend variables in Render Environment tab
- Mark `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `JWT_SECRET` as **Secret**

**Vercel (Frontend)**:
- Set `NEXT_PUBLIC_API_URL` = `https://your-render-app.onrender.com/api`
- Set `NEXT_PUBLIC_PAYPAL_CLIENT_ID` = Same Client ID as backend

---

## Testing the Complete Payment Flow

### Prerequisites

- Backend running (`npm run dev:backend` or deployed)
- Frontend running (`npm run dev:frontend` or deployed)
- PayPal Sandbox credentials configured
- Database migrated (`npm run migrate`)

### Step-by-Step Test

#### 1. Log In as Approver

1. Open frontend: `http://localhost:3000` (or deployed URL)
2. Redirect to `/login`
3. Click **Marcus Vance** (LEAD_APPROVER) — `marcus.vance@stockwisepay.com` / `ApproverPass2026!`
4. Verify dashboard loads with inventory data

#### 2. Generate a Purchase Plan

1. Navigate to **Purchase Planner** (`/planner`)
2. Set budget: `2000`
3. Select preference: `Balanced`
4. Click **Generate Plan**
5. Verify plan created with items, total, and status `PENDING_APPROVAL`

#### 3. Approve the Plan

1. Go to **Payments** (`/payments`)
2. Select the generated plan (should show "AWAITING APPROVAL")
3. Click **Approve Plan as Manager**
4. Verify:
   - Toast/notification: "Plan approved successfully"
   - Plan status badge: "APPROVED • READY TO PAY"
   - PayPal Checkout button enabled

#### 4. Initiate PayPal Checkout

1. Click **PayPal Checkout** button
2. PayPal Smart Buttons render in the right panel
3. Click **PayPal** button (or "Pay with PayPal")
4. **PayPal Sandbox login window opens**

#### 5. Complete Buyer Approval

1. In PayPal window, log in with **Personal Sandbox Buyer** credentials:
   - Email: `sb-xxxxx_personal@example.com` (your buyer account)
   - Password: (your buyer password)
2. Review payment details (amount, merchant name)
3. Click **Pay Now** / **Approve**
4. Window closes, returns to StockWise Pay

#### 6. Verify Capture and Settlement

1. Frontend shows: "Payment Captured Successfully!"
2. Displays:
   - Sandbox Order ID
   - "Supplier purchase orders have been triggered"
3. Click **Done**
4. Verify in Payments table:
   - New row with status **COMPLETED**
   - PayPal Transaction ID (capture ID)
   - Correct amount

#### 7. Verify Plan Status Update

1. Go to **Purchase Planner** or **Dashboard**
2. Find the plan → Status should be **PAID** / **SETTLED**

---

## Verifying Payments in Sandbox Accounts

### Business Sandbox Seller (Merchant View)

1. Go to [https://www.sandbox.paypal.com/](https://www.sandbox.paypal.com/)
2. Log in with **Business Sandbox Seller** credentials
3. Navigate to **Activity** → **All Transactions**
3. Find the transaction:
   - **Status**: Completed
   - **Amount**: Matches plan total (e.g., $1,816.00 USD)
   - **Type**: Payment Received
   - **From**: Personal buyer email
4. Click transaction for details:
   - **Transaction ID**: PayPal capture ID
   - **Invoice ID**: `INV-PLAN-...` (from StockWise Pay)
   - **Custom ID**: `PLAN-ID:v1` (plan reference)

### Personal Sandbox Buyer (Customer View)

1. Go to [https://www.sandbox.paypal.com/](https://www.sandbox.paypal.com/)
2. Log in with **Personal Sandbox Buyer** credentials
3. Navigate to **Activity** → **All Transactions**
3. Find the transaction:
   - **Status**: Completed
   - **Amount**: Same as merchant view (negative)
   - **Type**: Payment Sent
   - **To**: Business seller email

### Developer Dashboard (Unified View)

1. Developer Dashboard → **Sandbox** → **Accounts**
2. Click **Business Account** → **View Details** → **Notifications**
3. See webhook events, IPN history, and transaction logs

---

## Webhook Configuration

### For Local Development (ngrok)

1. Install ngrok: `npm install -g ngrok` or download from ngrok.com
2. Start tunnel: `ngrok http 5000`
3. Copy HTTPS URL: `https://xxxx-xx-xx-xx.ngrok-free.app`
4. PayPal Developer Dashboard → **My Apps & Credentials** → Select Sandbox App
5. **Webhooks** → **Add Webhook**
6. **Webhook URL**: `https://xxxx-xx-xx-xx.ngrok-free.app/api/paypal/webhook`
7. **Event Types**: Select:
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.DENIED`
   - `PAYMENT.CAPTURE.REFUNDED`
   - `CHECKOUT.ORDER.APPROVED`
   - `CHECKOUT.ORDER.COMPLETED`
8. Save → Copy **Webhook ID** → Add to `PAYPAL_WEBHOOK_ID` in `backend/.env`

### For Deployed Backend (Render)

1. Render Web Service URL: `https://your-app.onrender.com`
2. Webhook URL: `https://your-app.onrender.com/api/paypal/webhook`
3. Configure in PayPal Dashboard as above
3. Set `PAYPAL_WEBHOOK_ID` in Render Environment Variables

### Webhook Testing

1. PayPal Dashboard → Webhooks → **Simulate Event**
2. Select `PAYMENT.CAPTURE.COMPLETED`
3. Send test event
4. Check Render logs:
   ```
   [PayPal Webhook] Verified event: PAYMENT.CAPTURE.COMPLETED
   [PayPal Webhook] Processing capture for order: 8XX123456789
   ```

---

## Common Issues and Solutions

### Issue: "PayPal Sandbox credentials are not configured"

**Cause**: Missing `PAYPAL_CLIENT_ID` or `PAYPAL_CLIENT_SECRET` in backend `.env`

**Fix**:
```bash
# backend/.env
PAYPAL_CLIENT_ID=your_actual_client_id
PAYPAL_CLIENT_SECRET=your_actual_secret
```

### Issue: "Invalid client ID" / "Client ID mismatch"

**Cause**: Frontend and backend using different Client IDs

**Fix**: Ensure `NEXT_PUBLIC_PAYPAL_CLIENT_ID` (frontend) == `PAYPAL_CLIENT_ID` (backend) from the **same** Sandbox REST app.

### Issue: "Buyer has not authorized payment" (ORDER_NOT_APPROVED)

**Cause**: PayPal checkout not completed by buyer

**Fix**: 
- Complete the PayPal Sandbox checkout flow
- Log in as **Personal Sandbox Buyer**
- Click **Pay Now** / **Approve**

### Issue: "Amount mismatch between local record and PayPal order"

**Cause**: Plan was modified after PayPal order creation

**Fix**: 
- Plan modifications invalidate approval
- Re-approve plan → Creates new version → Create new PayPal order

### Issue: "Capture lock held by another instance"

**Cause**: Concurrent capture attempts (multiple tabs, retries)

**Fix**: 
- Wait 5 minutes for lease expiry
- Or check `capture_attempts` table for stuck records
- The system auto-reconciles expired leases

### Issue: "Budget ceiling exceeded"

**Cause**: Plan total > monthly budget - spent - allocated

**Fix**:
- Increase monthly budget via `/api/budget` PATCH
- Or reduce plan total (regenerate with lower budget)

### Issue: PayPal buttons don't render

**Cause**: Missing `NEXT_PUBLIC_PAYPAL_CLIENT_ID` or wrong value

**Fix**:
```bash
# frontend/.env.local
NEXT_PUBLIC_PAYPAL_CLIENT_ID=your_exact_client_id_from_same_app
```

### Issue: CORS error in browser console

**Cause**: Backend `FRONTEND_URL` doesn't match frontend origin

**Fix**:
```bash
# backend/.env (or Render env)
FRONTEND_URL=https://your-exact-vercel-url.vercel.app
```

### Issue: Webhook verification fails

**Cause**: `PAYPAL_WEBHOOK_ID` mismatch or wrong webhook URL

**Fix**:
- Verify webhook URL in PayPal Dashboard matches `https://your-backend/api/paypal/webhook`
- Copy exact Webhook ID from PayPal to `PAYPAL_WEBHOOK_ID`

---

## Test Account Credentials Template

**Fill in locally — do not commit to Git**

### Business Sandbox Seller (Merchant)

| Field | Value |
|-------|-------|
| Email | `sb-xxxxx_business@example.com` |
| Password | `[your_password]` |
| Purpose | Receives payments, views merchant transactions |
| PayPal Login | https://www.sandbox.paypal.com/ |

### Personal Sandbox Buyer (Customer)

| Field | Value |
|-------|-------|
| Email | `sb-xxxxx_personal@example.com` |
| Password | `[your_password]` |
| Purpose | Approves checkout payments |
| Test Card | 4032039318482098 (Visa) / 12/2030 / 123 |
| PayPal Login | https://www.sandbox.paypal.com/ |

### PayPal REST Application (Shared)

| Field | Value |
|-------|-------|
| App Name | `StockWise Pay Sandbox` |
| Client ID | `AbCdEfGhIjKlMnOpQrStUvWxYz1234567890` |
| Secret | `ZyXwVuTsRqPoNmLkJiHgFeDcBa0987654321` |
| Webhook ID | `WH-Sandbox-Webhook-Id-Here` |
| Dashboard | https://developer.paypal.com/dashboard/applications/sandbox |

### StockWise Pay Demo Accounts (Pre-seeded)

| Role | Email | Password |
|------|-------|----------|
| Inventory Lead / Approver (LEAD_APPROVER) | `marcus.vance@stockwisepay.com` | `ApproverPass2026!` |
| Procurement Specialist (BUYER) | `elena.rostova@stockwisepay.com` | `BuyerPass2026!` |
| Chief Financial Officer (TREASURY) | `david.chen@stockwisepay.com` | `TreasuryPass2026!` |

---

## Payment Verification Checklist

Use this checklist when testing the complete flow:

- [ ] Sandbox buyer can access checkout (Personal account login works)
- [ ] PayPal Smart Buttons render without console errors
- [ ] Backend creates a PayPal order (check `/api/paypal/orders` response)
- [ ] Order amount matches approved plan total exactly
- [ ] Buyer can approve the order in PayPal Sandbox
- [ ] Backend captures the approved order (check capture response)
- [ ] Capture response validated (amount, currency, capture ID)
- [ ] Payment status updates to COMPLETED in application
- [ ] Budget/payment records update correctly (spent + allocated)
- [ ] Duplicate capture attempts handled safely (idempotent)
- [ ] Failed/cancelled payments do not mark as successful
- [ ] Payment details verifiable in Sandbox Business account
- [ ] Audit log entry created for capture event
- [ ] Plan status updates to PAID

> **Important**: Do not claim a successful payment unless an actual Sandbox transaction has been performed and verified in both the application and the PayPal Sandbox Business account.

---

## Simulation Mode vs Real Sandbox

| Mode | `PAYPAL_SIMULATION_ENABLED` | Behavior |
|------|----------------------------|----------|
| **Real Sandbox** | `false` (default) | Real PayPal API calls, real Sandbox transactions, requires credentials |
| **Simulation** | `true` | Mock order/capture, no PayPal API calls, for UI testing only |

**Simulation mode is NOT a substitute for Sandbox testing.** It creates fake order IDs and capture IDs but does not exercise the real PayPal integration. Always test with `PAYPAL_SIMULATION_ENABLED=false` and real Sandbox credentials before deployment.

---

## Additional Resources

- [PayPal Developer Documentation](https://developer.paypal.com/docs/)
- [PayPal Orders v2 API Reference](https://developer.paypal.com/docs/api/orders/v2/)
- [PayPal Sandbox Testing Guide](https://developer.paypal.com/docs/classic/paypal-standard/integration-guide/test-accounts/)
- [PayPal Webhook Simulator](https://developer.paypal.com/docs/api-basics/notifications/webhooks/simulate-events/)
- [StockWise Pay Deployment Guide](DEPLOYMENT.md)
- [StockWise Pay Main README](../README.md)
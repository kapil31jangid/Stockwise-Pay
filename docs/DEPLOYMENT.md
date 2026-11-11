# StockWise Pay Deployment Guide

**Target Architecture**: Vercel (Frontend) + Render (Backend + PostgreSQL)

This guide provides step-by-step, reproducible deployment instructions for the StockWise Pay application.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Backend Deployment on Render](#backend-deployment-on-render)
4. [Frontend Deployment on Vercel](#frontend-deployment-on-vercel)
5. [Connecting Frontend and Backend](#connecting-frontend-and-backend)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Redeployment Procedures](#redeployment-procedures)
8. [Environment Variable Reference](#environment-variable-reference)
9. [Troubleshooting Deployment Issues](#troubleshooting-deployment-issues)

---

## Prerequisites

- **GitHub Repository**: `https://github.com/kapil31jangid/Stockwise-Pay`
- **Render Account**: For backend hosting and PostgreSQL
- **Vercel Account**: For frontend hosting
- **PayPal Developer Account**: Sandbox REST application with Client ID, Secret, Webhook ID
- **Domain (Optional)**: For custom domain configuration

---

## Architecture Overview

```
┌─────────────────┐     HTTPS      ┌─────────────────┐     HTTPS      ┌──────────────────┐
│   Vercel        │◄──────────────►│   Render        │◄──────────────►│  Render          │
│   (Frontend)    │  API Calls     │   (Backend)     │  PostgreSQL    │  PostgreSQL      │
│   Next.js 14    │                │   Express + TS  │  (Managed)     │                  │
└─────────────────┘                └─────────────────┘                └──────────────────┘
        │                                    │
        │                                    │
        ▼                                    ▼
┌─────────────────┐                ┌─────────────────┐
│  PayPal         │◄──────────────►│  PayPal         │
│  Smart Buttons  │  Orders v2     │  Sandbox API    │
│  (Client-side)  │                │                 │
└─────────────────┘                └─────────────────┘
```

**Data Flow**:
1. User interacts with Next.js frontend on Vercel
2. Frontend calls `NEXT_PUBLIC_API_URL` (Render backend)
3. Backend validates JWT, enforces RBAC, executes business logic
4. PayPal operations: Backend ↔ PayPal Sandbox API (server-to-server)
5. PayPal Smart Buttons: Frontend ↔ PayPal (client-side, same Sandbox app)
6. Database: Backend ↔ Render PostgreSQL (private network)

---

## Backend Deployment on Render

### Step 1: Create Render Account and Connect GitHub

1. Go to [https://render.com](https://render.com) and sign up/sign in
2. Navigate to **Dashboard** → **New** → **Web Service**
3. Connect your GitHub account if not already connected
4. Select repository: `kapil31jangid/Stockwise-Pay`

### Step 2: Configure Web Service

| Setting | Value | Notes |
|---------|-------|-------|
| **Name** | `stockwise-pay-api` | Or your preferred name |
| **Region** | Choose closest to users | e.g., `Oregon (US West)` |
| **Root Directory** | `backend` | **Critical: Must be `backend`** |
| **Runtime** | `Node` | Auto-detected from `package.json` |
| **Build Command** | `npm ci && npm run build` | Uses lockfile for reproducible build |
| **Start Command** | `npm start` | Runs `node dist/index.js` |

### Step 3: Add Environment Variables

In the Render Web Service dashboard → **Environment** tab, add each variable:

#### Required for Production

| Key | Value | Type | Notes |
|-----|-------|------|-------|
| `NODE_ENV` | `production` | Public | |
| `FRONTEND_URL` | `https://your-vercel-app.vercel.app` | Public | Set after Vercel deploy |
| `DATABASE_URL` | `postgresql://...` | **Secret** | From Render PostgreSQL (Step 4) |
| `PAYPAL_API_BASE` | `https://api-m.sandbox.paypal.com` | Public | Sandbox endpoint |
| `PAYPAL_CLIENT_ID` | `your_sandbox_client_id` | **Secret** | From PayPal Sandbox REST app |
| `PAYPAL_CLIENT_SECRET` | `your_sandbox_client_secret` | **Secret** | From PayPal Sandbox REST app |
| `PAYPAL_WEBHOOK_ID` | `your_webhook_id` | **Secret** | From PayPal webhook config |
| `JWT_SECRET` | `32+ char random string` | **Secret** | Generate: `openssl rand -base64 32` |

#### Optional

| Key | Value | Type | Notes |
|-----|-------|------|-------|
| `PAYPAL_SIMULATION_ENABLED` | `false` | Public | Must be `false` for real payments |
| `GEMINI_API_KEY` | `...` | **Secret** | If using AI features |
| `OPENAI_API_KEY` | `...` | **Secret** | If using AI features |

> ⚠️ **Security**: Mark `PAYPAL_CLIENT_SECRET`, `JWT_SECRET`, `DATABASE_URL`, `PAYPAL_WEBHOOK_ID`, `GEMINI_API_KEY`, `OPENAI_API_KEY` as **Secret** in Render UI (lock icon).

### Step 4: Provision Render PostgreSQL

1. In Render Dashboard → **New** → **PostgreSQL**
2. Configure:
   - **Name**: `stockwise-pay-db`
   - **Database**: `stockwise_pay`
   - **User**: `postgres` (auto-generated)
   - **Region**: Same as Web Service
   - **Plan**: Starter or higher
3. Click **Create Database**
4. Wait for provisioning (2-3 minutes)
5. Copy **External Database URL** (format: `postgresql://user:pass@host:port/db`)
6. Paste into `DATABASE_URL` in Web Service Environment Variables
7. **Save Changes** → Triggers redeploy

### Step 5: Run Database Migrations

After the first deploy (which will fail without tables):

1. In Render Web Service dashboard → **Shell** tab
2. Run:
   ```bash
   npm run migrate
   ```
3. Expected output:
   ```
   🔄 Connecting to Supabase PostgreSQL database...
   ✅ Successfully connected to Supabase PostgreSQL!
   📄 Executing database schema & seed migration...
   🎉 Supabase tables and seed data created successfully!
   📋 Found 16 tables in public schema:
      - approvals
      - audit_logs
      - budget_config
      - capture_attempts
      - inventory_imports
      - payments
      - plan_versions
      - products
      - revoked_tokens
      - supplier_offers
      - suppliers
      - users
      - webhook_events
      - ai_agent_runs
      - payment_events
   📦 Seed Products Count: 6
   🚀 Supabase is 100% ready for deployment!
   ```

### Step 6: Configure CORS for Vercel Frontend

Once Vercel frontend is deployed (Step B), update `FRONTEND_URL`:

1. Render Web Service → **Environment** → Edit `FRONTEND_URL`
2. Value: `https://your-vercel-app.vercel.app` (exact Vercel URL)
3. Save → Auto-redeploy

### Step 7: Configure Health Check

In Render Web Service → **Settings**:
- **Health Check Path**: `/api/health`
- The backend responds to `GET /api/health` and `GET /health` with:
  ```json
  {
    "status": "ok",
    "service": "StockWise Pay API Server",
    "environment": "production",
    "persistenceMode": "postgres",
    "paypalConfigured": true,
    "timestamp": "2026-11-11T..."
  }
  ```

### Step 8: Verify Backend Deployment

1. Wait for deploy to complete (green status)
2. Open health check: `https://your-render-app.onrender.com/api/health`
3. Verify JSON response shows `"status": "ok"` and `"persistenceMode": "postgres"`
4. Test API: `https://your-render-app.onrender.com/api/inventory`

---

## Frontend Deployment on Vercel

### Step 1: Import Repository

1. Go to [https://vercel.com](https://vercel.com) and sign up/sign in
2. Click **Add New** → **Project**
3. Import `kapil31jangid/Stockwise-Pay` from GitHub

### Step 2: Configure Project Settings

| Setting | Value | Notes |
|---------|-------|-------|
| **Framework Preset** | `Next.js` | Auto-detected |
| **Root Directory** | `frontend` | **Critical: Must be `frontend`** |
| **Build Command** | `npm run build` | Auto-detected from `package.json` |
| **Output Directory** | `.next` | Auto-detected |
| **Install Command** | `npm ci` | Auto-detected |
| **Node.js Version** | `20.x` | Or latest LTS |

### Step 3: Set Environment Variables

In Vercel Project Settings → **Environment Variables**, add for **Production** and **Preview**:

| Key | Value | Notes |
|-----|-------|-------|
| `NEXT_PUBLIC_API_URL` | `https://your-render-app.onrender.com/api` | **Must match Render backend URL + `/api`** |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | `your_sandbox_client_id` | **Must match backend `PAYPAL_CLIENT_ID` exactly** |

> ⚠️ **Critical**: `NEXT_PUBLIC_PAYPAL_CLIENT_ID` must come from the **same PayPal Sandbox REST application** as the backend credentials.

### Step 4: Deploy

1. Click **Deploy**
2. Wait for build (2-3 minutes)
3. Vercel provides URL: `https://your-app.vercel.app`

### Step 5: Custom Domain (Optional)

1. Vercel Project Settings → **Domains**
2. Click **Add** → Enter your domain (e.g., `pay.stockwise.example.com`)
3. Configure DNS as instructed:
   - **A Record**: `76.76.21.21` (Vercel edge)
   - **CNAME**: `cname.vercel-dns.com` (for www subdomain)
4. Vercel provisions SSL automatically

### Step 6: Update Backend CORS

After Vercel deployment, update Render backend `FRONTEND_URL` with the exact Vercel URL (including custom domain if used).

---

## Connecting Frontend and Backend

### Correct Order of Operations

Follow this exact sequence to avoid CORS and credential mismatches:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. DEPLOY BACKEND (Render)                                     │
│     - Create Web Service with rootDir=backend                   │
│     - Provision PostgreSQL, set DATABASE_URL                    │
│     - Run npm run migrate                                       │
│     - Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, JWT_SECRET   │
│     - Deploy and verify /api/health                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. DEPLOY FRONTEND (Vercel)                                    │
│     - Import repo with rootDir=frontend                         │
│     - Set NEXT_PUBLIC_API_URL = Render backend URL + /api       │
│     - Set NEXT_PUBLIC_PAYPAL_CLIENT_ID = same as backend       │
│     - Deploy                                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. CONNECT: Update Backend CORS                                │
│     - Render: FRONTEND_URL = Vercel frontend URL                │
│     - Save → Auto-redeploy                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. VERIFY END-TO-END                                           │
│     - Visit Vercel frontend                                     │
│     - Log in with demo credentials                              │
│     - Verify inventory loads from backend                       │
│     - Generate plan → Approve → PayPal Checkout → Capture       │
└─────────────────────────────────────────────────────────────────┘
```

### Credential Matching Requirements

| Credential | Backend (Render) | Frontend (Vercel) | Must Match? |
|------------|------------------|-------------------|-------------|
| PayPal Client ID | `PAYPAL_CLIENT_ID` | `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | **YES** (same Sandbox REST app) |
| PayPal Client Secret | `PAYPAL_CLIENT_SECRET` | (never in frontend) | N/A |
| API URL | (serves at `/api`) | `NEXT_PUBLIC_API_URL` | Frontend must point to backend |

---

## Post-Deployment Verification

### Health Checks

| Check | URL | Expected |
|-------|-----|----------|
| Backend Health | `https://your-render-app.onrender.com/api/health` | `{"status":"ok","persistenceMode":"postgres"}` |
| Frontend Load | `https://your-vercel-app.vercel.app` | Dashboard loads, no console errors |
| API Connectivity | Frontend → Network tab → `/api/inventory` | 200 OK with product data |

### Authentication Test

1. Visit frontend URL
2. Redirect to `/login`
3. Click **Marcus Vance** (LEAD_APPROVER) demo account
4. Verify redirect to `/` (dashboard)
4. Check localStorage: `stockwise_jwt_token` present

### PayPal Sandbox Flow Test

1. Go to **Purchase Planner** → Generate plan with budget $2000
2. Go to **Payments** → Plan should show "AWAITING APPROVAL"
3. Click **Approve Plan as Manager** → Status: "APPROVED • READY TO PAY"
4. Click **PayPal Checkout** → PayPal Smart Buttons render
5. Log in with **Personal Sandbox Buyer** account
6. Approve payment
7. Frontend shows "Payment Captured Successfully!"
8. Plan status updates to "SETTLED / PAID"
9. Check **Business Sandbox Seller** account → Payment received

### Database Verification

In Render PostgreSQL shell or external client:
```sql
-- Verify tables exist
\dt

-- Check seed data
SELECT count(*) FROM products;           -- Should be 6
SELECT count(*) FROM suppliers;          -- Should be 4
SELECT count(*) FROM users;              -- Should be 3

-- Verify payment flow
SELECT * FROM payments ORDER BY created_at DESC LIMIT 5;
SELECT * FROM capture_attempts ORDER BY started_at DESC LIMIT 5;
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;
```

---

## Redeployment Procedures

### Backend (Render)

| Trigger | Action |
|---------|--------|
| Push to `main` | Auto-deploy (default) |
| Environment variable change | Auto-deploy |
| Manual | Dashboard → **Manual Deploy** → **Deploy latest commit** |
| Force rebuild | Dashboard → **Manual Deploy** → **Clear build cache & deploy** |

### Frontend (Vercel)

| Trigger | Action |
|---------|--------|
| Push to `main` | Auto-deploy (default) |
| Environment variable change | Auto-deploy |
| Manual | Dashboard → **Deployments** → **Redeploy** on latest |
| Force rebuild | Dashboard → **Deployments** → **Redeploy** with **Use existing Build Cache** unchecked |

### Database Migrations (After Schema Changes)

1. Render Web Service → **Shell**
2. Run: `npm run migrate`
3. Migration script (`supabase.sql`) is idempotent — safe to re-run

---

## Environment Variable Reference

### Backend (Render) — Complete List

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `production` | Runtime environment |
| `PORT` | No | (auto) | Render assigns automatically |
| `FRONTEND_URL` | Yes | `https://app.vercel.app` | CORS origin for frontend |
| `DATABASE_URL` | Yes | `postgresql://...` | Render PostgreSQL connection |
| `PAYPAL_API_BASE` | Yes | `https://api-m.sandbox.paypal.com` | Sandbox API base |
| `PAYPAL_CLIENT_ID` | Yes | `AbCd...` | Sandbox REST app Client ID |
| `PAYPAL_CLIENT_SECRET` | Yes | `XyZw...` | Sandbox REST app Secret |
| `PAYPAL_WEBHOOK_ID` | For webhooks | `WH-...` | PayPal webhook ID |
| `PAYPAL_SIMULATION_ENABLED` | No | `false` | Demo mode only |
| `JWT_SECRET` | Yes | `32+ chars` | HMAC signing key |
| `GEMINI_API_KEY` | No | `AI...` | Optional AI integration |
| `OPENAI_API_KEY` | No | `sk-...` | Optional AI integration |

### Frontend (Vercel) — Complete List

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | `https://api.render.com/api` | Backend API base URL |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Yes | `AbCd...` | Same as backend Client ID |

---

## Troubleshooting Deployment Issues

### Backend Deploy Fails

| Error | Cause | Fix |
|-------|-------|-----|
| `Build failed: TypeScript errors` | Type errors in backend/src | Run `npm --prefix backend run build` locally first |
| `Cannot find module '...'` | Missing dependency | Check `backend/package.json` dependencies |
| `DATABASE_URL not set` | PostgreSQL not linked | Provision Render PostgreSQL, copy External URL |
| `Migration failed: relation does not exist` | DB not migrated | Run `npm run migrate` in Render Shell |
| `JWT_SECRET required in production` | Missing secret | Generate 32+ char string, add to Render env |

### Frontend Deploy Fails

| Error | Cause | Fix |
|-------|-------|-----|
| `Build failed: Module not found` | Missing dependency | Check `frontend/package.json` dependencies |
| `NEXT_PUBLIC_API_URL not set` | Missing env var | Add in Vercel Project Settings → Environment Variables |
| `PayPal buttons don't render` | Client ID mismatch | Verify `NEXT_PUBLIC_PAYPAL_CLIENT_ID` matches backend |

### Runtime Errors

| Symptom | Cause | Fix |
|---------|-------|-----|
| `CORS error` in browser console | `FRONTEND_URL` mismatch | Update Render `FRONTEND_URL` to exact Vercel URL |
| `401 Unauthorized` on API calls | JWT secret mismatch | Ensure `JWT_SECRET` same across redeploys |
| `PayPal: Invalid client ID` | Sandbox app mismatch | Use same REST app for both frontend and backend |
| `Budget ceiling exceeded` | Plan total > monthly budget | Increase budget via `/api/budget` or reduce plan |

### PayPal Webhook Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Webhook not received | Wrong URL in PayPal config | Update webhook URL to `https://render-app.onrender.com/api/paypal/webhook` |
| `Verification failed` | `PAYPAL_WEBHOOK_ID` mismatch | Copy exact Webhook ID from PayPal dashboard |
| `Duplicate event` | Normal (idempotent) | Expected behavior; check logs for `DUPLICATE_REJECTED` |

---

## Security Checklist for Production

- [ ] `JWT_SECRET` is 32+ characters, randomly generated
- [ ] `PAYPAL_CLIENT_SECRET` only in Render (backend), never in Vercel or Git
- [ ] `DATABASE_URL` uses SSL (Render PostgreSQL enforces this)
- [ ] `FRONTEND_URL` is exact Vercel URL (no wildcards)
- [ ] `PAYPAL_SIMULATION_ENABLED=false` in production
- [ ] `NODE_ENV=production` set on both services
- [ ] PayPal Webhook URL uses HTTPS (Render provides this)
- [ ] Custom domains configured with HTTPS (Vercel/Render auto-provision)
- [ ] No `.env` files committed to Git (verified in `.gitignore`)
- [ ] Dependencies scanned for vulnerabilities (`npm audit --audit-level=critical`)

---

## Support Resources

- **Render Docs**: https://render.com/docs
- **Vercel Docs**: https://vercel.com/docs
- **PayPal Sandbox Testing**: https://developer.paypal.com/docs/classic/paypal-standard/integration-guide/test-accounts/
- **PayPal Orders v2 API**: https://developer.paypal.com/docs/api/orders/v2/
- **StockWise Pay Repository**: https://github.com/kapil31jangid/Stockwise-Pay
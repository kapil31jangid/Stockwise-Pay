<div align="center">

# ⚡ StockWise Pay

### Cash-Aware AI Restocking for Small Electronics Retailers

_Turn inventory signals into explainable, budget-safe purchase decisions._

Inventory intelligence · Supplier comparison · AI procurement planning · PayPal Sandbox settlement

[![Frontend](https://img.shields.io/badge/Frontend-Next.js%2014-000000.svg?logo=next.js)](frontend/)
[![Backend](https://img.shields.io/badge/Backend-Express%20%2B%20TypeScript-3178C6.svg?logo=typescript)](backend/)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%20%2F%20local%20store-336791.svg?logo=postgresql)](backend/src/db/)
[![Inventory AI](https://img.shields.io/badge/Inventory%20AI-Statistical%20Forecasting-4285F4.svg)](intelligence/)
[![Supplier Intelligence](https://img.shields.io/badge/Supplier%20Intelligence-Budget%20Optimization-7C3AED.svg)](supplier-intelligence/)
[![Payments](https://img.shields.io/badge/Payments-PayPal%20Sandbox-003087.svg?logo=paypal)](backend/src/routes/paypal.ts)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Solution Overview](#solution-overview)
- [Key Features](#key-features)
- [How StockWise Pay Works — End-to-End Workflow](#how-stockwise-pay-works---end-to-end-workflow)
- [PayPal Integration and Payment Lifecycle](#paypal-integration-and-payment-lifecycle)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Repository Structure](#repository-structure)
- [Screenshots / Demo](#screenshots--demo)
- [Prerequisites](#prerequisites)
- [Local Installation and Setup](#local-installation-and-setup)
- [Environment Variables](#environment-variables)
- [Database Setup and Migrations](#database-setup-and-migrations)
- [PayPal Sandbox Setup and Testing](#paypal-sandbox-setup-and-testing)
- [PayPal Sandbox Test Accounts](#paypal-sandbox-test-accounts)
- [Running Frontend and Backend Locally](#running-frontend-and-backend-locally)
- [Running Tests and Builds](#running-tests-and-builds)
- [Deployment Guide — Vercel Frontend and Render Backend](#deployment-guide---vercel-frontend-and-render-backend)
- [API Overview](#api-overview)
- [Security Considerations](#security-considerations)
- [Known Limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Contributors and Acknowledgements](#contributors-and-acknowledgements)

---

## Overview

**StockWise Pay** is a full-stack procurement workspace for small electronics retailers. It combines demand forecasting, stockout-risk analysis, supplier comparison, budget-constrained restocking, explainable recommendations, and audited PayPal Sandbox payments in a single workflow.

The application is designed around a simple rule: a recommendation is useful only when it is financially actionable. Inventory risk is calculated first, supplier offers are compared next, and the procurement optimizer guarantees that the resulting plan does not exceed the available budget.

### Key Highlights

- **Inventory-aware forecasting** — SMA and EMA demand baselines with trend and stockout-risk classification
- **Cash-aware planning** — Risk-prioritized restocking with supplier MOQ and budget constraints
- **Explainable recommendations** — Plain-language reasons, warnings, and review checkpoints for every plan
- **Supplier comparison** — Price, lead time, reliability, MOQ, and volume-discount evaluation
- **Approval governance** — Versioned plans, manager approval, rejection notes, and audit history
- **Secure payment flow** — Server-controlled totals, PayPal Orders v2 Sandbox integration, and idempotent capture
- **Explicit persistence modes** — PostgreSQL for real payment execution; local storage is clearly marked for development-only simulation

---

## Problem Statement

Small electronics retailers face a persistent gap between inventory signals and financially actionable procurement:

1. **No unified view** — Sales history, supplier catalogs, and budget limits live in disconnected tools
2. **Reactive restocking** — Orders are placed after stockouts occur, not before
3. **Budget overruns** — Purchase plans lack hard budget ceilings and approval gates
4. **Payment friction** — Manual invoice reconciliation and no audit trail for supplier settlements
5. **Opaque decisions** — "Black box" recommendations that cannot be explained to stakeholders

---

## Solution Overview

StockWise Pay closes the loop from **demand signal → supplier offer → budget-safe plan → approved settlement**:

| Stage | Capability | Implementation |
|-------|------------|----------------|
| **Intelligence** | SMA/EMA forecasting, stockout-risk classification, runway estimation | `intelligence/` deterministic TypeScript module |
| **Supplier Scoring** | Multi-criteria comparison (price, lead time, reliability, MOQ, volume discounts) | `supplier-intelligence/` optimization engine |
| **Planning** | Budget-constrained procurement optimizer with scenario modes (balanced, aggressive, conservative) | Backend `/api/plans` with `agent.ts` orchestration |
| **Governance** | Version locking, role-based approval (LEAD_APPROVER, TREASURY), rejection with notes | Backend `routes/plans.ts` + JWT RBAC |
| **Settlement** | PayPal Orders v2 Sandbox: server creates order → buyer approves → server captures → ledger updated | Backend `routes/paypal.ts` + `services/paypal.ts` |
| **Audit** | Immutable logs for every approval, capture, budget change, and webhook event | Backend `routes/audit.ts` + database triggers |

---

## Key Features

### 📊 Executive Dashboard
- Inventory valuation, retail potential, turnover, and low-stock signals
- Budget monitor: monthly cap, spent, allocated, remaining cash
- Category valuation and spend pace visualizations (Recharts)
- Critical SKUs with runway estimates and restock actions

### 📦 Inventory Management
- Catalog: SKU, category, safety stock, unit cost, selling price, margin, vendor
- Risk status: in stock, low stock, critical low, out-of-stock
- Search/filter: SKU/name/vendor search, category/status filters, sorting
- CSV import: Upload, validate, preview, and batch-import catalog data
- Analysis: Demand forecast, runway estimation, reorder point calculation, risk classification

### 🤝 Supplier Intelligence
- Comparison matrix: Price, delivery lead time, MOQ, reliability, rebates
- Scoring preferences: Balanced, cheapest, fastest, most reliable strategies
- Supplier directory: Contacts, locations, specialties, payment terms
- Budget fit: Match offers and quantities to available purchasing budget

### 🧮 Purchase Planner
- Scenario modes: Balanced, aggressive growth, conservative cash-flow
- Editable plans: Toggle lines, change quantities, switch suppliers, recalculate totals
- Budget guarantee: Optimizer mathematically prevents allocation above the budget cap
- Version history: Immutable snapshots with deltas and change reasons
- Approval workflow: Approve/reject with version locking and audit notes

### 🤖 AI Recommendations (Procurement Agent)
- Orchestrates inventory and supplier intelligence through controlled analytical tools
- Returns grounded explanations: stockout runway, margin, lead-time, supplier selection, excluded items, review warnings
- Not an LLM — deterministic tool calls with auditable outputs

### 💳 Payments (PayPal Orders v2 Sandbox)
- Server-enforced order totals derived from the approved purchase plan
- Approval and version checks before checkout
- Capture locking and idempotency protection against duplicate charges
- Payment history, status checks, webhook logging, and audit records

---

## How StockWise Pay Works — End-to-End Workflow

```mermaid
flowchart TD
    A[Sales History & Inventory] --> B[Demand Forecast<br/>SMA/EMA + Trend]
    B --> C[Stockout Risk<br/>Runway & Reorder Point]
    C --> D[Supplier Offers<br/>Price, Lead Time, MOQ, Reliability]
    D --> E[Budget-Optimized Plan<br/>Scenario Mode + MOQ]
    E --> F[Versioned Plan<br/>DRAFT → PENDING_APPROVAL]
    F --> G{Manager Approval<br/>LEAD_APPROVER/TREASURY}
    G -->|Approved| H[Plan Status: APPROVED<br/>Version Locked]
    G -->|Rejected| I[Plan Status: REJECTED<br/>Notes Recorded]
    H --> J[PayPal Order Created<br/>Server-Controlled Total]
    J --> K[Buyer Approves in<br/>Smart Buttons Checkout]
    K --> L[Server Captures Order<br/>Idempotent + Verified]
    L --> M[Ledger Updated<br/>Budget + Plan Status: PAID]
    M --> N[Audit Log Entry<br/>Immutable Record]
```

**Purchase plan lifecycle:**

```text
DRAFT → PENDING_APPROVAL → APPROVED → PAID
          │                    │
          └──────────────→ REJECTED
```

Any budget or line-item change creates a new version and invalidates prior approval.

---

## PayPal Integration and Payment Lifecycle

### Architecture

```
Frontend (Next.js)          Backend (Express)           PayPal Sandbox
     │                          │                           │
     │  1. POST /paypal/orders  │                           │
     │  (planId)                │                           │
     │------------------------->│                           │
     │                          │  2. Validate plan        │
     │                          │  - Status: APPROVED      │
     │                          │  - Version matches       │
     │                          │  - User role authorized  │
     │                          │                           │
     │                          │  3. POST /v2/checkout/orders│
     │                          │  (authoritative total)   │
     │                          │------------------------->│
     │                          │  4. Order ID + Approval URL│
     │                          │<-------------------------│
     │  5. Returns orderId,     │                           │
     │  approvalUrl, amount     │                           │
     │<-------------------------│                           │
     │                          │                           │
     │  6. PayPal Script        │                           │
     │  renders Smart Buttons   │                           │
     │  (client-side)           │                           │
     │                          │                           │
     │  7. Buyer approves       │                           │
     │  in PayPal checkout      │                           │
     │                          │                           │
     │  8. onApprove callback   │                           │
     │  -> POST /paypal/orders/  │                           │
     │  {orderId}/capture       │                           │
     │------------------------->│                           │
     │                          │  9. Acquire capture lock │
     │                          │  (capture_attempts table)│
     │                          │                           │
     │                          │  10. POST /v2/checkout/   │
     │                          │  orders/{id}/capture      │
     │                          │  (PayPal-Request-Id)      │
     │                          │------------------------->│
     │                          │  11. Capture response    │
     │                          │  (validated)              │
     │                          │<-------------------------│
     │                          │  12. Atomic DB transaction│
     │                          │  - Verify lease ownership │
     │                          │  - Update budget          │
     │                          │  - Mark plan PAID         │
     │                          │  - Mark payment COMPLETED │
     │                          │  - Insert audit log       │
     │                          │                           │
     │  13. Returns captureId,  │                           │
     │  status, amount          │                           │
     │<-------------------------│                           │
```

### Key Implementation Details

| Feature | Implementation |
|---------|----------------|
| **Order Creation** | `services/paypal.ts:createOrder()` — validates plan approval/version, computes authoritative total from plan |
| **Smart Buttons** | `@paypal/react-paypal-js` — frontend renders buttons with `createOrder` callback pointing to backend |
| **Capture** | `services/paypal.ts:captureOrder()` — distributed lock via `capture_attempts` table with lease/heartbeat |
| **Idempotency** | `PayPal-Request-Id` header + `capture_attempts` partial unique index + database transaction |
| **Reconciliation** | Expired leases trigger live PayPal API reconciliation before safe takeover |
| **Webhooks** | `POST /api/paypal/webhook` — official signature verification, `event.id` deduplication |
| **Simulation Mode** | `PAYPAL_SIMULATION_ENABLED=true` — explicit non-payment demo; never used for real payments |

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14.2.15 | App Router, React 18, SSR/SSG |
| React | 18 | Component framework |
| TypeScript | 5 | Type safety |
| Tailwind CSS | 3.4.1 | Utility-first styling |
| Recharts | 3.10.1 | Data visualizations |
| Lucide React | 1.68.0 | Icon system |
| @paypal/react-paypal-js | 10.6.1 | PayPal Smart Buttons integration |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 18+ | Runtime |
| Express | 4.21.1 | HTTP framework |
| TypeScript | 5.6.3 | Type safety |
| Zod | 3.23.8 | Schema validation |
| pg | 8.13.1 | PostgreSQL driver |
| bcryptjs | 3.0.3 | Password hashing |
| Multer | 1.4.5-lts.1 | CSV upload handling |
| tsx | 4.19.2 | TypeScript execution |

### Database
| Technology | Version | Purpose |
|------------|---------|---------|
| PostgreSQL | 14+ | Primary persistence (Supabase, Neon, Render PG) |
| Local JSON Store | — | Development-only fallback (explicit simulation mode) |

### Intelligence Modules
| Module | Purpose |
|--------|---------|
| `intelligence/` | SMA/EMA demand forecasting, stockout risk, reorder points |
| `supplier-intelligence/` | Multi-criteria supplier scoring, budget optimization, purchase plan simulation |

### Deployment
| Platform | Purpose |
|----------|---------|
| Vercel | Frontend hosting (Next.js) |
| Render | Backend hosting (Express + PostgreSQL) |
| Render PostgreSQL / Supabase / Neon | Managed PostgreSQL |

---

## System Architecture

```mermaid
flowchart TB
    subgraph Frontend["Frontend (Next.js 14 + React + TypeScript)"]
        Dashboard["Dashboard"]
        Inventory["Inventory"]
        Suppliers["Suppliers"]
        Planner["Purchase Planner"]
        Recommendations["AI Recommendations"]
        Payments["Payments"]
    end

    subgraph Backend["Backend (Express + TypeScript)"]
        Auth["JWT Auth & RBAC"]
        InventoryAPI["Inventory API"]
        SupplierAPI["Supplier API"]
        Plans["Purchase Plans & Approvals"]
        Agent["Procurement Agent"]
        Budget["Budget API"]
        PayPal["PayPal Orders & Webhooks"]
        Audit["Audit API"]
    end

    subgraph Intelligence["Deterministic Intelligence Modules"]
        Forecast["Forecasting & Stockout Risk"]
        Supplier["Supplier Scoring & Optimization"]
    end

    DB[("PostgreSQL or Local Store")]
    PaypalCloud["PayPal Orders v2 Sandbox"]

    Dashboard --> InventoryAPI
    Inventory --> InventoryAPI
    Suppliers --> SupplierAPI
    Planner --> Plans
    Recommendations --> Agent
    Payments --> PayPal
    Auth --> InventoryAPI
    Auth --> Plans
    InventoryAPI --> Forecast
    SupplierAPI --> Supplier
    Agent --> Forecast
    Agent --> Supplier
    Plans --> Budget
    Plans --> DB
    InventoryAPI --> DB
    SupplierAPI --> DB
    PayPal --> PaypalCloud
    PayPal --> DB
    Audit --> DB
```

---

## Repository Structure

```text
Stockwise-Pay/
├── backend/
│   ├── src/
│   │   ├── db/              # Schema, migrations, seed data, persistence adapter (PostgreSQL + local)
│   │   ├── middleware/      # Authentication (JWT, revocation) and authorization (RBAC)
│   │   ├── routes/          # Auth, inventory, suppliers, plans, agent, PayPal, budget, audit
│   │   ├── services/        # Procurement agent orchestration and PayPal service
│   │   └── index.ts         # Express app entry point
│   ├── tests/               # Backend API tests (auth, inventory, plans, PayPal capture regression)
│   ├── package.json         # Scripts: build, dev, test, migrate
│   ├── tsconfig.json
│   └── .env.example         # Backend environment template
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js App Router pages (dashboard, inventory, suppliers, planner, recommendations, payments, login)
│   │   ├── components/      # UI components (layout, auth, charts, modals)
│   │   ├── context/         # AuthContext (JWT token management, demo personas)
│   │   ├── services/        # API client (backend + localStorage fallback for dev)
│   │   ├── types/           # Shared TypeScript types
│   │   └── middleware.ts    # Next.js route protection
│   ├── package.json         # Scripts: dev, build, start, lint
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   └── .env.example         # Frontend environment template
├── intelligence/
│   ├── forecast.ts          # SMA/EMA forecasting
│   ├── stockout.ts          # Stockout risk classification
│   ├── inventory-report.ts  # Full inventory analysis report
│   └── *.test.ts            # Unit tests
├── supplier-intelligence/
│   ├── suppliers.ts         # Supplier scoring & comparison
│   ├── budget.ts            # Budget optimization (knapsack with MOQ)
│   ├── simulation.ts        # Purchase plan simulation
│   ├── explanation.ts       # Explainable recommendations
│   └── *.test.ts            # Unit tests
├── .github/workflows/ci.yml # CI pipeline: PostgreSQL validation, lint, tests, builds
├── .env.example             # (if present at root)
├── LICENSE
└── README.md
```

---

## Screenshots / Demo

> **Note**: Screenshots are not currently checked into the repository. The placeholders below indicate where visual documentation should be added.

| View | Placeholder |
|------|-------------|
| Executive Dashboard | `docs/screenshots/dashboard.png` |
| Inventory Page with Risk Indicators | `docs/screenshots/inventory.png` |
| Supplier Comparison Matrix | `docs/screenshots/suppliers.png` |
| Purchase Planner with Version History | `docs/screenshots/planner.png` |
| AI Recommendations with Explanations | `docs/screenshots/recommendations.png` |
| PayPal Sandbox Checkout Flow | `docs/screenshots/payments.png` |
| Login with Demo Personas | `docs/screenshots/login.png` |

**To add screenshots:**
1. Run the application locally (`npm run dev:backend` + `npm run dev:frontend`)
2. Navigate to each page
3. Capture screenshots and save to `docs/screenshots/`
4. Update the table above with actual paths

---

## Prerequisites

- **Node.js 18+** — Required for Next.js 14 and Express
- **npm** — Package manager (lockfiles committed for reproducible installs)
- **PostgreSQL 14+** — Required for real payment execution (Supabase, Neon, Render PostgreSQL, or local)
- **PayPal Developer Account** — Sandbox credentials from a single REST application (required for real payment execution)
- **Git** — Version control

---

## Local Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/kapil31jangid/Stockwise-Pay.git
cd Stockwise-Pay
```

### 2. Install Dependencies

Each workspace uses its own lockfile for reproducible installs:

```bash
# Root (orchestrates sub-workspaces)
npm install

# Backend
npm --prefix backend install

# Frontend
npm --prefix frontend install

# Intelligence module
npm --prefix intelligence install

# Supplier Intelligence module
npm --prefix supplier-intelligence install
```

### 3. Configure Environment Variables

```bash
# Backend environment
cp backend/.env.example backend/.env

# Frontend environment
cp frontend/.env.example frontend/.env.local
```

Edit `backend/.env` and `frontend/.env.local` with your values (see [Environment Variables](#environment-variables)).

### 4. Database Setup

**Option A: PostgreSQL (Required for Real Payments)**

```bash
# Set DATABASE_URL in backend/.env
# Example: postgresql://postgres:password@localhost:5432/stockwise_pay

# Run migrations
npm run migrate
```

**Option B: Local Simulation Store (Development Only)**

Leave `DATABASE_URL` unset in `backend/.env`. The backend will use an explicit local JSON store (`backend/data/stockwise-store.json`) with seed data. This mode is **clearly marked** in logs and health endpoints as `persistenceMode: local`. **Never use for real payments.**

### 5. Start Development Servers

```bash
# Terminal 1: Backend API (Express on port 5000)
npm run dev:backend

# Terminal 2: Frontend (Next.js on port 3000)
npm run dev:frontend
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| Health Check | http://localhost:5000/api/health |

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Service | Required | Example Value | Source | Public/Secret |
|----------|---------|----------|---------------|--------|---------------|
| `PORT` | Backend | Optional | `5000` | Default | Public |
| `NODE_ENV` | Backend | Optional | `development` | Default | Public |
| `FRONTEND_URL` | Backend | Optional | `http://localhost:3000` | Your frontend origin | Public |
| `DATABASE_URL` | Backend | **Required for real payments** | `postgresql://user:pass@host:5432/db` | PostgreSQL provider | **Secret** |
| `PAYPAL_API_BASE` | Backend | Optional | `https://api-m.sandbox.paypal.com` | PayPal docs | Public |
| `PAYPAL_CLIENT_ID` | Backend | **For PayPal** | `Axxxxxxxxxxxxxxxx` | PayPal Sandbox REST app | **Secret** |
| `PAYPAL_CLIENT_SECRET` | Backend | **For PayPal** | `Exxxxxxxxxxxxxxxx` | PayPal Sandbox REST app | **Secret** |
| `PAYPAL_WEBHOOK_ID` | Backend | For webhooks | `WH-xxxxxxxxxxxxxx` | PayPal Sandbox webhook config | **Secret** |
| `PAYPAL_SIMULATION_ENABLED` | Backend | Optional | `false` | Set `true` only for explicit non-payment demo | Public |
| `JWT_SECRET` | Backend | **Required in production** | `32+ char random string` | Generate with `openssl rand -base64 32` | **Secret** |
| `GEMINI_API_KEY` | Backend | Optional | `AIxxxxxxxxxxxx` | Google AI Studio | **Secret** |
| `OPENAI_API_KEY` | Backend | Optional | `sk-xxxxxxxxxxxx` | OpenAI platform | **Secret** |

### Frontend (`frontend/.env.local`)

| Variable | Service | Required | Example Value | Source | Public/Secret |
|----------|---------|----------|---------------|--------|---------------|
| `NEXT_PUBLIC_API_URL` | Frontend | Optional (defaults to `http://localhost:5000/api`) | `http://localhost:5000/api` | Backend URL | **Public** (exposed to browser) |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Frontend | **For Smart Buttons** | `Axxxxxxxxxxxxxxxx` | **Same** PayPal Sandbox REST app as backend | **Public** (exposed to browser) |

### ⚠️ Critical Security Warnings

- **`NEXT_PUBLIC_*` variables are exposed to the browser** — Never put secrets in them
- **`PAYPAL_CLIENT_SECRET` must only exist in the backend environment** — Never in frontend, never in git
- **Never commit `.env`, `.env.local`, or any credential files** — They are in `.gitignore`
- **Simulation mode (`PAYPAL_SIMULATION_ENABLED=true`) is not a real PayPal Sandbox transaction** — It is an explicit non-payment demo for UI testing only
- **Frontend and backend must use the same PayPal Sandbox REST application** — Client ID must match

---

## Database Setup and Migrations

### PostgreSQL (Production / Real Payments)

1. **Provision a PostgreSQL database** — Supabase, Neon, Render PostgreSQL, or self-hosted
2. **Set `DATABASE_URL`** in `backend/.env`:
   ```bash
   DATABASE_URL=postgresql://user:password@host:5432/database_name
   ```
3. **Run migrations**:
   ```bash
   npm run migrate
   ```
   This executes `backend/src/db/migrate.ts` which applies `backend/src/db/supabase.sql` (schema + seed data).

### Migration Details

The migration script (`supabase.sql`) creates **16 tables** with all constraints, indexes, and seed data:

| Table | Purpose |
|-------|---------|
| `users` | Role-based accounts with bcrypt password hashes |
| `revoked_tokens` | Persistent JWT revocation across instances |
| `webhook_events` | PayPal webhook deduplication by `event.id` |
| `products` | Electronics catalog with pricing, stock, sales history |
| `suppliers` | Supplier profiles with lead time, reliability, specialties |
| `supplier_offers` | SKU-level commercial offers (price, MOQ, shipping, discounts) |
| `purchase_plans` | Current plans with version, status, items, owner tracking |
| `plan_versions` | Immutable plan snapshots for audit |
| `approvals` | Version-specific manager decisions |
| `payments` | PayPal settlement records (order ID, capture ID, status) |
| `payment_events` | Webhook event audit trail |
| `inventory_imports` | CSV import validation results |
| `ai_agent_runs` | Procurement agent execution logs |
| `audit_logs` | Immutable operational event history |
| `budget_config` | Monthly cap, spent, allocated |
| `capture_attempts` | Distributed capture locking with lease/heartbeat |

### Local Simulation Mode (Development Only)

If `DATABASE_URL` is **not set**, the backend initializes a local JSON store at `backend/data/stockwise-store.json` with the same seed data. This mode is:
- **Explicitly reported** in health endpoint: `"persistenceMode": "local"`
- **Clearly logged** at startup: `⚠️ Persistence mode: local simulation store`
- **Never used for real payments** — PayPal integration requires PostgreSQL

---

## PayPal Sandbox Setup and Testing

### 1. Create a PayPal Developer Account

Go to [https://developer.paypal.com/](https://developer.paypal.com/) and sign in or create an account.

### 2. Create a Sandbox REST Application

1. Navigate to **Dashboard → My Apps & Credentials**
2. Click **Create App** under **Sandbox**
3. Choose **Merchant** (Business) type
4. Note the **Client ID** and **Secret** — these are your Sandbox credentials

### 3. Create Sandbox Test Accounts

In the same Developer Dashboard:
1. Go to **Sandbox → Accounts**
2. Create or select a **Business** account (acts as seller/merchant)
3. Create or select a **Personal** account (acts as buyer)
4. Use the Personal account to approve checkout payments
5. Use the Business account to view received payments

> **Important**: The frontend `NEXT_PUBLIC_PAYPAL_CLIENT_ID` and backend `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` **must all come from the same Sandbox REST application**.

### 4. Configure Webhook (Optional but Recommended)

1. In the Sandbox REST app, go to **Webhooks → Add Webhook**
2. Set URL to your deployed backend: `https://your-render-app.onrender.com/api/paypal/webhook`
3. Subscribe to events: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`
4. Copy the **Webhook ID** to `PAYPAL_WEBHOOK_ID` in `backend/.env`

### 5. Set Environment Variables

**Backend (`backend/.env`):**
```bash
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
PAYPAL_WEBHOOK_ID=your_webhook_id
PAYPAL_SIMULATION_ENABLED=false
```

**Frontend (`frontend/.env.local`):**
```bash
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_PAYPAL_CLIENT_ID=your_sandbox_client_id  # SAME as backend
```

### 6. Test the Full Flow

For the deployed application:

- Frontend: `https://stockwise-pay-alpha.vercel.app`
- Backend API: `https://stockwise-pay-production.up.railway.app/api`

Use the project owner's privately supplied **Personal Sandbox Buyer** credentials at the PayPal checkout screen. Credentials are intentionally not stored in this repository.

1. Start both servers (`npm run dev:backend` + `npm run dev:frontend`) for local testing, or open the deployed frontend
2. Log in as **Marcus Vance** (LEAD_APPROVER) or **David Chen** (TREASURY)
3. Go to **Purchase Planner** → Generate a plan → Approve it
4. Go to **Payments** → Select the approved plan
5. Click **PayPal Checkout** → Log in with the privately supplied **Personal Sandbox Buyer** account
6. Approve the payment
7. Backend captures the order → Verify plan status becomes **PAID**
8. Check the **Business Sandbox Seller** account for received payment

---

## PayPal Sandbox Test Accounts

Use this table to record project-specific Sandbox test accounts. **Do not commit real credentials to Git.** Fill in locally or share privately with evaluators.

| Account | Purpose | Email | Password |
|---------|---------|-------|----------|
| **Business Sandbox Seller** | Receives test payments (merchant) | `[Add actual test email]` | `[Do not commit password]` |
| **Personal Sandbox Buyer** | Approves test payments (buyer) | `[Provided privately to evaluator]` | `[Provided privately; never commit]` |

### Important Notes

- **Sandbox accounts are separate from real PayPal accounts** — They exist only in the PayPal Developer Sandbox environment
- **The seller account must support USD** — The current implementation uses USD exclusively
- **Frontend and backend must use matching credentials** from the same Sandbox REST application
- **Never put passwords or secrets in a public README or commit them to Git**
- **If actual test account details are not present in the repository**, leave the placeholders above and explain how the project owner can fill them in locally or share them privately with evaluators

### Safe Configuration Example (Placeholders Only)

```bash
# backend/.env (example — do not commit real values)
PAYPAL_CLIENT_ID=AbCdEfGhIjKlMnOpQrStUvWxYz1234567890
PAYPAL_CLIENT_SECRET=ZyXwVuTsRqPoNmLkJiHgFeDcBa0987654321

# frontend/.env.local (example — do not commit real values)
NEXT_PUBLIC_PAYPAL_CLIENT_ID=AbCdEfGhIjKlMnOpQrStUvWxYz1234567890
```

---

## Running Frontend and Backend Locally

### Development Mode

```bash
# Terminal 1: Backend (Express + TypeScript via tsx)
npm run dev:backend
# → http://localhost:5000
# → Health: http://localhost:5000/api/health

# Terminal 2: Frontend (Next.js 14 App Router)
npm run dev:frontend
# → http://localhost:3000
```

### Demo Accounts (Pre-seeded)

| Email | Password | Role | Permissions |
|-------|----------|------|-------------|
| `marcus.vance@stockwisepay.com` | `ApproverPass2026!` | Inventory Lead / Approver | INVENTORY_VIEW, INVENTORY_EDIT, PLAN_GENERATE, PLAN_APPROVE, PAYMENT_EXECUTE |
| `elena.rostova@stockwisepay.com` | `BuyerPass2026!` | Procurement Specialist | INVENTORY_VIEW, SUPPLIERS_COMPARE, PLAN_GENERATE |
| `david.chen@stockwisepay.com` | `TreasuryPass2026!` | Chief Financial Officer | BUDGET_EDIT, AUDIT_VIEW, PAYMENT_AUDIT, PLAN_APPROVE, PAYMENT_EXECUTE |

---

## Running Tests and Builds

### All Tests

```bash
npm test
```

### Individual Test Suites

```bash
# Intelligence (demand forecasting, stockout risk)
npm run test:intelligence

# Supplier Intelligence (scoring, optimization, simulation)
npm run test:suppliers

# Backend API (auth, inventory, plans, PayPal capture regression)
npm run test:backend
```

### Type Checking

```bash
# Intelligence modules
npm --prefix intelligence run check
npm --prefix supplier-intelligence run check
```

### Production Builds

```bash
# Build both backend and frontend
npm run build

# Or individually
npm run build:backend   # tsc → backend/dist/
npm run build:frontend  # next build → frontend/.next/
```

### Intelligence Module Demos

```bash
# Generate inventory report demonstration
npm --prefix intelligence run report

# Compare forecasting models (SMA vs EMA)
npm --prefix intelligence run compare
```

---

## Deployment Guide — Vercel Frontend and Render Backend

This guide documents the exact steps to deploy StockWise Pay to **Vercel (frontend)** and **Render (backend + PostgreSQL)**.

### Prerequisites for Deployment

- GitHub repository: `https://github.com/kapil31jangid/Stockwise-Pay`
- PayPal Sandbox REST application with Client ID, Secret, and Webhook ID
- Render account (for backend + PostgreSQL)
- Vercel account (for frontend)

---

### A. Backend Deployment on Render

#### 1. Create Render Account and Connect GitHub

1. Go to [https://render.com](https://render.com) and sign up/sign in
2. Connect your GitHub account
3. Select the `kapil31jangid/Stockwise-Pay` repository

#### 2. Create a Web Service

1. Click **New → Web Service**
2. Connect the `Stockwise-Pay` repository
3. Configure:
   - **Name**: `stockwise-pay-api` (or your preferred name)
   - **Root Directory**: `backend` ← **Critical: Set to `backend`**
   - **Runtime**: `Node` (auto-detected from `package.json`)
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm start`

#### 3. Configure Environment Variables in Render

In the Render Web Service dashboard, go to **Environment** and add:

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | |
| `PORT` | `10000` | Render assigns this automatically; do not override |
| `FRONTEND_URL` | `https://your-vercel-app.vercel.app` | Set after Vercel deployment |
| `DATABASE_URL` | `postgresql://...` | From Render PostgreSQL (see step 4) |
| `PAYPAL_API_BASE` | `https://api-m.sandbox.paypal.com` | Sandbox |
| `PAYPAL_CLIENT_ID` | `your_sandbox_client_id` | **Secret** |
| `PAYPAL_CLIENT_SECRET` | `your_sandbox_client_secret` | **Secret** |
| `PAYPAL_WEBHOOK_ID` | `your_webhook_id` | **Secret** |
| `PAYPAL_SIMULATION_ENABLED` | `false` | Must be false for real payments |
| `JWT_SECRET` | `32+ char random string` | **Secret** — Generate: `openssl rand -base64 32` |
| `GEMINI_API_KEY` | (optional) | If using AI features |
| `OPENAI_API_KEY` | (optional) | If using AI features |

#### 4. Provision Render PostgreSQL

1. In Render dashboard, click **New → PostgreSQL**
2. Name: `stockwise-pay-db`
3. Database: `stockwise_pay`
4. User: `postgres` (auto-generated)
5. Region: Same as Web Service
6. After creation, copy the **External Database URL** (format: `postgresql://user:pass@host:port/db`)
7. Paste into `DATABASE_URL` in the Web Service environment variables

#### 5. Run Database Migrations

After the first deploy (which will fail without migrations), run the migration manually:

1. In Render Web Service dashboard, go to **Shell** tab
2. Run:
   ```bash
   npm run migrate
   ```
   This applies `backend/src/db/supabase.sql` to the Render PostgreSQL database.

#### 6. Configure CORS for Vercel Frontend

Once you have your Vercel frontend URL (see section B), update `FRONTEND_URL` in Render environment variables:

```
FRONTEND_URL=https://your-vercel-app.vercel.app
```

Redeploy the backend (Render auto-redeploy on env var change).

#### 7. Configure Health Check Path

In Render Web Service settings:
- **Health Check Path**: `/api/health`
- The backend exposes `GET /api/health` and `GET /health` returning:
  ```json
  {
    "status": "ok",
    "service": "StockWise Pay API Server",
    "persistenceMode": "postgres",
    "paypalConfigured": true
  }
  ```

#### 8. Deploy and Verify

1. Push changes to GitHub → Render auto-deploys
2. Check **Logs** for successful startup
3. Verify health check: `https://your-render-app.onrender.com/api/health`
4. Test API endpoint: `https://your-render-app.onrender.com/api/inventory`

#### 9. Redeploy After Code Changes

Any push to `main` branch triggers auto-deploy. For manual redeploy, use **Manual Deploy → Deploy latest commit** in Render dashboard.

---

### B. Frontend Deployment on Vercel

#### 1. Import Repository into Vercel

1. Go to [https://vercel.com](https://vercel.com) and sign up/sign in
2. Click **Add New → Project**
3. Import `kapil31jangid/Stockwise-Pay` from GitHub

#### 2. Configure Frontend Root Directory

- **Framework Preset**: `Next.js` (auto-detected)
- **Root Directory**: `frontend` ← **Critical: Set to `frontend`**
- **Build Command**: `npm run build` (auto-detected from `package.json`)
- **Output Directory**: `.next` (auto-detected)
- **Install Command**: `npm ci` (auto-detected)

#### 3. Set Frontend Environment Variables

In Vercel project settings → **Environment Variables**, add:

| Key | Value | Environment |
|-----|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://your-render-app.onrender.com/api` | Production, Preview |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | `your_sandbox_client_id` | Production, Preview |

> **Critical**: `NEXT_PUBLIC_PAYPAL_CLIENT_ID` must match the **same Sandbox REST app** as the backend `PAYPAL_CLIENT_ID`.

#### 4. Deploy

1. Click **Deploy**
2. Wait for build to complete
3. Vercel provides a URL: `https://your-app.vercel.app`

#### 5. Custom Domain (Optional)

1. In Vercel project settings → **Domains**
2. Add your custom domain
3. Configure DNS as instructed
4. Vercel provisions SSL automatically

#### 6. Redeploy After Code Changes

Any push to `main` triggers auto-deploy. For manual redeploy, use **Redeploy** in Vercel dashboard.

---

### C. Connect Frontend and Backend

**Correct Order of Operations:**

1. ✅ **Deploy the backend first** on Render
2. ✅ **Verify backend health endpoint**: `https://your-render-app.onrender.com/api/health`
3. ✅ **Configure backend CORS** with the Vercel frontend domain (`FRONTEND_URL` env var)
4. ✅ **Add Render backend API URL** to Vercel (`NEXT_PUBLIC_API_URL`)
5. ✅ **Add matching PayPal Sandbox Client ID** to Vercel (`NEXT_PUBLIC_PAYPAL_CLIENT_ID`)
6. ✅ **Redeploy the frontend** on Vercel
7. ✅ **Test API connectivity** — Visit frontend, log in, verify data loads
8. ✅ **Test complete PayPal Sandbox checkout** — Generate plan → Approve → Checkout → Capture

> **Critical**: Frontend and backend **must use matching PayPal Sandbox credentials** from the same REST application. The `NEXT_PUBLIC_PAYPAL_CLIENT_ID` (frontend) must equal `PAYPAL_CLIENT_ID` (backend).

---

## API Overview

All API endpoints are under `/api` and require JWT Bearer authentication (except `/health`, `/api/health`, `/api/auth/login`, `/api/auth/logout`, `/api/paypal/webhook`).

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Validate credentials, issue JWT |
| `POST` | `/api/auth/logout` | Persistent token revocation |
| `GET` | `/api/auth/me` | Get current user from token |

### Inventory
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/inventory` | List all products with risk indicators |
| `GET` | `/api/inventory/analysis` | Detailed demand forecasts and stockout risks |
| `GET` | `/api/inventory/:sku` | Single product with supplier offers |
| `POST` | `/api/inventory` | Create single product |
| `POST` | `/api/inventory/batch` | Batch create products |
| `POST` | `/api/inventory/import` | CSV upload and import |
| `DELETE` | `/api/inventory/:sku` | Delete product |

### Suppliers
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/suppliers` | List suppliers with offers |
| `GET` | `/api/suppliers/offers` | All supplier offers with details |
| `GET` | `/api/suppliers/compare/:sku` | Multi-criteria comparison for SKU |

### Purchase Plans
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/plans/generate` | Generate budget-constrained plan |
| `GET` | `/api/plans` | List plans (resource-level authorization) |
| `GET` | `/api/plans/:id` | Get plan with approval + versions |
| `PUT` | `/api/plans/:id` | Update plan (preserves ownership) |
| `POST` | `/api/plans/:id/recalculate` | Recalculate with new budget/preference |
| `GET` | `/api/plans/:id/explanation` | Explainable rationale |
| `GET` | `/api/plans/:id/versions` | Version history |
| `POST` | `/api/plans/:id/approve` | Manager approval (LEAD_APPROVER/TREASURY) |
| `POST` | `/api/plans/:id/reject` | Manager rejection with notes |
| `GET` | `/api/plans/:id/approval` | Current approval status |

### Procurement Agent
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agent` | AI-generated recommendations |
| `POST` | `/api/agent/analyze` | Full procurement analysis run |
| `GET` | `/api/agent/runs/:id` | Get agent run details |
| `POST` | `/api/agent/simulate` | Budget simulation |

### Budget
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/budget` | Current budget config |
| `PATCH` | `/api/budget` | Update budget (monthly cap, spent, allocated) |

### PayPal / Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/paypal/orders` | Create PayPal order for approved plan (LEAD_APPROVER/TREASURY) |
| `POST` | `/api/paypal/orders/:id/capture` | Capture buyer-authorized order |
| `GET` | `/api/payments/:id/status` | Verified payment status |
| `GET` | `/api/payments/history` | Payment ledger (LEAD_APPROVER/TREASURY only) |
| `POST` | `/api/paypal/webhook` | PayPal webhook receiver |

### Audit
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/audit-logs` | Immutable audit records |

### Role-Based Access Summary

| Role | Can Generate Plans | Can Approve Plans | Can Execute Payments | Can View Ledger |
|------|-------------------|-------------------|---------------------|-----------------|
| LEAD_APPROVER | ✅ | ✅ | ✅ | ✅ |
| TREASURY | ✅ | ✅ | ✅ | ✅ |
| BUYER | ✅ (own plans only) | ❌ | ❌ | ❌ |

---

## Security Considerations

### Authentication & Authorization
- **JWT with HMAC-SHA256** — Cryptographic tokens with `jti` for revocation
- **Persistent revocation** — Tokens revoked in database + in-memory cache; fails closed if DB check fails
- **Role-based access control** — `LEAD_APPROVER`, `BUYER`, `TREASURY`, `STORE_MANAGER`
- **Resource-level authorization** — Buyers see only their own plans; approval/payment restricted to LEAD_APPROVER/TREASURY
- **bcrypt password hashing** — Seed users have pre-hashed passwords; no plaintext storage

### Payment Security
- **Server-controlled totals** — Order amount computed from approved plan, never from client
- **Version locking** — Plan modifications invalidate prior approvals
- **Capture idempotency** — `PayPal-Request-Id` header + `capture_attempts` partial unique index + DB transaction
- **Distributed capture locking** — Lease/heartbeat mechanism prevents duplicate captures across instances
- **Fail-closed reconciliation** — Expired leases trigger live PayPal API verification before safe takeover
- **Webhook signature verification** — Official PayPal verification API; `event.id` deduplication; unverified events rejected

### Secrets Management
- **`PAYPAL_CLIENT_SECRET` backend only** — Never in frontend, never in git
- **`JWT_SECRET` required in production** — 32+ characters, enforced at startup
- **`NEXT_PUBLIC_*` variables are public** — Only `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_PAYPAL_CLIENT_ID` in frontend
- **`.env` files in `.gitignore`** — Never committed

### Database Security
- **Parameterized queries** — All SQL uses parameterized statements
- **Row-level locking** — `FOR UPDATE` in capture transactions prevents double-spending
- **Budget ceiling enforcement** — Atomic check in capture transaction
- **SSL required for managed PostgreSQL** — Render/Supabase/Neon enforce TLS

---

## Known Limitations

| Limitation | Details |
|------------|---------|
| **PayPal Live Mode Not Configured** | Only Sandbox integration is implemented; production would require Live credentials and webhook reconfiguration |
| **Webhook ID Placeholder** | `PAYPAL_WEBHOOK_ID` in `.env.example` is a placeholder; must be configured per deployment |
| **Simulation Mode ≠ Sandbox** | `PAYPAL_SIMULATION_ENABLED=true` is an explicit non-payment demo; does not create real PayPal transactions |
| **Single Currency (USD)** | All amounts hardcoded to USD; no multi-currency support |
| **No Email Notifications** | Approval, payment, and alert notifications are not implemented |
| **No Automated Reordering** | Plans require manual approval and capture; no scheduled automation |
| **Frontend LocalStorage Fallback** | Development-only; throws in production if `NEXT_PUBLIC_API_URL` is not set |
| **No Rate Limiting** | API does not implement request rate limiting |
| **Limited Webhook Event Coverage** | Only `PAYMENT.CAPTURE.COMPLETED` triggers automated settlement; other events logged but not acted upon |

---

## Troubleshooting

### Backend Won't Start

| Symptom | Cause | Fix |
|---------|-------|-----|
| `FATAL: Database startup check failed` | `DATABASE_URL` set but PostgreSQL unreachable | Verify `DATABASE_URL`, network access, credentials |
| `FATAL: JWT_SECRET ... required in production` | `NODE_ENV=production` without `JWT_SECRET` | Set `JWT_SECRET` (32+ chars) or run in development |
| `PayPal Sandbox credentials are not configured` | Missing `PAYPAL_CLIENT_ID`/`SECRET` | Add credentials or set `PAYPAL_SIMULATION_ENABLED=true` for demo |

### Frontend Shows "Backend Not Configured"

| Symptom | Cause | Fix |
|---------|-------|-----|
| `PayPal backend is not configured` | `NEXT_PUBLIC_API_URL` not set | Set in `frontend/.env.local` or Vercel env vars |
| `401 Unauthorized` on API calls | JWT token expired or revoked | Log in again; check `FRONTEND_URL` CORS config |
| PayPal buttons don't render | `NEXT_PUBLIC_PAYPAL_CLIENT_ID` missing | Set in `frontend/.env.local` or Vercel env vars |

### PayPal Capture Fails

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Buyer has not authorized payment` | Order status not `APPROVED` | Complete PayPal checkout in buyer account |
| `Capture lock held by another instance` | Concurrent capture attempt | Wait for lease expiry (5 min) or check reconciliation logs |
| `Amount mismatch` | Plan modified after order creation | Regenerate plan, re-approve, create new PayPal order |
| `Budget ceiling exceeded` | Capture would exceed monthly budget | Increase budget or reduce plan total |

### Database Migration Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `relation "users" does not exist` | Migration not run | Run `npm run migrate` against target database |
| `duplicate key value violates unique constraint` | Re-running migration on existing DB | Migration is idempotent (`ON CONFLICT DO NOTHING`); safe to re-run |

---

## Contributors and Acknowledgements

### Repository Information
- **Repository**: https://github.com/kapil31jangid/Stockwise-Pay
- **Primary Author**: kapil31jangid (GitHub)
- **License**: MIT (see [LICENSE](LICENSE))

### Technologies Used
- **Next.js** by Vercel
- **Express** by Express.js Foundation
- **PostgreSQL** by PostgreSQL Global Development Group
- **PayPal Orders v2 API** by PayPal
- **Recharts** by Recharts contributors
- **Tailwind CSS** by Tailwind Labs
- **Lucide Icons** by Lucide contributors

### Development Methodology
This project was built as a full-stack procurement workspace demonstrating:
- Deterministic AI/ML for inventory intelligence (no LLM dependency)
- Budget-constrained optimization with mathematical guarantees
- Production-grade PayPal Sandbox integration with idempotent capture
- Role-based governance with version-locked approvals
- Audit-first architecture with immutable event logs

---

## Documentation Links

- [Deployment Guide](docs/DEPLOYMENT.md) — Detailed Vercel + Render deployment instructions
- [PayPal Sandbox Testing Guide](docs/PAYPAL_SANDBOX_TESTING.md) — Sandbox account creation, configuration, checkout testing, troubleshooting
- [Backend README](backend/README.md) — Backend-specific documentation
- [Intelligence Module README](intelligence/INTELLIGENCE_README.md) — Forecasting and risk module documentation
- [Supplier Intelligence README](supplier-intelligence/README.md) — Supplier scoring and optimization documentation
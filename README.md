# StockWise Pay ⚡

**StockWise Pay** is an AI-powered inventory restocking and budget optimization SaaS frontend engineered specifically for small electronics retailers.

Built with **Next.js (App Router)**, **React 18**, **TypeScript**, and **Tailwind CSS**, StockWise Pay balances working capital constraints against inventory stockout risks with explainable AI reasoning, live multi-supplier price comparisons, and PayPal Sandbox settlements.

---

## 🎨 Design & Theme

- **Palette**: Deep Navy (`#0B192C`, `#070F1E`, `#1E293B`), Clean White/Slate (`#F8FAFC`, `#FFFFFF`), and Subtle Electric Blue accents (`#2563EB`, `#3B82F6`).
- **Typography**: Clean, high-legibility sans-serif with monospace accents for SKUs and order numbers.
- **Components**: Reusable cards, metric badges, progress meters, interactive modals, responsive tables, and charts.

---

## 🚀 The 6 Core Pages

1. **Dashboard (`/`)**
   - **Real-Time Inventory Overview**: Valuation metrics, retail potential, sales turnover rates, and low-stock alerts.
   - **Interactive Restock Budget**: Live progress utilization bar (Monthly Cap vs Spent + Allocated).
   - **Visual Analytics**: Category valuation breakdown (Bar chart) and cumulative spend pace vs budget ceiling (Area chart).
   - **Urgent Depletion Alerts**: Critical SKUs with runway estimation and instant 1-click restock routing.
   - **Recent Purchase Plans**: Overview of active purchase batches and their authorization status.

2. **Inventory (`/inventory`)**
   - **Electronics Product Table**: SKUs, product names, categories, safety thresholds, wholesale cost, retail price, gross margins, and preferred vendors.
   - **Stock Status Badges**: Visual indicators for `In Stock`, `Low Stock`, `Critical Low`, and `Out of Stock`.
   - **Live Search & Filter Bar**: Instant search by SKU/name/distributor, category dropdown, status filters, and sorting.
   - **Interactive CSV Import UI**: Drag-and-drop file upload, downloadable format template, live row validation & preview modal, and batch catalog import.
   - **Single Item Creation**: Add custom electronics items with cost and safety threshold controls.

3. **Suppliers (`/suppliers`)**
   - **Interactive Price & Delivery Comparison Matrix**: Select any electronics SKU to benchmark unit prices (with Lowest Price badge), delivery lead times (Fastest badge), minimum order quantities (MOQ), and volume rebates.
   - **Distributor Directory**: Profiles for domestic and factory-direct electronics suppliers (VoltCore, Nexus Acoustic, Apex Wholesale, Shenzhen Precision Micro, SiliconWave).
   - **Fulfillment & Payment Terms**: Reliability ratings (e.g. 99.2%), lead times, depot locations, and payment terms.

4. **Purchase Planner (`/planner`)**
   - **Editable Restocking Budget**: In-header target budget adjustment with real-time remaining cash calculation and over-budget warnings.
   - **Active Order Product Lines**: Checkbox toggle for item inclusion, interactive quantity controls (+/- buttons), line item deletion.
   - **Dynamic Supplier Switching**: Change supplier on any item to instantly recalculate unit cost, shipping lead time, and subtotal.
   - **Financial Summary Card**: Order subtotal, 5% volume discount, logistics freight fee, and grand total.
   - **Quick Actions**: Add catalog item modal, "Proceed to PayPal Checkout", and "Simulate AI Plan".

5. **AI Recommendations (`/recommendations`)**
   - **Scenario Simulation Modes**:
     - *Balanced Restock* (Default): Balances margins and working capital.
     - *Aggressive Growth* (+25% buffer): Safeguards high weekend retail traffic.
     - *Conservative Cash-Flow*: Strict minimum orders for max capital preservation.
   - **Explainable AI Rationale Cards**: Transparent natural language explanation for every item (depletion runways, demand surges, volume rebates).
   - **Metric Highlights**: Granular data tags (Runout Runway, Gross Margin %, Lead Time Delta).
   - **Manager Approval Workflow**: 1-click "Approve Restock Plan" or "Reject / Request Revision" modal with audit note logging.

6. **Payments (`/payments`)**
   - **PayPal Sandbox Ready Interface**:
     - Status banner with test buyer credentials (`buyer-retail@stockwise.test`).
     - Prepared for PayPal Orders v2 REST API integration.
     - Interactive two-phase sandbox handshake simulation (`createPayPalOrder` ➔ `capturePayPalOrder`).
     - "Pay with PayPal" and "PayPal Pay in 4" wholesale installment financing buttons.
   - **Audited Settlement Ledger**: Detailed transaction history with PO reference, invoice numbers, supplier names, timestamp, and downloadable printable invoice receipt.

---

## 🔌 API & Future Node.js + Express Backend Readiness

The frontend includes an abstracted client service layer at `src/services/api.ts` configured with environment fallback:

```env
# Optional: Set this to connect to your live Node.js + Express backend
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_PAYPAL_CLIENT_ID=your-sandbox-client-id
```

When `NEXT_PUBLIC_API_URL` is omitted, the frontend automatically falls back to reactive persistent storage (`localStorage`) so your changes (adding products, modifying quantities, approving recommendations, creating PayPal transactions) persist seamlessly across sessions.

### Backend Endpoints Map:
- `GET /api/inventory` & `POST /api/inventory/batch`
- `GET /api/suppliers`
- `GET /api/purchase-plans` & `PUT /api/purchase-plans/:id`
- `GET /api/ai-recommendations` & `PATCH /api/ai-recommendations/:id/status`
- `GET /api/budget` & `PATCH /api/budget`
- `POST /api/paypal/create-order`
- `POST /api/paypal/capture-order`

---

## 🛠️ Getting Started

### 1. Run All Tests
```bash
# Run all 29 automated tests across intelligence, supplier-intelligence, and backend:
npm test
```

### 2. Launch the Development Environment
```bash
# In terminal 1: Start Express API Backend (Port 5000)
npm run dev:backend

# In terminal 2: Start Next.js Frontend (Port 3000)
npm run dev:frontend
```

Visit [http://localhost:3000](http://localhost:3000) to explore StockWise Pay.
API Health Check: [http://localhost:5000/api/health](http://localhost:5000/api/health)

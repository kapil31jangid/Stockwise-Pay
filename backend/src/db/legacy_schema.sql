-- Legacy Schema Fixture for CI Upgrade Migration Testing
-- This represents the database schema BEFORE the current remediation changes
-- Used to test that upgrade migrations work correctly without data loss

-- Drop existing tables if they exist (clean slate for legacy fixture)
DROP TABLE IF EXISTS capture_attempts CASCADE;
DROP TABLE IF EXISTS webhook_events CASCADE;
DROP TABLE IF EXISTS revoked_tokens CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS approvals CASCADE;
DROP TABLE IF EXISTS plan_versions CASCADE;
DROP TABLE IF EXISTS purchase_plans CASCADE;
DROP TABLE IF EXISTS supplier_offers CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS budget_config CASCADE;
DROP TABLE IF EXISTS ai_agent_runs CASCADE;
DROP TABLE IF EXISTS inventory_imports CASCADE;
DROP TABLE IF EXISTS payment_events CASCADE;

-- ============================================================
-- LEGACY SCHEMA (without created_by_user_id, without lease/heartbeat columns)
-- ============================================================

-- 1. USERS TABLE (exists in legacy)
CREATE TABLE users (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('LEAD_APPROVER', 'BUYER', 'TREASURY', 'STORE_MANAGER')),
  display_role VARCHAR(100),
  department VARCHAR(100),
  avatar_initials VARCHAR(10),
  badge VARCHAR(50),
  permissions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. PRODUCTS TABLE
CREATE TABLE products (
  sku VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  current_stock INTEGER NOT NULL DEFAULT 0,
  safety_stock INTEGER NOT NULL DEFAULT 10,
  unit_cost DECIMAL(10,2) NOT NULL,
  selling_price DECIMAL(10,2) NOT NULL,
  sales_history JSONB NOT NULL DEFAULT '[]',
  preferred_vendor_id VARCHAR(50),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. SUPPLIERS TABLE
CREATE TABLE suppliers (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  location VARCHAR(255),
  estimated_lead_time_days INTEGER NOT NULL DEFAULT 7,
  reliability_score DECIMAL(5,2) NOT NULL DEFAULT 95.00,
  payment_terms VARCHAR(100),
  specialties JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. SUPPLIER OFFERS TABLE
CREATE TABLE supplier_offers (
  id VARCHAR(50) PRIMARY KEY,
  sku VARCHAR(50) NOT NULL REFERENCES products(sku),
  supplier_id VARCHAR(50) NOT NULL REFERENCES suppliers(id),
  unit_price DECIMAL(10,2) NOT NULL,
  shipping_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  moq INTEGER NOT NULL DEFAULT 1,
  lead_time_days INTEGER NOT NULL DEFAULT 7,
  bulk_discount_note TEXT,
  quote_currency VARCHAR(3) NOT NULL DEFAULT 'USD'
);

-- 5. PURCHASE PLANS TABLE (LEGACY: NO created_by_user_id column)
CREATE TABLE purchase_plans (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255),
  purchasing_budget DECIMAL(12,2) NOT NULL,
  calculated_total DECIMAL(12,2) NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  plan_status VARCHAR(50) NOT NULL DEFAULT 'pending_approval',
  selected_items JSONB NOT NULL DEFAULT '[]',
  deferred_items JSONB NOT NULL DEFAULT '[]',
  scenario_mode VARCHAR(50) NOT NULL DEFAULT 'balanced',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. PLAN VERSIONS TABLE
CREATE TABLE plan_versions (
  id VARCHAR(100) PRIMARY KEY,
  plan_id VARCHAR(50) NOT NULL REFERENCES purchase_plans(id),
  version_number INTEGER NOT NULL,
  budget DECIMAL(12,2) NOT NULL,
  calculated_total DECIMAL(12,2) NOT NULL,
  items_snapshot JSONB NOT NULL DEFAULT '[]',
  deferred_snapshot JSONB NOT NULL DEFAULT '[]',
  change_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. APPROVALS TABLE
CREATE TABLE approvals (
  id VARCHAR(100) PRIMARY KEY,
  purchase_plan_id VARCHAR(50) NOT NULL REFERENCES purchase_plans(id),
  approved_version INTEGER NOT NULL,
  approver_name VARCHAR(100) NOT NULL,
  approver_role VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('approved', 'rejected')),
  decision_notes TEXT,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. PAYMENTS TABLE
CREATE TABLE payments (
  id VARCHAR(50) PRIMARY KEY,
  purchase_plan_id VARCHAR(50) NOT NULL REFERENCES purchase_plans(id),
  plan_version INTEGER NOT NULL,
  paypal_order_id VARCHAR(100) UNIQUE,
  paypal_capture_id VARCHAR(100),
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  payment_method VARCHAR(100) NOT NULL,
  verified_status VARCHAR(50) NOT NULL DEFAULT 'CREATED',
  payer_email VARCHAR(255),
  raw_paypal_response JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. BUDGET CONFIG TABLE
CREATE TABLE budget_config (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
  monthly_budget DECIMAL(12,2) NOT NULL DEFAULT 5000.00,
  spent_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  allocated_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. INVENTORY IMPORTS TABLE
CREATE TABLE inventory_imports (
  id VARCHAR(100) PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  imported_by VARCHAR(100) NOT NULL,
  record_count INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. AI AGENT RUNS TABLE
CREATE TABLE ai_agent_runs (
  id VARCHAR(100) PRIMARY KEY,
  request_type VARCHAR(100) NOT NULL,
  user_prompt TEXT,
  tools_called JSONB NOT NULL DEFAULT '[]',
  results JSONB NOT NULL DEFAULT '{}',
  execution_status VARCHAR(50) NOT NULL DEFAULT 'success',
  execution_duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. PAYMENT EVENTS TABLE
CREATE TABLE payment_events (
  id VARCHAR(100) PRIMARY KEY,
  paypal_order_id VARCHAR(100),
  capture_id VARCHAR(100),
  event_type VARCHAR(100),
  payload JSONB NOT NULL,
  verification_result VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. AUDIT LOGS TABLE
CREATE TABLE audit_logs (
  id VARCHAR(100) PRIMARY KEY,
  actor VARCHAR(100) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. REVOKED TOKENS TABLE
CREATE TABLE revoked_tokens (
  token_hash VARCHAR(64) PRIMARY KEY,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. WEBHOOK EVENTS TABLE (LEGACY: no transmission_id column, id is PK)
CREATE TABLE webhook_events (
  id VARCHAR(100) PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  summary TEXT,
  resource_type VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'VERIFIED',
  raw_payload JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. CAPTURE ATTEMPTS TABLE (LEGACY: UNIQUE constraint on paypal_order_id, NO lease/heartbeat columns)
CREATE TABLE capture_attempts (
  id VARCHAR(100) PRIMARY KEY,
  paypal_order_id VARCHAR(100) NOT NULL UNIQUE,
  payment_id VARCHAR(50) NOT NULL REFERENCES payments(id),
  status VARCHAR(50) NOT NULL DEFAULT 'CAPTURING',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  paypal_capture_id VARCHAR(100),
  paypal_request_id VARCHAR(100),
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

-- Legacy indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_supplier_offers_sku ON supplier_offers(sku);
CREATE INDEX IF NOT EXISTS idx_purchase_plans_status ON purchase_plans(plan_status);
CREATE INDEX IF NOT EXISTS idx_payments_paypal_order ON payments(paypal_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(verified_status);
CREATE INDEX IF NOT EXISTS idx_capture_attempts_order ON capture_attempts(paypal_order_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- Insert legacy seed data (3 users)
INSERT INTO users (id, name, email, password_hash, role, display_role, department, avatar_initials, badge, permissions) VALUES
('USR-001', 'Marcus Vance', 'marcus.vance@stockwisepay.com', '$2b$10$6eq.Sj2yWsaYxHgNYjxtZucnPMsGmsgeWXM6kD5w5moOYU/oKqnK.', 'LEAD_APPROVER', 'Inventory Lead / Approver', 'Operations & Supply', 'MV', 'LEAD APPROVER', '["INVENTORY_VIEW", "INVENTORY_EDIT", "PLAN_GENERATE", "PLAN_APPROVE", "PAYMENT_EXECUTE"]'),
('USR-002', 'Elena Rostova', 'elena.rostova@stockwisepay.com', '$2b$10$A.4//Ploce25Alhbt1aGE.fjpsVOXtWAiiE.U0tsiC/WdzbCJB6Y2', 'BUYER', 'Procurement Specialist', 'Supplier Relations', 'ER', 'BUYER', '["INVENTORY_VIEW", "SUPPLIERS_COMPARE", "PLAN_GENERATE"]'),
('USR-003', 'David Chen', 'david.chen@stockwisepay.com', '$2b$10$q6sAjkDwmI7ttOEkwJimqOXnJ0q.wUbgBLecgACZ41CJgeo32kX7m', 'TREASURY', 'Chief Financial Officer', 'Finance & Treasury', 'DC', 'TREASURY', '["BUDGET_EDIT", "AUDIT_VIEW", "PAYMENT_AUDIT", "PLAN_APPROVE", "PAYMENT_EXECUTE"]');

-- Insert legacy budget config
INSERT INTO budget_config (id, monthly_budget, spent_amount, allocated_amount) VALUES
('default', 5000.00, 1200.00, 1850.00);

-- Insert legacy purchase plan (without created_by_user_id)
INSERT INTO purchase_plans (id, name, purchasing_budget, calculated_total, current_version, plan_status, selected_items, deferred_items, scenario_mode, created_at, updated_at) VALUES
('PLAN-2026-001', 'Q4 Urgent High-Stockout Restock', 2000.00, 1816.00, 1, 'pending_approval',
'[{"sku": "HP101", "productName": "Wireless Noise-Canceling Headphones", "recommendedQuantity": 30, "supplierId": "SUP001", "supplierName": "VoltCore Distribution", "unitCost": 15.20, "subtotal": 456.00, "leadTimeDays": 2, "riskLevel": "HIGH", "daysUntilStockout": 5.09},
 {"sku": "KB201", "productName": "RGB Mechanical Gaming Keyboard", "recommendedQuantity": 40, "supplierId": "SUP002", "supplierName": "Apex Electronics Wholesale", "unitCost": 22.00, "subtotal": 880.00, "leadTimeDays": 3, "riskLevel": "HIGH", "daysUntilStockout": 3.75},
 {"sku": "SSD601", "productName": "1TB NVMe M.2 High-Speed SSD", "recommendedQuantity": 10, "supplierId": "SUP004", "supplierName": "SiliconWave Global Components", "unitCost": 48.00, "subtotal": 480.00, "leadTimeDays": 4, "riskLevel": "HIGH", "daysUntilStockout": 4.2}]',
'[{"sku": "CB301", "productName": "Braided 100W USB-C to USB-C Cable (2m)", "reason": "LOW_STOCKOUT_RISK_DEFERRED"}]',
'balanced', NOW() - INTERVAL '1 hour', NOW());

-- Insert legacy plan version
INSERT INTO plan_versions (id, plan_id, version_number, budget, calculated_total, items_snapshot, deferred_snapshot, change_reason, created_at) VALUES
('VER-PLAN-2026-001-v1', 'PLAN-2026-001', 1, 2000.00, 1816.00, '[]', '[]', 'Initial baseline plan', NOW());

-- Insert legacy completed payment
INSERT INTO payments (id, purchase_plan_id, plan_version, paypal_order_id, paypal_capture_id, amount, currency, payment_method, verified_status, payer_email, created_at, updated_at) VALUES
('PAY-1001', 'PLAN-2026-001', 1, '8AA1234567890123', '9BB9876543210987', 1450.00, 'USD', 'PayPal Sandbox', 'COMPLETED', 'buyer-retail@stockwise.test', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days');

-- Insert legacy audit log
INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, previous_status, new_status, details, created_at) VALUES
('LOG-001', 'System Seed', 'INIT_STORE', 'SYSTEM', 'ROOT', NULL, NULL, '{}', NOW());

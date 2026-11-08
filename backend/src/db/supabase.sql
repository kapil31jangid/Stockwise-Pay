-- ==============================================================================
-- StockWise Pay - Complete Supabase PostgreSQL Schema & Seed Migration
-- Run this in your Supabase project's SQL Editor (https://supabase.com/dashboard)
-- Order matters: referenced tables must be created before referencing tables
-- All migrations are idempotent (safe to run multiple times)
-- ==============================================================================

-- 1. USERS TABLE (must be first - referenced by purchase_plans)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  display_role VARCHAR(100) NOT NULL,
  department VARCHAR(100) NOT NULL,
  avatar_initials VARCHAR(10) NOT NULL,
  badge VARCHAR(50) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. REVOKED TOKENS TABLE
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash VARCHAR(64) PRIMARY KEY,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. WEBHOOK EVENTS TABLE (deduplication by event.id)
CREATE TABLE IF NOT EXISTS webhook_events (
  id VARCHAR(100) PRIMARY KEY,
  transmission_id VARCHAR(100),
  event_type VARCHAR(100) NOT NULL,
  summary TEXT,
  resource_type VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'VERIFIED',
  raw_payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
  sku VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  current_stock INTEGER NOT NULL DEFAULT 0,
  safety_stock INTEGER NOT NULL DEFAULT 10,
  unit_cost NUMERIC(10, 2) NOT NULL,
  selling_price NUMERIC(10, 2) NOT NULL,
  sales_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_vendor_id VARCHAR(50),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. SUPPLIERS TABLE
CREATE TABLE IF NOT EXISTS suppliers (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  location VARCHAR(100),
  estimated_lead_time_days INTEGER NOT NULL DEFAULT 3,
  reliability_score NUMERIC(5, 2) NOT NULL DEFAULT 95.0,
  payment_terms VARCHAR(100) DEFAULT 'Net 30',
  specialties JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. SUPPLIER OFFERS TABLE
CREATE TABLE IF NOT EXISTS supplier_offers (
  id VARCHAR(50) PRIMARY KEY,
  sku VARCHAR(50) NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  supplier_id VARCHAR(50) NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  unit_price NUMERIC(10, 2) NOT NULL,
  shipping_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  moq INTEGER NOT NULL DEFAULT 1,
  lead_time_days INTEGER NOT NULL DEFAULT 3,
  bulk_discount_note VARCHAR(255),
  quote_currency VARCHAR(10) DEFAULT 'USD',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. PURCHASE PLANS TABLE (references users)
CREATE TABLE IF NOT EXISTS purchase_plans (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  purchasing_budget NUMERIC(10, 2) NOT NULL,
  calculated_total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  current_version INTEGER NOT NULL DEFAULT 1,
  plan_status VARCHAR(50) NOT NULL DEFAULT 'draft',
  selected_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  deferred_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  scenario_mode VARCHAR(50) DEFAULT 'balanced',
  created_by_user_id VARCHAR(50) REFERENCES users(id), -- Track plan creator for resource-level authorization
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_plans_created_by ON purchase_plans(created_by_user_id);

-- 8. PLAN VERSIONS TABLE
CREATE TABLE IF NOT EXISTS plan_versions (
  id VARCHAR(50) PRIMARY KEY,
  plan_id VARCHAR(50) NOT NULL REFERENCES purchase_plans(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  budget NUMERIC(10, 2) NOT NULL,
  calculated_total NUMERIC(10, 2) NOT NULL,
  items_snapshot JSONB NOT NULL,
  deferred_snapshot JSONB NOT NULL,
  change_reason VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. APPROVALS TABLE
CREATE TABLE IF NOT EXISTS approvals (
  id VARCHAR(50) PRIMARY KEY,
  purchase_plan_id VARCHAR(50) NOT NULL REFERENCES purchase_plans(id) ON DELETE CASCADE,
  approved_version INTEGER NOT NULL,
  approver_name VARCHAR(100) NOT NULL,
  approver_role VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  decision_notes TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(50) PRIMARY KEY,
  purchase_plan_id VARCHAR(50) NOT NULL REFERENCES purchase_plans(id),
  plan_version INTEGER NOT NULL,
  paypal_order_id VARCHAR(100) NOT NULL UNIQUE,
  paypal_capture_id VARCHAR(100),
  amount NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  payment_method VARCHAR(50) DEFAULT 'PayPal Sandbox',
  verified_status VARCHAR(50) NOT NULL DEFAULT 'CREATED',
  payer_email VARCHAR(255),
  raw_paypal_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. PAYMENT EVENTS / WEBHOOKS TABLE
CREATE TABLE IF NOT EXISTS payment_events (
  id VARCHAR(50) PRIMARY KEY,
  paypal_order_id VARCHAR(100) NOT NULL,
  capture_id VARCHAR(100),
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  verification_result VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. INVENTORY IMPORTS TABLE
CREATE TABLE IF NOT EXISTS inventory_imports (
  id VARCHAR(50) PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  row_count INTEGER NOT NULL,
  valid_count INTEGER NOT NULL,
  error_count INTEGER NOT NULL,
  validation_results JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'completed',
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. AI AGENT RUNS TABLE
CREATE TABLE IF NOT EXISTS ai_agent_runs (
  id VARCHAR(50) PRIMARY KEY,
  request_type VARCHAR(100) NOT NULL,
  user_prompt TEXT,
  tools_called JSONB NOT NULL DEFAULT '[]'::jsonb,
  results JSONB NOT NULL,
  execution_status VARCHAR(50) NOT NULL DEFAULT 'success',
  execution_duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(50) PRIMARY KEY,
  actor VARCHAR(100) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(50) NOT NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 15. BUDGET CONFIG TABLE
CREATE TABLE IF NOT EXISTS budget_config (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
  monthly_budget NUMERIC(10, 2) NOT NULL DEFAULT 5000.00,
  spent_amount NUMERIC(10, 2) NOT NULL DEFAULT 1200.00,
  allocated_amount NUMERIC(10, 2) NOT NULL DEFAULT 1850.00,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 16. CAPTURE ATTEMPTS TABLE (distributed locking with lease/heartbeat)
-- Ensures exactly one capture per PayPal order across multiple backend instances
-- Includes lease/heartbeat mechanism to prevent premature takeover of long-running captures
CREATE TABLE IF NOT EXISTS capture_attempts (
  id VARCHAR(50) PRIMARY KEY,
  paypal_order_id VARCHAR(100) NOT NULL UNIQUE,
  payment_id VARCHAR(50) NOT NULL REFERENCES payments(id),
  status VARCHAR(50) NOT NULL DEFAULT 'CAPTURING', -- CAPTURING, COMPLETED, FAILED
  paypal_capture_id VARCHAR(100),
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  retry_count INTEGER NOT NULL DEFAULT 0,
  -- Lease/heartbeat fields for safe distributed capture coordination
  lease_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '5 minutes'),
  last_heartbeat_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  lease_owner VARCHAR(100), -- Instance identifier holding the lease
  paypal_request_id VARCHAR(100) -- Stable idempotency key for PayPal API
);

CREATE INDEX IF NOT EXISTS idx_capture_attempts_payment_id ON capture_attempts(payment_id);
CREATE INDEX IF NOT EXISTS idx_capture_attempts_status_started ON capture_attempts(status, started_at);
CREATE INDEX IF NOT EXISTS idx_capture_attempts_lease_expires ON capture_attempts(lease_expires_at) WHERE status = 'CAPTURING';

-- ==============================================================================
-- UPGRADE MIGRATIONS (idempotent - safe to run multiple times)
-- ==============================================================================

-- Add created_by_user_id column to existing purchase_plans if missing
ALTER TABLE purchase_plans ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(50);

-- Add foreign key constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'purchase_plans'
    AND constraint_name = 'purchase_plans_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE purchase_plans
    ADD CONSTRAINT purchase_plans_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES users(id);
  END IF;
END $$;

-- Add index if not exists
CREATE INDEX IF NOT EXISTS idx_purchase_plans_created_by ON purchase_plans(created_by_user_id);

-- Add lease/heartbeat columns to existing capture_attempts if missing
ALTER TABLE capture_attempts ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '5 minutes');
ALTER TABLE capture_attempts ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE capture_attempts ADD COLUMN IF NOT EXISTS lease_owner VARCHAR(100);
ALTER TABLE capture_attempts ADD COLUMN IF NOT EXISTS paypal_request_id VARCHAR(100);

-- Add lease index if not exists
CREATE INDEX IF NOT EXISTS idx_capture_attempts_lease_expires ON capture_attempts(lease_expires_at) WHERE status = 'CAPTURING';

-- Drop old full unique constraint on paypal_order_id if it exists (legacy schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'capture_attempts'
    AND constraint_name = 'capture_attempts_paypal_order_id_key'
    AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE capture_attempts DROP CONSTRAINT capture_attempts_paypal_order_id_key;
  END IF;
END $$;

-- Add partial unique index for active attempts (CAPTURING, COMPLETED) per PayPal order
-- This replaces the old UNIQUE constraint on paypal_order_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_capture_attempts_active_order
  ON capture_attempts(paypal_order_id)
  WHERE status IN ('CAPTURING', 'COMPLETED');

-- ==============================================================================
-- INITIAL SEED DATA
-- ==============================================================================

-- Products
INSERT INTO products (sku, name, category, current_stock, safety_stock, unit_cost, selling_price, sales_history, preferred_vendor_id)
VALUES
  ('HP101', 'Wireless Noise-Canceling Headphones', 'Audio', 14, 25, 14.50, 39.99, '[2, 3, 2, 4, 3, 2, 5, 3, 4, 2, 3, 4, 3, 4]'::jsonb, 'SUP001'),
  ('KB201', 'RGB Mechanical Gaming Keyboard', 'Peripherals', 15, 30, 22.00, 59.99, '[3, 4, 3, 5, 4, 3, 6, 4, 5, 4, 3, 5, 4, 6]'::jsonb, 'SUP002'),
  ('CB301', 'Braided 100W USB-C to USB-C Cable (2m)', 'Accessories', 150, 40, 2.10, 8.99, '[5, 6, 7, 5, 6, 7, 8, 6, 7, 5, 6, 7, 6, 7]'::jsonb, 'SUP001'),
  ('MO401', 'Ergonomic Wireless Optical Mouse', 'Peripherals', 8, 20, 8.40, 24.99, '[2, 3, 2, 3, 4, 3, 3, 2, 3, 4, 3, 2, 4, 3]'::jsonb, 'SUP003'),
  ('PB501', '20,000mAh Fast-Charging Power Bank', 'Accessories', 5, 18, 12.80, 34.99, '[3, 2, 3, 4, 3, 3, 4, 3, 4, 3, 2, 4, 3, 4]'::jsonb, 'SUP002'),
  ('SSD601', '1TB NVMe M.2 High-Speed SSD', 'Components', 6, 15, 48.00, 89.99, '[1, 2, 1, 2, 2, 1, 3, 2, 2, 1, 2, 3, 2, 2]'::jsonb, 'SUP004')
ON CONFLICT (sku) DO NOTHING;

-- Suppliers
INSERT INTO suppliers (id, name, contact_email, contact_phone, location, estimated_lead_time_days, reliability_score, payment_terms, specialties)
VALUES
  ('SUP001', 'VoltCore Distribution', 'orders@voltcore.dist', '+1-555-019-2831', 'Chicago, IL (US Domestic)', 2, 98.60, 'Net 30 / PayPal', '["Audio", "Fast Domestic Delivery", "Accessories"]'::jsonb),
  ('SUP002', 'Apex Electronics Wholesale', 'sales@apexwholesale.com', '+1-555-014-9922', 'Dallas, TX (US Domestic)', 3, 99.20, 'Immediate PayPal / Net 15', '["Peripherals", "High Reliability", "Tier-1 Certified"]'::jsonb),
  ('SUP003', 'Shenzhen Precision Micro Ltd', 'export@shenzhenmicro.cn', '+86-755-8392-1002', 'Shenzhen, Guangdong (Direct Factory)', 8, 96.80, 'PayPal Goods & Services', '["Lowest Factory Cost", "Bulk Micro-components"]'::jsonb),
  ('SUP004', 'SiliconWave Global Components', 'procure@siliconwave.io', '+1-555-017-4820', 'San Jose, CA', 4, 97.50, 'Net 30 / PayPal Sandbox', '["Storage", "Memory", "Components"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Supplier Offers
INSERT INTO supplier_offers (id, sku, supplier_id, unit_price, shipping_cost, moq, lead_time_days, bulk_discount_note, quote_currency)
VALUES
  ('OFF001', 'HP101', 'SUP001', 15.20, 15.00, 10, 2, '5% off > 50 units', 'USD'),
  ('OFF002', 'HP101', 'SUP002', 16.00, 10.00, 15, 3, 'Free shipping on orders > $300', 'USD'),
  ('OFF003', 'HP101', 'SUP003', 12.80, 35.00, 25, 8, '10% factory rebate > 100 units', 'USD'),
  ('OFF004', 'KB201', 'SUP001', 24.00, 20.00, 5, 2, '3% discount > 20 units', 'USD'),
  ('OFF005', 'KB201', 'SUP002', 22.00, 15.00, 10, 3, 'Preferred partner volume pricing', 'USD'),
  ('OFF006', 'KB201', 'SUP003', 18.50, 40.00, 20, 9, 'Wholesale factory direct', 'USD'),
  ('OFF007', 'CB301', 'SUP001', 2.10, 5.00, 50, 2, NULL, 'USD'),
  ('OFF008', 'CB301', 'SUP002', 2.30, 0.00, 30, 3, NULL, 'USD'),
  ('OFF009', 'CB301', 'SUP003', 1.40, 25.00, 100, 8, NULL, 'USD'),
  ('OFF010', 'MO401', 'SUP001', 9.10, 12.00, 10, 2, NULL, 'USD'),
  ('OFF011', 'MO401', 'SUP002', 8.40, 10.00, 15, 3, NULL, 'USD'),
  ('OFF012', 'PB501', 'SUP002', 12.80, 15.00, 10, 3, NULL, 'USD'),
  ('OFF013', 'PB501', 'SUP003', 10.20, 30.00, 25, 8, NULL, 'USD'),
  ('OFF014', 'SSD601', 'SUP004', 48.00, 15.00, 5, 4, NULL, 'USD')
ON CONFLICT (id) DO NOTHING;

-- Budget Config
INSERT INTO budget_config (id, monthly_budget, spent_amount, allocated_amount)
VALUES ('default', 5000.00, 1200.00, 1850.00)
ON CONFLICT (id) DO NOTHING;

-- Sample Baseline Plan (created_by_user_id will be NULL for legacy plans)
INSERT INTO purchase_plans (id, name, purchasing_budget, calculated_total, current_version, plan_status, selected_items, deferred_items, scenario_mode)
VALUES (
  'PLAN-2026-001',
  'Q4 Urgent High-Stockout Restock',
  2000.00,
  1850.00,
  1,
  'pending_approval',
  '[
    {"sku":"HP101","productName":"Wireless Noise-Canceling Headphones","recommendedQuantity":30,"supplierId":"SUP001","supplierName":"VoltCore Distribution","unitCost":15.20,"subtotal":456.00,"leadTimeDays":2,"riskLevel":"HIGH","daysUntilStockout":5.09},
    {"sku":"KB201","productName":"RGB Mechanical Gaming Keyboard","recommendedQuantity":40,"supplierId":"SUP002","supplierName":"Apex Electronics Wholesale","unitCost":22.00,"subtotal":880.00,"leadTimeDays":3,"riskLevel":"HIGH","daysUntilStockout":3.75},
    {"sku":"SSD601","productName":"1TB NVMe M.2 High-Speed SSD","recommendedQuantity":10,"supplierId":"SUP004","supplierName":"SiliconWave Global Components","unitCost":48.00,"subtotal":480.00,"leadTimeDays":4,"riskLevel":"HIGH","daysUntilStockout":4.2}
  ]'::jsonb,
  '[
    {"sku":"CB301","productName":"Braided 100W USB-C to USB-C Cable (2m)","reason":"LOW_STOCKOUT_RISK_DEFERRED"}
  ]'::jsonb,
  'balanced'
)
ON CONFLICT (id) DO NOTHING;

-- Seed System Personas with Bcrypt Password Hashes
INSERT INTO users (id, name, email, password_hash, role, display_role, department, avatar_initials, badge, permissions)
VALUES
  (
    'USR-001',
    'Marcus Vance',
    'marcus.vance@stockwisepay.com',
    '$2b$10$6eq.Sj2yWsaYxHgNYjxtZucnPMsGmsgeWXM6kD5w5moOYU/oKqnK.',
    'LEAD_APPROVER',
    'Inventory Lead / Approver',
    'Operations & Supply',
    'MV',
    'LEAD APPROVER',
    '["INVENTORY_VIEW", "INVENTORY_EDIT", "PLAN_GENERATE", "PLAN_APPROVE", "PAYMENT_EXECUTE"]'::jsonb
  ),
  (
    'USR-002',
    'Elena Rostova',
    'elena.rostova@stockwisepay.com',
    '$2b$10$A.4//Ploce25Alhbt1aGE.fjpsVOXtWAiiE.U0tsiC/WdzbCJB6Y2',
    'BUYER',
    'Procurement Specialist',
    'Supplier Relations',
    'ER',
    'BUYER',
    '["INVENTORY_VIEW", "SUPPLIERS_COMPARE", "PLAN_GENERATE"]'::jsonb
  ),
  (
    'USR-003',
    'David Chen',
    'david.chen@stockwisepay.com',
    '$2b$10$q6sAjkDwmI7ttOEkwJimqOXnJ0q.wUbgBLecgACZ41CJgeo32kX7m',
    'TREASURY',
    'Chief Financial Officer',
    'Finance & Treasury',
    'DC',
    'TREASURY',
    '["BUDGET_EDIT", "AUDIT_VIEW", "PAYMENT_AUDIT", "PLAN_APPROVE", "PAYMENT_EXECUTE"]'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  display_role = EXCLUDED.display_role,
  department = EXCLUDED.department,
  permissions = EXCLUDED.permissions;
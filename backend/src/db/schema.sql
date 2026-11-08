-- StockWise Pay Database Schema
-- Compatible with PostgreSQL 14+ / Supabase / Neon / Render
-- Order matters: referenced tables must be created before referencing tables

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

-- 2. PRODUCTS TABLE
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

-- 3. SUPPLIERS TABLE
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

-- 4. SUPPLIER OFFERS TABLE
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

-- 5. PURCHASE PLANS TABLE (references users)
CREATE TABLE IF NOT EXISTS purchase_plans (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  purchasing_budget NUMERIC(10, 2) NOT NULL,
  calculated_total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  current_version INTEGER NOT NULL DEFAULT 1,
  plan_status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, pending_approval, approved, rejected, paid, cancelled
  selected_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  deferred_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  scenario_mode VARCHAR(50) DEFAULT 'balanced', -- balanced, aggressive, conservative
  created_by_user_id VARCHAR(50) REFERENCES users(id), -- Track plan creator for resource-level authorization
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_plans_created_by ON purchase_plans(created_by_user_id);

-- 6. PLAN VERSIONS TABLE
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

-- 7. APPROVALS TABLE
CREATE TABLE IF NOT EXISTS approvals (
  id VARCHAR(50) PRIMARY KEY,
  purchase_plan_id VARCHAR(50) NOT NULL REFERENCES purchase_plans(id) ON DELETE CASCADE,
  approved_version INTEGER NOT NULL,
  approver_name VARCHAR(100) NOT NULL,
  approver_role VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL, -- approved, rejected, invalidated
  decision_notes TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(50) PRIMARY KEY,
  purchase_plan_id VARCHAR(50) NOT NULL REFERENCES purchase_plans(id),
  plan_version INTEGER NOT NULL,
  paypal_order_id VARCHAR(100) NOT NULL UNIQUE,
  paypal_capture_id VARCHAR(100),
  amount NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  payment_method VARCHAR(50) DEFAULT 'PayPal Sandbox',
  verified_status VARCHAR(50) NOT NULL DEFAULT 'CREATED', -- CREATED, APPROVED, COMPLETED, FAILED, CANCELLED
  payer_email VARCHAR(255),
  raw_paypal_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. PAYMENT EVENTS / WEBHOOKS TABLE
CREATE TABLE IF NOT EXISTS payment_events (
  id VARCHAR(50) PRIMARY KEY,
  paypal_order_id VARCHAR(100) NOT NULL,
  capture_id VARCHAR(100),
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  verification_result VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. INVENTORY IMPORTS TABLE
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

-- 11. AI AGENT RUNS TABLE
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

-- 12. AUDIT LOGS TABLE
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

-- 13. BUDGET CONFIG TABLE
CREATE TABLE IF NOT EXISTS budget_config (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
  monthly_budget NUMERIC(10, 2) NOT NULL DEFAULT 5000.00,
  spent_amount NUMERIC(10, 2) NOT NULL DEFAULT 1200.00,
  allocated_amount NUMERIC(10, 2) NOT NULL DEFAULT 2300.00,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. REVOKED TOKENS TABLE
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash VARCHAR(64) PRIMARY KEY,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 15. WEBHOOK EVENTS TABLE (deduplication by event.id)
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
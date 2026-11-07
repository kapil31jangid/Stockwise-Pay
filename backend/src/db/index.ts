import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
import {
  ProductRecord,
  SupplierRecord,
  SupplierOfferRecord,
  PurchasePlanRecord,
  PlanVersionRecord,
  ApprovalRecord,
  PaymentRecord,
  AuditLogRecord,
  BudgetConfigRecord,
  SEED_PRODUCTS,
  SEED_SUPPLIERS,
  SEED_OFFERS,
  INITIAL_BUDGET
} from './seedData.js';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'stockwise-store.json');

export interface DatabaseState {
  products: ProductRecord[];
  suppliers: SupplierRecord[];
  supplierOffers: SupplierOfferRecord[];
  purchasePlans: PurchasePlanRecord[];
  planVersions: PlanVersionRecord[];
  approvals: ApprovalRecord[];
  payments: PaymentRecord[];
  paymentEvents: any[];
  auditLogs: AuditLogRecord[];
  budget: BudgetConfigRecord;
  agentRuns: any[];
}

class DatabaseStore {
  private state: DatabaseState;
  private pgPool: pg.Pool | null = null;
  public isPostgres: boolean = false;

  constructor() {
    this.state = this.initLocalStore();
    this.initPostgres();
  }

  private initPostgres() {
    const connStr = process.env.DATABASE_URL;
    if (connStr && (connStr.startsWith('postgres://') || connStr.startsWith('postgresql://'))) {
      try {
        this.pgPool = new Pool({
          connectionString: connStr,
          ssl: connStr.includes('localhost') ? false : { rejectUnauthorized: false },
          max: 10,
          idleTimeoutMillis: 30000
        });
        this.isPostgres = true;
        console.log('🐘 PostgreSQL / Supabase connection configured via DATABASE_URL');
      } catch (err) {
        if (process.env.NODE_ENV === 'production') {
          console.error('FATAL: Failed to initialize PostgreSQL pool in production:', err);
          throw new Error('Production database connection failed. Silent local store fallback is disabled in production.');
        }
        console.warn('⚠️ Failed to initialize PostgreSQL pool, falling back to local store (dev mode):', err);
        this.pgPool = null;
        this.isPostgres = false;
      }
    }
  }

  public async verifyConnection(): Promise<void> {
    if (this.pgPool) {
      try {
        const client = await this.pgPool.connect();
        await client.query('SELECT 1;');
        client.release();
        console.log('✅ PostgreSQL connection verified successfully.');
      } catch (err: any) {
        if (process.env.NODE_ENV === 'production') {
          console.error('FATAL: Database connection verification failed in production:', err);
          throw new Error(`Production database connection failed: ${err.message}`);
        }
        console.warn('⚠️ PostgreSQL connection failed, running in local store fallback mode (dev):', err.message);
        this.isPostgres = false;
        this.pgPool = null;
      }
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: DATABASE_URL environment variable is required in production.');
    }
  }

  private handlePgError(operation: string, err: any): void {
    console.warn(`PostgreSQL ${operation} error:`, err?.message || err);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Production database error during ${operation}: ${err?.message || err}`);
    }
  }

  private initLocalStore(): DatabaseState {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(STORE_FILE)) {
      try {
        const raw = fs.readFileSync(STORE_FILE, 'utf-8');
        return JSON.parse(raw);
      } catch (err) {
        console.warn('⚠️ Could not parse existing store file, initializing fresh store with seeds.');
      }
    }

    const defaultState: DatabaseState = {
      products: [...SEED_PRODUCTS],
      suppliers: [...SEED_SUPPLIERS],
      supplierOffers: [...SEED_OFFERS],
      purchasePlans: [
        {
          id: 'PLAN-2026-001',
          name: 'Q4 Urgent High-Stockout Restock',
          purchasingBudget: 2000.00,
          calculatedTotal: 1850.00,
          currentVersion: 1,
          planStatus: 'pending_approval',
          selectedItems: [
            {
              sku: 'HP101',
              productName: 'Wireless Noise-Canceling Headphones',
              recommendedQuantity: 30,
              supplierId: 'SUP001',
              supplierName: 'VoltCore Distribution',
              unitCost: 15.20,
              subtotal: 456.00,
              leadTimeDays: 2,
              riskLevel: 'HIGH',
              daysUntilStockout: 5.09
            },
            {
              sku: 'KB201',
              productName: 'RGB Mechanical Gaming Keyboard',
              recommendedQuantity: 40,
              supplierId: 'SUP002',
              supplierName: 'Apex Electronics Wholesale',
              unitCost: 22.00,
              subtotal: 880.00,
              leadTimeDays: 3,
              riskLevel: 'HIGH',
              daysUntilStockout: 3.75
            },
            {
              sku: 'SSD601',
              productName: '1TB NVMe M.2 High-Speed SSD',
              recommendedQuantity: 10,
              supplierId: 'SUP004',
              supplierName: 'SiliconWave Global Components',
              unitCost: 48.00,
              subtotal: 480.00,
              leadTimeDays: 4,
              riskLevel: 'HIGH',
              daysUntilStockout: 4.2
            }
          ],
          deferredItems: [
            {
              sku: 'CB301',
              productName: 'Braided 100W USB-C to USB-C Cable (2m)',
              reason: 'LOW_STOCKOUT_RISK_DEFERRED'
            }
          ],
          scenarioMode: 'balanced',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      planVersions: [
        {
          id: 'VER-PLAN-2026-001-v1',
          planId: 'PLAN-2026-001',
          versionNumber: 1,
          budget: 2000.00,
          calculatedTotal: 1816.00,
          itemsSnapshot: [],
          deferredSnapshot: [],
          changeReason: 'Initial baseline plan',
          createdAt: new Date().toISOString()
        }
      ],
      approvals: [],
      payments: [
        {
          id: 'PAY-1001',
          purchasePlanId: 'PLAN-2026-000',
          planVersion: 1,
          paypalOrderId: '8AA1234567890123',
          paypalCaptureId: '9BB9876543210987',
          amount: 1450.00,
          currency: 'USD',
          paymentMethod: 'PayPal Sandbox',
          verifiedStatus: 'COMPLETED',
          payerEmail: 'buyer-retail@stockwise.test',
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          updatedAt: new Date(Date.now() - 86400000 * 2).toISOString()
        }
      ],
      paymentEvents: [],
      auditLogs: [
        {
          id: 'LOG-001',
          actor: 'System Seed',
          action: 'INIT_STORE',
          entityType: 'SYSTEM',
          entityId: 'ROOT',
          createdAt: new Date().toISOString()
        }
      ],
      budget: { ...INITIAL_BUDGET },
      agentRuns: []
    };

    this.persist(defaultState);
    return defaultState;
  }

  private persist(state: DatabaseState): void {
    try {
      fs.writeFileSync(STORE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist database store:', err);
    }
  }

  private save(): void {
    this.persist(this.state);
  }

  // --- PRODUCTS ---
  async getProducts(): Promise<ProductRecord[]> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            sku, name, category, 
            current_stock AS "currentStock", 
            safety_stock AS "safetyStock", 
            unit_cost::float AS "unitCost", 
            selling_price::float AS "sellingPrice", 
            sales_history AS "salesHistory", 
            preferred_vendor_id AS "preferredVendorId", 
            updated_at AS "updatedAt"
          FROM products
          ORDER BY sku ASC;
        `);
        if (res.rows.length > 0) return res.rows;
      } catch (err) {
        this.handlePgError('getProducts', err);
      }
    }
    return [...this.state.products];
  }

  async getProduct(sku: string): Promise<ProductRecord | null> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            sku, name, category, 
            current_stock AS "currentStock", 
            safety_stock AS "safetyStock", 
            unit_cost::float AS "unitCost", 
            selling_price::float AS "sellingPrice", 
            sales_history AS "salesHistory", 
            preferred_vendor_id AS "preferredVendorId", 
            updated_at AS "updatedAt"
          FROM products
          WHERE UPPER(sku) = UPPER($1)
          LIMIT 1;
        `, [sku]);
        if (res.rows.length > 0) return res.rows[0];
      } catch (err) {
        this.handlePgError('getProduct', err);
      }
    }
    const found = this.state.products.find(p => p.sku.toUpperCase() === sku.toUpperCase());
    return found ? { ...found } : null;
  }

  async saveProduct(product: ProductRecord): Promise<ProductRecord> {
    const updated = { ...product, updatedAt: new Date().toISOString() };
    if (this.pgPool) {
      try {
        await this.pgPool.query(`
          INSERT INTO products (sku, name, category, current_stock, safety_stock, unit_cost, selling_price, sales_history, preferred_vendor_id, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (sku) DO UPDATE SET
            name = EXCLUDED.name,
            category = EXCLUDED.category,
            current_stock = EXCLUDED.current_stock,
            safety_stock = EXCLUDED.safety_stock,
            unit_cost = EXCLUDED.unit_cost,
            selling_price = EXCLUDED.selling_price,
            sales_history = EXCLUDED.sales_history,
            preferred_vendor_id = EXCLUDED.preferred_vendor_id,
            updated_at = EXCLUDED.updated_at;
        `, [
          updated.sku, updated.name, updated.category,
          updated.currentStock, updated.safetyStock,
          updated.unitCost, updated.sellingPrice,
          JSON.stringify(updated.salesHistory || []),
          updated.preferredVendorId || null,
          updated.updatedAt
        ]);
      } catch (err) {
        this.handlePgError('saveProduct', err);
      }
    }
    const index = this.state.products.findIndex(p => p.sku.toUpperCase() === product.sku.toUpperCase());
    if (index >= 0) {
      this.state.products[index] = updated;
    } else {
      this.state.products.push(updated);
    }
    this.save();
    return updated;
  }

  async saveProducts(products: ProductRecord[]): Promise<ProductRecord[]> {
    for (const p of products) {
      await this.saveProduct(p);
    }
    return products;
  }

  async deleteProduct(sku: string): Promise<boolean> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query('DELETE FROM products WHERE UPPER(sku) = UPPER($1)', [sku]);
        if ((res.rowCount ?? 0) > 0) return true;
      } catch (err) {
        console.warn('PostgreSQL deleteProduct error:', err);
      }
    }
    const prevLen = this.state.products.length;
    this.state.products = this.state.products.filter(p => p.sku.toUpperCase() !== sku.toUpperCase());
    if (this.state.products.length !== prevLen) {
      this.save();
      return true;
    }
    return false;
  }

  // --- SUPPLIERS ---
  async getSuppliers(): Promise<SupplierRecord[]> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            id, name, 
            contact_email AS "contactEmail", 
            contact_phone AS "contactPhone", 
            location, 
            estimated_lead_time_days AS "estimatedLeadTimeDays", 
            reliability_score::float AS "reliabilityScore", 
            payment_terms AS "paymentTerms", 
            specialties, 
            created_at AS "createdAt"
          FROM suppliers
          ORDER BY id ASC;
        `);
        if (res.rows.length > 0) return res.rows;
      } catch (err) {
        console.warn('PostgreSQL getSuppliers error, falling back:', err);
      }
    }
    return [...this.state.suppliers];
  }

  async getSupplier(id: string): Promise<SupplierRecord | null> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            id, name, 
            contact_email AS "contactEmail", 
            contact_phone AS "contactPhone", 
            location, 
            estimated_lead_time_days AS "estimatedLeadTimeDays", 
            reliability_score::float AS "reliabilityScore", 
            payment_terms AS "paymentTerms", 
            specialties, 
            created_at AS "createdAt"
          FROM suppliers
          WHERE id = $1;
        `, [id]);
        if (res.rows.length > 0) return res.rows[0];
      } catch (err) {
        console.warn('PostgreSQL getSupplier error:', err);
      }
    }
    const found = this.state.suppliers.find(s => s.id === id);
    return found ? { ...found } : null;
  }

  // --- SUPPLIER OFFERS ---
  async getSupplierOffers(): Promise<SupplierOfferRecord[]> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            id, sku, supplier_id AS "supplierId", 
            unit_price::float AS "unitPrice", 
            shipping_cost::float AS "shippingCost", 
            moq, 
            lead_time_days AS "leadTimeDays", 
            bulk_discount_note AS "bulkDiscountNote", 
            quote_currency AS "quoteCurrency"
          FROM supplier_offers
          ORDER BY sku ASC, unit_price ASC;
        `);
        if (res.rows.length > 0) return res.rows;
      } catch (err) {
        console.warn('PostgreSQL getSupplierOffers error:', err);
      }
    }
    return [...this.state.supplierOffers];
  }

  async getOffersForSku(sku: string): Promise<SupplierOfferRecord[]> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            id, sku, supplier_id AS "supplierId", 
            unit_price::float AS "unitPrice", 
            shipping_cost::float AS "shippingCost", 
            moq, 
            lead_time_days AS "leadTimeDays", 
            bulk_discount_note AS "bulkDiscountNote", 
            quote_currency AS "quoteCurrency"
          FROM supplier_offers
          WHERE UPPER(sku) = UPPER($1)
          ORDER BY unit_price ASC;
        `, [sku]);
        if (res.rows.length > 0) return res.rows;
      } catch (err) {
        console.warn('PostgreSQL getOffersForSku error:', err);
      }
    }
    return this.state.supplierOffers.filter(o => o.sku.toUpperCase() === sku.toUpperCase());
  }

  async saveSupplierOffer(offer: SupplierOfferRecord): Promise<SupplierOfferRecord> {
    if (this.pgPool) {
      try {
        await this.pgPool.query(`
          INSERT INTO supplier_offers (id, sku, supplier_id, unit_price, shipping_cost, moq, lead_time_days, bulk_discount_note, quote_currency)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            unit_price = EXCLUDED.unit_price,
            shipping_cost = EXCLUDED.shipping_cost,
            moq = EXCLUDED.moq,
            lead_time_days = EXCLUDED.lead_time_days,
            bulk_discount_note = EXCLUDED.bulk_discount_note;
        `, [offer.id, offer.sku, offer.supplierId, offer.unitPrice, offer.shippingCost, offer.moq, offer.leadTimeDays, offer.bulkDiscountNote || null, offer.quoteCurrency]);
      } catch (err) {
        console.warn('PostgreSQL saveSupplierOffer error:', err);
      }
    }
    const index = this.state.supplierOffers.findIndex(o => o.id === offer.id);
    if (index >= 0) {
      this.state.supplierOffers[index] = offer;
    } else {
      this.state.supplierOffers.push(offer);
    }
    this.save();
    return offer;
  }

  // --- PURCHASE PLANS ---
  async getPurchasePlans(): Promise<PurchasePlanRecord[]> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            id, name, 
            purchasing_budget::float AS "purchasingBudget", 
            calculated_total::float AS "calculatedTotal", 
            current_version AS "currentVersion", 
            plan_status AS "planStatus", 
            selected_items AS "selectedItems", 
            deferred_items AS "deferredItems", 
            scenario_mode AS "scenarioMode", 
            created_at AS "createdAt", 
            updated_at AS "updatedAt"
          FROM purchase_plans
          ORDER BY created_at DESC;
        `);
        if (res.rows.length > 0) return res.rows;
      } catch (err) {
        console.warn('PostgreSQL getPurchasePlans error:', err);
      }
    }
    return [...this.state.purchasePlans];
  }

  async getPurchasePlan(id: string): Promise<PurchasePlanRecord | null> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            id, name, 
            purchasing_budget::float AS "purchasingBudget", 
            calculated_total::float AS "calculatedTotal", 
            current_version AS "currentVersion", 
            plan_status AS "planStatus", 
            selected_items AS "selectedItems", 
            deferred_items AS "deferredItems", 
            scenario_mode AS "scenarioMode", 
            created_at AS "createdAt", 
            updated_at AS "updatedAt"
          FROM purchase_plans
          WHERE id = $1;
        `, [id]);
        if (res.rows.length > 0) return res.rows[0];
      } catch (err) {
        console.warn('PostgreSQL getPurchasePlan error:', err);
      }
    }
    const found = this.state.purchasePlans.find(p => p.id === id);
    return found ? { ...found } : null;
  }

  async savePurchasePlan(plan: PurchasePlanRecord): Promise<PurchasePlanRecord> {
    const updated = { ...plan, updatedAt: new Date().toISOString() };
    if (this.pgPool) {
      try {
        await this.pgPool.query(`
          INSERT INTO purchase_plans (id, name, purchasing_budget, calculated_total, current_version, plan_status, selected_items, deferred_items, scenario_mode, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            purchasing_budget = EXCLUDED.purchasing_budget,
            calculated_total = EXCLUDED.calculated_total,
            current_version = EXCLUDED.current_version,
            plan_status = EXCLUDED.plan_status,
            selected_items = EXCLUDED.selected_items,
            deferred_items = EXCLUDED.deferred_items,
            scenario_mode = EXCLUDED.scenario_mode,
            updated_at = EXCLUDED.updated_at;
        `, [
          updated.id, updated.name, updated.purchasingBudget, updated.calculatedTotal,
          updated.currentVersion, updated.planStatus,
          JSON.stringify(updated.selectedItems || []),
          JSON.stringify(updated.deferredItems || []),
          updated.scenarioMode, updated.updatedAt
        ]);
      } catch (err) {
        console.warn('PostgreSQL savePurchasePlan error:', err);
      }
    }
    const index = this.state.purchasePlans.findIndex(p => p.id === plan.id);
    if (index >= 0) {
      this.state.purchasePlans[index] = updated;
    } else {
      this.state.purchasePlans.push(updated);
    }
    this.save();
    return updated;
  }

  async savePlanVersion(version: PlanVersionRecord): Promise<PlanVersionRecord> {
    if (this.pgPool) {
      try {
        await this.pgPool.query(`
          INSERT INTO plan_versions (id, plan_id, version_number, budget, calculated_total, items_snapshot, deferred_snapshot, change_reason, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
        `, [
          version.id, version.planId, version.versionNumber, version.budget,
          version.calculatedTotal,
          JSON.stringify(version.itemsSnapshot || []),
          JSON.stringify(version.deferredSnapshot || []),
          version.changeReason || null,
          version.createdAt
        ]);
      } catch (err) {
        console.warn('PostgreSQL savePlanVersion error:', err);
      }
    }
    this.state.planVersions.push(version);
    this.save();
    return version;
  }

  async getPlanVersions(planId: string): Promise<PlanVersionRecord[]> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            id, plan_id AS "planId", 
            version_number AS "versionNumber", 
            budget::float, 
            calculated_total::float AS "calculatedTotal", 
            items_snapshot AS "itemsSnapshot", 
            deferred_snapshot AS "deferredSnapshot", 
            change_reason AS "changeReason", 
            created_at AS "createdAt"
          FROM plan_versions
          WHERE plan_id = $1
          ORDER BY version_number ASC;
        `, [planId]);
        if (res.rows.length > 0) return res.rows;
      } catch (err) {
        console.warn('PostgreSQL getPlanVersions error:', err);
      }
    }
    return this.state.planVersions.filter(v => v.planId === planId);
  }

  // --- APPROVALS ---
  async saveApproval(approval: ApprovalRecord): Promise<ApprovalRecord> {
    if (this.pgPool) {
      try {
        await this.pgPool.query(`
          INSERT INTO approvals (id, purchase_plan_id, approved_version, approver_name, approver_role, status, decision_notes, timestamp)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
        `, [
          approval.id, approval.purchasePlanId, approval.approvedVersion,
          approval.approverName, approval.approverRole, approval.status,
          approval.decisionNotes || null, approval.timestamp
        ]);
      } catch (err) {
        console.warn('PostgreSQL saveApproval error:', err);
      }
    }
    this.state.approvals.push(approval);
    this.save();
    return approval;
  }

  async getApproval(purchasePlanId: string): Promise<ApprovalRecord | null> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            id, purchase_plan_id AS "purchasePlanId", 
            approved_version AS "approvedVersion", 
            approver_name AS "approverName", 
            approver_role AS "approverRole", 
            status, decision_notes AS "decisionNotes", 
            timestamp
          FROM approvals
          WHERE purchase_plan_id = $1
          ORDER BY timestamp DESC
          LIMIT 1;
        `, [purchasePlanId]);
        if (res.rows.length > 0) return res.rows[0];
      } catch (err) {
        console.warn('PostgreSQL getApproval error:', err);
      }
    }
    const matches = this.state.approvals
      .filter(a => a.purchasePlanId === purchasePlanId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return matches.length > 0 ? matches[0] : null;
  }

  // --- PAYMENTS ---
  async savePayment(payment: PaymentRecord): Promise<PaymentRecord> {
    const updated = { ...payment, updatedAt: new Date().toISOString() };
    if (this.pgPool) {
      try {
        await this.pgPool.query(`
          INSERT INTO payments (id, purchase_plan_id, plan_version, paypal_order_id, paypal_capture_id, amount, currency, payment_method, verified_status, payer_email, raw_paypal_response, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) DO UPDATE SET
            paypal_capture_id = EXCLUDED.paypal_capture_id,
            verified_status = EXCLUDED.verified_status,
            payer_email = EXCLUDED.payer_email,
            raw_paypal_response = EXCLUDED.raw_paypal_response,
            updated_at = EXCLUDED.updated_at;
        `, [
          updated.id, updated.purchasePlanId, updated.planVersion,
          updated.paypalOrderId, updated.paypalCaptureId || null,
          updated.amount, updated.currency, updated.paymentMethod,
          updated.verifiedStatus, updated.payerEmail || null,
          JSON.stringify(updated.rawPaypalResponse || {}),
          updated.createdAt, updated.updatedAt
        ]);
      } catch (err) {
        console.warn('PostgreSQL savePayment error:', err);
      }
    }
    const index = this.state.payments.findIndex(p => p.id === payment.id || p.paypalOrderId === payment.paypalOrderId);
    if (index >= 0) {
      this.state.payments[index] = updated;
    } else {
      this.state.payments.push(updated);
    }
    this.save();
    return updated;
  }

  async getPayment(id: string): Promise<PaymentRecord | null> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            id, purchase_plan_id AS "purchasePlanId", 
            plan_version AS "planVersion", 
            paypal_order_id AS "paypalOrderId", 
            paypal_capture_id AS "paypalCaptureId", 
            amount::float, currency, 
            payment_method AS "paymentMethod", 
            verified_status AS "verifiedStatus", 
            payer_email AS "payerEmail", 
            raw_paypal_response AS "rawPaypalResponse", 
            created_at AS "createdAt", 
            updated_at AS "updatedAt"
          FROM payments
          WHERE id = $1;
        `, [id]);
        if (res.rows.length > 0) return res.rows[0];
      } catch (err) {
        console.warn('PostgreSQL getPayment error:', err);
      }
    }
    const found = this.state.payments.find(p => p.id === id);
    return found ? { ...found } : null;
  }

  async getPaymentByPaypalOrderId(orderId: string): Promise<PaymentRecord | null> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            id, purchase_plan_id AS "purchasePlanId", 
            plan_version AS "planVersion", 
            paypal_order_id AS "paypalOrderId", 
            paypal_capture_id AS "paypalCaptureId", 
            amount::float, currency, 
            payment_method AS "paymentMethod", 
            verified_status AS "verifiedStatus", 
            payer_email AS "payerEmail", 
            raw_paypal_response AS "rawPaypalResponse", 
            created_at AS "createdAt", 
            updated_at AS "updatedAt"
          FROM payments
          WHERE paypal_order_id = $1;
        `, [orderId]);
        if (res.rows.length > 0) return res.rows[0];
      } catch (err) {
        console.warn('PostgreSQL getPaymentByPaypalOrderId error:', err);
      }
    }
    const found = this.state.payments.find(p => p.paypalOrderId === orderId);
    return found ? { ...found } : null;
  }

  async getPayments(): Promise<PaymentRecord[]> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            id, purchase_plan_id AS "purchasePlanId", 
            plan_version AS "planVersion", 
            paypal_order_id AS "paypalOrderId", 
            paypal_capture_id AS "paypalCaptureId", 
            amount::float, currency, 
            payment_method AS "paymentMethod", 
            verified_status AS "verifiedStatus", 
            payer_email AS "payerEmail", 
            created_at AS "createdAt", 
            updated_at AS "updatedAt"
          FROM payments
          ORDER BY created_at DESC;
        `);
        if (res.rows.length > 0) return res.rows;
      } catch (err) {
        this.handlePgError('getPayments', err);
      }
    }
    return [...this.state.payments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Atomic Payment Capture Transaction with Row-Level Locking and Budget Ceiling Protection
   */
  public async executePaymentCaptureTransaction(params: {
    payment: PaymentRecord;
    planId: string;
    amount: number;
    actor: string;
    captureId: string;
    rawPaypalResponse?: any;
    payerEmail?: string;
  }): Promise<{ payment: PaymentRecord; budget: BudgetConfigRecord }> {
    const { payment, planId, amount, actor, captureId, rawPaypalResponse, payerEmail } = params;

    if (this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN;');

        // 1. Lock and verify payment record
        const payRes = await client.query(
          `SELECT id, verified_status AS "verifiedStatus", amount::float FROM payments WHERE id = $1 FOR UPDATE;`,
          [payment.id]
        );
        if (payRes.rows.length === 0) {
          throw new Error(`Payment record ${payment.id} not found in database.`);
        }
        if (payRes.rows[0].verifiedStatus === 'COMPLETED') {
          await client.query('ROLLBACK;');
          return { payment, budget: await this.getBudget() };
        }

        // 2. Lock and verify budget record to prevent double-spending
        const budgetRes = await client.query(
          `SELECT id, monthly_budget::float AS "monthlyBudget", spent_amount::float AS "spentAmount", allocated_amount::float AS "allocatedAmount" FROM budget_config LIMIT 1 FOR UPDATE;`
        );
        const currentBudget = budgetRes.rows[0] || { id: 'default', monthlyBudget: 5000, spentAmount: 0, allocatedAmount: 0 };
        const budgetId = currentBudget.id || 'default';
        const newSpent = Number((currentBudget.spentAmount + amount).toFixed(2));
        if (newSpent > currentBudget.monthlyBudget + 0.01) {
          throw new Error(`Transaction rejected: Budget ceiling exceeded ($${newSpent.toFixed(2)} / $${currentBudget.monthlyBudget.toFixed(2)}).`);
        }
        const newAllocated = Math.max(0, Number((currentBudget.allocatedAmount - amount).toFixed(2)));

        // 3. Update budget
        await client.query(
          `UPDATE budget_config SET spent_amount = $1, allocated_amount = $2, updated_at = $3 WHERE id = $4;`,
          [newSpent, newAllocated, new Date().toISOString(), budgetId]
        );

        // 4. Update plan status to 'paid'
        await client.query(
          `UPDATE purchase_plans SET plan_status = 'paid', updated_at = $1 WHERE id = $2;`,
          [new Date().toISOString(), planId]
        );

        // 5. Update payment record to COMPLETED
        const updatedPayment: PaymentRecord = {
          ...payment,
          paypalCaptureId: captureId,
          verifiedStatus: 'COMPLETED',
          payerEmail: payerEmail || payment.payerEmail || 'buyer-retail@stockwise.test',
          rawPaypalResponse: rawPaypalResponse || payment.rawPaypalResponse,
          updatedAt: new Date().toISOString()
        };
        await client.query(
          `UPDATE payments SET paypal_capture_id = $1, verified_status = 'COMPLETED', payer_email = $2, raw_paypal_response = $3, updated_at = $4 WHERE id = $5;`,
          [captureId, updatedPayment.payerEmail, JSON.stringify(updatedPayment.rawPaypalResponse || {}), updatedPayment.updatedAt, payment.id]
        );

        // 6. Insert immutable audit log
        await client.query(
          `INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, previous_status, new_status, details, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
          [
            `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            actor,
            'CAPTURE_PAYPAL_ORDER',
            'PAYMENT',
            captureId,
            'CREATED',
            'COMPLETED',
            JSON.stringify({ orderId: payment.paypalOrderId, captureId, amount }),
            new Date().toISOString()
          ]
        );

        await client.query('COMMIT;');

        // Sync local memory state
        const idx = this.state.payments.findIndex(p => p.id === payment.id);
        if (idx >= 0) this.state.payments[idx] = updatedPayment;
        const planIdx = this.state.purchasePlans.findIndex(p => p.id === planId);
        if (planIdx >= 0) this.state.purchasePlans[planIdx].planStatus = 'paid';
        this.state.budget.spentAmount = newSpent;
        this.state.budget.allocatedAmount = newAllocated;
        this.save();

        return { payment: updatedPayment, budget: { ...currentBudget, spentAmount: newSpent, allocatedAmount: newAllocated } };
      } catch (err: any) {
        await client.query('ROLLBACK;');
        this.handlePgError('executePaymentCaptureTransaction', err);
        throw err;
      } finally {
        client.release();
      }
    }

    // Local in-memory transaction with strict balance enforcement
    const payIdx = this.state.payments.findIndex(p => p.id === payment.id);
    if (payIdx < 0) throw new Error(`Payment record ${payment.id} not found.`);
    if (this.state.payments[payIdx].verifiedStatus === 'COMPLETED') {
      return { payment: this.state.payments[payIdx], budget: this.state.budget };
    }

    const currentBudget = this.state.budget;
    const newSpent = Number((currentBudget.spentAmount + amount).toFixed(2));
    if (newSpent > currentBudget.monthlyBudget + 0.01) {
      throw new Error(`Transaction rejected: Budget ceiling exceeded ($${newSpent.toFixed(2)} / $${currentBudget.monthlyBudget.toFixed(2)}).`);
    }

    const updatedPayment: PaymentRecord = {
      ...payment,
      paypalCaptureId: captureId,
      verifiedStatus: 'COMPLETED',
      payerEmail: payerEmail || payment.payerEmail || 'buyer-retail@stockwise.test',
      rawPaypalResponse: rawPaypalResponse || payment.rawPaypalResponse,
      updatedAt: new Date().toISOString()
    };
    this.state.payments[payIdx] = updatedPayment;

    const plan = this.state.purchasePlans.find(p => p.id === planId);
    if (plan) plan.planStatus = 'paid';

    this.state.budget.spentAmount = newSpent;
    this.state.budget.allocatedAmount = Math.max(0, Number((currentBudget.allocatedAmount - amount).toFixed(2)));

    this.state.auditLogs.unshift({
      id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      actor,
      action: 'CAPTURE_PAYPAL_ORDER',
      entityType: 'PAYMENT',
      entityId: captureId,
      previousStatus: 'CREATED',
      newStatus: 'COMPLETED',
      details: { orderId: payment.paypalOrderId, captureId, amount },
      createdAt: new Date().toISOString()
    });

    this.save();
    return { payment: updatedPayment, budget: this.state.budget };
  }

  async savePaymentEvent(event: any): Promise<any> {
    if (this.pgPool) {
      try {
        await this.pgPool.query(`
          INSERT INTO payment_events (id, paypal_order_id, capture_id, event_type, payload, verification_result, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7);
        `, [
          event.id || `EVT-${Date.now()}`,
          event.paypalOrderId || 'UNKNOWN',
          event.captureId || null,
          event.eventType || 'UNKNOWN',
          JSON.stringify(event.payload || {}),
          event.verificationResult || 'VERIFIED',
          event.createdAt || new Date().toISOString()
        ]);
      } catch (err) {
        console.warn('PostgreSQL savePaymentEvent error:', err);
      }
    }
    this.state.paymentEvents.push(event);
    this.save();
    return event;
  }

  // --- AUDIT LOGS ---
  async saveAuditLog(log: Omit<AuditLogRecord, 'id' | 'createdAt'>): Promise<AuditLogRecord> {
    const fullLog: AuditLogRecord = {
      ...log,
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString()
    };
    if (this.pgPool) {
      try {
        await this.pgPool.query(`
          INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, previous_status, new_status, details, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
        `, [
          fullLog.id, fullLog.actor, fullLog.action, fullLog.entityType,
          fullLog.entityId, fullLog.previousStatus || null, fullLog.newStatus || null,
          JSON.stringify(fullLog.details || {}), fullLog.createdAt
        ]);
      } catch (err) {
        console.warn('PostgreSQL saveAuditLog error:', err);
      }
    }
    this.state.auditLogs.unshift(fullLog);
    this.save();
    return fullLog;
  }

  async getAuditLogs(): Promise<AuditLogRecord[]> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            id, actor, action, 
            entity_type AS "entityType", 
            entity_id AS "entityId", 
            previous_status AS "previousStatus", 
            new_status AS "newStatus", 
            details, created_at AS "createdAt"
          FROM audit_logs
          ORDER BY created_at DESC
          LIMIT 100;
        `);
        if (res.rows.length > 0) return res.rows;
      } catch (err) {
        console.warn('PostgreSQL getAuditLogs error:', err);
      }
    }
    return [...this.state.auditLogs];
  }

  // --- BUDGET ---
  async getBudget(): Promise<BudgetConfigRecord> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            id, 
            monthly_budget::float AS "monthlyBudget", 
            spent_amount::float AS "spentAmount", 
            allocated_amount::float AS "allocatedAmount", 
            updated_at AS "updatedAt"
          FROM budget_config
          WHERE id = 'default'
          LIMIT 1;
        `);
        if (res.rows.length > 0) return res.rows[0];
      } catch (err) {
        console.warn('PostgreSQL getBudget error:', err);
      }
    }
    return { ...this.state.budget };
  }

  async updateBudget(patch: Partial<BudgetConfigRecord>): Promise<BudgetConfigRecord> {
    this.state.budget = {
      ...this.state.budget,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    if (this.pgPool) {
      try {
        await this.pgPool.query(`
          UPDATE budget_config
          SET 
            monthly_budget = COALESCE($1, monthly_budget),
            spent_amount = COALESCE($2, spent_amount),
            allocated_amount = COALESCE($3, allocated_amount),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = 'default';
        `, [patch.monthlyBudget || null, patch.spentAmount || null, patch.allocatedAmount || null]);
      } catch (err) {
        console.warn('PostgreSQL updateBudget error:', err);
      }
    }
    this.save();
    return { ...this.state.budget };
  }

  // --- AGENT RUNS ---
  async saveAgentRun(run: any): Promise<any> {
    if (this.pgPool) {
      try {
        await this.pgPool.query(`
          INSERT INTO ai_agent_runs (id, request_type, user_prompt, tools_called, results, execution_status, execution_duration_ms, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
        `, [
          run.id, run.requestType || 'PROCUREMENT_ANALYSIS', run.userPrompt || null,
          JSON.stringify(run.toolsCalled || []), JSON.stringify(run.results || {}),
          run.executionStatus || 'success', run.executionDurationMs || 0,
          run.createdAt || new Date().toISOString()
        ]);
      } catch (err) {
        console.warn('PostgreSQL saveAgentRun error:', err);
      }
    }
    this.state.agentRuns.unshift(run);
    this.save();
    return run;
  }

  async getAgentRun(id: string): Promise<any | null> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            id, request_type AS "requestType", 
            user_prompt AS "userPrompt", 
            tools_called AS "toolsCalled", 
            results, 
            execution_status AS "executionStatus", 
            execution_duration_ms AS "executionDurationMs", 
            created_at AS "createdAt"
          FROM ai_agent_runs
          WHERE id = $1;
        `, [id]);
        if (res.rows.length > 0) return res.rows[0];
      } catch (err) {
        console.warn('PostgreSQL getAgentRun error:', err);
      }
    }
    const found = this.state.agentRuns.find(r => r.id === id);
    return found || null;
  }

  async resetToSeed(): Promise<void> {
    if (fs.existsSync(STORE_FILE)) {
      fs.unlinkSync(STORE_FILE);
    }
    this.state = this.initLocalStore();
    if (this.pgPool) {
      try {
        await this.pgPool.query(`
          UPDATE budget_config
          SET spent_amount = 1200.00, allocated_amount = 1850.00, monthly_budget = 5000.00
          WHERE id = 'default';
        `);
      } catch (err) {
        console.warn('PostgreSQL reset budget error:', err);
      }
    }
  }
}

export const db = new DatabaseStore();

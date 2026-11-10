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

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: 'LEAD_APPROVER' | 'BUYER' | 'TREASURY' | 'STORE_MANAGER';
  displayRole: string;
  department: string;
  avatarInitials: string;
  badge: string;
  permissions: string[];
  createdAt?: string;
  updatedAt?: string;
}

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
  users: UserRecord[];
  revokedTokens: { tokenHash: string; expiresAt: string }[];
  webhookEvents: any[];
  captureAttempts: any[];
}

export const SEED_USERS: UserRecord[] = [
  {
    id: 'USR-001',
    name: 'Marcus Vance',
    email: 'marcus.vance@stockwisepay.com',
    passwordHash: '$2b$10$6eq.Sj2yWsaYxHgNYjxtZucnPMsGmsgeWXM6kD5w5moOYU/oKqnK.',
    role: 'LEAD_APPROVER',
    displayRole: 'Inventory Lead / Approver',
    department: 'Operations & Supply',
    avatarInitials: 'MV',
    badge: 'LEAD APPROVER',
    permissions: ['INVENTORY_VIEW', 'INVENTORY_EDIT', 'PLAN_GENERATE', 'PLAN_APPROVE', 'PAYMENT_EXECUTE']
  },
  {
    id: 'USR-002',
    name: 'Elena Rostova',
    email: 'elena.rostova@stockwisepay.com',
    passwordHash: '$2b$10$A.4//Ploce25Alhbt1aGE.fjpsVOXtWAiiE.U0tsiC/WdzbCJB6Y2',
    role: 'BUYER',
    displayRole: 'Procurement Specialist',
    department: 'Supplier Relations',
    avatarInitials: 'ER',
    badge: 'BUYER',
    permissions: ['INVENTORY_VIEW', 'SUPPLIERS_COMPARE', 'PLAN_GENERATE']
  },
  {
    id: 'USR-003',
    name: 'David Chen',
    email: 'david.chen@stockwisepay.com',
    passwordHash: '$2b$10$q6sAjkDwmI7ttOEkwJimqOXnJ0q.wUbgBLecgACZ41CJgeo32kX7m',
    role: 'TREASURY',
    displayRole: 'Chief Financial Officer',
    department: 'Finance & Treasury',
    avatarInitials: 'DC',
    badge: 'TREASURY',
    permissions: ['BUDGET_EDIT', 'AUDIT_VIEW', 'PAYMENT_AUDIT', 'PLAN_APPROVE', 'PAYMENT_EXECUTE']
  }
];

export class DatabaseStore {
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
        const parsed = JSON.parse(raw);
        if (!parsed.users) parsed.users = [...SEED_USERS];
        if (!parsed.revokedTokens) parsed.revokedTokens = [];
        if (!parsed.webhookEvents) parsed.webhookEvents = [];
        return parsed;
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
          calculatedTotal: 1816.00,
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
      agentRuns: [],
      users: [...SEED_USERS],
      revokedTokens: [],
      webhookEvents: [],
      captureAttempts: []
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

  // --- USERS ---
  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const cleanEmail = email.trim().toLowerCase();
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            id, name, email, 
            password_hash AS "passwordHash", 
            role, 
            display_role AS "displayRole", 
            department, 
            avatar_initials AS "avatarInitials", 
            badge, 
            permissions, 
            created_at AS "createdAt", 
            updated_at AS "updatedAt"
          FROM users
          WHERE LOWER(email) = $1
          LIMIT 1;
        `, [cleanEmail]);
        return res.rows[0] || null;
      } catch (err) {
        this.handlePgError('getUserByEmail', err);
        throw err;
      }
    }
    const found = this.state.users.find(u => u.email.toLowerCase() === cleanEmail);
    return found ? { ...found } : null;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT 
            id, name, email, 
            password_hash AS "passwordHash", 
            role, 
            display_role AS "displayRole", 
            department, 
            avatar_initials AS "avatarInitials", 
            badge, 
            permissions, 
            created_at AS "createdAt", 
            updated_at AS "updatedAt"
          FROM users
          WHERE id = $1
          LIMIT 1;
        `, [id]);
        return res.rows[0] || null;
      } catch (err) {
        this.handlePgError('getUserById', err);
        throw err;
      }
    }
    const found = this.state.users.find(u => u.id === id);
    return found ? { ...found } : null;
  }

  async saveUser(user: UserRecord): Promise<UserRecord> {
    const updated = { ...user, updatedAt: new Date().toISOString() };
    if (this.pgPool) {
      try {
        await this.pgPool.query(`
          INSERT INTO users (id, name, email, password_hash, role, display_role, department, avatar_initials, badge, permissions, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            display_role = EXCLUDED.display_role,
            department = EXCLUDED.department,
            avatar_initials = EXCLUDED.avatar_initials,
            badge = EXCLUDED.badge,
            permissions = EXCLUDED.permissions,
            updated_at = EXCLUDED.updated_at;
        `, [
          updated.id, updated.name, updated.email, updated.passwordHash,
          updated.role, updated.displayRole, updated.department,
          updated.avatarInitials, updated.badge,
          JSON.stringify(updated.permissions || []),
          updated.updatedAt
        ]);
        return updated;
      } catch (err) {
        this.handlePgError('saveUser', err);
        throw err;
      }
    }
    const idx = this.state.users.findIndex(u => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase());
    if (idx >= 0) {
      this.state.users[idx] = updated;
    } else {
      this.state.users.push(updated);
    }
    this.save();
    return updated;
  }

  // --- TOKEN REVOCATION ---
  async revokeToken(tokenHash: string, expiresAt: Date): Promise<void> {
    if (this.pgPool) {
      try {
        await this.pgPool.query(`
          INSERT INTO revoked_tokens (token_hash, expires_at, created_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP)
          ON CONFLICT (token_hash) DO NOTHING;
        `, [tokenHash, expiresAt.toISOString()]);
        return;
      } catch (err) {
        this.handlePgError('revokeToken', err);
        throw err;
      }
    }
    this.state.revokedTokens.push({ tokenHash, expiresAt: expiresAt.toISOString() });
    this.save();
  }

  async isTokenRevoked(tokenHash: string): Promise<boolean> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(`
          SELECT token_hash FROM revoked_tokens 
          WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP LIMIT 1;
        `, [tokenHash]);
        return res.rows.length > 0;
      } catch (err) {
        this.handlePgError('isTokenRevoked', err);
        throw err;
      }
    }
    const now = new Date().toISOString();
    return this.state.revokedTokens.some(r => r.tokenHash === tokenHash && r.expiresAt > now);
  }

  // --- WEBHOOK EVENTS ---
  async saveWebhookEvent(event: {
    id: string;
    transmissionId?: string;
    eventType: string;
    summary?: string;
    resourceType?: string;
    status?: string;
    rawPayload: any;
  }): Promise<{ saved: boolean; duplicate: boolean }> {
    if (this.pgPool) {
      try {
        const check = await this.pgPool.query('SELECT id FROM webhook_events WHERE id = $1 LIMIT 1;', [event.id]);
        if (check.rows.length > 0) {
          return { saved: false, duplicate: true };
        }
        await this.pgPool.query(`
          INSERT INTO webhook_events (id, transmission_id, event_type, summary, resource_type, status, raw_payload, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO NOTHING;
        `, [
          event.id,
          event.transmissionId || null,
          event.eventType,
          event.summary || null,
          event.resourceType || null,
          event.status || 'VERIFIED',
          JSON.stringify(event.rawPayload || {})
        ]);
        return { saved: true, duplicate: false };
      } catch (err) {
        this.handlePgError('saveWebhookEvent', err);
        throw err;
      }
    }
    if (this.state.webhookEvents.some(e => e.id === event.id)) {
      return { saved: false, duplicate: true };
    }
    this.state.webhookEvents.push(event);
    this.save();
    return { saved: true, duplicate: false };
  }

  async isWebhookProcessed(eventId: string): Promise<boolean> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query('SELECT id FROM webhook_events WHERE id = $1 LIMIT 1;', [eventId]);
        return res.rows.length > 0;
      } catch (err) {
        this.handlePgError('isWebhookProcessed', err);
        throw err;
      }
    }
    return this.state.webhookEvents.some(e => e.id === eventId);
  }

  // --- CAPTURE ATTEMPTS (Distributed Locking with Lease/Heartbeat) ---
  /**
   * Try to acquire a capture lock by inserting a CAPTURING record with lease.
   * Returns the capture attempt ID if lock acquired, null if already capturing/completed.
   * Returns "RECONCILE:<attemptId>" if reconciliation with PayPal is needed before takeover.
   * Uses lease/heartbeat mechanism: active lease prevents takeover; expired lease requires
   * reconciliation with live PayPal state before safe takeover.
   *
   * IMPORTANT: After reconciliation returns APPROVED, the caller MUST call this again
   * with forceNewAttempt=true to get a completely fresh attempt ID, not reuse the old one.
   * The new attempt uses the SAME paypal_order_id (allowed by partial unique index).
   */
  async tryAcquireCaptureLock(
    paypalOrderId: string,
    paymentId: string,
    instanceId: string,
    paypalRequestId: string,
    forceNewAttempt: boolean = false
  ): Promise<string | null> {
    if (this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN;');

        // Check for existing capture attempt - order by started_at DESC to get latest attempt first
        const existingRes = await client.query(
          `SELECT id, status, started_at, lease_expires_at, lease_owner, paypal_capture_id, paypal_request_id
           FROM capture_attempts WHERE paypal_order_id = $1 ORDER BY started_at DESC FOR UPDATE;`,
          [paypalOrderId]
        );

        if (existingRes.rows.length > 0) {
          const existing = existingRes.rows[0];
          const now = new Date();

          // If forceNewAttempt is true (after successful reconciliation), mark old attempt as superseded
          // and create a brand new attempt record. This check MUST come before RECONCILE check.
          if (forceNewAttempt) {
            // Mark old attempt as superseded (not failed, just superseded by new attempt)
            await client.query(
              `UPDATE capture_attempts
               SET status = 'SUPERSEDED',
                   error_message = 'Superseded by new attempt after reconciliation',
                   completed_at = CURRENT_TIMESTAMP,
                   lease_expires_at = NULL,
                   lease_owner = NULL
               WHERE id = $1;`,
              [existing.id]
            );

            // Insert new attempt with fresh lease (same paypal_order_id allowed by partial unique index)
            const attemptId = `CAP-ATT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const leaseExpires = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
            await client.query(
              `INSERT INTO capture_attempts (id, paypal_order_id, payment_id, status, started_at, lease_expires_at, last_heartbeat_at, lease_owner, paypal_request_id)
               VALUES ($1, $2, $3, 'CAPTURING', CURRENT_TIMESTAMP, $4, CURRENT_TIMESTAMP, $5, $6);`,
              [attemptId, paypalOrderId, paymentId, leaseExpires, instanceId, paypalRequestId]
            );
            await client.query('COMMIT;');
            return attemptId;
          }

          if (existing.status === 'COMPLETED') {
            await client.query('ROLLBACK;');
            return null; // Already completed
          }

          // Check if lease is still active
          const leaseExpiresAt = existing.lease_expires_at ? new Date(existing.lease_expires_at).getTime() : 0;
          const isLeaseActive = leaseExpiresAt > now.getTime();

          if (existing.status === 'CAPTURING' && isLeaseActive) {
            // Active lease held by another instance - cannot acquire
            await client.query('ROLLBACK;');
            return null;
          }

          // Lease expired or no lease - need to reconcile before takeover
          // If there's a paypal_capture_id or paypal_request_id, reconcile with PayPal first
          if (existing.paypal_capture_id || existing.paypal_request_id) {
            await client.query('ROLLBACK;');
            // Return special marker indicating reconciliation needed
            return `RECONCILE:${existing.id}`;
          }

          // Safe to take over stale attempt - update with new lease (legacy path, no PayPal IDs)
          const newLeaseExpires = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
          await client.query(
            `UPDATE capture_attempts
             SET status = 'CAPTURING',
                 retry_count = retry_count + 1,
                 started_at = CURRENT_TIMESTAMP,
                 error_message = NULL,
                 lease_expires_at = $1,
                 last_heartbeat_at = CURRENT_TIMESTAMP,
                 lease_owner = $2,
                 paypal_request_id = $3
             WHERE id = $4;`,
            [newLeaseExpires, instanceId, paypalRequestId, existing.id]
          );
          await client.query('COMMIT;');
          return existing.id;
        }

        // No existing attempt - insert new CAPTURING record with lease
        const attemptId = `CAP-ATT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const leaseExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        await client.query(
          `INSERT INTO capture_attempts (id, paypal_order_id, payment_id, status, started_at, lease_expires_at, last_heartbeat_at, lease_owner, paypal_request_id)
           VALUES ($1, $2, $3, 'CAPTURING', CURRENT_TIMESTAMP, $4, CURRENT_TIMESTAMP, $5, $6);`,
          [attemptId, paypalOrderId, paymentId, leaseExpires, instanceId, paypalRequestId]
        );
        await client.query('COMMIT;');
        return attemptId;
      } catch (err: any) {
        await client.query('ROLLBACK;');
        if (err.code === '23505') { // unique_violation on partial unique index
          // Race condition - another instance inserted an active attempt between SELECT and INSERT
          return null;
        }
        this.handlePgError('tryAcquireCaptureLock', err);
        throw err;
      } finally {
        client.release();
      }
    }

    // Local store fallback - simple in-memory check with lease
    const existing = this.state.captureAttempts?.find(c => c.paypalOrderId === paypalOrderId);
    const now = Date.now();
    if (existing) {
      const leaseExpiresAt = existing.leaseExpiresAt ? new Date(existing.leaseExpiresAt).getTime() : 0;
      const isLeaseActive = leaseExpiresAt > now;

      // If forceNewAttempt, create new record instead of reusing old one (check FIRST)
      if (forceNewAttempt) {
        // Mark old as superseded
        existing.status = 'SUPERSEDED';
        existing.errorMessage = 'Superseded by new attempt after reconciliation';
        existing.completedAt = new Date().toISOString();
        existing.leaseExpiresAt = null;
        existing.leaseOwner = null;

        // Create fresh attempt
        const attemptId = `CAP-ATT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        if (!this.state.captureAttempts) this.state.captureAttempts = [];
        this.state.captureAttempts.push({
          id: attemptId,
          paypalOrderId,
          paymentId,
          status: 'CAPTURING',
          startedAt: new Date().toISOString(),
          leaseExpiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
          lastHeartbeatAt: new Date().toISOString(),
          leaseOwner: instanceId,
          paypalRequestId: paypalRequestId,
          retryCount: 0
        });
        this.save();
        return attemptId;
      }

      if (existing.status === 'COMPLETED' || (existing.status === 'CAPTURING' && isLeaseActive)) {
        return null;
      }
      if (existing.paypalCaptureId || existing.paypalRequestId) {
        return `RECONCILE:${existing.id}`;
      }
      // Stale - allow takeover with new lease (legacy path)
      existing.status = 'CAPTURING';
      existing.retryCount = (existing.retryCount || 0) + 1;
      existing.startedAt = new Date().toISOString();
      existing.leaseExpiresAt = new Date(now + 5 * 60 * 1000).toISOString();
      existing.lastHeartbeatAt = new Date().toISOString();
      existing.leaseOwner = instanceId;
      existing.paypalRequestId = paypalRequestId;
      existing.errorMessage = null;
      return existing.id;
    }

    const attemptId = `CAP-ATT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    if (!this.state.captureAttempts) this.state.captureAttempts = [];
    this.state.captureAttempts.push({
      id: attemptId,
      paypalOrderId,
      paymentId,
      status: 'CAPTURING',
      startedAt: new Date().toISOString(),
      leaseExpiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      leaseOwner: instanceId,
      paypalRequestId: paypalRequestId,
      retryCount: 0
    });
    this.save();
    return attemptId;
  }

  /**
   * Renew the lease for an active capture attempt (heartbeat).
   * Called periodically during long-running PayPal capture operations.
   */
  async renewCaptureLease(attemptId: string, instanceId: string): Promise<boolean> {
    if (this.pgPool) {
      try {
        const result = await this.pgPool.query(
          `UPDATE capture_attempts
           SET lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
               last_heartbeat_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND lease_owner = $2 AND status = 'CAPTURING'
           RETURNING id;`,
          [attemptId, instanceId]
        );
        return result.rowCount !== null && result.rowCount > 0;
      } catch (err) {
        this.handlePgError('renewCaptureLease', err);
        throw err;
      }
    }
    // Local fallback
    const existing = this.state.captureAttempts?.find(c => c.id === attemptId);
    if (existing && existing.leaseOwner === instanceId && existing.status === 'CAPTURING') {
      existing.leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      existing.lastHeartbeatAt = new Date().toISOString();
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Reconcile a stale capture attempt with live PayPal state before takeover.
   * Performs actual PayPal API call to verify order state.
   * Returns ReconciliationResult with status and capture ID if completed.
   * If PayPal reports COMPLETED, performs full idempotent financial settlement via settleReconciliationTransaction.
   * Validates ACTUAL PayPal capture response (capture.id, capture.status, capture.amount.value, capture.amount.currency_code).
   * Never returns a RECONCILE marker - that is handled at the call site.
   * Fail closed when PayPal state is unavailable or ambiguous.
   */
  async reconcileCaptureAttempt(paypalOrderId: string, existingAttemptId: string, accessToken: string): Promise<{
    status: 'COMPLETED' | 'APPROVED' | 'FAILED' | 'UNKNOWN';
    captureId?: string;
    error?: string;
  }> {
    if (this.pgPool) {
      try {
        // First check local DB for existing completion
        const localRes = await this.pgPool.query(
          `SELECT paypal_capture_id, paypal_request_id, status FROM capture_attempts WHERE id = $1;`,
          [existingAttemptId]
        );
        if (localRes.rows.length > 0) {
          const attempt = localRes.rows[0];
          if (attempt.status === 'COMPLETED' && attempt.paypal_capture_id) {
            return { status: 'COMPLETED', captureId: attempt.paypal_capture_id }; // Already completed in DB
          }
        }

        // Perform actual PayPal API reconciliation
        const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';
        const orderRes = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${paypalOrderId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!orderRes.ok) {
          const errText = await orderRes.text();
          return { status: 'FAILED', error: `PayPal reconciliation failed: Unable to verify order state (HTTP ${orderRes.status}): ${errText}` };
        }

        const liveOrder = await orderRes.json() as any;

        // If order is COMPLETED, extract capture details and perform full settlement
        if (liveOrder.status === 'COMPLETED') {
          const completedCapture = liveOrder.purchase_units?.[0]?.payments?.captures?.[0];
          if (completedCapture && completedCapture.status === 'COMPLETED' && completedCapture.id) {
            // Get payment record to extract payment details for settlement
            const paymentRes = await this.pgPool.query(
              `SELECT p.id, p.purchase_plan_id, p.plan_version, p.amount, p.currency, p.payer_email, p.raw_paypal_response
               FROM payments p
               JOIN capture_attempts ca ON ca.payment_id = p.id
               WHERE ca.id = $1;`,
              [existingAttemptId]
            );
            if (paymentRes.rows.length === 0) {
              return { status: 'FAILED', error: 'PayPal reconciliation failed: Associated payment record not found' };
            }
            const payment = paymentRes.rows[0];

            // --- Validate ACTUAL PayPal capture response fields ---
            // 1. Require capture.id (already checked above)
            // 2. Require capture.status === COMPLETED (already checked above)
            // 3. Require capture.amount.value (must exist, be non-null, numeric, and finite)
            const rawAmountValue = completedCapture.amount?.value;
            if (rawAmountValue === undefined || rawAmountValue === null || rawAmountValue === '') {
              return { status: 'FAILED', error: 'PayPal reconciliation failed: Missing capture amount value' };
            }
            const captureAmount = Number(rawAmountValue);
            if (isNaN(captureAmount) || !isFinite(captureAmount)) {
              return { status: 'FAILED', error: `PayPal reconciliation failed: Malformed or non-numeric capture amount value: "${rawAmountValue}"` };
            }
            // 4. Require capture.amount.currency_code (must exist, be non-null, non-empty string)
            const captureCurrency = completedCapture.amount?.currency_code;
            if (captureCurrency === undefined || captureCurrency === null || typeof captureCurrency !== 'string' || captureCurrency.trim() === '') {
              return { status: 'FAILED', error: 'PayPal reconciliation failed: Missing or invalid capture currency code' };
            }
            // 5. Cross-validate with database payment (safe decimal comparison)
            if (Math.abs(payment.amount - captureAmount) > 0.01) {
              return { status: 'FAILED', error: `PayPal reconciliation failed: Amount mismatch (database payment: $${payment.amount}, PayPal capture: $${captureAmount.toFixed(2)})` };
            }
            if (payment.currency !== captureCurrency) {
              return { status: 'FAILED', error: `PayPal reconciliation failed: Currency mismatch (database payment: ${payment.currency}, PayPal capture: ${captureCurrency})` };
            }
            // 6. Verify PayPal order ID matches
            if (liveOrder.id !== paypalOrderId) {
              return { status: 'FAILED', error: `PayPal reconciliation failed: Order ID mismatch (requested: ${paypalOrderId}, response: ${liveOrder.id})` };
            }
            // --- End validation ---

            // Perform full idempotent settlement via dedicated reconciliation path
            // Does NOT verify lease ownership - reconciliation is a separate trusted operation
            await this.settleReconciliationTransaction({
              attemptId: existingAttemptId,
              paymentId: payment.id,
              planId: payment.purchase_plan_id,
              captureId: completedCapture.id,
              captureAmount,
              captureCurrency,
              expectedAmount: payment.amount,
              expectedCurrency: payment.currency,
              actor: 'PayPal Reconciliation Engine',
              payerEmail: payment.payer_email || liveOrder.payer?.email_address || 'buyer@stockwise.test',
              rawPaypalResponse: liveOrder
              // No instanceId - reconciliation engine is a separate trusted actor
            });

            return { status: 'COMPLETED', captureId: completedCapture.id };
          }
          return { status: 'FAILED', error: 'PayPal reconciliation failed: Order COMPLETED but no valid capture found' };
        }

        // If order is APPROVED but not captured, safe to proceed with new attempt
        if (liveOrder.status === 'APPROVED') {
          return { status: 'APPROVED', captureId: undefined }; // Safe to acquire new lease and retry capture
        }

        // Any other state - fail closed
        return { status: 'FAILED', error: `PayPal reconciliation failed: Order in unexpected state '${liveOrder.status}', cannot safely proceed` };
      } catch (err) {
        this.handlePgError('reconcileCaptureAttempt', err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { status: 'FAILED', error: `PayPal reconciliation error: ${errorMessage}` };
      }
    }

    // Local fallback - cannot do real PayPal API call, fail closed for safety
    const existing = this.state.captureAttempts?.find(c => c.id === existingAttemptId);
    if (existing && existing.status === 'COMPLETED' && existing.paypalCaptureId) {
      return { status: 'COMPLETED', captureId: existing.paypalCaptureId };
    }
    return { status: 'FAILED', error: 'PayPal reconciliation requires database connection in production' };
  }

  /**
   * Verify lease ownership before completing a capture attempt.
   * Prevents race conditions where another instance might have taken over the lease.
   */
  async verifyLeaseOwnership(attemptId: string, instanceId: string): Promise<boolean> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(
          `SELECT lease_owner FROM capture_attempts WHERE id = $1 AND status = 'CAPTURING';`,
          [attemptId]
        );
        if (res.rows.length === 0) return false;
        return res.rows[0].lease_owner === instanceId;
      } catch (err) {
        this.handlePgError('verifyLeaseOwnership', err);
        throw err;
      }
    }
    const existing = this.state.captureAttempts?.find(c => c.id === attemptId);
    return existing?.leaseOwner === instanceId && existing?.status === 'CAPTURING';
  }

  /**
   * Complete a capture attempt with lease ownership verification inside a database transaction.
   * This ensures atomic verification and settlement - preventing another instance from
   * taking over while the original instance is still performing a valid capture.
   */
  async completeCaptureAttempt(attemptId: string, paypalCaptureId: string, error?: string, instanceId?: string): Promise<void> {
    if (this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN;');

        // Verify lease ownership inside the transaction if instanceId provided
        if (instanceId) {
          const res = await client.query(
            `SELECT lease_owner FROM capture_attempts WHERE id = $1 AND status = 'CAPTURING' FOR UPDATE;`,
            [attemptId]
          );
          if (res.rows.length === 0) {
            await client.query('ROLLBACK;');
            throw new Error(`Capture attempt ${attemptId} not found or not in CAPTURING state.`);
          }
          if (res.rows[0].lease_owner !== instanceId) {
            await client.query('ROLLBACK;');
            throw new Error(`Lease ownership verification failed for attempt ${attemptId}. Another instance may have taken over.`);
          }
        }

        if (error) {
          await client.query(
            `UPDATE capture_attempts SET status = 'FAILED', error_message = $1, completed_at = CURRENT_TIMESTAMP, lease_expires_at = NULL, lease_owner = NULL WHERE id = $2;`,
            [error, attemptId]
          );
        } else {
          await client.query(
            `UPDATE capture_attempts SET status = 'COMPLETED', paypal_capture_id = $1, completed_at = CURRENT_TIMESTAMP, lease_expires_at = NULL, lease_owner = NULL WHERE id = $2;`,
            [paypalCaptureId, attemptId]
          );
        }

        await client.query('COMMIT;');
        return;
      } catch (err) {
        await client.query('ROLLBACK;');
        this.handlePgError('completeCaptureAttempt', err);
        throw err;
      } finally {
        client.release();
      }
    }

    // Local fallback - atomic in single-threaded context
    const idx = this.state.captureAttempts?.findIndex(c => c.id === attemptId);
    if (idx !== undefined && idx >= 0) {
      if (instanceId && this.state.captureAttempts[idx].leaseOwner !== instanceId) {
        throw new Error(`Lease ownership verification failed for attempt ${attemptId}. Another instance may have taken over.`);
      }
      if (this.state.captureAttempts[idx].status !== 'CAPTURING') {
        throw new Error(`Capture attempt ${attemptId} not found or not in CAPTURING state.`);
      }
      if (error) {
        this.state.captureAttempts[idx].status = 'FAILED';
        this.state.captureAttempts[idx].errorMessage = error;
      } else {
        this.state.captureAttempts[idx].status = 'COMPLETED';
        this.state.captureAttempts[idx].paypalCaptureId = paypalCaptureId;
      }
      this.state.captureAttempts[idx].completedAt = new Date().toISOString();
      this.state.captureAttempts[idx].leaseExpiresAt = null;
      this.state.captureAttempts[idx].leaseOwner = null;
      this.save();
    } else {
      throw new Error(`Capture attempt ${attemptId} not found.`);
    }
  }

  async getCaptureAttemptByOrderId(paypalOrderId: string): Promise<any> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query(
          `SELECT * FROM capture_attempts WHERE paypal_order_id = $1;`,
          [paypalOrderId]
        );
        return res.rows[0] || null;
      } catch (err) {
        this.handlePgError('getCaptureAttemptByOrderId', err);
        throw err;
      }
    }
    return this.state.captureAttempts?.find(c => c.paypalOrderId === paypalOrderId) || null;
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
        return res.rows;
      } catch (err) {
        this.handlePgError('getProducts', err);
        throw err;
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
        return res.rows[0] || null;
      } catch (err) {
        this.handlePgError('getProduct', err);
        throw err;
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
        return updated;
      } catch (err) {
        this.handlePgError('saveProduct', err);
        throw err;
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
        return (res.rowCount ?? 0) > 0;
      } catch (err) {
        this.handlePgError('deleteProduct', err);
        throw err;
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
        return res.rows;
      } catch (err) {
        this.handlePgError('getSuppliers', err);
        throw err;
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
        return res.rows[0] || null;
      } catch (err) {
        this.handlePgError('getSupplier', err);
        throw err;
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
        return res.rows;
      } catch (err) {
        this.handlePgError('getSupplierOffers', err);
        throw err;
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
        return res.rows;
      } catch (err) {
        this.handlePgError('getOffersForSku', err);
        throw err;
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
        return offer;
      } catch (err) {
        this.handlePgError('saveSupplierOffer', err);
        throw err;
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
            created_by_user_id AS "createdByUserId",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM purchase_plans
          ORDER BY created_at DESC;
        `);
        return res.rows;
      } catch (err) {
        this.handlePgError('getPurchasePlans', err);
        throw err;
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
            created_by_user_id AS "createdByUserId",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM purchase_plans
          WHERE id = $1;
        `, [id]);
        return res.rows[0] || null;
      } catch (err) {
        this.handlePgError('getPurchasePlan', err);
        throw err;
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
          INSERT INTO purchase_plans (id, name, purchasing_budget, calculated_total, current_version, plan_status, selected_items, deferred_items, scenario_mode, created_by_user_id, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            purchasing_budget = EXCLUDED.purchasing_budget,
            calculated_total = EXCLUDED.calculated_total,
            current_version = EXCLUDED.current_version,
            plan_status = EXCLUDED.plan_status,
            selected_items = EXCLUDED.selected_items,
            deferred_items = EXCLUDED.deferred_items,
            scenario_mode = EXCLUDED.scenario_mode,
            created_by_user_id = EXCLUDED.created_by_user_id,
            updated_at = EXCLUDED.updated_at;
        `, [
          updated.id, updated.name, updated.purchasingBudget, updated.calculatedTotal,
          updated.currentVersion, updated.planStatus,
          JSON.stringify(updated.selectedItems || []),
          JSON.stringify(updated.deferredItems || []),
          updated.scenarioMode, updated.createdByUserId || null, updated.updatedAt
        ]);
        return updated;
      } catch (err) {
        this.handlePgError('savePurchasePlan', err);
        throw err;
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

  async deletePurchasePlan(id: string): Promise<boolean> {
    if (this.pgPool) {
      try {
        const res = await this.pgPool.query('DELETE FROM purchase_plans WHERE id = $1', [id]);
        return (res.rowCount ?? 0) > 0;
      } catch (err) {
        this.handlePgError('deletePurchasePlan', err);
        throw err;
      }
    }
    const prev = this.state.purchasePlans.length;
    this.state.purchasePlans = this.state.purchasePlans.filter(p => p.id !== id);
    if (this.state.purchasePlans.length !== prev) {
      this.save();
      return true;
    }
    return false;
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
        return version;
      } catch (err) {
        this.handlePgError('savePlanVersion', err);
        throw err;
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
        return res.rows;
      } catch (err) {
        this.handlePgError('getPlanVersions', err);
        throw err;
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
        return approval;
      } catch (err) {
        this.handlePgError('saveApproval', err);
        throw err;
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
        return res.rows[0] || null;
      } catch (err) {
        this.handlePgError('getApproval', err);
        throw err;
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
        return updated;
      } catch (err) {
        this.handlePgError('savePayment', err);
        throw err;
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
        return res.rows[0] || null;
      } catch (err) {
        this.handlePgError('getPayment', err);
        throw err;
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
        return res.rows[0] || null;
      } catch (err) {
        this.handlePgError('getPaymentByPaypalOrderId', err);
        throw err;
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
        return res.rows;
      } catch (err) {
        this.handlePgError('getPayments', err);
        throw err;
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

  /**
   * Shared Idempotent Settlement Transaction
   * Used by normal capture, reconciliation, and webhook processing.
   * Locks capture_attempt row with FOR UPDATE, verifies ownership, and performs
   * all financial settlement atomically.
   * Fail closed: rolls back all changes if any validation fails.
   */
  public async settleCaptureTransaction(params: {
    attemptId: string;
    paymentId: string;
    planId: string;
    captureId: string;
    amount: number;
    currency: string;
    actor: string;
    payerEmail: string;
    rawPaypalResponse: any;
    instanceId: string; // For lease ownership verification
  }): Promise<{ payment: PaymentRecord; budget: BudgetConfigRecord }> {
    const { attemptId, paymentId, planId, captureId, amount, currency, actor, payerEmail, rawPaypalResponse, instanceId } = params;

    if (this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN;');

        // 1. Lock and verify payment record FIRST (for idempotency)
        const payRes = await client.query(
          `SELECT id, verified_status AS "verifiedStatus", amount::float, currency, paypal_order_id FROM payments WHERE id = $1 FOR UPDATE;`,
          [paymentId]
        );
        if (payRes.rows.length === 0) {
          throw new Error(`Payment record ${paymentId} not found in database.`);
        }
        const payment = payRes.rows[0];
        if (payment.verifiedStatus === 'COMPLETED') {
          // Idempotent: payment already settled, verify attempt state and return success
          const attemptCheck = await client.query(
            `SELECT status FROM capture_attempts WHERE id = $1;`,
            [attemptId]
          );
          if (attemptCheck.rows.length > 0) {
            const attemptStatus = attemptCheck.rows[0].status;
            if (attemptStatus === 'CAPTURING') {
              // Mark attempt as COMPLETED to keep in sync
              await client.query(
                `UPDATE capture_attempts SET status = 'COMPLETED', paypal_capture_id = $1, completed_at = CURRENT_TIMESTAMP, lease_expires_at = NULL, lease_owner = NULL WHERE id = $2;`,
                [captureId, attemptId]
              );
            } else if (attemptStatus !== 'COMPLETED') {
              // Attempt is in unexpected state (FAILED, SUPERSEDED) but payment is COMPLETED
              // This is an inconsistent state, but we don't fail - payment is the source of truth
            }
          }
          await client.query('COMMIT;');
          return { payment: { ...payment, paypalCaptureId: captureId, verifiedStatus: 'COMPLETED' } as PaymentRecord, budget: await this.getBudget() };
        }

        // 2. Lock and verify capture attempt - FOR UPDATE to prevent concurrent settlement
        const attemptRes = await client.query(
          `SELECT id, status, lease_owner FROM capture_attempts WHERE id = $1 FOR UPDATE;`,
          [attemptId]
        );
        if (attemptRes.rows.length === 0) {
          throw new Error(`Capture attempt ${attemptId} not found.`);
        }
        const attempt = attemptRes.rows[0];
        if (attempt.status !== 'CAPTURING') {
          throw new Error(`Capture attempt ${attemptId} is not in CAPTURING state (current: ${attempt.status}).`);
        }
        if (attempt.lease_owner !== instanceId) {
          throw new Error(`Lease ownership verification failed for attempt ${attemptId}. Another instance may have taken over.`);
        }

        // 3. Validate amount and currency match
        if (Math.abs(payment.amount - amount) > 0.01) {
          throw new Error(`Settlement failed: Amount mismatch (payment: $${payment.amount}, capture: $${amount}).`);
        }
        if (payment.currency !== currency) {
          throw new Error(`Settlement failed: Currency mismatch (payment: ${payment.currency}, capture: ${currency}).`);
        }

        // 4. Lock and verify budget record to prevent double-spending
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

        // 5. Update budget
        await client.query(
          `UPDATE budget_config SET spent_amount = $1, allocated_amount = $2, updated_at = $3 WHERE id = $4;`,
          [newSpent, newAllocated, new Date().toISOString(), budgetId]
        );

        // 6. Verify plan exists and update plan status to 'paid'
        const planRes = await client.query(
          `SELECT id FROM purchase_plans WHERE id = $1 FOR UPDATE;`,
          [planId]
        );
        if (planRes.rows.length === 0) {
          throw new Error(`Purchase plan ${planId} not found in database.`);
        }
        await client.query(
          `UPDATE purchase_plans SET plan_status = 'paid', updated_at = $1 WHERE id = $2;`,
          [new Date().toISOString(), planId]
        );

        // 7. Update payment record to COMPLETED
        const updatedPayment: PaymentRecord = {
          ...payment,
          paypalCaptureId: captureId,
          verifiedStatus: 'COMPLETED',
          payerEmail,
          rawPaypalResponse,
          updatedAt: new Date().toISOString()
        };
        await client.query(
          `UPDATE payments SET paypal_capture_id = $1, verified_status = 'COMPLETED', payer_email = $2, raw_paypal_response = $3, updated_at = $4 WHERE id = $5;`,
          [captureId, payerEmail, JSON.stringify(rawPaypalResponse || {}), updatedPayment.updatedAt, paymentId]
        );

        // 8. Insert immutable audit log
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
            JSON.stringify({ orderId: payment.paypal_order_id, captureId, amount }),
            new Date().toISOString()
          ]
        );

        // 9. Mark capture attempt as COMPLETED (lease ownership already verified)
        await client.query(
          `UPDATE capture_attempts SET status = 'COMPLETED', paypal_capture_id = $1, completed_at = CURRENT_TIMESTAMP, lease_expires_at = NULL, lease_owner = NULL WHERE id = $2;`,
          [captureId, attemptId]
        );

        await client.query('COMMIT;');

        // Sync local memory state
        const idx = this.state.payments.findIndex(p => p.id === paymentId);
        if (idx >= 0) this.state.payments[idx] = updatedPayment;
        const planIdx = this.state.purchasePlans.findIndex(p => p.id === planId);
        if (planIdx >= 0) this.state.purchasePlans[planIdx].planStatus = 'paid';
        this.state.budget.spentAmount = newSpent;
        this.state.budget.allocatedAmount = newAllocated;
        this.save();

        return { payment: updatedPayment, budget: { ...currentBudget, spentAmount: newSpent, allocatedAmount: newAllocated } };
      } catch (err: any) {
        await client.query('ROLLBACK;');
        this.handlePgError('settleCaptureTransaction', err);
        throw err;
      } finally {
        client.release();
      }
    }

    // Local in-memory transaction with strict balance enforcement
    const payIdx = this.state.payments.findIndex(p => p.id === paymentId);
    if (payIdx < 0) throw new Error(`Payment record ${paymentId} not found.`);
    const payment = this.state.payments[payIdx];
    if (payment.verifiedStatus === 'COMPLETED') {
      // Idempotent
      return { payment, budget: this.state.budget };
    }

    if (Math.abs(payment.amount - amount) > 0.01) {
      throw new Error(`Settlement failed: Amount mismatch (payment: $${payment.amount}, capture: $${amount}).`);
    }
    if (payment.currency !== currency) {
      throw new Error(`Settlement failed: Currency mismatch (payment: ${payment.currency}, capture: ${currency}).`);
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
      payerEmail,
      rawPaypalResponse,
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

    // Update local capture attempt
    const attemptIdx = this.state.captureAttempts?.findIndex(c => c.id === attemptId);
    if (attemptIdx !== undefined && attemptIdx >= 0) {
      this.state.captureAttempts[attemptIdx].status = 'COMPLETED';
      this.state.captureAttempts[attemptIdx].paypalCaptureId = captureId;
      this.state.captureAttempts[attemptIdx].completedAt = new Date().toISOString();
      this.state.captureAttempts[attemptIdx].leaseExpiresAt = null;
      this.state.captureAttempts[attemptIdx].leaseOwner = null;
    }

    this.save();
    return { payment: updatedPayment, budget: this.state.budget };
  }

  /**
   * Dedicated Reconciliation Settlement Transaction
     * Used ONLY by reconciliation engine to settle already-captured PayPal orders.
     * Does NOT verify lease ownership against original instance - the reconciliation
     * engine is a separate trusted actor that has already verified the live PayPal state.
     * Still enforces all financial validations: payment status, budget ceiling, plan existence,
     * amount/currency match against ACTUAL PayPal capture response.
     * Fail closed: rolls back all changes if any validation fails.
     */
    public async settleReconciliationTransaction(params: {
      attemptId: string;
      paymentId: string;
      planId: string;
      captureId: string;
      // Actual capture amount and currency from PayPal response (NOT from database payment)
      captureAmount: number;
      captureCurrency: string;
      // Database payment for cross-validation
      expectedAmount: number;
      expectedCurrency: string;
      actor: string;
      payerEmail: string;
      rawPaypalResponse: any;
      // Reconciliation engine does not impersonate original lease owner
      // Lease ownership is NOT verified - reconciliation is a separate trusted operation
    }): Promise<{ payment: PaymentRecord; budget: BudgetConfigRecord }> {
      const { attemptId, paymentId, planId, captureId, captureAmount, captureCurrency, expectedAmount, expectedCurrency, actor, payerEmail, rawPaypalResponse } = params;

      // Validate captureId early - it's required for audit log in both paths
      if (!captureId || typeof captureId !== 'string' || captureId.trim() === '') {
        throw new Error(`Reconciliation settlement failed: Capture ID is required (received: ${JSON.stringify(captureId)})`);
      }

      if (this.pgPool) {
        const client = await this.pgPool.connect();
        try {
          await client.query('BEGIN;');

          // 1. Lock and verify payment record FIRST (for idempotency)
          const payRes = await client.query(
            `SELECT id, verified_status AS "verifiedStatus", amount::float, currency, paypal_order_id, paypal_capture_id, purchase_plan_id FROM payments WHERE id = $1 FOR UPDATE;`,
            [paymentId]
          );
          if (payRes.rows.length === 0) {
            throw new Error(`Payment record ${paymentId} not found in database.`);
          }
          const payment = payRes.rows[0];
          if (payment.verifiedStatus === 'COMPLETED') {
            // Idempotent: payment already settled - verify ALL identities match before returning success
            const attemptCheck = await client.query(
              `SELECT id, status, payment_id, paypal_order_id, paypal_capture_id FROM capture_attempts WHERE id = $1 FOR UPDATE;`,
              [attemptId]
            );
            if (attemptCheck.rows.length === 0) {
              throw new Error(`Capture attempt ${attemptId} not found during idempotent reconciliation.`);
            }
            const attempt = attemptCheck.rows[0];

            // Verify attempt belongs to this payment
            if (attempt.payment_id !== paymentId) {
              throw new Error(`Reconciliation conflict: attempt ${attemptId} belongs to payment ${attempt.payment_id}, not ${paymentId}.`);
            }

            // Verify attempt's PayPal order ID matches payment's PayPal order ID
            if (attempt.paypal_order_id !== payment.paypal_order_id) {
              throw new Error(`Reconciliation conflict: attempt ${attemptId} order ID ${attempt.paypal_order_id} does not match payment order ID ${payment.paypal_order_id}.`);
            }

            // Verify plan ID matches payment's plan (critical for resource-level authorization)
            if (payment.purchase_plan_id !== planId) {
              throw new Error(`Reconciliation conflict: payment belongs to plan ${payment.purchase_plan_id}, not ${planId}.`);
            }

            // Verify incoming capture ID matches payment's already-stored capture ID
            // Reject if payment has no stored capture ID (cannot establish identity)
            if (!payment.paypal_capture_id) {
              throw new Error(`Reconciliation conflict: payment ${paymentId} has no stored capture ID, cannot verify idempotent reconciliation.`);
            }
            if (payment.paypal_capture_id !== captureId) {
              throw new Error(`Reconciliation conflict: payment already has capture ID ${payment.paypal_capture_id}, cannot overwrite with ${captureId}.`);
            }

            // Verify attempt's stored capture ID matches (attempt must have a capture ID for idempotent reconciliation)
            if (!attempt.paypal_capture_id) {
              throw new Error(`Reconciliation conflict: attempt ${attemptId} has no stored capture ID, cannot verify idempotent reconciliation.`);
            }
            if (attempt.paypal_capture_id !== captureId) {
              throw new Error(`Reconciliation conflict: attempt already has capture ID ${attempt.paypal_capture_id}, cannot overwrite with ${captureId}.`);
            }

            // Validate capture amount and currency against authoritative payment record
            if (captureAmount === undefined || captureAmount === null || isNaN(captureAmount) || !isFinite(captureAmount)) {
              throw new Error(`Reconciliation settlement failed: Invalid capture amount (${captureAmount}).`);
            }
            if (captureCurrency === undefined || captureCurrency === null || typeof captureCurrency !== 'string' || captureCurrency.trim() === '') {
              throw new Error(`Reconciliation settlement failed: Invalid capture currency (${captureCurrency}).`);
            }
            if (Math.abs(payment.amount - captureAmount) > 0.01) {
              throw new Error(`Reconciliation settlement failed: Capture amount mismatch (database payment: $${payment.amount}, PayPal capture: $${captureAmount}).`);
            }
            if (payment.currency !== captureCurrency) {
              throw new Error(`Reconciliation settlement failed: Capture currency mismatch (database payment: ${payment.currency}, PayPal capture: ${captureCurrency}).`);
            }

            // Only mark attempt as COMPLETED if it was in a reconcilable state
            if (attempt.status === 'CAPTURING' || attempt.status === 'SUPERSEDED') {
              await client.query(
                `UPDATE capture_attempts SET status = 'COMPLETED', paypal_capture_id = $1, completed_at = CURRENT_TIMESTAMP, lease_expires_at = NULL, lease_owner = NULL WHERE id = $2;`,
                [captureId, attemptId]
              );
            } else if (attempt.status !== 'COMPLETED') {
              // Attempt is in unexpected state (FAILED) but payment is COMPLETED
              // This is an inconsistent state - fail closed
              throw new Error(`Reconciliation conflict: attempt ${attemptId} is in non-reconcilable state ${attempt.status} while payment is COMPLETED.`);
            }

            await client.query('COMMIT;');
            return { payment: { ...payment, paypalCaptureId: captureId, verifiedStatus: 'COMPLETED' } as PaymentRecord, budget: await this.getBudget() };
          }

          // 2. Lock and verify capture attempt - FOR UPDATE to prevent concurrent settlement
          // We verify the attempt belongs to this payment and PayPal order
          const attemptRes = await client.query(
            `SELECT id, status, payment_id, paypal_order_id, paypal_capture_id FROM capture_attempts WHERE id = $1 FOR UPDATE;`,
            [attemptId]
          );
          if (attemptRes.rows.length === 0) {
            throw new Error(`Capture attempt ${attemptId} not found.`);
          }
          const attempt = attemptRes.rows[0];
          if (attempt.payment_id !== paymentId) {
            throw new Error(`Reconciliation conflict: attempt ${attemptId} belongs to payment ${attempt.payment_id}, not ${paymentId}.`);
          }
          if (attempt.status !== 'CAPTURING' && attempt.status !== 'SUPERSEDED') {
            throw new Error(`Capture attempt ${attemptId} is not in a reconcilable state (current: ${attempt.status}).`);
          }

          // 2b. Verify attempt's PayPal order ID matches payment's PayPal order ID
          if (attempt.paypal_order_id !== payment.paypal_order_id) {
            throw new Error(`Reconciliation conflict: attempt order ID ${attempt.paypal_order_id} does not match payment order ID ${payment.paypal_order_id}.`);
          }

          // 2c. Verify attempt's stored capture ID is consistent (if present) - non-idempotent path
          if (attempt.paypal_capture_id && attempt.paypal_capture_id !== captureId) {
            throw new Error(`Reconciliation conflict: attempt already has capture ID ${attempt.paypal_capture_id}, cannot overwrite with ${captureId}.`);
          }

          // 3. Validate ACTUAL PayPal capture amount and currency against database payment
          // This is the critical fix: we validate the capture response, not pass DB amount as capture amount
          // First validate that captureAmount is a valid finite number
          if (captureAmount === undefined || captureAmount === null || isNaN(captureAmount) || !isFinite(captureAmount)) {
            throw new Error(`Reconciliation settlement failed: Invalid capture amount (${captureAmount}).`);
          }
          // Validate that captureCurrency is a valid non-empty string
          if (captureCurrency === undefined || captureCurrency === null || typeof captureCurrency !== 'string' || captureCurrency.trim() === '') {
            throw new Error(`Reconciliation settlement failed: Invalid capture currency (${captureCurrency}).`);
          }
          if (Math.abs(expectedAmount - captureAmount) > 0.01) {
            throw new Error(`Reconciliation settlement failed: Capture amount mismatch (database payment: $${expectedAmount}, PayPal capture: $${captureAmount}).`);
          }
          if (expectedCurrency !== captureCurrency) {
            throw new Error(`Reconciliation settlement failed: Capture currency mismatch (database payment: ${expectedCurrency}, PayPal capture: ${captureCurrency}).`);
          }

          // 3b. Verify plan ID matches payment's plan
          if (payment.purchase_plan_id !== planId) {
            throw new Error(`Reconciliation conflict: payment belongs to plan ${payment.purchase_plan_id}, not ${planId}.`);
          }

          // 4. Lock and verify budget record to prevent double-spending
          const budgetRes = await client.query(
            `SELECT id, monthly_budget::float AS "monthlyBudget", spent_amount::float AS "spentAmount", allocated_amount::float AS "allocatedAmount" FROM budget_config LIMIT 1 FOR UPDATE;`
          );
          const currentBudget = budgetRes.rows[0] || { id: 'default', monthlyBudget: 5000, spentAmount: 0, allocatedAmount: 0 };
          const budgetId = currentBudget.id || 'default';
          const newSpent = Number((currentBudget.spentAmount + captureAmount).toFixed(2));
          if (newSpent > currentBudget.monthlyBudget + 0.01) {
            throw new Error(`Transaction rejected: Budget ceiling exceeded ($${newSpent.toFixed(2)} / $${currentBudget.monthlyBudget.toFixed(2)}).`);
          }
          const newAllocated = Math.max(0, Number((currentBudget.allocatedAmount - captureAmount).toFixed(2)));

          // 5. Update budget
          await client.query(
            `UPDATE budget_config SET spent_amount = $1, allocated_amount = $2, updated_at = $3 WHERE id = $4;`,
            [newSpent, newAllocated, new Date().toISOString(), budgetId]
          );

          // 6. Verify plan exists and update plan status to 'paid'
          const planRes = await client.query(
            `SELECT id FROM purchase_plans WHERE id = $1 FOR UPDATE;`,
            [planId]
          );
          if (planRes.rows.length === 0) {
            throw new Error(`Purchase plan ${planId} not found in database.`);
          }
          await client.query(
            `UPDATE purchase_plans SET plan_status = 'paid', updated_at = $1 WHERE id = $2;`,
            [new Date().toISOString(), planId]
          );

          // 7. Update payment record to COMPLETED
          const updatedPayment: PaymentRecord = {
            ...payment,
            paypalCaptureId: captureId,
            verifiedStatus: 'COMPLETED',
            payerEmail,
            rawPaypalResponse,
            updatedAt: new Date().toISOString()
          };
          await client.query(
            `UPDATE payments SET paypal_capture_id = $1, verified_status = 'COMPLETED', payer_email = $2, raw_paypal_response = $3, updated_at = $4 WHERE id = $5;`,
            [captureId, payerEmail, JSON.stringify(rawPaypalResponse || {}), updatedPayment.updatedAt, paymentId]
          );

          // 8. Insert immutable audit log
          await client.query(
            `INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, previous_status, new_status, details, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
            [
              `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              actor,
              'CAPTURE_PAYPAL_ORDER_RECONCILIATION',
              'PAYMENT',
              captureId,
              'CREATED',
              'COMPLETED',
              JSON.stringify({ orderId: payment.paypal_order_id, captureId, amount: captureAmount, reconciliation: true }),
              new Date().toISOString()
            ]
          );

          // 9. Mark capture attempt as COMPLETED (no lease ownership verification for reconciliation)
          await client.query(
            `UPDATE capture_attempts SET status = 'COMPLETED', paypal_capture_id = $1, completed_at = CURRENT_TIMESTAMP, lease_expires_at = NULL, lease_owner = NULL WHERE id = $2;`,
            [captureId, attemptId]
          );

          await client.query('COMMIT;');

          // Sync local memory state
          const idx = this.state.payments.findIndex(p => p.id === paymentId);
          if (idx >= 0) this.state.payments[idx] = updatedPayment;
          const planIdx = this.state.purchasePlans.findIndex(p => p.id === planId);
          if (planIdx >= 0) this.state.purchasePlans[planIdx].planStatus = 'paid';
          this.state.budget.spentAmount = newSpent;
          this.state.budget.allocatedAmount = newAllocated;
          this.save();

          return { payment: updatedPayment, budget: { ...currentBudget, spentAmount: newSpent, allocatedAmount: newAllocated } };
        } catch (err: any) {
          await client.query('ROLLBACK;');
          this.handlePgError('settleReconciliationTransaction', err);
          throw err;
        } finally {
          client.release();
        }
      }

      // Local in-memory transaction with strict balance enforcement
      const payIdx = this.state.payments.findIndex(p => p.id === paymentId);
      if (payIdx < 0) throw new Error(`Payment record ${paymentId} not found.`);
      const payment = this.state.payments[payIdx];
      if (payment.verifiedStatus === 'COMPLETED') {
        // Idempotent: payment already settled - verify ALL identities match before returning success
        const attemptIdx = this.state.captureAttempts?.findIndex(c => c.id === attemptId);
        if (attemptIdx === undefined || attemptIdx < 0) {
          throw new Error(`Capture attempt ${attemptId} not found during idempotent reconciliation.`);
        }
        const attempt = this.state.captureAttempts[attemptIdx];

        // Verify attempt belongs to this payment
        if (attempt.paymentId !== paymentId) {
          throw new Error(`Reconciliation conflict: attempt ${attemptId} belongs to payment ${attempt.paymentId}, not ${paymentId}.`);
        }

        // Verify attempt's PayPal order ID matches payment's PayPal order ID
        if (attempt.paypalOrderId !== payment.paypalOrderId) {
          throw new Error(`Reconciliation conflict: attempt ${attemptId} order ID ${attempt.paypalOrderId} does not match payment order ID ${payment.paypalOrderId}.`);
        }

        // Verify plan ID matches payment's plan (critical for resource-level authorization)
        if (payment.purchasePlanId !== planId) {
          throw new Error(`Reconciliation conflict: payment belongs to plan ${payment.purchasePlanId}, not ${planId}.`);
        }

        // Verify incoming capture ID matches payment's already-stored capture ID
        // Reject if payment has no stored capture ID (cannot establish identity)
        if (!payment.paypalCaptureId) {
          throw new Error(`Reconciliation conflict: payment ${paymentId} has no stored capture ID, cannot verify idempotent reconciliation.`);
        }
        if (payment.paypalCaptureId !== captureId) {
          throw new Error(`Reconciliation conflict: payment already has capture ID ${payment.paypalCaptureId}, cannot overwrite with ${captureId}.`);
        }

        // Verify attempt's stored capture ID matches (attempt must have a capture ID for idempotent reconciliation)
        if (!attempt.paypalCaptureId) {
          throw new Error(`Reconciliation conflict: attempt ${attemptId} has no stored capture ID, cannot verify idempotent reconciliation.`);
        }
        if (attempt.paypalCaptureId !== captureId) {
          throw new Error(`Reconciliation conflict: attempt already has capture ID ${attempt.paypalCaptureId}, cannot overwrite with ${captureId}.`);
        }

        // Validate capture amount and currency against authoritative payment record
        if (captureAmount === undefined || captureAmount === null || isNaN(captureAmount) || !isFinite(captureAmount)) {
          throw new Error(`Reconciliation settlement failed: Invalid capture amount (${captureAmount}).`);
        }
        if (captureCurrency === undefined || captureCurrency === null || typeof captureCurrency !== 'string' || captureCurrency.trim() === '') {
          throw new Error(`Reconciliation settlement failed: Invalid capture currency (${captureCurrency}).`);
        }
        if (Math.abs(payment.amount - captureAmount) > 0.01) {
          throw new Error(`Reconciliation settlement failed: Capture amount mismatch (database payment: $${payment.amount}, PayPal capture: $${captureAmount}).`);
        }
        if (payment.currency !== captureCurrency) {
          throw new Error(`Reconciliation settlement failed: Capture currency mismatch (database payment: ${payment.currency}, PayPal capture: ${captureCurrency}).`);
        }

        // Only mark attempt as COMPLETED if it was in a reconcilable state
        if (attempt.status === 'CAPTURING' || attempt.status === 'SUPERSEDED') {
          attempt.status = 'COMPLETED';
          attempt.paypalCaptureId = captureId;
          attempt.completedAt = new Date().toISOString();
          attempt.leaseExpiresAt = null;
          attempt.leaseOwner = null;
        } else if (attempt.status !== 'COMPLETED') {
          throw new Error(`Reconciliation conflict: attempt ${attemptId} is in non-reconcilable state ${attempt.status} while payment is COMPLETED.`);
        }

        return { payment, budget: this.state.budget };
      }

      // Validate ACTUAL capture amount and currency
      if (captureAmount === undefined || captureAmount === null || isNaN(captureAmount) || !isFinite(captureAmount)) {
        throw new Error(`Reconciliation settlement failed: Invalid capture amount (${captureAmount}).`);
      }
      if (captureCurrency === undefined || captureCurrency === null || typeof captureCurrency !== 'string' || captureCurrency.trim() === '') {
        throw new Error(`Reconciliation settlement failed: Invalid capture currency (${captureCurrency}).`);
      }
      if (Math.abs(expectedAmount - captureAmount) > 0.01) {
        throw new Error(`Reconciliation settlement failed: Capture amount mismatch (database payment: $${expectedAmount}, PayPal capture: $${captureAmount}).`);
      }
      if (expectedCurrency !== captureCurrency) {
        throw new Error(`Reconciliation settlement failed: Capture currency mismatch (database payment: ${expectedCurrency}, PayPal capture: ${captureCurrency}).`);
      }

      // 3b. Verify plan ID matches payment's plan
      if (payment.purchasePlanId !== planId) {
        throw new Error(`Reconciliation conflict: payment belongs to plan ${payment.purchasePlanId}, not ${planId}.`);
      }

      // 3c. A reconciliation settlement must always have a corresponding capture attempt.
      // Keep this equivalent to the PostgreSQL FOR UPDATE path and fail closed when
      // the attempt cannot establish payment/order/state identity.
      const attemptIdx2 = this.state.captureAttempts?.findIndex(c => c.id === attemptId);
      if (attemptIdx2 === undefined || attemptIdx2 < 0) {
        throw new Error(`Capture attempt ${attemptId} not found.`);
      }
      const attempt = this.state.captureAttempts[attemptIdx2];
      if (attempt.paymentId !== paymentId) {
        throw new Error(`Reconciliation conflict: attempt ${attemptId} belongs to payment ${attempt.paymentId}, not ${paymentId}.`);
      }
      if (attempt.paypalOrderId !== payment.paypalOrderId) {
        throw new Error(`Reconciliation conflict: attempt order ID ${attempt.paypalOrderId} does not match payment order ID ${payment.paypalOrderId}.`);
      }
      if (attempt.status !== 'CAPTURING' && attempt.status !== 'SUPERSEDED') {
        throw new Error(`Capture attempt ${attemptId} is not in a reconcilable state (current: ${attempt.status}).`);
      }
      if (attempt.paypalCaptureId && attempt.paypalCaptureId !== captureId) {
        throw new Error(`Reconciliation conflict: attempt already has capture ID ${attempt.paypalCaptureId}, cannot overwrite with ${captureId}.`);
      }

      const plan = this.state.purchasePlans.find(p => p.id === planId);
      if (!plan) {
        throw new Error(`Purchase plan ${planId} not found.`);
      }

      const currentBudget = this.state.budget;
      const newSpent = Number((currentBudget.spentAmount + captureAmount).toFixed(2));
      if (newSpent > currentBudget.monthlyBudget + 0.01) {
        throw new Error(`Transaction rejected: Budget ceiling exceeded ($${newSpent.toFixed(2)} / $${currentBudget.monthlyBudget.toFixed(2)}).`);
      }

      const updatedPayment: PaymentRecord = {
        ...payment,
        paypalCaptureId: captureId,
        verifiedStatus: 'COMPLETED',
        payerEmail,
        rawPaypalResponse,
        updatedAt: new Date().toISOString()
      };
      this.state.payments[payIdx] = updatedPayment;

      plan.planStatus = 'paid';

      this.state.budget.spentAmount = newSpent;
      this.state.budget.allocatedAmount = Math.max(0, Number((currentBudget.allocatedAmount - captureAmount).toFixed(2)));

      if (!captureId || typeof captureId !== 'string' || captureId.trim() === '') {
        throw new Error('Reconciliation settlement failed: Capture ID is required for audit log.');
      }

      this.state.auditLogs.unshift({
        id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        actor,
        action: 'CAPTURE_PAYPAL_ORDER_RECONCILIATION',
        entityType: 'PAYMENT',
        entityId: captureId,
        previousStatus: 'CREATED',
        newStatus: 'COMPLETED',
        details: { orderId: payment.paypalOrderId, captureId, amount: captureAmount, reconciliation: true },
        createdAt: new Date().toISOString()
      });

      // Update local capture attempt
      attempt.status = 'COMPLETED';
      attempt.paypalCaptureId = captureId;
      attempt.completedAt = new Date().toISOString();
      attempt.leaseExpiresAt = null;
      attempt.leaseOwner = null;

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
        return event;
      } catch (err) {
        this.handlePgError('savePaymentEvent', err);
        throw err;
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
        return fullLog;
      } catch (err) {
        this.handlePgError('saveAuditLog', err);
        throw err;
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
        return res.rows;
      } catch (err) {
        this.handlePgError('getAuditLogs', err);
        throw err;
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
        return res.rows[0] || INITIAL_BUDGET;
      } catch (err) {
        this.handlePgError('getBudget', err);
        throw err;
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
        const res = await this.pgPool.query(`
          UPDATE budget_config
          SET 
            monthly_budget = COALESCE($1, monthly_budget),
            spent_amount = COALESCE($2, spent_amount),
            allocated_amount = COALESCE($3, allocated_amount),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = 'default'
          RETURNING id, monthly_budget::float AS "monthlyBudget", spent_amount::float AS "spentAmount", allocated_amount::float AS "allocatedAmount", updated_at AS "updatedAt";
        `, [patch.monthlyBudget || null, patch.spentAmount || null, patch.allocatedAmount || null]);
        return res.rows[0] || this.state.budget;
      } catch (err) {
        this.handlePgError('updateBudget', err);
        throw err;
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
        return run;
      } catch (err) {
        this.handlePgError('saveAgentRun', err);
        throw err;
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
        return res.rows[0] || null;
      } catch (err) {
        this.handlePgError('getAgentRun', err);
        throw err;
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
      await this.pgPool.query(`
        UPDATE budget_config
        SET spent_amount = 1200.00, allocated_amount = 1850.00, monthly_budget = 5000.00
        WHERE id = 'default';
      `);
    }
  }
}

export const db = new DatabaseStore();

// Export a query helper for tests that works with both PostgreSQL and local store
export async function query(sql: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number | null }> {
  const store = db as any;
  if (store.pgPool) {
    const res = await store.pgPool.query(sql, params);
    return { rows: res.rows, rowCount: res.rowCount };
  }
  // Local store fallback - very limited, only for test setup
  throw new Error('Local store does not support arbitrary SQL queries. Use direct store manipulation for tests.');
}

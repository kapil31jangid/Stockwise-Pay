import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { signAuthToken, revokeAuthToken, requireAuth } from '../middleware/auth.js';

const router = Router();

export interface SystemUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string; // Plaintext demo password or sha256
  role: 'LEAD_APPROVER' | 'BUYER' | 'TREASURY' | 'STORE_MANAGER';
  displayRole: string;
  department: string;
  avatarInitials: string;
  badge: string;
  permissions: string[];
}

export const REGISTERED_USERS: SystemUser[] = [
  {
    id: 'USR-001',
    name: 'Marcus Vance',
    email: 'marcus.vance@stockwisepay.com',
    passwordHash: 'ApproverPass2026!',
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
    passwordHash: 'BuyerPass2026!',
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
    passwordHash: 'TreasuryPass2026!',
    role: 'TREASURY',
    displayRole: 'Chief Financial Officer',
    department: 'Finance & Treasury',
    avatarInitials: 'DC',
    badge: 'TREASURY',
    permissions: ['BUDGET_EDIT', 'AUDIT_VIEW', 'PAYMENT_AUDIT', 'PLAN_APPROVE', 'PAYMENT_EXECUTE']
  }
];

export const DEMO_USERS = REGISTERED_USERS.map(u => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.displayRole,
  systemRole: u.role,
  department: u.department,
  avatarInitials: u.avatarInitials,
  badge: u.badge,
  permissions: u.permissions
}));

/**
 * POST /api/auth/login
 * Validates credentials against registered users and issues a cryptographic JWT.
 * Arbitrary-user login is strictly disabled.
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const lowerEmail = email.toLowerCase().trim();
    const matched = REGISTERED_USERS.find(u => u.email.toLowerCase() === lowerEmail);

    if (!matched) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials: User account does not exist. Arbitrary self-registration is disabled.',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verify password:
    // In production, password is strictly required and must match matched.passwordHash.
    // In dev / test mode, we accept either the specific user password or standard demo password 'password123' or persona switch.
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      if (!password || password !== matched.passwordHash) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials: Incorrect password.',
          code: 'INVALID_CREDENTIALS'
        });
      }
    } else {
      if (password && password !== matched.passwordHash && password !== 'password123') {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials: Incorrect password.',
          code: 'INVALID_CREDENTIALS'
        });
      }
    }

    // Issue cryptographic HMAC-SHA256 token
    const token = signAuthToken({
      id: matched.id,
      name: matched.name,
      email: matched.email,
      role: matched.role,
      department: matched.department,
      permissions: matched.permissions
    });

    await db.saveAuditLog({
      actor: matched.name,
      action: 'USER_LOGIN',
      entityType: 'AUTH',
      entityId: matched.id,
      details: { email: matched.email, role: matched.role }
    });

    const userResponse = {
      id: matched.id,
      name: matched.name,
      email: matched.email,
      role: matched.displayRole,
      systemRole: matched.role,
      department: matched.department,
      avatarInitials: matched.avatarInitials,
      badge: matched.badge,
      permissions: matched.permissions
    };

    res.json({
      success: true,
      token,
      user: userResponse
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/auth/logout
 * Revokes the active session token in memory blacklist and records audit log.
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      revokeAuthToken(token);
    }

    const actor = req.body.actor || 'User';
    await db.saveAuditLog({
      actor,
      action: 'USER_LOGOUT',
      entityType: 'AUTH',
      entityId: 'session',
      details: { timestamp: new Date().toISOString() }
    });

    res.json({ success: true, message: 'Logged out successfully. Token revoked.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/auth/me
 * Returns the verified user identity from the cryptographic Bearer token.
 */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const matched = REGISTERED_USERS.find(u => u.id === req.user!.id);

  res.json({
    success: true,
    user: matched ? {
      id: matched.id,
      name: matched.name,
      email: matched.email,
      role: matched.displayRole,
      systemRole: matched.role,
      department: matched.department,
      avatarInitials: matched.avatarInitials,
      badge: matched.badge,
      permissions: matched.permissions
    } : {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      systemRole: req.user.role,
      department: req.user.department,
      avatarInitials: req.user.name.slice(0, 2).toUpperCase(),
      badge: req.user.role,
      permissions: req.user.permissions
    }
  });
});

export default router;


import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { signAuthToken, revokeAuthToken, requireAuth } from '../middleware/auth.js';

const router = Router();

export const DEMO_USERS = [
  {
    id: 'USR-001',
    name: 'Marcus Vance',
    email: 'marcus.vance@stockwisepay.com',
    role: 'Inventory Lead / Approver',
    systemRole: 'LEAD_APPROVER',
    department: 'Operations & Supply',
    avatarInitials: 'MV',
    badge: 'LEAD APPROVER',
    permissions: ['INVENTORY_VIEW', 'INVENTORY_EDIT', 'PLAN_GENERATE', 'PLAN_APPROVE', 'PAYMENT_EXECUTE']
  },
  {
    id: 'USR-002',
    name: 'Elena Rostova',
    email: 'elena.rostova@stockwisepay.com',
    role: 'Procurement Specialist',
    systemRole: 'BUYER',
    department: 'Supplier Relations',
    avatarInitials: 'ER',
    badge: 'BUYER',
    permissions: ['INVENTORY_VIEW', 'SUPPLIERS_COMPARE', 'PLAN_GENERATE']
  },
  {
    id: 'USR-003',
    name: 'David Chen',
    email: 'david.chen@stockwisepay.com',
    role: 'Chief Financial Officer',
    systemRole: 'TREASURY',
    department: 'Finance & Treasury',
    avatarInitials: 'DC',
    badge: 'TREASURY',
    permissions: ['BUDGET_EDIT', 'AUDIT_VIEW', 'PAYMENT_AUDIT', 'PLAN_APPROVE', 'PAYMENT_EXECUTE']
  }
];

/**
 * POST /api/auth/login
 * Validates credentials against database-backed accounts using bcrypt password verification
 * and issues a cryptographic HMAC-SHA256 JWT.
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = await db.getUserByEmail(cleanEmail);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials: User account does not exist. Arbitrary self-registration is disabled.',
        code: 'INVALID_CREDENTIALS'
      });
    }

    if (!password || typeof password !== 'string') {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials: Password is required.',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verify password against stored bcrypt hash
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials: Incorrect password.',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Issue cryptographic HMAC-SHA256 token
    const token = signAuthToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      permissions: user.permissions
    });

    await db.saveAuditLog({
      actor: user.name,
      action: 'USER_LOGIN',
      entityType: 'AUTH',
      entityId: user.id,
      details: { email: user.email, role: user.role }
    });

    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.displayRole,
      systemRole: user.role,
      department: user.department,
      avatarInitials: user.avatarInitials,
      badge: user.badge,
      permissions: user.permissions
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
 * Revokes the active session token persistently in database and cache.
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      await revokeAuthToken(token);
    }

    const actor = req.body?.actor || 'User';
    await db.saveAuditLog({
      actor,
      action: 'USER_LOGOUT',
      entityType: 'AUTH',
      entityId: 'session',
      details: { timestamp: new Date().toISOString() }
    });

    res.json({ success: true, message: 'Logged out successfully. Token persistently revoked.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/auth/me
 * Returns the verified user identity from the cryptographic Bearer token.
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const dbUser = await db.getUserById(req.user.id).catch(() => null);

  res.json({
    success: true,
    user: dbUser ? {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.displayRole,
      systemRole: dbUser.role,
      department: dbUser.department,
      avatarInitials: dbUser.avatarInitials,
      badge: dbUser.badge,
      permissions: dbUser.permissions
    } : {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      systemRole: req.user.role,
      department: req.user.department || 'Operations',
      avatarInitials: req.user.name.slice(0, 2).toUpperCase(),
      badge: req.user.role,
      permissions: req.user.permissions
    }
  });
});

export default router;

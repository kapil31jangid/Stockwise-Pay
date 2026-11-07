import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';

const router = Router();

export const DEMO_USERS = [
  {
    id: 'USR-001',
    name: 'Marcus Vance',
    email: 'marcus.vance@stockwisepay.com',
    role: 'Inventory Lead / Approver',
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
    department: 'Finance & Treasury',
    avatarInitials: 'DC',
    badge: 'TREASURY',
    permissions: ['BUDGET_EDIT', 'AUDIT_VIEW', 'PAYMENT_AUDIT', 'PLAN_APPROVE']
  }
];

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const lowerEmail = (email || '').toLowerCase().trim();
    const matched = DEMO_USERS.find(u => u.email.toLowerCase() === lowerEmail);

    const user = matched || {
      id: `USR-${Date.now().toString().slice(-4)}`,
      name: email ? email.split('@')[0].replace('.', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : 'Demo Retailer',
      email: email || 'demo@stockwisepay.com',
      role: 'Store Operations Manager',
      department: 'Retail Operations',
      avatarInitials: (email ? email.slice(0, 2) : 'DR').toUpperCase(),
      badge: 'AUTHENTICATED',
      permissions: ['INVENTORY_VIEW', 'PLAN_GENERATE', 'PLAN_APPROVE', 'PAYMENT_EXECUTE']
    };

    const token = `jwt-stockwise-${user.id}-${Date.now()}`;

    await db.saveAuditLog({
      actor: user.name,
      action: 'USER_LOGIN',
      entityType: 'AUTH',
      entityId: user.id,
      details: { email: user.email, role: user.role }
    });

    res.json({
      success: true,
      token,
      user
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  const { actor = 'User' } = req.body;
  await db.saveAuditLog({
    actor,
    action: 'USER_LOGOUT',
    entityType: 'AUTH',
    entityId: 'session',
    details: { timestamp: new Date().toISOString() }
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

router.get('/me', (req: Request, res: Response) => {
  res.json({
    success: true,
    user: DEMO_USERS[0]
  });
});

export default router;


import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db/index.js';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: 'LEAD_APPROVER' | 'BUYER' | 'TREASURY' | 'STORE_MANAGER';
  department?: string;
  permissions: string[];
}

export interface JwtHeader {
  alg: 'HS256';
  typ: 'JWT';
}

export interface JwtPayload {
  sub: string;
  name: string;
  email: string;
  role: 'LEAD_APPROVER' | 'BUYER' | 'TREASURY' | 'STORE_MANAGER';
  department?: string;
  permissions: string[];
  iat: number;
  exp: number;
  jti: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      authToken?: string;
    }
  }
}

// In production, JWT_SECRET must be explicitly set and at least 32 characters
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32) {
      throw new Error('FATAL: JWT_SECRET environment variable with at least 32 characters is required in production.');
    }
    return secret;
  }
  return secret || 'stockwise-cryptographic-jwt-secret-key-32-chars-minimum-dev-only-2026';
}

// In-memory token revocation cache
const revokedTokenIds = new Set<string>();

/**
 * Revoke an active JWT token persistently in database and in-memory cache
 */
export async function revokeAuthToken(token: string): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload: JwtPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (payload.jti) {
        revokedTokenIds.add(payload.jti);
        const expDate = payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 86400000);
        await db.revokeToken(payload.jti, expDate).catch(() => {});
        return true;
      }
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    revokedTokenIds.add(tokenHash);
    await db.revokeToken(tokenHash, new Date(Date.now() + 86400000)).catch(() => {});
    return true;
  } catch {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    revokedTokenIds.add(tokenHash);
    return true;
  }
}

/**
 * Sign a cryptographic HMAC-SHA256 JWT
 */
export function signAuthToken(
  user: {
    id: string;
    name: string;
    email: string;
    role: 'LEAD_APPROVER' | 'BUYER' | 'TREASURY' | 'STORE_MANAGER';
    department?: string;
    permissions?: string[];
  },
  expiresInSeconds: number = 8 * 3600 // 8 hours
): string {
  const secret = getJwtSecret();
  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomBytes(16).toString('hex');

  const payload: JwtPayload = {
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department || 'Operations',
    permissions: user.permissions || [],
    iat: now,
    exp: now + expiresInSeconds,
    jti
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
}

/**
 * Verify a cryptographic HMAC-SHA256 JWT
 */
export async function verifyAuthToken(token: string): Promise<JwtPayload | null> {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const secret = getJwtSecret();

  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');

  // Constant-time signature comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (sigBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload: JwtPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }

    // Check revocation (memory cache first, then database)
    if (payload.jti && revokedTokenIds.has(payload.jti)) {
      return null; // Revoked in cache
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (revokedTokenIds.has(tokenHash)) {
      return null;
    }

    if (payload.jti) {
      const isDbRevoked = await db.isTokenRevoked(payload.jti).catch(() => false);
      if (isDbRevoked) {
        revokedTokenIds.add(payload.jti);
        return null;
      }
    }

    return payload;
  } catch {
    return null;
  }
}

const PUBLIC_PATHS = [
  '/health',
  '/api/health',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/paypal/webhook'
];

/**
 * Central Authentication Middleware
 * Validates cryptographically signed Bearer tokens on all protected routes.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const path = req.path;
  const originalUrl = req.originalUrl.split('?')[0];

  if (
    PUBLIC_PATHS.some((p) => path === p || originalUrl === p) ||
    req.method === 'OPTIONS'
  ) {
    return next();
  }

  const authHeader = req.headers.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Authentication required. Provide a valid Bearer token in the Authorization header.',
      code: 'AUTH_REQUIRED',
    });
  }

  const payload = await verifyAuthToken(token);
  if (!payload) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid, expired, or forged authentication token.',
      code: 'INVALID_TOKEN',
    });
  }

  req.user = {
    id: payload.sub,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    department: payload.department,
    permissions: payload.permissions
  };
  req.authToken = token;

  next();
}

/**
 * Role-Based Access Control Middleware
 */
export function requireRole(allowedRoles: Array<'LEAD_APPROVER' | 'BUYER' | 'TREASURY' | 'STORE_MANAGER'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: User with role '${req.user.role}' is not authorized to perform this operation. Allowed roles: ${allowedRoles.join(', ')}`,
        code: 'INSUFFICIENT_ROLE'
      });
    }
    next();
  };
}

/**
 * Permission-Based Access Control Middleware
 */
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Authentication required.' });
    }
    if (!req.user.permissions || !req.user.permissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Missing required permission '${permission}'.`,
        code: 'MISSING_PERMISSION'
      });
    }
    next();
  };
}

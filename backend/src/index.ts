import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import inventoryRoutes from './routes/inventory.js';
import suppliersRoutes from './routes/suppliers.js';
import plansRoutes from './routes/plans.js';
import paypalRoutes from './routes/paypal.js';
import agentRoutes from './routes/agent.js';
import budgetRoutes from './routes/budget.js';
import authRoutes from './routes/auth.js';
import auditRoutes from './routes/audit.js';
import { requireAuth } from './middleware/auth.js';
import { db } from './db/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

function getConfiguredOrigins(): string[] {
  return (process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        console.warn(`[CORS] Ignoring invalid FRONTEND_URL origin: ${origin}`);
        return '';
      }
    })
    .filter(Boolean);
}

const configuredOrigins = getConfiguredOrigins();
const allowedOrigins = new Set(
  process.env.NODE_ENV === 'production'
    ? configuredOrigins
    : ['http://localhost:3000', 'http://127.0.0.1:3000', ...configuredOrigins]
);

const corsOptions = {
  origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};

// CORS must run before parsing, authentication, rate limiting, and route handlers.
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logger
app.use((req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// Public Health check
app.get(['/health', '/api/health'], (req: Request, res: Response) => {
  const paypalConfigured = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  const persistenceReady = db.persistenceMode !== 'unavailable';
  res.status(persistenceReady ? 200 : 503).json({
    status: persistenceReady ? 'ok' : 'degraded',
    service: 'StockWise Pay API Server',
    environment: process.env.NODE_ENV || 'development',
    persistenceMode: db.persistenceMode,
    paypalMode: paypalConfigured ? 'Sandbox API configured' : 'PayPal credentials not configured',
    paypalConfigured,
    timestamp: new Date().toISOString()
  });
});

// Authentication endpoints (login, logout)
app.use('/api/auth', authRoutes);

// Enforce strict authentication on ALL downstream API endpoints
app.use('/api', requireAuth);

// Core Planning Document API Routes (Protected)
app.use('/api/inventory', inventoryRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/paypal', paypalRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/audit-logs', auditRoutes);

// Frontend Route Aliases (Ensures seamless plug-and-play with existing frontend services)
app.use('/api/purchase-plans', plansRoutes);
app.use('/api/payments', (req: Request, res: Response, next: NextFunction) => {
  if (req.url === '/' && req.method === 'GET') {
    req.url = '/payments/history';
  }
  return paypalRoutes(req, res, next);
});
app.use('/api/ai-recommendations', agentRoutes);

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `API Route not found: ${req.method} ${req.originalUrl}`
  });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled API Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

if (process.env.NODE_ENV !== 'test') {
  db.verifyConnection().then(() => {
    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`⚡ StockWise Pay API Server running on port ${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📦 Database store initialized and ready`);
      console.log(`💳 PayPal mode: ${process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? 'Sandbox API configured' : 'Not configured'}`);
      console.log(`=======================================================`);
    });
  }).catch((err: any) => {
    console.error('FATAL: Database startup check failed:', err);
    process.exit(1);
  });
}

export default app;

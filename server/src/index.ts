import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initDatabase, closeDatabase, execute } from './db/database.js';
import { authMiddleware } from './middleware/auth.js';
import { doubleCsrfProtection, csrfErrorHandler } from './middleware/csrf.js';
import { globalApiRateLimiter } from './middleware/rate-limit.js';
import authRoutes from './routes/auth.js';
import sourcesRoutes from './routes/sources.js';
import connectionsRoutes from './routes/connections.js';
import favoritesRoutes from './routes/favorites.js';
import dashboardsRoutes from './routes/dashboards.js';
import groupsRoutes from './routes/groups.js';
import sharesRoutes from './routes/shares.js';
import publicShareRoutes from './routes/public-share.js';
import cacheRoutes from './routes/cache.js';
import migrateRoutes from './routes/migrate.js';
import monitoringRoutes from './routes/monitoring.js';
import adminRoutes from './routes/admin.js';
import tourStateRoutes from './routes/tour-state.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3002', 10);

// Security & parsing middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Global safety-net rate limiter on all /api/* routes. Per-route auth limiters
// (authLimiter) apply on top for sensitive auth flows.
app.use('/api', globalApiRateLimiter);

// Auth middleware (sets req.user on all requests)
app.use(authMiddleware);

// CSRF protection — double-submit cookie pattern (csrf-csrf v4). Mounted
// AFTER cookieParser + authMiddleware so it can access req.cookies + req.user
// for session binding. Skips GET/HEAD/OPTIONS and auth-bootstrap routes
// (login, register, forgot-password, reset-password, verify-email). See
// server/src/middleware/csrf.ts for the skip list.
app.use(doubleCsrfProtection);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'database' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sources', sourcesRoutes);
app.use('/api/connections', connectionsRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/dashboards', dashboardsRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/shares', sharesRoutes);
// Anonymous routes for public share resolution. Mounted at a distinct
// /api/public/share/* path to make the public surface obvious. The router
// only declares GET /:token (no mutations), so CSRF protection above does
// not apply.
app.use('/api/public/share', publicShareRoutes);
app.use('/api/cache', cacheRoutes);
app.use('/api/migrate', migrateRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tour-state', tourStateRoutes);

// CSRF error handler — renvoie 403 JSON structuré que le frontend détecte
// pour refetch le token. Doit être déclaré APRÈS les routes.
app.use(csrfErrorHandler);

// Graceful shutdown
async function shutdown() {
  await closeDatabase();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server after database initialization
async function start() {
  await initDatabase();

  // Cleanup expired unverified accounts (older than 7 days)
  try {
    const result = await execute(
      `DELETE FROM users WHERE email_verified = FALSE AND verification_expires IS NOT NULL
       AND verification_expires < DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );
    if (result.affectedRows > 0) {
      // eslint-disable-next-line no-console -- startup housekeeping log
      console.log(`[server] Cleaned up ${result.affectedRows} expired unverified account(s)`);
    }
  } catch (err) {
    console.error('[server] Failed to cleanup expired accounts:', err);
  }

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console -- startup banner
    console.log(`[server] dsfr-data API listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});

export default app;

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initDatabase, closeDatabase, execute } from './db/database.js';
import { authMiddleware } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import sourcesRoutes from './routes/sources.js';
import connectionsRoutes from './routes/connections.js';
import favoritesRoutes from './routes/favorites.js';
import dashboardsRoutes from './routes/dashboards.js';
import groupsRoutes from './routes/groups.js';
import sharesRoutes from './routes/shares.js';
import cacheRoutes from './routes/cache.js';
import migrateRoutes from './routes/migrate.js';
import monitoringRoutes from './routes/monitoring.js';
import adminRoutes from './routes/admin.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3002', 10);

// Security & parsing middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Auth middleware (sets req.user on all requests)
app.use(authMiddleware);

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
app.use('/api/cache', cacheRoutes);
app.use('/api/migrate', migrateRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/admin', adminRoutes);

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
       AND verification_expires < DATE_SUB(NOW(), INTERVAL 7 DAY)`,
    );
    if (result.affectedRows > 0) {
      console.log(`[server] Cleaned up ${result.affectedRows} expired unverified account(s)`);
    }
  } catch (err) {
    console.error('[server] Failed to cleanup expired accounts:', err);
  }

  app.listen(PORT, () => {
    console.log(`[server] dsfr-data API listening on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});

export default app;

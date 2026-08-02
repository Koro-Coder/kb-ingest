// Builds the Express app from injected dependencies, so tests can boot the
// real app with in-memory stores and a fake OAuth provider. index.js is now
// only the production wiring.
//
// The shape of this file IS the access-control policy: everything under /api
// except /api/auth requires an admin, and /api/admins requires an owner.

const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');

const booksRouter = require('./routes/books');
const reportsRouter = require('./routes/reports');
const { createAuthRouter } = require('./routes/auth');
const { createAdminsRouter } = require('./routes/admins');
const { createTokenService } = require('./auth/tokens');
const { createRefreshService } = require('./auth/refreshTokens');
const { createRequireAdmin, requireOwner } = require('./auth/middleware');
const { resolveProviders } = require('./auth/providers');
const mongo = require('./store/mongo');

function createApp({ stores, config: rawConfig, now = Date.now }) {
  const app = express();

  const config = { ...rawConfig, providers: resolveProviders(rawConfig.providers) };

  app.use(express.json());
  app.use(cookieParser());
  // Video-link CSVs are posted back as raw text; a whole book's worth of rows
  // comfortably exceeds the default body limit.
  app.use(express.text({ type: 'text/csv', limit: '10mb' }));

  const tokens = createTokenService({
    jwtSecret: config.jwtSecret,
    issuer: config.issuer,
    audience: config.audience,
    accessTtlSeconds: config.accessTtlSeconds,
    oauthStateTtlSeconds: config.oauthStateTtlSeconds,
    now
  });

  const refreshService = createRefreshService({
    store: stores.adminSessions,
    tokens,
    refreshTtlDays: config.refreshTtlDays,
    now
  });

  const requireAdmin = createRequireAdmin(tokens);

  // Unauthenticated on purpose: it reports only liveness, and a monitor must
  // be able to reach it.
  app.get('/health', async (req, res) => {
    let db = false;
    try {
      db = await mongo.ping();
    } catch (error) {
      db = false;
    }
    res.json({
      ok: db,
      hasToken: Boolean(process.env.GITHUB_TOKEN),
      db: db ? 'up' : 'down',
      database: mongo.databaseName()
    });
  });

  app.use('/api/auth', createAuthRouter({ stores, config, tokens, refreshService, requireAdmin, now }));

  // Everything below is admin-only. requireAdmin is mounted as its own layer
  // rather than per-route so a future route cannot be added unprotected by
  // forgetting to wrap it.
  app.use('/api', requireAdmin);
  app.use('/api/admins', createAdminsRouter({ stores, requireOwner, refreshService, now }));
  app.use('/api/books', booksRouter);
  app.use('/api/reports', reportsRouter);

  // Serve the built admin UI in production; in dev, run `npm run dev` inside web/ separately.
  const webDist = path.join(__dirname, '..', 'web', 'dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: error.message });
  });

  return app;
}

module.exports = { createApp };

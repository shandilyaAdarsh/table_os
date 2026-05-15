// ============================================================
// src/server.ts
// HTTP server entry point.
// Loads env validation first, then starts Express.
// ============================================================

import { env } from './config/env'; // Must be first — validates env before anything else
import { createApp } from './app';
import { logger } from './shared/utils/logger';

const app = createApp();
const PORT = env.PORT;

const server = app.listen(PORT, () => {
  logger.info(
    {
      port: PORT,
      env: env.NODE_ENV,
      supabase: env.SUPABASE_URL,
    },
    `🚀 Orderlli backend running on port ${PORT}`
  );
});

// ─── Graceful shutdown ────────────────────────────────────────

function shutdown(signal: string): void {
  logger.info({ signal }, 'Received shutdown signal — closing server gracefully');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    logger.error('Forcefully shutting down after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception — process will exit');
  process.exit(1);
});

// ============================================================
// src/server.ts
// HTTP server entry point.
// Loads env validation first, then starts Express.
// ============================================================

import { env } from './config/env'; // Must be first — validates env before anything else
import { createApp } from './app';
import { logger } from './shared/utils/logger';
import { GracefulShutdownService } from './modules/infrastructure/graceful-shutdown.service';

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

// Register HTTP Server cleanup hook
GracefulShutdownService.registerHook('HTTP Server', 50, () => {
  return new Promise<void>((resolve) => {
    server.close(() => {
      logger.info('HTTP server closed gracefully');
      resolve();
    });
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
  GracefulShutdownService.initiateShutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception — process will exit');
  GracefulShutdownService.initiateShutdown('uncaughtException');
});


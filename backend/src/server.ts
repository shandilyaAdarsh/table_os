// ============================================================
// src/server.ts
// HTTP server entry point.
// Loads env validation first, then starts Express.
// ============================================================

import { env } from './config/env'; // Must be first — validates env before anything else
import { createApp } from './app';
import { logger } from './shared/utils/logger';
import { GracefulShutdownService } from './modules/infrastructure/graceful-shutdown.service';

import { WebSocketManager } from './modules/transport/websocket.manager';

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

// ─── WebSocket Upgrade Hook ──────────────────────────────────
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url!, `http://${request.headers.host}`).pathname;

  if (pathname === '/api/v1/realtime') {
    void WebSocketManager.getInstance().handleUpgrade(request, socket, head);
  } else {
    socket.destroy();
  }
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

// Register WebSocketManager cleanup hook
GracefulShutdownService.registerHook('WebSocket Transport', 60, async () => {
  await WebSocketManager.getInstance().shutdown();
  logger.info('WebSocket connections cleanly terminated');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
  GracefulShutdownService.initiateShutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception — process will exit');
  GracefulShutdownService.initiateShutdown('uncaughtException');
});


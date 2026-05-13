// ============================================================
// src/utils/logger.ts
// Pino logger — structured JSON in production, pretty in dev.
// ============================================================

import pino from 'pino';
import { env } from '../config/env';

const isDev = env.NODE_ENV !== 'production';

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  base: { service: 'orderlli-backend' },
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname,service',
          },
        },
      }
    : {
        // Production: JSON with timestamps for log aggregators
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
});

export type Logger = typeof logger;

/** Create a child logger scoped to a module */
export function moduleLogger(module: string): Logger {
  return logger.child({ module }) as Logger;
}

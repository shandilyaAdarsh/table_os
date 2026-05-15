import pino from 'pino';

/**
 * Centralized logging utility using Pino.
 * Structured, production-safe logging with comprehensive PII redaction.
 *
 * SECURITY: These redact paths are a safety net — NEVER intentionally log
 * any of these fields. If you need to debug auth issues, use audit logs.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'SYS:standard',
    },
  } : undefined,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  // Comprehensive PII and credential redaction.
  // Paths use dot-notation. Wildcards (*) cover nested objects.
  redact: {
    paths: [
      // Auth headers
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',

      // Body fields (top-level and nested)
      'req.body.password',
      'req.body.new_password',
      'req.body.current_password',
      'req.body.refresh_token',
      'req.body.access_token',
      'req.body.pin',
      'req.body.otp',

      // Generic sensitive field names anywhere in the log object
      'password',
      'new_password',
      'current_password',
      'pin_code',
      'pin_code_hash',
      'token',
      'access_token',
      'refresh_token',
      'secret',
      'otp',
      'last_token_hash',
    ],
    censor: '[REDACTED]',
  },
});

export default logger;


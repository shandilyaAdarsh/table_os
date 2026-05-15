import { pinoHttp } from 'pino-http';
import { logger } from '../shared/utils/logger';

/**
 * HTTP request logging middleware using pino-http.
 */
export const loggingMiddleware = pinoHttp({
  logger,
  // Custom response logging
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },
  // Redact potentially sensitive info from logs
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      // body: req.raw.body, // Be careful with logging bodies
    }),
  },
});

import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors/AppError';
import { ErrorCode } from '../shared/errors/error-codes';
import { ResponseFormatter } from '../shared/utils/response-formatter';
import { logger } from '../shared/utils/logger';

/**
 * Centralized error handling middleware.
 */
export const errorMiddleware = (
  err: Error | AppError | any,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode = 500;
  let errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
  let message = 'Internal Server Error';
  let details = undefined;

  if (err instanceof AppError || err.isOperational) {
    statusCode = err.statusCode || 500;
    errorCode = err.code as ErrorCode;
    message = err.message;
    details = err.fields ?? err.details;
  } else if (err.name === 'ZodError') {
    statusCode = 422;
    errorCode = ErrorCode.VALIDATION_ERROR;
    message = 'Validation failed';
    details = err.errors;
  }

  // Log error — NEVER include req.body (may contain passwords/PII)
  if (statusCode >= 500) {
    logger.error({ 
      err: { message: err.message, code: err.code, stack: err.stack },
      req: { method: req.method, url: req.url }
    }, 'Unhandled Exception');
  } else {
    logger.warn({ 
      err: { message, errorCode, details }, 
      req: { method: req.method, url: req.url } 
    }, 'Operational Error');
  }

  const response = ResponseFormatter.error(
    errorCode,
    message,
    details,
    err.stack
  );

  res.status(statusCode).json(response);
};

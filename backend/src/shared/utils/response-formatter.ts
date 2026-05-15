import type { ApiResponse, PaginatedData } from '../types/api-response.types';
import type { ErrorCode } from '../errors/error-codes';

/**
 * Standard response formatter utility.
 */
/**
 * Format a success response.
 */
export function formatSuccess<T>(data: T, message?: string, meta?: Record<string, unknown>): ApiResponse<T> {
  return {
    success: true,
    message,
    data,
    meta,
  };
}

/**
 * Format a paginated success response.
 */
export function formatPaginated<T>(paginatedData: PaginatedData<T>, message?: string): ApiResponse<T[]> {
  const { items, ...meta } = paginatedData;
  return {
    success: true,
    message,
    data: items,
    meta,
  };
}

/**
 * Format an error response.
 */
export function formatError(code: ErrorCode, message: string, details?: unknown, stack?: string): ApiResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
      ...(process.env.NODE_ENV === 'development' ? { stack } : {}),
    },
  };
}

/**
 * @deprecated Use named exports instead.
 */
export const ResponseFormatter = {
  success: formatSuccess,
  paginated: formatPaginated,
  error: formatError,
};

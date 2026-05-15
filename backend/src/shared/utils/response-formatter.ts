import { ApiResponse, PaginatedData } from '../types/api-response.types';

/**
 * Standard response formatter utility.
 */
export const ResponseFormatter = {
  /**
   * Format a success response.
   */
  success<T>(data: T, message?: string, meta?: any): ApiResponse<T> {
    return {
      success: true,
      message,
      data,
      meta,
    };
  },

  /**
   * Format a paginated success response.
   */
  paginated<T>(paginatedData: PaginatedData<T>, message?: string): ApiResponse<T[]> {
    const { items, ...meta } = paginatedData;
    return {
      success: true,
      message,
      data: items,
      meta,
    };
  },

  /**
   * Format an error response.
   */
  error(code: any, message: string, details?: any, stack?: string): ApiResponse {
    return {
      success: false,
      error: {
        code,
        message,
        details,
        ...(process.env.NODE_ENV === 'development' ? { stack } : {}),
      },
    };
  },
};

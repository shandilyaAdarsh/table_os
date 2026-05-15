import { ErrorCode } from '../errors/error-codes';

/**
 * Standard API Response Structure
 */
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: ApiErrorResponse;
  meta?: any;
}

export interface ApiErrorResponse {
  code: ErrorCode;
  message: string;
  details?: any;
  stack?: string;
}

/**
 * Pagination Types
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

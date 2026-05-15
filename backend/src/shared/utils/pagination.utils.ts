import type { PaginationParams, PaginatedData } from '../types/api-response.types';

/**
 * Utility for handling pagination calculations.
 */
export const PaginationUtils = {
  /**
   * Get offset and limit from pagination params.
   */
  getPaginationOptions(params: PaginationParams) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 10));
    const offset = (page - 1) * limit;

    return { page, limit, offset };
  },

  /**
   * Format data into a PaginatedData object.
   */
  formatPaginatedData<T>(
    items: T[],
    total: number,
    page: number,
    limit: number
  ): PaginatedData<T> {
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  },
};

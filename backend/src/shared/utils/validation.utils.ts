import { z } from 'zod';
import { ValidationError } from '../errors/AppError';

/**
 * Validation utilities using Zod.
 */
export const ValidationUtils = {
  /**
   * Validates data against a Zod schema.
   * Throws a ValidationError if validation fails.
   */
  validate<T>(schema: z.Schema<T>, data: unknown): T {
    const result = schema.safeParse(data);

    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      const formattedErrors: Record<string, string> = {};
      
      Object.entries(fieldErrors).forEach(([key, messages]) => {
        if (messages) {
          formattedErrors[key] = messages.join(', ');
        }
      });

      throw new ValidationError(formattedErrors);
    }

    return result.data;
  },

  /**
   * Common schemas
   */
  schemas: {
    uuid: z.string().uuid(),
    email: z.string().email(),
    pagination: z.object({
      page: z.string().transform(Number).optional(),
      limit: z.string().transform(Number).optional(),
      sortBy: z.string().optional(),
      sortOrder: z.enum(['ASC', 'DESC']).optional(),
    }),
  },
};

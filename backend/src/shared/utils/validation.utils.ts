import { z } from 'zod';
import type { ZodSchema } from 'zod';
import { ValidationError } from '../errors/AppError';

/**
 * Common schemas
 */
export const schemas = {
  uuid: z.string().uuid(),
  email: z.string().email(),
  pagination: z.object({
    page: z.string().transform(Number).optional(),
    limit: z.string().transform(Number).optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['ASC', 'DESC']).optional(),
  }),
};

/**
 * Validates data against a Zod schema.
 * Throws a ValidationError if validation fails.
 */
export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    const formattedErrors: Record<string, string> = {};
    
    Object.entries(fieldErrors).forEach(([key, messages]) => {
      if (Array.isArray(messages)) {
        formattedErrors[key] = messages.join(', ');
      }
    });

    throw new ValidationError(formattedErrors);
  }

  return result.data;
}

/**
 * @deprecated Use named exports instead.
 */
export const ValidationUtils = {
  validate,
  schemas,
};

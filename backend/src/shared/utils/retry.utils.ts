import { logger } from './logger';

/**
 * Utility for retrying an operation with exponential backoff.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    factor?: number;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    factor = 2,
    shouldRetry = () => true,
  } = options;

  let lastError: any;
  let delay = initialDelay;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (i === maxRetries - 1 || !shouldRetry(error)) {
        throw error;
      }

      logger.warn({ err: error, attempt: i + 1, nextDelay: delay }, 'Operation failed, retrying...');
      
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= factor;
    }
  }

  throw lastError;
}

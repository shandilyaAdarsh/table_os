// ============================================================
// src/shared/errors/AppError.ts
// Typed, structured error hierarchy.
// All operational errors extend AppError — unexpected errors do not.
// ============================================================

import { ErrorCode } from './error-codes';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number,
    code: string | ErrorCode,
    isOperational = true,
    details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── 401 ──────────────────────────────────────────────────────

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHENTICATED');
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    // Deliberately vague — never reveal which field is wrong
    super('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }
}

export class SessionExpiredError extends AppError {
  constructor() {
    super('Session expired. Please log in again.', 401, 'SESSION_EXPIRED');
  }
}

export class SessionRevokedError extends AppError {
  constructor() {
    super('Session has been revoked.', 401, 'SESSION_REVOKED');
  }
}

export class TokenInvalidError extends AppError {
  constructor(detail?: string) {
    super(detail ?? 'Token is invalid or expired', 401, 'TOKEN_INVALID');
  }
}

// ─── 403 ──────────────────────────────────────────────────────

export class AccountLockedError extends AppError {
  public readonly locked_until: Date | null;

  constructor(until: Date | null = null) {
    const msg = until
      ? `Account locked until ${until.toISOString()}`
      : 'Account is locked. Contact your administrator.';
    super(msg, 403, 'ACCOUNT_LOCKED');
    this.locked_until = until;
  }
}

export class AccountDisabledError extends AppError {
  constructor() {
    super('Account is disabled', 403, 'ACCOUNT_DISABLED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class MustChangePasswordError extends AppError {
  constructor() {
    super('Password change required before continuing', 403, 'MUST_CHANGE_PASSWORD');
  }
}

// ─── 404 ──────────────────────────────────────────────────────

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

// ─── 422 ──────────────────────────────────────────────────────

export class ValidationError extends AppError {
  public readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super('Validation failed', 422, 'VALIDATION_ERROR');
    this.fields = fields;
  }
}

// ─── 429 ──────────────────────────────────────────────────────

export class RateLimitError extends AppError {
  public readonly retry_after: number;

  constructor(retryAfterSeconds: number) {
    super(
      `Too many attempts. Try again in ${retryAfterSeconds} seconds.`,
      429,
      'RATE_LIMITED'
    );
    this.retry_after = retryAfterSeconds;
  }
}

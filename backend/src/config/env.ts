// ============================================================
// src/config/env.ts
// Validates all environment variables at startup using Zod.
// Fails fast with clear error messages if config is missing.
// ============================================================

import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  // Supabase
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_JWT_SECRET: z.string().min(1, 'SUPABASE_JWT_SECRET is required'),

  // App
  ADMIN_FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),

  // Rate limiting
  AUTH_MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(5),
  AUTH_RATE_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(30),

  // Session TTLs
  AUTH_ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(3600),
  AUTH_DEVICE_SESSION_TTL_DAYS: z.coerce.number().int().positive().default(1),
  AUTH_DEVICE_SESSION_REMEMBER_ME_DAYS: z.coerce.number().int().positive().default(30),

  // QR + device security
  QR_SIGNING_SECRET: z.string().min(16, 'QR_SIGNING_SECRET is required'),
  QR_SESSION_SECRET: z.string().min(16, 'QR_SESSION_SECRET is required'),
  DEVICE_TOKEN_SECRET: z.string().min(16, 'DEVICE_TOKEN_SECRET is required'),
  RUNTIME_JWT_SECRET: z.string().min(16, 'RUNTIME_JWT_SECRET is required').default('runtime_jwt_secret_must_be_min_16_chars_long'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const messages = Object.entries(errors)
      .map(([key, msgs]) => `  ${key}: ${(msgs ?? []).join(', ')}`)
      .join('\n');
    process.stderr.write(`\n❌  Invalid environment variables:\n${messages}\n\n`);
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();

/** Parsed CORS origins as string array */
export const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());

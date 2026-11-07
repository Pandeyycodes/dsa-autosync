import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  /** Public HTTPS origin of this backend, e.g. https://api.codesync.dev */
  PUBLIC_URL: z.string().url(),
  GITHUB_APP_CLIENT_ID: z.string().min(1),
  GITHUB_APP_CLIENT_SECRET: z.string().min(1),
  /** The app's URL slug (github.com/apps/<slug>), used for the install link. */
  GITHUB_APP_SLUG: z.string().regex(/^[a-z0-9-]+$/),
  /** 32 random bytes, base64. Generate with `npm run keys:generate`. */
  TOKEN_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded'),
  /** Comma-separated Chrome extension ids allowed to authenticate. */
  ALLOWED_EXTENSION_IDS: z
    .string()
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().regex(/^[a-p]{32}$/, 'invalid Chrome extension id')).min(1)),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.infer<typeof EnvSchema> & { encryptionKey: Buffer; callbackUrl: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    // Only variable names are printed — never values.
    const fields = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${fields}`);
  }
  const c = parsed.data;
  if (c.NODE_ENV === 'production' && !c.PUBLIC_URL.startsWith('https://')) {
    throw new Error('PUBLIC_URL must use https:// in production');
  }
  return {
    ...c,
    encryptionKey: Buffer.from(c.TOKEN_ENCRYPTION_KEY, 'base64'),
    callbackUrl: new URL('/v1/auth/callback', c.PUBLIC_URL).toString(),
  };
}

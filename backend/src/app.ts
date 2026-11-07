import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import { AuthExchangeRequestSchema, AuthStartRequestSchema, RepoTargetSchema, SyncRequestSchema } from '../../src/shared/schemas';
import type { Config } from './config';
import { GitHubClient } from './github/client';
import { sha256Hex } from './lib/crypto';
import { AppError } from './lib/errors';
import { AuthService, type AuthContext } from './services/auth-service';
import { RepoService } from './services/repo-service';
import { SyncService } from './services/sync-service';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export interface AppDeps {
  config: Config;
  github?: GitHubClient;
  now?: () => Date;
  logger?: boolean | object;
}

/** Response header carrying a re-sealed session after a GitHub token refresh. */
export const SESSION_HEADER = 'x-codesync-session';

function htmlPage(title: string, message: string) {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#09090b;color:#ececee;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:420px;padding:24px;border:1px solid #2a2a31;border-radius:12px;background:#0f0f12}h1{font-size:18px;margin:0 0 8px}p{color:#a0a0ab;margin:0}</style>
</head><body><main><h1>${esc(title)}</h1><p>${esc(message)}</p></main></body></html>`;
}

const publicUser = (s: AuthContext['session']) => ({ login: s.login, avatarUrl: s.avatar, githubId: s.gid });

/** Stateless API: no database. User state travels in a sealed session token. */
export async function buildApp(deps: AppDeps) {
  const { config } = deps;
  const now = deps.now ?? (() => new Date());
  const github = deps.github ?? new GitHubClient({ clientId: config.GITHUB_APP_CLIENT_ID, clientSecret: config.GITHUB_APP_CLIENT_SECRET });
  const auth = new AuthService(config, github, now);
  const repos = new RepoService(config, github, auth);
  const sync = new SyncService(github, auth, repos, now);

  const app = Fastify({
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 512 * 1024,
    logger:
      deps.logger ?? {
        level: config.LOG_LEVEL,
        redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '[redacted]' },
        serializers: {
          // Never log query strings: the OAuth callback carries `code` and `state`.
          req: (req: FastifyRequest) => ({ method: req.method, url: req.url.split('?')[0], ip: req.ip }),
        },
      },
  });

  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], styleSrc: ["'unsafe-inline'"], frameAncestors: ["'none'"] } },
    hsts: { maxAge: 31536000, includeSubDomains: true },
    referrerPolicy: { policy: 'no-referrer' },
  });
  const allowedOrigins = new Set(config.ALLOWED_EXTENSION_IDS.map((id) => `chrome-extension://${id}`));
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.has(origin)),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: [SESSION_HEADER],
    credentials: false,
    maxAge: 600,
  });
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      const h = req.headers.authorization;
      return h?.startsWith('Bearer ') ? `t:${sha256Hex(h).slice(0, 32)}` : `ip:${req.ip}`;
    },
    errorResponseBuilder: (_req, ctx) => new AppError(429, 'RATE_LIMITED', 'Too many requests.', { retryable: true, retryAfterSeconds: Math.ceil(ctx.ttl / 1000) }),
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      if (err.options.retryAfterSeconds) reply.header('retry-after', String(err.options.retryAfterSeconds));
      return reply.status(err.status).send(err.toJSON());
    }
    if (err instanceof ZodError || (err as { name?: string }).name === 'ZodError') {
      return reply.status(400).send({ error: { code: 'VALIDATION_FAILED', message: (err as ZodError).issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 5).join('; ') } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.status(status).send({ error: { code: 'BAD_REQUEST', message: 'Malformed request.' } });
    req.log.error({ err: { name: (err as Error).name, message: (err as Error).message } }, 'unhandled error');
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Internal server error.' } });
  });

  const ctx = (req: FastifyRequest) => req.auth!;
  const strict = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  app.get('/healthz', async () => ({ ok: true }));

  // ---------- Auth ----------
  app.post('/v1/auth/start', strict, async (req) => {
    const body = AuthStartRequestSchema.parse(req.body);
    return { authorizeUrl: auth.start(body.challenge, body.redirectUri) };
  });

  app.get('/v1/auth/callback', strict, async (req, reply: FastifyReply) => {
    const q = z.object({ code: z.string().max(200).optional(), state: z.string().max(8000).optional(), error: z.string().max(100).optional() }).parse(req.query);
    const result = await auth.callback(q);
    reply.header('cache-control', 'no-store');
    if (result.kind === 'redirect') return reply.redirect(result.location, 302);
    return reply.status(result.status).type('text/html').send(htmlPage('CodeSync sign-in failed', result.message));
  });

  app.post('/v1/auth/exchange', strict, async (req, reply) => {
    const body = AuthExchangeRequestSchema.parse(req.body);
    const { token, session } = auth.exchange(body.code, body.verifier);
    reply.header('cache-control', 'no-store');
    return { token, expiresAt: new Date(session.exp).toISOString(), user: publicUser(session) };
  });

  // ---------- Authenticated ----------
  app.register(async (r) => {
    r.addHook('onRequest', async (req) => {
      req.auth = auth.authenticate(req.headers.authorization);
    });
    // If GitHub tokens were refreshed, hand the client its re-sealed session.
    r.addHook('onSend', async (req, reply, payload) => {
      if (req.auth?.renewed) reply.header(SESSION_HEADER, req.auth.renewed);
      reply.header('cache-control', 'no-store');
      return payload;
    });

    r.get('/v1/me', async (req) => {
      const c = ctx(req);
      // Confirms the GitHub authorization is still valid (refreshing if needed).
      await repos.listRepositories(c).catch((e) => {
        if (e instanceof AppError && e.status === 401) throw e;
      });
      return { user: publicUser(c.session), repo: null, githubAuthorized: true, sessionExpiresAt: new Date(c.session.exp).toISOString() };
    });

    r.post('/v1/auth/disconnect', async (req) => {
      await auth.disconnect(ctx(req));
      return { ok: true };
    });

    r.get('/v1/repos', async (req) => repos.listRepositories(ctx(req)));

    r.get('/v1/repos/:repositoryId/branches', async (req) => {
      const { repositoryId } = z.object({ repositoryId: z.string().max(20) }).parse(req.params);
      return repos.listBranches(ctx(req), repositoryId);
    });

    r.post('/v1/repo-config/validate', async (req) => repos.validateTarget(ctx(req), RepoTargetSchema.parse(req.body)));

    r.post('/v1/repo-config/test', async (req) => repos.testWrite(ctx(req), RepoTargetSchema.parse(req.body)));

    r.post('/v1/sync', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => sync.sync(ctx(req), SyncRequestSchema.parse(req.body)));
  });

  return app;
}

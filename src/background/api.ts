import { z } from 'zod';
import {
  ApiErrorSchema,
  AuthExchangeResponseSchema,
  AuthStartResponseSchema,
  BranchesResponseSchema,
  MeResponseSchema,
  RepoConfigSchema,
  ReposResponseSchema,
  type RepoTarget,
  SEALED_TOKEN_RE,
  SyncResponseSchema,
  WriteTestResponseSchema,
  type SyncRequest,
} from '@/shared/schemas';

export class ApiFailure extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiFailure';
  }
}

/** Typed CodeSync backend client. Every response is validated before use. */
export class BackendClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => Promise<string | null>,
    private readonly f: typeof fetch = (...a) => fetch(...a),
    /** Called when the server returns a re-sealed session (GitHub token refresh). */
    private readonly onRenewedSession: (token: string) => Promise<void> = async () => {},
  ) {}

  private async call<T>(schema: z.ZodType<T>, method: string, path: string, body?: unknown, authed = true): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (authed) {
      const token = await this.getToken();
      if (!token) throw new ApiFailure(401, 'NOT_CONNECTED', 'Connect GitHub first.', false);
      headers.Authorization = `Bearer ${token}`;
    }
    let res: Response;
    try {
      res = await this.f(`${this.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiFailure(0, 'NETWORK_ERROR', 'Could not reach the CodeSync server.', true);
    }
    const renewed = res.headers.get('x-codesync-session');
    if (renewed && SEALED_TOKEN_RE.test(renewed)) await this.onRenewedSession(renewed);
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const parsed = ApiErrorSchema.safeParse(json);
      const e = parsed.success ? parsed.data.error : { code: 'HTTP_' + res.status, message: `Server error (${res.status}).` };
      const retryable = parsed.success && e.retryable !== undefined ? e.retryable : res.status >= 500 || res.status === 429;
      throw new ApiFailure(res.status, e.code, e.message, retryable, parsed.success ? parsed.data.error.retryAfterSeconds : undefined);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ApiFailure(res.status, 'BAD_RESPONSE', 'Unexpected response from the CodeSync server.', false);
    return parsed.data;
  }

  startAuth(challenge: string, redirectUri: string) {
    return this.call(AuthStartResponseSchema, 'POST', '/v1/auth/start', { challenge, redirectUri }, false);
  }
  exchange(code: string, verifier: string) {
    return this.call(AuthExchangeResponseSchema, 'POST', '/v1/auth/exchange', { code, verifier }, false);
  }
  me() {
    return this.call(MeResponseSchema, 'GET', '/v1/me');
  }
  disconnect() {
    return this.call(z.object({ ok: z.boolean() }), 'POST', '/v1/auth/disconnect');
  }
  repos() {
    return this.call(ReposResponseSchema, 'GET', '/v1/repos');
  }
  branches(repositoryId: string) {
    return this.call(BranchesResponseSchema, 'GET', `/v1/repos/${encodeURIComponent(repositoryId)}/branches`);
  }
  validateRepo(target: RepoTarget) {
    return this.call(RepoConfigSchema, 'POST', '/v1/repo-config/validate', target);
  }
  testRepo(target: RepoTarget) {
    return this.call(WriteTestResponseSchema, 'POST', '/v1/repo-config/test', target);
  }
  sync(req: SyncRequest) {
    return this.call(SyncResponseSchema, 'POST', '/v1/sync', req);
  }
}

export type SyncApi = Pick<BackendClient, 'sync'>;

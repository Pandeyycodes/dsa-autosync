import { GitHubError } from '../github/client';
import { AppError } from '../lib/errors';
import type { AuthContext, AuthService } from './auth-service';

/** Map GitHub failures to client-safe errors. */
export async function withGitHub<T>(auth: AuthService, ctx: AuthContext, fn: (token: string) => Promise<T>): Promise<T> {
  const token = await auth.accessToken(ctx);
  try {
    return await fn(token);
  } catch (e) {
    if (!(e instanceof GitHubError)) throw e;
    switch (e.kind) {
      case 'unauthorized':
        throw new AppError(401, 'GITHUB_REAUTH_REQUIRED', 'GitHub authorization was revoked. Reconnect GitHub.');
      case 'rate_limited':
        throw new AppError(429, 'GITHUB_RATE_LIMITED', 'GitHub rate limit reached. Will retry later.', { retryable: true, retryAfterSeconds: e.retryAfterSeconds ?? 60 });
      case 'forbidden':
      case 'not_found':
        throw new AppError(403, 'GITHUB_PERMISSION_DENIED', 'CodeSync does not have access to this repository or branch. Check the GitHub App installation.', { retryable: false });
      case 'network':
      case 'server':
        throw new AppError(502, 'GITHUB_UNAVAILABLE', 'GitHub is temporarily unavailable.', { retryable: true });
      default:
        throw new AppError(502, 'GITHUB_ERROR', 'GitHub rejected the request.', { retryable: false });
    }
  }
}

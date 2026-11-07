# Security

## Reporting a vulnerability

Email the maintainer (see the Chrome Web Store listing's support contact) with steps to reproduce. Please don't open a public issue for vulnerabilities. We aim to acknowledge reports within 3 business days.

## Threat model and controls

| Asset / threat | Control | Where |
|---|---|---|
| GitHub user tokens | Exchanged and refreshed **only on the backend**. The backend keeps no database: it **seals** the token into the session with AES-256-GCM, a random 96-bit IV, and the purpose bound as AAD. Only the server key can open it; the extension stores an opaque blob. Tokens are never returned in plaintext and never logged. | `backend/src/lib/seal.ts`, `backend/src/services/auth-service.ts` |
| GitHub App client secret / private key | Backend environment variables only. The extension build fails if a token-, key- or secret-like string appears in `dist/`. | `scripts/verify-dist.mjs` |
| OAuth CSRF / login fixation | `state` is a sealed, tamper-proof blob containing the PKCE challenge, the redirect URI, a 10-minute expiry and a random nonce. The nonce is single-use (in-memory). The callback rejects missing, forged, replayed or expired state. | `AuthService.callback` |
| Authorization-code interception | GitHub redirects to the backend, never to the extension. The backend hands the extension a **one-time, 2-minute handoff code** that only redeems with the PKCE verifier whose SHA-256 challenge the extension sent when it started the flow. | `/v1/auth/start`, `/v1/auth/exchange` |
| Open redirect | The redirect URI must be exactly `https://<allowed-extension-id>.chromiumapp.org/` or `/github`: no query, port or credentials. | `AuthService.isAllowedRedirect` |
| Session theft | Sealed sessions expire after `SESSION_TTL_DAYS`. Without a database there is no per-session revocation list: **Disconnect revokes the GitHub grant**, which immediately makes every session useless. Rotating `TOKEN_ENCRYPTION_KEY` invalidates all sessions. | `AuthService.disconnect` |
| CSRF on the API | Authentication uses bearer tokens, not cookies, so browsers never attach credentials automatically. CORS only allows the configured `chrome-extension://` origins. | `app.ts` |
| Cross-user access | Every user route needs a valid sealed session. Repositories are resolved **with the user's own GitHub token** by numeric ID on every request, so GitHub enforces access. The repository name is always the server-resolved `full_name`, never a client value. | `RepoService.resolve` |
| Revoked authorization | A 401 from GitHub, or a failed refresh, returns `GITHUB_REAUTH_REQUIRED`. The extension pauses its queue until you reconnect. | `withGitHub` |
| Path traversal / malicious names | Paths are built only on the server from validated slugs, IDs and topics. Segments are reduced to `[A-Za-z0-9._-]`; `..`, dot-folders and reserved names are rejected, and the root folder is validated. | `src/shared/repo-paths.ts` |
| Untrusted metadata | Zod validates every boundary. Problem URLs must be HTTPS on the claimed platform host. The submission ID and slug have allowlist formats. A SHA-256 of the code is re-verified on the server. `verdict` must be literally `ACCEPTED`. | `src/shared/schemas.ts` |
| Markdown / HTML injection in README | Titles and cells are escaped and raw HTML is neutralised. Fences grow to outlast any backticks inside them. | `src/shared/readme.ts` |
| Content-script spoofing | The service worker accepts `content/*` messages only from tabs on the claimed platform host, and `ui/*` messages only from extension pages. Payloads are schema-validated. Verdicts are re-fetched from the platform by submission ID, so a forged ID can't produce someone else's code. | `src/background/router.ts` |
| Abuse / brute force | Global rate limit of 120/min. Auth endpoints allow 20/min and sync 60/min, keyed by hashed session or IP. Request bodies are capped at 512 KB. | `app.ts` |
| Transport / headers | HSTS, `nosniff`, `frame-ancestors 'none'`, `default-src 'none'` CSP on HTML responses, and `no-referrer`. HTTPS is enforced for `PUBLIC_URL` in production. | `@fastify/helmet` |
| Logs | Query strings (which carry the OAuth `code` and `state`) are stripped from request logs. Authorization and cookie headers are redacted. Error messages sent to clients never contain upstream bodies. | `app.ts` |
| Idempotency | The extension's persistent queue never re-sends finished jobs. The server keeps an in-flight lock and a 1-hour in-memory window per (user, platform, submission), and identical code is detected via the GitHub blob SHA. | `SyncService.sync` |

## Least-privilege GitHub App permissions

- Repository → **Contents: Read & write** (create blobs, trees and commits; read existing files)
- Repository → **Metadata: Read-only** (GitHub makes this mandatory)
- No account permissions and no webhooks. The app can only reach repositories where the user installed it.

## Key rotation

- **Client secret:** generate a new one in the GitHub App settings, update `GITHUB_APP_CLIENT_SECRET`, redeploy, then delete the old secret.
- **`TOKEN_ENCRYPTION_KEY`:** rotating it invalidates every sealed session, so users click "Reconnect GitHub". Rotate it after any suspected compromise.

## Dependency hygiene

Run `npm audit --omit=dev` in both packages before each release. At the time of writing:
- **Extension:** 0 production advisories. Zod was upgraded to 4.6.7 for GHSA-mrhx-c7xc-m3w5.
- **Backend:** 0 production advisories.
- Remaining `npm audit` findings are in dev-only test tooling (Vitest's transitive dependencies), which is not shipped.

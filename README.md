# CodeSync

CodeSync is a Chrome extension (Manifest V3) with a small, **stateless** backend (no database). It commits your **accepted** LeetCode and GeeksforGeeks solutions to a GitHub repository you choose, each with a generated README.

- **Accepted only.** It uploads only after the platform's own API confirms the verdict for that exact submission ID.
- **Exact code.** It uploads the code the platform stored for that submission, never what is currently in the editor. If that code can't be retrieved, the upload is skipped and the problem is reported.
- **Secure GitHub App sign-in.** The backend keeps the app secret and seals your GitHub token with AES-256-GCM. The extension stores only that sealed blob and can't read the token inside it.
- **Deterministic READMEs.** No AI is involved. Problem text is included only if you opt in.
- **Separate dimensions.** Platform (LeetCode / GeeksforGeeks), language (C … SQL) and topic (Arrays, Trees, Database …) are tracked separately.

> **Other docs:** [DEPLOYMENT.md](DEPLOYMENT.md) (local setup, GitHub App, hosting, Chrome Web Store) · [PRIVACY.md](PRIVACY.md) · [SECURITY.md](SECURITY.md)

## Architecture

```
 LeetCode / GfG tab                          Chrome extension                         Backend (Fastify, stateless)               GitHub
┌──────────────────────┐  postMessage  ┌─────────────────────────┐   HTTPS + Bearer   ┌───────────────────────────────┐  user-to-server
│ MAIN-world hook      │──(id only)──▶ │ isolated content script │                    │ /v1/auth/*  GitHub App OAuth  │  token (server
│ observes submit/     │               │ verifies verdict + gets │── runtime msg ──▶  │ /v1/repos   repo + branch     │  side only)
│ result responses     │               │ exact code by sub. id   │                    │ /v1/sync    idempotent commit │ ─────────────▶ Git Data API
└──────────────────────┘               │                         │  service worker:   │ sealed sessions (AES-GCM),      │                (1 commit per
                                       │ popup / dashboard (React)│  persistent job   │ rate limits, Zod                │                 solution+README)
                                       └─────────────────────────┘  queue + retries   └───────────────────────────────┘
```

| Layer | Path | Responsibility |
|---|---|---|
| Shared domain | `src/shared/` | Languages, verdict normalisation, Zod schemas, safe repo paths, README generator. The backend imports these too. |
| Content scripts | `src/content/` | `leetcode/` and `gfg/` adapters, each with a MAIN-world network observer plus an isolated verifier. `problem-html.ts` extracts the statement, examples and constraints. |
| Service worker | `src/background/` | Message router (sender and payload validation), auth manager (PKCE handoff), persistent job queue (retries, backoff, restart recovery). |
| UI | `src/popup/`, `src/dashboard/`, `src/ui/` | Popup, dashboard (Overview, Activity, Repository, Platforms & languages, General). |
| Backend | `backend/` | Stateless Fastify API: sealed-session auth, repository validation, GitHub sync. No database. |

## Quick start (local)

```bash
npm install
cd backend && npm install && cd ..
```

Then follow [DEPLOYMENT.md → Local development](DEPLOYMENT.md#a-local-development). It covers the GitHub App, `.env`, running the backend, and loading the extension.

### Commands

| Command | What it does |
|---|---|
| `npm run build` | Extension: typecheck → Vite build → content-script IIFE bundles → `dist/` verification (manifest refs, no remote/inline code, secret scan) |
| `npm test` | Extension tests (UI, navigation, settings, adapters, job queue, messaging) |
| `npm run typecheck` | Extension TypeScript (strict) |
| `cd backend && npm run dev` | Backend with live reload |
| `cd backend && npm test` | Backend tests (auth, GitHub sync, security, README/paths) |
| `cd backend && npm run build && npm start` | Production backend bundle |

## Repository layout produced

```
DSA/                                   ← root folder (configurable, may be empty)
  LeetCode/
    Array/                             ← topic folder (or flat layout: no topic level)
      0001-two-sum/
        Python/solution.py
        Cpp/solution.cpp               ← multiple languages are preserved side by side
        README.md
    Database/
      0176-second-highest-salary/
        SQL/solution.sql               ← SQL is a language → .sql
        README.md
  GeeksForGeeks/
    Linked-List/
      reverse-a-linked-list/
        Java/solution.java
        README.md
```

Every path segment is sanitised to `[A-Za-z0-9._-]`. Traversal (`..`), dot-folders (`.github`) and reserved names are rejected. The backend builds every path itself and ignores any path a client sends.

## Duplicate protection

1. **Per submission.** The extension's persistent queue never re-sends a finished submission, and the server suppresses rapid repeats of the same (user, platform, submission id).
2. **Per content.** The backend compares the git blob SHA of the new code with the existing file. Identical code returns `unchanged`.
3. **Changed code** follows your setting: *Update when changed* (default), *Never overwrite*, or *Keep every version* (`solution-<id>.ext`).

## Project structure

```
backend/                stateless Fastify API (src/) and tests
public/manifest.json    MV3 manifest (storage, identity, alarms, notifications)
src/shared/             cross-boundary domain logic + Zod schemas
src/content/            platform adapters (LeetCode, GeeksforGeeks)
src/background/         service worker: router, auth, job queue, API client
src/ui/, src/popup/, src/dashboard/   React UI
scripts/                content-script builder, dist verifier, icon generator
```

## Test status

See the implementation report in the final message of the build session, or run the suites yourself. All suites use mocked platform/GitHub fixtures. The LeetCode adapter's public `question` GraphQL query and the `submissionDetails` field names were checked against leetcode.com. **Authenticated end-to-end runs against LeetCode, GeeksforGeeks and a real GitHub App need your accounts and credentials.** See DEPLOYMENT.md § Testing both platforms.

## Known limitations

- **GeeksforGeeks publishes no API.** The adapter relies on endpoints and fields found in GfG's production web client: `submit/compile`, `submission/submit/result` (`status`, `view_mode`) and `problems/submissions/{id}` (`user_code`, `language`). If GfG changes them, verdicts become `UNKNOWN` and nothing is uploaded; it fails closed. It has not been run against a logged-in GfG account.
- **GfG verification only happens in the tab you submitted from.** There is no known verdict-by-ID endpoint, so if that tab closes before the verdict arrives, the job expires as `UNKNOWN`. LeetCode jobs resume on the next LeetCode page load.
- **LeetCode endpoints are undocumented.** `/check/` and GraphQL can change without notice. The adapter validates every response and fails closed.
- **Premium problems.** For paid-only LeetCode problems you can't access, no statement is included. Nothing is invented.
- **No database, by design (personal use).** There is no server-side session revocation list (Disconnect revokes the GitHub grant instead), and history is per browser. For a public multi-user launch, add Postgres; see DEPLOYMENT.md.
- **Rate limiting and duplicate suppression are in memory**, so they reset on restart. GitHub content-hash checks still prevent duplicate commits.

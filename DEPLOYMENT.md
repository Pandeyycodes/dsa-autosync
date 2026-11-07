# Deploying CodeSync

CodeSync is three pieces:
- the Chrome extension;
- a small **stateless** backend (Fastify, no database) that holds the GitHub App secret;
- a GitHub App.

This guide covers:

- A. Local development
- B. GitHub App configuration
- C. Backend hosting
- D. Installing the extension
- E. Chrome Web Store publishing
- F. Privacy policy
- G. Production checklist

> **Why no database?** CodeSync is set up for personal use. The server seals your GitHub token (AES-256-GCM) into the session token the extension keeps. Your repository choice and history live in the extension. If you later open it to many users, a database (e.g. Neon Postgres) is the better design: it gives server-side session revocation, safe refresh-token rotation and cross-device history.

---

## A. Local development

### A1. Required software

| Tool | Version |
|---|---|
| Node.js | **20.11+** (22 LTS recommended) — <https://nodejs.org>, or `winget install OpenJS.NodeJS.LTS`, or `brew install node@22` |
| Google Chrome | 111+ |
| A GitHub account | — |

### A2. Install dependencies

```bash
npm install
cd backend && npm install && cd ..
```

### A3. Stable extension ID

This gives the unpacked extension a fixed ID, so the backend can allow it:

```bash
node scripts/dev-key.mjs init
```

It prints the ID, for example `fpbhganiebeohkggopmldnpibhfndfbe`. The key file `.dev-extension-key.json` is gitignored and is only applied to local builds.

### A4. Create the GitHub App

Follow section **B** with the callback URL `http://localhost:8787/v1/auth/callback`.

### A5. Configure the backend

```bash
cd backend
cp .env.example .env
npm run keys:generate        # paste the printed TOKEN_ENCRYPTION_KEY into .env
```

Fill in these values in `.env`:
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_CLIENT_SECRET`
- `GITHUB_APP_SLUG`
- `ALLOWED_EXTENSION_IDS` (the ID from A3)

`PUBLIC_URL=http://localhost:8787` is already correct for local use.

### A6. Run the backend

```bash
cd backend
npm run dev
```

It reads `.env` and serves on `http://localhost:8787`. Check that it's up:

```bash
curl http://localhost:8787/healthz
```

### A7. Build and load the extension

```bash
echo "VITE_CODESYNC_API_URL=http://localhost:8787" > .env.local
npm run build
```

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick `dist/`.
4. Check that the card shows the ID from A3.

### A8. Use it

1. Click the CodeSync icon → **Connect GitHub** → approve.
2. Dashboard → **Repository**:
   - Click **Install CodeSync on it** if your repository isn't listed, then click ↻.
   - Pick the repository and branch, then **Save** → **Test write access**.
3. **LeetCode:** submit a correct solution.
   - Dashboard → **Activity** shows *Verifying → Uploaded*; click the commit icon.
   - A wrong answer shows as *Ignored*.
   - A SQL problem lands in `…/Database/…/SQL/solution.sql`.
4. **GeeksforGeeks:** do the same on a `/problems/<slug>/1` page.
   - If it shows *Code unavailable* or *Unknown*, GfG's private web API has changed. Compare the Network tab with `src/content/gfg/adapter.ts`.

### A9. Tests

```bash
npm test && npm run typecheck                         # extension
cd backend && npm test && npx tsc --noEmit            # backend
```

---

## B. GitHub App configuration

1. Go to **GitHub → avatar → Settings → Developer settings → GitHub Apps → New GitHub App**.
2. **Name:** must be globally unique, e.g. `CodeSync-yourname`. Its URL slug becomes `GITHUB_APP_SLUG`.
3. **Homepage URL:** any URL, e.g. your repository.
4. **Callback URL:** `http://localhost:8787/v1/auth/callback` for local use, or `https://<your-backend>/v1/auth/callback` in production. You can add both.
5. **Expire user authorization tokens:** ❌ **uncheck for personal use.**
   - With the stateless backend, non-expiring tokens avoid refresh-token rotation, so you never get logged out unexpectedly.
   - Disconnecting still revokes access instantly.
   - If you leave it checked, the backend refreshes tokens and hands the extension a re-sealed session automatically.
6. **Request user authorization (OAuth) during installation:** ❌ unchecked. CodeSync starts sign-in itself with a sealed `state`.
7. **Device flow:** ❌. **Webhook → Active:** ❌ unchecked.
8. **Permissions:**
   - **Repository → Contents: Read and write**
   - **Metadata: Read-only** (automatic)
   - Nothing else.
9. **Where can it be installed:** **Only on this account**, for personal use.
10. Click **Create GitHub App**, then copy the **Client ID** (`Iv…`) and use **Generate a new client secret**.
11. A private key is **not needed**. Don't generate one.
12. Install it: go to `https://github.com/apps/<slug>` → **Install** → **Only select repositories** → your solutions repository.

---

## C. Backend hosting

The backend is a single stateless Node process. Any host works.

| Option | Cost | Notes |
|---|---|---|
| **Render Web Service** (recommended) | Free tier, or **Starter ~US$7/mo** | Free instances **sleep after ~15 min idle**, so the first request takes ~30–60 s. The extension retries, so syncing still works; it's just slower. HTTPS and `onrender.com` are automatic. |
| Railway / Fly.io | usage-based, a few US$/mo | Same build and start commands |
| Your own PC | free | Only works while your PC is on (`npm run dev`) |

**Render steps:**
1. Push the project to GitHub, sign in to <https://render.com> with GitHub, then **New → Blueprint** and pick the repository. `render.yaml` creates `codesync-api`. Or create it manually: **New → Web Service**:
   - Root directory: *(empty)*
   - Build: `cd backend && npm ci && npm run build`
   - Start: `cd backend && npm start`
   - Health check: `/healthz`
2. Set these environment variables:
   - `NODE_ENV=production`
   - `TRUST_PROXY=true`
   - `PUBLIC_URL=https://<service>.onrender.com`
   - `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_SLUG`
   - `TOKEN_ENCRYPTION_KEY` (a **new** key)
   - `ALLOWED_EXTENSION_IDS`
3. *(Optional)* custom domain: **Settings → Custom Domains** → add a CNAME. The certificate is issued automatically.
4. In the GitHub App, set the **Callback URL** to `${PUBLIC_URL}/v1/auth/callback`.
5. Rebuild the extension against it:

   ```bash
   echo "VITE_CODESYNC_API_URL=https://<service>.onrender.com" > .env.production.local
   npm run build
   ```

6. Verify:

   ```bash
   curl -i https://<service>.onrender.com/healthz   # → 200, strict-transport-security header
   curl -i https://<service>.onrender.com/v1/me     # → 401
   ```

Rotating `TOKEN_ENCRYPTION_KEY` signs everyone out; you just reconnect.

---

## D. Chrome extension installation

1. Run `npm run build`.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick `dist/`.
3. Pin the icon.
4. Connect GitHub, then go to Dashboard → Repository → select the repository → **Save** → **Test write access**.
5. Submit an accepted solution and watch Dashboard → Activity.

After code changes, run `npm run build` again and click ↻ on the extension card.

---

## E. Chrome Web Store publishing (optional)

1. **Register** at <https://chrome.google.com/webstore/devconsole>. There's a one-time **US$5** fee; then verify your contact email.
2. **Package:** rename or remove `.dev-extension-key.json` first (the store rejects a `"key"` field). Then:

   ```bash
   npm run build
   cd dist && zip -r ../codesync.zip . && cd ..
   ```

   On PowerShell instead:

   ```powershell
   Compress-Archive dist\* codesync.zip
   ```

3. **Listing:** name, summary of at most 132 characters, description, category *Developer Tools*, 1–5 screenshots at 1280×800, an optional 440×280 promo tile.
4. **Privacy policy:** host `PRIVACY.md` publicly and paste the URL.
5. **Permissions justification:**

   | Permission | Justification |
   |---|---|
   | `storage` | Settings, sealed session, history |
   | `identity` | GitHub sign-in |
   | `alarms` | Retrying uploads |
   | `notifications` | Optional alerts |
   | Content scripts on leetcode.com and geeksforgeeks.org problem pages | Detect accepted submissions |

   Remote code: **No**.
6. **Data-use disclosures:** authentication info, website content (code and problem metadata), GitHub username. Not sold, not used for unrelated purposes.
7. **Support:** an email or issues URL.
8. **Submit for review.** It typically takes days to a few weeks.
9. **Reviewer feedback:** fix, bump `version` in `public/manifest.json`, upload again, resubmit.
10. **Updates:** bump the version → build → zip → **Upload new package** → submit.
11. After the first upload, add the store's extension ID to `ALLOWED_EXTENSION_IDS`.

---

## F. Privacy policy

See [PRIVACY.md](PRIVACY.md). Keep it in sync with the store's data disclosures.

---

## G. Production checklist

- [ ] `TOKEN_ENCRYPTION_KEY` and `GITHUB_APP_CLIENT_SECRET` exist only in the host's secret settings; `backend/.env` is never committed.
- [ ] `NODE_ENV=production`, `PUBLIC_URL` is `https://…`, `TRUST_PROXY=true`.
- [ ] The GitHub App callback is exactly `${PUBLIC_URL}/v1/auth/callback`; permissions are only Contents (R/W) and Metadata (R); the webhook is inactive.
- [ ] `ALLOWED_EXTENSION_IDS` lists only your extension ID(s).
- [ ] These all pass:
  - `npm run typecheck && npm test && npm run build` (including the dist verifier's secret scan)
  - `cd backend && npm test && npm run build`
  - `npm audit --omit=dev` in both packages
- [ ] **HTTPS:** `curl -I` shows `strict-transport-security`.
- [ ] **Logging:** the host's logs show no query strings or tokens.
- [ ] **Monitoring:** an uptime check on `/healthz`.
- [ ] **Error tracking (optional):** if you add Sentry, scrub request bodies, which contain code and sealed sessions.
- [ ] **Backups:** nothing server-side to back up. Your solutions live in GitHub.
- [ ] The privacy policy is published and matches the store listing.

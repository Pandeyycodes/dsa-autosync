// Sanity-checks the built extension: every file referenced by the manifest
// must exist in dist/, and the HTML pages must not reference remote scripts
// (Manifest V3 forbids remotely hosted code).
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'));

const referenced = new Set([
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  manifest.action?.default_popup,
  manifest.options_ui?.page,
  manifest.background?.service_worker,
  ...(manifest.content_scripts ?? []).flatMap((c) => [...(c.js ?? []), ...(c.css ?? [])]),
]);

const errors = [];
if (manifest.manifest_version !== 3) errors.push('manifest_version must be 3');

for (const file of referenced) {
  if (!file) continue;
  if (!existsSync(resolve(dist, file))) errors.push(`missing file referenced by manifest: ${file}`);
}

for (const page of [manifest.action?.default_popup, manifest.options_ui?.page]) {
  const html = readFileSync(resolve(dist, page), 'utf8');
  if (/<script[^>]+src=["']https?:/i.test(html)) errors.push(`${page} loads a remote script`);
  if (/<script(?![^>]*src)[^>]*>\s*\S/i.test(html)) errors.push(`${page} contains an inline script (blocked by CSP)`);
}

for (const cs of manifest.content_scripts ?? []) {
  for (const js of cs.js ?? []) {
    const src = readFileSync(resolve(dist, js), 'utf8');
    if (/^\s*import\s|\bexport\s*\{/m.test(src)) errors.push(`${js} contains ES module syntax`);
  }
}

// No credentials may ship in the extension bundle.
import { readdirSync, statSync } from 'node:fs';
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(resolve(dir, f)).isDirectory() ? walk(resolve(dir, f)) : [resolve(dir, f)]));
const SECRET_PATTERNS = [
  /gh[opusr]_[A-Za-z0-9]{20,}/, // GitHub tokens
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /client_secret\s*[:=]\s*["'][^"']+["']/i,
  /GITHUB_APP_CLIENT_SECRET|TOKEN_ENCRYPTION_KEY|DATABASE_URL/,
];
for (const file of walk(dist).filter((f) => /\.(js|html|json|css)$/.test(f))) {
  const src = readFileSync(file, 'utf8');
  for (const re of SECRET_PATTERNS) if (re.test(src)) errors.push(`possible secret in ${file.slice(dist.length + 1)} (${re})`);
}

if (errors.length) {
  console.error('✗ dist verification failed:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log(`✓ dist verified — ${referenced.size} manifest references resolved, MV3 constraints OK`);

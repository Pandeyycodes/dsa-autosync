// Gives unpacked dev builds a stable extension ID.
//   node scripts/dev-key.mjs init   → creates .dev-extension-key.json (gitignored) and prints the ID
//   (build step)                    → injects "key" into dist/manifest.json if that file exists
// Store builds: delete/rename .dev-extension-key.json — the Web Store rejects a "key" field.
import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const keyFile = resolve(root, '.dev-extension-key.json');

const idFor = (b64) =>
  [...createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex').slice(0, 32)]
    .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
    .join('');

if (process.argv[2] === 'init') {
  if (!existsSync(keyFile)) {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const key = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    writeFileSync(keyFile, JSON.stringify({ key, id: idFor(key) }, null, 2));
  }
  console.log(JSON.parse(readFileSync(keyFile, 'utf8')).id);
} else if (existsSync(keyFile)) {
  const { key, id } = JSON.parse(readFileSync(keyFile, 'utf8'));
  const mf = resolve(root, 'dist/manifest.json');
  writeFileSync(mf, JSON.stringify({ ...JSON.parse(readFileSync(mf, 'utf8')), key }, null, 2));
  console.log(`✓ dev key applied — extension ID ${id}`);
}

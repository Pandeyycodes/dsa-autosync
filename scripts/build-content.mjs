// Builds each content script as a single self-contained IIFE file.
// Chrome loads content scripts as classic scripts, so they cannot share
// ES-module chunks with the rest of the extension.
import { build } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const entries = [
  { name: "leetcode-hook", entry: "src/content/leetcode/hook.ts" },
  { name: "leetcode", entry: "src/content/leetcode/index.ts" },
  { name: "gfg-hook", entry: "src/content/gfg/hook.ts" },
  { name: "gfg", entry: "src/content/gfg/index.ts" },
];

for (const { name, entry } of entries) {
  await build({
    configFile: false,
    root,
    logLevel: 'warn',
    resolve: { alias: { '@': resolve(root, 'src') } },
    publicDir: false,
    build: {
      outDir: resolve(root, 'dist/content'),
      emptyOutDir: false,
      target: 'chrome110',
      minify: true,
      lib: {
        entry: resolve(root, entry),
        formats: ['iife'],
        name: `CodeSync_${name.replace(/-/g, "_")}`,
        fileName: () => `${name}.js`,
      },
    },
  });
  console.log(`✓ content/${name}.js`);
}

/**
 * Copie l'analyseur statique de balisage vers le serveur MCP (#608).
 *
 *   packages/shared/src/debug/lint-markup.ts      (SOURCE UNIQUE)
 *        |  npm run build:lint-markup
 *        v
 *   mcp-server/src/lint-markup.generated.ts       (commite, NE PAS EDITER)
 *
 * Meme mecanisme et meme raison que `build-skill-matching` : `mcp-server/`
 * est hors des workspaces npm et publie separement, il ne peut importer aucun
 * module du monorepo. C'est ce qui rend structurelle la contrainte « aucun
 * import dans lint-markup.ts » — un import rendrait la copie non compilable.
 *
 * Usage : npx vite-node scripts/build-lint-markup.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildLintCopy } from './lib/lint-markup-copy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const sourcePath = resolve(root, 'packages/shared/src/debug/lint-markup.ts');
const outPath = resolve(root, 'mcp-server/src/lint-markup.generated.ts');

const source = readFileSync(sourcePath, 'utf-8');
writeFileSync(outPath, buildLintCopy(source));

console.log(
  `lint-markup.generated.ts : ${(Buffer.byteLength(source, 'utf-8') / 1024).toFixed(1)} Ko -> ${outPath}`
);

/**
 * Copie le moteur de matching des skills vers le serveur MCP (#514).
 *
 *   packages/shared/src/ia/skill-matching.ts    (SOURCE UNIQUE)
 *        |  npm run build:skill-matching
 *        v
 *   mcp-server/src/skill-matching.generated.ts  (commite, NE PAS EDITER)
 *
 * Pourquoi une copie et pas un import : `mcp-server/` est hors des workspaces
 * npm et publie separement sur npm (`dsfr-data-mcp`), avec ses propres
 * dependances. Il ne peut pas importer un module du monorepo. Le moteur est
 * donc duplique par le build — comme le reste du contrat MCP — et un test
 * (`tests/mcp/skill-matching.test.ts`) verifie que la copie est a jour.
 *
 * C'est ce qui rend la contrainte « aucun import dans skill-matching.ts »
 * structurelle : un import rendrait la copie non compilable cote MCP.
 *
 * Usage : npx vite-node scripts/build-skill-matching.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildCopy } from './lib/skill-matching-copy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const sourcePath = resolve(root, 'packages/shared/src/ia/skill-matching.ts');
const outPath = resolve(root, 'mcp-server/src/skill-matching.generated.ts');

const source = readFileSync(sourcePath, 'utf-8');

writeFileSync(outPath, buildCopy(source));

console.log(
  `skill-matching.generated.ts : ${(Buffer.byteLength(source, 'utf-8') / 1024).toFixed(1)} Ko -> ${outPath}`
);

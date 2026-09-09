/**
 * Extrait le contrat des composants depuis le manifeste genere (#608).
 *
 *   packages/core/custom-elements.json          (genere par build:cem)
 *        |  npm run build:component-contract
 *        v
 *   mcp-server/src/component-contract.generated.ts  (commite, NE PAS EDITER)
 *
 * Meme raison que skill-matching : `mcp-server/` est hors des workspaces npm
 * et ne peut importer aucun module du monorepo. Le contrat est donc duplique
 * par le build, et un test verifie que la copie est a jour.
 *
 * L'interet d'extraire plutot que d'ecrire a la main : la liste des attributs
 * vient du CODE. Un attribut ajoute a un composant apparait ici sans que
 * personne n'y pense ; a l'inverse, une liste manuelle derive en silence et
 * le linter se met a signaler des attributs parfaitement valides.
 *
 * Usage : npx vite-node scripts/build-component-contract.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

interface CemAttribute {
  name?: string;
  deprecated?: boolean | string;
}
interface CemDeclaration {
  tagName?: string;
  attributes?: CemAttribute[];
}
interface CemModule {
  declarations?: CemDeclaration[];
}

const cem = JSON.parse(
  readFileSync(resolve(root, 'packages/core/custom-elements.json'), 'utf-8')
) as { modules?: CemModule[] };

const contract: Record<string, { attributes: string[]; deprecated?: Record<string, string> }> = {};

for (const mod of cem.modules ?? []) {
  for (const decl of mod.declarations ?? []) {
    if (!decl.tagName) continue;
    const attributes: string[] = [];
    const deprecated: Record<string, string> = {};
    for (const attr of decl.attributes ?? []) {
      if (!attr.name) continue;
      if (attr.deprecated) {
        deprecated[attr.name] =
          typeof attr.deprecated === 'string' ? attr.deprecated : 'attribut deprecie';
      } else {
        attributes.push(attr.name);
      }
    }
    contract[decl.tagName] = Object.keys(deprecated).length
      ? { attributes: attributes.sort(), deprecated }
      : { attributes: attributes.sort() };
  }
}

const tags = Object.keys(contract).sort();
const body = `/**
 * FICHIER GENERE — NE PAS EDITER A LA MAIN.
 *
 * Source : packages/core/custom-elements.json (lui-meme genere depuis le code).
 * Regeneration : npm run build:component-contract
 *
 * ${tags.length} balises, ${Object.values(contract).reduce((n, c) => n + c.attributes.length, 0)} attributs.
 */

export const COMPONENT_CONTRACT = ${JSON.stringify(
  Object.fromEntries(tags.map((t) => [t, contract[t]])),
  null,
  2
)} as const;
`;

const outPath = resolve(root, 'mcp-server/src/component-contract.generated.ts');
writeFileSync(outPath, body);
console.log(
  `component-contract.generated.ts : ${tags.length} balises, ${(Buffer.byteLength(body, 'utf-8') / 1024).toFixed(1)} Ko -> ${outPath}`
);

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
 * Enumerations (#1111) : le manifeste ne porte que le TEXTE du type d'un
 * attribut, souvent un alias (`PopupMode`, `DSFRChartType`) qu'il ne resout
 * pas. Le type est donc relu dans le CODE par le verificateur de types de
 * TypeScript : un attribut dont le type est une union FERMEE de litteraux de
 * chaine (`'popup' | 'modal' | …`, `undefined`/`null` exceptes) recoit la
 * liste de ses valeurs. Une union ouverte (`'horizontal' | string`) n'en recoit
 * pas : toute valeur y est acceptee. Le lint de balisage et le bloc « composant
 * libre » du Studio refusent une valeur hors liste.
 *
 * Champs (#1141) : un attribut dont le JSDoc porte `@champ <grammaire>`
 * designe un champ des donnees (le plugin `champsDesDonnees` de
 * `custom-elements-manifest.config.mjs` le reporte sur l'attribut du manifeste,
 * cle `champ`). Le contrat recoit `fields: { attribut: grammaire }` (attributs
 * retires compris : ils lisent encore un champ), et la meme table est ecrite
 * dans `packages/shared/src/debug/field-attrs.generated.ts`, d'ou le
 * diagnostic (`FIELD_ATTRS`) et le bloc libre du Studio la lisent. Une seule
 * source : le JSDoc du composant.
 *
 * Usage : npx vite-node scripts/build-component-contract.ts
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

interface CemAttribute {
  name?: string;
  deprecated?: boolean | string;
  fieldName?: string;
  /** Grammaire du champ designe (`@champ`, #1141). */
  champ?: string;
}
interface CemDeclaration {
  name?: string;
  tagName?: string;
  attributes?: CemAttribute[];
}
interface CemModule {
  path?: string;
  declarations?: CemDeclaration[];
}

const cem = JSON.parse(
  readFileSync(resolve(root, 'packages/core/custom-elements.json'), 'utf-8')
) as { modules?: CemModule[] };

interface TagContractOut {
  attributes: string[];
  deprecated?: Record<string, string>;
  enums?: Record<string, string[]>;
  fields?: Record<string, string>;
}

const contract: Record<string, TagContractOut> = {};

// --- Types des attributs, relus dans le code (#1111) ------------------------

// Les fichiers des composants, lus dans le depot (et non construits depuis
// les chemins du manifeste : aucun chemin ne vient d'une donnee lue).
const dossierComposants = resolve(root, 'packages/core/src/components');
const modulePaths = readdirSync(dossierComposants)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => `${dossierComposants}/${f}`);
const program = ts.createProgram(modulePaths, {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  experimentalDecorators: true,
  useDefineForClassFields: false,
  skipLibCheck: true,
  noEmit: true,
});
const checker = program.getTypeChecker();

/** Classe declaree `name` dans le module du manifeste `path` (chemin relatif au depot). */
function classeDe(path: string, name: string): ts.ClassDeclaration | undefined {
  const sf = program.getSourceFiles().find((f) => f.fileName.endsWith(`/${path}`));
  if (!sf) return undefined;
  let trouvee: ts.ClassDeclaration | undefined;
  sf.forEachChild((n) => {
    if (ts.isClassDeclaration(n) && n.name?.text === name) trouvee = n;
  });
  return trouvee;
}

/**
 * Valeurs d'une union FERMEE de litteraux de chaine, ou null (type ouvert,
 * nombre, booleen, chaine libre).
 */
function valeursEnumerees(type: ts.Type): string[] | null {
  const membres = (type.isUnion() ? type.types : [type]).filter(
    (t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null))
  );
  if (membres.length < 2) return null;
  const valeurs: string[] = [];
  for (const t of membres) {
    if (!t.isStringLiteral()) return null;
    valeurs.push(t.value);
  }
  return valeurs;
}

/** Enumerations des attributs d'une declaration, par nom d'attribut. */
function enumerationsDe(mod: CemModule, decl: CemDeclaration): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!mod.path || !decl.name) return out;
  const classe = classeDe(mod.path, decl.name);
  if (!classe) return out;
  const type = checker.getTypeAtLocation(classe);
  for (const attr of decl.attributes ?? []) {
    if (!attr.name || !attr.fieldName || attr.deprecated) continue;
    const prop = type.getProperty(attr.fieldName);
    const lieu = prop?.valueDeclaration ?? prop?.declarations?.[0];
    if (!prop || !lieu) continue;
    const valeurs = valeursEnumerees(checker.getTypeOfSymbolAtLocation(prop, lieu));
    if (valeurs) out[attr.name] = valeurs;
  }
  return out;
}

for (const mod of cem.modules ?? []) {
  for (const decl of mod.declarations ?? []) {
    if (!decl.tagName) continue;
    const attributes: string[] = [];
    const deprecated: Record<string, string> = {};
    const fields: Record<string, string> = {};
    for (const attr of decl.attributes ?? []) {
      if (!attr.name) continue;
      if (attr.champ) fields[attr.name] = attr.champ;
      if (attr.deprecated) {
        deprecated[attr.name] =
          typeof attr.deprecated === 'string' ? attr.deprecated : 'attribut deprecie';
      } else {
        attributes.push(attr.name);
      }
    }
    const enums = enumerationsDe(mod, decl);
    const out: TagContractOut = { attributes: attributes.sort() };
    if (Object.keys(deprecated).length) out.deprecated = deprecated;
    if (Object.keys(enums).length) {
      out.enums = Object.fromEntries(
        Object.keys(enums)
          .sort()
          .map((k) => [k, enums[k]])
      );
    }
    if (Object.keys(fields).length) {
      out.fields = Object.fromEntries(
        Object.keys(fields)
          .sort()
          .map((k) => [k, fields[k]])
      );
    }
    contract[decl.tagName] = out;
  }
}

const tags = Object.keys(contract).sort();
const body = `/**
 * FICHIER GENERE — NE PAS EDITER A LA MAIN.
 *
 * Source : packages/core/custom-elements.json (lui-meme genere depuis le code).
 * Regeneration : npm run build:component-contract
 *
 * ${tags.length} balises, ${Object.values(contract).reduce((n, c) => n + c.attributes.length, 0)} attributs, ${Object.values(contract).reduce((n, c) => n + Object.keys(c.enums ?? {}).length, 0)} enumerations, ${Object.values(contract).reduce((n, c) => n + Object.keys(c.fields ?? {}).length, 0)} attributs-champs.
 */

export const COMPONENT_CONTRACT = ${JSON.stringify(
  Object.fromEntries(tags.map((t) => [t, contract[t]])),
  null,
  2
)} as const;
`;

const outPath = resolve(root, 'mcp-server/src/component-contract.generated.ts');
writeFileSync(outPath, body);
// --- Table des attributs-champs pour le diagnostic et le Studio (#1141) ----

const champs = Object.fromEntries(
  tags.filter((t) => contract[t].fields).map((t) => [t, contract[t].fields])
);
const champsBody = `/**
 * FICHIER GENERE — NE PAS EDITER A LA MAIN.
 *
 * Attributs qui designent un champ des donnees, par balise, et la grammaire de
 * leur valeur (#1141). Source : le tag JSDoc \`@champ <grammaire>\` des
 * composants (packages/core/src/components), relu dans le manifeste.
 * Regeneration : npm run build:component-contract (inclus dans build:skills).
 */

export const CHAMPS_DES_COMPOSANTS = ${JSON.stringify(champs, null, 2)} as const;
`;
const champsPath = resolve(root, 'packages/shared/src/debug/field-attrs.generated.ts');
writeFileSync(champsPath, champsBody);

console.log(
  `component-contract.generated.ts : ${tags.length} balises, ${(Buffer.byteLength(body, 'utf-8') / 1024).toFixed(1)} Ko -> ${outPath}`
);

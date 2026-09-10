/**
 * Genere les tableaux d'attributs des pages `specs/components/*.html` depuis le
 * custom-elements manifest.
 *
 * Probleme resolu : les tableaux d'attributs des pages specs etaient saisis a la
 * main. Ils derivaient silencieusement du code — l'audit du 2026-09-10 a trouve
 * 13 attributs absents des specs, dont les trois attributs de discretisation
 * choroplethe et la totalite de `dsfr-data-map-legend`.
 *
 * Principe : le REGROUPEMENT thematique reste editorial (c'est la valeur des
 * pages : « Heatmap », « Clustering », « Zoom et viewport »...), mais le CONTENU
 * des lignes (type, defaut, description) est genere, et l'EXHAUSTIVITE est
 * verifiee. Un attribut ajoute au code sans etre range dans une section fait
 * echouer la generation, avec le nom de l'attribut orphelin.
 *
 * Balisage attendu dans les pages :
 *
 *   <!-- ATTRS:dsfr-data-map-layer fields="source,lat-field,lon-field" -->
 *   ...lignes generees...
 *   <!-- /ATTRS -->
 *
 * Chaque bloc rend un `<tr>` par attribut, dans l'ordre declare par `fields`.
 * Le nombre de colonnes est deduit du `<thead>` de la table englobante :
 * 3 colonnes = Attribut/Type/Description, 4 = Attribut/Type/Defaut/Description.
 *
 * Usage : npx vite-node scripts/build-specs-tables.ts [--check]
 *   --check : ne recrit rien, sort en erreur si un fichier n'est pas a jour (CI).
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { escapeText } from '@dsfr-data/shared';
import type { CemManifest } from './lib/cem-reference.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const specsDir = resolve(root, 'specs/components');
const checkOnly = process.argv.includes('--check');

// ---------------------------------------------------------------------------
// Index du manifeste
// ---------------------------------------------------------------------------

interface Attr {
  name: string;
  type: string;
  default: string;
  description: string;
}

function indexManifest(manifest: CemManifest): Record<string, Map<string, Attr>> {
  const out: Record<string, Map<string, Attr>> = {};
  for (const mod of manifest.modules) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName || !decl.attributes) continue;
      const map = new Map<string, Attr>();
      for (const a of decl.attributes) {
        map.set(a.name, {
          name: a.name,
          type: a.type?.text ?? '',
          default: a.default ?? '',
          description: (a.description ?? '').replace(/\s+/g, ' ').trim(),
        });
      }
      out[decl.tagName] = map;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rendu d'une ligne
// ---------------------------------------------------------------------------

/**
 * Le JSDoc utilise des backticks pour le code ; les pages specs utilisent
 * <code>. On convertit, en echappant le reste.
 */
function renderDescription(text: string): string {
  return text
    .split(/`([^`]+)`/)
    .map((chunk, i) => (i % 2 === 1 ? `<code>${escapeText(chunk)}</code>` : escapeText(chunk)))
    .join('');
}

/** Type TS -> libelle de colonne lisible (String, Number, Boolean, valeurs...). */
function renderType(type: string): string {
  const t = type.replace(/\s*\|\s*(undefined|null)\b/g, '').trim();
  if (/^boolean$/i.test(t)) return 'Boolean';
  if (/^number$/i.test(t)) return 'Number';
  if (/^string$/i.test(t)) return 'String';
  // union de litteraux : on rend les valeurs, c'est plus utile que « String »
  const lits = [...t.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  if (lits.length > 1) return lits.map((v) => `<code>${escapeText(v || '""')}</code>`).join(' · ');
  return escapeText(t) || 'String';
}

function renderDefault(raw: string): string {
  if (!raw) return '—';
  const v = raw.trim();
  if (v === "''" || v === '""') return '<code>""</code>';
  return `<code>${escapeText(v.replace(/^['"]|['"]$/g, ''))}</code>`;
}

function renderRow(a: Attr, cols: number, indent: string, editorial?: string): string {
  const third = editorial !== undefined ? editorial : renderDefault(a.default);
  const cells = [
    `<td><code>${a.name}</code></td>`,
    `<td>${renderType(a.type)}</td>`,
    ...(cols >= 4 ? [`<td>${third}</td>`] : []),
    `<td>${renderDescription(a.description)}</td>`,
  ];
  return `${indent}<tr>${cells.join('')}</tr>`;
}

/** Cellules editoriales (3e colonne) des lignes deja presentes, indexees par attribut. */
function previousEditorial(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(
    /<tr><td><code>([a-z][a-z0-9-]*)<\/code><\/td>((?:<td>[\s\S]*?<\/td>)+)<\/tr>/g
  )) {
    const cells = m[2].match(/<td>[\s\S]*?<\/td>/g) ?? [];
    if (cells.length >= 3) out.set(m[1], cells[1].replace(/^<td>|<\/td>$/g, ''));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Traitement d'une page
// ---------------------------------------------------------------------------

const BLOCK =
  /([ \t]*)<!-- ATTRS:([a-z0-9-]+)((?:\s+[\w-]+="[^"]*")*)\s*-->([\s\S]*?)<!-- \/ATTRS -->/g;

/**
 * Attributs volontairement documentes HORS table (note de bas de tableau, prose) :
 *
 *   <!-- ATTRS-PROSE:dsfr-data-kpi fields="valeur,icone" -->
 *
 * Ils comptent comme couverts pour le controle d'exhaustivite, sans generer de
 * ligne. Sert aux alias francais deprecies, regroupes en une phrase.
 */
const PROSE = /<!-- ATTRS-PROSE:([a-z0-9-]+)\s+fields="([^"]*)"\s*-->/g;

/**
 * Forme de la table qui contient l'offset donne.
 *
 * `editorialCol` : certaines pages ont une 3e colonne « Format / Valeurs » qui
 * porte des exemples rediges, non derivables du manifeste. Elle est PRESERVEE
 * telle quelle ligne a ligne ; seuls le type et la description sont generes.
 */
function shapeAt(html: string, offset: number): { cols: number; editorialCol: boolean } {
  const before = html.slice(0, offset);
  const head = before.lastIndexOf('<thead');
  if (head === -1) return { cols: 4, editorialCol: false };
  const seg = html.slice(head, html.indexOf('</thead>', head));
  const ths = [...seg.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1].trim());
  return { cols: ths.length || 4, editorialCol: ths.length >= 4 && ths[2] !== 'Défaut' };
}

interface Problem {
  file: string;
  message: string;
}

function processFile(
  file: string,
  index: Record<string, Map<string, Attr>>,
  problems: Problem[]
): { html: string; changed: boolean; blocks: number } {
  const path = join(specsDir, file);
  const original = readFileSync(path, 'utf-8');
  const assigned: Record<string, Set<string>> = {};
  let blocks = 0;

  for (const m of original.matchAll(PROSE)) {
    const [, tag, list] = m;
    assigned[tag] ??= new Set();
    for (const f of list
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)) {
      if (!index[tag]?.has(f)) {
        problems.push({
          file,
          message: `${tag} : alias « ${f} » declare en prose mais absent du code`,
        });
      }
      assigned[tag].add(f);
    }
  }

  const html = original.replace(BLOCK, (match, indent, tag, attrs, _body, offset) => {
    blocks++;
    const attrsMap = index[tag];
    if (!attrsMap) {
      problems.push({ file, message: `tag inconnu du manifeste : ${tag}` });
      return match;
    }
    const fields = (/fields="([^"]*)"/.exec(attrs)?.[1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    assigned[tag] ??= new Set();
    const rows: string[] = [];
    const { cols, editorialCol } = shapeAt(original, offset as number);
    const kept = editorialCol ? previousEditorial(_body as string) : new Map<string, string>();
    for (const f of fields) {
      const a = attrsMap.get(f);
      if (!a) {
        problems.push({ file, message: `${tag} : l'attribut « ${f} » n'existe plus dans le code` });
        continue;
      }
      if (assigned[tag].has(f)) {
        problems.push({ file, message: `${tag} : « ${f} » range dans deux sections` });
      }
      assigned[tag].add(f);
      let editorial: string | undefined;
      if (editorialCol) {
        editorial = kept.get(f);
        if (editorial === undefined) {
          editorial = '—';
          problems.push({
            file,
            message: `${tag} : « ${f} » ajoute dans une table a colonne editoriale — remplir la 3e cellule a la main`,
          });
        }
      }
      rows.push(renderRow(a, cols, `${indent}  `, editorial));
    }
    return `${indent}<!-- ATTRS:${tag}${attrs} -->\n${rows.join('\n')}\n${indent}<!-- /ATTRS -->`;
  });

  // Exhaustivite : tout attribut du code doit etre range quelque part
  for (const [tag, seen] of Object.entries(assigned)) {
    const missing = [...index[tag].keys()].filter((a) => !seen.has(a));
    if (missing.length) {
      problems.push({
        file,
        message: `${tag} : ${missing.length} attribut(s) non range(s) dans une section — ${missing.join(', ')}`,
      });
    }
  }

  return { html, changed: html !== original, blocks };
}

// ---------------------------------------------------------------------------
// Passe 2 — coloration syntaxique des blocs de code
//
// Les 95 blocs `<div class="code-block"><pre>` contiennent du markup HTML
// echappe. Plutot qu'un coloriseur au runtime (dependance + JS sur chaque page
// de doc), les tokens sont poses au build sous forme de <span class="tok-*">,
// stylees une seule fois dans packages/app-ui/src/app-layout-demo.ts.
//
// La passe est idempotente : les spans existants sont retires avant re-tokenisation.
// ---------------------------------------------------------------------------

/** Retire les spans poses par une execution precedente (ils ne s'imbriquent jamais). */
function stripTokens(code: string): string {
  let out = code;
  let prev: string;
  do {
    prev = out;
    out = out.replace(/<span class="tok-[a-z]+">([\s\S]*?)<\/span>/g, '$1');
  } while (out !== prev);
  return out;
}

const TOKENS =
  /(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?)([a-zA-Z][\w:-]*)|([a-zA-Z_][\w:-]*)(=)("[^"]*")|(\/?&gt;)/g;

function highlight(code: string): string {
  return stripTokens(code).replace(TOKENS, (m, comment, open, tag, attr, eq, value, close) => {
    if (comment) return `<span class="tok-comment">${comment}</span>`;
    if (tag) return `<span class="tok-punct">${open}</span><span class="tok-tag">${tag}</span>`;
    if (attr) {
      return (
        `<span class="tok-attr">${attr}</span><span class="tok-punct">${eq}</span>` +
        `<span class="tok-string">${value}</span>`
      );
    }
    if (close) return `<span class="tok-punct">${close}</span>`;
    return m;
  });
}

const CODE_BLOCK = /(<div class="code-block"><pre>)([\s\S]*?)(<\/pre>)/g;

function highlightFile(file: string): boolean {
  const path = join(specsDir, file);
  const original = readFileSync(path, 'utf-8');
  const html = original.replace(
    CODE_BLOCK,
    (_m, open, code, close) => open + highlight(code) + close
  );
  if (html === original) return false;
  if (!checkOnly) writeFileSync(path, html);
  return true;
}

// ---------------------------------------------------------------------------

const manifest = JSON.parse(
  readFileSync(resolve(root, 'packages/core/custom-elements.json'), 'utf-8')
) as CemManifest;
const index = indexManifest(manifest);
if (Object.keys(index).length === 0) {
  throw new Error('Manifeste vide. Lancer "npm run build:cem" d\'abord.');
}

const problems: Problem[] = [];
const stale: string[] = [];
let touched = 0;
let totalBlocks = 0;

for (const file of readdirSync(specsDir).filter((f) => f.endsWith('.html'))) {
  const { html, changed, blocks } = processFile(file, index, problems);
  totalBlocks += blocks;
  if (blocks && changed) {
    if (checkOnly) stale.push(file);
    else {
      writeFileSync(join(specsDir, file), html);
      touched++;
    }
  }
  // Passe 2 : coloration, sur toutes les pages (meme celles sans table generee)
  if (highlightFile(file) && checkOnly && !stale.includes(file)) stale.push(file);
}

// Les descriptions viennent du JSDoc : signaler celles qui sont de-accentuees,
// sinon `npm run check:accents` echouera sur du contenu genere (donc non
// corrigeable dans la page — il faut corriger le JSDoc du composant).
const DEACCENTED =
  /\b(donnees|telechargement|telecharge|complement|elements?|defaut|requetes?|declenchement|numero|separees?|separes?|separateur|parametres?|utilisees?|derniere|premiere|associees?|generees?|categorie|proprietes?|libelles?|decimales|references?|periode|apres|deja|operateurs?|coordonnees|methode|memoire|resultats|chaines?)\b/i;
const deaccented: string[] = [];
for (const [tag, attrs] of Object.entries(index)) {
  for (const a of attrs.values()) {
    // Le code entre backticks (noms d'attributs, exemples) n'a pas a etre accentue :
    // on ne teste que la prose.
    const prose = a.description.replace(/`[^`]*`/g, ' ');
    if (prose && DEACCENTED.test(prose)) deaccented.push(`${tag} / ${a.name}`);
  }
}

console.log(`Blocs <!-- ATTRS --> traites : ${totalBlocks}`);
if (checkOnly) {
  if (stale.length) {
    console.error(`\n✗ Pages non a jour (relancer npm run build:specs-tables) :`);
    stale.forEach((f) => console.error(`  ${f}`));
  } else {
    console.log('✓ Pages a jour.');
  }
} else {
  console.log(`Pages reecrites : ${touched}`);
}

if (deaccented.length) {
  console.warn(
    `\n⚠ ${deaccented.length} description(s) JSDoc de-accentuee(s) — a corriger dans packages/core/src/components/,\n  sinon check:accents echouera sur le contenu genere :`
  );
  deaccented.slice(0, 10).forEach((d) => console.warn(`  ${d}`));
  if (deaccented.length > 10) console.warn(`  ... et ${deaccented.length - 10} autre(s)`);
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} probleme(s) :`);
  problems.forEach((p) => console.error(`  [${p.file}] ${p.message}`));
  process.exit(1);
}
if (checkOnly && stale.length) process.exit(1);

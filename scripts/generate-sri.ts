/**
 * Génère les attributs Subresource Integrity (SRI) sur les tags <script src>
 * et <link href> de tous les `*.html` du repo qui pointent vers un CDN connu.
 *
 * Usage :
 *   npm run generate-sri          # écrit les modifs
 *   npm run check:sri             # dry-run, exit 1 si MAJ nécessaire
 *
 * Fonctionnement :
 *   1. Parcourt récursivement le repo (ignore node_modules, dist, app-dist,
 *      coverage, .git, packages/core/dist).
 *   2. Pour chaque tag <script src="..."> ou <link href="..."> qui :
 *        - pointe vers un CDN de la whitelist (cdn.jsdelivr.net, unpkg.com)
 *        - n'a pas déjà d'attribut `integrity=`
 *      → fetch le fichier, calcule `sha384(base64)`, injecte
 *        `integrity="sha384-…" crossorigin="anonymous"`.
 *   3. Idempotent : une 2e passe ne change rien.
 *
 * Prérequis : toutes les versions CDN doivent être figées (pas de `@latest`,
 * pas de range). Un bump de version invalide le hash et casse la prod — il
 * faut donc relancer ce script après chaque bump.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, join } from 'node:path';

const CDN_WHITELIST = [/^https:\/\/cdn\.jsdelivr\.net\//, /^https:\/\/unpkg\.com\//];

const FLOATING_VERSION_RE = /\/npm\/[^@]+@\d+(?:\/|$)/;

const SCRIPT_TAG_RE = /<script\b([^>]*?)\bsrc="(https:\/\/[^"]+)"([^>]*?)>/g;
const LINK_TAG_RE = /<link\b([^>]*?)\bhref="(https:\/\/[^"]+)"([^>]*?)>/g;

const ROOT = resolve(import.meta.dirname, '..');
const CHECK = process.argv.includes('--check');

type HashResult = { url: string; integrity: string };

const cache = new Map<string, string>();

async function fetchIntegrity(url: string): Promise<string | null> {
  const cached = cache.get(url);
  if (cached) return cached;

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  [skip] ${url} → HTTP ${res.status}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const integrity = `sha384-${createHash('sha384').update(buf).digest('base64')}`;
  cache.set(url, integrity);
  return integrity;
}

function isCdn(url: string): boolean {
  if (!CDN_WHITELIST.some((re) => re.test(url))) return false;
  // Les URLs avec un major-only (@0, @1…) résolvent dynamiquement vers la
  // dernière mineur/patch : tout bump invalide le hash. Les exclure.
  if (FLOATING_VERSION_RE.test(url)) return false;
  return true;
}

function hasIntegrity(attrs: string): boolean {
  return /\bintegrity="/.test(attrs);
}

function injectIntegrityAttrs(existingAttrs: string, integrity: string): string {
  const trimmed = existingAttrs.trimEnd();
  const crossorigin = /\bcrossorigin=/.test(existingAttrs) ? '' : ' crossorigin="anonymous"';
  return `${trimmed} integrity="${integrity}"${crossorigin}`;
}

async function processFile(path: string): Promise<{ changed: boolean; updates: HashResult[] }> {
  const original = readFileSync(path, 'utf-8');
  const updates: HashResult[] = [];
  const replacements: Array<{ start: number; end: number; replacement: string }> = [];

  async function collect(re: RegExp, tagName: 'script' | 'link', urlAttr: 'src' | 'href') {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(original)) !== null) {
      const [full, pre, url, post] = m;
      if (!isCdn(url) || hasIntegrity(pre + post)) continue;

      const integrity = await fetchIntegrity(url);
      if (integrity === null) continue;
      const newAttrs = injectIntegrityAttrs(`${pre}${urlAttr}="${url}"${post}`, integrity);
      const replacement = `<${tagName}${newAttrs}>`;
      replacements.push({ start: m.index, end: m.index + full.length, replacement });
      updates.push({ url, integrity });
    }
  }

  await collect(SCRIPT_TAG_RE, 'script', 'src');
  await collect(LINK_TAG_RE, 'link', 'href');

  if (replacements.length === 0) return { changed: false, updates };

  replacements.sort((a, b) => b.start - a.start);
  let updated = original;
  for (const { start, end, replacement } of replacements) {
    updated = updated.slice(0, start) + replacement + updated.slice(end);
  }

  if (!CHECK) writeFileSync(path, updated);
  return { changed: true, updates };
}

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'app-dist',
  'coverage',
  '.cache',
  '.vite',
  '.turbo',
  '.changeset',
]);

function walkHtml(dir: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walkHtml(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
}

async function main() {
  const files: string[] = [];
  walkHtml(ROOT, files);
  files.sort();

  let totalUpdates = 0;
  let changedFiles = 0;
  for (const file of files) {
    const { changed, updates } = await processFile(file);
    if (changed) {
      changedFiles++;
      totalUpdates += updates.length;
      const rel = relative(ROOT, file);
      console.log(`${CHECK ? '[check] ' : ''}${rel} — ${updates.length} tag(s) MAJ`);
    }
  }

  console.log(
    `\n${CHECK ? '[check] ' : ''}${totalUpdates} tag(s) ${CHECK ? 'à mettre à jour' : 'mis à jour'} dans ${changedFiles} fichier(s).`
  );

  if (CHECK && totalUpdates > 0) {
    console.error(
      '\nERREUR : des tags CDN sont sans SRI. Lancer `npm run generate-sri` et committer.'
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

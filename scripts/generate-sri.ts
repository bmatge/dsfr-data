/**
 * Génère les attributs Subresource Integrity (SRI) sur les tags <script src>
 * et <link href> des `apps/** /*.html` qui pointent vers des CDN connus.
 *
 * Usage :
 *   npx tsx scripts/generate-sri.ts          # écrit les modifs
 *   npx tsx scripts/generate-sri.ts --check  # dry-run, exit 1 si MAJ nécessaire
 *
 * Fonctionnement :
 *   1. Parcourt tous les `apps/ ** /*.html`.
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
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { glob } from 'node:fs/promises';

const CDN_WHITELIST = [/^https:\/\/cdn\.jsdelivr\.net\//, /^https:\/\/unpkg\.com\//];

const SCRIPT_TAG_RE = /<script\b([^>]*?)\bsrc="(https:\/\/[^"]+)"([^>]*?)>/g;
const LINK_TAG_RE = /<link\b([^>]*?)\bhref="(https:\/\/[^"]+)"([^>]*?)>/g;

const ROOT = resolve(import.meta.dirname, '..');
const CHECK = process.argv.includes('--check');

type HashResult = { url: string; integrity: string };

const cache = new Map<string, string>();

async function fetchIntegrity(url: string): Promise<string> {
  const cached = cache.get(url);
  if (cached) return cached;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Fetch ${url} → HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const integrity = `sha384-${createHash('sha384').update(buf).digest('base64')}`;
  cache.set(url, integrity);
  return integrity;
}

function isCdn(url: string): boolean {
  return CDN_WHITELIST.some((re) => re.test(url));
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

async function main() {
  const files: string[] = [];
  for await (const f of glob('apps/**/*.html', { cwd: ROOT })) {
    if (f.includes('/dist/') || f.includes('/node_modules/')) continue;
    files.push(resolve(ROOT, f));
  }
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

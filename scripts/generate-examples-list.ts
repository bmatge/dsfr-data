/**
 * Generate guide/examples/_list.json from HTML files in guide/examples/.
 * Run this as part of the build process or manually after adding new examples.
 *
 * Usage: npx tsx scripts/generate-examples-list.ts
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(__dirname, '..', 'guide', 'examples');
const outputPath = resolve(examplesDir, '_list.json');

if (!existsSync(examplesDir)) {
  console.log('guide/examples/ does not exist, skipping.');
  process.exit(0);
}

const files: { file: string; title: string }[] = [];

for (const f of readdirSync(examplesDir)) {
  if (!f.endsWith('.html')) continue;
  let title = f.replace(/\.html$/, '').replace(/[-_]/g, ' ');
  try {
    const content = readFileSync(resolve(examplesDir, f), 'utf-8');
    const m = content.match(/<title>([^<]+)<\/title>/i);
    if (m) title = m[1].trim();
  } catch { /* ignore */ }
  files.push({ file: f, title });
}

files.sort((a, b) => a.title.localeCompare(b.title, 'fr'));

writeFileSync(outputPath, JSON.stringify(files, null, 2) + '\n');
console.log(`Generated ${outputPath} with ${files.length} example(s).`);

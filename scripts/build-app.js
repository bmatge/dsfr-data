/**
 * Script de build pour l'application Tauri
 * Copie les fichiers HTML, apps et assets dans le dossier app-dist
 *
 * Structure de sortie :
 *   app-dist/
 *     index.html          (hub page)
 *     dist/               (dsfr-data library)
 *     demo/               (demo pages)
 *     favoris.html         (redirect -> apps/favorites/)
 *     builder.html         (redirect -> apps/builder/)
 *     builderIA.html       (redirect -> apps/builder-ia/)
 *     playground.html      (redirect -> apps/playground/)
 *     sources.html         (redirect -> apps/sources/)
 *     apps/
 *       favorites/         (built app)
 *       playground/
 *       sources/
 *       builder-ia/
 *       builder/
 */

import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'app-dist');

// Nettoyer le dossier de destination
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}
mkdirSync(distDir, { recursive: true });

// Copy root index.html (hub page)
console.log('Copying root files...');
const rootFiles = ['index.html'];
for (const file of rootFiles) {
  const src = join(rootDir, file);
  const dest = join(distDir, file);
  if (existsSync(src)) {
    cpSync(src, dest);
    console.log(`  + ${file}`);
  }
}

// Favicons DSFR Marianne : dépose à la racine de app-dist/ pour que nginx
// les serve à /favicon.ico et /favicon/... (et pas à /public/favicon/...).
const faviconIco = join(rootDir, 'public/favicon.ico');
if (existsSync(faviconIco)) {
  cpSync(faviconIco, join(distDir, 'favicon.ico'));
  console.log('  + favicon.ico');
}
const faviconDir = join(rootDir, 'public/favicon');
if (existsSync(faviconDir)) {
  cpSync(faviconDir, join(distDir, 'favicon'), { recursive: true });
  console.log('  + favicon/');
}

// Copy core directories
console.log('\nCopying core directories...');
const directories = ['specs', 'guide'];

// Copy library dist from packages/core/dist
const coreDistSrc = join(rootDir, 'packages/core/dist');
const coreDistDest = join(distDir, 'dist');
if (existsSync(coreDistSrc)) {
  cpSync(coreDistSrc, coreDistDest, { recursive: true });
  console.log('  + dist/ (from packages/core/dist/)');
} else {
  console.log('  - dist/ (packages/core/dist not found)');
}
for (const dir of directories) {
  const src = join(rootDir, dir);
  const dest = join(distDir, dir);
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
    console.log(`  + ${dir}/`);
  } else {
    console.log(`  - ${dir}/ (not found)`);
  }
}

// Copy built apps
console.log('\nCopying built apps...');
const apps = [
  'favorites',
  'playground',
  'sources',
  'builder-ia',
  'builder',
  'builder-carto',
  'dashboard',
  'monitoring',
  'admin',
  'pipeline-helper',
];
for (const app of apps) {
  const appDist = join(rootDir, 'apps', app, 'dist');
  const dest = join(distDir, 'apps', app);
  if (existsSync(appDist)) {
    mkdirSync(dest, { recursive: true });
    cpSync(appDist, dest, { recursive: true });
    console.log(`  + apps/${app}/`);
  } else {
    console.log(`  - apps/${app}/ (not built yet)`);
  }
}

// Create redirect HTML files for backwards compatibility
console.log('\nCreating redirect files...');
const redirects = {
  'favoris.html': 'apps/favorites/index.html',
  'builder.html': 'apps/builder/index.html',
  'builderIA.html': 'apps/builder-ia/index.html',
  'playground.html': 'apps/playground/index.html',
  'sources.html': 'apps/sources/index.html',
  'dashboard.html': 'apps/dashboard/index.html',
  'monitoring.html': 'apps/monitoring/index.html',
};

for (const [oldFile, newPath] of Object.entries(redirects)) {
  const dest = join(distDir, oldFile);
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=${newPath}">
  <title>Redirection...</title>
</head>
<body>
  <p>Redirection vers <a href="${newPath}">${newPath}</a></p>
</body>
</html>`;
  writeFileSync(dest, html);
  console.log(`  + ${oldFile} -> ${newPath}`);
}

console.log('\n+ Build completed: app-dist/');

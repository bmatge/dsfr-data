#!/usr/bin/env tsx
/**
 * Transforme les pages HTML de docs (specs/ et guide/) pour le déploiement
 * GitHub Pages : remplace le Web Component `<app-header>` (menu de navigation
 * vers les apps Builder, Dashboard, etc.) par un header statique minimaliste,
 * et `<app-footer>` par un footer statique.
 *
 * Rationale : sur GitHub Pages, seules `specs/` et `guide/` sont déployées
 * — les apps (Builder, Builder IA, Dashboard, etc.) ne le sont pas. Le menu
 * du header pointait donc vers des routes inexistantes (404). Ce script
 * applique la transformation **uniquement** sur les fichiers copiés dans
 * `_site/` par le workflow `deploy-grist-widgets.yml` — les sources dans
 * le repo restent inchangées pour préserver l'expérience dans la webapp
 * déployée (où le header est partagé entre toutes les pages).
 *
 * Usage :
 *   npx tsx scripts/transform-docs-for-pages.ts <dir>
 *   Ex. : npx tsx scripts/transform-docs-for-pages.ts _site
 *
 * Le script :
 *   - Parcourt récursivement `<dir>` à la recherche de fichiers .html
 *   - Remplace `<app-header ...></app-header>` → bloc statique
 *   - Remplace `<app-footer ...></app-footer>` → bloc statique
 *   - Conserve `<app-sidemenu>` (navigation intra-doc, utile sur Pages)
 *
 * Cf. discussion #207 + retour partenaire Bercy (épic #168).
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const STATIC_HEADER = `<!-- Header statique (docs GitHub Pages : pas d'auth, pas de menu app-only) -->
<header role="banner" class="fr-header">
  <div class="fr-header__body">
    <div class="fr-container">
      <div class="fr-header__body-row">
        <div class="fr-header__brand fr-enlarge-link">
          <div class="fr-header__brand-top">
            <div class="fr-header__logo">
              <p class="fr-logo">République<br>française</p>
            </div>
          </div>
          <div class="fr-header__service">
            <a href="https://github.com/bmatge/dsfr-data" title="dsfr-data sur GitHub">
              <p class="fr-header__service-title">dsfr-data</p>
            </a>
            <p class="fr-header__service-tagline">Documentation — Web Components DSFR pour la dataviz</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</header>`;

const STATIC_FOOTER = `<!-- Footer statique (docs GitHub Pages) -->
<footer role="contentinfo" class="fr-footer">
  <div class="fr-container">
    <div class="fr-footer__body">
      <div class="fr-footer__brand fr-enlarge-link">
        <p class="fr-logo">République<br>française</p>
      </div>
      <div class="fr-footer__content">
        <p class="fr-footer__content-desc">Bibliothèque de Web Components DSFR pour intégrer des données dynamiques.</p>
        <ul class="fr-footer__content-list">
          <li class="fr-footer__content-item"><a class="fr-footer__content-link" href="https://github.com/bmatge/dsfr-data" target="_blank" rel="noopener">github.com/bmatge/dsfr-data</a></li>
          <li class="fr-footer__content-item"><a class="fr-footer__content-link" href="https://www.npmjs.com/package/dsfr-data" target="_blank" rel="noopener">npm</a></li>
        </ul>
      </div>
    </div>
    <div class="fr-footer__bottom">
      <ul class="fr-footer__bottom-list">
        <li class="fr-footer__bottom-item"><a class="fr-footer__bottom-link" href="https://github.com/bmatge/dsfr-data/blob/main/docs/SECURITY.md">Sécurité</a></li>
        <li class="fr-footer__bottom-item">MIT License</li>
      </ul>
    </div>
  </div>
</footer>`;

const HEADER_REGEX = /<app-header [^>]*><\/app-header>/g;
const FOOTER_REGEX = /<app-footer [^>]*><\/app-footer>/g;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...walk(p));
    } else if (extname(p) === '.html') {
      out.push(p);
    }
  }
  return out;
}

const target = process.argv[2];
if (!target) {
  console.error('Usage : tsx scripts/transform-docs-for-pages.ts <dir>');
  process.exit(1);
}

const files = walk(target);
let touchedFiles = 0;
let headers = 0;
let footers = 0;

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  const h = content.match(HEADER_REGEX)?.length ?? 0;
  const f = content.match(FOOTER_REGEX)?.length ?? 0;
  if (h === 0 && f === 0) continue;
  content = content.replace(HEADER_REGEX, STATIC_HEADER);
  content = content.replace(FOOTER_REGEX, STATIC_FOOTER);
  writeFileSync(file, content);
  touchedFiles += 1;
  headers += h;
  footers += f;
}

console.log(
  `[transform-docs-for-pages] ${touchedFiles}/${files.length} fichiers HTML modifiés ` +
    `· ${headers} <app-header> → statique · ${footers} <app-footer> → statique`
);

#!/usr/bin/env tsx
/**
 * Transforme les pages HTML de docs (specs/ et guide/) pour le déploiement
 * GitHub Pages : remplace le Web Component `<app-header>` (menu de navigation
 * vers les apps Builder, Dashboard, etc.) par un header statique minimaliste
 * avec accès rapide Specs ↔ Guide, et `<app-footer>` par un footer statique.
 *
 * Rationale : sur GitHub Pages, seules `specs/` et `guide/` sont déployées
 * — les apps (Builder, Builder IA, Dashboard, etc.) ne le sont pas. Le menu
 * du header pointait donc vers des routes inexistantes (404). Ce script
 * applique la transformation **uniquement** sur les fichiers copiés dans
 * `_site/` par le workflow `deploy-pages.yml` — les sources dans le repo
 * restent inchangées pour préserver l'expérience dans la webapp déployée
 * (où le header est partagé entre toutes les pages).
 *
 * Header statique = logo République française + titre + tagline + nav
 * minimaliste avec liens Specs / Guide / GitHub. Le `base-path` est
 * récupéré de l'attribut de `<app-header base-path="...">` original pour
 * que les liens internes pointent au bon endroit quelle que soit la
 * profondeur de la page. La section courante reçoit `aria-current="page"`
 * pour une mise en valeur visuelle (style DSFR natif).
 *
 * Usage :
 *   npx tsx scripts/transform-docs-for-pages.ts <dir> [--section=specs|guide]
 *   Ex. : npx tsx scripts/transform-docs-for-pages.ts _site/specs
 *
 * Si --section est omis, la section est auto-détectée depuis le nom du
 * dossier cible (`_site/specs` → specs ; `_site/guide` → guide).
 *
 * Le script :
 *   - Parcourt récursivement `<dir>` à la recherche de fichiers .html
 *   - Remplace `<app-header base-path="..."></app-header>` → bloc statique
 *     paramétré par le base-path et la section courante
 *   - Remplace `<app-footer ...></app-footer>` → bloc statique
 *   - Conserve `<app-sidemenu>` (navigation intra-doc, utile sur Pages)
 *
 * Cf. issues #168, #210.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

type Section = 'specs' | 'guide' | 'other';

/** Construit le header statique en injectant le base-path et la section active. */
function buildStaticHeader(basePath: string, section: Section): string {
  const specsCurrent = section === 'specs' ? ' aria-current="page"' : '';
  const guideCurrent = section === 'guide' ? ' aria-current="page"' : '';
  // base-path peut être "../" ou "../../" — on l'utilise tel quel pour
  // construire les liens vers les autres sections.
  return `<!-- Header statique (docs GitHub Pages : pas d'auth, pas de menu app-only) -->
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
            <a href="${basePath}" title="Documentation dsfr-data">
              <p class="fr-header__service-title">dsfr-data</p>
            </a>
            <p class="fr-header__service-tagline">Documentation — Web Components DSFR pour la dataviz</p>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="fr-header__menu">
    <div class="fr-container">
      <nav class="fr-nav" role="navigation" aria-label="Navigation documentation">
        <ul class="fr-nav__list">
          <li class="fr-nav__item">
            <a class="fr-nav__link"${specsCurrent} href="${basePath}specs/">Spécifications</a>
          </li>
          <li class="fr-nav__item">
            <a class="fr-nav__link"${guideCurrent} href="${basePath}guide/">Guide utilisateur</a>
          </li>
          <li class="fr-nav__item">
            <a class="fr-nav__link" href="https://github.com/bmatge/dsfr-data" target="_blank" rel="noopener">GitHub</a>
          </li>
        </ul>
      </nav>
    </div>
  </div>
</header>`;
}

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

// Capture base-path dans l'attribut. Tolère l'ordre des attributs.
const HEADER_REGEX =
  /<app-header\b[^>]*\bbase-path="([^"]*)"[^>]*><\/app-header>|<app-header\b[^>]*><\/app-header>/g;
const FOOTER_REGEX = /<app-footer\b[^>]*><\/app-footer>/g;

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

function parseArgs(argv: string[]): { target: string; section: Section } {
  const args = argv.slice(2);
  const target = args.find((a) => !a.startsWith('--'));
  if (!target) {
    console.error('Usage : tsx scripts/transform-docs-for-pages.ts <dir> [--section=specs|guide]');
    process.exit(1);
  }
  const sectionArg = args.find((a) => a.startsWith('--section='))?.split('=')[1];
  let section: Section;
  if (sectionArg === 'specs' || sectionArg === 'guide') {
    section = sectionArg;
  } else {
    // Auto-détection depuis le nom du dossier cible
    const name = basename(target.replace(/\/$/, ''));
    section = name === 'specs' || name === 'guide' ? (name as Section) : 'other';
  }
  return { target, section };
}

const { target, section } = parseArgs(process.argv);
const files = walk(target);
let touchedFiles = 0;
let headers = 0;
let footers = 0;

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  const h = content.match(HEADER_REGEX)?.length ?? 0;
  const f = content.match(FOOTER_REGEX)?.length ?? 0;
  if (h === 0 && f === 0) continue;
  content = content.replace(HEADER_REGEX, (_match, capturedBasePath?: string) => {
    return buildStaticHeader(capturedBasePath ?? '../', section);
  });
  content = content.replace(FOOTER_REGEX, STATIC_FOOTER);
  writeFileSync(file, content);
  touchedFiles += 1;
  headers += h;
  footers += f;
}

console.log(
  `[transform-docs-for-pages] section=${section} · ${touchedFiles}/${files.length} fichiers HTML modifiés ` +
    `· ${headers} <app-header> → statique · ${footers} <app-footer> → statique`
);

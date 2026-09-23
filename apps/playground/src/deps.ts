/**
 * Bloc de dependances CDN du Playground (bouton « Ajouter des dependances »).
 *
 * Le bloc est CALCULE selon le code (#1085). Il etait fixe, pense pour les
 * graphiques : une carte passee par le Playground perdait
 * `dsfr-data.map.umd.js`, et `dsfr-data-map` / `dsfr-data-map-layer` n'etaient
 * jamais definis une fois le code copie dans une page autonome (JSFiddle).
 *
 * Meme en-tete que le Builder Carto (#1084, `apps/builder-carto/src/ui/code-generator.ts`,
 * `dependances()`) : DSFR + feuille utilitaire, puis les bundles UMD `core` et
 * `map`. Les URL viennent de `CDN_URLS` et `LIB_URL` (`@dsfr-data/shared`),
 * jamais saisies ici. Pas de feuille Leaflet : `dsfr-data-map` l'injecte
 * lui-meme ; une feuille deja presente dans le code n'est pas retiree (elle ne
 * correspond pas au motif des dependances).
 *
 * DSFR Chart n'est ajoute que si un graphique en depend : `dsfr-data-chart`
 * (seul composant de la lib qui rend des balises DSFR Chart) ou une balise
 * DSFR Chart ecrite a la main.
 */

import { CDN_URLS, LIB_URL } from '@dsfr-data/shared';

/**
 * Lignes de dependances (CDN dsfr, DSFRChart, dsfr-data), retirees par
 * « Retirer les dependances ». `chart\.js` reste dans le motif pour nettoyer les
 * snippets anterieurs a #656 (DSFR Chart embarque Chart.js, on ne l'injecte
 * plus) — jamais pour l'ajouter. Motifs lineaires : classes negatives `[^>]*`
 * sans quantificateur imbrique.
 */
const DEPS_LINE_RE =
  /^[ \t]*(<link[^>]*(dsfr|DSFRChart)[^>]*>|<script[^>]*(dsfr|chart\.js|DSFRChart|dsfr-data)[^>]*><\/script>)[ \t]*\n?/gm;
const DEPS_COMMENT_RE = /^[ \t]*<!--\s*Dependances[^>]*-->\s*\n?/gm;
/** Detection (sans drapeau `g` : `test` ne garde aucun etat entre deux appels). */
const DEPS_DETECT_RE =
  /<link[^>]*(dsfr|DSFRChart)[^>]*>|<script[^>]*(dsfr|chart\.js|DSFRChart|dsfr-data)[^>]*><\/script>/m;

/** `dsfr-data-map`, `-map-layer`, `-map-popup`… : tout le bundle `map`. */
const MAP_TAG_RE = /<dsfr-data-map\b/i;
/** Balises DSFR Chart ecrites a la main, et le composant qui en emet. */
const CHART_TAG_RE =
  /<(dsfr-data-chart|bar-chart|bar-line-chart|line-chart|pie-chart|doughnut-chart|radar-chart|scatter-chart|horizontal-bar-chart|gauge-chart|map-chart|map-chart-reg|table-chart)\b/i;

/** Le code contient-il un composant cartographique ? */
export function utiliseCarte(code: string): boolean {
  return MAP_TAG_RE.test(code);
}

/** Le code contient-il un graphique qui depend de DSFR Chart ? */
export function utiliseGraphique(code: string): boolean {
  return CHART_TAG_RE.test(code);
}

/** Bloc de dependances adapte au code (termine par une ligne vide). */
export function blocDependances(code: string): string {
  const carte = utiliseCarte(code);
  const graphique = utiliseGraphique(code);
  const libelle = ['DSFR', graphique ? 'DSFR Chart' : '', 'dsfr-data'].filter(Boolean).join(' + ');
  const lignes = [
    `<!-- Dependances (${libelle}) -->`,
    `<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">`,
    `<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">`,
  ];
  if (graphique) {
    lignes.push(
      `<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">`,
      `<script type="module" src="${CDN_URLS.dsfrChartJs}"></script>`
    );
  }
  lignes.push(`<script src="${LIB_URL}/dsfr-data.core.umd.js"></script>`);
  if (carte) lignes.push(`<script src="${LIB_URL}/dsfr-data.map.umd.js"></script>`);
  return lignes.join('\n') + '\n\n';
}

/** Le code porte-t-il deja des dependances CDN ? */
export function aDesDependances(code: string): boolean {
  return DEPS_DETECT_RE.test(code) || /dsfr-data\.(core\.|map\.)?(umd|esm)\.js/.test(code);
}

/** Retire les lignes de dependances et leur commentaire d'en-tete. */
export function retirerDependances(code: string): string {
  DEPS_LINE_RE.lastIndex = 0;
  DEPS_COMMENT_RE.lastIndex = 0;
  return code.replace(DEPS_LINE_RE, '').replace(DEPS_COMMENT_RE, '').replace(/^\n+/, '');
}

/**
 * Ajoute le bloc adapte au code. Les dependances deja presentes sont d'abord
 * retirees : le bloc reinjecte les remplace au lieu de les doubler.
 */
export function ajouterDependances(code: string): string {
  const nu = retirerDependances(code);
  return blocDependances(nu) + nu;
}

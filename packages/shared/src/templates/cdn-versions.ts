import { earlyBufferScript } from '../debug/early-buffer.js';
/**
 * CDN dependency versions and URLs.
 * Single source of truth — all code generators import from here.
 */

/**
 * Versions alignees sur packages/core/package.json (#322) — un test de
 * garde (tests/shared/cdn-versions-alignment.test.ts) echoue si la
 * dependance installee diverge de la version CDN generee.
 */
export const CDN_VERSIONS = {
  dsfr: '1.14.4',
  dsfrChart: '2.1.1',
} as const;

/**
 * Pas de `chartJs` ici (#656) : `@gouvfr/dsfr-chart` embarque sa propre copie
 * de Chart.js dans `DSFRChart.js` et n'expose aucun global `Chart`. Charger
 * `chart.js` a cote ne sert a rien (~200 Ko par page) — la lib le sait deja
 * (`packages/core/src/utils/chart-reference-lines.ts`, `resolveChartInstance`
 * lit l'instance dans les internes Vue du composant, pas dans `window.Chart`).
 */
export const CDN_URLS = {
  dsfrCss: `https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@${CDN_VERSIONS.dsfr}/dist/dsfr.min.css`,
  dsfrUtilityCss: `https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@${CDN_VERSIONS.dsfr}/dist/utility/utility.min.css`,
  dsfrModuleJs: `https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@${CDN_VERSIONS.dsfr}/dist/dsfr.module.min.js`,
  dsfrChartCss: `https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@${CDN_VERSIONS.dsfrChart}/dist/DSFRChart/DSFRChart.css`,
  dsfrChartJs: `https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@${CDN_VERSIONS.dsfrChart}/dist/DSFRChart/DSFRChart.js`,
} as const;

/**
 * Wrap a code snippet in a standalone HTML document with all CDN dependencies.
 * Used by playground, builder and favorites to render previews in iframes.
 *
 * - Strips any remote dsfr-data `<script>` tags from the code
 * - Injects the local ESM build from the current origin instead
 */
export interface PreviewHTMLOptions {
  /**
   * Injecte le tampon d'evenements du volet Diagnostic (#605).
   *
   * Sans lui, un observateur exterieur arrive systematiquement trop tard :
   * le pipeline emet pendant le parsing, bien avant le `load` de l'iframe.
   * Le tampon est inerte tant que personne ne le vide.
   */
  debug?: boolean;
}

export function getPreviewHTML(code: string, options: PreviewHTMLOptions = {}): string {
  const origin = window.location.origin;
  // Strip any `<script ... dsfr-data ...></script>` tags the user copied in.
  // This runs in a preview iframe (srcdoc, sandbox) — the input is the user's
  // own code from their CodeMirror editor, not attacker input. The strip
  // exists only to prevent double-registration of the same custom elements.
  // Linear regex `[^<]*?` + loop until stable handles nesting safely.
  let cleanedCode = code;
  let previous;
  do {
    previous = cleanedCode;
    cleanedCode = cleanedCode.replace(/<script\b[^<]*?<\/script>\s*/gi, (match) =>
      /dsfr-data/i.test(match) ? '' : match
    );
  } while (cleanedCode !== previous);
  // EN TETE du head, avant la moindre feuille ou le moindre module : le bus
  // emet des le premier connectedCallback, tout ce qui arrive apres est
  // deja en retard.
  const earlyBuffer = options.debug ? `\n  ${earlyBufferScript()}` : '';
  return `<!DOCTYPE html>
<html lang="fr" data-fr-theme>
<head>
  <meta charset="UTF-8">${earlyBuffer}
  <link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
  <link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css">
  <link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
  <script type="module" src="${CDN_URLS.dsfrChartJs}"></script>
  <script type="module" src="${origin}/dist/dsfr-data.esm.js"></script>
  <style>
    html, body {
      margin: 0;
      overflow-x: hidden;
      box-sizing: border-box;
    }
    body {
      padding: 1.5rem clamp(1rem, 8vw, 6rem);
      font-family: Marianne, arial, sans-serif;
      max-width: 100%;
    }
    *, *::before, *::after { box-sizing: inherit; }
    /*
     * The DSFR Chart Vue components (bar-chart, line-chart, pie-chart, …)
     * render with an internal fixed-width canvas. Force the host elements
     * and their canvas children to fit the iframe viewport so the preview
     * never overflows horizontally / vertically.
     */
    dsfr-data-chart, dsfr-data-list, dsfr-data-kpi, dsfr-data-display,
    dsfr-data-map,
    bar-chart, line-chart, pie-chart, doughnut-chart, radar-chart,
    scatter-chart, horizontal-bar-chart, gauge-chart, map-chart, map-chart-reg,
    kpi-indicator {
      display: block;
      max-width: 100%;
      width: 100%;
    }
    canvas {
      max-width: 100% !important;
      height: auto !important;
    }
  </style>
</head>
<body>
${cleanedCode}
</body>
</html>`;
}

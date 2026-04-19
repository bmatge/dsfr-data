/**
 * CDN dependency versions and URLs.
 * Single source of truth — all code generators import from here.
 */

const CDN_VERSIONS = {
  dsfr: '1.14.4',
  dsfrChart: '2.0.4',
  chartJs: '4.4.1',
} as const;

export const CDN_URLS = {
  dsfrCss: `https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@${CDN_VERSIONS.dsfr}/dist/dsfr.min.css`,
  dsfrUtilityCss: `https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@${CDN_VERSIONS.dsfr}/dist/utility/utility.min.css`,
  dsfrModuleJs: `https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@${CDN_VERSIONS.dsfr}/dist/dsfr.module.min.js`,
  dsfrChartCss: `https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@${CDN_VERSIONS.dsfrChart}/dist/DSFRChart/DSFRChart.css`,
  dsfrChartJs: `https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@${CDN_VERSIONS.dsfrChart}/dist/DSFRChart/DSFRChart.js`,
  chartJs: `https://cdn.jsdelivr.net/npm/chart.js@${CDN_VERSIONS.chartJs}/dist/chart.umd.min.js`,
} as const;

/**
 * Wrap a code snippet in a standalone HTML document with all CDN dependencies.
 * Used by playground, builder and favorites to render previews in iframes.
 *
 * - Strips any remote dsfr-data `<script>` tags from the code
 * - Injects the local ESM build from the current origin instead
 */
export function getPreviewHTML(code: string): string {
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
  return `<!DOCTYPE html>
<html lang="fr" data-fr-theme>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
  <link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css">
  <script src="${CDN_URLS.chartJs}"></script>
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
    dsfr-data-map, dsfr-data-world-map,
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

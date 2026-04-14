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
  const cleanedCode = code.replace(/<script[^>]*dsfr-data[^>]*><\/script>\s*/gi, '');
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
    body { padding: 1rem; font-family: Marianne, arial, sans-serif; }
  </style>
</head>
<body>
${cleanedCode}
</body>
</html>`;
}

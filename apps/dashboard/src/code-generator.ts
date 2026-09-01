/**
 * Dashboard app - Code generation
 */

import { escapeHtml, CDN_URLS, LIB_URL } from '@dsfr-data/shared';
import { state, getRowColumns, isFavoriteChart } from './state.js';
import type { Widget } from './state.js';

export function updateGeneratedCode(): void {
  const code = generateHTMLCode();
  const codeEl = document.getElementById('generated-code');
  const jsonEl = document.getElementById('generated-json');
  if (codeEl) codeEl.textContent = code;
  if (jsonEl) jsonEl.textContent = JSON.stringify(state.dashboard, null, 2);
}

export function generateHTMLCode(): string {
  const { dashboard } = state;

  const widgetsByRow: Record<number, Widget[]> = {};
  dashboard.widgets.forEach((w) => {
    if (!widgetsByRow[w.position.row]) {
      widgetsByRow[w.position.row] = [];
    }
    widgetsByRow[w.position.row].push(w);
  });

  let widgetsHTML = '';
  Object.keys(widgetsByRow)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((rowKey) => {
      const rowIdx = Number(rowKey);
      const widgets = widgetsByRow[rowIdx];

      // Per-row column class
      const columns = getRowColumns(dashboard, rowIdx);
      const colSize = Math.floor(12 / columns);
      const colClass = colSize === 12 ? 'fr-col-12' : `fr-col-12 fr-col-md-${colSize}`;

      widgetsHTML += `    <div class="fr-grid-row ${dashboard.layout.gap}">\n`;

      widgets.forEach((widget) => {
        widgetsHTML += `      <div class="${colClass}">\n`;
        widgetsHTML += generateWidgetHTML(widget);
        widgetsHTML += `      </div>\n`;
      });

      widgetsHTML += `    </div>\n`;
    });

  return `<!DOCTYPE html>
<html lang="fr" data-fr-theme>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(dashboard.name)} - dsfr-data</title>

  <!-- DSFR -->
  <link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
  <link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css">

  <!-- DSFR Chart -->
  <link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
  <script type="module" src="${CDN_URLS.dsfrChartJs}"></script>

  <!-- dsfr-data -->
  <script type="module" src="${LIB_URL}/dsfr-data.core.esm.js"></script>
</head>
<body>
  <div class="fr-container fr-my-4w">
    <h1>${escapeHtml(dashboard.name)}</h1>

${widgetsHTML}
  </div>

  <script type="module" src="${CDN_URLS.dsfrModuleJs}"></script>
</body>
</html>`;
}

export function generateWidgetHTML(widget: Widget): string {
  const indent = '        ';

  switch (widget.type) {
    case 'kpi': {
      const cfg = widget.config;
      const iconAttr = cfg.icon ? ` icon="${escapeHtml(cfg.icon)}"` : '';
      return `${indent}<dsfr-data-kpi
${indent}  value="${escapeHtml(cfg.value)}"
${indent}  label="${escapeHtml(cfg.label || widget.title)}"
${indent}  format="${cfg.format}"${iconAttr}>
${indent}</dsfr-data-kpi>\n`;
    }

    case 'chart': {
      const cfg = widget.config;
      // Un favori porte le HTML deja genere par le builder : on le recopie tel
      // quel plutot que de reconstruire une balise a partir de rien.
      if (isFavoriteChart(cfg)) {
        if (!cfg.code) return '';
        return `${indent}<!-- Graphique: ${escapeHtml(widget.title)} -->\n${indent}${cfg.code.split('\n').join('\n' + indent)}\n`;
      }
      return `${indent}<dsfr-data-chart
${indent}  type="${cfg.type}"
${indent}  label-field="${escapeHtml(cfg.labelField)}"
${indent}  value-field="${escapeHtml(cfg.valueField)}"
${indent}  selected-palette="${cfg.palette}">
${indent}</dsfr-data-chart>\n`;
    }

    case 'table': {
      const cols = widget.config.columns.length
        ? ` columns='${JSON.stringify(widget.config.columns)}'`
        : '';
      const searchable = widget.config.searchable ? ' searchable' : '';
      const sortable = widget.config.sortable ? ' sortable' : '';
      return `${indent}<dsfr-data-list${cols}${searchable}${sortable}>
${indent}</dsfr-data-list>\n`;
    }

    case 'text':
      if (widget.config.style === 'callout') {
        return `${indent}<div class="fr-callout">
${indent}  <p class="fr-callout__text">${widget.config.content}</p>
${indent}</div>\n`;
      } else if (widget.config.style === 'title') {
        return `${indent}<h2>${widget.config.content}</h2>\n`;
      }
      return `${indent}<p>${widget.config.content}</p>\n`;
  }
}

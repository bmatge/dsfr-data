/**
 * Generates dsfr-data-map HTML code from the current state.
 */
import { state } from '../state.js';
import type { LayerConfig } from '../state.js';
import { LIB_URL } from '../state.js';
import { detectProvider, extractResourceIds, getProvider, PROXY_BASE_URL } from '@dsfr-data/shared';

function layerAttrs(layer: LayerConfig): string {
  const attrs: string[] = [];
  attrs.push(`source="${layer.id}"`);
  attrs.push(`type="${layer.type}"`);

  if (layer.latField) attrs.push(`lat-field="${layer.latField}"`);
  if (layer.lonField) attrs.push(`lon-field="${layer.lonField}"`);
  if (layer.geoField) attrs.push(`geo-field="${layer.geoField}"`);

  // Tooltip (only if popupMode is tooltip)
  if (layer.popupMode === 'tooltip' && layer.tooltipField) {
    attrs.push(`tooltip-field="${layer.tooltipField}"`);
  }

  // Popup fields on layer (for popup mode without template)
  if (layer.popupMode === 'popup' && layer.popupFields && !layer.popupTemplate) {
    attrs.push(`popup-fields="${layer.popupFields}"`);
  }

  if (layer.color !== '#000091') attrs.push(`color="${layer.color}"`);

  if (layer.type === 'geoshape') {
    if (layer.fillField) attrs.push(`fill-field="${layer.fillField}"`);
    if (layer.fillOpacity !== 0.6) attrs.push(`fill-opacity="${layer.fillOpacity}"`);
    if (layer.selectedPalette) attrs.push(`selected-palette="${layer.selectedPalette}"`);
  }

  if (layer.type === 'circle') {
    if (layer.radius !== 8) attrs.push(`radius="${layer.radius}"`);
    if (layer.radiusField) attrs.push(`radius-field="${layer.radiusField}"`);
    if (layer.radiusUnit !== 'px') attrs.push(`radius-unit="${layer.radiusUnit}"`);
    if (layer.radiusMin !== 4) attrs.push(`radius-min="${layer.radiusMin}"`);
    if (layer.radiusMax !== 30) attrs.push(`radius-max="${layer.radiusMax}"`);
  }

  if (layer.type === 'heatmap') {
    if (layer.heatRadius !== 25) attrs.push(`heat-radius="${layer.heatRadius}"`);
    if (layer.heatBlur !== 15) attrs.push(`heat-blur="${layer.heatBlur}"`);
    if (layer.heatField) attrs.push(`heat-field="${layer.heatField}"`);
  }

  if (layer.cluster) {
    attrs.push('cluster');
    if (layer.clusterRadius !== 80) attrs.push(`cluster-radius="${layer.clusterRadius}"`);
  }

  if (layer.filter) attrs.push(`filter="${layer.filter}"`);

  if (layer.minZoom !== 0) attrs.push(`min-zoom="${layer.minZoom}"`);
  if (layer.maxZoom !== 18) attrs.push(`max-zoom="${layer.maxZoom}"`);
  if (layer.bbox) {
    attrs.push('bbox');
    if (layer.bboxDebounce !== 300) attrs.push(`bbox-debounce="${layer.bboxDebounce}"`);
    if (layer.bboxField) attrs.push(`bbox-field="${layer.bboxField}"`);
  }
  if (layer.maxItems !== 5000) attrs.push(`max-items="${layer.maxItems}"`);

  return attrs.join('\n    ');
}

function popupTag(layer: LayerConfig): string {
  const mode = layer.popupMode;
  if (mode === 'none' || mode === 'tooltip') return '';

  const attrs: string[] = [];
  attrs.push(`mode="${mode}"`);
  if (layer.titleField) attrs.push(`title-field="${layer.titleField}"`);
  if (layer.popupWidth && layer.popupWidth !== '350px') attrs.push(`width="${layer.popupWidth}"`);

  let inner = '';
  if (layer.popupTemplate) {
    inner = `\n      <template>${layer.popupTemplate}</template>\n    `;
  }

  return `    <dsfr-data-map-popup ${attrs.join(' ')}>${inner}</dsfr-data-map-popup>`;
}

function sourceTag(layer: LayerConfig): string {
  if (!layer.source) return '';
  const s = layer.source;
  const attrs: string[] = [`id="${layer.id}"`];

  // Unified Source format: detect provider from apiUrl
  const provider = s.apiUrl ? detectProvider(s.apiUrl) : getProvider('generic');
  const resourceIds = s.apiUrl ? extractResourceIds(s.apiUrl, provider) : null;

  if (s.type === 'grist' && s.documentId && s.tableId) {
    const gristProvider = getProvider('grist');
    let gristUrl = s.apiUrl || '';
    for (const host of gristProvider.knownHosts) {
      if (s.apiUrl?.includes(host.hostname)) {
        gristUrl = `${PROXY_BASE_URL}${host.proxyEndpoint}/api/docs/${s.documentId}/tables/${s.tableId}/records`;
        break;
      }
    }
    attrs.push(`url="${gristUrl}"`);
    attrs.push('transform="records"');
  } else if (provider.id === 'opendatasoft' && resourceIds?.datasetId) {
    const baseUrl = new URL(s.apiUrl!).origin;
    attrs.push('api-type="opendatasoft"');
    attrs.push(`base-url="${baseUrl}"`);
    attrs.push(`dataset-id="${resourceIds.datasetId}"`);
    if (layer.maxItems !== 5000) attrs.push(`limit="${layer.maxItems}"`);
  } else if (provider.id === 'tabular' && resourceIds?.resourceId) {
    attrs.push('api-type="tabular"');
    attrs.push(`base-url="https://tabular-api.data.gouv.fr"`);
    attrs.push(`resource="${resourceIds.resourceId}"`);
  } else if (provider.id === 'insee' && resourceIds?.datasetId) {
    const baseUrl = new URL(s.apiUrl!).origin;
    attrs.push('api-type="insee"');
    attrs.push(`base-url="${baseUrl}"`);
    attrs.push(`dataset-id="${resourceIds.datasetId}"`);
  } else if (s.apiUrl) {
    attrs.push(`url="${s.apiUrl}"`);
    if (s.dataPath) attrs.push(`transform="${s.dataPath}"`);
  } else if (s.type === 'manual' && s.data?.length) {
    attrs.push(`data='${JSON.stringify(s.data)}'`);
  }

  return `<dsfr-data-source ${attrs.join('\n  ')}>\n</dsfr-data-source>`;
}

export function generateCode(): string {
  const m = state.map;
  const lines: string[] = [];

  if (state.generationMode === 'dynamic') {
    lines.push(`<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.11.2/dist/dsfr.min.css">`);
    lines.push(`<script type="module" src="${LIB_URL}/dsfr-data.core.esm.js"><\/script>`);
    lines.push(`<script type="module" src="${LIB_URL}/dsfr-data.map.esm.js"><\/script>`);
    lines.push('');
  }

  // Sources (only visible layers)
  const visibleLayers = state.layers.filter(l => l.visible);
  for (const layer of visibleLayers) {
    const src = sourceTag(layer);
    if (src) {
      lines.push(src);
      lines.push('');
    }
  }

  // Map container
  const mapAttrs: string[] = [];
  if (m.center !== '46.603,2.888') mapAttrs.push(`center="${m.center}"`);
  if (m.zoom !== 6) mapAttrs.push(`zoom="${m.zoom}"`);
  if (m.minZoom !== 2) mapAttrs.push(`min-zoom="${m.minZoom}"`);
  if (m.maxZoom !== 18) mapAttrs.push(`max-zoom="${m.maxZoom}"`);
  if (m.tiles !== 'ign-plan') mapAttrs.push(`tiles="${m.tiles}"`);
  if (m.height !== '500px') mapAttrs.push(`height="${m.height}"`);
  if (m.name) mapAttrs.push(`name="${m.name}"`);
  if (m.fitBounds) mapAttrs.push('fit-bounds');
  if (m.noControls) mapAttrs.push('no-controls');
  if (m.maxBounds) mapAttrs.push(`max-bounds="${m.maxBounds}"`);

  lines.push(`<dsfr-data-map${mapAttrs.length ? ' ' + mapAttrs.join(' ') : ''}>`);

  // Layers (only visible)
  for (const layer of visibleLayers) {
    if (!layer.source) continue;
    lines.push(`  <dsfr-data-map-layer ${layerAttrs(layer)}>`);

    // Popup/panel component
    const popup = popupTag(layer);
    if (popup) {
      lines.push(popup);
    }

    lines.push(`  </dsfr-data-map-layer>`);
  }

  lines.push('</dsfr-data-map>');

  return lines.join('\n');
}

/**
 * Generates dsfr-data-map HTML code from the current state.
 */
import { state } from '../state.js';
import type { LayerConfig } from '../state.js';
import { LIB_URL } from '../state.js';

function indent(str: string, level: number): string {
  return str.split('\n').map(l => '  '.repeat(level) + l).join('\n');
}

function layerAttrs(layer: LayerConfig): string {
  const attrs: string[] = [];
  attrs.push(`source="${layer.id}"`);
  attrs.push(`type="${layer.type}"`);

  if (layer.latField) attrs.push(`lat-field="${layer.latField}"`);
  if (layer.lonField) attrs.push(`lon-field="${layer.lonField}"`);
  if (layer.geoField) attrs.push(`geo-field="${layer.geoField}"`);

  if (layer.popupFields) attrs.push(`popup-fields="${layer.popupFields}"`);
  if (layer.popupTemplate) attrs.push(`popup-template="${layer.popupTemplate}"`);
  if (layer.tooltipField) attrs.push(`tooltip-field="${layer.tooltipField}"`);

  if (layer.color !== '#000091') attrs.push(`color="${layer.color}"`);

  if (layer.type === 'geoshape') {
    if (layer.fillField) attrs.push(`fill-field="${layer.fillField}"`);
    if (layer.fillOpacity !== 0.6) attrs.push(`fill-opacity="${layer.fillOpacity}"`);
    if (layer.selectedPalette) attrs.push(`selected-palette="${layer.selectedPalette}"`);
  }

  if (layer.type === 'circle') {
    if (layer.radiusField) attrs.push(`radius-field="${layer.radiusField}"`);
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

  if (layer.minZoom !== 0) attrs.push(`min-zoom="${layer.minZoom}"`);
  if (layer.maxZoom !== 18) attrs.push(`max-zoom="${layer.maxZoom}"`);
  if (layer.bbox) attrs.push('bbox');
  if (layer.maxItems !== 5000) attrs.push(`max-items="${layer.maxItems}"`);

  return attrs.join('\n    ');
}

function sourceTag(layer: LayerConfig): string {
  if (!layer.source) return '';
  const s = layer.source;
  const attrs: string[] = [`id="${layer.id}"`];

  if (s.apiType && s.apiType !== 'generic') {
    attrs.push(`api-type="${s.apiType}"`);
    if (s.baseUrl) attrs.push(`base-url="${s.baseUrl}"`);
    if (s.datasetId) attrs.push(`dataset-id="${s.datasetId}"`);
    if (s.resource) attrs.push(`resource="${s.resource}"`);
  } else if (s.url) {
    attrs.push(`url="${s.url}"`);
    if (s.transform) attrs.push(`transform="${s.transform}"`);
  }

  if (s.where) attrs.push(`where="${s.where}"`);
  if (s.select) attrs.push(`select="${s.select}"`);
  if (s.limit) attrs.push(`limit="${s.limit}"`);
  if (s.serverSide) attrs.push('server-side');
  if (s.pageSize) attrs.push(`page-size="${s.pageSize}"`);

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

  // Sources
  for (const layer of state.layers) {
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
  if (m.tiles !== 'ign-plan') mapAttrs.push(`tiles="${m.tiles}"`);
  if (m.height !== '500px') mapAttrs.push(`height="${m.height}"`);
  if (m.name) mapAttrs.push(`name="${m.name}"`);
  if (m.fitBounds) mapAttrs.push('fit-bounds');

  lines.push(`<dsfr-data-map${mapAttrs.length ? ' ' + mapAttrs.join(' ') : ''}>`);

  // Layers
  for (const layer of state.layers) {
    if (!layer.source) continue;
    lines.push(`  <dsfr-data-map-layer ${layerAttrs(layer)}>`);
    lines.push(`  </dsfr-data-map-layer>`);
  }

  lines.push('</dsfr-data-map>');

  return lines.join('\n');
}

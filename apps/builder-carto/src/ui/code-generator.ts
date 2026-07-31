/**
 * Generates dsfr-data-map HTML code from the current state.
 */
import { state, DROM_IDS, INSET_TERRITORIES } from '../state.js';
import type { LayerConfig } from '../state.js';
import { LIB_URL } from '../state.js';
import {
  detectProvider,
  extractResourceIds,
  getProvider,
  PROXY_BASE_URL_EMBED,
} from '@dsfr-data/shared';

const MAP_A11Y_ID = 'carte';

function layerAttrs(layer: LayerConfig): string {
  const attrs: string[] = [];
  // Avec un filtre, le layer consomme le dsfr-data-query intermediaire (#297)
  attrs.push(`source="${layer.filter ? `${layer.id}-filtre` : layer.id}"`);
  attrs.push(`type="${layer.type}"`);

  if (layer.latField) attrs.push(`lat-field="${layer.latField}"`);
  if (layer.lonField) attrs.push(`lon-field="${layer.lonField}"`);
  if (layer.geoField) attrs.push(`geo-field="${layer.geoField}"`);

  // Couche decorative : aucune interaction, exclue du fit-bounds
  if (layer.noInteractive) attrs.push('no-interactive');

  // Tooltip (only if popupMode is tooltip, pointless on a decorative layer)
  if (!layer.noInteractive && layer.popupMode === 'tooltip' && layer.tooltipField) {
    attrs.push(`tooltip-field="${layer.tooltipField}"`);
  }

  if (layer.color !== '#000091') attrs.push(`color="${layer.color}"`);
  if (layer.colorField) attrs.push(`color-field="${layer.colorField}"`);
  if (layer.colorMap) attrs.push(`color-map="${layer.colorMap}"`);

  if (layer.type === 'geoshape') {
    if (layer.fillField) attrs.push(`fill-field="${layer.fillField}"`);
    if (layer.selectedPalette) attrs.push(`selected-palette="${layer.selectedPalette}"`);
  }
  if (layer.type === 'geoshape' || layer.type === 'circle') {
    if (layer.fillOpacity !== 0.6) attrs.push(`fill-opacity="${layer.fillOpacity}"`);
    if (layer.shapeClass) attrs.push(`shape-class="${layer.shapeClass}"`);
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

  if (layer.minZoom !== 0) attrs.push(`min-zoom="${layer.minZoom}"`);
  if (layer.maxZoom !== 18) attrs.push(`max-zoom="${layer.maxZoom}"`);
  if (layer.bbox) {
    attrs.push('bbox');
    if (layer.bboxDebounce !== 300) attrs.push(`bbox-debounce="${layer.bboxDebounce}"`);
    if (layer.bboxField) attrs.push(`bbox-field="${layer.bboxField}"`);
  }
  if (layer.maxItems !== 5000) attrs.push(`max-items="${layer.maxItems}"`);

  // Timeline
  if (layer.timeField) {
    attrs.push(`time-field="${layer.timeField}"`);
    if (layer.timeBucket !== 'none') attrs.push(`time-bucket="${layer.timeBucket}"`);
    if (layer.timeMode !== 'snapshot') attrs.push(`time-mode="${layer.timeMode}"`);
  }

  return attrs.join('\n    ');
}

/**
 * Template genere depuis la liste « Champs affiches » quand aucun template
 * n'est fourni : sans lui, le compagnon popup affiche TOUTES les colonnes.
 */
function autoTemplateFromFields(layer: LayerConfig): string {
  const fields = layer.popupFields
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
  if (!fields.length) return '';
  return fields
    .map((f) => `<p class="fr-mb-1v"><strong>${f} :</strong> {{${f}}}</p>`)
    .join('\n        ');
}

function popupTag(layer: LayerConfig): string {
  const mode = layer.popupMode;
  if (layer.noInteractive || mode === 'none' || mode === 'tooltip') return '';

  const attrs: string[] = [];
  attrs.push(`mode="${mode}"`);
  if (layer.titleField) attrs.push(`title-field="${layer.titleField}"`);
  if (layer.popupWidth && layer.popupWidth !== '350px') attrs.push(`width="${layer.popupWidth}"`);

  const template = layer.popupTemplate || autoTemplateFromFields(layer);
  let inner = '';
  if (template) {
    inner = `\n      <template>${template}</template>\n    `;
  }

  return `    <dsfr-data-map-popup ${attrs.join(' ')}>${inner}</dsfr-data-map-popup>`;
}

/**
 * Balise <dsfr-data-source> d'une couche. Reutilisee par l'assistance de
 * champs (field-service) avec un id/limit d'echantillonnage.
 */
export function buildSourceTag(
  layer: LayerConfig,
  opts: { id?: string; limit?: number } = {}
): string {
  if (!layer.source) return '';
  const s = layer.source;
  const attrs: string[] = [`id="${opts.id ?? layer.id}"`];
  const isAdapter: { current: boolean } = { current: false };

  // Unified Source format: detect provider from apiUrl
  const provider = s.apiUrl ? detectProvider(s.apiUrl) : getProvider('generic');
  const resourceIds = s.apiUrl ? extractResourceIds(s.apiUrl, provider) : null;

  if (s.type === 'grist' && s.documentId && s.tableId) {
    const gristProvider = getProvider('grist');
    let gristUrl = s.apiUrl || '';
    for (const host of gristProvider.knownHosts) {
      if (s.apiUrl?.includes(host.hostname)) {
        gristUrl = `${PROXY_BASE_URL_EMBED}${host.proxyEndpoint}/api/docs/${s.documentId}/tables/${s.tableId}/records`;
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
    isAdapter.current = true;
  } else if (provider.id === 'tabular' && resourceIds?.resourceId) {
    attrs.push('api-type="tabular"');
    attrs.push(`base-url="https://tabular-api.data.gouv.fr"`);
    attrs.push(`resource="${resourceIds.resourceId}"`);
    isAdapter.current = true;
  } else if (provider.id === 'insee' && resourceIds?.datasetId) {
    const baseUrl = new URL(s.apiUrl!).origin;
    attrs.push('api-type="insee"');
    attrs.push(`base-url="${baseUrl}"`);
    attrs.push(`dataset-id="${resourceIds.datasetId}"`);
    isAdapter.current = true;
  } else if (s.apiUrl) {
    attrs.push(`url="${s.apiUrl}"`);
    if (s.dataPath) attrs.push(`transform="${s.dataPath}"`);
  } else if (s.type === 'manual' && s.data?.length) {
    // Attribut simple-quoté : les apostrophes du JSON doivent être échappées
    // en entité HTML, sinon l'attribut se termine au premier « d' » venu.
    attrs.push(`data='${JSON.stringify(s.data).replace(/'/g, '&#39;')}'`);
  } else {
    return '';
  }

  // limit : echantillonnage (field-service) ou plafond utilisateur (max-items)
  const limit = opts.limit ?? (isAdapter.current && layer.maxItems !== 5000 ? layer.maxItems : 0);
  if (limit && isAdapter.current) attrs.push(`limit="${limit}"`);

  return `<dsfr-data-source ${attrs.join('\n  ')}>\n</dsfr-data-source>`;
}

/** Attribut insets : compresse les 5 DROM en groupe `drom` si tous coches. */
export function insetsAttrValue(): string {
  const selected = state.map.insets.filter((id) => INSET_TERRITORIES.some((t) => t.id === id));
  if (!selected.length) return '';
  const hasAllDrom = DROM_IDS.every((id) => selected.includes(id));
  const parts: string[] = [];
  if (hasAllDrom) parts.push('drom');
  for (const t of INSET_TERRITORIES) {
    if (!selected.includes(t.id)) continue;
    if (hasAllDrom && t.drom) continue;
    parts.push(t.id);
  }
  return parts.join(',');
}

export function generateCode(): string {
  const m = state.map;
  const lines: string[] = [];

  if (state.generationMode === 'dynamic') {
    lines.push(
      `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.4/dist/dsfr.min.css">`
    );
    lines.push(`<script type="module" src="${LIB_URL}/dsfr-data.core.esm.js"></script>`);
    lines.push(`<script type="module" src="${LIB_URL}/dsfr-data.map.esm.js"></script>`);
    lines.push('');
  }

  // Sources (only visible layers)
  const visibleLayers = state.layers.filter((l) => l.visible);
  for (const layer of visibleLayers) {
    const src = buildSourceTag(layer);
    if (src) {
      lines.push(src);
      // Filtre du layer : un dsfr-data-query intermediaire (#297) —
      // l'ancien attribut filter du layer etait un no-op (jamais lu)
      if (layer.filter) {
        lines.push(
          `<dsfr-data-query id="${layer.id}-filtre" source="${layer.id}" where="${layer.filter}">\n</dsfr-data-query>`
        );
      }
      lines.push('');
    }
  }

  // Map container
  const mapAttrs: string[] = [];
  if (m.a11y) mapAttrs.push(`id="${MAP_A11Y_ID}"`);
  if (m.center !== '46.603,2.888') mapAttrs.push(`center="${m.center}"`);
  if (m.zoom !== 6) mapAttrs.push(`zoom="${m.zoom}"`);
  if (m.minZoom !== 2) mapAttrs.push(`min-zoom="${m.minZoom}"`);
  if (m.maxZoom !== 18) mapAttrs.push(`max-zoom="${m.maxZoom}"`);
  if (m.tiles !== 'ign-plan') mapAttrs.push(`tiles="${m.tiles}"`);
  if (m.sovereignOnly) mapAttrs.push('sovereign-only');
  if (m.height !== '500px') mapAttrs.push(`height="${m.height}"`);
  if (m.name) mapAttrs.push(`name="${m.name}"`);
  if (m.fitBounds) mapAttrs.push('fit-bounds');
  if (m.noControls) mapAttrs.push('no-controls');
  if (m.locked) mapAttrs.push('locked');
  if (m.maxBounds) mapAttrs.push(`max-bounds="${m.maxBounds}"`);
  const insets = insetsAttrValue();
  if (insets) mapAttrs.push(`insets="${insets}"`);

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

  // Timeline controls (if any layer has time-field)
  if (visibleLayers.some((l) => l.timeField)) {
    const tAttrs: string[] = [];
    if (m.timelineSpeed !== 1) tAttrs.push(`speed="${m.timelineSpeed}"`);
    if (m.timelineInterval !== 1000) tAttrs.push(`interval="${m.timelineInterval}"`);
    lines.push('');
    lines.push(
      `  <dsfr-data-map-timeline${tAttrs.length ? ' ' + tAttrs.join(' ') : ''}></dsfr-data-map-timeline>`
    );
  }

  lines.push('</dsfr-data-map>');

  // Compagnon d'accessibilite : tableau des donnees + export CSV lies a la carte
  if (m.a11y) {
    const first = visibleLayers.find((l) => l.source);
    if (first) {
      const srcId = first.filter ? `${first.id}-filtre` : first.id;
      lines.push('');
      lines.push(
        `<dsfr-data-a11y for="${MAP_A11Y_ID}" source="${srcId}" table download></dsfr-data-a11y>`
      );
    }
  }

  return lines.join('\n');
}

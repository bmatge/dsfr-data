/**
 * Builder Carto — Visual map builder for dsfr-data-map
 */
import './styles/carto.css';
import { state, createLayer } from './state.js';
import type { LayerConfig } from './state.js';
import { generateCode } from './ui/code-generator.js';
import { loadFromStorage, STORAGE_KEYS } from '@dsfr-data/shared';
type AnySource = Record<string, any>;

// Expose state for E2E tests
(window as any).__BUILDER_CARTO_STATE__ = state;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function getActiveLayer(): LayerConfig | undefined {
  return state.layers.find(l => l.id === state.activeLayerId);
}

function renderLayersList() {
  const list = document.getElementById('layers-list')!;
  list.innerHTML = state.layers.map(layer => `
    <li class="carto-layers__item ${layer.id === state.activeLayerId ? 'carto-layers__item--active' : ''}"
        data-layer-id="${layer.id}">
      <div class="carto-layers__item-header">
        <span class="carto-layers__item-name">${layer.name}</span>
        <span class="carto-layers__item-type">${layer.type}</span>
      </div>
      ${layer.source ? `<span class="fr-text--xs" style="color:var(--text-mention-grey)">${layer.source.name || layer.source.datasetId || 'Source configuree'}</span>` : '<span class="fr-text--xs" style="color:var(--text-default-warning)">Aucune source</span>'}
    </li>
  `).join('');

  // Click handlers
  list.querySelectorAll('.carto-layers__item').forEach(el => {
    el.addEventListener('click', () => {
      state.activeLayerId = el.getAttribute('data-layer-id')!;
      renderLayersList();
      renderLayerConfig();
    });
  });
}

function renderLayerConfig() {
  const container = document.getElementById('layer-config')!;
  const layer = getActiveLayer();
  if (!layer) {
    container.innerHTML = '<p class="fr-text--sm">Selectionnez une couche.</p>';
    return;
  }

  const savedSources = loadFromStorage<AnySource[]>(STORAGE_KEYS.SOURCES, []);

  container.innerHTML = `
    <div class="carto-config__section">
      <h3>Source de donnees</h3>
      <div class="carto-field">
        <label for="layer-source">Source enregistree</label>
        <select id="layer-source" class="fr-select fr-select--sm">
          <option value="">-- Choisir une source --</option>
          ${savedSources.map((s: any) => `<option value="${s.id}" ${layer.source?.id === s.id ? 'selected' : ''}>${s.name || s.datasetId || s.url}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="carto-config__section">
      <h3>Type de couche</h3>
      <div class="carto-field">
        <select id="layer-type" class="fr-select fr-select--sm">
          <option value="marker" ${layer.type === 'marker' ? 'selected' : ''}>Marqueurs (POI)</option>
          <option value="geoshape" ${layer.type === 'geoshape' ? 'selected' : ''}>Zones (geoshape)</option>
          <option value="circle" ${layer.type === 'circle' ? 'selected' : ''}>Cercles proportionnels</option>
          <option value="heatmap" ${layer.type === 'heatmap' ? 'selected' : ''}>Carte de chaleur</option>
        </select>
      </div>
    </div>

    <div class="carto-config__section">
      <h3>Geolocalisation</h3>
      <div class="carto-field">
        <label for="layer-geo-field">Champ geo (GeoJSON)</label>
        <input type="text" id="layer-geo-field" value="${layer.geoField}" placeholder="geo_point_2d, geo_shape...">
      </div>
      <p class="fr-text--xs fr-mb-1w">ou coordonnees separees :</p>
      <div class="carto-inline">
        <div class="carto-field">
          <label for="layer-lat">Latitude</label>
          <input type="text" id="layer-lat" value="${layer.latField}" placeholder="latitude">
        </div>
        <div class="carto-field">
          <label for="layer-lon">Longitude</label>
          <input type="text" id="layer-lon" value="${layer.lonField}" placeholder="longitude">
        </div>
      </div>
    </div>

    <div class="carto-config__section">
      <h3>Affichage</h3>
      <div class="carto-field">
        <label for="layer-tooltip">Champ tooltip (survol)</label>
        <input type="text" id="layer-tooltip" value="${layer.tooltipField}" placeholder="nom, denomination...">
      </div>
      <div class="carto-field">
        <label for="layer-popup-fields">Champs popup (virgules)</label>
        <input type="text" id="layer-popup-fields" value="${layer.popupFields}" placeholder="nom,adresse,prix">
      </div>
      <div class="carto-field">
        <label for="layer-color">Couleur</label>
        <input type="color" id="layer-color" value="${layer.color}">
      </div>
    </div>

    ${layer.type === 'marker' ? `
    <div class="carto-config__section">
      <h3>Clustering</h3>
      <div class="carto-checkbox">
        <input type="checkbox" id="layer-cluster" ${layer.cluster ? 'checked' : ''}>
        <label for="layer-cluster">Activer le clustering</label>
      </div>
    </div>
    ` : ''}

    ${layer.type === 'circle' ? `
    <div class="carto-config__section">
      <h3>Cercles proportionnels</h3>
      <div class="carto-field">
        <label for="layer-radius-field">Champ rayon</label>
        <input type="text" id="layer-radius-field" value="${layer.radiusField}">
      </div>
      <div class="carto-inline">
        <div class="carto-field">
          <label for="layer-radius-min">Rayon min (px)</label>
          <input type="number" id="layer-radius-min" value="${layer.radiusMin}" min="1" max="100">
        </div>
        <div class="carto-field">
          <label for="layer-radius-max">Rayon max (px)</label>
          <input type="number" id="layer-radius-max" value="${layer.radiusMax}" min="1" max="100">
        </div>
      </div>
    </div>
    ` : ''}

    ${layer.type === 'geoshape' ? `
    <div class="carto-config__section">
      <h3>Choropleth</h3>
      <div class="carto-field">
        <label for="layer-fill-field">Champ valeur (coloration)</label>
        <input type="text" id="layer-fill-field" value="${layer.fillField}">
      </div>
      <div class="carto-field">
        <label for="layer-palette">Palette</label>
        <select id="layer-palette" class="fr-select fr-select--sm">
          <option value="">Aucune</option>
          <option value="sequentialAscending" ${layer.selectedPalette === 'sequentialAscending' ? 'selected' : ''}>Sequentielle (clair → fonce)</option>
          <option value="sequentialDescending" ${layer.selectedPalette === 'sequentialDescending' ? 'selected' : ''}>Sequentielle (fonce → clair)</option>
          <option value="divergentAscending" ${layer.selectedPalette === 'divergentAscending' ? 'selected' : ''}>Divergente (bleu → rouge)</option>
          <option value="neutral" ${layer.selectedPalette === 'neutral' ? 'selected' : ''}>Neutre (gris)</option>
        </select>
      </div>
    </div>
    ` : ''}

    ${layer.type === 'heatmap' ? `
    <div class="carto-config__section">
      <h3>Carte de chaleur</h3>
      <div class="carto-inline">
        <div class="carto-field">
          <label for="layer-heat-radius">Rayon</label>
          <input type="number" id="layer-heat-radius" value="${layer.heatRadius}" min="1" max="100">
        </div>
        <div class="carto-field">
          <label for="layer-heat-blur">Flou</label>
          <input type="number" id="layer-heat-blur" value="${layer.heatBlur}" min="1" max="100">
        </div>
      </div>
      <div class="carto-field">
        <label for="layer-heat-field">Champ ponderation</label>
        <input type="text" id="layer-heat-field" value="${layer.heatField}">
      </div>
    </div>
    ` : ''}
  `;

  // Bind change events
  bindLayerInputs(layer);
}

function bindLayerInputs(layer: LayerConfig) {
  const bind = (id: string, key: keyof LayerConfig, transform?: (v: string) => any) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return;
    el.addEventListener('change', () => {
      const val = el.type === 'checkbox' ? (el as HTMLInputElement).checked
        : transform ? transform(el.value) : el.value;
      (layer as any)[key] = val;
      updateCodePreview();
    });
  };

  bind('layer-type', 'type');
  bind('layer-geo-field', 'geoField');
  bind('layer-lat', 'latField');
  bind('layer-lon', 'lonField');
  bind('layer-tooltip', 'tooltipField');
  bind('layer-popup-fields', 'popupFields');
  bind('layer-color', 'color');
  bind('layer-cluster', 'cluster');
  bind('layer-radius-field', 'radiusField');
  bind('layer-radius-min', 'radiusMin', Number);
  bind('layer-radius-max', 'radiusMax', Number);
  bind('layer-fill-field', 'fillField');
  bind('layer-palette', 'selectedPalette');
  bind('layer-heat-radius', 'heatRadius', Number);
  bind('layer-heat-blur', 'heatBlur', Number);
  bind('layer-heat-field', 'heatField');

  // Type change re-renders config (different sections)
  const typeEl = document.getElementById('layer-type');
  typeEl?.addEventListener('change', () => renderLayerConfig());

  // Source change
  const sourceEl = document.getElementById('layer-source') as HTMLSelectElement | null;
  sourceEl?.addEventListener('change', () => {
    const savedSources = loadFromStorage<AnySource[]>(STORAGE_KEYS.SOURCES, []);
    const found = savedSources.find((s: any) => s.id === sourceEl.value);
    layer.source = found || null;
    renderLayersList();
    updateCodePreview();
  });
}

function renderMapConfig() {
  const m = state.map;
  const container = document.getElementById('map-config')!;
  container.innerHTML = `
    <div class="carto-config__section">
      <h3>Carte</h3>
      <div class="carto-field">
        <label for="map-name">Nom de la carte</label>
        <input type="text" id="map-name" value="${m.name}" placeholder="Ma carte">
      </div>
      <div class="carto-field">
        <label for="map-tiles">Fond de carte</label>
        <select id="map-tiles" class="fr-select fr-select--sm">
          <option value="ign-plan" ${m.tiles === 'ign-plan' ? 'selected' : ''}>IGN Plan</option>
          <option value="ign-ortho" ${m.tiles === 'ign-ortho' ? 'selected' : ''}>IGN Ortho</option>
          <option value="ign-topo" ${m.tiles === 'ign-topo' ? 'selected' : ''}>IGN Topographique</option>
          <option value="ign-cadastre" ${m.tiles === 'ign-cadastre' ? 'selected' : ''}>IGN Cadastre</option>
          <option value="osm" ${m.tiles === 'osm' ? 'selected' : ''}>OpenStreetMap</option>
        </select>
      </div>
      <div class="carto-inline">
        <div class="carto-field">
          <label for="map-center">Centre (lat,lon)</label>
          <input type="text" id="map-center" value="${m.center}">
        </div>
        <div class="carto-field">
          <label for="map-zoom">Zoom</label>
          <input type="number" id="map-zoom" value="${m.zoom}" min="1" max="18">
        </div>
      </div>
      <div class="carto-checkbox">
        <input type="checkbox" id="map-fit-bounds" ${m.fitBounds ? 'checked' : ''}>
        <label for="map-fit-bounds">Ajuster aux donnees (fit-bounds)</label>
      </div>
    </div>

    <div class="carto-config__section">
      <h3>Mode de generation</h3>
      <div class="carto-field">
        <select id="gen-mode" class="fr-select fr-select--sm">
          <option value="embedded" ${state.generationMode === 'embedded' ? 'selected' : ''}>Embarque (composants seuls)</option>
          <option value="dynamic" ${state.generationMode === 'dynamic' ? 'selected' : ''}>Dynamique (avec scripts/CSS)</option>
        </select>
      </div>
    </div>
  `;

  // Bind map config
  const bindMap = (id: string, key: keyof typeof m, transform?: (v: string) => any) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return;
    el.addEventListener('change', () => {
      const val = el.type === 'checkbox' ? (el as HTMLInputElement).checked
        : transform ? transform(el.value) : el.value;
      (m as any)[key] = val;
      updateCodePreview();
    });
  };

  bindMap('map-name', 'name');
  bindMap('map-tiles', 'tiles');
  bindMap('map-center', 'center');
  bindMap('map-zoom', 'zoom', Number);
  bindMap('map-fit-bounds', 'fitBounds');

  const genEl = document.getElementById('gen-mode') as HTMLSelectElement;
  genEl?.addEventListener('change', () => {
    state.generationMode = genEl.value as any;
    updateCodePreview();
  });
}

function updateCodePreview() {
  const codeEl = document.getElementById('code-output');
  if (codeEl) {
    codeEl.textContent = generateCode();
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function addLayer() {
  const layer = createLayer();
  state.layers.push(layer);
  state.activeLayerId = layer.id;
  renderLayersList();
  renderLayerConfig();
  updateCodePreview();
}

function removeActiveLayer() {
  if (state.layers.length <= 1) return;
  state.layers = state.layers.filter(l => l.id !== state.activeLayerId);
  state.activeLayerId = state.layers[0].id;
  renderLayersList();
  renderLayerConfig();
  updateCodePreview();
}

function copyCode() {
  const code = generateCode();
  navigator.clipboard.writeText(code).catch(() => {});
  const btn = document.getElementById('btn-copy');
  if (btn) {
    btn.textContent = 'Copie !';
    setTimeout(() => { btn.textContent = 'Copier le code'; }, 1500);
  }
}

function sendToPlayground() {
  const code = generateCode();
  sessionStorage.setItem('playground-code', code);
  window.location.href = '../../apps/playground/index.html?from=builder-carto';
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  renderLayersList();
  renderLayerConfig();
  renderMapConfig();
  updateCodePreview();

  document.getElementById('btn-add-layer')?.addEventListener('click', addLayer);
  document.getElementById('btn-remove-layer')?.addEventListener('click', removeActiveLayer);
  document.getElementById('btn-copy')?.addEventListener('click', copyCode);
  document.getElementById('btn-playground')?.addEventListener('click', sendToPlayground);
});

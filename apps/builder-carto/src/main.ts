/**
 * Builder Carto — Visual map builder for dsfr-data-map
 */
import './styles/carto.css';
import { state, createLayer } from './state.js';
import type { LayerConfig, PopupMode } from './state.js';
import { generateCode } from './ui/code-generator.js';
import {
  loadFromStorage,
  saveToStorage,
  STORAGE_KEYS,
  migrateSource,
  injectTourStyles,
  startTourIfFirstVisit,
  BUILDER_CARTO_TOUR,
} from '@dsfr-data/shared';
type AnySource = Record<string, any>;

const FAVORITES_KEY = 'dsfr-data-favorites';

interface Favorite {
  id: string;
  name: string;
  code: string;
  chartType: string;
  source: string;
  createdAt: string;
  builderState?: unknown;
}

function loadSavedSources(): AnySource[] {
  const raw = loadFromStorage<AnySource[]>(STORAGE_KEYS.SOURCES, []);
  return raw.map((s) => migrateSource(s as any) as unknown as AnySource);
}

// Expose state for E2E tests
(window as any).__BUILDER_CARTO_STATE__ = state;

// ---------------------------------------------------------------------------
// Accordion helper
// ---------------------------------------------------------------------------

function toggleSection(sectionId: string): void {
  const section = document.getElementById(sectionId);
  if (!section) return;

  const isCurrentlyCollapsed = section.classList.contains('collapsed');

  // Accordion behavior: close others when opening
  if (isCurrentlyCollapsed) {
    const parent = section.parentElement;
    if (parent) {
      parent.querySelectorAll('.config-section:not(#' + sectionId + ')').forEach((s) => {
        if (s.querySelector('.config-section-header')) {
          s.classList.add('collapsed');
        }
      });
    }
  }

  section.classList.toggle('collapsed');
}

// Make toggleSection available for onclick handlers
(window as any).toggleSection = toggleSection;

// ---------------------------------------------------------------------------
// Drag & Drop
// ---------------------------------------------------------------------------

let draggedLayerIndex: number | null = null;

function initDragListeners() {
  const list = document.getElementById('layers-list');
  if (!list) return;

  list.querySelectorAll('.carto-layers__item').forEach((el, index) => {
    el.setAttribute('draggable', 'true');

    el.addEventListener('dragstart', (e) => {
      draggedLayerIndex = index;
      (el as HTMLElement).classList.add('dragging');
      (e as DragEvent).dataTransfer!.effectAllowed = 'move';
    });

    el.addEventListener('dragend', () => {
      (el as HTMLElement).classList.remove('dragging');
      draggedLayerIndex = null;
      list.querySelectorAll('.drag-over').forEach((d) => d.classList.remove('drag-over'));
    });

    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      (e as DragEvent).dataTransfer!.dropEffect = 'move';
      list.querySelectorAll('.drag-over').forEach((d) => d.classList.remove('drag-over'));
      (el as HTMLElement).classList.add('drag-over');
    });

    el.addEventListener('dragleave', () => {
      (el as HTMLElement).classList.remove('drag-over');
    });

    el.addEventListener('drop', (e) => {
      e.preventDefault();
      (el as HTMLElement).classList.remove('drag-over');
      if (draggedLayerIndex === null || draggedLayerIndex === index) return;

      // Reorder state.layers
      const [moved] = state.layers.splice(draggedLayerIndex, 1);
      state.layers.splice(index, 0, moved);
      draggedLayerIndex = null;

      renderLayersList();
      updateCodePreview();
    });
  });
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function getActiveLayer(): LayerConfig | undefined {
  return state.layers.find((l) => l.id === state.activeLayerId);
}

function escapeAttr(val: string): string {
  return val.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ---------------------------------------------------------------------------
// Col 1: Layers list
// ---------------------------------------------------------------------------

function renderLayersList() {
  const list = document.getElementById('layers-list')!;
  list.innerHTML = state.layers
    .map(
      (layer) => `
    <li class="carto-layers__item ${layer.id === state.activeLayerId ? 'carto-layers__item--active' : ''}"
        data-layer-id="${layer.id}">
      <span class="carto-layers__item-drag" title="Glisser pour reordonner"><i class="ri-draggable"></i></span>
      <div class="carto-layers__item-info">
        <div class="carto-layers__item-header">
          <span class="carto-layers__item-name">${escapeAttr(layer.name)}</span>
          <span class="carto-layers__item-type">${layer.type}</span>
        </div>
        <span class="carto-layers__item-source">${layer.source ? layer.source.name || layer.source.datasetId || 'Source configuree' : '<span style="color:var(--text-default-warning)">Aucune source</span>'}</span>
      </div>
      <div class="carto-layers__item-actions">
        <button class="carto-layers__btn-eye ${layer.visible ? '' : 'carto-layers__btn-eye--hidden'}"
                data-eye-id="${layer.id}" title="${layer.visible ? 'Masquer' : 'Afficher'}">
          <i class="${layer.visible ? 'ri-eye-line' : 'ri-eye-off-line'}"></i>
        </button>
      </div>
    </li>
  `
    )
    .join('');

  // Click handlers: select layer
  list.querySelectorAll('.carto-layers__item').forEach((el) => {
    el.addEventListener('click', (e) => {
      // Don't select when clicking eye button or drag handle
      if (
        (e.target as HTMLElement).closest('.carto-layers__btn-eye') ||
        (e.target as HTMLElement).closest('.carto-layers__item-drag')
      )
        return;
      state.activeLayerId = el.getAttribute('data-layer-id')!;
      renderLayersList();
      renderLayerConfig();
    });
  });

  // Eye toggle
  list.querySelectorAll('.carto-layers__btn-eye').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const layerId = (btn as HTMLElement).getAttribute('data-eye-id')!;
      const layer = state.layers.find((l) => l.id === layerId);
      if (layer) {
        layer.visible = !layer.visible;
        renderLayersList();
        updateCodePreview();
      }
    });
  });

  // Drag & drop
  initDragListeners();
}

// ---------------------------------------------------------------------------
// Col 1: Map config (below layers list)
// ---------------------------------------------------------------------------

function renderMapConfig() {
  const m = state.map;
  const container = document.getElementById('map-config')!;
  container.innerHTML = `
    <div class="config-section" id="section-map-config">
      <div class="config-section-header" onclick="toggleSection('section-map-config')">
        <h3><i class="ri-map-2-line"></i> Carte</h3>
        <i class="ri-arrow-down-s-line collapse-icon"></i>
      </div>
      <div class="config-section-content">
        <div class="carto-field">
          <label for="map-name">Nom</label>
          <input type="text" id="map-name" value="${escapeAttr(m.name)}" placeholder="Ma carte">
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
            <label for="map-center">Centre (lat,lon)
              <span class="fr-hint-text">Ex : 46.6,2.4 (France) ou 48.86,2.35 (Paris)</span>
            </label>
            <input type="text" id="map-center" value="${escapeAttr(m.center)}">
          </div>
          <div class="carto-field">
            <label for="map-zoom">Zoom
              <span class="fr-hint-text">1 = monde, 6 = France, 12 = ville</span>
            </label>
            <input type="number" id="map-zoom" value="${m.zoom}" min="1" max="18">
          </div>
        </div>
        <div class="carto-field">
          <label for="map-height">Hauteur
            <span class="fr-hint-text">px, vh, ou % de la largeur (ex: 500px, 60vh, 60%)</span>
          </label>
          <input type="text" id="map-height" value="${escapeAttr(m.height)}" placeholder="500px">
        </div>
        <div class="carto-inline">
          <div class="carto-field">
            <label for="map-min-zoom">Zoom min</label>
            <input type="number" id="map-min-zoom" value="${m.minZoom}" min="1" max="18">
          </div>
          <div class="carto-field">
            <label for="map-max-zoom">Zoom max</label>
            <input type="number" id="map-max-zoom" value="${m.maxZoom}" min="1" max="18">
          </div>
        </div>
        <div class="carto-field">
          <label for="map-max-bounds">Limites (max-bounds)
            <span class="fr-hint-text">Zone de navigation autorisee : lat-sud,lon-ouest,lat-nord,lon-est</span>
          </label>
          <input type="text" id="map-max-bounds" value="${escapeAttr(m.maxBounds)}" placeholder="43.0,-5.0,51.5,10.0">
        </div>
        <div class="carto-checkbox">
          <input type="checkbox" id="map-fit-bounds" ${m.fitBounds ? 'checked' : ''}>
          <label for="map-fit-bounds">Ajuster aux donnees (fit-bounds)</label>
        </div>
        <div class="carto-checkbox">
          <input type="checkbox" id="map-no-controls" ${m.noControls ? 'checked' : ''}>
          <label for="map-no-controls">Masquer les controles (no-controls)</label>
        </div>
      </div>
    </div>

    <div class="config-section" id="section-gen-mode">
      <div class="config-section-header" onclick="toggleSection('section-gen-mode')">
        <h3><i class="ri-code-s-slash-line"></i> Mode de generation</h3>
        <i class="ri-arrow-down-s-line collapse-icon"></i>
      </div>
      <div class="config-section-content">
        <div class="carto-field">
          <select id="gen-mode" class="fr-select fr-select--sm">
            <option value="embedded" ${state.generationMode === 'embedded' ? 'selected' : ''}>Embarque (composants seuls)</option>
            <option value="dynamic" ${state.generationMode === 'dynamic' ? 'selected' : ''}>Dynamique (avec scripts/CSS)</option>
          </select>
        </div>
      </div>
    </div>
  `;

  // Bind map config
  const bindMap = (id: string, key: keyof typeof m, transform?: (v: string) => any) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return;
    el.addEventListener('change', () => {
      const val =
        el.type === 'checkbox'
          ? (el as HTMLInputElement).checked
          : transform
            ? transform(el.value)
            : el.value;
      (m as any)[key] = val;
      updateCodePreview();
    });
  };

  bindMap('map-name', 'name');
  bindMap('map-tiles', 'tiles');
  bindMap('map-center', 'center');
  bindMap('map-zoom', 'zoom', Number);
  bindMap('map-height', 'height');
  bindMap('map-min-zoom', 'minZoom', Number);
  bindMap('map-max-zoom', 'maxZoom', Number);
  bindMap('map-max-bounds', 'maxBounds');
  bindMap('map-fit-bounds', 'fitBounds');
  bindMap('map-no-controls', 'noControls');

  const genEl = document.getElementById('gen-mode') as HTMLSelectElement;
  genEl?.addEventListener('change', () => {
    state.generationMode = genEl.value as any;
    updateCodePreview();
  });
}

// ---------------------------------------------------------------------------
// Col 2: Active layer config (accordions)
// ---------------------------------------------------------------------------

function renderLayerConfig() {
  const container = document.getElementById('layer-config')!;
  const layer = getActiveLayer();
  if (!layer) {
    container.innerHTML =
      '<p class="carto-col-config__empty"><i class="ri-information-line"></i><br>Selectionnez une couche.</p>';
    return;
  }

  const savedSources = loadSavedSources();
  const isPopupOrPanel =
    layer.popupMode === 'popup' ||
    layer.popupMode === 'panel-right' ||
    layer.popupMode === 'panel-left';

  container.innerHTML = `
    <!-- Section: Source -->
    <div class="config-section" id="section-source">
      <div class="config-section-header" onclick="toggleSection('section-source')">
        <h3><i class="ri-database-2-line"></i> Source</h3>
        <i class="ri-arrow-down-s-line collapse-icon"></i>
      </div>
      <div class="config-section-content">
        <div class="carto-field">
          <label for="layer-source">Source enregistree</label>
          <select id="layer-source" class="fr-select fr-select--sm">
            <option value="">-- Choisir une source --</option>
            ${savedSources.map((s: any) => `<option value="${s.id}" ${layer.source?.id === s.id ? 'selected' : ''}>${escapeAttr(s.name || s.datasetId || s.url || '')}</option>`).join('')}
          </select>
        </div>
        <div class="carto-field">
          <label for="layer-type">Type de couche</label>
          <select id="layer-type" class="fr-select fr-select--sm">
            <option value="marker" ${layer.type === 'marker' ? 'selected' : ''}>Marqueurs (POI)</option>
            <option value="geoshape" ${layer.type === 'geoshape' ? 'selected' : ''}>Zones (geoshape)</option>
            <option value="circle" ${layer.type === 'circle' ? 'selected' : ''}>Cercles proportionnels</option>
            <option value="heatmap" ${layer.type === 'heatmap' ? 'selected' : ''}>Carte de chaleur</option>
          </select>
        </div>
        <div class="carto-field">
          <label for="layer-name">Nom de la couche</label>
          <input type="text" id="layer-name" value="${escapeAttr(layer.name)}">
        </div>
        <hr class="fr-mt-1w fr-mb-1w">
        <div class="carto-field">
          <label for="layer-geo-field">Champ geo (GeoJSON)
            <span class="fr-hint-text">Colonne contenant les coordonnees ou la geometrie</span>
          </label>
          <input type="text" id="layer-geo-field" value="${escapeAttr(layer.geoField)}" placeholder="geo_point_2d, geo_shape...">
        </div>
        <p class="fr-text--xs fr-mb-1w" style="color:var(--text-mention-grey)">ou coordonnees separees :</p>
        <div class="carto-inline">
          <div class="carto-field">
            <label for="layer-lat">Latitude</label>
            <input type="text" id="layer-lat" value="${escapeAttr(layer.latField)}" placeholder="latitude">
          </div>
          <div class="carto-field">
            <label for="layer-lon">Longitude</label>
            <input type="text" id="layer-lon" value="${escapeAttr(layer.lonField)}" placeholder="longitude">
          </div>
        </div>
      </div>
    </div>

    <!-- Section: Information display -->
    <div class="config-section collapsed" id="section-info">
      <div class="config-section-header" onclick="toggleSection('section-info')">
        <h3><i class="ri-information-line"></i> Informations</h3>
        <i class="ri-arrow-down-s-line collapse-icon"></i>
      </div>
      <div class="config-section-content">
        <div class="carto-field">
          <label for="layer-popup-mode">Type d'information</label>
          <select id="layer-popup-mode" class="fr-select fr-select--sm">
            <option value="none" ${layer.popupMode === 'none' ? 'selected' : ''}>Aucun</option>
            <option value="tooltip" ${layer.popupMode === 'tooltip' ? 'selected' : ''}>Tooltip (survol)</option>
            <option value="popup" ${layer.popupMode === 'popup' ? 'selected' : ''}>Popup (clic)</option>
            <option value="panel-right" ${layer.popupMode === 'panel-right' ? 'selected' : ''}>Panneau droit</option>
            <option value="panel-left" ${layer.popupMode === 'panel-left' ? 'selected' : ''}>Panneau gauche</option>
          </select>
        </div>

        ${
          layer.popupMode === 'tooltip'
            ? `
        <div class="carto-field">
          <label for="layer-tooltip">Champ tooltip
            <span class="fr-hint-text">Texte affiche au survol d'un element</span>
          </label>
          <input type="text" id="layer-tooltip" value="${escapeAttr(layer.tooltipField)}" placeholder="nom, denomination...">
        </div>
        `
            : ''
        }

        ${
          isPopupOrPanel
            ? `
        <div class="carto-field">
          <label for="layer-popup-fields">Champs affiches (virgules)
            <span class="fr-hint-text">Si vide, tableau auto de tous les champs</span>
          </label>
          <input type="text" id="layer-popup-fields" value="${escapeAttr(layer.popupFields)}" placeholder="nom,adresse,prix">
        </div>
        <div class="carto-field">
          <label for="layer-title-field">Champ titre
            <span class="fr-hint-text">Titre en haut du popup ou du panneau</span>
          </label>
          <input type="text" id="layer-title-field" value="${escapeAttr(layer.titleField)}" placeholder="nom">
        </div>
        <div class="carto-field">
          <label for="layer-popup-template">Template HTML
            <span class="fr-hint-text">Utiliser {{champ}} pour les valeurs</span>
          </label>
          <textarea id="layer-popup-template" placeholder="<h3>{{nom}}</h3>\n<p>{{adresse}}</p>">${escapeAttr(layer.popupTemplate)}</textarea>
        </div>
        <div class="carto-field">
          <label for="layer-popup-width">Largeur du panneau
            <span class="fr-hint-text">px, % (ex: 350px, 33%, 50%)</span>
          </label>
          <input type="text" id="layer-popup-width" value="${escapeAttr(layer.popupWidth)}" placeholder="350px">
        </div>
        `
            : ''
        }
      </div>
    </div>

    <!-- Section: Options (type-specific) -->
    <div class="config-section collapsed" id="section-options">
      <div class="config-section-header" onclick="toggleSection('section-options')">
        <h3><i class="ri-settings-3-line"></i> Options</h3>
        <i class="ri-arrow-down-s-line collapse-icon"></i>
      </div>
      <div class="config-section-content">
        <div class="carto-field">
          <label for="layer-color">Couleur ${layer.colorField ? '(fallback)' : ''}
            <span class="fr-hint-text">Couleur unique ou couleur par defaut si mapping actif</span>
          </label>
          <input type="color" id="layer-color" value="${layer.color}">
        </div>

        <div class="carto-field">
          <label for="layer-color-field">Champ couleur (mapping categoriel)
            <span class="fr-hint-text">Champ dont la valeur determine la couleur de chaque element</span>
          </label>
          <input type="text" id="layer-color-field" value="${escapeAttr(layer.colorField)}" placeholder="">
        </div>

        ${
          layer.colorField
            ? `
        <div class="carto-field">
          <label for="layer-color-map">Mapping couleurs
            <span class="fr-hint-text">Paires valeur:#couleur separees par virgule. Ex: 1:#00A95F,2:#FF9940,3:#E1000F</span>
          </label>
          <textarea id="layer-color-map" rows="3" class="fr-input" placeholder="val1:#couleur1,val2:#couleur2">${escapeAttr(layer.colorMap)}</textarea>
        </div>
        `
            : ''
        }

        ${
          layer.type === 'marker'
            ? `
        <div class="carto-checkbox">
          <input type="checkbox" id="layer-cluster" ${layer.cluster ? 'checked' : ''}>
          <label for="layer-cluster">Activer le clustering</label>
        </div>
        <div class="carto-field" ${!layer.cluster ? 'style="display:none"' : ''} id="cluster-radius-group">
          <label for="layer-cluster-radius">Rayon de cluster (px)</label>
          <input type="number" id="layer-cluster-radius" value="${layer.clusterRadius}" min="10" max="200">
        </div>
        `
            : ''
        }

        ${
          layer.type === 'geoshape'
            ? `
        <div class="carto-field">
          <label for="layer-fill-field">Champ valeur (coloration)
            <span class="fr-hint-text">Colore les zones selon ce champ numerique</span>
          </label>
          <input type="text" id="layer-fill-field" value="${escapeAttr(layer.fillField)}">
        </div>
        <div class="carto-field">
          <label for="layer-fill-opacity">Opacite de remplissage
            <span class="fr-hint-text">0 = transparent, 1 = opaque</span>
          </label>
          <input type="number" id="layer-fill-opacity" value="${layer.fillOpacity}" min="0" max="1" step="0.1">
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
        `
            : ''
        }

        ${
          layer.type === 'circle'
            ? `
        <div class="carto-field">
          <label for="layer-radius">Rayon fixe</label>
          <input type="number" id="layer-radius" value="${layer.radius}" min="1" max="100">
        </div>
        <div class="carto-field">
          <label for="layer-radius-field">Champ rayon (proportionnel)
            <span class="fr-hint-text">La taille du cercle varie selon la valeur de ce champ</span>
          </label>
          <input type="text" id="layer-radius-field" value="${escapeAttr(layer.radiusField)}">
        </div>
        <div class="carto-field">
          <label for="layer-radius-unit">Unite</label>
          <select id="layer-radius-unit" class="fr-select fr-select--sm">
            <option value="px" ${layer.radiusUnit === 'px' ? 'selected' : ''}>Pixels (px)</option>
            <option value="m" ${layer.radiusUnit === 'm' ? 'selected' : ''}>Metres (m)</option>
          </select>
        </div>
        <div class="carto-inline">
          <div class="carto-field">
            <label for="layer-radius-min">Rayon min</label>
            <input type="number" id="layer-radius-min" value="${layer.radiusMin}" min="1" max="100">
          </div>
          <div class="carto-field">
            <label for="layer-radius-max">Rayon max</label>
            <input type="number" id="layer-radius-max" value="${layer.radiusMax}" min="1" max="200">
          </div>
        </div>
        `
            : ''
        }

        ${
          layer.type === 'heatmap'
            ? `
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
          <label for="layer-heat-field">Champ ponderation
            <span class="fr-hint-text">Champ numerique pour l'intensite de la chaleur</span>
          </label>
          <input type="text" id="layer-heat-field" value="${escapeAttr(layer.heatField)}">
        </div>
        `
            : ''
        }

        <hr class="fr-mt-1w fr-mb-1w">

        <div class="carto-field">
          <label for="layer-time-field">Champ temporel (animation)
            <span class="fr-hint-text">Colonne date/heure pour animer la carte dans le temps</span>
          </label>
          <input type="text" id="layer-time-field" value="${escapeAttr(layer.timeField)}" placeholder="">
        </div>

        ${
          layer.timeField
            ? `
        <div class="carto-inline">
          <div class="carto-field">
            <label for="layer-time-bucket">Granularite</label>
            <select id="layer-time-bucket" class="fr-select fr-select--sm">
              <option value="none" ${layer.timeBucket === 'none' ? 'selected' : ''}>Valeurs brutes</option>
              <option value="hour" ${layer.timeBucket === 'hour' ? 'selected' : ''}>Heure</option>
              <option value="day" ${layer.timeBucket === 'day' ? 'selected' : ''}>Jour</option>
              <option value="month" ${layer.timeBucket === 'month' ? 'selected' : ''}>Mois</option>
              <option value="year" ${layer.timeBucket === 'year' ? 'selected' : ''}>Annee</option>
            </select>
          </div>
          <div class="carto-field">
            <label for="layer-time-mode">Mode</label>
            <select id="layer-time-mode" class="fr-select fr-select--sm">
              <option value="snapshot" ${layer.timeMode === 'snapshot' ? 'selected' : ''}>Instantane</option>
              <option value="cumulative" ${layer.timeMode === 'cumulative' ? 'selected' : ''}>Cumulatif</option>
            </select>
          </div>
        </div>
        `
            : ''
        }

        <hr class="fr-mt-1w fr-mb-1w">

        <div class="carto-field">
          <label for="layer-filter">Filtre (expression)
            <span class="fr-hint-text">Ex: status = 'active'</span>
          </label>
          <input type="text" id="layer-filter" value="${escapeAttr(layer.filter)}" placeholder="">
        </div>

        <div class="carto-checkbox">
          <input type="checkbox" id="layer-bbox" ${layer.bbox ? 'checked' : ''}>
          <label for="layer-bbox">Chargement par viewport (bbox)</label>
        </div>

        ${
          layer.bbox
            ? `
        <div class="carto-inline">
          <div class="carto-field">
            <label for="layer-bbox-debounce">Delai de chargement (ms)
              <span class="fr-hint-text">Temps d'attente apres un deplacement avant de recharger les donnees</span>
            </label>
            <input type="number" id="layer-bbox-debounce" value="${layer.bboxDebounce}" min="0" max="2000">
          </div>
          <div class="carto-field">
            <label for="layer-bbox-field">Champ geographique pour le viewport
              <span class="fr-hint-text">Colonne utilisee pour filtrer par zone visible</span>
            </label>
            <input type="text" id="layer-bbox-field" value="${escapeAttr(layer.bboxField)}" placeholder="">
          </div>
        </div>
        `
            : ''
        }

        <div class="carto-inline">
          <div class="carto-field">
            <label for="layer-min-zoom">Zoom min</label>
            <input type="number" id="layer-min-zoom" value="${layer.minZoom}" min="0" max="18">
          </div>
          <div class="carto-field">
            <label for="layer-max-zoom">Zoom max</label>
            <input type="number" id="layer-max-zoom" value="${layer.maxZoom}" min="0" max="18">
          </div>
        </div>

        <div class="carto-field">
          <label for="layer-max-items">Nombre max d'elements
            <span class="fr-hint-text">Limite les donnees chargees (performance)</span>
          </label>
          <input type="number" id="layer-max-items" value="${layer.maxItems}" min="1" max="100000">
        </div>
      </div>
    </div>
  `;

  // Bind change events
  bindLayerInputs(layer);
}

// ---------------------------------------------------------------------------
// Bind layer inputs
// ---------------------------------------------------------------------------

function bindLayerInputs(layer: LayerConfig) {
  const bind = (id: string, key: keyof LayerConfig, transform?: (v: string) => any) => {
    const el = document.getElementById(id) as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | null;
    if (!el) return;
    const eventType = el.tagName === 'TEXTAREA' ? 'input' : 'change';
    el.addEventListener(eventType, () => {
      const val =
        el.type === 'checkbox'
          ? (el as HTMLInputElement).checked
          : transform
            ? transform(el.value)
            : el.value;
      (layer as any)[key] = val;
      updateCodePreview();
    });
  };

  // Source
  const sourceEl = document.getElementById('layer-source') as HTMLSelectElement | null;
  sourceEl?.addEventListener('change', () => {
    const savedSources = loadSavedSources();
    const found = savedSources.find((s: any) => s.id === sourceEl.value);
    layer.source = found || null;
    renderLayersList();
    updateCodePreview();
  });

  // Type change re-renders entire config (different options sections)
  const typeEl = document.getElementById('layer-type');
  typeEl?.addEventListener('change', () => {
    layer.type = (typeEl as HTMLSelectElement).value as any;
    renderLayerConfig();
    renderLayersList();
    updateCodePreview();
  });

  // Name
  const nameEl = document.getElementById('layer-name') as HTMLInputElement | null;
  nameEl?.addEventListener('change', () => {
    layer.name = nameEl.value;
    renderLayersList();
    updateCodePreview();
  });

  // Geo
  bind('layer-geo-field', 'geoField');
  bind('layer-lat', 'latField');
  bind('layer-lon', 'lonField');

  // Info display
  const popupModeEl = document.getElementById('layer-popup-mode') as HTMLSelectElement | null;
  popupModeEl?.addEventListener('change', () => {
    layer.popupMode = popupModeEl.value as PopupMode;
    renderLayerConfig();
    updateCodePreview();
  });

  bind('layer-tooltip', 'tooltipField');
  bind('layer-popup-fields', 'popupFields');
  bind('layer-title-field', 'titleField');
  bind('layer-popup-template', 'popupTemplate');
  bind('layer-popup-width', 'popupWidth');

  // Options
  bind('layer-color', 'color');
  const colorFieldEl = document.getElementById('layer-color-field') as HTMLInputElement | null;
  colorFieldEl?.addEventListener('change', () => {
    layer.colorField = colorFieldEl.value;
    renderLayerConfig(); // show/hide color-map textarea
    updateCodePreview();
  });
  bind('layer-color-map', 'colorMap');
  bind('layer-filter', 'filter');

  // Marker
  const clusterEl = document.getElementById('layer-cluster') as HTMLInputElement | null;
  clusterEl?.addEventListener('change', () => {
    layer.cluster = clusterEl.checked;
    const clusterGroup = document.getElementById('cluster-radius-group');
    if (clusterGroup) clusterGroup.style.display = clusterEl.checked ? '' : 'none';
    updateCodePreview();
  });
  bind('layer-cluster-radius', 'clusterRadius', Number);

  // Geoshape
  bind('layer-fill-field', 'fillField');
  bind('layer-fill-opacity', 'fillOpacity', Number);
  bind('layer-palette', 'selectedPalette');

  // Circle
  bind('layer-radius', 'radius', Number);
  bind('layer-radius-field', 'radiusField');
  bind('layer-radius-unit', 'radiusUnit');
  bind('layer-radius-min', 'radiusMin', Number);
  bind('layer-radius-max', 'radiusMax', Number);

  // Heatmap
  bind('layer-heat-radius', 'heatRadius', Number);
  bind('layer-heat-blur', 'heatBlur', Number);
  bind('layer-heat-field', 'heatField');

  // Timeline
  const timeFieldEl = document.getElementById('layer-time-field') as HTMLInputElement | null;
  timeFieldEl?.addEventListener('change', () => {
    layer.timeField = timeFieldEl.value;
    renderLayerConfig(); // show/hide bucket+mode fields
    updateCodePreview();
  });
  bind('layer-time-bucket', 'timeBucket');
  bind('layer-time-mode', 'timeMode');

  // Viewport
  const bboxEl = document.getElementById('layer-bbox') as HTMLInputElement | null;
  bboxEl?.addEventListener('change', () => {
    layer.bbox = bboxEl.checked;
    renderLayerConfig();
    updateCodePreview();
  });
  bind('layer-bbox-debounce', 'bboxDebounce', Number);
  bind('layer-bbox-field', 'bboxField');

  bind('layer-min-zoom', 'minZoom', Number);
  bind('layer-max-zoom', 'maxZoom', Number);
  bind('layer-max-items', 'maxItems', Number);
}

// ---------------------------------------------------------------------------
// Code preview
// ---------------------------------------------------------------------------

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
  state.layers = state.layers.filter((l) => l.id !== state.activeLayerId);
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
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="ri-check-line"></i> Copie !';
    setTimeout(() => {
      btn.innerHTML = original;
    }, 1500);
  }
}

function sendToPlayground() {
  const code = generateCode();
  sessionStorage.setItem('playground-code', code);
  window.location.href = '../../apps/playground/index.html?from=builder-carto';
}

function saveFavorite() {
  const code = generateCode();
  if (!code.trim()) return;

  const name = prompt('Nom du favori :', state.map.name || 'Ma carte');
  if (!name) return;

  const favorites = loadFromStorage<Favorite[]>(FAVORITES_KEY, []);

  const favorite: Favorite = {
    id: crypto.randomUUID(),
    name,
    code,
    chartType: 'map',
    source: 'builder-carto',
    createdAt: new Date().toISOString(),
    builderState: JSON.parse(JSON.stringify(state)),
  };

  favorites.unshift(favorite);
  saveToStorage(FAVORITES_KEY, favorites);

  // Visual feedback on the save button inside app-preview-panel
  const btn = document.querySelector('.preview-panel-save-btn') as HTMLButtonElement | null;
  if (btn) {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="ri-check-line" aria-hidden="true"></i> Sauvegarde !';
    btn.style.background = 'var(--background-contrast-success)';
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
    }, 2000);
  }
}

function executePreview() {
  const preview = document.getElementById('map-preview');
  if (!preview) return;

  // Generate embedded code
  const savedMode = state.generationMode;
  state.generationMode = 'embedded';
  const code = generateCode();
  state.generationMode = savedMode;

  preview.innerHTML = code;
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
  document.getElementById('btn-execute')?.addEventListener('click', executePreview);

  // app-preview-panel events
  const previewPanel = document.querySelector('app-preview-panel');
  if (previewPanel) {
    previewPanel.addEventListener('save-favorite', saveFavorite);
    previewPanel.addEventListener('open-playground', sendToPlayground);
  }

  // Product tour
  injectTourStyles();
  startTourIfFirstVisit(BUILDER_CARTO_TOUR);
});

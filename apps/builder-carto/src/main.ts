/**
 * Builder Carto — Visual map builder for dsfr-data-map
 *
 * Colonnes : 1) couches + config carte · 2) config de la couche active
 * (sections disclosure, basique → avancé) · 3) aperçu + code généré.
 * L'état complet est persisté (reprise de session) et la saisie des champs
 * est assistée par un échantillonnage réel de la source (field-service).
 */
import './styles/carto.css';
import {
  state,
  createLayer,
  persistState,
  restoreState,
  resetState,
  INSET_TERRITORIES,
  DROM_IDS,
} from './state.js';
import type { AnySource, FieldInfo, LayerConfig, LayerType, PopupMode } from './state.js';
import { generateCode } from './ui/code-generator.js';
import { scanLayerFields } from './field-service.js';
import {
  loadFromStorage,
  saveToStorage,
  STORAGE_KEYS,
  migrateSource,
  injectTourStyles,
  startTourIfFirstVisit,
  BUILDER_CARTO_TOUR,
  initAuth,
  toastWarning,
  type Source,
} from '@dsfr-data/shared';

const FAVORITES_KEY = 'dsfr-data-favorites';

interface Favorite {
  id: string;
  name: string;
  code: string;
  chartType: string;
  /**
   * Originating app — server column `source_app`. Older entries may still
   * carry this value under the legacy field name `source`; readers must
   * support both via `fav.sourceApp ?? fav.source`.
   */
  sourceApp: string;
  createdAt: string;
  /**
   * Serialized builder state — server column `builder_state_json`. Older
   * entries may still carry this under the legacy field name `builderState`.
   */
  builderStateJson?: unknown;
}

/** Jeu d'exemple embarqué : chefs-lieux des régions métropolitaines. */
const SAMPLE_DATA: Record<string, unknown>[] = [
  { ville: 'Paris', region: 'Île-de-France', lat: 48.8566, lon: 2.3522, population: 2133111 },
  { ville: 'Lyon', region: 'Auvergne-Rhône-Alpes', lat: 45.764, lon: 4.8357, population: 522250 },
  {
    ville: 'Marseille',
    region: "Provence-Alpes-Côte d'Azur",
    lat: 43.2965,
    lon: 5.3698,
    population: 873076,
  },
  { ville: 'Toulouse', region: 'Occitanie', lat: 43.6047, lon: 1.4442, population: 504078 },
  {
    ville: 'Bordeaux',
    region: 'Nouvelle-Aquitaine',
    lat: 44.8378,
    lon: -0.5792,
    population: 261804,
  },
  { ville: 'Nantes', region: 'Pays de la Loire', lat: 47.2184, lon: -1.5536, population: 320732 },
  { ville: 'Rennes', region: 'Bretagne', lat: 48.1173, lon: -1.6778, population: 225081 },
  { ville: 'Lille', region: 'Hauts-de-France', lat: 50.6292, lon: 3.0573, population: 236234 },
  { ville: 'Strasbourg', region: 'Grand Est', lat: 48.5734, lon: 7.7521, population: 290576 },
  {
    ville: 'Dijon',
    region: 'Bourgogne-Franche-Comté',
    lat: 47.322,
    lon: 5.0415,
    population: 158002,
  },
  {
    ville: 'Orléans',
    region: 'Centre-Val de Loire',
    lat: 47.9029,
    lon: 1.9093,
    population: 116685,
  },
  { ville: 'Rouen', region: 'Normandie', lat: 49.4431, lon: 1.0993, population: 112321 },
  { ville: 'Ajaccio', region: 'Corse', lat: 41.9192, lon: 8.7386, population: 71361 },
];

function loadSavedSources(): AnySource[] {
  const raw = loadFromStorage<AnySource[]>(STORAGE_KEYS.SOURCES, []);
  return raw.map((s) => migrateSource(s as Partial<Source>) as unknown as AnySource);
}

/**
 * Copie « légère » d'une source enregistrée : les données chargées par l'app
 * Sources (data/rawRecords) peuvent peser des Mo — inutiles au générateur et
 * fatales à la persistance localStorage de l'état du builder.
 */
function lightweightSource(s: AnySource): AnySource {
  const { data: _d, rawRecords: _r, ...rest } = s;
  return rest;
}

// Expose state for E2E tests
(window as Window & { __BUILDER_CARTO_STATE__?: typeof state }).__BUILDER_CARTO_STATE__ = state;

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
(window as Window & { toggleSection?: typeof toggleSection }).toggleSection = toggleSection;

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

const LAYER_TYPE_LABELS: Record<LayerType, string> = {
  marker: 'marqueurs',
  geoshape: 'zones',
  circle: 'cercles',
  heatmap: 'chaleur',
};

/**
 * Input texte assisté par datalist : suggestions = champs détectés de la
 * couche (avec type et taux de remplissage), saisie libre toujours possible.
 */
function fieldInput(opts: {
  id: string;
  label: string;
  value: string;
  fields: FieldInfo[];
  hint?: string;
  placeholder?: string;
  numericOnly?: boolean;
}): string {
  const candidates = opts.numericOnly
    ? opts.fields.filter((f) => f.type === 'number')
    : opts.fields;
  const options = candidates
    .map(
      (f) =>
        `<option value="${escapeAttr(f.name)}" label="${escapeAttr(
          `${f.name} — ${f.type}, ${Math.round(f.fillRate * 100)} % renseigné`
        )}"></option>`
    )
    .join('');
  return `
    <div class="carto-field">
      <label for="${opts.id}">${opts.label}
        ${opts.hint ? `<span class="fr-hint-text">${opts.hint}</span>` : ''}
      </label>
      <input type="text" id="${opts.id}" value="${escapeAttr(opts.value)}"
             list="${opts.id}-list" ${opts.placeholder ? `placeholder="${escapeAttr(opts.placeholder)}"` : ''}
             autocomplete="off">
      <datalist id="${opts.id}-list">${options}</datalist>
    </div>`;
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
          <span class="carto-layers__item-type">${LAYER_TYPE_LABELS[layer.type]}${layer.noInteractive ? ' · décor' : ''}</span>
        </div>
        <span class="carto-layers__item-source">${layer.source ? escapeAttr(String(layer.source.name || layer.source.datasetId || 'Source configurée')) : '<span style="color:var(--text-default-warning)">Aucune source</span>'}</span>
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
      persistState();
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
  const hasTimeline = state.layers.some((l) => l.visible && l.timeField);
  const insetCount = m.insets.length;
  const otherTerritories = INSET_TERRITORIES.filter((t) => !t.drom);
  const allDromChecked = DROM_IDS.every((id) => m.insets.includes(id));

  container.innerHTML = `
    <div class="config-section" id="section-map-config">
      <div class="config-section-header" onclick="toggleSection('section-map-config')">
        <h3><i class="ri-map-2-line"></i> Carte</h3>
        <i class="ri-arrow-down-s-line collapse-icon"></i>
      </div>
      <div class="config-section-content">
        <div class="carto-field">
          <label for="map-name">Nom (accessibilité)
            <span class="fr-hint-text">Décrit la carte aux lecteurs d'écran</span>
          </label>
          <input type="text" id="map-name" value="${escapeAttr(m.name)}" placeholder="Ma carte">
        </div>
        <div class="carto-field">
          <label for="map-tiles">Fond de carte</label>
          <select id="map-tiles" class="fr-select fr-select--sm">
            <optgroup label="IGN (souverain)">
              <option value="ign-plan" ${m.tiles === 'ign-plan' || m.tiles === 'ign-topo' ? 'selected' : ''}>IGN Plan</option>
              <option value="ign-ortho" ${m.tiles === 'ign-ortho' ? 'selected' : ''}>IGN Ortho (satellite)</option>
              <option value="ign-cadastre" ${m.tiles === 'ign-cadastre' ? 'selected' : ''}>IGN Cadastre</option>
            </optgroup>
            <optgroup label="Autres">
              <option value="osm" ${m.tiles === 'osm' ? 'selected' : ''}>OpenStreetMap France</option>
              <option value="osm-standard" ${m.tiles === 'osm-standard' ? 'selected' : ''}>OpenStreetMap</option>
              <option value="carto-positron" ${m.tiles === 'carto-positron' ? 'selected' : ''}>CARTO clair (dataviz)</option>
              <option value="carto-dark" ${m.tiles === 'carto-dark' ? 'selected' : ''}>CARTO sombre</option>
              <option value="opentopomap" ${m.tiles === 'opentopomap' ? 'selected' : ''}>OpenTopoMap (relief)</option>
            </optgroup>
          </select>
        </div>
        <div class="carto-inline">
          <div class="carto-field">
            <label for="map-center">Centre (lat,lon)
              <span class="fr-hint-text">46.6,2.4 = France entière</span>
            </label>
            <input type="text" id="map-center" value="${escapeAttr(m.center)}">
          </div>
          <div class="carto-field">
            <label for="map-zoom">Zoom
              <span class="fr-hint-text">6 = France, 12 = ville</span>
            </label>
            <input type="number" id="map-zoom" value="${m.zoom}" min="1" max="18">
          </div>
        </div>
        <div class="carto-field">
          <label for="map-height">Hauteur
            <span class="fr-hint-text">px, vh, ou % de la largeur (ex : 500px, 60%)</span>
          </label>
          <input type="text" id="map-height" value="${escapeAttr(m.height)}" placeholder="500px">
        </div>
        <div class="carto-checkbox">
          <input type="checkbox" id="map-fit-bounds" ${m.fitBounds ? 'checked' : ''}>
          <label for="map-fit-bounds">Cadrer automatiquement sur les données (fit-bounds)</label>
        </div>
      </div>
    </div>

    <div class="config-section collapsed" id="section-insets">
      <div class="config-section-header" onclick="toggleSection('section-insets')">
        <h3><i class="ri-collage-line"></i> Encarts territoriaux${insetCount ? ` <span class="carto-badge">${insetCount}</span>` : ''}</h3>
        <i class="ri-arrow-down-s-line collapse-icon"></i>
      </div>
      <div class="config-section-content">
        <p class="fr-text--xs fr-mb-1w" style="color:var(--text-mention-grey)">
          Affiche les territoires ultramarins et la Corse en vignettes à côté de la carte.
          Les couches y sont automatiquement reprises.
        </p>
        <div class="carto-checkbox">
          <input type="checkbox" id="inset-drom" ${allDromChecked ? 'checked' : ''}>
          <label for="inset-drom"><strong>Les 5 DROM</strong> (Guadeloupe, Martinique, Guyane, La Réunion, Mayotte)</label>
        </div>
        <details class="carto-advanced" ${m.insets.some((id) => !DROM_IDS.includes(id)) ? 'open' : ''}>
          <summary>Territoire par territoire</summary>
          ${INSET_TERRITORIES.map(
            (t) => `
          <div class="carto-checkbox">
            <input type="checkbox" id="inset-${t.id}" data-inset="${t.id}" ${m.insets.includes(t.id) ? 'checked' : ''}>
            <label for="inset-${t.id}">${t.label}</label>
          </div>`
          ).join('')}
        </details>
        ${otherTerritories.length ? '' : ''}
      </div>
    </div>

    <div class="config-section collapsed" id="section-map-advanced">
      <div class="config-section-header" onclick="toggleSection('section-map-advanced')">
        <h3><i class="ri-equalizer-line"></i> Réglages avancés</h3>
        <i class="ri-arrow-down-s-line collapse-icon"></i>
      </div>
      <div class="config-section-content">
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
            <span class="fr-hint-text">Borne la navigation ET le cadrage automatique : lat-sud,lon-ouest,lat-nord,lon-est</span>
          </label>
          <input type="text" id="map-max-bounds" value="${escapeAttr(m.maxBounds)}" placeholder="41.0,-5.5,51.5,10.0">
        </div>
        <div class="carto-checkbox">
          <input type="checkbox" id="map-no-controls" ${m.noControls ? 'checked' : ''}>
          <label for="map-no-controls">Masquer les contrôles de zoom (no-controls)</label>
        </div>
        <div class="carto-checkbox">
          <input type="checkbox" id="map-locked" ${m.locked ? 'checked' : ''}>
          <label for="map-locked">Carte figée, aucune interaction (locked)
            <span class="fr-hint-text">Pour une vignette ou une carte purement illustrative</span>
          </label>
        </div>
        <div class="carto-checkbox">
          <input type="checkbox" id="map-sovereign" ${m.sovereignOnly ? 'checked' : ''}>
          <label for="map-sovereign">Fonds souverains uniquement (sovereign-only)
            <span class="fr-hint-text">Restreint aux fonds IGN, exigence de certaines administrations</span>
          </label>
        </div>
        <div class="carto-checkbox">
          <input type="checkbox" id="map-a11y" ${m.a11y ? 'checked' : ''}>
          <label for="map-a11y">Compagnon d'accessibilité (recommandé)
            <span class="fr-hint-text">Ajoute le tableau des données et l'export CSV sous la carte</span>
          </label>
        </div>
        ${
          hasTimeline
            ? `
        <hr class="fr-mt-1w fr-mb-1w">
        <p class="fr-text--sm fr-mb-1w"><i class="ri-play-circle-line"></i> Lecture temporelle</p>
        <div class="carto-inline">
          <div class="carto-field">
            <label for="map-timeline-speed">Vitesse</label>
            <select id="map-timeline-speed" class="fr-select fr-select--sm">
              ${[0.5, 1, 2, 4].map((v) => `<option value="${v}" ${m.timelineSpeed === v ? 'selected' : ''}>× ${v}</option>`).join('')}
            </select>
          </div>
          <div class="carto-field">
            <label for="map-timeline-interval">Intervalle (ms)</label>
            <input type="number" id="map-timeline-interval" value="${m.timelineInterval}" min="50" max="10000" step="50">
          </div>
        </div>
        `
            : ''
        }
      </div>
    </div>

    <div class="config-section collapsed" id="section-gen-mode">
      <div class="config-section-header" onclick="toggleSection('section-gen-mode')">
        <h3><i class="ri-code-s-slash-line"></i> Mode de génération</h3>
        <i class="ri-arrow-down-s-line collapse-icon"></i>
      </div>
      <div class="config-section-content">
        <div class="carto-field">
          <label class="fr-label fr-label--sm" for="gen-mode">Mode</label>
          <select id="gen-mode" class="fr-select fr-select--sm">
            <option value="embedded" ${state.generationMode === 'embedded' ? 'selected' : ''}>Embarqué (composants seuls)</option>
            <option value="dynamic" ${state.generationMode === 'dynamic' ? 'selected' : ''}>Autonome (avec scripts/CSS)</option>
          </select>
        </div>
      </div>
    </div>
  `;

  // Bind map config
  const bindMap = (id: string, key: keyof typeof m, transform?: (v: string) => unknown) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return;
    el.addEventListener('change', () => {
      const val =
        (el as HTMLInputElement).type === 'checkbox'
          ? (el as HTMLInputElement).checked
          : transform
            ? transform(el.value)
            : el.value;
      (m as unknown as Record<string, unknown>)[key] = val;
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
  bindMap('map-locked', 'locked');
  bindMap('map-sovereign', 'sovereignOnly');
  bindMap('map-a11y', 'a11y');
  bindMap('map-timeline-speed', 'timelineSpeed', Number);
  bindMap('map-timeline-interval', 'timelineInterval', Number);

  // Encarts : groupe DROM + territoires individuels
  const dromEl = document.getElementById('inset-drom') as HTMLInputElement | null;
  dromEl?.addEventListener('change', () => {
    if (dromEl.checked) {
      for (const id of DROM_IDS) if (!m.insets.includes(id)) m.insets.push(id);
    } else {
      m.insets = m.insets.filter((id) => !DROM_IDS.includes(id));
    }
    renderMapConfig();
    keepSectionOpen('section-insets');
    updateCodePreview();
  });
  container.querySelectorAll('[data-inset]').forEach((el) => {
    el.addEventListener('change', () => {
      const id = (el as HTMLInputElement).getAttribute('data-inset')!;
      if ((el as HTMLInputElement).checked) {
        if (!m.insets.includes(id)) m.insets.push(id);
      } else {
        m.insets = m.insets.filter((i) => i !== id);
      }
      renderMapConfig();
      keepSectionOpen('section-insets');
      updateCodePreview();
    });
  });

  const genEl = document.getElementById('gen-mode') as HTMLSelectElement;
  genEl?.addEventListener('change', () => {
    state.generationMode = genEl.value as 'embedded' | 'dynamic';
    updateCodePreview();
  });
}

/** Après un re-render de colonne, rouvre la section demandée (UX accordéon). */
function keepSectionOpen(sectionId: string) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const parent = section.parentElement;
  parent?.querySelectorAll('.config-section').forEach((s) => s.classList.add('collapsed'));
  section.classList.remove('collapsed');
}

// ---------------------------------------------------------------------------
// Col 2: Active layer config (accordions)
// ---------------------------------------------------------------------------

/** Section actuellement ouverte dans la colonne couche (persistée au re-render). */
function currentOpenLayerSection(): string | null {
  const open = document.querySelector('#layer-config .config-section:not(.collapsed)');
  return open?.id ?? null;
}

function renderLayerConfig(openSection?: string | null) {
  const container = document.getElementById('layer-config')!;
  const layer = getActiveLayer();
  if (!layer) {
    container.innerHTML =
      '<p class="carto-col-config__empty"><i class="ri-information-line"></i><br>Sélectionnez une couche.</p>';
    return;
  }

  const savedSources = loadSavedSources();
  const isPopupOrPanel =
    layer.popupMode === 'popup' ||
    layer.popupMode === 'panel-right' ||
    layer.popupMode === 'panel-left';
  const isPanel = layer.popupMode === 'panel-right' || layer.popupMode === 'panel-left';
  const fields = layer.fields;
  const fieldsBadge = fields.length
    ? `<span class="carto-badge carto-badge--ok">${fields.length} champs</span>`
    : '';

  container.innerHTML = `
    <!-- Section: Données -->
    <div class="config-section" id="section-source">
      <div class="config-section-header" onclick="toggleSection('section-source')">
        <h3><i class="ri-database-2-line"></i> Données ${fieldsBadge}</h3>
        <i class="ri-arrow-down-s-line collapse-icon"></i>
      </div>
      <div class="config-section-content">
        <div class="carto-field">
          <label for="layer-source">Source enregistrée
            <span class="fr-hint-text">Créées dans l'application Sources</span>
          </label>
          <select id="layer-source" class="fr-select fr-select--sm">
            <option value="">-- Choisir une source --</option>
            ${savedSources.map((s: AnySource) => `<option value="${s.id}" ${layer.source?.id === s.id ? 'selected' : ''}>${escapeAttr(String(s.name || s.datasetId || s.url || ''))}</option>`).join('')}
          </select>
        </div>
        <div class="carto-field">
          <label for="layer-source-url">…ou URL d'un jeu de données
            <span class="fr-hint-text">Lien OpenDataSoft, data.gouv (tabular), Grist ou API JSON</span>
          </label>
          <div class="carto-url-row">
            <input type="text" id="layer-source-url" value="${escapeAttr(layer.source?.adHoc && layer.source?.apiUrl ? layer.source.apiUrl : '')}" placeholder="https://data.economie.gouv.fr/explore/dataset/…">
            <button class="fr-btn fr-btn--sm fr-btn--secondary" id="btn-source-url" title="Utiliser cette URL">OK</button>
          </div>
        </div>
        <button class="fr-btn fr-btn--sm fr-btn--tertiary fr-btn--icon-left fr-icon-lightbulb-line fr-mb-1w" id="btn-source-sample">Essayer avec le jeu d'exemple</button>
        <div id="source-scan-status" class="carto-scan-status" aria-live="polite"></div>
        <hr class="fr-mt-1w fr-mb-1w">
        <div class="carto-field">
          <label for="layer-type">Type de couche</label>
          <select id="layer-type" class="fr-select fr-select--sm">
            <option value="marker" ${layer.type === 'marker' ? 'selected' : ''}>Marqueurs (points d'intérêt)</option>
            <option value="geoshape" ${layer.type === 'geoshape' ? 'selected' : ''}>Zones colorées (contours, choroplèthe)</option>
            <option value="circle" ${layer.type === 'circle' ? 'selected' : ''}>Cercles proportionnels</option>
            <option value="heatmap" ${layer.type === 'heatmap' ? 'selected' : ''}>Carte de chaleur</option>
          </select>
        </div>
        <div class="carto-field">
          <label for="layer-name">Nom de la couche</label>
          <input type="text" id="layer-name" value="${escapeAttr(layer.name)}">
        </div>
      </div>
    </div>

    <!-- Section: Localisation -->
    <div class="config-section collapsed" id="section-geo">
      <div class="config-section-header" onclick="toggleSection('section-geo')">
        <h3><i class="ri-map-pin-2-line"></i> Localisation</h3>
        <i class="ri-arrow-down-s-line collapse-icon"></i>
      </div>
      <div class="config-section-content">
        ${fieldInput({
          id: 'layer-geo-field',
          label: 'Champ géographique',
          value: layer.geoField,
          fields,
          hint: 'Colonne contenant la géométrie (GeoJSON, point, texte JSON)',
          placeholder: 'geo_point_2d, geo_shape…',
        })}
        <p class="fr-text--xs fr-mb-1w" style="color:var(--text-mention-grey)">ou coordonnées séparées :</p>
        <div class="carto-inline">
          ${fieldInput({ id: 'layer-lat', label: 'Latitude', value: layer.latField, fields, numericOnly: true, placeholder: 'latitude' })}
          ${fieldInput({ id: 'layer-lon', label: 'Longitude', value: layer.lonField, fields, numericOnly: true, placeholder: 'longitude' })}
        </div>
        <p class="fr-text--xs" style="color:var(--text-mention-grey)">
          <i class="ri-magic-line"></i> Ces champs sont proposés automatiquement après l'analyse de la source.
        </p>
      </div>
    </div>

    <!-- Section: Informations -->
    <div class="config-section collapsed" id="section-info">
      <div class="config-section-header" onclick="toggleSection('section-info')">
        <h3><i class="ri-information-line"></i> Informations</h3>
        <i class="ri-arrow-down-s-line collapse-icon"></i>
      </div>
      <div class="config-section-content">
        ${
          layer.noInteractive
            ? `<p class="fr-text--sm" style="color:var(--text-mention-grey)"><i class="ri-eye-off-line"></i>
               Couche décorative : aucune interaction (voir Apparence &gt; Avancé).</p>`
            : `
        <div class="carto-field">
          <label for="layer-popup-mode">Au clic ou au survol, afficher…</label>
          <select id="layer-popup-mode" class="fr-select fr-select--sm">
            <option value="none" ${layer.popupMode === 'none' ? 'selected' : ''}>Rien</option>
            <option value="tooltip" ${layer.popupMode === 'tooltip' ? 'selected' : ''}>Une infobulle au survol</option>
            <option value="popup" ${layer.popupMode === 'popup' ? 'selected' : ''}>Une popup au clic</option>
            <option value="panel-right" ${layer.popupMode === 'panel-right' ? 'selected' : ''}>Un panneau latéral droit</option>
            <option value="panel-left" ${layer.popupMode === 'panel-left' ? 'selected' : ''}>Un panneau latéral gauche</option>
          </select>
        </div>

        ${
          layer.popupMode === 'tooltip'
            ? fieldInput({
                id: 'layer-tooltip',
                label: 'Champ affiché en infobulle',
                value: layer.tooltipField,
                fields,
                placeholder: 'nom, denomination…',
              })
            : ''
        }

        ${
          isPopupOrPanel
            ? `
        ${fieldInput({
          id: 'layer-title-field',
          label: 'Champ titre',
          value: layer.titleField,
          fields,
          hint: 'Titre en haut de la popup ou du panneau',
          placeholder: 'nom',
        })}
        <div class="carto-field">
          <label for="layer-popup-fields">Champs affichés
            <span class="fr-hint-text">Noms de colonnes séparés par des virgules. Vide = toutes les colonnes.</span>
          </label>
          <input type="text" id="layer-popup-fields" value="${escapeAttr(layer.popupFields)}" placeholder="nom,adresse,prix">
        </div>
        <details class="carto-advanced" ${layer.popupTemplate ? 'open' : ''}>
          <summary>Mise en forme avancée (template HTML)</summary>
          <div class="carto-field">
            <label for="layer-popup-template">Template
              <span class="fr-hint-text">{{champ}} insère la valeur, {{champ:number}} formate un nombre</span>
            </label>
            <textarea id="layer-popup-template" placeholder="&lt;h3&gt;{{nom}}&lt;/h3&gt;&#10;&lt;p&gt;{{adresse}}&lt;/p&gt;">${escapeAttr(layer.popupTemplate)}</textarea>
          </div>
          ${
            isPanel
              ? `
          <div class="carto-field">
            <label for="layer-popup-width">Largeur du panneau</label>
            <input type="text" id="layer-popup-width" value="${escapeAttr(layer.popupWidth)}" placeholder="350px">
          </div>`
              : ''
          }
        </details>
        `
            : ''
        }`
        }
      </div>
    </div>

    <!-- Section: Apparence -->
    <div class="config-section collapsed" id="section-style">
      <div class="config-section-header" onclick="toggleSection('section-style')">
        <h3><i class="ri-palette-line"></i> Apparence</h3>
        <i class="ri-arrow-down-s-line collapse-icon"></i>
      </div>
      <div class="config-section-content">
        <div class="carto-field">
          <label for="layer-color">Couleur ${layer.colorField ? '(par défaut)' : ''}</label>
          <input type="color" id="layer-color" value="${layer.color}">
        </div>

        ${
          layer.type === 'geoshape'
            ? `
        ${fieldInput({
          id: 'layer-fill-field',
          label: 'Colorer selon un champ numérique (choroplèthe)',
          value: layer.fillField,
          fields,
          numericOnly: true,
          hint: 'Chaque zone prend une teinte selon sa valeur',
        })}
        ${
          layer.fillField
            ? `
        <div class="carto-field">
          <label for="layer-palette">Palette</label>
          <select id="layer-palette" class="fr-select fr-select--sm">
            <option value="" ${!layer.selectedPalette ? 'selected' : ''}>Séquentielle (clair → foncé) — défaut</option>
            <option value="sequentialAscending" ${layer.selectedPalette === 'sequentialAscending' ? 'selected' : ''}>Séquentielle (clair → foncé)</option>
            <option value="sequentialDescending" ${layer.selectedPalette === 'sequentialDescending' ? 'selected' : ''}>Séquentielle (foncé → clair)</option>
            <option value="divergentAscending" ${layer.selectedPalette === 'divergentAscending' ? 'selected' : ''}>Divergente (négatif ↔ positif)</option>
            <option value="divergentDescending" ${layer.selectedPalette === 'divergentDescending' ? 'selected' : ''}>Divergente inversée</option>
            <option value="neutral" ${layer.selectedPalette === 'neutral' ? 'selected' : ''}>Neutre (gris)</option>
            <option value="categorical" ${layer.selectedPalette === 'categorical' ? 'selected' : ''}>Catégorielle</option>
          </select>
        </div>`
            : ''
        }
        `
            : ''
        }

        ${
          layer.type !== 'heatmap'
            ? `
        ${fieldInput({
          id: 'layer-color-field',
          label: 'Colorer par catégorie',
          value: layer.colorField,
          fields,
          hint: 'Champ dont chaque valeur reçoit sa couleur',
        })}
        ${
          layer.colorField
            ? `
        <div class="carto-field">
          <label for="layer-color-map">Couleur par valeur
            <span class="fr-hint-text">valeur:#couleur séparées par des virgules. Ex : EPCI:#000091,Commune:#00A95F</span>
          </label>
          <textarea id="layer-color-map" rows="3" class="fr-input" placeholder="val1:#couleur1,val2:#couleur2">${escapeAttr(layer.colorMap)}</textarea>
        </div>
        `
            : ''
        }`
            : ''
        }

        ${
          layer.type === 'marker'
            ? `
        <div class="carto-checkbox">
          <input type="checkbox" id="layer-cluster" ${layer.cluster ? 'checked' : ''}>
          <label for="layer-cluster">Regrouper les marqueurs proches (clustering)</label>
        </div>
        <div class="carto-field" ${!layer.cluster ? 'style="display:none"' : ''} id="cluster-radius-group">
          <label for="layer-cluster-radius">Rayon de regroupement (px)</label>
          <input type="number" id="layer-cluster-radius" value="${layer.clusterRadius}" min="10" max="200">
        </div>
        `
            : ''
        }

        ${
          layer.type === 'circle'
            ? `
        ${fieldInput({
          id: 'layer-radius-field',
          label: 'Taille selon un champ numérique',
          value: layer.radiusField,
          fields,
          numericOnly: true,
          hint: 'La taille du cercle varie selon la valeur',
        })}
        <div class="carto-inline">
          <div class="carto-field">
            <label for="layer-radius-unit">Unité</label>
            <select id="layer-radius-unit" class="fr-select fr-select--sm">
              <option value="px" ${layer.radiusUnit === 'px' ? 'selected' : ''}>Pixels (px)</option>
              <option value="m" ${layer.radiusUnit === 'm' ? 'selected' : ''}>Mètres réels (m)</option>
            </select>
          </div>
          <div class="carto-field">
            <label for="layer-radius">Rayon fixe</label>
            <input type="number" id="layer-radius" value="${layer.radius}" min="1">
          </div>
        </div>
        ${
          layer.radiusUnit === 'px'
            ? `
        <div class="carto-inline">
          <div class="carto-field">
            <label for="layer-radius-min">Rayon min (px)</label>
            <input type="number" id="layer-radius-min" value="${layer.radiusMin}" min="1" max="100">
          </div>
          <div class="carto-field">
            <label for="layer-radius-max">Rayon max (px)</label>
            <input type="number" id="layer-radius-max" value="${layer.radiusMax}" min="1" max="200">
          </div>
        </div>`
            : ''
        }
        `
            : ''
        }

        ${
          layer.type === 'heatmap'
            ? `
        ${fieldInput({
          id: 'layer-heat-field',
          label: 'Champ de pondération',
          value: layer.heatField,
          fields,
          numericOnly: true,
          hint: 'Intensité de chaleur selon ce champ (vide = chaque point compte 1)',
        })}
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
        `
            : ''
        }

        ${
          layer.type !== 'heatmap'
            ? `
        <details class="carto-advanced" ${layer.shapeClass || layer.noInteractive || layer.fillOpacity !== 0.6 ? 'open' : ''}>
          <summary>Avancé</summary>
          ${
            layer.type !== 'marker'
              ? `
          <div class="carto-field">
            <label for="layer-fill-opacity">Opacité de remplissage
              <span class="fr-hint-text">0 = contours seuls, 1 = opaque</span>
            </label>
            <input type="number" id="layer-fill-opacity" value="${layer.fillOpacity}" min="0" max="1" step="0.1">
          </div>
          <div class="carto-field">
            <label for="layer-shape-class">Classe CSS des tracés (shape-class)
              <span class="fr-hint-text">Pour appliquer un style de la page (hachures, pointillés…)</span>
            </label>
            <input type="text" id="layer-shape-class" value="${escapeAttr(layer.shapeClass)}" placeholder="territoire-hachure">
          </div>`
              : ''
          }
          <div class="carto-checkbox">
            <input type="checkbox" id="layer-no-interactive" ${layer.noInteractive ? 'checked' : ''}>
            <label for="layer-no-interactive">Couche décorative (no-interactive)
              <span class="fr-hint-text">Habillage : ni clic, ni infobulle, ignorée par le cadrage automatique</span>
            </label>
          </div>
        </details>`
            : ''
        }
      </div>
    </div>

    <!-- Section: Animation temporelle -->
    <div class="config-section collapsed" id="section-time">
      <div class="config-section-header" onclick="toggleSection('section-time')">
        <h3><i class="ri-history-line"></i> Animation temporelle${layer.timeField ? ' <span class="carto-badge carto-badge--ok">active</span>' : ''}</h3>
        <i class="ri-arrow-down-s-line collapse-icon"></i>
      </div>
      <div class="config-section-content">
        ${fieldInput({
          id: 'layer-time-field',
          label: 'Champ date/heure',
          value: layer.timeField,
          fields,
          hint: 'Renseigner ce champ active les contrôles de lecture sous la carte',
        })}
        ${
          layer.timeField
            ? `
        <div class="carto-inline">
          <div class="carto-field">
            <label for="layer-time-bucket">Granularité</label>
            <select id="layer-time-bucket" class="fr-select fr-select--sm">
              <option value="none" ${layer.timeBucket === 'none' ? 'selected' : ''}>Valeurs brutes</option>
              <option value="hour" ${layer.timeBucket === 'hour' ? 'selected' : ''}>Heure</option>
              <option value="day" ${layer.timeBucket === 'day' ? 'selected' : ''}>Jour</option>
              <option value="month" ${layer.timeBucket === 'month' ? 'selected' : ''}>Mois</option>
              <option value="year" ${layer.timeBucket === 'year' ? 'selected' : ''}>Année</option>
            </select>
          </div>
          <div class="carto-field">
            <label for="layer-time-mode">Mode</label>
            <select id="layer-time-mode" class="fr-select fr-select--sm">
              <option value="snapshot" ${layer.timeMode === 'snapshot' ? 'selected' : ''}>Instantané (pas à pas)</option>
              <option value="cumulative" ${layer.timeMode === 'cumulative' ? 'selected' : ''}>Cumulatif (tout jusqu'à la date)</option>
            </select>
          </div>
        </div>
        <p class="fr-text--xs" style="color:var(--text-mention-grey)">Vitesse et intervalle : colonne de gauche, Réglages avancés.</p>
        `
            : ''
        }
      </div>
    </div>

    <!-- Section: Filtres & performances -->
    <div class="config-section collapsed" id="section-perf">
      <div class="config-section-header" onclick="toggleSection('section-perf')">
        <h3><i class="ri-filter-3-line"></i> Filtres &amp; performances</h3>
        <i class="ri-arrow-down-s-line collapse-icon"></i>
      </div>
      <div class="config-section-content">
        <div class="carto-field">
          <label for="layer-filter">Filtrer les données
            <span class="fr-hint-text">Syntaxe champ:opérateur:valeur — ex : type:eq:Commune, prix:gt:100</span>
          </label>
          <input type="text" id="layer-filter" value="${escapeAttr(layer.filter)}" placeholder="champ:eq:valeur, champ2:gt:100">
        </div>

        <div class="carto-field">
          <label for="layer-max-items">Nombre max d'éléments affichés
            <span class="fr-hint-text">Au-delà, un bandeau « N affichés sur M » apparaît</span>
          </label>
          <input type="number" id="layer-max-items" value="${layer.maxItems}" min="1" max="100000">
        </div>

        <details class="carto-advanced" ${layer.bbox || layer.minZoom !== 0 || layer.maxZoom !== 18 ? 'open' : ''}>
          <summary>Chargement et zoom (avancé)</summary>
          <div class="carto-checkbox">
            <input type="checkbox" id="layer-bbox" ${layer.bbox ? 'checked' : ''}>
            <label for="layer-bbox">Charger selon la zone visible (bbox)
              <span class="fr-hint-text">Pour les très gros jeux de données : seuls les éléments visibles sont chargés</span>
            </label>
          </div>
          ${
            layer.bbox
              ? `
          <div class="carto-inline">
            <div class="carto-field">
              <label for="layer-bbox-debounce">Délai après déplacement (ms)</label>
              <input type="number" id="layer-bbox-debounce" value="${layer.bboxDebounce}" min="0" max="2000">
            </div>
            ${fieldInput({ id: 'layer-bbox-field', label: 'Champ géo du filtre', value: layer.bboxField, fields, hint: 'Vide = champ géo de la couche' })}
          </div>
          `
              : ''
          }
          <div class="carto-inline">
            <div class="carto-field">
              <label for="layer-min-zoom">Visible à partir du zoom</label>
              <input type="number" id="layer-min-zoom" value="${layer.minZoom}" min="0" max="18">
            </div>
            <div class="carto-field">
              <label for="layer-max-zoom">Jusqu'au zoom</label>
              <input type="number" id="layer-max-zoom" value="${layer.maxZoom}" min="0" max="18">
            </div>
          </div>
        </details>
      </div>
    </div>
  `;

  if (openSection) keepSectionOpen(openSection);

  // Bind change events
  bindLayerInputs(layer);
}

// ---------------------------------------------------------------------------
// Bind layer inputs
// ---------------------------------------------------------------------------

/** Re-render la config couche en conservant la section ouverte. */
function rerenderLayerConfig() {
  renderLayerConfig(currentOpenLayerSection());
}

function bindLayerInputs(layer: LayerConfig) {
  const bind = (id: string, key: keyof LayerConfig, transform?: (v: string) => unknown) => {
    const el = document.getElementById(id) as
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (!el) return;
    const eventType = el.tagName === 'TEXTAREA' ? 'input' : 'change';
    el.addEventListener(eventType, () => {
      const val =
        (el as HTMLInputElement).type === 'checkbox'
          ? (el as HTMLInputElement).checked
          : transform
            ? transform(el.value)
            : el.value;
      (layer as unknown as Record<string, unknown>)[key] = val;
      updateCodePreview();
    });
  };

  // Source enregistrée
  const sourceEl = document.getElementById('layer-source') as HTMLSelectElement | null;
  sourceEl?.addEventListener('change', () => {
    const savedSources = loadSavedSources();
    const found = savedSources.find((s: AnySource) => s.id === sourceEl.value);
    layer.source = found ? lightweightSource(found) : null;
    layer.fields = [];
    renderLayersList();
    updateCodePreview();
    if (layer.source) void scanAndSuggest(layer);
    else rerenderLayerConfig();
  });

  // Source par URL directe
  const urlBtn = document.getElementById('btn-source-url');
  const urlInput = document.getElementById('layer-source-url') as HTMLInputElement | null;
  const applyUrl = () => {
    const url = urlInput?.value.trim();
    if (!url) return;
    layer.source = {
      id: `url-${layer.id}`,
      name: url.replace(/^https?:\/\//, '').slice(0, 60),
      type: 'api',
      apiUrl: url,
      adHoc: true,
    };
    layer.fields = [];
    renderLayersList();
    updateCodePreview();
    void scanAndSuggest(layer);
  };
  urlBtn?.addEventListener('click', applyUrl);
  urlInput?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') applyUrl();
  });

  // Jeu d'exemple
  document.getElementById('btn-source-sample')?.addEventListener('click', () => {
    layer.source = {
      id: `sample-${layer.id}`,
      name: "Jeu d'exemple — chefs-lieux",
      type: 'manual',
      data: SAMPLE_DATA,
      adHoc: true,
    };
    layer.fields = [];
    renderLayersList();
    updateCodePreview();
    void scanAndSuggest(layer);
  });

  // Type change re-renders entire config (different options sections)
  const typeEl = document.getElementById('layer-type');
  typeEl?.addEventListener('change', () => {
    layer.type = (typeEl as HTMLSelectElement).value as LayerType;
    rerenderLayerConfig();
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
    rerenderLayerConfig();
    updateCodePreview();
  });

  bind('layer-tooltip', 'tooltipField');
  bind('layer-popup-fields', 'popupFields');
  bind('layer-title-field', 'titleField');
  bind('layer-popup-template', 'popupTemplate');
  bind('layer-popup-width', 'popupWidth');

  // Apparence
  bind('layer-color', 'color');
  const colorFieldEl = document.getElementById('layer-color-field') as HTMLInputElement | null;
  colorFieldEl?.addEventListener('change', () => {
    layer.colorField = colorFieldEl.value;
    rerenderLayerConfig(); // show/hide color-map textarea
    updateCodePreview();
  });
  bind('layer-color-map', 'colorMap');
  bind('layer-filter', 'filter');
  bind('layer-shape-class', 'shapeClass');
  const noInteractiveEl = document.getElementById(
    'layer-no-interactive'
  ) as HTMLInputElement | null;
  noInteractiveEl?.addEventListener('change', () => {
    layer.noInteractive = noInteractiveEl.checked;
    rerenderLayerConfig();
    renderLayersList();
    updateCodePreview();
  });

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
  const fillFieldEl = document.getElementById('layer-fill-field') as HTMLInputElement | null;
  fillFieldEl?.addEventListener('change', () => {
    layer.fillField = fillFieldEl.value;
    rerenderLayerConfig(); // show/hide palette
    updateCodePreview();
  });
  bind('layer-fill-opacity', 'fillOpacity', Number);
  bind('layer-palette', 'selectedPalette');

  // Circle
  bind('layer-radius', 'radius', Number);
  bind('layer-radius-field', 'radiusField');
  const radiusUnitEl = document.getElementById('layer-radius-unit') as HTMLSelectElement | null;
  radiusUnitEl?.addEventListener('change', () => {
    layer.radiusUnit = radiusUnitEl.value as 'px' | 'm';
    rerenderLayerConfig(); // min/max seulement en px
    updateCodePreview();
  });
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
    rerenderLayerConfig(); // show/hide bucket+mode fields
    renderMapConfig(); // section timeline des réglages avancés carte
    updateCodePreview();
  });
  bind('layer-time-bucket', 'timeBucket');
  bind('layer-time-mode', 'timeMode');

  // Viewport
  const bboxEl = document.getElementById('layer-bbox') as HTMLInputElement | null;
  bboxEl?.addEventListener('change', () => {
    layer.bbox = bboxEl.checked;
    rerenderLayerConfig();
    updateCodePreview();
  });
  bind('layer-bbox-debounce', 'bboxDebounce', Number);
  bind('layer-bbox-field', 'bboxField');

  bind('layer-min-zoom', 'minZoom', Number);
  bind('layer-max-zoom', 'maxZoom', Number);
  bind('layer-max-items', 'maxItems', Number);
}

// ---------------------------------------------------------------------------
// Assistance : analyse des champs de la source
// ---------------------------------------------------------------------------

function setScanStatus(html: string) {
  const el = document.getElementById('source-scan-status');
  if (el) el.innerHTML = html;
}

async function scanAndSuggest(layer: LayerConfig) {
  setScanStatus('<i class="ri-loader-4-line carto-spin"></i> Analyse des champs de la source…');
  try {
    const result = await scanLayerFields(layer);
    layer.fields = result.fields;

    // Suggestions automatiques si rien n'est encore configuré
    const s = result.suggestions;
    let suggested = '';
    if (!layer.geoField && !layer.latField && !layer.lonField) {
      if (s.geo) {
        layer.geoField = s.geo;
        suggested = `champ géo détecté : <code>${escapeAttr(s.geo)}</code>`;
      } else if (s.lat && s.lon) {
        layer.latField = s.lat;
        layer.lonField = s.lon;
        suggested = `coordonnées détectées : <code>${escapeAttr(s.lat)}</code> / <code>${escapeAttr(s.lon)}</code>`;
      }
    }

    rerenderLayerConfig();
    setScanStatus(
      `<i class="ri-check-line" style="color:var(--text-default-success)"></i> ${result.fields.length} champs (échantillon de ${result.sampleSize})${suggested ? ' — ' + suggested : ''}`
    );
    updateCodePreview();
    // Aperçu immédiat dès qu'une localisation est connue
    if (layer.geoField || (layer.latField && layer.lonField)) executePreview();
  } catch (err) {
    layer.fields = [];
    rerenderLayerConfig();
    setScanStatus(
      `<i class="ri-error-warning-line" style="color:var(--text-default-error)"></i> ${escapeAttr((err as Error).message)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Code preview
// ---------------------------------------------------------------------------

function updateCodePreview() {
  const codeEl = document.getElementById('code-output');
  if (codeEl) {
    codeEl.textContent = generateCode();
  }
  persistState();
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

function resetBuilder() {
  if (!confirm('Repartir de zéro ? La configuration actuelle sera perdue.')) return;
  resetState();
  renderLayersList();
  renderLayerConfig();
  renderMapConfig();
  updateCodePreview();
  const preview = document.getElementById('map-preview');
  if (preview)
    preview.innerHTML =
      '<p class="fr-text--sm" style="text-align:center;padding:2rem;color:var(--text-mention-grey)">Cliquez sur « Exécuter » pour afficher l\'aperçu de la carte.</p>';
  setPreviewStatus('');
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
  if (!code.trim()) {
    toastWarning(
      'Cliquez d’abord sur « Exécuter » pour générer la carte, puis vous pourrez la sauvegarder en favori.'
    );
    return;
  }

  const name = prompt('Nom du favori :', state.map.name || 'Ma carte');
  if (!name) return;

  const favorites = loadFromStorage<Favorite[]>(FAVORITES_KEY, []);

  const favorite: Favorite = {
    id: crypto.randomUUID(),
    name,
    code,
    chartType: 'map',
    sourceApp: 'builder-carto',
    createdAt: new Date().toISOString(),
    builderStateJson: JSON.parse(JSON.stringify(state)),
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

// ---------------------------------------------------------------------------
// Aperçu + diagnostic
// ---------------------------------------------------------------------------

function setPreviewStatus(html: string, tone: 'ok' | 'warn' | 'err' | '' = '') {
  const el = document.getElementById('preview-status');
  if (!el) return;
  el.innerHTML = html;
  el.className = `carto-preview-status${tone ? ` carto-preview-status--${tone}` : ''}`;
}

let statusTimers: ReturnType<typeof setTimeout>[] = [];

/**
 * Diagnostic post-exécution : compare les éléments dessinés par Leaflet aux
 * enregistrements chargés — c'est LE signal qui manquait quand un champ géo
 * était mal choisi (carte vide silencieuse).
 */
function updatePreviewStatus() {
  statusTimers.forEach(clearTimeout);
  statusTimers = [];

  const check = (attempt: number) => {
    const preview = document.getElementById('map-preview');
    if (!preview) return;

    const sources = [...preview.querySelectorAll('dsfr-data-source')] as (HTMLElement & {
      getData?: () => unknown[];
      getError?: () => Error | null;
      isLoading?: () => boolean;
    })[];
    const errors = sources.map((s) => s.getError?.()).filter(Boolean) as Error[];
    const loading = sources.some((s) => s.isLoading?.());
    const records = sources.reduce((acc, s) => {
      const d = s.getData?.();
      return acc + (Array.isArray(d) ? d.length : 0);
    }, 0);

    const drawn =
      preview.querySelectorAll('.leaflet-marker-icon').length +
      preview.querySelectorAll('.leaflet-overlay-pane path').length +
      preview.querySelectorAll('.leaflet-heatmap-layer, .leaflet-overlay-pane canvas').length;

    if (errors.length) {
      setPreviewStatus(
        `<i class="ri-error-warning-line"></i> Erreur de chargement : ${escapeAttr(errors[0].message ?? String(errors[0]))}`,
        'err'
      );
      return;
    }
    if (loading && attempt < 4) return; // on laisse les timers suivants re-vérifier

    if (records > 0 && drawn === 0) {
      setPreviewStatus(
        `<i class="ri-alert-line"></i> ${records} enregistrements chargés mais aucun élément dessiné — vérifiez le champ de localisation (section Localisation).`,
        'warn'
      );
    } else if (records === 0 && sources.length && attempt >= 4) {
      setPreviewStatus(`<i class="ri-alert-line"></i> Aucune donnée reçue de la source.`, 'warn');
    } else if (drawn > 0) {
      setPreviewStatus(
        `<i class="ri-check-line"></i> ${drawn.toLocaleString('fr-FR')} éléments affichés (${records.toLocaleString('fr-FR')} enregistrements)`,
        'ok'
      );
    }
  };

  [800, 2000, 4000, 8000, 15000].forEach((ms, i) => {
    statusTimers.push(setTimeout(() => check(i + 1), ms));
  });
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
  setPreviewStatus('<i class="ri-loader-4-line carto-spin"></i> Chargement…');
  updatePreviewStatus();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  // Hook saveToStorage to /api/* sync (when authenticated). Without this,
  // favorites saved here stay only in localStorage and get wiped by the
  // ApiStorageAdapter prefetch the next time another app loads.
  await initAuth();

  const restored = restoreState();

  renderLayersList();
  renderLayerConfig();
  renderMapConfig();
  updateCodePreview();

  document.getElementById('btn-add-layer')?.addEventListener('click', addLayer);
  document.getElementById('btn-remove-layer')?.addEventListener('click', removeActiveLayer);
  document.getElementById('btn-reset')?.addEventListener('click', resetBuilder);
  document.getElementById('btn-copy')?.addEventListener('click', copyCode);
  document.getElementById('btn-execute')?.addEventListener('click', executePreview);

  // app-preview-panel events
  const previewPanel = document.querySelector('app-preview-panel');
  if (previewPanel) {
    previewPanel.addEventListener('save-favorite', saveFavorite);
    previewPanel.addEventListener('open-playground', sendToPlayground);
  }

  // Reprise de session : re-analyse les champs de la couche active et relance
  // l'aperçu pour retrouver l'écran tel qu'on l'avait laissé. Attendre que
  // app-preview-panel soit rendu : une carte injectée dans un conteneur encore
  // à 0×0 ne déclenche jamais l'init Leaflet (IntersectionObserver).
  if (restored) {
    const layer = getActiveLayer();
    if (layer?.source) {
      await customElements.whenDefined('app-preview-panel');
      setTimeout(() => void scanAndSuggest(layer), 150);
    }
  }

  // Product tour
  injectTourStyles();
  startTourIfFirstVisit(BUILDER_CARTO_TOUR);
});

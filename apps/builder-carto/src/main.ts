/**
 * Builder Carto — refonte « carte plein écran »
 *
 * La carte générée EST l'aperçu : elle occupe tout l'écran et le cadrage
 * exporté suit la navigation (sync moveend/zoomend → state). L'édition se
 * fait dans trois panneaux flottants (Carte / Couches / Éléments), le choix
 * des données dans une modale d'onboarding, l'export dans une modale dédiée.
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
  startTour,
  BUILDER_CARTO_TOUR,
  initAuth,
  toastWarning,
  type Source,
  confirmDialog,
} from '@dsfr-data/shared';

const FAVORITES_KEY = 'dsfr-data-favorites';

/**
 * Presets de fond de carte deprecies cote lib : ils resolvent vers `ign-plan` au runtime
 * (#429 pour ign-topo, #576 pour CARTO). Le `<select>` ne les propose plus mais doit
 * rester coherent pour les cartes deja enregistrees, qui les portent encore.
 */
const DEPRECATED_TILES: readonly string[] = ['ign-topo', 'carto-positron', 'carto-dark'];

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

/** Accès en lecture au viewport Leaflet de la carte d'aperçu. */
interface DsfrDataMapElement extends HTMLElement {
  getLeafletMap?: () => {
    on: (event: string, handler: () => void) => void;
    getCenter: () => { lat: number; lng: number };
    getZoom: () => number;
  } | null;
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
// État d'interface transitoire (jamais persisté)
// ---------------------------------------------------------------------------

const ui = {
  /** Modale « D'où viennent vos données ? » forcée (Changer / Ajouter) */
  forceChooser: false,
  /** Ligne de saisie d'URL dépliée dans la modale */
  urlMode: false,
  /** Liste des sources enregistrées dépliée dans la modale */
  savedOpen: false,
  /** Modale « Obtenir le code » ouverte */
  /** Une carte a déjà été exécutée : re-exécution auto sur modification */
  executed: false,
};

// ---------------------------------------------------------------------------
// Helpers
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

const TYPE_TILES: { k: LayerType; icon: string; label: string; desc: string }[] = [
  { k: 'marker', icon: 'ri-map-pin-2-line', label: 'Marqueurs', desc: 'Des repères sur des lieux' },
  {
    k: 'geoshape',
    icon: 'ri-shape-2-line',
    label: 'Zones',
    desc: 'Contours et surfaces colorés',
  },
  {
    k: 'circle',
    icon: 'ri-record-circle-line',
    label: 'Cercles',
    desc: 'Taille selon une valeur',
  },
  { k: 'heatmap', icon: 'ri-fire-line', label: 'Chaleur', desc: 'Densité des points' },
];

const SWATCHES: { c: string; n: string }[] = [
  { c: '#000091', n: 'Bleu France' },
  { c: '#e1000f', n: 'Rouge Marianne' },
  { c: '#18753c', n: 'Vert' },
  { c: '#0063cb', n: 'Bleu info' },
  { c: '#b34000', n: 'Orange' },
  { c: '#666666', n: 'Gris' },
];

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

/** La couche a-t-elle une localisation exploitable ? */
function hasLocation(layer: LayerConfig): boolean {
  return Boolean(layer.geoField || (layer.latField && layer.lonField));
}

// ---------------------------------------------------------------------------
// Rendu global
// ---------------------------------------------------------------------------

function renderAll() {
  renderLayersPanel();
  renderElementsPanel();
  renderMapPanel();
  renderOnboard();
}

// ---------------------------------------------------------------------------
// Panneau Couches : liste + données + localisation
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

      const [moved] = state.layers.splice(draggedLayerIndex, 1);
      state.layers.splice(index, 0, moved);
      draggedLayerIndex = null;

      renderLayersPanel();
      updateCodePreview();
    });
  });
}

function renderLayersPanel() {
  const list = document.getElementById('layers-list')!;
  const removable = state.layers.length > 1;
  list.innerHTML = state.layers
    .map(
      (layer) => `
    <li class="carto-layers__item ${layer.id === state.activeLayerId ? 'carto-layers__item--active' : ''}"
        data-layer-id="${layer.id}">
      <div class="carto-layers__item-info">
        <div class="carto-layers__item-header">
          <span class="carto-layers__item-name">${escapeAttr(layer.name)}</span>
          <span class="carto-layers__item-type">${LAYER_TYPE_LABELS[layer.type]}${layer.noInteractive ? ' · décor' : ''}</span>
        </div>
        <span class="carto-layers__item-source ${layer.source ? '' : 'carto-layers__item-source--missing'}">${
          layer.source
            ? escapeAttr(String(layer.source.name || layer.source.datasetId || 'Source configurée'))
            : 'Aucune source'
        }</span>
      </div>
      <button class="carto-icon-btn app-btn--icon app-btn--icon--sm app-btn--icon--muted" data-eye-id="${layer.id}" type="button"
              title="${layer.visible ? 'Masquer la couche' : 'Afficher la couche'}"
              aria-label="${layer.visible ? 'Masquer la couche' : 'Afficher la couche'} ${escapeAttr(layer.name)}">
        <i class="${layer.visible ? 'ri-eye-line' : 'ri-eye-off-line'}" aria-hidden="true"></i>
      </button>
      ${
        removable
          ? `<button class="carto-icon-btn app-btn--icon app-btn--icon--sm app-btn--icon--muted" data-del-id="${layer.id}" type="button"
              title="Supprimer la couche" aria-label="Supprimer la couche ${escapeAttr(layer.name)}">
              <i class="ri-delete-bin-line" aria-hidden="true"></i>
            </button>`
          : ''
      }
    </li>
  `
    )
    .join('');

  // Sélection de couche
  list.querySelectorAll('.carto-layers__item').forEach((el) => {
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.carto-icon-btn')) return;
      state.activeLayerId = el.getAttribute('data-layer-id')!;
      renderAll();
      persistState();
    });
  });

  // Afficher / masquer
  list.querySelectorAll('[data-eye-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const layer = state.layers.find((l) => l.id === btn.getAttribute('data-eye-id'));
      if (layer) {
        layer.visible = !layer.visible;
        renderLayersPanel();
        updateCodePreview();
      }
    });
  });

  // Supprimer
  list.querySelectorAll('[data-del-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-del-id')!;
      if (state.layers.length <= 1) return;
      state.layers = state.layers.filter((l) => l.id !== id);
      if (state.activeLayerId === id) state.activeLayerId = state.layers[0].id;
      renderAll();
      updateCodePreview();
    });
  });

  initDragListeners();
  renderLayerDataConfig();
}

/** Sections Données + Localisation de la couche active (panneau Couches). */
function renderLayerDataConfig() {
  const container = document.getElementById('layer-data-config')!;
  const layer = getActiveLayer();
  if (!layer) {
    container.innerHTML = '';
    return;
  }

  const fields = layer.fields;
  const sourceName = layer.source
    ? String(layer.source.name || layer.source.datasetId || layer.source.apiUrl || 'Source')
    : '';
  const sourceDetail = fields.length
    ? `${fields.length} champs détectés`
    : 'Analyse des champs en cours…';

  container.innerHTML = `
    <div class="carto-section">
      <div class="carto-section__label">
        <span>Données</span>
        ${layer.source ? '<button id="btn-change-source" class="carto-text-link" type="button">Changer</button>' : ''}
      </div>
      ${
        layer.source
          ? `
      <div class="carto-source-ok">
        <i class="ri-check-line" aria-hidden="true"></i>
        <div class="carto-source-ok__body">
          <div class="carto-source-ok__name">${escapeAttr(sourceName)}</div>
          <div class="carto-source-ok__detail">${sourceDetail}</div>
        </div>
      </div>`
          : `
      <button id="btn-choose-source" class="carto-source-choose app-card-choice app-card-choice--dashed" type="button">
        <i class="ri-database-2-line" aria-hidden="true"></i> Choisir les données de cette couche
      </button>
      <button id="btn-sample-source" class="app-card-choice fr-mt-1w" type="button">
        <i class="ri-lightbulb-line" aria-hidden="true"></i>
        <span class="carto-choice__body">
          <span class="carto-choice__title">Essayer avec un jeu d'exemple</span>
          <span class="carto-choice__desc">Les chefs-lieux des régions françaises</span>
        </span>
      </button>`
      }
      <div id="source-scan-status" class="carto-scan-status" aria-live="polite"></div>
      <div class="carto-field fr-mt-1w">
        <label for="layer-name">Nom de la couche</label>
        <input type="text" id="layer-name" value="${escapeAttr(layer.name)}">
      </div>
    </div>
    ${
      layer.source
        ? `
    <div class="carto-section">
      <div class="carto-section__label"><span>Localisation</span></div>
      ${
        hasLocation(layer)
          ? `<p class="carto-msg carto-msg--ok"><i class="ri-magic-line" aria-hidden="true"></i> Champs détectés automatiquement — modifiez si besoin</p>`
          : `<p class="carto-msg carto-msg--warn"><i class="ri-alert-line" aria-hidden="true"></i> Requis : sans localisation, rien ne s'affiche sur la carte</p>`
      }
      <div class="carto-inline">
        ${fieldInput({ id: 'layer-lat', label: 'Latitude', value: layer.latField, fields, numericOnly: true, placeholder: 'ex : latitude' })}
        ${fieldInput({ id: 'layer-lon', label: 'Longitude', value: layer.lonField, fields, numericOnly: true, placeholder: 'ex : longitude' })}
      </div>
      <details class="carto-advanced" ${layer.geoField ? 'open' : ''}>
        <summary>…ou un champ géographique unique</summary>
        ${fieldInput({
          id: 'layer-geo-field',
          label: 'Champ géographique',
          value: layer.geoField,
          fields,
          hint: 'Colonne contenant la géométrie (GeoJSON, point, texte JSON)',
          placeholder: 'ex : geo_point_2d, geo_shape…',
        })}
      </details>
    </div>`
        : ''
    }
  `;

  document.getElementById('btn-change-source')?.addEventListener('click', () => {
    ui.forceChooser = true;
    renderOnboard();
  });
  document.getElementById('btn-choose-source')?.addEventListener('click', () => {
    ui.forceChooser = true;
    renderOnboard();
  });
  document
    .getElementById('btn-sample-source')
    ?.addEventListener('click', () => applySampleData(layer));

  const nameEl = document.getElementById('layer-name') as HTMLInputElement | null;
  nameEl?.addEventListener('change', () => {
    layer.name = nameEl.value;
    renderLayersPanel();
    updateCodePreview();
  });

  const bindGeo = (id: string, key: 'latField' | 'lonField' | 'geoField') => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    el?.addEventListener('change', () => {
      layer[key] = el.value;
      renderLayerDataConfig();
      updateCodePreview();
    });
  };
  bindGeo('layer-lat', 'latField');
  bindGeo('layer-lon', 'lonField');
  bindGeo('layer-geo-field', 'geoField');
}

// ---------------------------------------------------------------------------
// Panneau Éléments : représentation, couleur, interactions, animation, avancé
// ---------------------------------------------------------------------------

/** Cases à cocher « Champs à afficher » (fiche/panneau), repli input texte. */
function popupFieldsHtml(layer: LayerConfig): string {
  const known = layer.fields.map((f) => f.name);
  const chosen = layer.popupFields
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (!known.length) {
    return `
      <div class="carto-field">
        <label for="layer-popup-fields">Champs à afficher
          <span class="fr-hint-text">Noms de colonnes séparés par des virgules. Vide = toutes les colonnes.</span>
        </label>
        <input type="text" id="layer-popup-fields" value="${escapeAttr(layer.popupFields)}" placeholder="nom,adresse,prix">
      </div>`;
  }
  const all = [...new Set([...known, ...chosen])];
  return `
    <div class="carto-field">
      <span class="carto-field__legend" style="display:block;font-size:0.8125rem;font-weight:600;margin-bottom:0.25rem">Champs à afficher
        <span class="fr-hint-text">Aucun coché = toutes les colonnes</span>
      </span>
      <div class="carto-field-checks">
        ${all
          .map(
            (f) => `
        <label><input type="checkbox" data-pf="${escapeAttr(f)}" ${chosen.includes(f) ? 'checked' : ''}>${escapeAttr(f)}</label>`
          )
          .join('')}
      </div>
    </div>`;
}

function renderElementsPanel() {
  const container = document.getElementById('layer-config')!;
  const layer = getActiveLayer();
  if (!layer) {
    container.innerHTML =
      '<p class="carto-msg carto-msg--muted carto-section"><i class="ri-information-line" aria-hidden="true"></i> Sélectionnez une couche.</p>';
    return;
  }
  if (!layer.source) {
    container.innerHTML =
      '<p class="carto-msg carto-msg--muted carto-section"><i class="ri-information-line" aria-hidden="true"></i> Choisissez d\'abord les données de la couche.</p>';
    return;
  }

  const fields = layer.fields;
  const isPopupOrPanel =
    layer.popupMode === 'popup' ||
    layer.popupMode === 'panel-right' ||
    layer.popupMode === 'panel-left';
  const isPanel = layer.popupMode === 'panel-right' || layer.popupMode === 'panel-left';
  const customColor = !SWATCHES.some((sw) => sw.c === layer.color);
  const advancedOpen =
    layer.filter ||
    layer.maxItems !== 5000 ||
    layer.minZoom !== 0 ||
    layer.maxZoom !== 18 ||
    layer.bbox ||
    layer.noInteractive ||
    layer.shapeClass ||
    (layer.type === 'circle' && layer.fillOpacity !== 0.6);

  container.innerHTML = `
    <div class="carto-section fr-pt-1w">
      <div class="carto-section__label"><span>Représentation</span></div>
      <div class="carto-tiles">
        ${TYPE_TILES.map(
          (t) => `
        <button type="button" class="carto-tile ${layer.type === t.k ? 'carto-tile--active' : ''}"
                data-type="${t.k}" title="${t.desc}">
          <i class="${t.icon}" aria-hidden="true"></i>
          <span class="carto-tile__label">${t.label}</span>
          <span class="carto-tile__desc">${t.desc}</span>
        </button>`
        ).join('')}
      </div>

      ${
        layer.type === 'marker'
          ? `
      <div class="fr-mt-1w">
        <div class="carto-checkbox">
          <input type="checkbox" id="layer-cluster" ${layer.cluster ? 'checked' : ''}>
          <label for="layer-cluster">Regrouper les points proches (clustering)</label>
        </div>
        ${
          layer.cluster
            ? `
        <div class="carto-field">
          <label for="layer-cluster-radius">Rayon de regroupement (px)</label>
          <input type="number" id="layer-cluster-radius" value="${layer.clusterRadius}" min="10" max="200">
        </div>`
            : ''
        }
      </div>`
          : ''
      }

      ${
        layer.type === 'circle'
          ? `
      <div class="fr-mt-1w">
        ${fieldInput({
          id: 'layer-radius-field',
          label: 'Taille selon un champ numérique',
          value: layer.radiusField,
          fields,
          numericOnly: true,
          hint: 'La taille du cercle varie selon la valeur',
          placeholder: 'population',
        })}
        <div class="carto-inline">
          <div class="carto-field">
            <label for="layer-radius-unit">Unité</label>
            <select id="layer-radius-unit">
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
      </div>`
          : ''
      }

      ${
        layer.type === 'heatmap'
          ? `
      <div class="fr-mt-1w">
        ${fieldInput({
          id: 'layer-heat-field',
          label: 'Champ de pondération',
          value: layer.heatField,
          fields,
          numericOnly: true,
          hint: 'Vide = chaque point compte 1',
          placeholder: 'population',
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
      </div>`
          : ''
      }

      ${
        layer.type === 'geoshape'
          ? `
      <div class="fr-mt-1w">
        ${fieldInput({
          id: 'layer-fill-field',
          label: 'Colorer selon un champ numérique (choroplèthe)',
          value: layer.fillField,
          fields,
          numericOnly: true,
          hint: 'Chaque zone prend une teinte selon sa valeur',
          placeholder: 'population',
        })}
        <div class="carto-field">
          <label for="layer-palette">Palette</label>
          <select id="layer-palette">
            <option value="" ${!layer.selectedPalette ? 'selected' : ''}>Séquentielle (clair → foncé) — défaut</option>
            <option value="sequentialDescending" ${layer.selectedPalette === 'sequentialDescending' ? 'selected' : ''}>Séquentielle (foncé → clair)</option>
            <option value="divergentAscending" ${layer.selectedPalette === 'divergentAscending' ? 'selected' : ''}>Divergente (négatif ↔ positif)</option>
            <option value="divergentDescending" ${layer.selectedPalette === 'divergentDescending' ? 'selected' : ''}>Divergente inversée</option>
            <option value="neutral" ${layer.selectedPalette === 'neutral' ? 'selected' : ''}>Neutre (gris)</option>
            <option value="categorical" ${layer.selectedPalette === 'categorical' ? 'selected' : ''}>Catégorielle</option>
          </select>
        </div>
        <div class="carto-field" style="max-width:120px">
          <label for="layer-fill-opacity">Opacité</label>
          <input type="number" id="layer-fill-opacity" value="${layer.fillOpacity}" min="0" max="1" step="0.1">
        </div>
      </div>`
          : ''
      }
    </div>

    ${
      layer.type !== 'heatmap'
        ? `
    <div class="carto-section">
      <div class="carto-section__label"><span>Couleur</span></div>
      <div class="carto-swatches">
        ${SWATCHES.map(
          (sw) => `
        <button type="button" class="carto-swatch ${layer.color === sw.c ? 'carto-swatch--active' : ''}"
                data-swatch="${sw.c}" style="background:${sw.c}" title="${sw.n}" aria-label="${sw.n}"></button>`
        ).join('')}
        <input type="color" id="layer-color" class="carto-swatch-custom ${customColor ? 'carto-swatch--active' : ''}"
               value="${layer.color}" title="Couleur personnalisée" aria-label="Couleur personnalisée">
      </div>
      <details class="carto-advanced fr-mt-1w" ${layer.colorField ? 'open' : ''}>
        <summary>Colorer par catégorie</summary>
        ${fieldInput({
          id: 'layer-color-field',
          label: 'Champ catégorie',
          value: layer.colorField,
          fields,
          hint: 'Chaque valeur du champ reçoit sa couleur',
          placeholder: 'region',
        })}
        ${
          layer.colorField
            ? `
        <div class="carto-field">
          <label for="layer-color-map">Couleur par valeur
            <span class="fr-hint-text">valeur:#couleur séparées par des virgules</span>
          </label>
          <textarea id="layer-color-map" rows="2" placeholder="Corse:#e1000f,Bretagne:#000091">${escapeAttr(layer.colorMap)}</textarea>
        </div>`
            : ''
        }
      </details>
    </div>`
        : ''
    }

    <div class="carto-section">
      <div class="carto-section__label"><span>Au clic sur un élément</span></div>
      ${
        layer.noInteractive
          ? `<p class="carto-msg carto-msg--muted"><i class="ri-eye-off-line" aria-hidden="true"></i>
             Couche décorative : aucune interaction (voir Options avancées).</p>`
          : `
      <div class="carto-field">
        <label for="layer-popup-mode" class="fr-sr-only">Comportement au clic</label>
        <select id="layer-popup-mode">
          <option value="none" ${layer.popupMode === 'none' ? 'selected' : ''}>Ne rien afficher</option>
          <option value="tooltip" ${layer.popupMode === 'tooltip' ? 'selected' : ''}>Le nom, au survol</option>
          <option value="popup" ${layer.popupMode === 'popup' ? 'selected' : ''}>Une fiche (popup) au clic</option>
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
      <details class="carto-advanced" open>
        <summary>Contenu de la fiche</summary>
        ${fieldInput({
          id: 'layer-title-field',
          label: 'Champ titre',
          value: layer.titleField,
          fields,
          placeholder: 'nom',
        })}
        ${popupFieldsHtml(layer)}
        <details class="carto-advanced" ${layer.popupTemplate ? 'open' : ''}>
          <summary>Mise en forme avancée (template HTML)</summary>
          <div class="carto-field">
            <label for="layer-popup-template">Template
              <span class="fr-hint-text">Écrivez le nom du champ entre doubles accolades pour insérer sa valeur ; ajoutez :number pour formater un nombre</span>
            </label>
            <textarea id="layer-popup-template" rows="3" placeholder="&lt;h3&gt;{{nom}}&lt;/h3&gt;&#10;&lt;p&gt;{{adresse}}&lt;/p&gt;">${escapeAttr(layer.popupTemplate)}</textarea>
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
      </details>`
          : ''
      }`
      }
    </div>

    <details class="carto-advanced carto-section" ${layer.timeField ? 'open' : ''}>
      <summary>Animation temporelle</summary>
      ${fieldInput({
        id: 'layer-time-field',
        label: 'Champ date/heure',
        value: layer.timeField,
        fields,
        hint: 'Renseigner ce champ active les contrôles de lecture sur la carte',
        placeholder: 'date_mesure',
      })}
      ${
        layer.timeField
          ? `
      <div class="carto-inline">
        <div class="carto-field">
          <label for="layer-time-bucket">Granularité</label>
          <select id="layer-time-bucket">
            <option value="none" ${layer.timeBucket === 'none' ? 'selected' : ''}>Valeurs brutes</option>
            <option value="hour" ${layer.timeBucket === 'hour' ? 'selected' : ''}>Heure</option>
            <option value="day" ${layer.timeBucket === 'day' ? 'selected' : ''}>Jour</option>
            <option value="month" ${layer.timeBucket === 'month' ? 'selected' : ''}>Mois</option>
            <option value="year" ${layer.timeBucket === 'year' ? 'selected' : ''}>Année</option>
          </select>
        </div>
        <div class="carto-field">
          <label for="layer-time-mode">Mode</label>
          <select id="layer-time-mode">
            <option value="snapshot" ${layer.timeMode === 'snapshot' ? 'selected' : ''}>Instantané (pas à pas)</option>
            <option value="cumulative" ${layer.timeMode === 'cumulative' ? 'selected' : ''}>Cumulatif</option>
          </select>
        </div>
      </div>
      <div class="carto-inline">
        <div class="carto-field">
          <label for="map-timeline-speed">Vitesse</label>
          <select id="map-timeline-speed">
            ${[0.5, 1, 2, 4].map((v) => `<option value="${v}" ${state.map.timelineSpeed === v ? 'selected' : ''}>× ${v}</option>`).join('')}
          </select>
        </div>
        <div class="carto-field">
          <label for="map-timeline-interval">Intervalle (ms)</label>
          <input type="number" id="map-timeline-interval" value="${state.map.timelineInterval}" min="50" max="10000" step="50">
        </div>
      </div>`
          : ''
      }
    </details>

    <details class="carto-advanced carto-section" ${advancedOpen ? 'open' : ''}>
      <summary>Options avancées</summary>
      <div class="carto-field">
        <label for="layer-filter">Filtrer les données
          <span class="fr-hint-text">champ:opérateur:valeur — ex : population:gt:200000</span>
        </label>
        <input type="text" id="layer-filter" value="${escapeAttr(layer.filter)}" placeholder="champ:eq:valeur">
      </div>
      <div class="carto-field">
        <label for="layer-max-items">Nombre max d'éléments affichés
          <span class="fr-hint-text">Au-delà, un bandeau « N affichés sur M » apparaît</span>
        </label>
        <input type="number" id="layer-max-items" value="${layer.maxItems}" min="1" max="100000">
      </div>
      <div class="carto-inline">
        <div class="carto-field">
          <label for="layer-min-zoom">Visible dès le zoom</label>
          <input type="number" id="layer-min-zoom" value="${layer.minZoom}" min="0" max="18">
        </div>
        <div class="carto-field">
          <label for="layer-max-zoom">Jusqu'au zoom</label>
          <input type="number" id="layer-max-zoom" value="${layer.maxZoom}" min="0" max="18">
        </div>
      </div>
      ${
        layer.type === 'geoshape' || layer.type === 'circle'
          ? `
      ${
        layer.type === 'circle'
          ? `
      <div class="carto-field">
        <label for="layer-fill-opacity">Opacité de remplissage
          <span class="fr-hint-text">0 = contours seuls, 1 = opaque</span>
        </label>
        <input type="number" id="layer-fill-opacity" value="${layer.fillOpacity}" min="0" max="1" step="0.1">
      </div>`
          : ''
      }
      <div class="carto-field">
        <label for="layer-shape-class">Classe CSS des tracés (shape-class)
          <span class="fr-hint-text">Pour appliquer un style de la page (hachures, pointillés…)</span>
        </label>
        <input type="text" id="layer-shape-class" value="${escapeAttr(layer.shapeClass)}" placeholder="territoire-hachure">
      </div>`
          : ''
      }
      <div class="carto-checkbox">
        <input type="checkbox" id="layer-bbox" ${layer.bbox ? 'checked' : ''}>
        <label for="layer-bbox">Charger selon la zone visible (bbox) — gros jeux de données</label>
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
      </div>`
          : ''
      }
      <div class="carto-checkbox">
        <input type="checkbox" id="layer-no-interactive" ${layer.noInteractive ? 'checked' : ''}>
        <label for="layer-no-interactive">Couche décorative — ni clic, ni infobulle</label>
      </div>
    </details>
  `;

  bindElementsInputs(layer);
}

function bindElementsInputs(layer: LayerConfig) {
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

  /** Comme bind, mais re-render le panneau (sections conditionnelles). */
  const bindRerender = (id: string, apply: (value: string, checked: boolean) => void) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    el?.addEventListener('change', () => {
      apply(el.value, (el as HTMLInputElement).checked ?? false);
      renderElementsPanel();
      updateCodePreview();
    });
  };

  // Représentation
  document.querySelectorAll('#layer-config [data-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      layer.type = btn.getAttribute('data-type') as LayerType;
      renderLayersPanel();
      renderElementsPanel();
      updateCodePreview();
    });
  });
  bindRerender('layer-cluster', (_v, checked) => {
    layer.cluster = checked;
  });
  bind('layer-cluster-radius', 'clusterRadius', Number);
  bind('layer-radius', 'radius', Number);
  bind('layer-radius-field', 'radiusField');
  bindRerender('layer-radius-unit', (v) => {
    layer.radiusUnit = v as 'px' | 'm';
  });
  bind('layer-radius-min', 'radiusMin', Number);
  bind('layer-radius-max', 'radiusMax', Number);
  bind('layer-heat-radius', 'heatRadius', Number);
  bind('layer-heat-blur', 'heatBlur', Number);
  bind('layer-heat-field', 'heatField');
  bind('layer-fill-field', 'fillField');
  bind('layer-palette', 'selectedPalette');
  bind('layer-fill-opacity', 'fillOpacity', Number);

  // Couleur
  document.querySelectorAll('#layer-config [data-swatch]').forEach((btn) => {
    btn.addEventListener('click', () => {
      layer.color = btn.getAttribute('data-swatch')!;
      renderElementsPanel();
      updateCodePreview();
    });
  });
  const colorEl = document.getElementById('layer-color') as HTMLInputElement | null;
  colorEl?.addEventListener('change', () => {
    layer.color = colorEl.value;
    renderElementsPanel();
    updateCodePreview();
  });
  bindRerender('layer-color-field', (v) => {
    layer.colorField = v;
  });
  bind('layer-color-map', 'colorMap');

  // Interactions
  bindRerender('layer-popup-mode', (v) => {
    layer.popupMode = v as PopupMode;
  });
  bind('layer-tooltip', 'tooltipField');
  bind('layer-title-field', 'titleField');
  bind('layer-popup-fields', 'popupFields');
  bind('layer-popup-template', 'popupTemplate');
  bind('layer-popup-width', 'popupWidth');

  // Champs à afficher (cases à cocher)
  const checks = document.querySelectorAll<HTMLInputElement>('#layer-config [data-pf]');
  checks.forEach((cb) => {
    cb.addEventListener('change', () => {
      layer.popupFields = [...checks]
        .filter((c) => c.checked)
        .map((c) => c.getAttribute('data-pf')!)
        .join(',');
      updateCodePreview();
    });
  });

  // Animation temporelle
  bindRerender('layer-time-field', (v) => {
    layer.timeField = v;
  });
  bind('layer-time-bucket', 'timeBucket');
  bind('layer-time-mode', 'timeMode');
  const speedEl = document.getElementById('map-timeline-speed') as HTMLSelectElement | null;
  speedEl?.addEventListener('change', () => {
    state.map.timelineSpeed = Number(speedEl.value);
    updateCodePreview();
  });
  const intervalEl = document.getElementById('map-timeline-interval') as HTMLInputElement | null;
  intervalEl?.addEventListener('change', () => {
    state.map.timelineInterval = Number(intervalEl.value) || 1000;
    updateCodePreview();
  });

  // Options avancées
  bind('layer-filter', 'filter');
  bind('layer-max-items', 'maxItems', Number);
  bind('layer-min-zoom', 'minZoom', Number);
  bind('layer-max-zoom', 'maxZoom', Number);
  bind('layer-shape-class', 'shapeClass');
  bindRerender('layer-bbox', (_v, checked) => {
    layer.bbox = checked;
  });
  bind('layer-bbox-debounce', 'bboxDebounce', Number);
  bind('layer-bbox-field', 'bboxField');
  bindRerender('layer-no-interactive', (_v, checked) => {
    layer.noInteractive = checked;
    renderLayersPanel();
  });
}

// ---------------------------------------------------------------------------
// Panneau Carte
// ---------------------------------------------------------------------------

function renderMapPanel() {
  const m = state.map;
  const container = document.getElementById('map-config')!;
  const allDromChecked = DROM_IDS.every((id) => m.insets.includes(id));
  const otherInsets = m.insets.filter((id) => !DROM_IDS.includes(id) && id !== 'corse');

  container.innerHTML = `
    <div class="carto-section">
      <div class="carto-field">
        <label for="map-tiles">Fond de carte</label>
        <select id="map-tiles">
          <optgroup label="IGN (souverain)">
            <option value="ign-plan" ${DEPRECATED_TILES.includes(m.tiles) || m.tiles === 'ign-plan' ? 'selected' : ''}>IGN Plan</option>
            <option value="ign-ortho" ${m.tiles === 'ign-ortho' ? 'selected' : ''}>IGN Ortho (satellite)</option>
            <option value="ign-cadastre" ${m.tiles === 'ign-cadastre' ? 'selected' : ''}>IGN Cadastre</option>
          </optgroup>
          <optgroup label="Communautaires (best effort, sans garantie)">
            <option value="osm" ${m.tiles === 'osm' ? 'selected' : ''}>OpenStreetMap France — site public sans login</option>
            <option value="osm-standard" ${m.tiles === 'osm-standard' ? 'selected' : ''}>OpenStreetMap</option>
            <option value="opentopomap" ${m.tiles === 'opentopomap' ? 'selected' : ''}>OpenTopoMap (relief)</option>
          </optgroup>
        </select>
      </div>
      <div class="carto-field">
        <label for="map-name">Nom de la carte
          <span class="fr-hint-text">Décrit la carte aux lecteurs d'écran</span>
        </label>
        <input type="text" id="map-name" value="${escapeAttr(m.name)}" placeholder="Ma carte">
      </div>
      <div class="carto-checkbox">
        <input type="checkbox" id="inset-drom" ${allDromChecked ? 'checked' : ''}>
        <label for="inset-drom">Les 5 DROM en vignettes (encarts)</label>
      </div>
      <div class="carto-checkbox">
        <input type="checkbox" id="inset-corse" ${m.insets.includes('corse') ? 'checked' : ''}>
        <label for="inset-corse">La Corse en vignette</label>
      </div>
      <details class="carto-advanced" ${otherInsets.length ? 'open' : ''}>
        <summary>Territoire par territoire</summary>
        ${INSET_TERRITORIES.map(
          // Prefixe inset-terr- : « corse » a deja sa case dediee plus haut
          // (id="inset-corse") — l'id duplique cassait le label de la seconde
          // case et invalidait le DOM (#482 bug 12)
          (t) => `
        <div class="carto-checkbox">
          <input type="checkbox" id="inset-terr-${t.id}" data-inset="${t.id}" ${m.insets.includes(t.id) ? 'checked' : ''}>
          <label for="inset-terr-${t.id}">${t.label}</label>
        </div>`
        ).join('')}
      </details>
      <div class="carto-checkbox">
        <input type="checkbox" id="map-a11y" ${m.a11y ? 'checked' : ''}>
        <label for="map-a11y">Tableau des données sous la carte (accessibilité)
          <span class="fr-hint-text">Dans le code exporté : tableau + export CSV liés à la carte</span>
        </label>
      </div>
      <details class="carto-advanced">
        <summary>Réglages avancés de la carte</summary>
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
            <span class="fr-hint-text">lat-sud,lon-ouest,lat-nord,lon-est</span>
          </label>
          <input type="text" id="map-max-bounds" value="${escapeAttr(m.maxBounds)}" placeholder="41.0,-5.5,51.5,10.0">
        </div>
        <div class="carto-field">
          <label for="map-height">Hauteur de la carte exportée
            <span class="fr-hint-text">px, vh, ou % de la largeur (ex : 500px, 60%)</span>
          </label>
          <input type="text" id="map-height" value="${escapeAttr(m.height)}" placeholder="500px">
        </div>
        <div class="carto-checkbox">
          <input type="checkbox" id="map-fit-bounds" ${m.fitBounds ? 'checked' : ''}>
          <label for="map-fit-bounds">Cadrer automatiquement sur les données (fit-bounds)</label>
        </div>
        <div class="carto-checkbox">
          <input type="checkbox" id="map-no-controls" ${m.noControls ? 'checked' : ''}>
          <label for="map-no-controls">Masquer les contrôles de zoom (no-controls)</label>
        </div>
        <div class="carto-checkbox">
          <input type="checkbox" id="map-locked" ${m.locked ? 'checked' : ''}>
          <label for="map-locked">Carte figée, aucune interaction (locked)</label>
        </div>
        <div class="carto-checkbox">
          <input type="checkbox" id="map-sovereign" ${m.sovereignOnly ? 'checked' : ''}>
          <label for="map-sovereign">Fonds souverains uniquement (sovereign-only)</label>
        </div>
      </details>
      <p class="carto-msg carto-msg--muted"><i class="ri-drag-move-2-line" aria-hidden="true"></i>
        Le cadrage exporté est celui de la carte : déplacez et zoomez directement.</p>
    </div>
  `;

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

  bindMap('map-tiles', 'tiles');
  bindMap('map-name', 'name');
  bindMap('map-a11y', 'a11y');
  bindMap('map-min-zoom', 'minZoom', Number);
  bindMap('map-max-zoom', 'maxZoom', Number);
  bindMap('map-max-bounds', 'maxBounds');
  bindMap('map-height', 'height');
  bindMap('map-fit-bounds', 'fitBounds');
  bindMap('map-no-controls', 'noControls');
  bindMap('map-locked', 'locked');
  bindMap('map-sovereign', 'sovereignOnly');

  // Encarts : groupe DROM, Corse, puis territoire par territoire
  const dromEl = document.getElementById('inset-drom') as HTMLInputElement | null;
  dromEl?.addEventListener('change', () => {
    if (dromEl.checked) {
      for (const id of DROM_IDS) if (!m.insets.includes(id)) m.insets.push(id);
    } else {
      m.insets = m.insets.filter((id) => !DROM_IDS.includes(id));
    }
    renderMapPanel();
    updateCodePreview();
  });
  const corseEl = document.getElementById('inset-corse') as HTMLInputElement | null;
  corseEl?.addEventListener('change', () => {
    if (corseEl.checked) {
      if (!m.insets.includes('corse')) m.insets.push('corse');
    } else {
      m.insets = m.insets.filter((id) => id !== 'corse');
    }
    renderMapPanel();
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
      renderMapPanel();
      updateCodePreview();
    });
  });
}

// ---------------------------------------------------------------------------
// Modale « D'où viennent vos données ? »
// ---------------------------------------------------------------------------

function closeOnboard() {
  ui.forceChooser = false;
  ui.urlMode = false;
  ui.savedOpen = false;
  renderOnboard();
}

function setLayerSource(layer: LayerConfig, src: AnySource) {
  layer.source = src;
  layer.fields = [];
  // Changer de donnees invalide le mapping geographique precedent : des noms
  // de colonnes herites d'une autre source (ou d'un etat persiste pollue)
  // rendaient la carte vide en silence (#482 bugs 2/11). La detection
  // automatique de scanAndSuggest re-remplit derriere.
  layer.latField = '';
  layer.lonField = '';
  layer.geoField = '';
  ui.forceChooser = false;
  ui.urlMode = false;
  ui.savedOpen = false;
  renderAll();
  updateCodePreview();
  void scanAndSuggest(layer, { fit: true });
  // Premier contact : le tour se lance une fois les données choisies
  startTourIfFirstVisit(BUILDER_CARTO_TOUR);
}

/** Jeu d'exemple (chefs-lieux) sur une couche — modale d'onboarding et état vide du panneau. */
function applySampleData(layer: LayerConfig) {
  // Le jeu d'exemple n'a que lat/lon (pas de geometrie) : les
  // representations a geometrie (Zones) donnaient une carte vide au
  // premier contact (#482 bug 5) — on force une representation compatible.
  if (layer.type === 'geoshape') layer.type = 'marker';
  setLayerSource(layer, {
    id: `sample-${layer.id}`,
    name: "Jeu d'exemple — chefs-lieux",
    type: 'manual',
    data: SAMPLE_DATA,
    adHoc: true,
  });
}

function renderOnboard() {
  const host = document.getElementById('onboard-modal')!;
  // Lot UX 7 (#544, D2) : plus de modale bloquante à l'arrivée — le choix des
  // données se fait depuis l'état vide du panneau Couches ; la modale ne
  // s'ouvre qu'à la demande (Choisir / Changer les données).
  const show = ui.forceChooser;
  if (!show) {
    host.innerHTML = '';
    return;
  }
  const layer = getActiveLayer() ?? state.layers[0];
  // Ouverte à la demande depuis le panneau : toujours refermable (lot UX 7).
  const canClose = true;
  const savedSources = ui.savedOpen ? loadSavedSources() : [];

  host.innerHTML = `
    <div class="carto-modal-overlay" id="onboard-overlay">
      <div class="carto-modal" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
        <div class="carto-modal__top">
          <div>
            <h2 class="carto-modal__title" id="onboard-title">D'où viennent vos données ?</h2>
            <p class="carto-modal__subtitle">Choisissez une option — vous pourrez en changer à tout moment.</p>
          </div>
          ${
            canClose
              ? `<button class="carto-modal__close" id="onboard-close" type="button" title="Fermer" aria-label="Fermer">
                  <i class="ri-close-line" aria-hidden="true"></i>
                </button>`
              : ''
          }
        </div>
        <button class="carto-choice carto-choice--featured app-card-choice app-card-choice--featured" id="onboard-sample" type="button">
          <i class="ri-lightbulb-line" aria-hidden="true"></i>
          <span class="carto-choice__body">
            <span class="carto-choice__title">Essayer avec un jeu d'exemple</span>
            <span class="carto-choice__desc">Les chefs-lieux des régions françaises — idéal pour découvrir</span>
          </span>
          <i class="ri-arrow-right-line carto-choice__arrow" aria-hidden="true"></i>
        </button>
        <button class="carto-choice app-card-choice" id="onboard-url" type="button" aria-expanded="${ui.urlMode}">
          <i class="ri-link" aria-hidden="true"></i>
          <span class="carto-choice__body">
            <span class="carto-choice__title">Coller un lien de données</span>
            <span class="carto-choice__desc">data.gouv.fr, OpenDataSoft, Grist ou API JSON</span>
          </span>
          <i class="ri-arrow-right-line carto-choice__arrow" aria-hidden="true"></i>
        </button>
        ${
          ui.urlMode
            ? `
        <div class="carto-url-row">
          <input type="text" id="onboard-url-input" aria-label="URL du jeu de données"
                 placeholder="https://data.economie.gouv.fr/explore/dataset/…">
          <button id="onboard-url-ok" type="button">Utiliser</button>
        </div>`
            : ''
        }
        <button class="carto-choice app-card-choice" id="onboard-saved" type="button" aria-expanded="${ui.savedOpen}">
          <i class="ri-database-2-line" aria-hidden="true"></i>
          <span class="carto-choice__body">
            <span class="carto-choice__title">Une source enregistrée</span>
            <span class="carto-choice__desc">Créées dans l'application Sources</span>
          </span>
          <i class="ri-arrow-right-line carto-choice__arrow" aria-hidden="true"></i>
        </button>
        ${
          ui.savedOpen
            ? savedSources.length
              ? `
        <div class="carto-saved-list">
          ${savedSources
            .map(
              (s) =>
                `<button type="button" data-saved-id="${escapeAttr(String(s.id))}">${escapeAttr(String(s.name || s.datasetId || s.url || s.id))}</button>`
            )
            .join('')}
        </div>`
              : `
        <p class="carto-msg carto-msg--warn"><i class="ri-information-line" aria-hidden="true"></i>
          Aucune source enregistrée pour l'instant — créez-en une dans l'application Sources.</p>`
            : ''
        }
      </div>
    </div>
  `;

  document
    .getElementById('onboard-sample')
    ?.addEventListener('click', () => applySampleData(layer));

  document.getElementById('onboard-url')?.addEventListener('click', () => {
    ui.urlMode = !ui.urlMode;
    renderOnboard();
    document.getElementById('onboard-url-input')?.focus();
  });

  const applyUrl = () => {
    const input = document.getElementById('onboard-url-input') as HTMLInputElement | null;
    const url = input?.value.trim();
    if (!url) return;
    setLayerSource(layer, {
      id: `url-${layer.id}`,
      name: url.replace(/^https?:\/\//, '').slice(0, 60),
      type: 'api',
      apiUrl: url,
      adHoc: true,
    });
  };
  document.getElementById('onboard-url-ok')?.addEventListener('click', applyUrl);
  document.getElementById('onboard-url-input')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') applyUrl();
  });

  document.getElementById('onboard-saved')?.addEventListener('click', () => {
    ui.savedOpen = !ui.savedOpen;
    renderOnboard();
  });
  host.querySelectorAll('[data-saved-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const found = loadSavedSources().find(
        (s) => String(s.id) === btn.getAttribute('data-saved-id')
      );
      if (found) setLayerSource(layer, lightweightSource(found));
    });
  });

  if (canClose) {
    document.getElementById('onboard-close')?.addEventListener('click', closeOnboard);
    document.getElementById('onboard-overlay')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'onboard-overlay') closeOnboard();
    });
  }
}

// ---------------------------------------------------------------------------
// Modale « Obtenir le code »
// ---------------------------------------------------------------------------

/** Onglet « Code » : reflète le mode de génération courant. */
function refreshCodeOutput() {
  const codeEl = document.getElementById('code-output');
  if (!codeEl) return;
  const genEl = document.getElementById('gen-mode') as HTMLSelectElement | null;
  if (genEl && genEl.value !== state.generationMode) genEl.value = state.generationMode;
  codeEl.textContent = state.layers.some((l) => l.visible && l.source) ? generateCode() : '';
}

/** « Copier le code » (barre d'actions) : copie directe du mode sélectionné. */
function copyCodeToClipboard() {
  if (!state.layers.some((l) => l.visible && l.source)) {
    toastWarning('Choisissez d’abord les données d’une couche, puis vous pourrez copier le code.');
    return;
  }
  navigator.clipboard.writeText(generateCode()).catch(() => {});
  refreshCodeOutput();
  const btn = document.getElementById('btn-export');
  if (btn) {
    const original = btn.textContent;
    btn.textContent = 'Copié !';
    setTimeout(() => {
      btn.textContent = original;
    }, 1500);
  }
}

// ---------------------------------------------------------------------------
// Assistance : analyse des champs de la source
// ---------------------------------------------------------------------------

function setScanStatus(html: string) {
  const el = document.getElementById('source-scan-status');
  if (el) el.innerHTML = html;
}

async function scanAndSuggest(layer: LayerConfig, opts: { fit?: boolean } = {}) {
  setScanStatus(
    '<i class="ri-loader-4-line carto-spin" aria-hidden="true"></i> Analyse des champs de la source…'
  );
  try {
    const result = await scanLayerFields(layer);
    layer.fields = result.fields;

    // Purge des champs geographiques fantomes (#482 bugs 2/11) : un etat
    // persiste par une ancienne version pouvait contenir des litteraux type
    // « latitude »/« longitude »/« fields » — colonnes inexistantes,
    // indistinguables du placeholder. Si le scan a produit des champs et que
    // la valeur configuree n'en fait pas partie, on la vide (la suggestion
    // automatique ci-dessous re-remplit). Les chemins pointes (a.b) saisis a
    // la main sont conserves : le scan ne voit que les cles de 1er niveau.
    if (result.fields.length) {
      const known = new Set(result.fields.map((f) => f.name));
      for (const key of ['latField', 'lonField', 'geoField'] as const) {
        const value = layer[key];
        if (value && !value.includes('.') && !known.has(value)) layer[key] = '';
      }
    }

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

    renderLayersPanel();
    renderElementsPanel();
    setScanStatus(
      `<i class="ri-check-line" aria-hidden="true"></i> ${result.fields.length} champs (échantillon de ${result.sampleSize})${suggested ? ' — ' + suggested : ''}`
    );
    updateCodePreview();
    // Aperçu immédiat : la carte plein écran montre le résultat (ou son
    // diagnostic si la localisation manque encore).
    executePreview(opts.fit ?? false);
  } catch (err) {
    layer.fields = [];
    renderLayersPanel();
    renderElementsPanel();
    setScanStatus(
      `<i class="ri-error-warning-line" aria-hidden="true"></i> ${escapeAttr((err as Error).message)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Code généré + re-exécution auto
// ---------------------------------------------------------------------------

let rerunTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleRerun() {
  if (!ui.executed) return;
  clearTimeout(rerunTimer);
  rerunTimer = setTimeout(() => executePreview(false), 400);
}

function updateCodePreview() {
  const codeEl = document.getElementById('code-output');
  if (codeEl) codeEl.textContent = generateCode();
  persistState();
  scheduleRerun();
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function addLayer() {
  const layer = createLayer();
  state.layers.push(layer);
  state.activeLayerId = layer.id;
  ui.forceChooser = true;
  renderAll();
  updateCodePreview();
}

async function resetBuilder() {
  if (
    !(await confirmDialog('La configuration actuelle sera perdue.', {
      title: 'Repartir d’une carte vierge ?',
      confirmLabel: 'Nouveau',
    }))
  )
    return;
  resetState();
  ui.executed = false;
  ui.forceChooser = false;
  const canvas = document.getElementById('map-canvas');
  if (canvas)
    canvas.innerHTML = `
      <p class="carto-canvas__hint">
        <i class="ri-map-2-line" aria-hidden="true"></i><br>
        Choisissez vos données, la carte s'affiche ici.
      </p>`;
  setPreviewStatus('');
  renderAll();
}

function sendToPlayground() {
  const code = generateCode();
  sessionStorage.setItem('playground-code', code);
  window.location.href = '../../apps/playground/index.html?from=builder-carto';
}

function saveFavorite(feedbackBtnId = 'save-favorite-btn') {
  if (!state.layers.some((l) => l.visible && l.source)) {
    toastWarning(
      'Choisissez d’abord les données d’une couche, puis vous pourrez sauvegarder la carte en favori.'
    );
    return;
  }
  const code = generateCode();

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

  const btn = document.getElementById(feedbackBtnId);
  if (btn) {
    const originalHTML = btn.innerHTML;
    btn.textContent = 'Ajouté aux favoris';
    setTimeout(() => {
      btn.innerHTML = originalHTML;
    }, 2000);
  }
}

// ---------------------------------------------------------------------------
// Aperçu plein écran + diagnostic
// ---------------------------------------------------------------------------

function setPreviewStatus(html: string, tone: 'ok' | 'warn' | 'err' | '' = '') {
  const el = document.getElementById('preview-status');
  if (!el) return;
  el.innerHTML = html;
  el.hidden = !html;
  el.className = `carto-status${tone ? ` carto-status--${tone}` : ''}`;
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
    const preview = document.getElementById('map-canvas');
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

    // Les vignettes territoriales clonent les couches : on ne compte que la
    // carte principale, sinon N est multiplié par le nombre d'encarts.
    const notInInset = (el: Element) => !el.closest('dsfr-data-map-inset');

    // Compte réel via les couches (#482 bug 7) : le comptage DOM voyait les
    // bulles de cluster comme des éléments et « 1 » pour une heatmap de N
    // points. Repli DOM si la lib chargée n'expose pas getRenderedCount.
    const layerEls = [...preview.querySelectorAll('dsfr-data-map-layer')].filter(
      notInInset
    ) as (Element & { getRenderedCount?: () => number })[];
    const drawn =
      layerEls.length && layerEls.every((el) => typeof el.getRenderedCount === 'function')
        ? layerEls.reduce((acc, el) => acc + el.getRenderedCount!(), 0)
        : [...preview.querySelectorAll('.leaflet-marker-icon')].filter(notInInset).length +
          [...preview.querySelectorAll('.leaflet-overlay-pane path')].filter(notInInset).length +
          [
            ...preview.querySelectorAll('.leaflet-heatmap-layer, .leaflet-overlay-pane canvas'),
          ].filter(notInInset).length;

    if (errors.length) {
      setPreviewStatus(
        `<i class="ri-error-warning-line" aria-hidden="true"></i> Erreur de chargement : ${escapeAttr(errors[0].message ?? String(errors[0]))}`,
        'err'
      );
      return;
    }
    if (loading && attempt < 4) return; // on laisse les timers suivants re-vérifier

    const n = (count: number, mot: string) =>
      `${count.toLocaleString('fr-FR')} ${mot}${count > 1 ? 's' : ''}`;

    if (records > 0 && drawn === 0 && attempt >= 2) {
      // Diagnostic cible (#482 bug 8) : en mode Zones sans champ géométrie,
      // c'est la représentation qui bloque, pas la localisation — envoyer
      // l'utilisateur au bon endroit.
      const zonesSansGeo = state.layers.some(
        (l) => l.visible && l.source && l.type === 'geoshape' && !l.geoField
      );
      const conseil = zonesSansGeo
        ? 'la représentation « Zones » nécessite un champ géographique (géométrie) — choisissez « Marqueurs » ou « Cercles » (panneau Éléments), ou renseignez le champ géographique (panneau Couches).'
        : 'vérifiez la localisation (panneau Couches) et la représentation (panneau Éléments).';
      setPreviewStatus(
        `<i class="ri-alert-line" aria-hidden="true"></i> ${n(records, 'enregistrement')} chargé${records > 1 ? 's' : ''} mais aucun élément dessiné — ${conseil}`,
        'warn'
      );
    } else if (records === 0 && sources.length && attempt >= 4) {
      setPreviewStatus(
        `<i class="ri-alert-line" aria-hidden="true"></i> Aucune donnée reçue de la source.`,
        'warn'
      );
    } else if (drawn > 0) {
      setPreviewStatus(
        `<i class="ri-check-line" aria-hidden="true"></i> ${n(drawn, 'élément')} affiché${drawn > 1 ? 's' : ''} (${n(records, 'enregistrement')})`,
        'ok'
      );
    }
  };

  [800, 2000, 4000, 8000, 15000].forEach((ms, i) => {
    statusTimers.push(setTimeout(() => check(i + 1), ms));
  });
}

// Onglet en arrière-plan : Leaflet ne dessine qu'au retour de visibilité,
// après la fenêtre des timers — on re-vérifie une fois l'onglet redevenu
// visible pour ne pas laisser un faux « aucun élément dessiné ».
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && ui.executed) {
    statusTimers.push(setTimeout(() => updatePreviewStatus(), 1200));
  }
});

/** Jeton d'annulation des sondes viewport de l'exécution précédente. */
let viewportWatchToken = 0;

/**
 * Synchronise le cadrage de la carte d'aperçu vers l'état : le code exporté
 * reprend exactement ce que l'utilisateur voit (« la carte est l'aperçu »).
 */
function watchViewport() {
  const token = ++viewportWatchToken;
  const tryAttach = (attempt: number) => {
    if (token !== viewportWatchToken) return;
    const mapEl = document.querySelector('#map-canvas dsfr-data-map') as DsfrDataMapElement | null;
    const lmap = mapEl?.getLeafletMap?.();
    if (!lmap) {
      // L'init Leaflet est différée (lazy-load + IntersectionObserver) et
      // peut prendre longtemps (onglet en arrière-plan) : on sonde ~5 min,
      // le jeton annule la sonde à la prochaine exécution.
      if (attempt < 750) setTimeout(() => tryAttach(attempt + 1), 400);
      return;
    }
    const sync = () => {
      const c = lmap.getCenter();
      state.map.center = `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`;
      state.map.zoom = lmap.getZoom();
      persistState();
    };
    lmap.on('moveend', sync);
    lmap.on('zoomend', sync);
  };
  tryAttach(0);
}

/**
 * (Re)génère la carte d'aperçu dans le canevas plein écran. Le code d'aperçu
 * diffère du code exporté sur trois points : hauteur plein écran, compagnon
 * a11y omis (réservé à l'export) et fit-bounds ponctuel à la demande.
 */
function executePreview(fit = false) {
  clearTimeout(rerunTimer);
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;
  if (!state.layers.some((l) => l.visible && l.source)) {
    ui.forceChooser = true;
    renderOnboard();
    return;
  }

  const saved = {
    mode: state.generationMode,
    a11y: state.map.a11y,
    height: state.map.height,
    fitBounds: state.map.fitBounds,
  };
  state.generationMode = 'embedded';
  state.map.a11y = false;
  // Avec des encarts, une bande basse leur est réservée (vignettes).
  // --carto-header-h : hauteur du <app-header> commun (mesurée au runtime,
  // cf. observeHeaderHeight), --app-action-bar-h : celle de la barre
  // d'actions commune (publiée par <app-action-bar>).
  state.map.height = state.map.insets.length
    ? 'calc(100dvh - var(--carto-header-h, 96px) - var(--app-action-bar-h, 56px) - var(--carto-tabs-h, 48px) - 208px)'
    : 'calc(100dvh - var(--carto-header-h, 96px) - var(--app-action-bar-h, 56px) - var(--carto-tabs-h, 48px))';
  if (fit) state.map.fitBounds = true;
  const code = generateCode();
  state.generationMode = saved.mode;
  state.map.a11y = saved.a11y;
  state.map.height = saved.height;
  state.map.fitBounds = saved.fitBounds;

  canvas.innerHTML = code;
  ui.executed = true;
  setPreviewStatus('<i class="ri-loader-4-line carto-spin" aria-hidden="true"></i> Chargement…');
  updatePreviewStatus();
  watchViewport();
  refreshCodeOutput();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Le <app-header> commun a une hauteur qui varie selon le breakpoint (menu
 * mobile hors modale, tools stackés, tagline sur 2 lignes en desktop…).
 * On mesure au runtime et on expose via --carto-header-h — utilisée à la
 * fois par le CSS des panneaux et par le calc() de state.map.height.
 */
/** Hauteur de la liste d'onglets Aperçu · Code → --carto-tabs-h (CSS + calc de la carte). */
function observeTabsHeight() {
  const list = document.querySelector('.carto-tabs > .fr-tabs__list');
  if (!list) return;
  const apply = () => {
    const h = Math.round(list.getBoundingClientRect().height);
    if (h > 0) document.body.style.setProperty('--carto-tabs-h', `${h}px`);
  };
  apply();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(apply).observe(list);
}

function observeHeaderHeight() {
  const header = document.querySelector('app-header');
  if (!header) return;
  const apply = () => {
    const h = Math.round(header.getBoundingClientRect().height);
    if (h > 0) document.body.style.setProperty('--carto-header-h', `${h}px`);
  };
  apply();
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(apply).observe(header);
  } else {
    window.addEventListener('resize', apply);
  }
}

function bindStaticUi() {
  // Pliage / dépliage des panneaux
  document.querySelectorAll('[data-panel-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.getAttribute('data-panel-toggle')!);
      if (!panel) return;
      const collapsed = panel.classList.toggle('carto-panel--collapsed');
      panel
        .querySelectorAll('[data-panel-toggle]')
        .forEach((b) => b.setAttribute('aria-expanded', String(!collapsed)));
    });
  });

  document.getElementById('btn-add-layer')?.addEventListener('click', addLayer);
  document.getElementById('btn-reset')?.addEventListener('click', () => void resetBuilder());
  document.getElementById('btn-execute')?.addEventListener('click', () => executePreview(true));
  document.getElementById('btn-export')?.addEventListener('click', copyCodeToClipboard);
  // Actions de la barre commune (<app-action-bar>) — liées ici, hors de tout rendu conditionnel
  document
    .getElementById('save-favorite-btn')
    ?.addEventListener('click', () => saveFavorite('save-favorite-btn'));
  document.getElementById('open-playground-btn')?.addEventListener('click', sendToPlayground);
  document
    .getElementById('tour-btn')
    ?.addEventListener('click', () => startTour(BUILDER_CARTO_TOUR));

  // Onglet « Code » : mode de génération + rafraîchissement à l'ouverture
  const genEl = document.getElementById('gen-mode') as HTMLSelectElement | null;
  genEl?.addEventListener('change', () => {
    state.generationMode = genEl.value as 'embedded' | 'dynamic';
    refreshCodeOutput();
    persistState();
  });
  document.getElementById('carto-tab-code-btn')?.addEventListener('click', refreshCodeOutput);
  observeTabsHeight();

  // Échap ferme la modale d'arrivée
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (ui.forceChooser) closeOnboard();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Hook saveToStorage to /api/* sync (when authenticated). Without this,
  // favorites saved here stay only in localStorage and get wiped by the
  // ApiStorageAdapter prefetch the next time another app loads.
  await initAuth();

  const restored = restoreState();

  bindStaticUi();
  observeHeaderHeight();
  renderAll();
  persistState();

  // Reprise de session : re-analyse les champs de la couche active et relance
  // l'aperçu (sans re-cadrer : le viewport sauvegardé est restauré tel quel).
  if (restored) {
    const layer = getActiveLayer();
    if (layer?.source) {
      setTimeout(() => void scanAndSuggest(layer, { fit: false }), 150);
    }
  }

  // Product tour : seulement quand la modale d'onboarding n'est pas affichée
  // (sinon il démarre au premier choix de données — setLayerSource).
  injectTourStyles();
  if (state.layers.some((l) => l.source)) {
    startTourIfFirstVisit(BUILDER_CARTO_TOUR);
  }
});

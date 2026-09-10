/**
 * dsfr-data-map-layer — Couche de données pour dsfr-data-map
 *
 * Composant invisible utilisant SourceSubscriberMixin pour recevoir des données
 * et les projeter sur la carte parente (markers, geoshape, circle, heatmap).
 *
 * Choroplèthe (`type="geoshape"` + `fill-field`) : les valeurs sont discrétisées
 * en classes (`classes`, `method`, `breaks`) colorées par `selected-palette` ;
 * `getLegendEntries()` expose les classes (ou les paires de `color-map`) pour le
 * compagnon dsfr-data-map-legend, qui se rafraîchit sur l'événement
 * `dsfr-data-map-layer-render` (#685).
 */
import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { dispatchSourceCommand } from '../utils/data-bridge.js';
import { getByPath } from '../utils/json-path.js';
import { parseGeoValue } from '../utils/geo-value.js';
import { parseColorMap } from '../utils/color-map.js';
import { escapeColonValue, filterToOdsql } from '../utils/where.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import { CONTEXT_CONNECTED_EVENT, findContextHostById } from '../utils/context-registry.js';
import type { ContextHost } from '../utils/context-registry.js';
import {
  CHOROPLETH_SCALES,
  classifyValues,
  getColorForValue,
  choroplethLegendEntries,
  escapeHtml,
} from '@dsfr-data/shared/lib';
import type { LegendEntry, ContextFilterLike } from '@dsfr-data/shared/lib';
import type { DsfrDataMap } from './dsfr-data-map.js';
import type { SourceElement } from '../utils/source-element.js';
// @ts-expect-error — Vite ?inline import returns CSS as string
import markerClusterCss from 'leaflet.markercluster/dist/MarkerCluster.css?inline';
// @ts-expect-error — Vite ?inline import returns CSS as string
import markerClusterDefaultCss from 'leaflet.markercluster/dist/MarkerCluster.Default.css?inline';

// Leaflet types
type LeafletModule = typeof import('leaflet');
type LeafletMap = import('leaflet').Map;
type LayerGroup = import('leaflet').LayerGroup;
type LatLngBounds = import('leaflet').LatLngBounds;
type LeafletLayer = import('leaflet').Layer;
type LeafletPopupEvent = import('leaflet').PopupEvent;
type FeatureGroup = import('leaflet').FeatureGroup;

/**
 * Leaflet exposé sur window par dsfr-data-map (voir loadLeaflet). Ajoute
 * `heatLayer` (plugin leaflet.heat) et `MarkerClusterGroup` (plugin
 * leaflet.markercluster) qui ne sont pas dans les types officiels Leaflet.
 */
type LeafletWithPlugins = LeafletModule & {
  heatLayer?: (
    latLngs: Array<[number, number, number?]>,
    opts?: Record<string, unknown>
  ) => LeafletLayer;
  markerClusterGroup?: (opts?: Record<string, unknown>) => FeatureGroup;
  MarkerClusterGroup?: new (opts?: Record<string, unknown>) => FeatureGroup;
};
type WindowWithLeaflet = Window & { L?: LeafletWithPlugins };

type HeatLayerFactory = NonNullable<LeafletWithPlugins['heatLayer']>;
type ClusterFactory = (opts: Record<string, unknown>) => FeatureGroup;

/**
 * Résout un symbole ajouté par un plugin Leaflet (markercluster, heat) après
 * son `import()` dynamique. Les plugins UMD étendent l'objet `module.exports`
 * de Leaflet ; selon l'interop CJS du bundler, l'ajout est visible sur
 * `window.L` (namespace exposé par loadLeaflet) ou seulement sur l'export
 * `default` du module Leaflet bundlé — on consulte les deux. Plus aucun
 * fallback CDN runtime (#292) : incompatible CSP strict et sovereign-only.
 */
async function resolveLeafletPluginSymbol<T>(name: string): Promise<T | undefined> {
  const winL = (window as WindowWithLeaflet).L as Record<string, unknown> | undefined;
  if (winL?.[name]) return winL[name] as T;
  const ns = (await import('leaflet')) as unknown as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  return (ns[name] ?? ns.default?.[name]) as T | undefined;
}

// Echelles choroplethes + bucketing : source unique @dsfr-data/shared (#302)
// — la copie locale divergeait de world-map (categorical absente, bucketing
// oppose : value <= break ici, v >= break la-bas).

let layerBoundsSeq = 0;

/**
 * La sélection de la carte vue par le contexte (#681, ADR-104) : UN filtre
 * `eq` sur le champ de `refine-on-click`, dont la valeur est celle de
 * l'objet cliqué. Le contexte diffuse à ses cibles (au dialecte de
 * chacune), porte l'URL et le tag ; la couche ne fait que tenir la
 * sélection courante.
 */
class MapSelectFilter implements ContextFilterLike {
  readonly applyTo = '*';
  readonly operator = 'eq';

  constructor(private readonly host: DsfrDataMapLayer) {}

  get field(): string {
    return this.host.refineOnClick.trim();
  }

  get isConnected(): boolean {
    return this.host.isConnected;
  }

  buildColonWhere(): string {
    const value = this.host._selectedValue();
    if (!value || !this.field) return '';
    return `${this.field}:eq:${escapeColonValue(value)}`;
  }

  displayLabel(): string {
    return this.host.label || this.field;
  }

  displayValue(): string {
    return this.host._selectedValue();
  }

  /** Même chemin qu'un second clic sur l'objet sélectionné : la couche vide sa sélection et re-diffuse */
  clear(): void {
    this.host._clearSelection();
  }

  urlValue(): string {
    return this.host._selectedValue();
  }
}

/**
 * @fires dsfr-data-map-select - `{ record, layerId, selected }` sur la couche (bubbles, composed) — au clic sur un marqueur, un cercle ou une forme (#681), en plus de la popup ; jamais en `no-interactive`. `selected` vaut `true` à la sélection, `false` quand le clic retire la sélection courante (second clic sur le même objet, ou `clear()` du filtre de contexte).
 * @fires dsfr-data-source-command - `{ sourceId, where, whereKey, origin }` sur `document` — en `refine-on-click` SANS `context` (chemin dégradé) : clause `eq` poussée directement à `source` sous le whereKey `map-select-ID`. Avec `context`, c'est le contexte qui diffuse.
 * @fires dsfr-data-map-layer-time-ready - `{ steps }` sur `document` — les pas de temps de la couche sont calcules ; dsfr-data-map-timeline s'en sert pour construire son curseur.
 * @fires dsfr-data-map-layer-render - `{ rendered, skipped, total, legend }` sur la couche (bubbles) après chaque rendu : éléments dessinés, lignes ignorées, total avant plafond, entrées de légende (`getLegendEntries()`). dsfr-data-map-legend s'en sert pour se rafraîchir (#685).
 */
@customElement('dsfr-data-map-layer')
export class DsfrDataMapLayer extends SourceSubscriberMixin(LitElement) {
  /** Cle stable des bounds aupres de la carte parente (#294) */
  private readonly _boundsKey = `dsfr-map-layer-${++layerBoundsSeq}`;

  /**
   * Jeton de generation des rendus (#295) : deux _renderLayer qui se
   * chevauchent pendant le await import(...) (cluster/heatmap)
   * franchissaient chacun clearLayers() puis ajoutaient CHACUN tous les
   * items — doublons visibles. Le rendu obsolete s'abandonne après chaque
   * await.
   */
  private _renderGeneration = 0;

  // --- Source & geo ---

  /** Id de la source (ou du transformateur) dont cette couche consomme les données. */
  @property({ type: String })
  source = '';

  /** Rendu de la couche : `marker` (epingles), `geoshape` (polygones/lignes GeoJSON), `circle` (cercles proportionnels), `heatmap` (carte de chaleur). */
  @property({ type: String })
  type: 'marker' | 'geoshape' | 'circle' | 'heatmap' = 'marker';

  /** Chemin vers le champ latitude (mode coordonnées séparées). */
  @property({ type: String, attribute: 'lat-field' })
  latField = '';

  /** Chemin vers le champ longitude (mode coordonnées séparées). */
  @property({ type: String, attribute: 'lon-field' })
  lonField = '';

  /** Champ geometrie : objet GeoJSON, {lat, lon}, [lat, lon] ou chaîne JSON serialisee (#426) */
  @property({ type: String, attribute: 'geo-field' })
  geoField = '';

  /** Classe CSS appliquee aux traces SVG de la couche (geoshape/circle) —
   *  permet un style page (motif hachure, pointilles...) via CSS/SVG <pattern> */
  @property({ type: String, attribute: 'shape-class' })
  shapeClass = '';

  /** Couche decorative : aucune interaction (pas de clic, tooltip ni popup) —
   *  contours administratifs, habillage */
  @property({ type: Boolean, attribute: 'no-interactive' })
  noInteractive = false;

  /**
   * Libellé de la couche — sert de libellé au tag du contexte en
   * `refine-on-click` (#681). Vide = le nom du champ.
   */
  @property({ type: String })
  label = '';

  // --- Sélection au clic (#681, ADR-104) ---

  /**
   * Champ dont la valeur de l'objet cliqué devient un filtre `eq` (#681).
   * Premier clic = filtre, second clic sur le même objet = retrait, clic sur
   * un autre objet = remplacement. Avec `context="id"` (recommandé), la
   * couche s'enregistre comme filtre du dsfr-data-context : diffusion à
   * toutes ses sources cibles au dialecte de chacune, tag dans
   * dsfr-data-context-tags, URL portée par le contexte. Sans `context`,
   * la clause part directement à `source` (whereKey `map-select-ID`) —
   * sans tag ni URL. Attention : si `source` est aussi une cible du
   * contexte, la carte se filtre elle-même (seul l'objet cliqué reste,
   * jusqu'au second clic) ; pour garder tous les points, ne pas lister
   * cette source dans `sources` du contexte (ou donner à la carte sa
   * propre source).
   */
  @property({ type: String, attribute: 'refine-on-click' })
  refineOnClick = '';

  /**
   * Id du dsfr-data-context auquel s'enregistrer en `refine-on-click`
   * (#681, ADR-104). Le contexte peut être déclaré après la couche dans
   * la page. Vide = commande directe à `source` (chemin dégradé).
   */
  @property({ type: String })
  context = '';

  // --- Display ---

  /** Template du contenu de la popup, avec substitution de champs. Ex: `"{nom} — {val} kW"`. */
  @property({ type: String, attribute: 'popup-template' })
  popupTemplate = '';

  /** Champs a presenter en tableau automatique dans la popup. Ex: `"nom,adresse"`. */
  @property({ type: String, attribute: 'popup-fields' })
  popupFields = '';

  /** Champ affiché au survol de l'élément. */
  @property({ type: String, attribute: 'tooltip-field' })
  tooltipField = '';

  /** Couleur de la couche (défaut : blue-france DSFR). Sert aussi de repli quand `color-map` ne matche pas. */
  @property({ type: String })
  color = '#000091';

  /** Champ dont la valeur détermine la couleur (mapping catégoriel via `color-map`). */
  @property({ type: String, attribute: 'color-field' })
  colorField = '';

  /** Paires `valeur:#couleur` séparées par des virgules. Ex: `"1:#00A95F,2:#FF9940,3:#E1000F"`. Une virgule ou un deux-points dans une valeur s'écrit `%2C` ou `%3A`. */
  @property({ type: String, attribute: 'color-map' })
  colorMap = '';

  /** Champ numérique utilisé pour le remplissage en choroplèthe. */
  @property({ type: String, attribute: 'fill-field' })
  fillField = '';

  /** Opacite du remplissage (0-1). */
  @property({ type: Number, attribute: 'fill-opacity' })
  fillOpacity = 0.6;

  /** Palette DSFR utilisée pour le dégradé choroplèthe (`fill-field`) : `sequentialAscending` (défaut), `sequentialDescending`, `divergentAscending`, `divergentDescending`, `neutral`, `categorical`. */
  @property({ type: String, attribute: 'selected-palette' })
  selectedPalette = '';

  /** Nombre de classes de la choroplèthe (`fill-field`). `0` (défaut) = autant de classes que de couleurs dans l'échelle (9). Plafonné à la taille de l'échelle (#685). */
  @property({ type: Number })
  classes = 0;

  /** Méthode de discrétisation de la choroplèthe : `quantile` (défaut, effectifs égaux par classe), `equal` (intervalles de même largeur), `manual` (bornes de `breaks`). */
  @property({ type: String })
  method: 'quantile' | 'equal' | 'manual' = 'quantile';

  /** Bornes supérieures manuelles des classes, séparées par des virgules : `"10,50,100"` donne 4 classes (jusqu'à 10, 10 à 50, 50 à 100, plus de 100). Implique `method="manual"`. */
  @property({ type: String })
  breaks = '';

  /** Rayon fixe des cercles (`type="circle"`). */
  @property({ type: Number })
  radius = 8;

  /** Champ numérique pilotant un rayon variable (auto-scaling entre `radius-min` et `radius-max`). */
  @property({ type: String, attribute: 'radius-field' })
  radiusField = '';

  /** Unité du rayon : `px` (constant à l'écran) ou `m` (mètres, suit le zoom). */
  @property({ type: String, attribute: 'radius-unit' })
  radiusUnit: 'px' | 'm' = 'px';

  /** Rayon minimum de l'auto-scaling, en pixels. */
  @property({ type: Number, attribute: 'radius-min' })
  radiusMin = 4;

  /** Rayon maximum de l'auto-scaling, en pixels. */
  @property({ type: Number, attribute: 'radius-max' })
  radiusMax = 30;

  // --- Heatmap ---

  /** Rayon d'influence de chaque point de la heatmap, en pixels. */
  @property({ type: Number, attribute: 'heat-radius' })
  heatRadius = 25;

  /** Flou applique a la heatmap, en pixels. */
  @property({ type: Number, attribute: 'heat-blur' })
  heatBlur = 15;

  /** Champ de ponderation des points de la heatmap. */
  @property({ type: String, attribute: 'heat-field' })
  heatField = '';

  // --- Clustering ---

  /** Regroupe les marqueurs proches en clusters. */
  @property({ type: Boolean })
  cluster = false;

  /** Rayon de regroupement des clusters, en pixels. */
  @property({ type: Number, attribute: 'cluster-radius' })
  clusterRadius = 80;

  // --- Zoom & viewport ---

  /** Niveau de zoom en deca duquel la couche est masquee. */
  @property({ type: Number, attribute: 'min-zoom' })
  minZoom = 0;

  /** Niveau de zoom au-delà duquel la couche est masquee. */
  @property({ type: Number, attribute: 'max-zoom' })
  maxZoom = 18;

  /**
   * Chargement par viewport : re-interroge la source a chaque déplacement de
   * la carte, et une première fois des que la carte est prête (#652). Le tout
   * premier fetch de la source reste NON filtre (elle charge des sa connexion,
   * avant que la carte — différée a la visibilité — ait un viewport) : sur un
   * gros jeu, poser un `limit` ou un `where` initial sur la source.
   */
  @property({ type: Boolean })
  bbox = false;

  /** Délai d'anti-rebond avant le re-fetch bbox, en millisecondes. */
  @property({ type: Number, attribute: 'bbox-debounce' })
  bboxDebounce = 300;

  /** Champ géographique utilisé pour la requête bbox (auto-détecté si vide). */
  @property({ type: String, attribute: 'bbox-field' })
  bboxField = '';

  // --- Timeline ---

  /** Champ date/heure activant l'animation temporelle (pilotee par `<dsfr-data-map-timeline>`). */
  @property({ type: String, attribute: 'time-field' })
  timeField = '';

  /** Granularite des pas de temps : `none`, `hour`, `day`, `month`, `year`. */
  @property({ type: String, attribute: 'time-bucket' })
  timeBucket: 'none' | 'hour' | 'day' | 'month' | 'year' = 'none';

  /** Rendu temporel : `snapshot` (seulement le pas courant) ou `cumulative` (tout jusqu'au pas courant). */
  @property({ type: String, attribute: 'time-mode' })
  timeMode: 'snapshot' | 'cumulative' = 'snapshot';

  // --- Performance ---

  /**
   * Plafond du nombre d'éléments rendus sur la carte (défaut 5000). Il protège
   * les marqueurs DOM (`divIcon`), le fit et les popups ; au-delà, un bandeau
   * indique combien d'éléments sont affichés sur le total. Avec `cluster`,
   * `max-items="20000"` est sans risque : les marqueurs regroupés ne pèsent
   * pas sur le DOM. En mode `bbox`, zoomer recharge la zone visible ; hors
   * `bbox`, seul un `max-items` plus haut (ou un filtre amont) affiche le reste.
   */
  @property({ type: Number, attribute: 'max-items' })
  maxItems = 5000;

  // --- Internal state ---

  private _mapParent: DsfrDataMap | null = null;
  private _leafletMap: LeafletMap | null = null;
  private _L: LeafletModule | null = null;
  private _layerGroup: FeatureGroup | null = null;
  private _clusterGroup: FeatureGroup | null = null;
  private _visible = true;
  private _data: Record<string, unknown>[] = [];
  private _bboxTimer: ReturnType<typeof setTimeout> | null = null;
  private _banner: HTMLDivElement | null = null;
  private _totalCount = 0;
  private _clusterLoaded = false;
  private _markerClusterFactory: ClusterFactory | null = null;
  private _heatLayer: LeafletLayer | null = null;
  private _heatLoaded = false;
  private _heatLayerFactory: HeatLayerFactory | null = null;
  private _radiusScale: ((val: number) => number) | null = null;

  /** Éléments effectivement dessines au dernier rendu (#482) */
  private _renderedCount = 0;

  /**
   * Records écartés du dernier rendu faute de position exploitable : geometrie
   * invalide (geoshape, #482), coordonnées absentes ou non numeriques (marker,
   * circle, heatmap — #648). Un seul compteur pour tous les types.
   */
  private _skippedGeoCount = 0;

  /** Dernier compte journalise — evite de repeter le warn a chaque re-rendu (pan en bbox client) */
  private _skippedWarned = -1;

  /** Compagnon popup resolu une fois par rendu (#297) */
  private _popupCompanion: import('./dsfr-data-map-popup.js').DsfrDataMapPopup | null = null;
  private _colorMapParsed: Map<string, string> | null = null;

  /** Entrees de legende du dernier rendu (#685) — voir getLegendEntries() */
  private _legendEntries: LegendEntry[] = [];

  /** Au moins un record est retombe sur `color` faute de correspondance dans color-map */
  private _colorFallbackUsed = false;

  // Timeline state
  private _timeFrames: Map<string, Record<string, unknown>[]> = new Map();
  private _timeSteps: string[] = [];
  private _currentFrameIndex = -1; // -1 = show all (no timeline active)

  // Sélection au clic (#681)

  /** Objet sélectionné (null hors sélection ; null aussi si la sélection vient de l'URL) */
  private _selectedRecord: Record<string, unknown> | null = null;

  /**
   * Identité de la sélection : la valeur du champ `refine-on-click` (stable
   * d'un rendu à l'autre — la couche se re-dessine avec de nouveaux objets
   * quand sa source re-émet), sinon l'objet lui-même.
   */
  private _selectedKey: string | Record<string, unknown> | null = null;

  /** Valeur filtrée (mode refine) — conservée même sans objet (pré-remplie depuis l'URL) */
  private _selectedFieldValue = '';

  /** Contexte résolu (mode `context`, #681) */
  private _context: ContextHost | null = null;

  /** Le filtre unique enregistré auprès du contexte (#681) */
  private _contextFilter: MapSelectFilter | null = null;

  /** Dernière clause confiée au contexte ou à la source — ne re-diffuse pas une clause inchangée */
  private _lastPushedWhere = '';

  /** Un contexte visé par id vient d'être connecté : (re)bind si c'est le nôtre (#681) */
  private _onContextConnected = (e: Event) => {
    const id = (e as CustomEvent<{ id: string | null }>).detail?.id;
    if (this.context && id === this.context) this._bindContext();
  };

  // Light DOM — invisible component
  createRenderRoot() {
    return this;
  }

  // --- Sélection au clic (#681, ADR-104) ---

  /** Mode `refine-on-click` demandé */
  private get _refineMode(): boolean {
    return this.refineOnClick.trim() !== '';
  }

  /** Mode `context` demandé (que le contexte soit déjà résolu ou non) */
  private get _contextMode(): boolean {
    return this._refineMode && this.context.trim() !== '';
  }

  /** whereKey du chemin dégradé (commande directe à `source`) */
  private get _directWhereKey(): string {
    return `map-select-${this.id || this._boundsKey}`;
  }

  /** Valeur courante du filtre de sélection (lue par le filtre de contexte) */
  _selectedValue(): string {
    return this._selectedFieldValue;
  }

  /** Objet actuellement sélectionné (null hors sélection) */
  getSelectedRecord(): Record<string, unknown> | null {
    return this._selectedRecord;
  }

  /** Identité d'un objet pour la sélection : valeur du champ en mode refine, l'objet sinon */
  private _selectionKeyOf(record: Record<string, unknown>): string | Record<string, unknown> {
    if (!this._refineMode) return record;
    const raw = getByPath(record, this.refineOnClick.trim());
    return raw === undefined || raw === null ? '' : String(raw);
  }

  /** Branche le clic de sélection sur un objet Leaflet (marqueur, forme, cercle) */
  private _bindSelect(layer: LeafletLayer, record: Record<string, unknown>): void {
    if (this.noInteractive) return;
    layer.on('click', () => this._onFeatureClick(record));
  }

  /**
   * Clic sur un objet : bascule la sélection (premier clic = sélection,
   * second clic sur le même objet = retrait, autre objet = remplacement),
   * émet `dsfr-data-map-select`, puis diffuse le filtre en mode refine.
   */
  _onFeatureClick(record: Record<string, unknown>): void {
    const key = this._selectionKeyOf(record);
    const same = this._selectedKey !== null && key === this._selectedKey;
    if (same) {
      this._setSelection(null, null);
      this._emitSelect(record, false);
    } else {
      this._setSelection(record, key);
      this._emitSelect(record, true);
    }
    this._pushSelection();
  }

  /** Retire la sélection courante par le même chemin qu'un second clic (appelé par le tag du contexte) */
  _clearSelection(): void {
    if (this._selectedKey === null && !this._selectedFieldValue) return;
    const previous = this._selectedRecord;
    this._setSelection(null, null);
    if (previous) this._emitSelect(previous, false);
    this._pushSelection();
  }

  private _setSelection(
    record: Record<string, unknown> | null,
    key: string | Record<string, unknown> | null
  ): void {
    this._selectedRecord = record;
    this._selectedKey = key;
    this._selectedFieldValue = typeof key === 'string' ? key : '';
  }

  private _emitSelect(record: Record<string, unknown>, selected: boolean): void {
    this.dispatchEvent(
      new CustomEvent('dsfr-data-map-select', {
        bubbles: true,
        composed: true,
        detail: { record, layerId: this.id, selected },
      })
    );
  }

  /**
   * Diffuse la sélection courante : au contexte (qui traduit, porte l'URL et
   * le tag) ou, sans `context`, directement à `source` sous un whereKey
   * stable. Dédupliqué : une clause inchangée ne repart pas.
   */
  private _pushSelection(): void {
    if (!this._refineMode) return;
    if (this._context && this._contextFilter) {
      const where = this._contextFilter.buildColonWhere();
      if (where === this._lastPushedWhere) return;
      this._lastPushedWhere = where;
      this._context._applyFilter(this._contextFilter, where);
      return;
    }
    // Contexte demandé mais pas encore résolu : rien ne part en direct
    if (this._contextMode || !this.source) return;
    const field = this.refineOnClick.trim();
    const colon = this._selectedFieldValue
      ? `${field}:eq:${escapeColonValue(this._selectedFieldValue)}`
      : '';
    if (colon === this._lastPushedWhere) return;
    this._lastPushedWhere = colon;
    const sourceEl = document.getElementById(this.source) as unknown as SourceElement | null;
    const whereFormat = sourceEl?.getAdapter?.()?.capabilities?.whereFormat;
    const where = colon && whereFormat === 'odsql' ? filterToOdsql(colon) : colon;
    dispatchSourceCommand(this.source, { where, whereKey: this._directWhereKey, origin: this.id });
  }

  /**
   * Résout le contexte visé par `context="id"` et y enregistre le filtre.
   * Le contexte peut arriver plus tard (déclaré après dans la page) :
   * l'erreur de config est posée en attendant et levée à sa connexion.
   */
  private _bindContext(): void {
    if (!this.isConnected || !this._contextMode) return;
    const context = findContextHostById(this.context);
    if (context && context === this._context) return;
    this._unbindContext();
    if (!context) {
      reportConfigError(
        this,
        'dsfr-data-map-layer',
        `dsfr-data-context introuvable : "${this.context}"`
      );
      return;
    }
    clearConfigError(this);
    this._context = context;
    this._contextFilter = new MapSelectFilter(this);
    context._registerFilter(this._contextFilter);

    // Valeur initiale depuis l'URL du contexte (#231, ADR-031) : elle devient
    // la sélection courante (sans objet : la donnée n'est pas encore là) et
    // repasse par le MÊME chemin qu'un clic — jamais injectée dans un where.
    const urlValues = context._urlValuesFor(this._contextFilter.field);
    if (urlValues && urlValues.length > 0 && !this._selectedFieldValue) {
      this._setSelection(null, urlValues[0]);
    }
    this._pushSelection();
  }

  /** Libère le filtre auprès du contexte (disconnect, changement de contexte) */
  private _unbindContext(): void {
    if (this._context && this._contextFilter) {
      this._context._unregisterFilter(this._contextFilter);
    }
    this._context = null;
    this._contextFilter = null;
    this._lastPushedWhere = '';
  }

  /** Libère la clause du chemin dégradé poussée sur `source` (disconnect, changement de mode) */
  private _releaseDirectSelection(): void {
    if (!this._lastPushedWhere || this._context || !this.source) return;
    this._lastPushedWhere = '';
    dispatchSourceCommand(this.source, {
      where: '',
      whereKey: this._directWhereKey,
      origin: this.id,
    });
  }

  // --- Color mapping ---
  // Grammaire partagee avec dsfr-data-chart (#732) : `utils/color-map.ts`,
  // echappement percent des separateurs compris (#676).

  /** Resolve color for a record: color-field + color-map, or fallback to this.color */
  private _resolveColor(record: Record<string, unknown>): string {
    if (!this.colorField || !this._colorMapParsed?.size) return this.color;
    const val = String(getByPath(record, this.colorField) ?? '');
    const mapped = this._colorMapParsed.get(val);
    if (mapped === undefined) this._colorFallbackUsed = true;
    return mapped ?? this.color;
  }

  /**
   * Entrées de légende du dernier rendu (#685) : les classes de `fill-field`
   * avec leurs bornes (choroplèthe), sinon les paires de `color-map` plus le
   * repli `color` s'il a servi, sinon la seule couleur de la couche (libellé
   * vide, à fournir par la légende). Consommé par dsfr-data-map-legend, qui
   * se rafraîchit sur `dsfr-data-map-layer-render`.
   */
  getLegendEntries(): LegendEntry[] {
    return this._legendEntries.map((e) => ({ ...e }));
  }

  /** Recalcule les entrees de legende a partir de l'etat du dernier rendu. */
  private _buildLegendEntries(breaks: number[], palette: readonly string[], values: number[]) {
    if (this.fillField && this.type === 'geoshape' && breaks.length > 0) {
      let min = Infinity;
      let max = -Infinity;
      for (const v of values) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const extent = values.length > 0 ? { min, max } : undefined;
      this._legendEntries = choroplethLegendEntries(breaks, palette, extent);
      return;
    }
    if (this._colorMapParsed?.size) {
      const entries: LegendEntry[] = [];
      for (const [value, color] of this._colorMapParsed) entries.push({ color, label: value });
      if (this._colorFallbackUsed) entries.push({ color: this.color, label: 'Autres valeurs' });
      this._legendEntries = entries;
      return;
    }
    this._legendEntries = [{ color: this.color, label: '' }];
  }

  /**
   * Nombre d'éléments effectivement dessines au dernier rendu (marqueurs,
   * formes, cercles ou points de chaleur). Contrairement au comptage DOM,
   * ce compte n'inclut pas les bulles de cluster et couvre la heatmap
   * (un seul canvas pour N points) — expose pour les diagnostics (#482).
   */
  getRenderedCount(): number {
    return this._renderedCount;
  }

  /**
   * Nombre de lignes ignorees au dernier rendu faute de position exploitable
   * (coordonnées ou geometrie absentes ou invalides). Journalise une fois par
   * rendu et remonte dans la trace du volet Diagnostic (#648, #604).
   */
  getSkippedCount(): number {
    return this._skippedGeoCount;
  }

  /**
   * Proprietes dont le changement doit redessiner la couche (#482 bug 6) :
   * sans ce hook, modifier un attribut en place (type, cluster, couleur…)
   * ne produisait aucun effet avant la prochaine emission de la source.
   */
  private static readonly RENDER_PROPS = new Set<string>([
    'type',
    'latField',
    'lonField',
    'geoField',
    'shapeClass',
    'noInteractive',
    'popupTemplate',
    'popupFields',
    'tooltipField',
    'color',
    'colorField',
    'colorMap',
    'fillField',
    'fillOpacity',
    'selectedPalette',
    'classes',
    'method',
    'breaks',
    'radius',
    'radiusField',
    'radiusUnit',
    'radiusMin',
    'radiusMax',
    'heatRadius',
    'heatBlur',
    'heatField',
    'cluster',
    'clusterRadius',
    'maxItems',
    'timeField',
    'timeBucket',
    'timeMode',
  ]);

  willUpdate(changed: Map<PropertyKey, unknown>) {
    super.willUpdate(changed);
    // Changement de contexte ou de champ à chaud (#681) : la sélection
    // courante est libérée sur l'ancien chemin, le nouveau est rejoint
    if ((changed.has('context') || changed.has('refineOnClick')) && this.hasUpdated) {
      // Sélection vidée AVANT le désenregistrement : le contexte relit
      // urlValue() du filtre en libérant sa clause (synchro d'URL)
      this._setSelection(null, null);
      this._releaseDirectSelection();
      this._unbindContext();
      document.removeEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
      if (this._contextMode) {
        document.addEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
        this._bindContext();
      } else {
        clearConfigError(this);
      }
    }
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    // Avant _onMapReady (cycle de montage inclus), rien a redessiner
    if (!this._leafletMap || !this._layerGroup) return;
    let needsRender = false;
    for (const key of changedProperties.keys()) {
      if (DsfrDataMapLayer.RENDER_PROPS.has(key as string)) {
        needsRender = true;
        break;
      }
    }
    if (!needsRender) return;
    if (
      changedProperties.has('timeField') ||
      changedProperties.has('timeBucket') ||
      changedProperties.has('timeMode')
    ) {
      this._currentFrameIndex = -1;
      if (this.timeField) this._buildTimeFrames();
    }
    void this._renderLayer();
  }

  // --- SourceSubscriberMixin hook ---

  onSourceData(data: unknown): void {
    this._data = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    if (this.timeField) {
      this._buildTimeFrames();
      // If timeline is active, re-render current frame; else show all
      if (this._currentFrameIndex >= 0) {
        this.setTimelineFrame(Math.min(this._currentFrameIndex, this._timeSteps.length - 1));
        return;
      }
    }
    this._renderLayer();
  }

  // --- Timeline API ---

  /** Build time frame index from data */
  private _buildTimeFrames(): void {
    this._timeFrames.clear();
    for (const record of this._data) {
      const raw = getByPath(record, this.timeField);
      const key = this._bucketTime(raw);
      if (key === null) continue;
      if (!this._timeFrames.has(key)) this._timeFrames.set(key, []);
      this._timeFrames.get(key)!.push(record);
    }
    // Sort keys chronologically
    this._timeSteps = [...this._timeFrames.keys()].sort();
    // Notify any timeline companion
    this.dispatchEvent(
      new CustomEvent('dsfr-data-map-layer-time-ready', {
        bubbles: true,
        detail: { steps: this._timeSteps },
      })
    );
  }

  /** Bucket a raw date value to the configured granularity */
  private _bucketTime(raw: unknown): string | null {
    if (raw == null) return null;
    const str = String(raw);
    if (this.timeBucket === 'none') return str;
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    switch (this.timeBucket) {
      case 'year':
        return `${d.getFullYear()}`;
      case 'month':
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      case 'day':
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      case 'hour':
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`;
      default:
        return str;
    }
  }

  /** Get data for a given frame index (snapshot or cumulative) */
  private _getFrameData(frameIndex: number): Record<string, unknown>[] {
    if (frameIndex < 0 || frameIndex >= this._timeSteps.length) return [];
    if (this.timeMode === 'cumulative') {
      const result: Record<string, unknown>[] = [];
      for (let i = 0; i <= frameIndex; i++) {
        const key = this._timeSteps[i];
        result.push(...(this._timeFrames.get(key) || []));
      }
      return result;
    }
    // snapshot
    const key = this._timeSteps[frameIndex];
    return this._timeFrames.get(key) || [];
  }

  /** Called by dsfr-data-map-timeline to set current frame */
  setTimelineFrame(index: number): void {
    this._currentFrameIndex = index;
    // Items passes en parametre (#295) : l'ancien swap temporaire de
    // this._data autour d'un _renderLayer() non awaite ne tenait que parce
    // que la lecture etait dans la portion synchrone — bombe a retardement,
    // et observable par un rendu concurrent.
    this._renderLayer(undefined, this._getFrameData(index));
  }

  /** Called by dsfr-data-map-timeline to reset (show all data) */
  resetTimeline(): void {
    this._currentFrameIndex = -1;
    this._renderLayer();
  }

  /** Returns sorted time step labels */
  getTimeSteps(): string[] {
    return this._timeSteps;
  }

  // --- Map lifecycle ---

  /** Called by dsfr-data-map when the Leaflet map is ready */
  _onMapReady(): void {
    this._mapParent = this.closest('dsfr-data-map') as DsfrDataMap | null;
    if (!this._mapParent) return;
    this._leafletMap = this._mapParent.getLeafletMap();
    this._L = this._mapParent.getLeafletLib();
    if (!this._leafletMap || !this._L) return;

    // Create layer group (featureGroup → getBounds() disponible pour fit-bounds)
    this._layerGroup = this._L.featureGroup();

    // Check initial zoom visibility
    this._updateVisibility();

    // If data already available, render
    if (this._data.length > 0) {
      this._renderLayer();
    }

    // Mode bbox (#652) : emettre la commande du viewport initial. Leaflet
    // emet `moveend` pendant L.map(), AVANT que la carte pose son listener
    // — sans cet appel, rien ne partait tant que l'utilisateur ne bougeait
    // pas la carte, et le premier rendu ignorait l'emprise.
    this._scheduleBboxCommand();
  }

  /** Called by dsfr-data-map on moveend/zoomend */
  _onViewportChange(): void {
    if (!this._leafletMap) return;

    // Update zoom-range visibility
    this._updateVisibility();

    // Viewport-driven fetch (bbox)
    this._scheduleBboxCommand();
  }

  /** Programme _sendBboxCommand avec anti-rebond (bbox actif et couche visible). */
  private _scheduleBboxCommand(): void {
    if (!this.bbox || !this._visible) return;
    if (this._bboxTimer) clearTimeout(this._bboxTimer);
    this._bboxTimer = setTimeout(() => this._sendBboxCommand(), this.bboxDebounce);
  }

  connectedCallback() {
    super.connectedCallback();
    // Attribut retire (#297) : declare mais jamais lu (no-op)
    if (this.hasAttribute('filter')) {
      console.warn(
        `dsfr-data-map-layer[${this.id}]: l'attribut "filter" a été retiré (il était sans effet) — ` +
          `filtrez en amont via dsfr-data-query ou le where de dsfr-data-source`
      );
    }
    sendWidgetBeacon('dsfr-data-map-layer', this.type);
    if (this._contextMode) {
      document.addEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
      // Bind différé d'un tick : dans un même fragment innerHTML, le contexte
      // déclaré après la couche n'est pas encore upgradé
      queueMicrotask(() => this._bindContext());
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Libère la sélection au clic (#681) : clause directe ou filtre du contexte
    document.removeEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
    this._setSelection(null, null);
    this._releaseDirectSelection();
    this._unbindContext();
    // Libere les bounds enregistres aupres de la carte (#294)
    this._mapParent?.unregisterLayerBounds?.(this._boundsKey);
    // Libere le filtre viewport pousse sur la source (#297) : un layer
    // retire laissait la source filtree sur le dernier viewport pour tous
    // ses autres consommateurs
    if (this.bbox && this.source) {
      dispatchSourceCommand(this.source, { where: '', whereKey: 'map-bbox', origin: this.id });
    }
    if (this._bboxTimer) clearTimeout(this._bboxTimer);
    if (this._layerGroup && this._leafletMap) {
      this._layerGroup.removeFrom(this._leafletMap);
    }
    if (this._clusterGroup && this._leafletMap) {
      this._clusterGroup.removeFrom(this._leafletMap);
    }
    if (this._heatLayer) {
      this._heatLayer.remove();
      this._heatLayer = null;
    }
    this._removeBanner();
  }

  // --- Zoom-range visibility ---

  private _updateVisibility() {
    if (!this._leafletMap || !this._layerGroup) return;
    const zoom = this._leafletMap.getZoom();
    const shouldBeVisible = zoom >= this.minZoom && zoom <= this.maxZoom;

    if (shouldBeVisible && !this._visible) {
      this._visible = true;
      const group = this._clusterGroup || this._layerGroup;
      if (!this._leafletMap.hasLayer(group)) {
        group.addTo(this._leafletMap);
      }
      if (this._heatLayer && !this._leafletMap.hasLayer(this._heatLayer)) {
        this._heatLayer.addTo(this._leafletMap);
      }
    } else if (!shouldBeVisible && this._visible) {
      this._visible = false;
      const group = this._clusterGroup || this._layerGroup;
      if (this._leafletMap.hasLayer(group)) {
        group.removeFrom(this._leafletMap);
      }
      if (this._heatLayer && this._leafletMap.hasLayer(this._heatLayer)) {
        this._heatLayer.removeFrom(this._leafletMap);
      }
      this._removeBanner();
    }
  }

  // --- Bbox command ---

  private _sendBboxCommand() {
    if (!this._leafletMap || !this.source) return;
    const bounds = this._leafletMap.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    // Determine the geo field for the bbox clause
    const field = this.bboxField || this.geoField || this._autoDetectGeoField();

    // Find the source element to check adapter capabilities
    const sourceEl = document.getElementById(this.source) as unknown as SourceElement | null;
    const adapter = sourceEl?.getAdapter?.();

    if (adapter?.capabilities?.serverGeo) {
      // ODS-style in_bbox clause
      const where = `in_bbox(${field}, ${sw.lat}, ${sw.lng}, ${ne.lat}, ${ne.lng})`;
      dispatchSourceCommand(this.source, {
        where,
        whereKey: 'map-bbox',
        origin: this.id,
      });
    } else {
      // Client-side fallback — filter cached data by bounds
      this._renderLayer(bounds);
    }
  }

  private _autoDetectGeoField(): string {
    if (this._data.length === 0) return 'geo_point_2d';
    const first = this._data[0];
    for (const candidate of [
      'geo_point_2d',
      'geo_shape',
      'geometry',
      'geom',
      'geo_point',
      'geopoint',
    ]) {
      if (first[candidate] !== undefined) return candidate;
    }
    return 'geo_point_2d';
  }

  // --- Render layer ---

  private async _renderLayer(
    clientBounds?: LatLngBounds,
    itemsOverride?: Record<string, unknown>[]
  ) {
    if (!this._leafletMap || !this._L || !this._layerGroup) return;
    const Leaf = this._L;
    const generation = ++this._renderGeneration;

    // Clear previous layer content
    this._layerGroup.clearLayers();
    if (this._clusterGroup) {
      this._clusterGroup.clearLayers();
      // Clustering desactive (attribut retire, changement de representation) :
      // l'ancien groupe restait sur la carte et capturait les rendus suivants
      // — residus de bulles par-dessus les cercles (#482 bug 6)
      if (!this.cluster) {
        if (this._leafletMap.hasLayer(this._clusterGroup)) {
          this._clusterGroup.removeFrom(this._leafletMap);
        }
        this._clusterGroup = null;
      }
    }

    let items = itemsOverride ?? this._data;

    // Compagnon popup resolu une fois par rendu (#297) — _findPopupCompanion
    // etait appele PAR RECORD (jusqu'a maxItems querySelector par rendu)
    this._popupCompanion = this._findPopupCompanion();

    // Client-side bounds filter — points ET geometries (#297) : ne savoir
    // extraire que des points faisait disparaitre TOUS les polygones des le
    // premier pan quand bbox est actif sans serverGeo
    if (clientBounds) {
      items = items.filter((record) => this._recordIntersectsBounds(record, clientBounds));
    }

    this._totalCount = items.length;

    // Max items safety
    const truncated = this.maxItems > 0 && items.length > this.maxItems;
    if (truncated) {
      items = items.slice(0, this.maxItems);
    }

    // Parse color-map (categorical color mapping)
    this._colorMapParsed = this.colorField && this.colorMap ? parseColorMap(this.colorMap) : null;
    this._colorFallbackUsed = false;

    // Choropleth setup (for geoshape with fill-field) — classes parametrables
    // (#685) : classes/method/breaks, défaut inchange (quantiles, autant de
    // classes que de couleurs dans l'echelle)
    let breaks: number[] = [];
    let palette: readonly string[] = [];
    let fillValues: number[] = [];
    if (this.fillField && this.type === 'geoshape') {
      fillValues = items.map((r) => Number(getByPath(r, this.fillField))).filter((v) => !isNaN(v));
      const scale =
        CHOROPLETH_SCALES[this.selectedPalette] || CHOROPLETH_SCALES['sequentialAscending'];
      ({ breaks, palette } = classifyValues(fillValues, scale, {
        method: this.method,
        classes: this.classes,
        breaks: this.breaks,
      }));
    }

    // Auto-scaling for circle radius-field
    this._radiusScale = null;
    if (this.radiusField && this.type === 'circle') {
      const values = items
        .map((r) => Number(getByPath(r, this.radiusField)))
        .filter((v) => !isNaN(v) && isFinite(v));
      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min;
        if (range > 0) {
          const rMin = this.radiusMin;
          const rMax = this.radiusMax;
          this._radiusScale = (val: number) => rMin + ((val - min) / range) * (rMax - rMin);
        } else {
          const mid = (this.radiusMin + this.radiusMax) / 2;
          this._radiusScale = () => mid;
        }
      }
    }

    // Load heatmap if needed
    if (this.type === 'heatmap' && !this._heatLoaded) {
      await this._loadHeatLayer();
      // Rendu obsolete : un _renderLayer plus recent est passe (#295)
      if (generation !== this._renderGeneration) return;
    }

    // Load clustering if needed
    if (this.cluster && !this._clusterLoaded) {
      await this._loadMarkerCluster();
      if (generation !== this._renderGeneration) return;
    }

    // Create cluster group if clustering
    if (this.cluster && this._clusterLoaded) {
      if (!this._clusterGroup) {
        const createCluster = this._markerClusterFactory;
        if (!createCluster) return;
        this._clusterGroup = createCluster({
          maxClusterRadius: this.clusterRadius,
          iconCreateFunction: (clusterObj: { getChildCount: () => number }) => {
            const count = clusterObj.getChildCount();
            const size = count < 10 ? 'small' : count < 100 ? 'medium' : 'large';
            return Leaf.divIcon({
              html: `<span class="dsfr-data-map__cluster dsfr-data-map__cluster--${size}">${count}</span>`,
              className: 'dsfr-data-map__cluster-icon',
              iconSize: Leaf.point(40, 40),
            });
          },
        });
        if (this._visible) {
          this._clusterGroup.addTo(this._leafletMap);
        }
      }
    }

    const targetGroup = this._clusterGroup || this._layerGroup;

    // Render each item
    this._skippedGeoCount = 0;
    this._renderedCount = 0;
    for (const record of items) {
      switch (this.type) {
        case 'marker':
          this._addMarker(record, Leaf, targetGroup);
          break;
        case 'geoshape':
          this._addGeoshape(record, Leaf, targetGroup, breaks, palette);
          break;
        case 'circle':
          this._addCircle(record, Leaf, targetGroup);
          break;
        case 'heatmap':
          // Collected below, not per-item
          break;
      }
    }

    // Heatmap: render all points at once via L.heatLayer
    if (this.type === 'heatmap') {
      this._renderedCount = this._renderHeatmap(items, Leaf);
    }

    // Lignes sans position exploitable : signaler au lieu d'echouer en
    // silence (#482 bug 3, generalise a tous les types #648). Un seul warn
    // par rendu, et pas de repetition tant que le compte ne change pas
    // (chaque pan en bbox client re-rend la couche).
    if (this._skippedGeoCount !== this._skippedWarned) {
      this._skippedWarned = this._skippedGeoCount;
      if (this._skippedGeoCount > 0) {
        const who = `dsfr-data-map-layer[${this.id || this.source}]`;
        console.warn(
          this.type === 'geoshape'
            ? `${who}: la colonne "${this.geoField || '(geo-field non renseigné)'}" ` +
                `ne contient pas de géométrie valide pour ${this._skippedGeoCount} enregistrement(s) sur ${items.length} — lignes ignorées`
            : `${who}: ${this._skippedGeoCount} ligne(s) sur ${items.length} sans coordonnées exploitables ` +
                `(${this._describeCoordFields()}) — lignes ignorées`
        );
      }
    }

    // Add to map if visible
    if (this._visible && this._leafletMap) {
      if (!this._clusterGroup && !this._leafletMap.hasLayer(this._layerGroup)) {
        this._layerGroup.addTo(this._leafletMap);
      }
    }

    // Report bounds for fit-bounds — par cle de layer, remplacement a
    // chaque rendu (#294)
    if (this._mapParent?.fitBounds) {
      // Une couche decorative (no-interactive : contours administratifs,
      // habillage) ne pilote pas le viewport — son emprise (France entiere)
      // empecherait le fit de suivre les donnees filtrees.
      const layerBounds = this.noInteractive
        ? null
        : (this._clusterGroup || this._layerGroup).getBounds?.();
      if (layerBounds?.isValid?.()) {
        this._mapParent.registerLayerBounds(this._boundsKey, layerBounds);
      } else {
        // Couche devenue vide (filtrage amont) ou decorative : liberer ses
        // bounds, sinon l'ancienne emprise fausse le fit des rendus suivants
        this._mapParent.unregisterLayerBounds(this._boundsKey);
      }
    }

    // Max-items banner
    this._updateBanner(truncated, items.length);

    // A11y: update map description with layer data summary
    if (this._mapParent) {
      const summaries: string[] = [];
      const allLayers = this._mapParent.querySelectorAll('dsfr-data-map-layer');
      for (const l of allLayers) {
        const layerEl = l as DsfrDataMapLayer;
        const count = (layerEl as unknown as { _data?: unknown[] })._data?.length ?? 0;
        if (count > 0) {
          const typeLabel =
            layerEl.type === 'marker'
              ? 'marqueurs'
              : layerEl.type === 'geoshape'
                ? 'zones'
                : layerEl.type === 'circle'
                  ? 'cercles'
                  : 'points';
          summaries.push(`${count} ${typeLabel}`);
        }
      }
      if (summaries.length > 0) {
        this._mapParent.updateDescription([`Couches : ${summaries.join(', ')}.`]);
      }
    }

    // Legende (#685) : entrees figees a ce rendu, puis notification des
    // compagnons (dsfr-data-map-legend) et des diagnostics
    this._buildLegendEntries(breaks, palette, fillValues);
    this.dispatchEvent(
      new CustomEvent('dsfr-data-map-layer-render', {
        bubbles: true,
        detail: {
          rendered: this._renderedCount,
          skipped: this._skippedGeoCount,
          total: this._totalCount,
          legend: this.getLegendEntries(),
        },
      })
    );
  }

  /** Champs de position tels que configures, pour les messages de diagnostic. */
  private _describeCoordFields(): string {
    if (this.latField && this.lonField)
      return `lat-field="${this.latField}", lon-field="${this.lonField}"`;
    if (this.geoField) return `geo-field="${this.geoField}"`;
    return 'auto-détection geo_point_2d / geopoint / geo_point';
  }

  // --- Marker ---

  private _addMarker(record: Record<string, unknown>, Leaf: LeafletModule, group: LayerGroup) {
    const coords = this._extractCoords(record);
    if (!coords) {
      this._skippedGeoCount++;
      return;
    }

    const markerColor = this._resolveColor(record);
    const icon = Leaf.divIcon({
      html: `<span class="fr-icon-map-pin-2-fill" style="color: ${markerColor}; font-size: 1.5rem;" aria-hidden="true"></span>`,
      className: 'dsfr-data-map__marker',
      iconSize: [24, 24],
      iconAnchor: [12, 24],
      popupAnchor: [0, -24],
    });

    // A11y: alt text on marker from tooltip-field (Leaflet uses title attr)
    const altText = this.tooltipField ? String(getByPath(record, this.tooltipField) ?? '') : '';

    const marker = Leaf.marker([coords.lat, coords.lon], {
      icon,
      alt: altText || 'Marqueur',
    });
    this._bindPopup(marker, record);
    this._bindTooltip(marker, record);
    this._bindSelect(marker, record);
    group.addLayer(marker);
    this._renderedCount++;
  }

  // --- Geoshape ---

  private _addGeoshape(
    record: Record<string, unknown>,
    Leaf: LeafletModule,
    group: LayerGroup,
    breaks: number[],
    palette: readonly string[]
  ) {
    const geoData = this.geoField ? parseGeoValue(getByPath(record, this.geoField)) : null;
    if (!geoData || typeof geoData !== 'object') {
      this._skippedGeoCount++;
      return;
    }

    const recordColor = this._resolveColor(record);
    let fillColor = recordColor;
    if (this.fillField && breaks.length > 0) {
      const val = Number(getByPath(record, this.fillField));
      if (!isNaN(val)) {
        fillColor = getColorForValue(val, breaks, palette);
      }
    }

    const geoJson =
      geoData && typeof geoData === 'object' && 'type' in (geoData as object) ? geoData : null;
    if (!geoJson) {
      this._skippedGeoCount++;
      return;
    }

    // Un objet avec `type` peut quand meme etre du GeoJSON invalide :
    // Leaflet jette alors « Invalid GeoJSON object » — exception non
    // interceptee qui coupait tout le rendu de la couche (#482 bug 3).
    // La ligne fautive est ignoree et comptee, le resume est logge en fin
    // de rendu par _renderLayer.
    let layer: LeafletLayer;
    try {
      layer = Leaf.geoJSON(geoJson as import('geojson').GeoJsonObject, {
        interactive: !this.noInteractive,
        style: {
          color: recordColor,
          weight: 1,
          fillColor,
          fillOpacity: this.fillOpacity,
          ...(this.shapeClass ? { className: this.shapeClass } : {}),
        },
      });
    } catch {
      this._skippedGeoCount++;
      return;
    }

    if (!this.noInteractive) {
      this._bindPopup(layer, record);
      this._bindTooltip(layer, record);
      this._bindSelect(layer, record);
    }
    group.addLayer(layer);
    this._renderedCount++;
  }

  // --- Circle ---

  private _addCircle(record: Record<string, unknown>, Leaf: LeafletModule, group: LayerGroup) {
    const coords = this._extractCoords(record);
    if (!coords) {
      this._skippedGeoCount++;
      return;
    }

    let r = this.radius;
    if (this.radiusField) {
      const val = Number(getByPath(record, this.radiusField));
      if (!isNaN(val)) {
        // radius-unit="m" : la valeur du champ EST en metres — l'echelle px
        // (radius-min..radius-max) produisait des cercles invisibles (#297)
        r = this.radiusUnit === 'm' ? val : this._radiusScale ? this._radiusScale(val) : val;
      }
    }

    const circleColor = this._resolveColor(record);
    const circleOptions = {
      radius: r,
      color: circleColor,
      fillColor: circleColor,
      fillOpacity: this.fillOpacity,
      weight: 1,
      interactive: !this.noInteractive,
      ...(this.shapeClass ? { className: this.shapeClass } : {}),
    };
    let circle: import('leaflet').Layer;
    if (this.radiusUnit === 'm') {
      circle = Leaf.circle([coords.lat, coords.lon], circleOptions);
    } else {
      circle = Leaf.circleMarker([coords.lat, coords.lon], circleOptions);
    }

    if (!this.noInteractive) {
      this._bindPopup(circle, record);
      this._bindTooltip(circle, record);
      this._bindSelect(circle, record);
    }
    group.addLayer(circle);
    this._renderedCount++;
  }

  // --- Heatmap ---

  /** Retourne le nombre de points effectivement projetes (#482). */
  private _renderHeatmap(items: Record<string, unknown>[], _Leaf: LeafletModule): number {
    if (!this._leafletMap) return 0;

    // Remove previous heat layer
    if (this._heatLayer) {
      this._heatLayer.remove();
      this._heatLayer = null;
    }

    const points: [number, number, number][] = [];
    let maxIntensity = 1;
    for (const record of items) {
      const coords = this._extractCoords(record);
      if (!coords) {
        this._skippedGeoCount++;
        continue;
      }
      let intensity = 1;
      if (this.heatField) {
        const val = Number(getByPath(record, this.heatField));
        if (!isNaN(val)) intensity = val;
      }
      if (intensity > maxIntensity) maxIntensity = intensity;
      points.push([coords.lat, coords.lon, intensity]);
    }

    if (points.length === 0) return 0;

    if (this._heatLoaded && this._heatLayerFactory) {
      this._heatLayer = this._heatLayerFactory(points, {
        radius: this.heatRadius,
        blur: this.heatBlur,
        // `max` : leaflet.heat rapporte l'alpha de chaque cellule a cette
        // valeur — sans normalisation, un heat-field en grandes valeurs
        // ou l'ancien maxZoom=max-zoom d'affichage (l'intensite y est
        // divisee par 2^(maxZoom - zoom), soit /4096 a zoom 6) rendait la
        // couche invisible (#482 bug 4). On cale `max` sur l'intensite
        // maximale reelle et `maxZoom` sur le zoom courant : pleine
        // intensite au zoom d'affichage, attenuation progressive au dezoom.
        max: maxIntensity,
        maxZoom: this._leafletMap.getZoom(),
      });
      if (this._visible && this._leafletMap) {
        this._heatLayer.addTo(this._leafletMap);
      }
    } else {
      // Fallback: transparent circles
      for (const [lat, lon] of points) {
        const circle = this._L!.circleMarker([lat, lon], {
          radius: 8,
          color: 'transparent',
          fillColor: this.color,
          fillOpacity: 0.3,
          weight: 0,
        });
        this._layerGroup!.addLayer(circle);
      }
    }
    return points.length;
  }

  private async _loadHeatLayer() {
    try {
      // leaflet.heat est un plugin UMD qui étend l'objet Leaflet : l'import
      // dynamique (chunk produit par le build) déclenche l'effet de bord,
      // puis on résout heatLayer là où l'interop l'a déposé.
      // @ts-expect-error — leaflet.heat ships no types
      await import('leaflet.heat');
      this._heatLayerFactory =
        (await resolveLeafletPluginSymbol<HeatLayerFactory>('heatLayer')) ?? null;
      this._heatLoaded = !!this._heatLayerFactory;
      if (!this._heatLoaded) {
        console.warn('dsfr-data-map-layer: leaflet.heat not available, using circle fallback');
      }
    } catch {
      console.warn('dsfr-data-map-layer: leaflet.heat not available, using circle fallback');
      this._heatLoaded = false;
    }
  }

  // --- Coordinate extraction ---

  /**
   * Le record intersecte-t-il le viewport ? Points ET geometries (#297).
   * Une geometrie inextractible est CONSERVEE : ne pas faire disparaitre
   * ce qu'on ne sait pas filtrer.
   */
  private _recordIntersectsBounds(record: Record<string, unknown>, bounds: LatLngBounds): boolean {
    const coords = this._extractCoords(record);
    if (coords) {
      return bounds.contains([coords.lat, coords.lon]);
    }

    const geoValue = parseGeoValue(
      this.geoField
        ? getByPath(record, this.geoField)
        : (record['geo_shape'] ?? record['geometry'] ?? record['geom'])
    );
    const bbox = this._geometryBbox(geoValue);
    if (!bbox) return true;

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return (
      bbox.maxLat >= sw.lat &&
      bbox.minLat <= ne.lat &&
      bbox.maxLon >= sw.lng &&
      bbox.minLon <= ne.lng
    );
  }

  /**
   * Bbox d'une geometrie GeoJSON (Feature, Polygon, MultiPolygon, lignes...)
   * par parcours des coordonnées [lon, lat] (#297). null si inextractible.
   */
  private _geometryBbox(
    geo: unknown
  ): { minLat: number; minLon: number; maxLat: number; maxLon: number } | null {
    const g = geo as
      { type?: string; coordinates?: unknown; geometry?: unknown } | null | undefined;
    if (!g || typeof g !== 'object') return null;
    if (g.type === 'Feature' && g.geometry) return this._geometryBbox(g.geometry);
    if (!g.coordinates) return null;

    let minLat = Infinity;
    let minLon = Infinity;
    let maxLat = -Infinity;
    let maxLon = -Infinity;
    const walk = (node: unknown): void => {
      if (!Array.isArray(node)) return;
      if (node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
        const lon = node[0];
        const lat = node[1];
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        return;
      }
      for (const child of node) walk(child);
    };
    walk(g.coordinates);

    if (!isFinite(minLat)) return null;
    return { minLat, minLon, maxLat, maxLon };
  }

  private _extractCoords(record: Record<string, unknown>): { lat: number; lon: number } | null {
    // Mode 1: lat-field + lon-field
    if (this.latField && this.lonField) {
      const rawLat = getByPath(record, this.latField);
      const rawLon = getByPath(record, this.lonField);
      // null / undefined / '' : Number() les vaut 0 — la ligne se dessinait
      // en (0, 0) dans le golfe de Guinee au lieu d'etre ignoree et comptee (#648)
      if (rawLat == null || rawLat === '' || rawLon == null || rawLon === '') return null;
      const lat = Number(rawLat);
      const lon = Number(rawLon);
      if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
      return null;
    }

    // Mode 2: geo-field (GeoJSON Point or {lat, lon} object)
    if (this.geoField) {
      const geo = parseGeoValue(getByPath(record, this.geoField)) as
        | { type?: string; coordinates?: unknown[]; lat?: unknown; lon?: unknown }
        | unknown[]
        | null
        | undefined;
      if (!geo) return null;

      // GeoJSON Point: { type: "Point", coordinates: [lon, lat] }
      if (
        !Array.isArray(geo) &&
        geo.type === 'Point' &&
        Array.isArray(geo.coordinates) &&
        geo.coordinates.length >= 2
      ) {
        return { lat: Number(geo.coordinates[1]), lon: Number(geo.coordinates[0]) };
      }
      // ODS geo_point_2d: { lat: N, lon: N }
      if (!Array.isArray(geo) && typeof geo.lat === 'number' && typeof geo.lon === 'number') {
        return { lat: geo.lat, lon: geo.lon };
      }
      // Array [lat, lon]
      if (Array.isArray(geo) && geo.length >= 2) {
        return { lat: Number(geo[0]), lon: Number(geo[1]) };
      }
      return null;
    }

    // Auto-detect from known field names
    for (const candidate of ['geo_point_2d', 'geopoint', 'geo_point']) {
      const geo = record[candidate] as
        { type?: string; coordinates?: unknown[]; lat?: unknown; lon?: unknown } | undefined;
      if (geo) {
        if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
          return { lat: Number(geo.coordinates[1]), lon: Number(geo.coordinates[0]) };
        }
        if (typeof geo.lat === 'number' && typeof geo.lon === 'number') {
          return { lat: geo.lat, lon: geo.lon };
        }
      }
    }

    return null;
  }

  // --- Popups ---

  /** Find a dsfr-data-map-popup companion that matches this layer.
   *  Priority: 1) popup child of this layer, 2) popup at map level with matching `for` */
  private _findPopupCompanion(): import('./dsfr-data-map-popup.js').DsfrDataMapPopup | null {
    // 1. Check for popup nested inside this layer element
    const ownPopup = this.querySelector('dsfr-data-map-popup');
    if (ownPopup) return ownPopup as import('./dsfr-data-map-popup.js').DsfrDataMapPopup;

    // 2. Check for popup at map level with explicit `for` targeting this layer
    if (!this._mapParent) return null;
    const layerId = this.id || this.source;
    const popups = this._mapParent.querySelectorAll(':scope > dsfr-data-map-popup');
    for (const p of popups) {
      const popup = p as import('./dsfr-data-map-popup.js').DsfrDataMapPopup;
      // Aligne sur matchesLayer() (#296) : sans `for`, le popup matche
      // toutes les couches — l'exemple de la docstring (popup enfant de la
      // carte, sans for) ne fonctionnait pas car le layer exigeait un for
      if (popup.matchesLayer?.(layerId)) return popup;
    }

    // 3. Carte d'encart (dsfr-data-map-inset) : deleguer aux popups de la
    //    carte hote — le volet/la modale s'ouvre sur la carte principale
    const inset = this._mapParent.closest('dsfr-data-map-inset');
    const hostMap = inset?.closest('dsfr-data-map');
    if (hostMap) {
      for (const p of hostMap.querySelectorAll(':scope > dsfr-data-map-popup')) {
        const popup = p as import('./dsfr-data-map-popup.js').DsfrDataMapPopup;
        if (popup.matchesLayer?.(layerId)) return popup;
      }
    }
    return null;
  }

  private _bindPopup(layer: LeafletLayer, record: Record<string, unknown>): void {
    const companion = this._popupCompanion;

    if (companion) {
      // Companion popup component handles display
      if (companion.mode === 'popup') {
        // Leaflet popup with companion template
        const html = companion.getPopupHtml(record);
        layer.bindPopup(html);
        this._bindPopupA11y(layer, record);
      } else {
        // Panel/modal: open on click, no Leaflet popup
        layer.on('click', () => {
          companion.showForRecord(record);
        });
      }
      return;
    }

    // Fallback: legacy popup-template / popup-fields attributes
    if (!this.popupTemplate && !this.popupFields) return;

    let content: string;
    if (this.popupTemplate) {
      content = this._interpolateTemplate(this.popupTemplate, record);
    } else {
      content = this._buildPopupTable(record);
    }

    layer.bindPopup(`<div class="dsfr-data-map__popup">${content}</div>`);
    this._bindPopupA11y(layer, record);
  }

  /** A11y bindings for Leaflet popups (both companion popup mode and legacy) */
  private _bindPopupA11y(layer: LeafletLayer, record: Record<string, unknown>): void {
    // A11y: on popup open, announce to screen reader + focus close button
    layer.on('popupopen', (e: LeafletPopupEvent) => {
      const popup = e.popup;
      const plainText = this._getPopupPlainText(record);
      this._mapParent?.announceToScreenReader(plainText);
      const closeBtn = popup
        .getElement()
        ?.querySelector('.leaflet-popup-close-button') as HTMLElement | null;
      if (closeBtn) {
        closeBtn.setAttribute('aria-label', 'Fermer la popup');
        setTimeout(() => closeBtn.focus(), 50);
      }
    });

    // A11y: on popup close, return focus to the marker/layer
    layer.on('popupclose', () => {
      const el = (layer as LeafletLayer & { getElement?: () => HTMLElement | null }).getElement?.();
      if (el) {
        setTimeout(() => el.focus(), 50);
      }
    });
  }

  private _interpolateTemplate(template: string, record: Record<string, unknown>): string {
    return template.replace(/\{([^}]+)\}/g, (_match, field: string) => {
      const value = getByPath(record, field.trim());
      return value !== undefined ? escapeHtml(String(value)) : '';
    });
  }

  private _buildPopupTable(record: Record<string, unknown>): string {
    const fields = this.popupFields
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    const rows = fields.map((field) => {
      const value = getByPath(record, field);
      const display = value !== undefined ? escapeHtml(String(value)) : '';
      return `<tr><th>${escapeHtml(field)}</th><td>${display}</td></tr>`;
    });
    return `<table class="fr-table fr-table--sm">${rows.join('')}</table>`;
  }

  // --- Tooltips ---

  private _bindTooltip(layer: LeafletLayer, record: Record<string, unknown>): void {
    if (!this.tooltipField) return;
    const value = getByPath(record, this.tooltipField);
    if (value !== undefined) {
      layer.bindTooltip(escapeHtml(String(value)));
    }
  }

  /** Extract plain text from a popup record for screen reader announcement */
  private _getPopupPlainText(record: Record<string, unknown>): string {
    if (this.popupFields) {
      const fields = this.popupFields
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean);
      return fields
        .map((field) => {
          const value = getByPath(record, field);
          return value !== undefined ? `${field}: ${value}` : '';
        })
        .filter(Boolean)
        .join(', ');
    }
    if (this.popupTemplate) {
      // Strip HTML from interpolated template
      const html = this._interpolateTemplate(this.popupTemplate, record);
      return html
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return '';
  }

  // --- Clustering ---

  private async _loadMarkerCluster() {
    try {
      // Inject MarkerCluster CSS (inlined to avoid CSP issues)
      if (!document.querySelector('style[data-markercluster-css]')) {
        const style = document.createElement('style');
        style.setAttribute('data-markercluster-css', '');
        style.textContent = markerClusterCss + '\n' + markerClusterDefaultCss;
        document.head.appendChild(style);
      }

      // leaflet.markercluster est un plugin UMD qui étend l'objet Leaflet :
      // l'import dynamique (chunk produit par le build) déclenche l'effet de
      // bord, puis on résout la factory/le constructeur là où l'interop CJS
      // l'a déposé (window.L ou export default du module Leaflet bundlé).
      await import('leaflet.markercluster');

      const factory = await resolveLeafletPluginSymbol<ClusterFactory>('markerClusterGroup');
      const ctor = factory
        ? undefined
        : await resolveLeafletPluginSymbol<new (opts?: Record<string, unknown>) => FeatureGroup>(
            'MarkerClusterGroup'
          );
      this._markerClusterFactory = factory ?? (ctor ? (opts) => new ctor(opts) : null);
      this._clusterLoaded = !!this._markerClusterFactory;

      // Inject DSFR cluster styles
      if (!document.querySelector('style[data-dsfr-map-cluster]')) {
        const style = document.createElement('style');
        style.setAttribute('data-dsfr-map-cluster', '');
        style.textContent = `
          .dsfr-data-map__cluster-icon {
            background: none !important;
            border: none !important;
          }
          .dsfr-data-map__cluster {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            color: white;
            font-weight: 700;
            font-size: 0.875rem;
          }
          .dsfr-data-map__cluster--small {
            background: var(--background-action-high-blue-france, #000091);
          }
          .dsfr-data-map__cluster--medium {
            background: var(--background-action-high-blue-ecume, #2323B4);
          }
          .dsfr-data-map__cluster--large {
            background: var(--background-flat-error, #C9191E);
          }
        `;
        document.head.appendChild(style);
      }
    } catch {
      console.warn('dsfr-data-map-layer: leaflet.markercluster not available, clustering disabled');
      this._clusterLoaded = false;
    }
  }

  // --- Max-items banner ---

  private _updateBanner(truncated: boolean, displayedCount: number) {
    this._removeBanner();
    if (!truncated) return;
    // Carte verrouillee (encart territorial, vignette) : pas de bandeau —
    // 160 px de haut, il recouvrait les libelles et se repetait dans chaque
    // encart (#644). La carte principale porte deja l'information.
    if (this._mapParent?.locked) return;

    this._banner = document.createElement('div');
    this._banner.className = 'dsfr-data-map__max-items-banner';
    this._banner.textContent = this._bannerText(displayedCount);
    // Plusieurs layers tronques : empiler les banners au lieu de les
    // superposer (#297)
    const existing =
      this._mapParent?.querySelectorAll('.dsfr-data-map__max-items-banner').length ?? 0;
    if (existing > 0) {
      this._banner.style.bottom = `${10 + existing * 36}px`;
    }
    this._mapParent?.appendChild(this._banner);
  }

  /**
   * Libellé du bandeau max-items (#644). « Zoomez » n'a de sens qu'en mode
   * `bbox` (la zone visible est rechargee au zoom) ; hors bbox rien n'est
   * recharge, le seul remede est de relever `max-items` — le dire.
   */
  private _bannerText(displayedCount: number): string {
    const shown = displayedCount.toLocaleString('fr-FR');
    const total = this._totalCount.toLocaleString('fr-FR');
    if (this.bbox) {
      return `${shown} éléments affichés sur ${total} disponibles. Zoomez pour voir plus de détail.`;
    }
    return `${shown} affichés sur ${total} — relevez max-items pour voir le reste.`;
  }

  private _removeBanner() {
    if (this._banner) {
      this._banner.remove();
      this._banner = null;
    }
  }

  render() {
    return undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-map-layer': DsfrDataMapLayer;
  }
}

import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { dispatchSourceCommand } from '../utils/data-bridge.js';
import { TransformerMixin } from '../utils/transformer-mixin.js';
import type { ApiAdapter, AdapterParams, FacetDescriptor } from '../adapters/api-adapter.js';
import type { SourceElement } from '../utils/source-element.js';
import { isUnsafeKey, toNumber } from '@dsfr-data/shared/lib';
import type { ContextFilterLike } from '@dsfr-data/shared/lib';
import { joinWhere, escapeColonValue } from '../utils/where.js';
import { logFetchWarning } from '../utils/fetch-diagnostics.js';
import { warnSuspectSeparator } from '../utils/attr-separators.js';
import {
  parsePerRow,
  spanForPerRow,
  legacyConflictMessage,
  syncLayoutError,
} from '../utils/grid-layout.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import { CONTEXT_CONNECTED_EVENT, findContextById } from './dsfr-data-context.js';
import type { DsfrDataContext } from './dsfr-data-context.js';

type FacetDisplayMode = 'checkbox' | 'select' | 'multiselect' | 'radio' | 'radio-inline';

/** Modes d'affichage reconnus par `display` (toute autre valeur est ignoree) */
const FACET_DISPLAY_MODES: ReadonlySet<string> = new Set<FacetDisplayMode>([
  'checkbox',
  'select',
  'multiselect',
  'radio',
  'radio-inline',
]);

/** Tri resolu d'une facette : critère et sens (#645, par champ depuis #741) */
interface FacetSort {
  by: 'count' | 'alpha';
  dir: 'asc' | 'desc';
}

/** Critères de tri reconnus — sert aussi a distinguer forme globale et forme par champ (#741) */
const FACET_SORT_CRITERIA: ReadonlySet<string> = new Set(['count', 'alpha']);

/** Tri applique a un champ que `sort` ne nomme pas */
const DEFAULT_FACET_SORT: FacetSort = { by: 'count', dir: 'desc' };

interface FacetValue {
  value: string;
  count: number;
  /** Valeur selectionnee absente des données courantes (#310) : rendue
   * desactivable pour ne pas laisser un filtre invisible actif */
  missing?: boolean;
}

interface FacetGroup {
  field: string;
  label: string;
  values: FacetValue[];
}

/**
 * Un champ de facette vu par le contexte (#678, ADR-104) : la facette
 * s'enregistre UNE fois par champ aupres de <dsfr-data-context>, qui
 * diffuse la clause a ses cibles (au dialecte de chacune), porte l'URL et
 * alimente les tags. La facette, elle, continue de calculer valeurs,
 * compteurs et cascade sur sa `source`.
 */
class FacetFieldFilter implements ContextFilterLike {
  readonly applyTo = '*';
  /** `in` pour la detection de doublon : c'est l'opérateur multi-valeurs de la facette */
  readonly operator = 'in';

  constructor(
    private readonly host: DsfrDataFacets,
    readonly field: string
  ) {}

  get isConnected(): boolean {
    return this.host.isConnected;
  }

  private _values(): string[] {
    return [...(this.host._selectionsOf(this.field) ?? [])];
  }

  /** Une valeur = `eq`, plusieurs = `in` (meme forme que le repli colon de la facette) */
  buildColonWhere(): string {
    const values = this._values();
    if (values.length === 0) return '';
    if (values.length === 1) return `${this.field}:eq:${escapeColonValue(values[0])}`;
    return `${this.field}:in:${values.map((v) => escapeColonValue(v)).join('|')}`;
  }

  displayLabel(): string {
    return this.host._parseLabels().get(this.field) ?? this.field;
  }

  displayValue(): string {
    return this._values().join(', ');
  }

  /** Un tag par valeur dans context-tags (#679) */
  displayValues(): string[] {
    return this._values();
  }

  /** Meme chemin qu'un clic « Tout » : la facette re-pousse son etat au contexte */
  clear(): void {
    this.host._clearFieldSelections(this.field);
  }

  /** Meme chemin qu'une case decochee : les autres valeurs du champ restent (#679) */
  clearValue(value: string): void {
    this.host._removeFieldValue(this.field, value);
  }

  urlValue(): string {
    return this._values().join(',');
  }
}

/**
 * <dsfr-data-facets> - Filtres a facettes interactifs
 *
 * Composant visuel intermediaire qui affiche des controles de filtre
 * bases sur les valeurs categoriques des données. Se place entre une
 * source/normalize/query et les composants de visualisation.
 *
 * Les données filtrees sont redistribuees automatiquement aux composants en aval.
 *
 * @example
 * <dsfr-data-source id="raw" url="https://api.example.com/data" transform="data"></dsfr-data-source>
 * <dsfr-data-normalize id="clean" source="raw" trim numeric-auto></dsfr-data-normalize>
 * <dsfr-data-facets id="filtered" source="clean" fields="region, type"></dsfr-data-facets>
 * <dsfr-data-chart source="filtered" type="bar" label-field="region" value-field="population"></dsfr-data-chart>
 * En mode `context="id"` (#678, ADR-104), la facette devient un filtre de
 * <dsfr-data-context> : un filtre par champ, diffusion par le contexte a
 * toutes ses sources cibles (au dialecte de chacune), URL portee par le
 * contexte (un paramètre par champ), tags gratuits. Elle n'emet plus de
 * commande directe ; valeurs, compteurs et cascade restent calcules sur sa
 * `source` (client ou `server-facets`, inchanges).
 *
 * @fires dsfr-data-source-command - `{ sourceId, where, whereKey, origin }` sur `document` — selection de facettes relayee en filtre serveur (hors mode `context`, ou c'est le contexte qui diffuse). `origin` porte l'id de ce composant (#603).
 */
let facetsInstanceSeq = 0;

@customElement('dsfr-data-facets')
export class DsfrDataFacets extends TransformerMixin(LitElement) {
  /** ID de la source de données a ecouter */
  @property({ type: String })
  source = '';

  /**
   * Champs à exposer comme facettes (virgule-séparés). Vide = auto-détection sur les
   * données chargées ; en `server-facets`, vide = découverte des facettes déclarées par le
   * jeu de données (OpenDataSoft : métadonnées du jeu ; Grist : colonnes Choice/ChoiceList, #680)
   */
  @property({ type: String })
  fields = '';

  /** Labels custom : "field:Label | field2:Label 2" */
  @property({ type: String })
  labels = '';

  /** Nb de valeurs visibles par facette avant "Voir plus" */
  @property({ type: Number, attribute: 'max-values' })
  maxValues = 6;

  /** Champs en mode multi-sélection OU (virgule-séparés) */
  @property({ type: String })
  disjunctive = '';

  /**
   * Tri des valeurs de chaque facette, grammaire `critere:sens` alignée sur
   * `order-by` de dsfr-data-query (#645) :
   * - `count:desc` (défaut) : du plus fréquent au plus rare
   * - `count:asc` : du plus rare au plus fréquent
   * - `alpha:asc` : A -> Z (collation française)
   * - `alpha:desc` : Z -> A
   * Raccourcis : `count` = `count:desc`, `alpha` = `alpha:asc`.
   * Formes `-count` / `-alpha` DÉPRÉCIÉES : conservées à l'identique
   * (`-count` = rare d'abord, `-alpha` = Z -> A) mais un avertissement console
   * invite a passer a la forme explicite ; retrait dans une version majeure.
   *
   * Tri PAR CHAMP (#741), même grammaire à barre verticale que `labels`,
   * `display` et `cols` : `champ:critere[:sens]`, par exemple
   * `sort="annee:alpha:asc | categorie:count:desc"`. Une facette d'années se
   * range alphabétiquement pendant qu'une facette de catégories reste rangée
   * par fréquence, sans dupliquer le composant. Un champ non nommé garde le
   * tri par défaut ; l'entrée `*:critere[:sens]` change ce défaut
   * (`sort="*:alpha | annee:count:desc"`).
   */
  @property({ type: String })
  sort = 'count';

  /** Champs avec barre de recherche (virgule-séparés) */
  @property({ type: String })
  searchable = '';

  /** Masquer les facettes avec une seule valeur */
  @property({ type: Boolean, attribute: 'hide-empty' })
  hideEmpty = false;

  /**
   * Mode d'affichage par facette : "champ:mode | champ2:mode". Défaut = checkbox.
   * - `checkbox` : cases à cocher visibles dans un fieldset DSFR (sélection multiple)
   * - `select` : liste déroulante native fr-select (sélection unique)
   * - `multiselect` : menu déroulant repliable avec cases à cocher et recherche (sélection multiple)
   * - `radio` : menu déroulant repliable contenant des boutons radio et une recherche
   *   (sélection unique) — sera renommé `radio-dropdown` dans une version majeure
   * - `radio-inline` : boutons radio DSFR visibles en ligne, précédés d'une option « Tous »
   *   qui retire la sélection (sélection unique, #684)
   */
  @property({ type: String })
  display = '';

  /**
   * Active la lecture des paramètres d'URL comme pré-sélections de facettes.
   * Sans `url-param-map`, seuls les paramètres qui portent le nom d'une
   * facette EFFECTIVE sont lus (champs de `fields`, ou facettes détectées) —
   * jamais n'importe quelle colonne des données (#773).
   * Dès qu'un `dsfr-data-context` est présent, préférer `context="id"` :
   * le contexte porte alors l'URL, un paramètre par champ, et `url-params`
   * est ignoré. Un paramètre lu à la fois par une facette autonome et par un
   * contexte à `url-sync` est une erreur de configuration.
   */
  @property({ type: Boolean, attribute: 'url-params' })
  urlParams = false;

  /** Mapping URL param -> champ facette : "param:field | param2:field2". Si vide, correspondance directe */
  @property({ type: String, attribute: 'url-param-map' })
  urlParamMap = '';

  /** Synchronise l'URL quand l'utilisateur change les facettes (replaceState — pas d'entrée d'historique par clic) */
  @property({ type: Boolean, attribute: 'url-sync' })
  urlSync = false;

  /**
   * Active le mode facettes serveur ODS.
   * Fetch les valeurs de facettes depuis l'API ODS /facets au lieu de les calculer localement.
   * Requiert source pointant vers un dsfr-data-source avec api-type="opendatasoft" et server-side.
   * Sans `fields`, un appel de découverte au premier cycle liste les facettes déclarées par le
   * jeu (mémorisé, invalidé si la source ou `dataset-id` change, #680). Les facettes de type
   * date (valeurs par année) sont filtrées par intervalle et non par égalité (#676).
   */
  @property({ type: Boolean, attribute: 'server-facets' })
  serverFacets = false;

  /**
   * Valeurs de facettes pre-calculees (JSON).
   * Format: {"field": ["val1", "val2"], "field2": ["a", "b"]}
   * Quand cet attribut est défini, les facettes utilisent ces valeurs sans les
   * calculer depuis les données. Les selections envoient des commandes WHERE
   * en colon syntax (compatible Tabular / generique) au dsfr-data-query en amont.
   * Attribut fields requis (pas d'auto-detection).
   */
  @property({ type: String, attribute: 'static-values' })
  staticValues = '';

  /** Masquer les compteurs a cote de chaque valeur de facette */
  @property({ type: Boolean, attribute: 'hide-counts' })
  hideCounts = false;

  /**
   * Champ numérique dont la SOMME remplace le nombre de lignes dans les
   * compteurs (#739). Sur une table de mesures, « 1 240 » relevés ne dit rien
   * au lecteur : `weight-field="effectif"` annonce la somme des effectifs.
   * Le tri `count` porte alors sur cette somme.
   *
   * CLIENT UNIQUEMENT, et c'est assume : en mode `server-facets`, la reponse
   * de l'API facettes ne porte qu'un nombre de lignes, jamais la somme d'une
   * mesure. Plutot qu'afficher un nombre de lignes sous un libellé de somme,
   * les compteurs y sont MASQUÉS, une erreur de configuration est posee
   * (console + `data-dsfr-config-error`) et un avertissement DSFR est rendu
   * au-dessus des facettes. Meme chose en `static-values`, ou les compteurs
   * sont déjà masques faute de données.
   *
   * Une valeur non numérique compte pour zero ; si le champ est absent de
   * toutes les lignes, un avertissement console le signale.
   */
  @property({ type: String, attribute: 'weight-field' })
  weightField = '';

  /** Champ de ponderation demande, normalise (#739) */
  private get _weightField(): string {
    return this.weightField.trim();
  }

  /**
   * `weight-field` demande la ou la somme n'existe pas (#739) : mode
   * `server-facets`. Les compteurs sont masques et l'auteur est prevenu.
   */
  get _weightUnsupported(): boolean {
    return !!this._weightField && this.serverFacets;
  }

  /** Compteurs effectivement masques (force a true en mode static-values) */
  get _effectiveHideCounts(): boolean {
    return this.hideCounts || !!this.staticValues || this._weightUnsupported;
  }

  /**
   * Colonnage DSFR des facettes : "6" (global) ou "field:4 | field2:6" (par facette), en
   * colonnes de la grille de 12 — une LARGEUR, pas un nombre de facettes par ligne.
   * Appliqué à partir de 768 px ; en dessous, chaque facette occupe toute la ligne
   * (`fr-col-12 fr-col-md-N`, #788). Sans `cols`, grille automatique qui se replie seule.
   */
  @property({ type: String })
  cols = '';

  /**
   * Largeur des facettes sur la grille de 12 colonnes, à partir de 768 px :
   * `"6"` pour toutes, ou `"annee:3 | categorie:6"` par facette. Remplace
   * `cols`, même sens et même grammaire, sans l'ambiguïté du mot : sur
   * `dsfr-data-display` et `dsfr-data-kpi-group`, `cols` compte des éléments
   * par ligne (#790). Prime sur `cols` s'ils sont posés ensemble.
   */
  @property({ type: String })
  span = '';

  /**
   * Nombre de facettes par ligne à partir de 768 px (en dessous : une par
   * ligne) — 1, 2, 3, 4, 6 ou 12. Se combine avec `span` par facette : une
   * facette nommée dans `span` garde sa largeur, les autres se partagent la
   * ligne selon `per-row` (#790).
   */
  @property({ type: String, attribute: 'per-row' })
  perRow = '';

  /** Erreur de colonnage posée par ce composant (#790). */
  private _layoutError: string | null = null;

  /**
   * Id du dsfr-data-context auquel s'enregistrer (#678, ADR-104). La facette
   * devient alors un filtre du contexte, un par champ : c'est le contexte
   * qui diffuse a ses sources cibles et qui porte l'URL (`url-sync` et
   * `url-params` de la facette sont ignorés — reporter `url-param-map` sur
   * le contexte). Le contexte peut être déclaré après la facette dans la
   * page. Vide = comportement autonome historique (commande directe à `source`).
   * Le contexte délègue chaque sélection aux sources qu'il vise : le champ
   * doit donc exister SUR CES SOURCES. Une facette sur une colonne calculée
   * en aval (`compute` d'un normalize) ne peut pas passer par le contexte —
   * c'est une erreur de configuration nommée quand le contexte le sait (#805),
   * un HTTP 400 de l'API sinon ; la garder autonome, chaînée en aval, avec un
   * `url-param-map` qui borne sa lecture d'URL (#773).
   */
  @property({ type: String })
  context = '';

  /**
   * Masque le bouton local « Réinitialiser les filtres » (#679, #640 pt 9).
   * À poser quand un dsfr-data-context-tags clear-all fait office de « tout
   * effacer » pour la page (mode `context`), ou pour qu'une colonne de
   * facettes ne change pas de hauteur à la première sélection.
   */
  @property({ type: Boolean, attribute: 'no-reset' })
  noReset = false;

  @state()
  private _rawData: Record<string, unknown>[] = [];

  @state()
  private _facetGroups: FacetGroup[] = [];

  @state()
  private _activeSelections: Record<string, Set<string>> = {};

  @state()
  private _expandedFacets: Set<string> = new Set();

  @state()
  private _searchQueries: Record<string, string> = {};

  @state()
  private _openMultiselectField: string | null = null;

  /** Message annonce par la live region (lecteurs d'écran) */
  @state()
  private _liveAnnouncement = '';

  /** Message d'erreur de configuration (id/source manquant) — rendu en alerte DSFR */
  @state()
  private _configError: string | null = null;

  private _popstateHandler: (() => void) | null = null;

  /** Contexte resolu (mode `context`, #678) */
  private _context: DsfrDataContext | null = null;

  /**
   * Un filtre de contexte par champ, avec son whereKey et la dernière clause
   * confiee au contexte (mode `context`, #678) — un champ inchange n'est pas
   * re-diffuse : une source cible re-emet après chaque commande
   */
  private _contextFilters = new Map<
    string,
    { filter: FacetFieldFilter; whereKey: string; pushed: string }
  >();

  /** Un contexte vise par id vient d'être connecte : (re)bind si c'est le notre (#678) */
  private _onContextConnected = (e: Event) => {
    const id = (e as CustomEvent<{ id: string | null }>).detail?.id;
    if (this.context && id === this.context) this._bindContext();
  };

  /** Mode `context` demande (que le contexte soit déjà resolu ou non) */
  private get _contextMode(): boolean {
    return this.context.trim() !== '';
  }

  /** Lecture de l'URL par la facette elle-meme — desactivee en mode `context` (l'URL est au contexte) */
  private get _ownUrlParams(): boolean {
    return this.urlParams && !this._contextMode;
  }

  /** Ecriture de l'URL par la facette elle-meme — desactivee en mode `context` */
  private get _ownUrlSync(): boolean {
    return this.urlSync && !this._contextMode;
  }

  /** Selections courantes d'un champ (lues par les filtres de contexte) */
  _selectionsOf(field: string): Set<string> | undefined {
    return this._activeSelections[field];
  }

  // --- Public API (delegation to upstream source) ---

  /**
   * Retourne l'adapter de la source amont (délégation transparente).
   * Permet aux composants en aval d'acceder a l'adapter
   * sans connaitre la structure du pipeline.
   */
  public getAdapter(): ApiAdapter | null {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getAdapter' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getAdapter();
      }
    }
    return null;
  }

  /**
   * Retourne le where effectif de la source amont (délégation transparente).
   */
  public getEffectiveWhere(excludeKey?: string | string[]): string {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getEffectiveWhere' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getEffectiveWhere(excludeKey);
      }
    }
    return '';
  }
  private _urlParamsApplied = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-facets');
    document.addEventListener('click', this._onClickOutsideMultiselect);
    if (this._ownUrlSync) {
      this._popstateHandler = () => {
        this._applyUrlParams();
        this._buildFacetGroups();
        this._applyFilters();
      };
      window.addEventListener('popstate', this._popstateHandler);
    }
    if (this._contextMode) {
      document.addEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
      // Bind differe d'un tick : dans un meme fragment innerHTML, le contexte
      // declare apres la facette n'est pas encore upgrade
      queueMicrotask(() => this._bindContext());
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
    this._unbindContext();
    // Abandonne le fetch de facettes en vol (#309)
    this._facetsAbort?.abort();
    this._facetsAbort = null;
    // Nettoie le debounce de recherche (#313 — search nettoie le sien)
    if (this._searchDebounceTimer) {
      clearTimeout(this._searchDebounceTimer);
      this._searchDebounceTimer = null;
    }
    this._setBackgroundInert(false);
    document.removeEventListener('click', this._onClickOutsideMultiselect);
    if (this._popstateHandler) {
      window.removeEventListener('popstate', this._popstateHandler);
      this._popstateHandler = null;
    }
  }

  willUpdate(changed: Map<PropertyKey, unknown>) {
    super.willUpdate(changed);
    // Changement de contexte a chaud (#678) : on libere l'ancien, on rejoint le nouveau
    if (changed.has('context') && this.hasUpdated) {
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

  /**
   * `weight-field` en mode `server-facets` : erreur de configuration posee
   * APRES le rendu (#739). `_bindContext()` appelle `clearConfigError()` en
   * cas de succes, et il tourne dans `willUpdate` : poser le marqueur ici
   * garantit qu'il survit au cycle.
   */
  updated(changed: Map<PropertyKey, unknown>) {
    super.updated(changed);
    this._checkUrlParamConflicts();
    if (changed.has('span') || changed.has('perRow') || changed.has('cols')) {
      this._syncLayoutError();
    }
    if (this._weightUnsupported) {
      const message =
        `weight-field="${this._weightField}" n'est pas disponible en mode server-facets ` +
        `(l'API facettes ne renvoie qu'un nombre de lignes, jamais la somme d'une mesure) — ` +
        `les compteurs sont masques. Retirer weight-field, ou calculer les facettes cote client.`;
      if (!this._weightUnsupportedReported) {
        this._weightUnsupportedReported = true;
        reportConfigError(this, 'dsfr-data-facets', message);
      } else if (!this.hasAttribute('data-dsfr-config-error')) {
        // Un cycle a pu lever le marqueur (`clearConfigError` du mode context)
        this.setAttribute('data-dsfr-config-error', message);
      }
    } else if (this._weightUnsupportedReported) {
      this._weightUnsupportedReported = false;
      clearConfigError(this);
    }
  }

  /** L'erreur `weight-field` + `server-facets` n'est journalisee qu'une fois (#739) */
  private _weightUnsupportedReported = false;

  /** Changement de mode (serveur/statique) → re-souscription complete (#281) */
  protected transformerReinitProps(): string[] {
    return ['source', 'serverFacets', 'staticValues'];
  }

  /** Paramètres de facettes → reconstruction des groupes (#281) */
  protected transformerReprocessProps(): string[] {
    return [
      'fields',
      'labels',
      'sort',
      'weightField',
      'hideEmpty',
      'maxValues',
      'disjunctive',
      'searchable',
      'display',
      'cols',
      'span',
      'perRow',
    ];
  }

  protected onTransformerReprocess(): void {
    if (this._rawData.length === 0) return;
    if (this.serverFacets) {
      this._fetchServerFacets();
    } else if (this.staticValues) {
      this._buildStaticFacetGroups();
    } else {
      this._buildFacetGroups();
      this._applyFilters();
    }
  }

  /** Alias historique de reinitTransformer() — conserve pour les tests */
  _initialize() {
    this.reinitTransformer();
  }

  // --- Hooks TransformerMixin (#280) ---

  protected transformerName(): string {
    return 'dsfr-data-facets';
  }

  protected validateTransformerConfig(): string | null {
    if (!this.id) {
      this._configError = 'attribut "id" requis pour identifier la sortie';
      return this._configError;
    }
    if (!this.source) {
      this._configError = 'attribut "source" requis';
      return this._configError;
    }
    this._configError = null;
    return null;
  }

  protected beforeTransformerSubscribe(): void {
    const hadSelections = this._hasActiveSelections();
    this._activeSelections = {};
    this._expandedFacets = new Set();
    this._searchQueries = {};

    // Re-souscription en mode context (changement de source) : les filtres
    // du contexte ne doivent pas rester figes sur des selections effacees
    if (this._context && hadSelections) {
      this._pushContextFilters();
    }

    // In server/static mode with URL params, read selections and send command
    // proactively BEFORE data arrives. This lets dsfr-data-query (which defers its
    // first fetch in server-side mode) include the facet filter in the initial request.
    const isServerMode = this.serverFacets || !!this.staticValues;
    if (isServerMode && this._ownUrlParams && !this._urlParamsApplied) {
      this._applyUrlParams();
      this._urlParamsApplied = true;
      if (this._hasActiveSelections()) {
        this._dispatchFacetCommand();
      }
    }
  }

  protected onTransformerData(data: unknown): void {
    this._onData(data);
  }

  /**
   * Meta amont propagee telle quelle en mode serveur (lignes pre-filtrees,
   * total valide). En filtre client le nombre de lignes change : pas de
   * meta (#282).
   */
  protected transformMeta(meta: import('../utils/data-bridge.js').PaginationMeta) {
    return this.serverFacets || this.staticValues ? meta : null;
  }

  private _onData(data: unknown) {
    this._rawData = Array.isArray(data) ? data : [];
    const isServerMode = this.serverFacets || !!this.staticValues;
    if (this._ownUrlParams && !this._urlParamsApplied) {
      this._applyUrlParams();
      this._urlParamsApplied = true;
      // In server mode, send initial URL-selected facets as command
      if (isServerMode && this._hasActiveSelections()) {
        this._dispatchFacetCommand();
        return; // command will trigger a new data load
      }
    }
    if (this.serverFacets) {
      if (this._serverFacetsSupported()) {
        this._fetchServerFacets();
        // Re-emit data as-is (no local filtering) — meta posee AVANT le
        // dispatch par le mixin
        this.emitTransformedData(this._rawData);
      } else {
        // Fallback client (#313) : UN seul dispatch (filtre) — l'ancien
        // chemin emettait le brut ici PUIS _fetchServerFacets, en
        // fallback synchrone, re-emettait le filtre (contenus differents)
        this._buildFacetGroups();
        this._applyFilters();
      }
    } else if (this.staticValues) {
      this._buildStaticFacetGroups();
      // Re-emit data as-is (filtering happens server-side)
      this.emitTransformedData(this._rawData);
    } else {
      this._buildFacetGroups();
      this._applyFilters();
    }
  }

  // --- Facet index building ---

  /**
   * Reinjecte les selections orphelines dans les groupes (#310) : après un
   * refetch, une valeur selectionnee disparue des données restait dans
   * _activeSelections — la checkbox n'etait plus rendue mais le filtre
   * restait actif (résultats vides inexplicables). Elle est rendue cochee,
   * marquee indisponible, donc desactivable.
   */
  private _appendOrphanSelections(groups: FacetGroup[]): FacetGroup[] {
    const labelMap = this._parseLabels();
    const byField = new Map(groups.map((g) => [g.field, g]));
    for (const [field, selected] of Object.entries(this._activeSelections)) {
      if (selected.size === 0) continue;
      let group = byField.get(field);
      if (!group) {
        // Groupe entier disparu (ex: 0 resultat) : le recreer pour garder
        // les selections desactivables
        group = { field, label: labelMap.get(field) ?? field, values: [] };
        groups.push(group);
        byField.set(field, group);
      }
      const known = new Set(group.values.map((v) => v.value));
      for (const value of selected) {
        if (!known.has(value)) {
          group.values.push({ value, count: 0, missing: true });
        }
      }
    }
    return groups;
  }

  // --- Templates partages entre les 3 modes de rendu (#313) ---

  /**
   * Compteur affiche : nombre de lignes tel quel (historique), ou somme
   * ponderee formatee a la francaise (#739) — une somme d'effectifs se lit
   * « 12 340 », pas « 12340 ».
   */
  _formatCount(count: number): string {
    if (!this._weightField || this._weightUnsupported) return String(count);
    return count.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  }

  /** Texte lu par les lecteurs d'écran a cote d'une valeur de facette */
  private _countSrText(count: number): string {
    const formatted = this._formatCount(count);
    if (this._weightField && !this._weightUnsupported) {
      return `, total ${formatted}`;
    }
    return `, ${formatted} resultat${count > 1 ? 's' : ''}`;
  }

  /** Libellé « valeur + compteur » — etait copie 3x (checkbox, multiselect, radio) */
  private _renderValueLabel(fv: FacetValue) {
    const missingHint = fv.missing
      ? html`<span class="fr-hint-text">(indisponible)</span>`
      : nothing;
    return html`${fv.value}${missingHint}${
      this._effectiveHideCounts || fv.missing
        ? nothing
        : html`<span class="dsfr-data-facets__count" aria-hidden="true"
              >${this._formatCount(fv.count)}</span
            ><span class="fr-sr-only">${this._countSrText(fv.count)}</span>`
    }`;
  }

  /** Barre de recherche des panels multiselect/radio — etait copiee 2x */
  private _renderPanelSearchBar(group: FacetGroup, uid: string) {
    return html`
      <div class="fr-search-bar" role="search">
        <label class="fr-label fr-sr-only" for="${uid}-search"
          >Rechercher dans ${group.label}</label
        >
        <input
          class="fr-input"
          type="search"
          id="${uid}-search"
          placeholder="Rechercher..."
          aria-describedby="${uid}-search-hint"
          .value="${this._searchQueries[group.field] ?? ''}"
          @input="${(e: Event) => this._handleSearch(group.field, e)}"
        />
        <span class="fr-sr-only" id="${uid}-search-hint"
          >Les resultats se mettent a jour automatiquement</span
        >
        <button class="fr-btn" type="button" title="Rechercher" aria-hidden="true" tabindex="-1">
          Rechercher
        </button>
      </div>
    `;
  }

  /** Élément checkbox/radio complet — etait copie 3x. `inline` : élément en ligne (radio-inline, #684) */
  private _renderToggleItem(
    group: FacetGroup,
    fv: FacetValue,
    inputId: string,
    kind: 'checkbox' | 'radio',
    radioName?: string,
    inline = false
  ) {
    const isChecked = (this._activeSelections[group.field] ?? new Set()).has(fv.value);
    return html`
      <div class="fr-fieldset__element${inline ? ' fr-fieldset__element--inline' : ''}">
        <div class="fr-${kind}-group fr-${kind}-group--sm">
          <input
            type="${kind}"
            id="${inputId}"
            name="${radioName ?? nothing}"
            .checked="${isChecked}"
            @change="${() => this._toggleValue(group.field, fv.value)}"
          />
          <label class="fr-label" for="${inputId}"> ${this._renderValueLabel(fv)} </label>
        </div>
      </div>
    `;
  }

  _buildFacetGroups() {
    const fields = this._getFields();
    const labelMap = this._parseLabels();

    this._facetGroups = this._appendOrphanSelections(
      fields
        .map((field) => {
          const values = this._computeFacetValues(field);
          return {
            field,
            label: labelMap.get(field) ?? field,
            values,
          };
        })
        .filter((group) => {
          if (this.hideEmpty && group.values.length <= 1) return false;
          return group.values.length > 0;
        })
    );
    this._syncContextFilters();
  }

  /**
   * Build facet groups from static-values attribute (pre-computed values).
   * Values are displayed without counts (count=0, hidden via hideCounts).
   */
  _buildStaticFacetGroups() {
    if (!this.staticValues) return;
    try {
      const parsed = JSON.parse(this.staticValues) as Record<string, string[]>;
      const labelMap = this._parseLabels();
      const fields = this.fields ? _parseCSV(this.fields) : Object.keys(parsed);

      this._facetGroups = fields
        .filter((field) => parsed[field] && parsed[field].length > 0)
        .map((field) => ({
          field,
          label: labelMap.get(field) ?? field,
          values: parsed[field].map((v) => ({ value: v, count: 0 })),
        }))
        .filter((group) => !(this.hideEmpty && group.values.length <= 1));
      this._syncContextFilters();
    } catch {
      console.warn('dsfr-data-facets: static-values invalide (JSON attendu)');
    }
  }

  /**
   * Build facet WHERE clause, delegating to the upstream source's adapter.
   * Falls back to colon syntax if no adapter is available.
   */
  _buildFacetWhere(excludeField?: string): string {
    const rawEl = document.getElementById(this.source);
    const adapter: ApiAdapter | undefined =
      (rawEl as unknown as SourceElement)?.getAdapter?.() ?? undefined;
    if (adapter?.buildFacetWhere) {
      // Champs date connus par la decouverte (#676) : une annee devient un intervalle
      return adapter.buildFacetWhere(this._activeSelections, excludeField, {
        dateFields: this._dateFacetFields(),
      });
    }
    // Fallback: colon syntax (for client-side mode without adapter)
    const parts: string[] = [];
    for (const [field, values] of Object.entries(this._activeSelections)) {
      if (field === excludeField || values.size === 0) continue;
      if (values.size === 1) {
        parts.push(`${field}:eq:${[...values][0]}`);
      } else {
        parts.push(`${field}:in:${[...values].join('|')}`);
      }
    }
    return parts.join(', ');
  }

  /**
   * Walk upstream through the source chain to find the actual dsfr-data-source élément
   * (the one with baseUrl/datasetId/headers). Intermediate components like dsfr-data-query
   * have a `source` property pointing to their upstream.
   */
  private _findUpstreamSource(): HTMLElement | null {
    let el: HTMLElement | null = document.getElementById(this.source);
    // Walk up while the element is an intermediary (has source but no datasetId)
    const maxDepth = 5; // safety limit
    for (let i = 0; i < maxDepth && el; i++) {
      if ('datasetId' in el || 'baseUrl' in el) return el;
      const upstream = (el as unknown as SourceElement).source;
      if (!upstream || typeof upstream !== 'string') break;
      el = document.getElementById(upstream);
    }
    return el;
  }

  /** Resolve a possibly dotted field path on a row (e.g. "fields.Region") */
  private _resolveValue(row: Record<string, unknown>, field: string): unknown {
    if (!field.includes('.')) return row[field];
    const parts = field.split('.');
    let current: unknown = row;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object')
        return undefined;
      if (isUnsafeKey(part)) return undefined;
      // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  /**
   * Valeurs de facette d'une cellule (#421) : une cellule tableau (champ
   * multi-valeurs, ex. ChoiceList Grist) fournit chaque élément ; une cellule
   * scalaire fournit sa valeur. Les éléments vides sont ignorés. L'ancien
   * `String(val)` stringifiait le tableau (« a,b ») : la valeur ne matchait
   * jamais une selection et polluait les groupes de facettes.
   */
  private _facetValuesOf(val: unknown): string[] {
    if (val === null || val === undefined || val === '') return [];
    if (Array.isArray(val)) {
      return val.filter((v) => v !== null && v !== undefined && v !== '').map((v) => String(v));
    }
    return [String(val)];
  }

  /** La cellule matche-t-elle la selection ? Intersection pour les tableaux (#421). */
  private _matchesSelection(val: unknown, selected: Set<string>): boolean {
    return this._facetValuesOf(val).some((v) => selected.has(v));
  }

  /** Get fields to use as facets — explicit or auto-detected */
  private _getFields(): string[] {
    if (this.fields) {
      return _parseCSV(this.fields);
    }
    return this._autoDetectFields();
  }

  /** Auto-detect categorical fields: string type, 2-50 unique values, not all unique (ID-like) */
  _autoDetectFields(): string[] {
    if (this._rawData.length === 0) return [];

    const candidates: string[] = [];
    const sampleRow = this._rawData[0];

    for (const key of Object.keys(sampleRow)) {
      const uniqueValues = new Set<string>();
      let allStrings = true;

      for (const row of this._rawData) {
        const val = row[key];
        if (val === null || val === undefined || val === '') continue;
        // Champ multi-valeurs (tableau de chaines, ex. ChoiceList Grist) :
        // chaque element est une valeur de facette candidate (#421)
        const cellValues = Array.isArray(val) ? val : [val];
        if (cellValues.some((v) => typeof v !== 'string')) {
          allStrings = false;
          break;
        }
        for (const v of cellValues) uniqueValues.add(v as string);
        if (uniqueValues.size > 50) break;
      }

      if (!allStrings) continue;
      if (uniqueValues.size <= 1 || uniqueValues.size > 50) continue;
      // Exclude ID-like fields (all values unique)
      if (uniqueValues.size === this._rawData.length) continue;

      candidates.push(key);
    }

    return candidates;
  }

  /** `weight-field` absent des données : signale une fois par champ (#739) */
  private _weightFieldMissingWarned = new Set<string>();

  /**
   * Poids d'une ligne : 1 par défaut, la valeur de `weight-field` sinon
   * (#739). Une cellule non numérique pese zero — la somme reste lisible,
   * et un champ entierement absent est signale en console.
   */
  private _rowWeight(row: Record<string, unknown>, weightField: string): number {
    if (!weightField) return 1;
    const parsed = toNumber(this._resolveValue(row, weightField), true);
    return parsed ?? 0;
  }

  /** Compute facet values with counts, applying cross-facet filtering for dynamic counts */
  _computeFacetValues(field: string): FacetValue[] {
    // For dynamic counts: filter data by all OTHER active facets (not this one)
    const dataForCounting = this._getDataFilteredExcluding(field);
    // Somme d'une mesure au lieu d'un nombre de lignes (#739)
    const weightField = this._weightUnsupported ? '' : this._weightField;
    let weighted = 0;

    const counts = new Map<string, number>();
    for (const row of dataForCounting) {
      const weight = this._rowWeight(row, weightField);
      if (weight !== 0) weighted++;
      // Cellule tableau : chaque element compte dans son groupe (#421)
      for (const strVal of this._facetValuesOf(this._resolveValue(row, field))) {
        counts.set(strVal, (counts.get(strVal) ?? 0) + weight);
      }
    }

    if (
      weightField &&
      weighted === 0 &&
      dataForCounting.length > 0 &&
      !this._weightFieldMissingWarned.has(weightField)
    ) {
      this._weightFieldMissingWarned.add(weightField);
      const who = this.id ? `dsfr-data-facets[${this.id}]` : 'dsfr-data-facets';
      console.warn(
        `${who} : weight-field="${weightField}" ne trouve aucune valeur numérique dans les ` +
          `données — tous les compteurs valent zero. Verifier le nom du champ et son type.`
      );
    }

    const values: FacetValue[] = [];
    for (const [value, count] of counts) {
      // Les sommes flottantes accumulent des artefacts (0.1 + 0.2) : arrondi
      // a 6 decimales, largement au-dela de ce qu'un compteur affiche
      values.push({ value: value, count: weightField ? Math.round(count * 1e6) / 1e6 : count });
    }

    return this._sortValues(values, field);
  }

  /** Filter data by all active selections EXCEPT the given field */
  private _getDataFilteredExcluding(excludeField: string): Record<string, unknown>[] {
    const activeFields = Object.keys(this._activeSelections).filter(
      (f) => f !== excludeField && this._activeSelections[f].size > 0
    );

    if (activeFields.length === 0) return this._rawData;

    return this._rawData.filter((row) => {
      return activeFields.every((field) => {
        const selected = this._activeSelections[field];
        // Intersection pour les cellules tableau (#421)
        return this._matchesSelection(this._resolveValue(row, field), selected);
      });
    });
  }

  /** Formes de `sort` déjà signalees comme depreciees (un warn par forme et par instance, #645) */
  private _deprecatedSortWarned = new Set<string>();

  /**
   * Resout un critère de tri isole (`count`, `alpha`, `count:asc`…) en
   * (critère, sens) — grammaire `critere:sens` de `order-by` (#645). Les
   * formes `-count` / `-alpha` restent acceptees avec leur sens historique
   * mais sont signalees : le tiret y voulait dire « inverse du défaut »
   * (croissant pour count, decroissant pour alpha), une convention ambigue
   * qu'aucune forme explicite ne partage.
   */
  private _resolveSortCriterion(raw: string): FacetSort {
    if (raw === '-count' || raw === '-alpha') {
      const by = raw === '-count' ? 'count' : 'alpha';
      const dir = by === 'count' ? 'asc' : 'desc';
      if (!this._deprecatedSortWarned.has(raw)) {
        this._deprecatedSortWarned.add(raw);
        console.warn(
          `dsfr-data-facets: sort="${raw}" est deprecie — le tiret signifie « inverse du defaut » ` +
            `(${by === 'count' ? 'du plus rare au plus fréquent' : 'Z vers A'}), une convention ambigue. ` +
            `Utiliser sort="${by}:${dir}" (grammaire de order-by : count:desc, count:asc, alpha:asc, alpha:desc).`
        );
      }
      return { by, dir };
    }
    const [byPart, dirPart] = raw.split(':');
    const by = byPart.trim() === 'alpha' ? 'alpha' : 'count';
    const defaultDir = by === 'count' ? 'desc' : 'asc';
    const trimmedDir = (dirPart ?? '').trim();
    const dir = trimmedDir === 'asc' || trimmedDir === 'desc' ? trimmedDir : defaultDir;
    return { by, dir };
  }

  /**
   * Decoupe l'attribut `sort` en un tri par défaut et un tri par champ
   * (#741). Une entrée est « par champ » des qu'elle porte trois segments
   * (`annee:alpha:asc`) ou qu'elle en porte deux dont le premier n'est pas
   * un critère (`annee:alpha`) : la forme globale historique (`count`,
   * `alpha:desc`, `-count`) ne peut jamais prendre ces formes. Le champ `*`
   * pose le tri par défaut des champs non nommes.
   */
  _parseSort(): { fallback: FacetSort; byField: Map<string, FacetSort> } {
    const byField = new Map<string, FacetSort>();
    const raw = (this.sort || '').trim();
    if (!raw) return { fallback: DEFAULT_FACET_SORT, byField };
    this._warnSeparatorIfSuspect('sort', raw);

    let fallback: FacetSort = DEFAULT_FACET_SORT;
    for (const entry of raw.split('|')) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const segments = trimmed.split(':').map((s) => s.trim());
      const perField =
        segments.length >= 3 || (segments.length === 2 && !FACET_SORT_CRITERIA.has(segments[0]));
      if (!perField) {
        fallback = this._resolveSortCriterion(trimmed);
        continue;
      }
      const field = segments[0];
      if (!field) continue;
      const criterion = this._resolveSortCriterion(segments.slice(1).join(':'));
      if (field === '*') fallback = criterion;
      else byField.set(field, criterion);
    }
    return { fallback, byField };
  }

  /**
   * Tri effectif d'un champ : son entrée nommee, sinon le tri par défaut de
   * l'attribut (#741). Sans champ, seul le tri par défaut s'applique.
   */
  private _resolveSort(field?: string): FacetSort {
    const { fallback, byField } = this._parseSort();
    if (field !== undefined) {
      const own = byField.get(field);
      if (own) return own;
    }
    return fallback;
  }

  _sortValues(values: FacetValue[], field?: string): FacetValue[] {
    const { by, dir } = this._resolveSort(field);
    const sign = dir === 'asc' ? 1 : -1;
    const sorted = [...values];
    if (by === 'alpha') {
      sorted.sort((a, b) => sign * a.value.localeCompare(b.value, 'fr'));
    } else {
      sorted.sort((a, b) => sign * (a.count - b.count));
    }
    return sorted;
  }

  // --- Server-facets ---

  /** Check if there are any active selections */
  private _hasActiveSelections(): boolean {
    return Object.keys(this._activeSelections).some((f) => this._activeSelections[f].size > 0);
  }

  /** Uid d'instance pour les ids DOM (#311 — deux facets sans id explicite
   * ou aux memes champs produisaient des ids en collision) */
  private readonly _instanceUid = `dsfr-facets-${++facetsInstanceSeq}`;

  /** AbortController du cycle de fetch de facettes en cours (#309) */
  private _facetsAbort: AbortController | null = null;

  /** Jeton de generation des fetch de facettes (#309) */
  private _facetsGeneration = 0;

  /** Erreur du dernier fetch de facettes (rendue, plus avalee — #309) */
  private _facetsError: string | null = null;

  // --- Decouverte des facettes declarees (#680) ---

  /** Facettes decouvertes aupres du provider ; null tant que la decouverte n'a pas abouti */
  private _discoveredFacets: FacetDescriptor[] | null = null;

  /** Cle (baseUrl + datasetId) de la decouverte memorisee : un autre jeu l'invalide */
  private _discoveryKey = '';

  /** Decouverte en vol, partagee entre deux cycles de fetch concurrents */
  private _discoveryPromise: Promise<FacetDescriptor[]> | null = null;

  /** « Aucune facette déclarée » déjà signale pour ce jeu (un warn, pas un par cycle) */
  private _discoveryEmptyWarned = false;

  /**
   * Un appel de decouverte par jeu de données : noms et libellés des facettes
   * declarees (utilisés quand `fields` est absent) et champs de type date —
   * utiles meme avec `fields` explicite, car le where d'une annee doit être
   * un intervalle (#676). Une decouverte en echec est memorisee vide (pas de
   * nouvelle tentative a chaque cycle) jusqu'a un changement de jeu.
   */
  private _discoverServerFacets(
    adapter: ApiAdapter,
    params: Pick<AdapterParams, 'baseUrl' | 'datasetId' | 'headers' | 'proxyUrl'>
  ): Promise<FacetDescriptor[]> {
    if (!adapter.discoverFacets) return Promise.resolve([]);
    const key = `${params.baseUrl}|${params.datasetId}`;
    if (this._discoveryKey === key) {
      if (this._discoveredFacets) return Promise.resolve(this._discoveredFacets);
      if (this._discoveryPromise) return this._discoveryPromise;
    }
    this._discoveryKey = key;
    this._discoveredFacets = null;
    this._discoveryEmptyWarned = false;
    const promise = adapter
      .discoverFacets(params)
      .catch((e: unknown) => {
        logFetchWarning(`dsfr-data-facets[${this.id}]: découverte des facettes en échec`, e);
        return [] as FacetDescriptor[];
      })
      .then((descriptors) => {
        if (this._discoveryKey === key) {
          this._discoveredFacets = descriptors;
          this._discoveryPromise = null;
        }
        return descriptors;
      });
    this._discoveryPromise = promise;
    return promise;
  }

  /** Champs date connus par la decouverte (#676) ; undefined avant decouverte ou sans date */
  private _dateFacetFields(): ReadonlySet<string> | undefined {
    if (!this._discoveredFacets) return undefined;
    const dates = this._discoveredFacets.filter((d) => d.isDate).map((d) => d.field);
    return dates.length > 0 ? new Set(dates) : undefined;
  }

  /** Une selection active porte-t-elle une annee sur un champ date decouvert ? */
  private _hasDateYearSelection(): boolean {
    const dateFields = this._dateFacetFields();
    if (!dateFields) return false;
    return Object.entries(this._activeSelections).some(
      ([field, values]) => dateFields.has(field) && [...values].some((v) => /^\d{4}$/.test(v))
    );
  }

  /** Libellé déclaré par le provider pour un champ decouvert (a défaut de `labels`) */
  private _discoveredLabel(field: string): string | undefined {
    return this._discoveredFacets?.find((d) => d.field === field)?.label;
  }

  /** L'adapter amont supporte-t-il les facettes serveur ? (#313) */
  private _serverFacetsSupported(): boolean {
    const sourceEl = document.getElementById(this.source);
    const adapter: ApiAdapter | undefined =
      (sourceEl as unknown as SourceElement)?.getAdapter?.() ?? undefined;
    return !!(adapter?.capabilities.serverFacets && adapter.fetchFacets);
  }

  /**
   * Paramètres serveur (baseUrl, datasetId, headers, proxy) de la source
   * amont. Resolus par la source elle-meme (headers effectifs avec
   * api-key-ref) via la délégation SourceElement — re-parser les attributs
   * DOM ratait la resolution d'api-key-ref → 401 sur sources authentifiees
   * (#274). Null sans datasetId.
   */
  private _resolveServerParams(
    sourceEl: HTMLElement
  ): Pick<AdapterParams, 'baseUrl' | 'datasetId' | 'headers' | 'proxyUrl'> | null {
    const resolvedParams = (sourceEl as unknown as SourceElement).getAdapterParams?.() ?? null;

    let baseUrl: string;
    let datasetId: string;
    let headers: Record<string, string> | undefined;
    let proxyUrl: string | undefined;

    if (resolvedParams) {
      baseUrl = resolvedParams.baseUrl || '';
      datasetId = resolvedParams.datasetId || '';
      headers = resolvedParams.headers;
      proxyUrl = resolvedParams.proxyUrl;
    } else {
      // Fallback legacy : remonter le pipeline et lire les attributs DOM
      // (sources tierces n'implementant pas getAdapterParams)
      const actualSourceEl = this._findUpstreamSource() || sourceEl;
      baseUrl = actualSourceEl.getAttribute('base-url') || '';
      datasetId = actualSourceEl.getAttribute('dataset-id') || '';
      const headersAttr = actualSourceEl.getAttribute('headers') || '';
      if (headersAttr) {
        try {
          headers = JSON.parse(headersAttr);
        } catch {
          /* ignore */
        }
      }
    }

    if (!datasetId) return null;
    return { baseUrl, datasetId, headers, proxyUrl };
  }

  /** Une selection active porte-t-elle une valeur en forme d'annee (avant toute decouverte) ? */
  private _hasYearShapedSelection(): boolean {
    return Object.values(this._activeSelections).some((values) =>
      [...values].some((v) => /^\d{4}$/.test(v))
    );
  }

  /**
   * Erreur amont en mode serveur AVANT toute decouverte (#676) : une
   * selection annuelle issue de l'URL a pu être emise en egalite sur un
   * champ date (400) — la source n'emet alors aucune donnee, donc le cycle
   * de facettes (et sa decouverte) n'aurait jamais lieu. On lance la
   * decouverte ici et, si un champ date est concerne, on re-emet la
   * commande en intervalle. Une seule tentative par jeu (decouverte memorisee).
   */
  public emitTransformerError(error: Error): void {
    super.emitTransformerError(error);
    if (!this.serverFacets || this._discoveredFacets !== null || this._discoveryPromise) return;
    if (!this._hasYearShapedSelection()) return;
    const sourceEl = document.getElementById(this.source);
    const adapter: ApiAdapter | undefined =
      (sourceEl as unknown as SourceElement | null)?.getAdapter?.() ?? undefined;
    if (!sourceEl || !adapter?.discoverFacets) return;
    const serverParams = this._resolveServerParams(sourceEl);
    if (!serverParams) return;
    void this._discoverServerFacets(adapter, serverParams).then(() => {
      if (this.isConnected && this._hasDateYearSelection()) this._dispatchFacetCommand();
    });
  }

  /** Fetch facet values from server API with cross-facet counts */
  private async _fetchServerFacets() {
    const sourceEl = document.getElementById(this.source);
    if (!sourceEl) return;

    // Get adapter from the source element (dsfr-data-query delegates to dsfr-data-source)
    const adapter: ApiAdapter | undefined =
      (sourceEl as unknown as SourceElement).getAdapter?.() ?? undefined;
    if (!adapter?.capabilities.serverFacets || !adapter.fetchFacets) {
      // Adapter does not support server facets — fallback to client-side
      this._buildFacetGroups();
      this._applyFilters();
      return;
    }

    const serverParams = this._resolveServerParams(sourceEl);
    if (!serverParams) return;
    const { baseUrl, datasetId, headers, proxyUrl } = serverParams;

    // Decouverte des facettes declarees (#680) : un appel par jeu, memorise.
    // Sans `fields`, ses noms deviennent les champs ; avec `fields`, elle ne
    // sert qu'a typer les champs date (#676).
    let fields = _parseCSV(this.fields);
    if (adapter.discoverFacets) {
      const knewDateFields = this._dateFacetFields() !== undefined;
      const discovered = await this._discoverServerFacets(adapter, serverParams);
      if (fields.length === 0) fields = discovered.map((d) => d.field);
      // Une selection (URL) emise AVANT la decouverte sur un champ date etait
      // en egalite (400) : la re-emettre en intervalle, le type etant connu
      if (!knewDateFields && this._hasDateYearSelection()) {
        this._dispatchFacetCommand();
      }
    }
    if (fields.length === 0) {
      if (!this.fields && !this._discoveryEmptyWarned) {
        this._discoveryEmptyWarned = true;
        console.warn(
          `dsfr-data-facets[${this.id}]: aucune facette déclarée par le jeu de données — ` +
            `renseigner l'attribut fields`
        );
      }
      return;
    }

    const labelMap = this._parseLabels();

    // Cross-facet: group fields by their effective where clause
    // Fields sharing the same where can be fetched in a single API call
    const whereToFields = new Map<string, string[]>();
    // baseWhere est invariant : il etait recalcule a chaque iteration (#313).
    // En mode context, la source (si elle est aussi une cible du contexte)
    // porte deja nos filtres sous un whereKey PAR champ : les exclure tous,
    // sinon chaque facette ne proposerait plus que sa propre selection (#678)
    const ownKeys = this._context
      ? [this.id, ...[...this._contextFilters.values()].map((c) => c.whereKey)]
      : this.id;
    const baseWhere = (sourceEl as unknown as SourceElement).getEffectiveWhere?.(ownKeys) || '';
    for (const field of fields) {
      const otherFacetWhere = this._buildFacetWhere(field);
      // Jointure selon le dialecte du provider : ' AND ' en ODSQL, ', ' en
      // colon — joindre du colon par AND produisait des clauses croisees
      // invalides sur Grist/Tabular (#271)
      const effectiveWhere = joinWhere(adapter.capabilities.whereFormat, [
        baseWhere,
        otherFacetWhere,
      ]);
      if (!whereToFields.has(effectiveWhere)) whereToFields.set(effectiveWhere, []);
      whereToFields.get(effectiveWhere)!.push(field);
    }

    // Deux interactions rapides = deux series de fetch concurrentes : la
    // reponse la plus lente (potentiellement l'ancienne) ecrasait
    // _facetGroups (#309). Abort du cycle precedent + jeton de generation.
    this._facetsAbort?.abort();
    const abort = new AbortController();
    this._facetsAbort = abort;
    const generation = ++this._facetsGeneration;

    // Fetch each group via adapter
    const allGroups: FacetGroup[] = [];
    let fetchError: string | null = null;
    for (const [where, groupFields] of whereToFields) {
      try {
        const results = await adapter.fetchFacets(
          { baseUrl, datasetId, headers, proxyUrl },
          groupFields,
          where,
          abort.signal
        );
        for (const result of results) {
          allGroups.push({
            field: result.field,
            label:
              labelMap.get(result.field) ?? this._discoveredLabel(result.field) ?? result.field,
            values: this._sortValues(result.values, result.field),
          });
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        // Erreur visible (plus avalee en silence, #309)
        fetchError = (e as Error).message || 'Erreur de chargement des facettes';
        // `fetchFacets` construit son URL en interne : le diagnostic CORS
        // (#598) est joint sans URL, le reste du conseil reste valable.
        logFetchWarning(`dsfr-data-facets[${this.id}]: fetch des facettes en échec`, e);
      }
    }

    // Une reponse perimee ne doit pas ecraser l'etat du dernier cycle
    if (generation !== this._facetsGeneration) return;

    this._facetsError = fetchError;

    // Order groups to match the fields attribute order
    this._facetGroups = this._appendOrphanSelections(
      fields
        .map((f) => allGroups.find((g) => g.field === f))
        .filter((g): g is FacetGroup => !!g)
        .filter((g) => !(this.hideEmpty && g.values.length <= 1))
    );
    this._syncContextFilters();
    this.requestUpdate();
  }

  /**
   * Dispatch facet where command to upstream dsfr-data-query.
   * Jamais en mode `context` (#678) : c'est le contexte qui diffuse.
   */
  private _dispatchFacetCommand() {
    if (this._contextMode) return;
    const facetWhere = this._buildFacetWhere();
    dispatchSourceCommand(this.source, { where: facetWhere, whereKey: this.id, origin: this.id });
  }

  // --- Mode context (#678, ADR-104) ---

  /**
   * Resout le contexte vise par `context="id"` et y enregistre un filtre par
   * champ connu. Le contexte peut arriver plus tard (déclaré après dans la
   * page) : l'erreur de config est posee en attendant et levee a sa connexion.
   */
  private _bindContext(): void {
    if (!this.isConnected || !this._contextMode) return;
    const context = findContextById(this.context);
    if (context === this._context) {
      if (context) this._syncContextFilters();
      return;
    }
    this._unbindContext();
    if (!context) {
      reportConfigError(
        this,
        'dsfr-data-facets',
        `dsfr-data-context introuvable : "${this.context}"`
      );
      return;
    }
    clearConfigError(this);
    this._context = context;
    this._syncContextFilters();

    // Pre-selection depuis l'URL du contexte (#231, ADR-031) : les valeurs
    // deviennent des selections de facette, qui repassent par le MEME chemin
    // qu'un clic — jamais injectees directement dans un where. Elles sont
    // conservees apres peuplement (#310 : rendues cochees, « indisponible »
    // si les donnees ne les connaissent pas).
    const selections = { ...this._activeSelections };
    let prefilled = false;
    for (const field of this._contextFilters.keys()) {
      const values = context._urlValuesFor(field);
      if (values && values.length > 0) {
        selections[field] = new Set(values);
        prefilled = true;
      }
    }
    if (prefilled) {
      this._activeSelections = selections;
      this._afterSelectionChange();
    } else {
      this._pushContextFilters();
    }
  }

  /** Libere les filtres aupres du contexte (disconnect, changement de contexte) */
  private _unbindContext(): void {
    if (this._context) {
      for (const { filter } of this._contextFilters.values()) {
        this._context._unregisterFilter(filter);
      }
    }
    this._context = null;
    this._contextFilters.clear();
  }

  /**
   * Un filtre par champ connu (`fields`, groupes construits, selections) :
   * les champs auto-detectes en mode client n'existent qu'après les données.
   * Idempotent — un champ déjà enregistre garde son filtre et son whereKey.
   */
  private _syncContextFilters(): void {
    if (!this._context) return;
    const fields = new Set<string>([
      ..._parseCSV(this.fields),
      ...this._facetGroups.map((g) => g.field),
      ...Object.keys(this._activeSelections),
    ]);
    for (const field of fields) {
      if (this._contextFilters.has(field)) continue;
      const filter = new FacetFieldFilter(this, field);
      const whereKey = this._context._registerFilter(filter);
      this._contextFilters.set(field, { filter, whereKey, pushed: '' });
    }
  }

  /** Confie l'etat courant de chaque champ au contexte, qui diffuse (#678) */
  private _pushContextFilters(): void {
    if (!this._context) return;
    this._syncContextFilters();
    for (const entry of this._contextFilters.values()) {
      const where = entry.filter.buildColonWhere();
      if (where === entry.pushed) continue;
      entry.pushed = where;
      this._context._applyFilter(entry.filter, where);
    }
  }

  // --- Filtering ---

  _applyFilters() {
    const activeFields = Object.keys(this._activeSelections).filter(
      (f) => this._activeSelections[f].size > 0
    );

    let filtered: Record<string, unknown>[];
    if (activeFields.length === 0) {
      filtered = this._rawData;
    } else {
      filtered = this._rawData.filter((row) => {
        return activeFields.every((field) => {
          const selected = this._activeSelections[field];
          // Intersection pour les cellules tableau (#421)
          return this._matchesSelection(this._resolveValue(row, field), selected);
        });
      });
    }

    this.emitTransformedData(filtered);
  }

  // --- Parsing helpers ---

  /**
   * Grammaires déjà signalées, par attribut ET par valeur reçue (#731) :
   * `_parseDisplayModes()` est rappelé à chaque rendu et pour chaque champ,
   * l'avertissement ne doit sortir qu'une fois. Corriger l'attribut puis le
   * casser autrement redonne donc un avertissement, ce qui est le but.
   */
  private _grammarWarned = new Set<string>();

  /**
   * Avertissement UNIQUE sur une grammaire fausse de `display` ou `labels`
   * (#731). Ces deux attributs séparent leurs entrées par une barre verticale
   * là où `split`, `round` et `fields` prennent la virgule : une entrée mal
   * séparée ou un mode inconnu étaient jusqu'ici ignorés sans un mot, et
   * `display="a:select, b:select"` rendait zéro liste déroulante sur une page
   * qui avait l'air juste.
   */
  private _warnGrammar(attr: 'display' | 'labels', raw: string, message: string): void {
    const key = `${attr}=${raw}`;
    if (this._grammarWarned.has(key)) return;
    this._grammarWarned.add(key);
    const who = this.id ? `dsfr-data-facets[${this.id}]` : 'dsfr-data-facets';
    console.warn(`${who} : attribut "${attr}" — ${message} Valeur reçue : "${raw}".`);
  }

  /**
   * Entrées séparées par une virgule alors que l'attribut attend une barre
   * verticale : une seule entrée est lue, le reste part au défaut.
   *
   * `labels` porte des libellés humains, où une virgule est parfaitement
   * légitime (« Département, région ») : on n'y voit un mauvais séparateur
   * qu'à une virgule suivie d'une entrée `champ:` — un libellé qui se termine
   * par une virgule ne déclenche rien. Dans `display`, dont les valeurs sont
   * une liste fermée de modes, toute virgule est suspecte.
   */
  private _warnSeparatorIfSuspect(attr: 'display' | 'labels' | 'sort', raw: string): void {
    // Utilitaire partagé avec dsfr-data-normalize (#772) ; même ensemble que
    // `_warnGrammar` : un seul avertissement par attribut et par valeur.
    warnSuspectSeparator(
      {
        component: 'dsfr-data-facets',
        id: this.id,
        attr,
        raw,
        expected: '|',
        example:
          attr === 'sort' ? '"champ:alpha | champ2:count:desc"' : '"champ:valeur | champ2:valeur2"',
        humanValues: attr === 'labels',
      },
      this._grammarWarned
    );
  }

  _parseLabels(): Map<string, string> {
    const map = new Map<string, string>();
    if (!this.labels) return map;

    this._warnSeparatorIfSuspect('labels', this.labels);

    const pairs = this.labels.split('|');
    for (const pair of pairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex === -1) continue;
      const key = pair.substring(0, colonIndex).trim();
      const value = pair.substring(colonIndex + 1).trim();
      if (key) {
        map.set(key, value);
      }
    }
    return map;
  }

  /** Parse display attribute into per-field mode map */
  _parseDisplayModes(): Map<string, FacetDisplayMode> {
    const map = new Map<string, FacetDisplayMode>();
    if (!this.display) return map;

    this._warnSeparatorIfSuspect('display', this.display);

    const pairs = this.display.split('|');
    for (const pair of pairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex === -1) continue;
      const key = pair.substring(0, colonIndex).trim();
      const value = pair.substring(colonIndex + 1).trim();
      if (key && FACET_DISPLAY_MODES.has(value)) {
        map.set(key, value as FacetDisplayMode);
      } else if (key) {
        this._warnGrammar(
          'display',
          this.display,
          `mode d'affichage inconnu pour le champ "${key}" : "${value}". Modes acceptés : ` +
            `${[...FACET_DISPLAY_MODES].join(', ')}. Le champ reste en "checkbox".`
        );
      }
    }
    return map;
  }

  /** Get the display mode for a specific field */
  _getDisplayMode(field: string): FacetDisplayMode {
    return this._parseDisplayModes().get(field) ?? 'checkbox';
  }

  /** Parse cols attribute: returns global col size or per-field map */
  _parseCols(): { global: number } | { map: Map<string, number>; fallback: number } | null {
    return this._parseWidths(this.cols);
  }

  /** Grammaire commune de `cols` et `span` : global ou carte par champ. */
  private _parseWidths(
    raw: string
  ): { global: number } | { map: Map<string, number>; fallback: number } | null {
    if (!raw) return null;
    const trimmed = String(raw).trim();
    // Single number = global
    if (/^\d+$/.test(trimmed)) {
      return { global: parseInt(trimmed, 10) };
    }
    // Per-field: "field:4 | field2:6"
    const map = new Map<string, number>();
    const pairs = trimmed.split('|');
    for (const pair of pairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex === -1) continue;
      const key = pair.substring(0, colonIndex).trim();
      const val = parseInt(pair.substring(colonIndex + 1).trim(), 10);
      if (key && !isNaN(val)) {
        map.set(key, val);
      }
    }
    return map.size > 0 ? { map, fallback: 6 } : null;
  }

  /**
   * Classe de colonne DSFR d'un champ. Pleine largeur sous 768 px, largeur
   * demandée au point de rupture `md` (#788) — comme `dsfr-data-display`.
   * `.fr-col-N` est définie HORS de toute media query dans le DSFR : la
   * classe nue valait 25 % à 320 px comme à 1440 px, soit 76 px par facette
   * sur téléphone (mesuré dans Chromium, DSFR 1.14.4).
   */
  _getColClass(field: string): string {
    const width = this._widthFor(field);
    if (width === null) return '';
    return Number(width) >= 12 ? 'fr-col-12' : `fr-col-12 fr-col-md-${width}`;
  }

  /**
   * Largeur sur 12 d'une facette (#790) : `span` (global ou par champ), sinon
   * `per-row`, sinon — si aucun des deux n'est posé — l'ancien `cols`.
   * `null` : grille automatique.
   */
  private _widthFor(field: string): number | null {
    const span = this._parseWidths(this.span);
    const perRow = parsePerRow(this.perRow, 12).value;
    if (span || perRow !== null) {
      if (span && 'global' in span) return span.global;
      const named = span && 'map' in span ? span.map.get(field) : undefined;
      if (named !== undefined) return named;
      if (perRow !== null) return spanForPerRow(perRow);
      return span && 'map' in span ? span.fallback : null;
    }
    const cols = this._parseCols();
    if (!cols) return null;
    return 'global' in cols ? cols.global : (cols.map.get(field) ?? cols.fallback);
  }

  /** `per-row` ou `span` invalides, ou posés avec `cols` (#790). */
  private _syncLayoutError(): void {
    const perRow = parsePerRow(this.perRow, 12);
    const span = this._parseWidths(this.span);
    const widths = span ? ('global' in span ? [span.global] : [...span.map.values()]) : [];
    const badSpan = widths.find((w) => !Number.isInteger(w) || w < 1 || w > 12);
    const modern = perRow.value !== null || span !== null;
    const message =
      perRow.error ??
      (this.span && !span
        ? `span="${this.span}" : attendu une largeur de 1 à 12, ou "champ:4 | champ2:6"`
        : badSpan !== undefined
          ? `span="${this.span}" : largeur ${badSpan} hors de la grille (1 à 12 colonnes)`
          : modern && this.cols
            ? legacyConflictMessage('cols', this.span ? 'span' : 'per-row')
            : null);
    this._layoutError = syncLayoutError(this, 'dsfr-data-facets', message, this._layoutError);
  }

  // --- User interaction ---

  private _toggleValue(field: string, value: string) {
    const selections = { ...this._activeSelections };
    const fieldSet = new Set(selections[field] ?? []);

    const displayMode = this._getDisplayMode(field);
    const disjunctiveFields = _parseCSV(this.disjunctive);
    // select/radio = always exclusive, multiselect = always disjunctive, checkbox = check attribute
    const isDisjunctive =
      displayMode === 'multiselect' ||
      (displayMode === 'checkbox' && disjunctiveFields.includes(field));

    const wasSelected = fieldSet.has(value);
    if (wasSelected) {
      fieldSet.delete(value);
    } else {
      if (!isDisjunctive) {
        fieldSet.clear();
      }
      fieldSet.add(value);
    }

    if (fieldSet.size === 0) {
      delete selections[field];
    } else {
      selections[field] = fieldSet;
    }

    this._activeSelections = selections;
    this._afterSelectionChange();

    // Announce selection change for all interactive modes
    if (
      displayMode === 'multiselect' ||
      displayMode === 'radio' ||
      displayMode === 'radio-inline' ||
      displayMode === 'checkbox'
    ) {
      const action = wasSelected ? 'désélectionnée' : 'sélectionnée';
      this._announce(
        `${value} ${action}, ${fieldSet.size} option${fieldSet.size > 1 ? 's' : ''} sélectionnée${fieldSet.size > 1 ? 's' : ''}`
      );
    }
  }

  private _handleSelectChange(field: string, e: Event) {
    const select = e.target as HTMLSelectElement;
    const value = select.value;
    const selections = { ...this._activeSelections };

    if (!value) {
      delete selections[field];
    } else {
      selections[field] = new Set([value]);
    }

    this._activeSelections = selections;
    this._afterSelectionChange();
  }

  _clearFieldSelections(field: string) {
    const selections = { ...this._activeSelections };
    delete selections[field];
    this._activeSelections = selections;
    this._afterSelectionChange();
    this._announce('Aucune option sélectionnée');
  }

  /** Retire UNE valeur d'un champ (tag de context-tags, #679) — les autres restent */
  _removeFieldValue(field: string, value: string) {
    const current = this._activeSelections[field];
    if (!current?.has(value)) return;
    const fieldSet = new Set(current);
    fieldSet.delete(value);
    const selections = { ...this._activeSelections };
    if (fieldSet.size === 0) {
      delete selections[field];
    } else {
      selections[field] = fieldSet;
    }
    this._activeSelections = selections;
    this._afterSelectionChange();
    this._announce(
      fieldSet.size === 0
        ? 'Aucune option sélectionnée'
        : `${value} désélectionnée, ${fieldSet.size} option${fieldSet.size > 1 ? 's' : ''} sélectionnée${fieldSet.size > 1 ? 's' : ''}`
    );
  }

  private _selectAllValues(field: string) {
    const group = this._facetGroups.find((g) => g.field === field);
    if (!group) return;
    const selections = { ...this._activeSelections };
    selections[field] = new Set(group.values.map((v) => v.value));
    this._activeSelections = selections;
    this._afterSelectionChange();
    this._announce(`${group.values.length} options sélectionnées`);
  }

  private _toggleMultiselectDropdown(field: string) {
    if (this._openMultiselectField === field) {
      this._openMultiselectField = null;
      this._setBackgroundInert(false);
    } else {
      this._openMultiselectField = field;
      this._setBackgroundInert(true);
      this.updateComplete.then(() => {
        const panel = this.querySelector(
          `[data-multiselect="${field}"] .dsfr-data-facets__multiselect-panel`
        );
        const firstFocusable = panel?.querySelector(
          'button, input, select, [tabindex]'
        ) as HTMLElement;
        firstFocusable?.focus();

        // Announce panel context to screen readers
        const group = this._facetGroups.find((g) => g.field === field);
        if (group) {
          const selected = this._activeSelections[field] ?? new Set();
          this._announce(
            `${group.label}, ${group.values.length} options disponibles, ${selected.size} sélectionnée${selected.size > 1 ? 's' : ''}`
          );
        }
      });
    }
  }

  private _announce(message: string) {
    // Clear then set to ensure re-announcement of identical messages
    this._liveAnnouncement = '';
    requestAnimationFrame(() => {
      this._liveAnnouncement = message;
    });
  }

  /**
   * Set or remove the `inert` attribute on background content when a dialog opens/closes.
   * This confines NVDA's virtual cursor to the dialog, preventing it from reading
   * page content behind the panel (complements aria-modal="true").
   */
  private _setBackgroundInert(active: boolean) {
    // this EST le facets — l'ancien closest('dsfr-data-facets') ?? this
    // etait du code mort (#313)
    document.querySelectorAll('body > *').forEach((el) => {
      if (el.contains(this)) return; // skip our own ancestor
      if (active) {
        el.setAttribute('inert', '');
      } else {
        el.removeAttribute('inert');
      }
    });
  }

  private _handleMultiselectKeydown(field: string, e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this._openMultiselectField = null;
      this._setBackgroundInert(false);
      const trigger = this.querySelector(
        `[data-multiselect="${field}"] .dsfr-data-facets__multiselect-trigger`
      ) as HTMLElement;
      trigger?.focus();
      return;
    }

    // Focus trap: Tab wraps within the dialog panel
    if (e.key === 'Tab') {
      const panel = this.querySelector(
        `[data-multiselect="${field}"] .dsfr-data-facets__multiselect-panel`
      );
      if (!panel) return;
      const focusables = [
        ...panel.querySelectorAll<HTMLElement>(
          'button:not([tabindex="-1"]), input, select, [tabindex]:not([tabindex="-1"])'
        ),
      ];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }

    // Arrow key navigation between checkboxes/radios
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      const panel = this.querySelector(
        `[data-multiselect="${field}"] .dsfr-data-facets__multiselect-panel`
      );
      if (!panel) return;
      const inputs = [
        ...panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]'),
      ];
      if (inputs.length === 0) return;

      const currentIndex = inputs.indexOf(e.target as HTMLInputElement);
      if (currentIndex === -1 && e.key !== 'ArrowDown') return;

      e.preventDefault();
      let nextIndex: number;
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, inputs.length - 1);
      } else if (e.key === 'ArrowUp') {
        nextIndex = Math.max(currentIndex - 1, 0);
      } else if (e.key === 'Home') {
        nextIndex = 0;
      } else {
        nextIndex = inputs.length - 1;
      }
      inputs[nextIndex].focus();
    }
  }

  private _handleMultiselectFocusout(field: string, e: FocusEvent) {
    if (this._openMultiselectField !== field) return;
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!relatedTarget) return; // focus leaves document — let _onClickOutsideMultiselect handle it
    const wrapper = this.querySelector(`[data-multiselect="${field}"]`);
    if (wrapper?.contains(relatedTarget)) return; // focus stays inside wrapper
    this._openMultiselectField = null;
    this._setBackgroundInert(false);
  }

  private _onClickOutsideMultiselect = (e: MouseEvent) => {
    if (!this._openMultiselectField) return;
    const target = e.target as HTMLElement;
    const panel = this.querySelector(`[data-multiselect="${this._openMultiselectField}"]`);
    if (panel && !panel.contains(target)) {
      this._openMultiselectField = null;
      this._setBackgroundInert(false);
    }
  };

  private _toggleExpand(field: string) {
    const expanded = new Set(this._expandedFacets);
    if (expanded.has(field)) {
      expanded.delete(field);
    } else {
      expanded.add(field);
    }
    this._expandedFacets = expanded;
  }

  private _searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  private _handleSearch(field: string, e: Event) {
    const input = e.target as HTMLInputElement;
    this._searchQueries = { ...this._searchQueries, [field]: input.value };

    // Debounced announcement of filtered results count
    if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
    this._searchDebounceTimer = setTimeout(() => {
      const group = this._facetGroups.find((g) => g.field === field);
      if (!group) return;
      const query = input.value.toLowerCase();
      const count = query
        ? group.values.filter((v) => v.value.toLowerCase().includes(query)).length
        : group.values.length;
      this._announce(
        count === 0
          ? 'Aucune option trouvee'
          : `${count} option${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}`
      );
    }, 300);
  }

  private _clearAll() {
    this._activeSelections = {};
    this._searchQueries = {};
    this._afterSelectionChange();
  }

  /**
   * Common logic after any selection change — routes to client, server, or
   * static mode. En mode `context` (#678), la diffusion est confiee au
   * contexte ; la facette ne garde que le calcul de ses valeurs : cascade
   * serveur relancee ici (sa `source` n'est pas forcement une cible du
   * contexte, rien ne la refetcherait), filtre local inchange en mode client.
   */
  private _afterSelectionChange() {
    if (this._contextMode) {
      this._pushContextFilters();
      if (this.serverFacets) {
        this._fetchServerFacets();
      } else if (!this.staticValues) {
        this._buildFacetGroups();
        this._applyFilters();
      }
      return;
    }
    if (this.serverFacets || this.staticValues) {
      this._dispatchFacetCommand();
    } else {
      this._buildFacetGroups();
      this._applyFilters();
    }
    if (this._ownUrlSync) this._syncUrl();
  }

  // --- URL params ---

  /** Parse url-param-map attribute into a map of URL param name -> facet field name */
  _parseUrlParamMap(): Map<string, string> {
    const map = new Map<string, string>();
    if (!this.urlParamMap) return map;

    const pairs = this.urlParamMap.split('|');
    for (const pair of pairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex === -1) continue;
      const paramName = pair.substring(0, colonIndex).trim();
      const fieldName = pair.substring(colonIndex + 1).trim();
      if (paramName && fieldName) {
        map.set(paramName, fieldName);
      }
    }
    return map;
  }

  /**
   * Champs dont un paramètre d'URL homonyme devient une sélection (#773) :
   * les facettes EFFECTIVES, calculées AVANT la lecture d'URL — `_applyUrlParams()`
   * passe avant `_buildFacetGroups()`, `_facetGroups` peut donc être vide.
   * `_getFields()` rend les champs de `fields`, sinon ceux que détecterait
   * `_buildFacetGroups()` sur les lignes reçues ; `static-values` ajoute ses
   * clés. Jamais toutes les colonnes des données : `?annee=2023` captait sinon
   * le paramètre d'un contexte voisin.
   */
  private _urlReadableFields(): Set<string> {
    const fields = new Set<string>([
      ...this._getFields(),
      ...this._facetGroups.map((g) => g.field),
    ]);
    if (!this.fields && this.staticValues) {
      try {
        for (const key of Object.keys(JSON.parse(this.staticValues) as object)) fields.add(key);
      } catch {
        // static-values invalide : déjà signalé par _buildStaticFacetGroups
      }
    }
    return fields;
  }

  /** Paramètres que cette facette autonome LIRAIT depuis l'URL (#773). */
  private _urlParamNamesRead(): string[] {
    const paramMap = this._parseUrlParamMap();
    return paramMap.size > 0 ? [...paramMap.keys()] : [...this._urlReadableFields()];
  }

  /** Dernier conflit signalé (un message par situation, pas par rendu). */
  private _urlParamConflict: string | null = null;

  /**
   * Un paramètre lu par cette facette AUTONOME est aussi porté par un
   * `dsfr-data-context` à `url-sync` (#773) : les deux s'écrasent
   * mutuellement. Vue structurelle sur le contexte (`getUrlParamNames`), sans
   * importer son module — même précaution que #681. Vérifié à chaque rendu :
   * les filtres du contexte s'enregistrent en différé.
   */
  private _checkUrlParamConflicts(): void {
    if (!this._ownUrlParams) return;
    const read = new Set(this._urlParamNamesRead());
    const conflicts: string[] = [];
    let contextId = '';
    for (const el of document.querySelectorAll('dsfr-data-context')) {
      const names = (el as unknown as { getUrlParamNames?: () => string[] }).getUrlParamNames?.();
      for (const name of names ?? []) {
        if (read.has(name) && !conflicts.includes(name)) {
          conflicts.push(name);
          contextId ||= el.id;
        }
      }
    }
    if (conflicts.length === 0) {
      if (this._urlParamConflict) {
        this._urlParamConflict = null;
        clearConfigError(this);
      }
      return;
    }
    const message =
      `url-params : ${conflicts.map((c) => `"${c}"`).join(', ')} est aussi porté par ` +
      `dsfr-data-context${contextId ? `#${contextId}` : ''} (url-sync) — les deux lecteurs ` +
      `s'écrasent. Brancher la facette sur le contexte (context="${contextId || 'id'}"), ou ` +
      `borner sa lecture d'URL avec url-param-map.`;
    if (message !== this._urlParamConflict) {
      this._urlParamConflict = message;
      reportConfigError(this, 'dsfr-data-facets', message);
    } else if (!this.hasAttribute('data-dsfr-config-error')) {
      this.setAttribute('data-dsfr-config-error', message);
    }
  }

  /** Read URL search params and apply as facet pré-sélections */
  _applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const paramMap = this._parseUrlParamMap();
    const selections: Record<string, Set<string>> = {};

    // Sans url-param-map, seuls les params correspondant aux champs CONNUS
    // deviennent des selections (#312) : ?utm_source=newsletter filtrait
    // sur un champ inexistant -> 0 resultat inexplicable
    const knownFields = this._urlReadableFields();

    for (const [paramName, paramValue] of params.entries()) {
      // Determine the target field name
      const fieldName =
        paramMap.size > 0
          ? (paramMap.get(paramName) ?? null)
          : knownFields.has(paramName)
            ? paramName
            : null;

      if (!fieldName) continue;

      // Support comma-separated values in a single param: ?region=IDF,PACA
      const values = paramValue
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

      if (!selections[fieldName]) {
        selections[fieldName] = new Set();
      }
      for (const v of values) {
        selections[fieldName].add(v);
      }
    }

    if (Object.keys(selections).length > 0) {
      this._activeSelections = selections;
    }
  }

  /** Sync current facet selections back to URL (replaceState) */
  private _syncUrl() {
    // Partir des params EXISTANTS (#312) : repartir de zero effacait le
    // parametre du dsfr-data-search voisin et tout autre param de la page
    // a chaque clic (search preserve, lui). Construite par l'API URL (#683) :
    // concatener pathname produisait, sur une page servie sous `//chemin`,
    // une URL relative au schema (autre hote) et replaceState levait
    // SecurityError — sync perdue en silence
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const paramMap = this._parseUrlParamMap();
    // Build reverse map: field -> URL param name
    const reverseMap = new Map<string, string>();
    for (const [paramName, fieldName] of paramMap) {
      reverseMap.set(fieldName, paramName);
    }

    // Retirer nos propres params perimes avant de poser les courants
    for (const field of Object.keys(this._activeSelections)) {
      params.delete(reverseMap.get(field) ?? field);
    }
    for (const group of this._facetGroups) {
      params.delete(reverseMap.get(group.field) ?? group.field);
    }

    for (const [field, values] of Object.entries(this._activeSelections)) {
      if (values.size === 0) continue;
      const paramName = reverseMap.get(field) ?? field;
      params.set(paramName, [...values].join(','));
    }

    window.history.replaceState(null, '', url.href);
  }

  // --- Rendering ---

  render() {
    if (this._configError) {
      return html`
        <div class="fr-alert fr-alert--warning fr-alert--sm" role="alert">
          <p>
            <strong>&lt;dsfr-data-facets&gt;</strong> : ${this._configError}. Le composant ne peut
            pas s'initialiser.
          </p>
        </div>
      `;
    }

    const hasActiveFilters = Object.keys(this._activeSelections).some(
      (f) => this._activeSelections[f].size > 0
    );

    // UI jamais entierement disparue quand un filtre est actif (#310) :
    // en mode serveur, _rawData est la page FILTREE — une selection donnant
    // 0 resultat faisait disparaitre les checkboxes ET le bouton
    // Reinitialiser (utilisateur coince)
    if (this._rawData.length === 0 || this._facetGroups.length === 0) {
      if (!hasActiveFilters && !this._facetsError) {
        return nothing;
      }
    }

    const facetsErrorBanner = this._facetsError
      ? html`
          <div class="fr-alert fr-alert--error fr-alert--sm" role="alert">
            <p>Facettes indisponibles : ${this._facetsError}</p>
          </div>
        `
      : nothing;

    // Un compteur faux serait pire qu'un compteur absent (#739) : l'API
    // facettes ne renvoie qu'un nombre de lignes, la somme n'y est pas.
    const weightBanner = this._weightUnsupported
      ? html`
          <div class="fr-alert fr-alert--warning fr-alert--sm" role="alert">
            <p>
              <strong>&lt;dsfr-data-facets&gt;</strong> : weight-field="${this._weightField}" n'est
              pas disponible en mode server-facets — l'API facettes ne renvoie qu'un nombre de
              lignes. Les compteurs sont masques.
            </p>
          </div>
        `
      : nothing;

    const useDsfrGrid = !!(this.cols || this.span || this.perRow);

    return html`
      <style>
        .dsfr-data-facets {
          margin-bottom: 1.5rem;
        }
        .dsfr-data-facets__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .dsfr-data-facets__groups {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 1.5rem;
        }
        .dsfr-data-facets__group {
          min-width: 0;
        }
        .dsfr-data-facets__count {
          font-weight: 400;
          font-size: 0.75rem;
          color: var(--text-mention-grey, #666);
          margin-left: 0.25rem;
        }
        .dsfr-data-facets .fr-radio-group .fr-label,
        .dsfr-data-facets .fr-checkbox-group .fr-label {
          flex-wrap: nowrap;
        }
        .dsfr-data-facets__multiselect {
          position: relative;
        }
        .dsfr-data-facets__multiselect-trigger {
          width: 100%;
          text-align: left;
          cursor: pointer;
          appearance: none;
        }
        .dsfr-data-facets__multiselect-trigger[aria-expanded='true']::after {
          transform: rotate(180deg);
        }
        .dsfr-data-facets__multiselect-panel {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          z-index: 1000;
          background: var(--background-default-grey, #fff);
          border: 1px solid var(--border-default-grey, #ddd);
          border-radius: 0 0 0.25rem 0.25rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          max-height: 320px;
          overflow-y: auto;
          padding: 0.75rem;
        }
        .dsfr-data-facets__multiselect-panel .fr-search-bar {
          margin-bottom: 0.75rem;
        }
        .dsfr-data-facets__dropdown-fieldset {
          margin: 0;
          padding: 0;
          border: none;
        }
        .dsfr-data-facets__dropdown-fieldset .fr-fieldset__element {
          padding: 0;
        }
        .dsfr-data-facets__multiselect-toggle {
          width: 100%;
          margin-bottom: 0.75rem;
        }
        @media (max-width: 576px) {
          .dsfr-data-facets__groups {
            grid-template-columns: 1fr;
          }
        }
      </style>
      <div class="dsfr-data-facets">
        <div aria-live="polite" class="fr-sr-only">${this._liveAnnouncement}</div>
        ${facetsErrorBanner} ${weightBanner}
        ${
          hasActiveFilters && !this.noReset
            ? html`
                <div class="dsfr-data-facets__header">
                  <button
                    class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-btn--icon-left fr-icon-close-circle-line"
                    type="button"
                    @click="${this._clearAll}"
                  >
                    Réinitialiser les filtres
                  </button>
                </div>
              `
            : nothing
        }
        ${
          useDsfrGrid
            ? html`
                <div class="fr-grid-row fr-grid-row--gutters">
                  ${this._facetGroups.map(
                    (group) => html`
                      <div class="${this._getColClass(group.field)}">
                        ${this._renderFacetGroup(group)}
                      </div>
                    `
                  )}
                </div>
              `
            : html`
                <div class="dsfr-data-facets__groups">
                  ${this._facetGroups.map((group) => this._renderFacetGroup(group))}
                </div>
              `
        }
      </div>
    `;
  }

  private _renderFacetGroup(group: FacetGroup) {
    const mode = this._getDisplayMode(group.field);
    switch (mode) {
      case 'select':
        return this._renderSelectGroup(group);
      case 'multiselect':
        return this._renderMultiselectGroup(group);
      case 'radio':
        return this._renderRadioGroup(group);
      case 'radio-inline':
        return this._renderRadioInlineGroup(group);
      default:
        return this._renderCheckboxGroup(group);
    }
  }

  private _renderCheckboxGroup(group: FacetGroup) {
    const searchableFields = _parseCSV(this.searchable);
    const isSearchable = searchableFields.includes(group.field);
    const searchQuery = (this._searchQueries[group.field] ?? '').toLowerCase();
    const isExpanded = this._expandedFacets.has(group.field);

    let displayValues = group.values;
    if (isSearchable && searchQuery) {
      displayValues = displayValues.filter((v) => v.value.toLowerCase().includes(searchQuery));
    }

    const visibleValues = isExpanded ? displayValues : displayValues.slice(0, this.maxValues);
    const hasMore = displayValues.length > this.maxValues;
    const uid = `${this._instanceUid}-${group.field}`;

    return html`
      <fieldset class="fr-fieldset dsfr-data-facets__group" aria-labelledby="${uid}-legend">
        <legend class="fr-fieldset__legend fr-text--bold" id="${uid}-legend">${group.label}</legend>
        ${
          isSearchable
            ? html`
                <div class="fr-fieldset__element">
                  <div class="fr-input-group">
                    <input
                      class="fr-input fr-input--sm"
                      type="search"
                      placeholder="Rechercher..."
                      .value="${this._searchQueries[group.field] ?? ''}"
                      @input="${(e: Event) => this._handleSearch(group.field, e)}"
                      aria-label="Rechercher dans ${group.label}"
                    />
                  </div>
                </div>
              `
            : nothing
        }
        ${visibleValues.map((fv, fvIndex) =>
          this._renderToggleItem(group, fv, `${uid}-${fvIndex}`, 'checkbox')
        )}
        ${
          hasMore
            ? html`
                <div class="fr-fieldset__element">
                  <button
                    class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm"
                    type="button"
                    @click="${() => this._toggleExpand(group.field)}"
                  >
                    ${
                      isExpanded
                        ? 'Voir moins'
                        : `Voir plus (${displayValues.length - this.maxValues})`
                    }
                  </button>
                </div>
              `
            : nothing
        }
      </fieldset>
    `;
  }

  private _renderSelectGroup(group: FacetGroup) {
    const uid = `${this._instanceUid}-${group.field}`;
    const selected = this._activeSelections[group.field];
    const selectedValue = selected ? ([...selected][0] ?? '') : '';

    return html`
      <div class="dsfr-data-facets__group fr-select-group" data-field="${group.field}">
        <label class="fr-label" for="${uid}-select">${group.label}</label>
        <select
          class="fr-select"
          id="${uid}-select"
          @change="${(e: Event) => this._handleSelectChange(group.field, e)}"
        >
          <option value="" ?selected="${!selectedValue}">Tous</option>
          ${group.values.map(
            (fv) => html`
              <option value="${fv.value}" ?selected="${fv.value === selectedValue}">
                ${
                  this._effectiveHideCounts || fv.missing
                    ? `${fv.value}${fv.missing ? ' (indisponible)' : ''}`
                    : `${fv.value} (${this._formatCount(fv.count)})`
                }
              </option>
            `
          )}
        </select>
      </div>
    `;
  }

  private _renderMultiselectGroup(group: FacetGroup) {
    const uid = `${this._instanceUid}-${group.field}`;
    const selected = this._activeSelections[group.field] ?? new Set();
    const isOpen = this._openMultiselectField === group.field;
    const searchQuery = (this._searchQueries[group.field] ?? '').toLowerCase();

    let displayValues = group.values;
    if (searchQuery) {
      displayValues = displayValues.filter((v) => v.value.toLowerCase().includes(searchQuery));
    }

    const triggerLabel =
      selected.size > 0
        ? `${selected.size} option${selected.size > 1 ? 's' : ''} sélectionnée${selected.size > 1 ? 's' : ''}`
        : 'Sélectionnez des options';

    // Selected values description for screen readers
    const selectedDesc = selected.size > 0 ? [...selected].join(', ') : '';

    return html`
      <div
        class="fr-select-group dsfr-data-facets__group dsfr-data-facets__multiselect"
        data-multiselect="${group.field}"
        data-field="${group.field}"
        @keydown="${(e: KeyboardEvent) => this._handleMultiselectKeydown(group.field, e)}"
        @focusout="${(e: FocusEvent) => this._handleMultiselectFocusout(group.field, e)}"
      >
        <label class="fr-label" id="${uid}-legend">${group.label}</label>
        ${
          selectedDesc
            ? html`<span class="fr-sr-only" id="${uid}-desc">${selectedDesc}</span>`
            : nothing
        }
        <button
          class="fr-select dsfr-data-facets__multiselect-trigger"
          type="button"
          aria-expanded="${isOpen}"
          aria-controls="${uid}-panel"
          aria-labelledby="${uid}-legend"
          aria-haspopup="dialog"
          aria-describedby="${selectedDesc ? `${uid}-desc` : nothing}"
          @click="${(e: Event) => {
            e.stopPropagation();
            this._toggleMultiselectDropdown(group.field);
          }}"
        >
          ${triggerLabel}
        </button>
        ${
          isOpen
            ? html`
                <div
                  class="dsfr-data-facets__multiselect-panel"
                  id="${uid}-panel"
                  role="dialog"
                  aria-modal="true"
                  aria-label="${group.label}"
                  @click="${(e: Event) => e.stopPropagation()}"
                >
                  <button
                    class="fr-btn fr-btn--tertiary fr-btn--sm fr-btn--icon-left ${
                      selected.size > 0 ? 'fr-icon-close-circle-line' : 'fr-icon-check-line'
                    } dsfr-data-facets__multiselect-toggle"
                    type="button"
                    aria-label="${
                      selected.size > 0
                        ? `Tout deselectionner pour ${group.label}`
                        : `Tout sélectionner pour ${group.label}`
                    }"
                    @click="${() =>
                      selected.size > 0
                        ? this._clearFieldSelections(group.field)
                        : this._selectAllValues(group.field)}"
                  >
                    ${selected.size > 0 ? 'Tout deselectionner' : 'Tout sélectionner'}
                  </button>
                  ${this._renderPanelSearchBar(group, uid)}
                  <fieldset
                    class="fr-fieldset dsfr-data-facets__dropdown-fieldset"
                    aria-label="${group.label}"
                  >
                    ${displayValues.map((fv, fvIndex) =>
                      this._renderToggleItem(group, fv, `${uid}-${fvIndex}`, 'checkbox')
                    )}
                  </fieldset>
                </div>
              `
            : nothing
        }
      </div>
    `;
  }

  /**
   * Boutons radio DSFR visibles en ligne (#684) : fieldset dont la legende est
   * le libellé de la facette, une option « Tous » (cochee quand rien n'est
   * selectionne) qui retire la selection, puis une radio par valeur. Toutes
   * les valeurs sont rendues (pas de « Voir plus » : un choix unique visible
   * d'un coup d'oeil, comme `select`).
   */
  private _renderRadioInlineGroup(group: FacetGroup) {
    const uid = `${this._instanceUid}-${group.field}`;
    const selected = this._activeSelections[group.field] ?? new Set();
    const hasSelection = selected.size > 0;
    const radioName = `${uid}-radio`;

    return html`
      <fieldset
        class="fr-fieldset dsfr-data-facets__group dsfr-data-facets__radio-inline"
        aria-labelledby="${uid}-legend"
        data-field="${group.field}"
      >
        <legend class="fr-fieldset__legend fr-text--bold" id="${uid}-legend">${group.label}</legend>
        <div class="fr-fieldset__element fr-fieldset__element--inline">
          <div class="fr-radio-group fr-radio-group--sm">
            <input
              type="radio"
              id="${uid}-all"
              name="${radioName}"
              value=""
              .checked="${!hasSelection}"
              @change="${() => this._clearFieldSelections(group.field)}"
            />
            <label class="fr-label" for="${uid}-all">Tous</label>
          </div>
        </div>
        ${group.values.map((fv, fvIndex) =>
          this._renderToggleItem(group, fv, `${uid}-${fvIndex}`, 'radio', radioName, true)
        )}
      </fieldset>
    `;
  }

  private _renderRadioGroup(group: FacetGroup) {
    const uid = `${this._instanceUid}-${group.field}`;
    const selected = this._activeSelections[group.field] ?? new Set();
    const isOpen = this._openMultiselectField === group.field;
    const searchQuery = (this._searchQueries[group.field] ?? '').toLowerCase();

    let displayValues = group.values;
    if (searchQuery) {
      displayValues = displayValues.filter((v) => v.value.toLowerCase().includes(searchQuery));
    }

    const selectedValue = selected.size > 0 ? [...selected][0] : null;
    const triggerLabel = selectedValue ?? 'Sélectionnez une option';

    return html`
      <div
        class="fr-select-group dsfr-data-facets__group dsfr-data-facets__multiselect"
        data-multiselect="${group.field}"
        data-field="${group.field}"
        @keydown="${(e: KeyboardEvent) => this._handleMultiselectKeydown(group.field, e)}"
        @focusout="${(e: FocusEvent) => this._handleMultiselectFocusout(group.field, e)}"
      >
        <label class="fr-label" id="${uid}-legend">${group.label}</label>
        <button
          class="fr-select dsfr-data-facets__multiselect-trigger"
          type="button"
          aria-expanded="${isOpen}"
          aria-controls="${uid}-panel"
          aria-labelledby="${uid}-legend"
          aria-haspopup="dialog"
          @click="${(e: Event) => {
            e.stopPropagation();
            this._toggleMultiselectDropdown(group.field);
          }}"
        >
          ${triggerLabel}
        </button>
        ${
          isOpen
            ? html`
                <div
                  class="dsfr-data-facets__multiselect-panel"
                  id="${uid}-panel"
                  role="dialog"
                  aria-modal="true"
                  aria-label="${group.label}"
                  @click="${(e: Event) => e.stopPropagation()}"
                >
                  ${
                    selectedValue
                      ? html`
                          <button
                            class="fr-btn fr-btn--tertiary fr-btn--sm fr-btn--icon-left fr-icon-close-circle-line dsfr-data-facets__multiselect-toggle"
                            type="button"
                            aria-label="Réinitialiser ${group.label}"
                            @click="${() => this._clearFieldSelections(group.field)}"
                          >
                            Réinitialiser
                          </button>
                        `
                      : nothing
                  }
                  ${this._renderPanelSearchBar(group, uid)}
                  <fieldset
                    class="fr-fieldset dsfr-data-facets__dropdown-fieldset"
                    aria-label="${group.label}"
                  >
                    ${displayValues.map((fv, fvIndex) =>
                      this._renderToggleItem(
                        group,
                        fv,
                        `${uid}-${fvIndex}`,
                        'radio',
                        `${uid}-radio`
                      )
                    )}
                  </fieldset>
                </div>
              `
            : nothing
        }
      </div>
    `;
  }
}

/** Parse a comma-separated string into trimmed non-empty tokens */
export function _parseCSV(value: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-facets': DsfrDataFacets;
  }
}

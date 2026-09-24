import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { dispatchSourceCommand } from '../utils/data-bridge.js';
import { TransformerMixin } from '../utils/transformer-mixin.js';
import type { ApiAdapter, FacetDescriptor } from '../adapters/api-adapter.js';
import type { SourceElement } from '../utils/source-element.js';
import type { ContextFilterLike } from '@dsfr-data/shared/lib';
import { escapeColonValue } from '../utils/where.js';
import { logFetchWarning } from '../utils/fetch-diagnostics.js';
import { warnSuspectSeparator } from '../utils/attr-separators.js';
import {
  parseScale,
  legacyConflictMessage,
  syncLayoutError,
  type Scale,
} from '../utils/grid-layout.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import { ContextBindingMixin } from '../utils/context-binding.js';
import type { ContextHost } from '../utils/context-registry.js';
import { currentUrl, replaceUrl } from '../utils/page-url.js';
import {
  parseCSV,
  type FacetDisplayMode,
  type FacetGroup,
  type FacetSort,
  type FacetValue,
} from './facets/facets-types.js';
import {
  appendOrphanSelections,
  autoDetectFacetFields,
  countFacetValues,
  filterRowsBySelections,
  resolveFacetValue,
} from './facets/facets-client.js';
import { parseSortAttribute, sortFacetValues } from './facets/facets-sort.js';
import { buildStaticFacetGroups, staticValueFields } from './facets/facets-static.js';
import {
  ServerFacetsDiscovery,
  fetchFacetGroups,
  groupFieldsByWhere,
  hasDateYearSelection,
  hasYearShapedSelection,
  resolveServerParams,
  type FacetServerParams,
} from './facets/facets-server.js';
import {
  colClassFor,
  parseDisplayModes,
  parseFacetLabels,
  parseSpanScales,
  parseWidths,
  scaleForField,
  type FacetWidths,
} from './facets/facets-attributes.js';
import {
  findUrlParamConflicts,
  parseUrlParamMap,
  readUrlSelections,
  writeUrlSelections,
} from './facets/facets-url.js';
import {
  NO_LABEL_TABLE,
  NO_VALUE_LABELS,
  collectCompanionLabels,
  facetValueText,
  labelFacetValues,
  parseValueLabels,
  type ValueLabelSpec,
} from './facets/facets-value-labels.js';
import { facetsStyles } from './facets/facets-styles.js';

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

  /** Le tag montre le LIBELLÉ quand `value-labels` en pose un (#928) */
  displayValue(): string {
    return this._values()
      .map((v) => this.host._valueText(this.field, v))
      .join(', ');
  }

  /** Un tag par valeur dans context-tags (#679) */
  displayValues(): string[] {
    return this._values().map((v) => this.host._valueText(this.field, v));
  }

  /** Meme chemin qu'un clic « Tout » : la facette re-pousse son etat au contexte */
  clear(): void {
    this.host._clearFieldSelections(this.field);
  }

  /**
   * Meme chemin qu'une case decochee : les autres valeurs du champ restent
   * (#679). `context-tags` rappelle ici ce que `displayValues()` a rendu :
   * avec `value-labels`, c'est un LIBELLÉ, qu'on retraduit en valeur (#928).
   */
  clearValue(value: string): void {
    this.host._removeFieldValue(this.field, this.host._valueForText(this.field, value));
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
export class DsfrDataFacets extends ContextBindingMixin(TransformerMixin(LitElement)) {
  /** ID de la source de données a ecouter */
  @property({ type: String })
  source = '';

  /**
   * Champs à exposer comme facettes (virgule-séparés). Vide = auto-détection sur les
   * données chargées ; en `server-facets`, vide = découverte des facettes déclarées par le
   * jeu de données (OpenDataSoft : métadonnées du jeu ; Grist : colonnes Choice/ChoiceList, #680)
   * @champ liste
   */
  @property({ type: String })
  fields = '';

  /** Labels custom : "field:Label | field2:Label 2" */
  @property({ type: String })
  labels = '';

  /**
   * Libellé des VALEURS d'une facette (#928) — `labels` nomme les CHAMPS,
   * celui-ci nomme ce qu'ils contiennent. Une facette posée sur un champ de
   * code affiche « Finistère » et continue de filtrer « 29 » : la valeur
   * diffusée au contexte, à l'URL et au `where` reste le CODE.
   *
   * Deux grammaires, distinguées par la première lettre :
   * - champ compagnon, entrées séparées par `|` comme `labels` et `display` :
   *   `value-labels="dep_code:dep_nom | code_fede_ref:federation"`. Le
   *   libellé est lu dans les MÊMES lignes que la valeur ; il doit donc
   *   figurer dans les données reçues (au besoin, l'ajouter au `select`) ;
   * - table figée en JSON, quand aucun champ compagnon n'existe :
   *   `value-labels='{"dep_code":{"29":"Finistère","56":"Morbihan"}}'`.
   *   Une valeur absente de la table reste affichée telle quelle.
   *
   * Le tri `alpha` et la recherche portent alors sur le libellé. En
   * `server-facets`, la réponse de l'API facettes ne porte que des valeurs :
   * les libellés sont lus dans les lignes chargées par la source, donc
   * connus pour les valeurs présentes dans ces lignes ; une valeur de
   * facette absente de la page courante reste affichée par son code. Sur un
   * champ de code, poser une table figée lève ce doute.
   */
  @property({ type: String, attribute: 'value-labels' })
  valueLabels = '';

  /**
   * Valeur pré-sélectionnée par champ, même grammaire que `labels` :
   * `default="region:Toutes régions | secteur:Tous secteurs"` (#932).
   *
   * Sans sélection, une facette n'émet aucun filtre — ce qui est juste quand
   * l'absence de filtre veut dire « tout ». Ça ne l'est plus quand l'agrégat
   * national est une LIGNE du jeu (« Toutes régions ») à côté d'une ligne par
   * région : le total porte alors sur le cumul, sans avertissement. Un champ
   * nommé ici porte donc TOUJOURS une valeur.
   *
   * Ordre de résolution : une valeur lue dans l'URL (`url-params`, ou l'URL
   * du contexte en mode `context`) l'emporte ; le défaut ne s'applique qu'à
   * un champ sans sélection. Conséquences sur un champ à défaut : la remise
   * à zéro (bouton, tag retiré, dernière case décochée) revient au défaut et
   * non à l'absence de filtre, et les options « Tous » de `select` et
   * `radio-inline` ne sont plus rendues — elles ne pourraient que revenir au
   * défaut. Une valeur par défaut absente des données est rendue cochée et
   * « (indisponible) », comme toute sélection orpheline (#310).
   */
  @property({ type: String })
  default = '';

  /** Nb de valeurs visibles par facette avant "Voir plus" */
  @property({ type: Number, attribute: 'max-values' })
  maxValues = 6;

  /**
   * Champs en mode multi-sélection OU (virgule-séparés)
   * @champ liste
   */
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

  /**
   * Champs avec barre de recherche (virgule-séparés)
   * @champ liste
   */
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
   * @champ nom
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

  /**
   * Un filtre de contexte par champ, avec son whereKey et la dernière clause
   * confiee au contexte (mode `context`, #678) — un champ inchange n'est pas
   * re-diffuse : une source cible re-emet après chaque commande
   */
  private _contextFilters = new Map<
    string,
    { filter: FacetFieldFilter; whereKey: string; pushed: string }
  >();

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
    return this.delegateGetAdapter();
  }

  /**
   * Retourne le where effectif de la source amont (délégation transparente).
   */
  public getEffectiveWhere(excludeKey?: string | string[]): string {
    return this.delegateGetEffectiveWhere(excludeKey);
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
  }

  disconnectedCallback() {
    super.disconnectedCallback();
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

  /**
   * `weight-field` en mode `server-facets` : erreur de configuration posee
   * APRES le rendu (#739). La liaison au contexte appelle `clearConfigError()`
   * en cas de succes, et elle tourne dans `willUpdate` : poser le marqueur ici
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
      'valueLabels',
      'default',
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

    // Valeurs par défaut (#932) : APRÈS la lecture d'URL, qui l'emporte. En
    // mode `context`, c'est `onContextBound` qui les pose — l'URL y est
    // portée par le contexte, pas par la facette.
    if (this._hasDefaults() && !this._contextMode && this._applyDefaultSelections()) {
      if (isServerMode) this._dispatchFacetCommand();
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
    // Les libellés de valeur sont lus dans les lignes (#928) : un nouveau lot
    // invalide les tables mémorisées.
    this._labelTables.clear();
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
    // Valeurs par défaut (#932), après l'URL. En mode serveur, la commande
    // rechargera la source : rien d'autre à faire dans ce cycle.
    if (this._hasDefaults() && !this._contextMode && this._applyDefaultSelections()) {
      if (isServerMode) {
        this._dispatchFacetCommand();
        return;
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

  /** Selections orphelines reinjectees (#310) — `facets/facets-client.ts`. */
  private _appendOrphanSelections(groups: FacetGroup[]): FacetGroup[] {
    return this._labelGroups(
      appendOrphanSelections(groups, this._activeSelections, this._parseLabels())
    );
  }

  /**
   * Libellés de valeur posés sur des groupes déjà constitués (#928) : les
   * sélections orphelines réinjectées et les valeurs statiques n'ont pas
   * traversé `_sortValues`. Sans `value-labels`, les groupes reçus sont
   * rendus tels quels.
   */
  private _labelGroups(groups: FacetGroup[]): FacetGroup[] {
    if (!this.valueLabels) return groups;
    for (const group of groups) {
      group.values = this._labelValues(group.values, group.field);
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
    return html`${facetValueText(fv)}${missingHint}${
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
    const groups = buildStaticFacetGroups(
      this.staticValues,
      this.fields,
      this._parseLabels(),
      this.hideEmpty
    );
    if (!groups) {
      console.warn('dsfr-data-facets: static-values invalide (JSON attendu)');
      return;
    }
    this._facetGroups = this._labelGroups(groups);
    this._syncContextFilters();
  }

  /**
   * Build facet WHERE clause, delegating to the upstream source's adapter.
   * Falls back to colon syntax if no adapter is available.
   */
  _buildFacetWhere(excludeField?: string): string {
    const rawEl = document.getElementById(this.source);
    const adapter: ApiAdapter | undefined =
      (rawEl as unknown as SourceElement)?.getAdapter?.() ?? undefined;
    // Champs date connus par la decouverte (#676) : une annee devient un intervalle
    const adapterWhere = adapter?.buildFacetWhere?.(this._activeSelections, excludeField, {
      dateFields: this._dateFacetFields(),
    });
    if (adapterWhere !== undefined) return adapterWhere;
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

  /**
   * Chemin pointe resolu sur une ligne — `facets/facets-client.ts`.
   * Garde son nom : c'est par lui que les tests unitaires eprouvent la
   * resolution de chemin depuis le composant.
   */
  private _resolveValue(row: Record<string, unknown>, field: string): unknown {
    return resolveFacetValue(row, field);
  }

  /** Get fields to use as facets — explicit or auto-detected */
  private _getFields(): string[] {
    if (this.fields) {
      return parseCSV(this.fields);
    }
    return this._autoDetectFields();
  }

  /** Champs categoriels detectes sur les lignes — `facets/facets-client.ts`. */
  _autoDetectFields(): string[] {
    return autoDetectFacetFields(this._rawData);
  }

  /** `weight-field` absent des données : signale une fois par champ (#739) */
  private _weightFieldMissingWarned = new Set<string>();

  /** Compute facet values with counts, applying cross-facet filtering for dynamic counts */
  _computeFacetValues(field: string): FacetValue[] {
    // For dynamic counts: filter data by all OTHER active facets (not this one)
    const dataForCounting = this._getDataFilteredExcluding(field);
    // Somme d'une mesure au lieu d'un nombre de lignes (#739)
    const weightField = this._weightUnsupported ? '' : this._weightField;
    const { values, weightedRows } = countFacetValues(dataForCounting, field, weightField);

    if (
      weightField &&
      weightedRows === 0 &&
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

    return this._sortValues(values, field);
  }

  /** Filter data by all active selections EXCEPT the given field */
  private _getDataFilteredExcluding(excludeField: string): Record<string, unknown>[] {
    return filterRowsBySelections(this._rawData, this._activeSelections, excludeField, (row, f) =>
      this._resolveValue(row, f)
    );
  }

  /** Formes de `sort` déjà signalees comme depreciees (un warn par forme et par instance, #645) */
  private _deprecatedSortWarned = new Set<string>();

  /** Un avertissement de tri par forme fautive et par instance (#645). */
  private _warnSort = (raw: string, message: string): void => {
    if (this._deprecatedSortWarned.has(raw)) return;
    this._deprecatedSortWarned.add(raw);
    console.warn(`dsfr-data-facets: ${message}`);
  };

  /** Tri par défaut et tri par champ (#741) — `facets/facets-sort.ts`. */
  _parseSort(): { fallback: FacetSort; byField: Map<string, FacetSort> } {
    const raw = (this.sort || '').trim();
    if (raw) this._warnSeparatorIfSuspect('sort', raw);
    return parseSortAttribute(raw, this._warnSort);
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

  /**
   * Les libellés de valeur sont posés AVANT le tri (#928) : `alpha` range ce
   * que le lecteur voit, pas le code sous-jacent.
   */
  _sortValues(values: FacetValue[], field?: string): FacetValue[] {
    return sortFacetValues(this._labelValues(values, field), this._resolveSort(field));
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

  /** Decouverte memorisee par jeu de donnees — `facets/facets-server.ts`. */
  private _discovery = new ServerFacetsDiscovery();

  /** Facettes decouvertes aupres du provider ; null tant que la decouverte n'a pas abouti */
  private get _discoveredFacets(): FacetDescriptor[] | null {
    return this._discovery.facets;
  }

  /** Un appel de decouverte par jeu de données (#680, #676). */
  private _discoverServerFacets(
    adapter: ApiAdapter,
    params: FacetServerParams
  ): Promise<FacetDescriptor[]> {
    return this._discovery.discover(adapter, params, (e) =>
      logFetchWarning(`dsfr-data-facets[${this.id}]: découverte des facettes en échec`, e)
    );
  }

  /** Champs date connus par la decouverte (#676) ; undefined avant decouverte ou sans date */
  private _dateFacetFields(): ReadonlySet<string> | undefined {
    return this._discovery.dateFields();
  }

  /** Une selection active porte-t-elle une annee sur un champ date decouvert ? */
  private _hasDateYearSelection(): boolean {
    return hasDateYearSelection(this._activeSelections, this._dateFacetFields());
  }

  /** Libellé déclaré par le provider pour un champ decouvert (a défaut de `labels`) */
  private _discoveredLabel(field: string): string | undefined {
    return this._discovery.labelOf(field);
  }

  /** L'adapter amont supporte-t-il les facettes serveur ? (#313) */
  private _serverFacetsSupported(): boolean {
    const sourceEl = document.getElementById(this.source);
    const adapter: ApiAdapter | undefined =
      (sourceEl as unknown as SourceElement)?.getAdapter?.() ?? undefined;
    return !!(adapter?.capabilities.serverFacets && adapter.fetchFacets);
  }

  /** Paramètres serveur de la source amont (#274) — `facets/facets-server.ts`. */
  private _resolveServerParams(sourceEl: HTMLElement): FacetServerParams | null {
    return resolveServerParams(sourceEl, () => this._findUpstreamSource());
  }

  /** Une selection active porte-t-elle une valeur en forme d'annee (avant toute decouverte) ? */
  private _hasYearShapedSelection(): boolean {
    return hasYearShapedSelection(this._activeSelections);
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
    if (!this.serverFacets || this._discoveredFacets !== null || this._discovery.pending) return;
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

    // Decouverte des facettes declarees (#680) : un appel par jeu, memorise.
    // Sans `fields`, ses noms deviennent les champs ; avec `fields`, elle ne
    // sert qu'a typer les champs date (#676).
    //
    // COUPLAGE — cette resolution reste ECRITE ICI, et non dans une methode
    // `async` a part. Avec `discoverFacets`, l'AbortController est pose APRES
    // l'await de la decouverte, comme avant #838. Sans, tout ce qui precede
    // la pose est synchrone : `await uneMethodeAsync()` ajouterait des
    // microtaches meme a corps synchrone, et changerait l'ENTRELACEMENT de
    // deux cycles concurrents — l'ordre abort / jeton de generation que #309
    // garantit, et que `facets-fetch-hardening` eprouve, ne serait plus le meme.
    let fields = parseCSV(this.fields);
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
      this._warnNoDeclaredFacets();
      return;
    }

    const labelMap = this._parseLabels();

    // Cross-facet: group fields by their effective where clause
    // Fields sharing the same where can be fetched in a single API call.
    // En mode context, la source (si elle est aussi une cible du contexte)
    // porte deja nos filtres sous un whereKey PAR champ : les exclure tous,
    // sinon chaque facette ne proposerait plus que sa propre selection (#678)
    const ownKeys = this._context
      ? [this.id, ...[...this._contextFilters.values()].map((c) => c.whereKey)]
      : this.id;
    const baseWhere = (sourceEl as unknown as SourceElement).getEffectiveWhere?.(ownKeys) || '';
    const whereToFields = groupFieldsByWhere(
      fields,
      baseWhere,
      adapter.capabilities.whereFormat,
      (field) => this._buildFacetWhere(field)
    );

    // Deux interactions rapides = deux series de fetch concurrentes : la
    // reponse la plus lente (potentiellement l'ancienne) ecrasait
    // _facetGroups (#309). Abort du cycle precedent + jeton de generation.
    this._facetsAbort?.abort();
    const abort = new AbortController();
    this._facetsAbort = abort;
    const generation = ++this._facetsGeneration;

    const outcome = await fetchFacetGroups(
      adapter,
      serverParams,
      whereToFields,
      abort.signal,
      (field) => labelMap.get(field) ?? this._discoveredLabel(field) ?? field,
      (values, field) => this._sortValues(values, field),
      (e) => logFetchWarning(`dsfr-data-facets[${this.id}]: fetch des facettes en échec`, e)
    );
    if (outcome.aborted) return;

    // Une reponse perimee ne doit pas ecraser l'etat du dernier cycle
    if (generation !== this._facetsGeneration) return;

    this._facetsError = outcome.error;

    // Order groups to match the fields attribute order
    this._facetGroups = this._appendOrphanSelections(
      fields
        .map((f) => outcome.groups.find((g) => g.field === f))
        .filter((g): g is FacetGroup => !!g)
        .filter((g) => !(this.hideEmpty && g.values.length <= 1))
    );
    this._syncContextFilters();
    this.requestUpdate();
  }

  /** Un jeu sans facette declaree : un avertissement, pas un par cycle (#680). */
  private _warnNoDeclaredFacets(): void {
    if (this.fields || this._discovery.emptyWarned) return;
    this._discovery.emptyWarned = true;
    console.warn(
      `dsfr-data-facets[${this.id}]: aucune facette déclarée par le jeu de données — ` +
        `renseigner l'attribut fields`
    );
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

  /** Le contexte etait deja le notre : les champs apparus depuis prennent leur filtre */
  protected onContextAlreadyBound(): void {
    this._syncContextFilters();
  }

  /**
   * Contexte resolu (#837, tronc dans ContextBindingMixin) : un filtre par
   * champ connu s'y enregistre.
   */
  protected onContextBound(context: ContextHost): void {
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
    // Valeurs par défaut (#932) : APRÈS l'URL du contexte, qui l'emporte.
    let defaulted = false;
    for (const [field, value] of this._parseDefaults()) {
      if (!value || (selections[field]?.size ?? 0) > 0) continue;
      selections[field] = new Set([value]);
      defaulted = true;
    }
    if (prefilled || defaulted) {
      this._activeSelections = selections;
      this._afterSelectionChange();
    } else {
      this._pushContextFilters();
    }
  }

  /** Libere les filtres aupres du contexte (disconnect, changement de contexte) */
  protected onContextUnbound(context: ContextHost | null): void {
    if (context) {
      for (const { filter } of this._contextFilters.values()) {
        context._unregisterFilter(filter);
      }
    }
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
      ...parseCSV(this.fields),
      ...this._facetGroups.map((g) => g.field),
      ...Object.keys(this._activeSelections),
      // Un champ nommé par `default` porte toujours une valeur (#932) : son
      // filtre doit exister avant même que les données n'arrivent.
      ...this._parseDefaults().keys(),
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
    this.emitTransformedData(filterRowsBySelections(this._rawData, this._activeSelections));
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
  private _warnGrammar(
    attr: 'display' | 'labels' | 'value-labels',
    raw: string,
    message: string
  ): void {
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
  private _warnSeparatorIfSuspect(
    attr: 'display' | 'labels' | 'sort' | 'value-labels' | 'default',
    raw: string
  ): void {
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
        // `labels` et `default` portent des libellés et des valeurs humaines,
        // où la virgule est légitime (« Département, région ») ; `value-labels`
        // en forme courte ne porte que des noms de champ (#928).
        humanValues: attr === 'labels' || attr === 'default',
      },
      this._grammarWarned
    );
  }

  _parseLabels(): Map<string, string> {
    if (!this.labels) return new Map();
    this._warnSeparatorIfSuspect('labels', this.labels);
    const parsed = parseFacetLabels(this.labels);
    this._warnLabelsOnValues(parsed);
    return parsed;
  }

  /**
   * `labels` nomme des CHAMPS. Une entrée qui nomme une VALEUR
   * (`labels="22:Côtes-d'Armor"`) était lue comme un nom de champ et ignorée
   * sans un mot — la page affichait toujours ses codes et avait l'air juste
   * (#928). Signalé seulement quand `fields` est explicite : la liste des
   * champs est alors connue sans ambiguïté, et une entrée hors de cette
   * liste ne peut pas servir.
   */
  private _warnLabelsOnValues(parsed: Map<string, string>): void {
    if (!this.fields) return;
    const known = new Set(parseCSV(this.fields));
    const strays = [...parsed.keys()].filter((key) => !known.has(key));
    if (strays.length === 0) return;
    this._warnGrammar(
      'labels',
      this.labels,
      `${strays.map((s) => `"${s}"`).join(', ')} n'est pas un champ de facette : ` +
        `"labels" nomme des CHAMPS, pas leurs valeurs. Pour nommer une valeur, ` +
        `utiliser value-labels (champ compagnon ou table figée).`
    );
  }

  /** Tables de libellés mémorisées par champ (#928) — recalculées à chaque lot de lignes */
  private _labelTables = new Map<string, ReadonlyMap<string, string>>();

  /** Valeur d'attribut dont `_labelTables` dépend : un changement la purge */
  private _labelTablesRaw: string | null = null;

  /** Sources de libellé par champ (#928), ou la carte vide sans l'attribut */
  private _parseValueLabels(): ReadonlyMap<string, ValueLabelSpec> {
    const raw = this.valueLabels.trim();
    if (!raw) return NO_VALUE_LABELS;
    if (!raw.startsWith('{')) this._warnSeparatorIfSuspect('value-labels', raw);
    return parseValueLabels(raw, (message) =>
      this._warnGrammar('value-labels', this.valueLabels, message)
    );
  }

  /** Table `valeur -> libellé` d'un champ (#928), mémorisée par lot de lignes */
  private _valueLabelTable(field: string): ReadonlyMap<string, string> {
    if (!this.valueLabels) return NO_LABEL_TABLE;
    if (this._labelTablesRaw !== this.valueLabels) {
      this._labelTables.clear();
      this._labelTablesRaw = this.valueLabels;
    }
    const cached = this._labelTables.get(field);
    if (cached) return cached;
    const spec = this._parseValueLabels().get(field);
    const table =
      spec === undefined
        ? NO_LABEL_TABLE
        : spec.kind === 'table'
          ? spec.table
          : collectCompanionLabels(this._rawData, field, spec.labelField);
    this._labelTables.set(field, table);
    return table;
  }

  /** Copie des valeurs portant leur libellé (#928) — sans l'attribut, le tableau reçu */
  private _labelValues(values: FacetValue[], field?: string): FacetValue[] {
    if (!this.valueLabels || field === undefined) return values;
    return labelFacetValues(values, this._valueLabelTable(field));
  }

  /** Texte affiché d'une valeur d'un champ (#928) : libellé s'il existe, valeur sinon */
  _valueText(field: string, value: string): string {
    if (!this.valueLabels) return value;
    return this._valueLabelTable(field).get(value) ?? value;
  }

  /** Retraduit un texte affiché en valeur filtrée (#928) ; inchangé s'il n'est pas un libellé */
  _valueForText(field: string, text: string): string {
    if (!this.valueLabels) return text;
    const group = this._facetGroups.find((g) => g.field === field);
    const match = group?.values.find((fv) => fv.label === text);
    return match?.value ?? text;
  }

  /** Une valeur ou son libellé contient-elle la recherche en cours ? (#928) */
  private _matchesQuery(fv: FacetValue, query: string): boolean {
    if (!query) return true;
    return fv.value.toLowerCase().includes(query) || (fv.label ?? '').toLowerCase().includes(query);
  }

  /** Valeurs par défaut par champ (#932), même grammaire que `labels` */
  private _parseDefaults(): Map<string, string> {
    if (!this.default) return new Map();
    this._warnSeparatorIfSuspect('default', this.default);
    return parseFacetLabels(this.default);
  }

  /** Une valeur par défaut est-elle demandée ? (#932) */
  private _hasDefaults(): boolean {
    return this.default.trim() !== '';
  }

  /**
   * Pré-sélectionne les valeurs par défaut des champs qui n'ont aucune
   * sélection (#932). Rend `true` si l'état a changé — l'appelant décide
   * alors s'il faut rediffuser. Un champ déjà servi par l'URL est laissé
   * tel quel : `url-sync` l'emporte.
   */
  private _applyDefaultSelections(): boolean {
    const defaults = this._parseDefaults();
    if (defaults.size === 0) return false;
    const selections = { ...this._activeSelections };
    let changed = false;
    for (const [field, value] of defaults) {
      if (!value) continue;
      if ((selections[field]?.size ?? 0) > 0) continue;
      selections[field] = new Set([value]);
      changed = true;
    }
    if (changed) this._activeSelections = selections;
    return changed;
  }

  /**
   * Remet le défaut d'un champ dans un jeu de sélections en cours de calcul
   * (#932) : un champ à défaut n'est jamais vide, sinon le total afficherait
   * de nouveau le cumul que le défaut sert justement à éviter.
   */
  private _restoreDefault(field: string, selections: Record<string, Set<string>>): void {
    const value = this._parseDefaults().get(field);
    if (value) selections[field] = new Set([value]);
  }

  /** Le champ porte-t-il une valeur par défaut ? (#932) */
  private _hasDefaultFor(field: string): boolean {
    return !!this._parseDefaults().get(field);
  }

  /** Parse display attribute into per-field mode map */
  _parseDisplayModes(): Map<string, FacetDisplayMode> {
    if (!this.display) return new Map();
    this._warnSeparatorIfSuspect('display', this.display);
    return parseDisplayModes(this.display, (message) =>
      this._warnGrammar('display', this.display, message)
    );
  }

  /** Get the display mode for a specific field */
  _getDisplayMode(field: string): FacetDisplayMode {
    return this._parseDisplayModes().get(field) ?? 'checkbox';
  }

  /** Parse cols attribute: returns global col size or per-field map */
  _parseCols(): FacetWidths {
    return parseWidths(this.cols);
  }

  /** Classe de colonne DSFR d'un champ (#788) — `facets/facets-attributes.ts`. */
  _getColClass(field: string): string {
    return colClassFor(field, this._scaleFor(field), this._parseCols());
  }

  /** Échelles de `span` (#789) — `facets/facets-attributes.ts`. */
  private _parseSpanScales(): {
    global: Scale | null;
    byField: Map<string, Scale>;
    error: string | null;
  } {
    return parseSpanScales(this.span);
  }

  /** Échelle effective d'une facette (#790, #789) — `facets/facets-attributes.ts`. */
  private _scaleFor(field: string): Scale | null {
    return scaleForField(field, this._parseSpanScales(), parseScale(this.perRow, 'per-row').scale);
  }

  /** `per-row` ou `span` invalides, ou posés avec `cols` (#790, #789). */
  private _syncLayoutError(): void {
    const perRow = parseScale(this.perRow, 'per-row');
    const spans = this._parseSpanScales();
    const modern = perRow.scale !== null || spans.global !== null || spans.byField.size > 0;
    const message =
      perRow.error ??
      spans.error ??
      (modern && this.cols ? legacyConflictMessage('cols', this.span ? 'span' : 'per-row') : null);
    this._layoutError = syncLayoutError(this, 'dsfr-data-facets', message, this._layoutError);
  }

  // --- User interaction ---

  private _toggleValue(field: string, value: string) {
    const selections = { ...this._activeSelections };
    const fieldSet = new Set(selections[field] ?? []);

    const displayMode = this._getDisplayMode(field);
    const disjunctiveFields = parseCSV(this.disjunctive);
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
      // Un champ à défaut ne redevient jamais vide (#932)
      this._restoreDefault(field, selections);
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
      const selected = this._activeSelections[field]?.size ?? 0;
      this._announce(
        `${this._valueText(field, value)} ${action}, ${selected} option${selected > 1 ? 's' : ''} sélectionnée${selected > 1 ? 's' : ''}`
      );
    }
  }

  private _handleSelectChange(field: string, e: Event) {
    const select = e.target as HTMLSelectElement;
    const value = select.value;
    const selections = { ...this._activeSelections };

    if (!value) {
      delete selections[field];
      this._restoreDefault(field, selections);
    } else {
      selections[field] = new Set([value]);
    }

    this._activeSelections = selections;
    this._afterSelectionChange();
  }

  _clearFieldSelections(field: string) {
    const selections = { ...this._activeSelections };
    delete selections[field];
    // Remise à zéro = retour au défaut quand il y en a un (#932)
    this._restoreDefault(field, selections);
    this._activeSelections = selections;
    this._afterSelectionChange();
    const restored = selections[field];
    this._announce(
      restored
        ? `${this._valueText(field, [...restored][0])} sélectionnée, 1 option sélectionnée`
        : 'Aucune option sélectionnée'
    );
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
      this._restoreDefault(field, selections);
    } else {
      selections[field] = fieldSet;
    }
    this._activeSelections = selections;
    this._afterSelectionChange();
    this._announce(
      fieldSet.size === 0
        ? 'Aucune option sélectionnée'
        : `${this._valueText(field, value)} désélectionnée, ${fieldSet.size} option${fieldSet.size > 1 ? 's' : ''} sélectionnée${fieldSet.size > 1 ? 's' : ''}`
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
        ? group.values.filter((v) => this._matchesQuery(v, query)).length
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
    // « Réinitialiser » revient aux valeurs par défaut, pas à l'absence de
    // filtre : sur un jeu dont l'agrégat national est une ligne, l'absence
    // de filtre cumulerait toutes les régions (#932).
    this._applyDefaultSelections();
    this._afterSelectionChange();
  }

  /**
   * Common logic after any selection change — routes to client, server, or
   * static mode. En mode `context` (#678), la diffusion est confiee au
   * contexte ; la facette ne garde que le calcul de ses valeurs : cascade
   * serveur relancee ici SEULEMENT quand sa `source` n'est pas une cible du
   * contexte (rien ne la refetcherait), filtre local inchange en mode client.
   *
   * Le commentaire decrivait deja ce cas, le code ne le testait pas (#840) :
   * quand la source EST une cible, le contexte lui diffuse la clause, elle
   * refetche, emet, et `_onData` relance les facettes — la relance directe
   * faisait une requete `/facets` de plus a chaque clic, annulee aussitot par
   * `_facetsAbort` (donc invisible, mais payee).
   */
  private _afterSelectionChange() {
    if (this._contextMode) {
      this._pushContextFilters();
      if (this.serverFacets) {
        if (!this._sourceRefetchedByContext()) this._fetchServerFacets();
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

  /**
   * La source de cette facette sera-t-elle refetchee par le contexte (#840) ?
   *
   * Vrai quand elle est une cible du contexte, ou qu'elle est en aval d'une
   * cible par une chaine d'attributs `source` (une `dsfr-data-query` posee
   * derriere la source diffusee re-emet elle aussi). Les amonts multiples
   * (`join`, `concat`) ne sont pas remontes : on retombe alors sur la relance
   * directe, c'est-a-dire l'ancien comportement.
   */
  private _sourceRefetchedByContext(): boolean {
    if (!this._context || !this.source) return false;
    const targets = new Set(this._context.sourceIds);
    const seen = new Set<string>();
    let id: string | undefined = this.source;
    while (id && !seen.has(id)) {
      if (targets.has(id)) return true;
      seen.add(id);
      const upstream = document.getElementById(id) as unknown as SourceElement | null;
      id = upstream?.source;
    }
    return false;
  }

  // --- URL params ---

  /** Parse url-param-map attribute into a map of URL param name -> facet field name */
  _parseUrlParamMap(): Map<string, string> {
    return parseUrlParamMap(this.urlParamMap);
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
      for (const key of staticValueFields(this.staticValues)) fields.add(key);
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
    const { conflicts, contextId } = findUrlParamConflicts(new Set(this._urlParamNamesRead()));
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
    const selections = readUrlSelections(
      new URLSearchParams(window.location.search),
      this._parseUrlParamMap(),
      this._urlReadableFields()
    );
    if (Object.keys(selections).length > 0) {
      this._activeSelections = selections;
    }
  }

  /**
   * Sync current facet selections back to URL (replaceState). Construction de
   * l'URL et ecriture dans `utils/page-url.ts` (#683, #837), contenu des
   * paramètres dans `facets/facets-url.ts` (#312, #838).
   */
  private _syncUrl() {
    const url = currentUrl();
    writeUrlSelections(url, this._activeSelections, this._facetGroups, this._parseUrlParamMap());
    replaceUrl(url);
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

    const hasActiveFilters = this._hasActiveSelections();

    // UI jamais entierement disparue quand un filtre est actif (#310) :
    // en mode serveur, _rawData est la page FILTREE — une selection donnant
    // 0 resultat faisait disparaitre les checkboxes ET le bouton
    // Reinitialiser (utilisateur coince)
    if (this._rawData.length === 0 || this._facetGroups.length === 0) {
      if (!hasActiveFilters && !this._facetsError) {
        return nothing;
      }
    }

    return html`
      ${facetsStyles}
      <div class="dsfr-data-facets">
        <div aria-live="polite" class="fr-sr-only">${this._liveAnnouncement}</div>
        ${this._renderBanners()}
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
        ${this._renderGroups()}
      </div>
    `;
  }

  /**
   * Bandeaux d'etat au-dessus des facettes : echec du fetch de facettes
   * (#309) et `weight-field` demande en mode serveur (#739) — un compteur
   * faux serait pire qu'un compteur absent, l'API facettes ne renvoie qu'un
   * nombre de lignes.
   */
  private _renderBanners() {
    const facetsErrorBanner = this._facetsError
      ? html`
          <div class="fr-alert fr-alert--error fr-alert--sm" role="alert">
            <p>Facettes indisponibles : ${this._facetsError}</p>
          </div>
        `
      : nothing;

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

    return html`${facetsErrorBanner} ${weightBanner}`;
  }

  /**
   * Grille des facettes : grille DSFR des que `cols`, `span` ou `per-row`
   * est pose, grille automatique sinon.
   */
  private _renderGroups() {
    const useDsfrGrid = !!(this.cols || this.span || this.perRow);
    if (!useDsfrGrid) {
      return html`
        <div class="dsfr-data-facets__groups">
          ${this._facetGroups.map((group) => this._renderFacetGroup(group))}
        </div>
      `;
    }
    return html`
      <div class="fr-grid-row fr-grid-row--gutters">
        ${this._facetGroups.map(
          (group) => html`
            <div class="${this._getColClass(group.field)}">${this._renderFacetGroup(group)}</div>
          `
        )}
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
    const searchableFields = parseCSV(this.searchable);
    const isSearchable = searchableFields.includes(group.field);
    const searchQuery = (this._searchQueries[group.field] ?? '').toLowerCase();
    const isExpanded = this._expandedFacets.has(group.field);

    let displayValues = group.values;
    if (isSearchable && searchQuery) {
      displayValues = displayValues.filter((v) => this._matchesQuery(v, searchQuery));
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
          ${
            // Un champ à défaut n'a pas d'état « Tous » : l'option ne pourrait
            // que revenir au défaut (#932)
            this._hasDefaultFor(group.field)
              ? nothing
              : html`<option value="" ?selected="${!selectedValue}">Tous</option>`
          }
          ${group.values.map(
            (fv) => html`
              <option value="${fv.value}" ?selected="${fv.value === selectedValue}">
                ${
                  this._effectiveHideCounts || fv.missing
                    ? `${facetValueText(fv)}${fv.missing ? ' (indisponible)' : ''}`
                    : `${facetValueText(fv)} (${this._formatCount(fv.count)})`
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
      displayValues = displayValues.filter((v) => this._matchesQuery(v, searchQuery));
    }

    const triggerLabel =
      selected.size > 0
        ? `${selected.size} option${selected.size > 1 ? 's' : ''} sélectionnée${selected.size > 1 ? 's' : ''}`
        : 'Sélectionnez des options';

    // Selected values description for screen readers
    const selectedDesc =
      selected.size > 0 ? [...selected].map((v) => this._valueText(group.field, v)).join(', ') : '';

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
        ${
          // Un champ à défaut n'a pas d'état « Tous » (#932)
          this._hasDefaultFor(group.field)
            ? nothing
            : html`
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
              `
        }
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
      displayValues = displayValues.filter((v) => this._matchesQuery(v, searchQuery));
    }

    const selectedValue = selected.size > 0 ? [...selected][0] : null;
    const triggerLabel =
      selectedValue === null
        ? 'Sélectionnez une option'
        : this._valueText(group.field, selectedValue);

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

/**
 * Parse a comma-separated string into trimmed non-empty tokens.
 * Reexport de `facets/facets-types.ts` (#838) : les modules de facettes
 * n'importent pas le composant, et l'export historique reste en place.
 */
export const _parseCSV = parseCSV;

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-facets': DsfrDataFacets;
  }
}

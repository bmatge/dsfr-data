import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  escapeHtml,
  formatNumber,
  matchesSearch,
  normalizeSearchText,
} from '@dsfr-data/shared/lib';
import type { ContextFilterLike, ContextSearch, SearchOperator } from '@dsfr-data/shared/lib';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { buildSearchClause } from '../utils/search-clause.js';
import { dispatchSourceCommand, getDataMeta } from '../utils/data-bridge.js';
import { TransformerMixin } from '../utils/transformer-mixin.js';
import {
  renderSourceIdle,
  renderFiltersUnavailable,
  resolveFiltersUnavailable,
  IDLE_MESSAGE_DEFAULT,
  type FiltersUnavailableView,
} from '../utils/status-templates.js';
import type { SourceElement } from '../utils/source-element.js';
import { ContextBindingMixin } from '../utils/context-binding.js';
import type { ContextHost } from '../utils/context-registry.js';
import { currentUrl, replaceUrl } from '../utils/page-url.js';
import { escapeUrlValue, readUrlScalar } from '../utils/url-values.js';
import { countNoun } from '../utils/count-label.js';

/**
 * Afficheurs aval qui portent leur propre region live de compte de résultats.
 * Quand l'un d'eux consomme la sortie de ce composant (en direct ou via des
 * intermediaires chaînes par `source`), search ne rend AUCUNE region live :
 * une seule region live par chaîne, portee par le composant terminal (#654).
 */
const DOWNSTREAM_LIVE_COUNT_TAGS: ReadonlySet<string> = new Set([
  'dsfr-data-list',
  'dsfr-data-display',
]);

/**
 * La recherche vue par le contexte (#678, ADR-104 amendée par ADR-159, lot 3).
 *
 * Elle n'est plus un filtre `contains` : elle porte une RECHERCHE — le terme,
 * le champ unique de `fields`, l'opérateur — que le contexte confie à chaque
 * source cible, laquelle la traduit (moteur de son API, ou calcul dans le
 * navigateur). Sa clause colon est donc toujours vide ; pour l'URL, le tag et
 * `context-value`, rien ne change.
 */
class SearchContextFilter implements ContextFilterLike {
  readonly applyTo = '*';
  /** Sert seulement à signaler deux recherches posées sur le même champ. */
  readonly operator = 'search';

  constructor(private readonly host: DsfrDataSearch) {}

  get field(): string {
    return this.host._contextField();
  }

  get isConnected(): boolean {
    return this.host.isConnected;
  }

  /** Une recherche n'est pas une clause (ADR-159) : voir `buildSearch`. */
  buildColonWhere(): string {
    return '';
  }

  buildSearch(): ContextSearch | null {
    const term = this.host._effectiveTerm();
    if (!term || !this.field) return null;
    return { term, fields: [this.field], operator: this.host.operator || 'contains' };
  }

  /** Tag « Recherche : terme » (#679) — le libellé par défaut du champ est un verbe */
  displayLabel(): string {
    const label = this.host.label.trim();
    return label && label !== 'Rechercher' ? label : 'Recherche';
  }

  displayValue(): string {
    return this.host._effectiveTerm();
  }

  /** Meme chemin que la touche Echap : vide le champ et re-emet */
  clear(): void {
    this.host.clear();
  }

  /**
   * Le terme est UNE valeur : sa virgule part échappée (`%2C`), comme celle
   * d'une valeur de facette (#1243, famille de BUG-031).
   */
  urlValue(): string {
    return escapeUrlValue(this.host._effectiveTerm());
  }
}

/**
 * <dsfr-data-search> - Recherche textuelle
 *
 * Composant visuel intermediaire qui affiche un champ de recherche DSFR et filtre
 * les données avant de les redistribuer aux composants en aval. Se place entre
 * une source/normalize et les facettes/visualisations.
 *
 * Position dans le pipeline :
 * dsfr-data-source -> dsfr-data-normalize -> dsfr-data-search -> dsfr-data-facets -> dsfr-data-display
 *
 * La recherche reduit le jeu de données, les facettes affinent ensuite.
 *
 * @example
 * <dsfr-data-search id="searched" source="clean"
 *   fields="Nom_de_l_entreprise, SIRET"
 *   placeholder="Rechercher une entreprise..."
 *   operator="words" count>
 * </dsfr-data-search>
 *
 * En mode `context="id"` (#678, ADR-104, ADR-159), la recherche est confiée
 * à <dsfr-data-context>, qui la diffuse à toutes ses sources cibles, porte
 * l'URL (paramètre nommé d'après le champ unique de `fields`) et le tag. Ce
 * n'est PAS un filtre `contains` : chaque cible traduit la recherche — par le
 * moteur de son API quand elle en a un, sinon dans le navigateur. Elle n'émet
 * plus de commande directe.
 *
 * Source en panne (#1288) : le champ est DÉSACTIVÉ (lecture seule,
 * `aria-disabled`, toujours atteignable au clavier), sous la phrase « Filtres
 * momentanément indisponibles. » (ou celle de la cause ; `error-message` de la
 * source la suit), qu'il désigne comme sa raison. Le compte de résultats, qui
 * date du dernier chargement, n'est plus affiché ni annoncé. Le terme déjà
 * saisi est GARDÉ : il s'applique de nouveau dès que les données reviennent.
 * Échap efface toujours le terme — retirer un filtre est parfois ce qui fait
 * repartir la requête. Le champ reste actif quand le refus vient de la page
 * elle-même (requête refusée) : le terme saisi peut en être la cause.
 *
 * @fires dsfr-data-search-change - `{ query, count }` sur l'élément — la saisie de recherche a change (pour synchroniser une UI de page).
 * @fires dsfr-data-source-command - `{ sourceId, where, whereKey, origin }` sur `document` — recherche relayee en filtre serveur vers la source amont (hors mode `context`, ou c'est le contexte qui diffuse). `origin` porte l'id de ce composant (#603).
 */
@customElement('dsfr-data-search')
export class DsfrDataSearch extends ContextBindingMixin(TransformerMixin(LitElement)) {
  /** ID de la source de données a ecouter */
  @property({ type: String })
  source = '';

  /**
   * Champs sur lesquels rechercher (virgule-séparés). Vide = tous les champs
   * @champ liste
   */
  @property({ type: String })
  fields = '';

  /** Placeholder du champ de saisie */
  @property({ type: String })
  placeholder = 'Rechercher\u2026';

  /** Label du champ (accessible) */
  @property({ type: String })
  label = 'Rechercher';

  /** Délai en ms avant déclenchement du filtre après la dernière frappe */
  @property({ type: Number })
  debounce = 300;

  /** Nombre minimum de caractères avant déclenchement */
  @property({ type: Number, attribute: 'min-length' })
  minLength = 0;

  /** Ajoute un champ _highlight à chaque record avec les termes trouvés marqués en <mark> */
  @property({ type: Boolean })
  highlight = false;

  /**
   * Mode de recherche quand elle est calculée dans le navigateur, casse et
   * accents ignorés : `contains` (le terme est une sous-chaîne), `starts` (un
   * mot commence par le terme), `words` (tous les mots du terme sont
   * présents). Une recherche confiée à un serveur (`server-search`, ou cible
   * de `context` dont l'API a de quoi chercher) suit la comparaison de ce
   * serveur.
   */
  @property({ type: String })
  operator: SearchOperator = 'contains';

  /** Si true, le label est en sr-only (visuellement masque, accessible) */
  @property({ type: Boolean, attribute: 'sr-label' })
  srLabel = false;

  /**
   * Affiche un compteur de résultats sous le champ (compte serveur `meta.total`
   * en `server-search`), séparateur de milliers français (#728). Ce compteur
   * reste visible dès qu'une donnée a circulé ; seule sa nature de région live
   * dépend de la chaîne aval (#654). Tant que l'amont attend un filtre
   * (`require-where`), il cède la place au message d'attente : annoncer
   * « 0 résultats » avant toute requête laisserait croire à une page vide.
   */
  @property({ type: Boolean })
  count = false;

  /**
   * Nom compté par le compteur de `count`, à la place de « résultat » :
   * `count-label="établissement"` affiche « 12 345 établissements ». Une
   * forme seule prend un « s » au pluriel ; pour un pluriel irrégulier,
   * donner les deux formes séparées par une barre verticale :
   * `count-label="cheval|chevaux"`, `count-label="prix|prix"`.
   */
  @property({ type: String, attribute: 'count-label' })
  countLabel = '';

  /**
   * Message rendu quand l'amont attend un filtre (`require-where`, #690).
   * Distinct de « aucune donnée » : aucune requête n'a été faite. Vide,
   * le libellé par défaut est utilisé.
   */
  @property({ type: String, attribute: 'idle-message' })
  idleMessage = IDLE_MESSAGE_DEFAULT;

  /** Nom du paramètre d'URL à lire comme terme de recherche initial. Vide = désactivé */
  @property({ type: String, attribute: 'url-search-param' })
  urlSearchParam = '';

  /** Synchronise l'URL quand l'utilisateur tape (replaceState) */
  @property({ type: Boolean, attribute: 'url-sync' })
  urlSync = false;

  /**
   * Active le mode recherche serveur.
   * Au lieu de filtrer localement, envoie une commande { where } au source upstream
   * (dsfr-data-query server-side) qui re-fetche les données avec le filtre search.
   */
  @property({ type: Boolean, attribute: 'server-search' })
  serverSearch = false;

  /**
   * Template pour la recherche serveur.
   * {q} est remplacé par le terme de recherche, {fields} par les champs de
   * `fields` séparés par `|` (#1026) — la grammaire colon des champs
   * multiples, un OU entre eux.
   * Si vide et server-search activé, lu depuis l'adaptateur de la source
   * amont (gabarit par défaut de chaque adaptateur déclarant
   * `serverSearch` : recherche plein texte native, ou `{fields}:contains:{q}`
   * traduit en OU entre colonnes — la casse et les accents suivent l'API ;
   * table des capacités d'ARCHITECTURE).
   * Ex. personnalisés : '{q} IN nom', 'nom|commune:contains:{q}'.
   * Une clause que l'adaptateur ne sait pas transmettre (caractère que son
   * API ne sait pas porter), ou une source sans adaptateur, retombe sur une
   * recherche locale, signalée en console.
   */
  @property({ type: String, attribute: 'search-template' })
  searchTemplate = '';

  /**
   * Id du dsfr-data-context auquel s'enregistrer (#678, ADR-104) : la
   * recherche est confiée au contexte, qui la diffuse à ses cibles et porte
   * l'URL (`url-sync` et `url-search-param` sont ignorés — le paramètre est
   * nommé d'après le champ, ou via `url-param-map` du contexte). `fields` doit
   * nommer UN seul champ (le OU entre champs, `a|b:contains:q` #1026, reste
   * propre à `server-search`). Le contexte peut être déclaré après la
   * recherche dans la page. Vide = comportement autonome.
   *
   * La recherche n'est pas un filtre `contains` (ADR-159) : CHAQUE CIBLE LA
   * TRADUIT, selon ce que son API sait faire.
   * - Opendatasoft : le moteur de recherche du portail, borné au champ
   *   (`search(champ, "terme")`) — par DÉBUT DE MOT, casse et accents
   *   ignorés : « aliment » trouve « alimentation », « mentation » non. Le
   *   champ doit être du texte.
   * - Tabular, Grist : une sous-chaîne (`champ:contains:terme`), casse
   *   ignorée, accents respectés.
   * - INSEE Melodi, adaptateur tiers : la source calcule la recherche dans le
   *   navigateur, sur les lignes chargées (dans la limite de `max-records`),
   *   avec `operator`, casse et accents ignorés.
   *
   * Confiée à l'API, la recherche entre dans le `where` de la source : une
   * cible en `server-side` et des facettes `server-facets` voisines comptent
   * le même ensemble. Ce composant laisse alors passer les lignes de sa source
   * sans les refiltrer, et son compteur (`count`) annonce le total du serveur.
   * Calculée dans le navigateur, elle exige que la source charge le jeu : une
   * cible en `server-side` passe en erreur de configuration.
   */
  @property({ type: String })
  context = '';

  @state()
  private _allData: Record<string, unknown>[] = [];

  @state()
  private _filteredData: Record<string, unknown>[] = [];

  @state()
  private _term = '';

  @state()
  private _resultCount = 0;

  /** Message d'erreur de configuration (id/source manquant) — rendu en alerte DSFR */
  @state()
  private _configError: string | null = null;

  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _urlParamApplied = false;

  /** Le filtre unique enregistre aupres du contexte (#678) */
  private _contextFilter: SearchContextFilter | null = null;

  /**
   * `server-search` retombe en local pour le terme courant (#1026) : la clause
   * n'est pas traduisible par l'adaptateur amont (`supportsServerWhere`), ou
   * le gabarit vise `{fields}` sans `fields`.
   */
  private _serverRefused = false;

  /** Motifs de repli deja signales (un avertissement par motif). */
  private readonly _serverRefusedWarned = new Set<string>();

  /** Dernière recherche confiée au contexte — une donnée qui arrive ne re-diffuse pas un terme inchangé */
  private _lastPushedSearch: string | null = null;

  /**
   * En mode `context`, les lignes reçues sont-elles DÉJÀ celles que le terme
   * désigne (ADR-159 lot 3) ? Vrai quand la source amont est une cible du
   * contexte dont l'API sert la recherche : la refiltrer ici, avec une autre
   * règle, retirerait des lignes que le serveur a retenues (un portail
   * cherche par mots, pas par sous-chaîne). Les lignes passent telles quelles,
   * avec la meta de l'amont — comme en `server-search`.
   */
  private _servedByContext = false;

  /** Synchro d'URL par la recherche elle-meme — desactivee en mode `context` */
  private get _ownUrlSync(): boolean {
    return this.urlSync && !!this.urlSearchParam && !this._contextMode;
  }

  /** Champ filtre en mode context : le champ unique de `fields` (vide sinon) */
  _contextField(): string {
    const fields = this._getFields();
    return fields.length === 1 ? fields[0] : '';
  }

  /** Terme courant s'il atteint `min-length`, sinon vide (filtre inactif) */
  _effectiveTerm(): string {
    return this._term && this._term.length >= this.minLength ? this._term : '';
  }

  // --- Public API (delegation to upstream source) ---

  /**
   * Retourne l'adapter de la source amont (délégation transparente).
   * Permet aux composants en aval (dsfr-data-facets) d'acceder a l'adapter
   * sans connaitre la structure du pipeline.
   */
  public getAdapter(): import('../adapters/api-adapter.js').ApiAdapter | null {
    return this.delegateGetAdapter();
  }

  /**
   * Retourne le where effectif de la source amont (délégation transparente).
   */
  public getEffectiveWhere(excludeKey?: string | string[]): string {
    return this.delegateGetEffectiveWhere(excludeKey);
  }

  /**
   * Retourne les paramètres adapter résolus de la source amont
   * (délégation transparente, headers api-key-ref inclus — #274).
   */
  public getAdapterParams(): import('../adapters/api-adapter.js').AdapterParams | null {
    return this.delegateGetAdapterParams();
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-search');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  /** Paramètres de recherche → re-filtrage local (#281) */
  protected transformerReprocessProps(): string[] {
    return ['fields', 'operator', 'minLength', 'highlight'];
  }

  // --- Mode context (#678, ADR-104) ---

  /** Le mode context exige un champ unique — refus verifie avant d'adopter le contexte */
  protected validateContextBinding(): string | null {
    return this._contextField()
      ? null
      : 'en mode context, "fields" doit nommer un seul champ (celui que la recherche du contexte interroge)';
  }

  /**
   * Contexte resolu (#837, tronc dans ContextBindingMixin) : le filtre unique
   * s'y enregistre.
   */
  protected onContextBound(context: ContextHost): void {
    this._contextFilter = new SearchContextFilter(this);
    context._registerFilter(this._contextFilter);

    // Terme initial depuis l'URL du contexte (#231, ADR-031) : il remplit le
    // champ et repasse par le MEME chemin qu'une frappe
    // Le paramètre entier est LE terme (#1243) : découpé sur les virgules puis
    // recollé, « Paris, France » revenait en « Paris,France » et ne trouvait
    // plus rien.
    const raw = context._urlRawFor(this._contextFilter.field);
    const term = raw === null ? '' : readUrlScalar(raw);
    if (term) this._term = term;
    this._applyFilter();
  }

  /** Libere le filtre aupres du contexte (disconnect, changement de contexte) */
  protected onContextUnbound(context: ContextHost | null): void {
    if (context && this._contextFilter) {
      context._unregisterFilter(this._contextFilter);
    }
    this._contextFilter = null;
    this._lastPushedSearch = null;
    this._servedByContext = false;
  }

  /**
   * Confie la recherche courante au contexte, qui diffuse (#678, ADR-159).
   * Dédupliqué : _applyFilter est aussi appelé à chaque arrivée de données, et
   * une source cible ré-émet après chaque commande — sans ce garde, boucle.
   * Retourne `true` quand le contexte a été sollicité.
   */
  private _pushContextFilter(): boolean {
    if (!this._context || !this._contextFilter) return false;
    const search = this._contextFilter.buildSearch();
    const key = search ? JSON.stringify(search) : '';
    if (key === (this._lastPushedSearch ?? '')) return false;
    this._lastPushedSearch = key;
    this._context._applySearch(this._contextFilter, search);
    return true;
  }

  /**
   * La source amont — en direct, ou au bout d'une chaîne de transformateurs
   * (`source="…"`) — est-elle une cible du contexte dont l'API sert la
   * recherche ? Voir `_servedByContext`.
   */
  private _upstreamSearchedByServer(): boolean {
    if (!this._context || !this._contextFilter) return false;
    let el: Element | null = this.source ? document.getElementById(this.source) : null;
    for (let hop = 0; hop < 10 && el; hop++) {
      const route = el.id ? this._context._searchRouteFor(this._contextFilter, el.id) : null;
      if (route) return route === 'server';
      const next = el.getAttribute('source');
      el = next ? document.getElementById(next) : null;
    }
    return false;
  }

  protected onTransformerReprocess(): void {
    if (this._allData.length > 0) {
      this._applyFilter();
    }
  }

  // --- Public methods ---

  /** Efface le champ et restaure toutes les données */
  clear() {
    this._term = '';
    const input = this.querySelector('input');
    if (input) {
      input.value = '';
      input.focus();
    }
    this._applyFilter();
  }

  /** Declenche une recherche programmatique */
  search(term: string) {
    this._term = term;
    const input = this.querySelector('input');
    if (input) input.value = term;
    this._applyFilter();
  }

  /**
   * Retourne les données actuellement filtrees. Vide pendant une panne de
   * l'amont (#1272) : voir `getLastKnownData()`.
   */
  getData(): Record<string, unknown>[] {
    return this.isStale() ? [] : this._filteredData;
  }

  /** Remplace le jeu de données source */
  setData(data: Record<string, unknown>[]) {
    this._allData = Array.isArray(data) ? data : [];
    this._applyFilter();
  }

  // --- Private implementation ---

  /** Alias historique de reinitTransformer() — conserve pour les tests */
  _initialize() {
    this.reinitTransformer();
  }

  // --- Hooks TransformerMixin (#280) ---

  protected transformerName(): string {
    return 'dsfr-data-search';
  }

  protected validateTransformerConfig(): string | null {
    if (!this.id) {
      this._configError = 'attribut "id" requis';
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
    // Read search template from adapter if empty and server-search enabled
    if (this.serverSearch && !this.searchTemplate) {
      const sourceEl = document.getElementById(this.source);
      const adapter = (sourceEl as unknown as SourceElement)?.getAdapter?.();
      const template = adapter?.getDefaultSearchTemplate?.();
      if (template !== undefined) {
        this.searchTemplate = template || '';
      }
    }

    // In server-search mode with URL param, read the param and send the
    // command proactively BEFORE data arrives. This lets dsfr-data-source
    // include the search filter in the initial request.
    if (this.serverSearch && this.urlSearchParam && !this._contextMode && !this._urlParamApplied) {
      this._applyUrlSearchParam();
      this._urlParamApplied = true;
      if (this._term) {
        this._applyServerSearch();
      }
    }
  }

  protected onTransformerData(data: unknown): void {
    this._onData(data);
  }

  /**
   * Meta amont propagee telle quelle en server-search (lignes pre-filtrees
   * par le serveur, total valide) — et en mode `context` quand l'API de la
   * source sert la recherche (ADR-159 lot 3). En filtre client le nombre de
   * lignes change : pas de meta (#282).
   */
  protected transformMeta(meta: import('../utils/data-bridge.js').PaginationMeta) {
    return (this.serverSearch && !this._serverRefused) || this._servedByContext ? meta : null;
  }

  private _onData(data: unknown) {
    const rows = Array.isArray(data) ? data : [];

    if (this.serverSearch && this._serverRefused) {
      // Repli local (#1026) : la clause n'a pas pu partir au serveur, le
      // terme filtre les lignes recues, comme sans `server-search`.
      this._allData = rows;
      this._filterLocally();
      return;
    }

    if (this.serverSearch) {
      // Server-search mode: data arrives pre-filtered from the server.
      // Pass it through without local filtering.
      this._allData = rows;
      this._filteredData = rows;

      // Use meta.total if available for count, otherwise use row count
      const meta = getDataMeta(this.source);
      this._resultCount = meta?.total ?? rows.length;

      // Re-emit under our own ID — meta posee AVANT le dispatch par le mixin
      this.emitTransformedData(rows);

      // On first load with URL param, trigger server search (hors mode
      // context, #678 : le terme d'URL vient alors du contexte, qui diffuse)
      if (this.urlSearchParam && !this._contextMode && !this._urlParamApplied) {
        this._applyUrlSearchParam();
        this._urlParamApplied = true;
        if (this._term) {
          this._applyServerSearch();
        }
      }
      return;
    }

    this._allData = rows;
    if (this.urlSearchParam && !this._urlParamApplied) {
      this._applyUrlSearchParam();
      this._urlParamApplied = true;
    }
    this._applyFilter();
  }

  /** Read URL search param and set as initial search term (hors mode context, #678) */
  _applyUrlSearchParam() {
    if (!this.urlSearchParam || this._contextMode) return;
    const params = new URLSearchParams(window.location.search);
    const value = params.get(this.urlSearchParam);
    if (value) {
      this._term = value;
    }
  }

  _applyFilter() {
    // Mode context (#678) : le contexte diffuse — la recherche ne commande
    // plus sa source. En server-search elle laisse passer les donnees ; quand
    // l'API de sa source sert la recherche (ADR-159 lot 3) aussi ; sinon elle
    // continue de filtrer son aval (inchange)
    if (this._contextMode) {
      const pushed = this._pushContextFilter();
      this._servedByContext = this._upstreamSearchedByServer();
      if (this.serverSearch || (this._servedByContext && pushed)) {
        // Les lignes du nouveau terme arrivent de la source : rien a emettre
        // d'ici la, surtout pas les lignes de l'ancien terme sous le nouveau.
        this._emitSearchChange(this._resultCount);
        return;
      }
    } else if (this.serverSearch && this.source) {
      // Server-search mode: delegate to upstream source via command
      this._applyServerSearch();
      return;
    }

    this._filterLocally();
  }

  /** Filtre local des lignes recues, puis emission (hors `server-search`, ou son repli #1026). */
  private _filterLocally() {
    const term = this._term;

    // Lignes deja cherchees par l'API de la source (mode `context`, ADR-159
    // lot 3) : elles passent telles quelles.
    if (!term || term.length < this.minLength || this._servedByContext) {
      this._filteredData = [...this._allData];
    } else {
      const fields = this._getFields();
      const op = this.operator || 'contains';
      const normTerm = this._normalize(term);

      this._filteredData = this._allData.filter((record) =>
        this._matchRecord(record, normTerm, fields, op)
      );
    }

    if (this.highlight && term && term.length >= this.minLength) {
      this._filteredData = this._filteredData.map((r) => this._addHighlight(r, term));
    }

    // Servies par l'API : le compte est le total du serveur, comme en
    // `server-search` (la source peut n'avoir livre qu'une page).
    this._resultCount = this._servedByContext
      ? (getDataMeta(this.source)?.total ?? this._filteredData.length)
      : this._filteredData.length;
    this._dispatch();
  }

  /**
   * Server-search: envoie une commande { where } au source upstream
   * au lieu de filtrer localement.
   */
  private _applyServerSearch() {
    const term = this._term;
    let where = '';
    let refusal: string | null = null;

    if (term && term.length >= this.minLength) {
      // Echappement du terme dans le dialecte de l'adaptateur (#271,
      // #1135) : c'est lui qui sait quels caracteres sont structurels
      const adapter = this.getAdapter();
      // `{fields}` (#1026) : les champs de la recherche, separes par `|` —
      // la grammaire colon des champs multiples, un OU entre eux
      const fields = this._getFields();
      if (!adapter) {
        // Sans adaptateur (source en mode URL, ou id introuvable), aucun
        // dialecte de filtre serveur n'est connu (#1139) : on n'en suppose
        // aucun, la recherche se fait dans le navigateur
        refusal =
          `la source "${this.source}" n'a pas d'adaptateur (api-type) : ` +
          `aucun filtre ne peut partir au serveur`;
      } else {
        // Gabarit, echappement, champs, puis « l'API sait-elle la porter ? » :
        // le meme chemin que la recherche du contexte (`buildSearchClause`)
        const clause = buildSearchClause(adapter, this.searchTemplate, term, fields);
        where = clause.where;
        refusal = clause.refusal;
      }
    }

    // Repli local (#1026) : jamais une recherche perdue en silence. La clause
    // serveur de cette recherche est levee, le terme filtre les lignes recues
    // (compte local, sans `meta.total`) et un avertissement le dit.
    if (refusal !== null) {
      this._warnServerRefused(refusal);
      this._serverRefused = true;
      dispatchSourceCommand(this.source, { where: '', whereKey: this.id, origin: this.id });
      this._filterLocally();
      return;
    }
    this._serverRefused = false;

    // Dispatch command to upstream source (dsfr-data-query server-side)
    dispatchSourceCommand(this.source, { where, whereKey: this.id, origin: this.id });

    // Sync URL if enabled
    if (this._ownUrlSync) {
      this._syncUrl();
    }

    this._emitSearchChange(this._resultCount);
  }

  /** Une recherche serveur retombee en local (#1026) : dit une fois par motif. */
  private _warnServerRefused(reason: string): void {
    if (this._serverRefusedWarned.has(reason)) return;
    this._serverRefusedWarned.add(reason);
    console.warn(
      `dsfr-data-search[${this.id}]: server-search — ${reason}. Recherche faite dans le ` +
        `navigateur, sur les seules lignes chargees : le compte peut differer du total serveur.`
    );
  }

  /** Emit dsfr-data-search-change event */
  private _emitSearchChange(count: number): void {
    document.dispatchEvent(
      new CustomEvent('dsfr-data-search-change', {
        bubbles: true,
        composed: true,
        detail: {
          sourceId: this.id,
          term: this._term,
          count,
        },
      })
    );
  }

  /** Comparaison tolerante, partagee avec la source (`shared/query/text-match.ts`). */
  _matchRecord(
    record: Record<string, unknown>,
    normTerm: string,
    fields: string[],
    operator: SearchOperator
  ): boolean {
    return matchesSearch(record, normTerm, fields, operator);
  }

  _normalize(str: string): string {
    return normalizeSearchText(str);
  }

  _getFields(): string[] {
    if (!this.fields) return [];
    return this.fields
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
  }

  _addHighlight(record: Record<string, unknown>, term: string): Record<string, unknown> {
    const clone = { ...record };
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // `escaped` is already regex-escaped above, so the resulting regex is linear.
    // eslint-disable-next-line security/detect-non-literal-regexp
    const regex = new RegExp('(' + escaped + ')', 'gi'); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
    const fields = this._getFields();
    const searchIn =
      fields.length > 0 ? fields : Object.keys(record).filter((k) => typeof record[k] === 'string');

    const highlights: string[] = [];
    searchIn.forEach((f) => {
      const value = record[f];
      if (typeof value !== 'string') return;
      // split avec groupe capturant : les matchs sont aux indices impairs.
      // Chaque segment est echappe AVANT insertion des <mark> pour que du HTML
      // present dans la donnee source reste inerte (XSS via {{{_highlight}}}).
      const parts = value.split(regex);
      if (parts.length < 2) return; // aucun match dans ce champ : pas de highlight
      highlights.push(
        parts
          .map((seg, i) => (i % 2 === 1 ? `<mark>${escapeHtml(seg)}</mark>` : escapeHtml(seg)))
          .join('')
      );
    });
    clone._highlight = highlights.join(' \u2026 ');
    return clone;
  }

  /**
   * La recherche est-elle désactivée par une panne de la source (#1288) ? Vrai
   * de l'échec au prochain chargement réussi, nouvel essai compris.
   */
  _unavailable(): FiltersUnavailableView | null {
    return resolveFiltersUnavailable(this.getError(), this.source);
  }

  private _onInput(value: string) {
    if (this._unavailable()) return;
    this._term = value;
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      this._applyFilter();
    }, this.debounce);
  }

  private _onSubmit() {
    if (this._unavailable()) return;
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this._applyFilter();
  }

  private _dispatch() {
    if (!this.id) return;

    this.emitTransformedData(this._filteredData);

    if (this._ownUrlSync) {
      this._syncUrl();
    }

    // Le compte annoncé : celui du serveur quand c'est lui qui a cherché.
    this._emitSearchChange(this._resultCount);
  }

  /**
   * Sync current search term back to URL (replaceState) — construction de
   * l'URL et ecriture dans `utils/page-url.ts` (#683, #837).
   */
  private _syncUrl() {
    const url = currentUrl();
    if (this._term) {
      url.searchParams.set(this.urlSearchParam, this._term);
    } else {
      url.searchParams.delete(this.urlSearchParam);
    }
    replaceUrl(url);
  }

  /**
   * Vrai si un afficheur aval (list, display) consomme ce composant, en direct
   * ou a travers des intermediaires (`source="<id>"` chaînes, ex. facets).
   * Il porte alors seul la region live de la chaîne : deux regions `polite`
   * pour un meme geste donnaient deux nombres contradictoires (#654).
   * Evalue a chaque rendu (requête d'attribut, cout negligeable) pour suivre
   * un DOM aval encore en cours d'analyse au premier rendu. La chaîne est
   * suivie par l'ATTRIBUT `source` (usage declaratif) : un consommateur cree
   * en JS avec la seule propriete n'est pas vu, search garde alors sa region.
   */
  private _hasDownstreamLiveRegion(): boolean {
    if (!this.id) return false;
    const visited = new Set<string>();
    const queue: string[] = [this.id];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      if (visited.has(id)) continue;
      visited.add(id);
      const consumers = document.querySelectorAll(`[source="${id.replace(/["\\]/g, '\\$&')}"]`);
      for (const el of Array.from(consumers)) {
        if (DOWNSTREAM_LIVE_COUNT_TAGS.has(el.tagName.toLowerCase())) return true;
        if (el.id) queue.push(el.id);
      }
    }
    return false;
  }

  /**
   * Nom compté, accordé au nombre (`count-label`, sinon « résultat »).
   * Grammaire partagée avec `display` et `list` depuis #925 : une seule
   * implémentation, `utils/count-label.ts`.
   */
  private _countNoun(n: number): string {
    return countNoun(this.countLabel, n);
  }
  render() {
    if (this._configError) {
      return html`
        <div class="fr-alert fr-alert--warning fr-alert--sm" role="alert">
          <p>
            <strong>&lt;dsfr-data-search&gt;</strong> : ${this._configError}. Le composant ne peut
            pas s'initialiser.
          </p>
        </div>
      `;
    }

    const id = this.id || 'search';
    // fr-sr-only : la classe sr-only n'existe pas en DSFR — l'attribut
    // sr-label etait sans effet (#312)
    const labelClass = this.srLabel ? 'fr-label fr-sr-only' : 'fr-label';
    // Source en panne (#1288) : champ et bouton désactivés, la phrase en
    // dessous est leur raison. Lecture seule plutôt que `disabled` : le champ
    // garde le focus qu'il portait, et le terme saisi reste lisible.
    const unavailable = this._unavailable();
    const reasonId = `dsfr-data-search-${id}-unavailable`;

    return html`
      <div
        class="fr-search-bar${unavailable ? ' dsfr-data-search--unavailable' : ''}"
        role="search"
        aria-label="${this.getAttribute('aria-label') || this.label}"
      >
        <label class="${labelClass}" for="dsfr-data-search-${id}">${this.label}</label>
        <input
          class="fr-input"
          type="search"
          id="dsfr-data-search-${id}"
          placeholder="${this.placeholder}"
          autocomplete="off"
          ?readonly="${!!unavailable}"
          aria-disabled="${unavailable ? 'true' : nothing}"
          aria-describedby="${unavailable ? reasonId : nothing}"
          .value="${this._term}"
          @input="${(e: Event) => this._onInput((e.target as HTMLInputElement).value)}"
          @search="${(e: Event) => {
            if (this._unavailable()) return;
            this._term = (e.target as HTMLInputElement).value;
            this._onSubmit();
          }}"
          @keydown="${(e: KeyboardEvent) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              this._onSubmit();
            }
            if (e.key === 'Escape') {
              this.clear();
            }
          }}"
        />
        <button
          class="fr-btn"
          title="Rechercher"
          type="button"
          aria-disabled="${unavailable ? 'true' : nothing}"
          aria-describedby="${unavailable ? reasonId : nothing}"
          @click="${(e: Event) => {
            e.preventDefault();
            this._onSubmit();
          }}"
        >
          Rechercher
        </button>
      </div>
      ${
        unavailable
          ? html`
              ${renderFiltersUnavailable(reasonId, unavailable)}
              <style>
                .dsfr-data-search--unavailable .fr-input,
                .dsfr-data-search--unavailable .fr-btn {
                  opacity: 0.5;
                  cursor: not-allowed;
                }
              </style>
            `
          : this._renderCount()
      }
    `;
  }

  /**
   * Compteur de résultats. Une seule region live par chaîne (#654) : si un
   * afficheur aval (list, display) annonce déjà son compte, ce composant
   * n'annonce rien — le compteur visible de `count` est conserve, mais
   * sans `aria-live`, et le compteur sr-only n'est pas rendu.
   */
  private _renderCount() {
    // Attente d'un filtre amont (#728) : aucune requête n'a été faite, aucun
    // compte n'a de sens — pas même le compteur sr-only, qui annoncerait
    // « 0 résultats » au lecteur d'écran sur une page qui n'a rien demandé.
    if (this._transformerIdle) {
      if (!this.count) return nothing;
      return html`
        ${renderSourceIdle('dsfr-data-search', this.idleMessage)}
        <style>
          .dsfr-data-search__idle {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-top: 0.25rem;
            color: var(--text-mention-grey, #666);
            font-size: 0.875rem;
          }
        </style>
      `;
    }

    const label = `${formatNumber(this._resultCount)} ${this._countNoun(this._resultCount)}`;
    const deferToDownstream = this._hasDownstreamLiveRegion();

    if (this.count) {
      return deferToDownstream
        ? html`<p class="fr-text--sm fr-mt-1v dsfr-data-search-count">${label}</p>`
        : html`
            <p
              class="fr-text--sm fr-mt-1v dsfr-data-search-count"
              aria-live="polite"
              aria-atomic="true"
              role="status"
            >
              ${label}
            </p>
          `;
    }

    return deferToDownstream
      ? nothing
      : html`
          <p class="fr-sr-only" aria-live="polite" aria-atomic="true" role="status">${label}</p>
        `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-search': DsfrDataSearch;
  }
}

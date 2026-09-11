import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { escapeHtml, formatNumber } from '@dsfr-data/shared/lib';
import type { ContextFilterLike } from '@dsfr-data/shared/lib';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { escapeColonValue } from '../utils/where.js';
import { dispatchSourceCommand, getDataMeta } from '../utils/data-bridge.js';
import { TransformerMixin } from '../utils/transformer-mixin.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import { renderSourceIdle, IDLE_MESSAGE_DEFAULT } from '../utils/status-templates.js';
import type { SourceElement } from '../utils/source-element.js';
import { CONTEXT_CONNECTED_EVENT, findContextById } from './dsfr-data-context.js';
import type { DsfrDataContext } from './dsfr-data-context.js';

type SearchOperator = 'contains' | 'starts' | 'words';

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
 * La recherche vue par le contexte (#678, ADR-104) : UN filtre `contains`
 * sur le champ unique de `fields`. Le contexte diffuse a ses cibles (au
 * dialecte de chacune : `like "%q%"` en ODSQL), porte l'URL et le tag.
 */
class SearchContextFilter implements ContextFilterLike {
  readonly applyTo = '*';
  readonly operator = 'contains';

  constructor(private readonly host: DsfrDataSearch) {}

  get field(): string {
    return this.host._contextField();
  }

  get isConnected(): boolean {
    return this.host.isConnected;
  }

  buildColonWhere(): string {
    const term = this.host._effectiveTerm();
    if (!term || !this.field) return '';
    return `${this.field}:contains:${escapeColonValue(term)}`;
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

  urlValue(): string {
    return this.host._effectiveTerm();
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
 * En mode `context="id"` (#678, ADR-104), la recherche devient un filtre
 * `contains` de <dsfr-data-context> sur le champ unique de `fields` : le
 * contexte diffuse a toutes ses sources cibles, porte l'URL (paramètre nomme
 * d'après le champ) et le tag. Elle n'emet plus de commande directe.
 *
 * @fires dsfr-data-search-change - `{ query, count }` sur l'élément — la saisie de recherche a change (pour synchroniser une UI de page).
 * @fires dsfr-data-source-command - `{ sourceId, where, whereKey, origin }` sur `document` — recherche relayee en filtre serveur vers la source amont (hors mode `context`, ou c'est le contexte qui diffuse). `origin` porte l'id de ce composant (#603).
 */
@customElement('dsfr-data-search')
export class DsfrDataSearch extends TransformerMixin(LitElement) {
  /** ID de la source de données a ecouter */
  @property({ type: String })
  source = '';

  /** Champs sur lesquels rechercher (virgule-séparés). Vide = tous les champs */
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

  /** Ajoute un champ _highlight a chaque record avec les termes trouves marques en <mark> */
  @property({ type: Boolean })
  highlight = false;

  /** Mode de recherche : contains, starts, words */
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
   * {q} est remplace par le terme de recherche.
   * Si vide et server-search active, lu depuis l'adapter de la source amont.
   * Ex ODS: 'search("{q}")', custom: '{q} IN nom'
   */
  @property({ type: String, attribute: 'search-template' })
  searchTemplate = '';

  /**
   * Id du dsfr-data-context auquel s'enregistrer (#678, ADR-104) : la
   * recherche devient un filtre `contains` du contexte sur le champ UNIQUE
   * de `fields` (la clause colon ne sait pas dire « ou » entre plusieurs
   * champs). Le contexte diffuse à ses cibles et porte l'URL (`url-sync`
   * et `url-search-param` sont ignorés — le paramètre est nommé d'après le
   * champ, ou via `url-param-map` du contexte). Le contexte peut être
   * déclaré après la recherche dans la page. Vide = comportement autonome.
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

  /** Contexte resolu (mode `context`, #678) */
  private _context: DsfrDataContext | null = null;

  /** Le filtre unique enregistre aupres du contexte (#678) */
  private _contextFilter: SearchContextFilter | null = null;

  /** Dernière clause confiee au contexte — une donnee qui arrive ne re-diffuse pas un terme inchange */
  private _lastPushedWhere: string | null = null;

  /** Un contexte vise par id vient d'être connecte : (re)bind si c'est le notre (#678) */
  private _onContextConnected = (e: Event) => {
    const id = (e as CustomEvent<{ id: string | null }>).detail?.id;
    if (this.context && id === this.context) this._bindContext();
  };

  /** Mode `context` demande (que le contexte soit déjà resolu ou non) */
  private get _contextMode(): boolean {
    return this.context.trim() !== '';
  }

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

  /**
   * Retourne les paramètres adapter résolus de la source amont
   * (délégation transparente, headers api-key-ref inclus — #274).
   */
  public getAdapterParams(): import('../adapters/api-adapter.js').AdapterParams | null {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getAdapterParams' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getAdapterParams?.() ?? null;
      }
    }
    return null;
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-search');
    if (this._contextMode) {
      document.addEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
      // Bind differe d'un tick : dans un meme fragment innerHTML, le contexte
      // declare apres la recherche n'est pas encore upgrade
      queueMicrotask(() => this._bindContext());
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    document.removeEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
    this._unbindContext();
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

  /** Paramètres de recherche → re-filtrage local (#281) */
  protected transformerReprocessProps(): string[] {
    return ['fields', 'operator', 'minLength', 'highlight'];
  }

  // --- Mode context (#678, ADR-104) ---

  /**
   * Resout le contexte vise par `context="id"` et y enregistre le filtre.
   * Le contexte peut arriver plus tard (déclaré après dans la page) :
   * l'erreur de config est posee en attendant et levee a sa connexion.
   */
  private _bindContext(): void {
    if (!this.isConnected || !this._contextMode) return;
    const context = findContextById(this.context);
    if (context && context === this._context) return;
    this._unbindContext();
    if (!context) {
      reportConfigError(
        this,
        'dsfr-data-search',
        `dsfr-data-context introuvable : "${this.context}"`
      );
      return;
    }
    if (!this._contextField()) {
      reportConfigError(
        this,
        'dsfr-data-search',
        'en mode context, "fields" doit nommer un seul champ (filtre contains du contexte)'
      );
      return;
    }
    clearConfigError(this);
    this._context = context;
    this._contextFilter = new SearchContextFilter(this);
    context._registerFilter(this._contextFilter);

    // Terme initial depuis l'URL du contexte (#231, ADR-031) : il remplit le
    // champ et repasse par le MEME chemin qu'une frappe
    const urlValues = context._urlValuesFor(this._contextFilter.field);
    if (urlValues && urlValues.length > 0) {
      this._term = urlValues.join(',');
    }
    this._applyFilter();
  }

  /** Libere le filtre aupres du contexte (disconnect, changement de contexte) */
  private _unbindContext(): void {
    if (this._context && this._contextFilter) {
      this._context._unregisterFilter(this._contextFilter);
    }
    this._context = null;
    this._contextFilter = null;
    this._lastPushedWhere = null;
  }

  /**
   * Confie le terme courant au contexte, qui diffuse (#678). Deduplique :
   * _applyFilter est aussi appele a chaque arrivee de données, et une source
   * cible re-emet après chaque commande — sans ce garde, boucle.
   */
  private _pushContextFilter(): void {
    if (!this._context || !this._contextFilter) return;
    const where = this._contextFilter.buildColonWhere();
    if (where === (this._lastPushedWhere ?? '')) return;
    this._lastPushedWhere = where;
    this._context._applyFilter(this._contextFilter, where);
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

  /** Retourne les données actuellement filtrees */
  getData(): Record<string, unknown>[] {
    return this._filteredData;
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
      if (adapter?.getDefaultSearchTemplate) {
        this.searchTemplate = adapter.getDefaultSearchTemplate() || '';
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
   * par le serveur, total valide). En filtre client le nombre de lignes
   * change : pas de meta (#282).
   */
  protected transformMeta(meta: import('../utils/data-bridge.js').PaginationMeta) {
    return this.serverSearch ? meta : null;
  }

  private _onData(data: unknown) {
    const rows = Array.isArray(data) ? data : [];

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
    // plus sa source. En server-search elle laisse passer les donnees ; en
    // local elle continue de filtrer son aval (inchange)
    if (this._contextMode) {
      this._pushContextFilter();
      if (this.serverSearch) {
        this._emitSearchChange(this._resultCount);
        return;
      }
    } else if (this.serverSearch && this.source) {
      // Server-search mode: delegate to upstream source via command
      this._applyServerSearch();
      return;
    }

    const term = this._term;

    if (!term || term.length < this.minLength) {
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

    this._resultCount = this._filteredData.length;
    this._dispatch();
  }

  /**
   * Server-search: envoie une commande { where } au source upstream
   * au lieu de filtrer localement.
   */
  private _applyServerSearch() {
    const term = this._term;
    let where = '';

    if (term && term.length >= this.minLength) {
      // Echappement selon le dialecte du provider (#271) : ODSQL echappe
      // \ et " (valeur entre guillemets), colon percent-encode , : |
      // (caracteres structurels de la clause)
      const format = this.getAdapter()?.capabilities?.whereFormat ?? 'odsql';
      const escaped =
        format === 'colon'
          ? escapeColonValue(term)
          : term.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      where = this.searchTemplate.replace(/\{q\}/g, escaped);
    }

    // Dispatch command to upstream source (dsfr-data-query server-side)
    dispatchSourceCommand(this.source, { where, whereKey: this.id, origin: this.id });

    // Sync URL if enabled
    if (this._ownUrlSync) {
      this._syncUrl();
    }

    this._emitSearchChange(this._resultCount);
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

  _matchRecord(
    record: Record<string, unknown>,
    normTerm: string,
    fields: string[],
    operator: SearchOperator
  ): boolean {
    const searchFields =
      fields.length > 0 ? fields : Object.keys(record).filter((k) => !k.startsWith('_'));

    switch (operator) {
      case 'starts':
        return searchFields.some((f) => {
          const words = this._normalize(String(record[f] ?? '')).split(/\s+/);
          return words.some((w) => w.startsWith(normTerm));
        });

      case 'words': {
        const queryWords = normTerm.split(/\s+/).filter(Boolean);
        return queryWords.every((qw) =>
          searchFields.some((f) => this._normalize(String(record[f] ?? '')).includes(qw))
        );
      }

      case 'contains':
      default:
        return searchFields.some((f) =>
          this._normalize(String(record[f] ?? '')).includes(normTerm)
        );
    }
  }

  _normalize(str: string): string {
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
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

  private _onInput(value: string) {
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

    this._emitSearchChange(this._filteredData.length);
  }

  /**
   * Sync current search term back to URL (replaceState). Construite par
   * l'API URL (#683) : concatener pathname produisait, sur une page servie
   * sous `//chemin`, une URL relative au schema (autre hote) et replaceState
   * levait SecurityError — sync perdue en silence.
   */
  private _syncUrl() {
    const url = new URL(window.location.href);
    if (this._term) {
      url.searchParams.set(this.urlSearchParam, this._term);
    } else {
      url.searchParams.delete(this.urlSearchParam);
    }
    window.history.replaceState(null, '', url.href);
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

  /** Nom compté, accordé au nombre (`count-label`, sinon « résultat »). */
  private _countNoun(n: number): string {
    const [singular, plural] = (this.countLabel.trim() || 'résultat')
      .split('|')
      .map((form) => form.trim());
    if (n === 1) return singular;
    return plural || `${singular}s`;
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

    return html`
      <div
        class="fr-search-bar"
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
          .value="${this._term}"
          @input="${(e: Event) => this._onInput((e.target as HTMLInputElement).value)}"
          @search="${(e: Event) => {
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
          @click="${(e: Event) => {
            e.preventDefault();
            this._onSubmit();
          }}"
        >
          Rechercher
        </button>
      </div>
      ${this._renderCount()}
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

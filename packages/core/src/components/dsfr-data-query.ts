import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getByPath, setByPath } from '../utils/json-path.js';
import { toNumber } from '@dsfr-data/shared/lib';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { dispatchSourceCommand, getDataCache, getDataMeta } from '../utils/data-bridge.js';
import { TransformerMixin } from '../utils/transformer-mixin.js';
import type { AdapterCapabilities } from '../adapters/api-adapter.js';
import type { SourceElement } from '../utils/source-element.js';
import { parseAggregates, type ParsedAggregate } from '../utils/aggregates.js';
import { unescapeColonValue, filterToOdsql, parseOrderBy } from '../utils/where.js';
import { reportConfigError } from '../utils/config-error.js';

/**
 * Operateurs de filtre supportes
 */
export const FILTER_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'notcontains',
  'in',
  'notin',
  'isnull',
  'isnotnull',
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/**
 * Fonctions d'agrégation supportees
 */
export type AggregateFunction = 'count' | 'sum' | 'avg' | 'min' | 'max';

/**
 * Structure d'un filtre
 */
export interface QueryFilter {
  field: string;
  operator: FilterOperator;
  value?: string | number | boolean | (string | number)[];
}

/**
 * Structure d'une agrégation
 */
export interface QueryAggregate {
  field: string;
  function: AggregateFunction;
  alias?: string;
}

/**
 * Structure du tri
 */
export interface QuerySort {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * <dsfr-data-query> - Composant de transformation de données
 *
 * Transforme, filtre, agrégé et trie des données provenant d'une source
 * (dsfr-data-source ou dsfr-data-normalize).
 *
 * Ne fait aucun fetch HTTP : les données sont recues d'un composant amont
 * (dsfr-data-source ou dsfr-data-normalize) via le data-bridge.
 *
 * **Negotiation server-side** : a l'initialisation, dsfr-data-query interroge les
 * capabilities de l'adapter (via dsfr-data-source.getAdapter()) et delegue
 * automatiquement les operations (group-by, aggregate, order-by) au serveur
 * quand l'adapter le supporte. Si l'adapter ne supporte pas l'operation,
 * ou si dsfr-data-source a déjà ses propres attributs, dsfr-data-query fait le
 * traitement client-side en fallback.
 *
 * Si l'adapter signale needsClientProcessing=true (ex: Grist SQL indisponible),
 * dsfr-data-query reprend le traitement client-side même pour les operations
 * initialement deleguees.
 *
 * @example Server-side automatique (ODS supporte group-by server-side)
 * <dsfr-data-source id="src" api-type="opendatasoft"
 *   base-url="https://data.opendatasoft.com" dataset-id="communes-france">
 * </dsfr-data-source>
 * <dsfr-data-query id="stats" source="src"
 *   group-by="region" aggregate="population:sum:total_pop"
 *   order-by="total_pop:desc" limit="10">
 * </dsfr-data-query>
 *
 * @example Client-side (source generique sans adapter)
 * <dsfr-data-query
 *   id="stats"
 *   source="raw-data"
 *   group-by="region"
 *   aggregate="population:sum, count:count"
 *   order-by="population__sum:desc"
 *   limit="10">
 * </dsfr-data-query>
 */
@customElement('dsfr-data-query')
export class DsfrDataQuery extends TransformerMixin(LitElement) {
  /**
   * ID de la source de données (dsfr-data-source ou dsfr-data-normalize)
   */
  @property({ type: String })
  source = '';

  /**
   * Clause WHERE / Filtres — syntaxe colon UNIQUEMENT :
   * "champ:operateur:valeur, champ2:operateur:valeur2"
   * (operateurs : eq, neq, gt, gte, lt, lte, contains, notcontains, in,
   * notin, isnull, isnotnull — multi-valeurs separees par |).
   *
   * La syntaxe ODSQL n'est PAS supportee ici (elle l'est sur le `where` de
   * dsfr-data-source) : une clause non parsable est signalee via
   * reportConfigError (#277). En delegation serveur, la clause est traduite
   * au dialecte de l'adapter (#275).
   */
  @property({ type: String })
  where = '';

  /**
   * Alias pour where (compatibilite)
   */
  @property({ type: String })
  filter = '';

  /**
   * Champs de regroupement (separes par virgule)
   */
  @property({ type: String, attribute: 'group-by' })
  groupBy = '';

  /**
   * Agrégations pour mode generic/tabular
   * Format: "field:function, field2:function"
   * Ex: "population:sum, count:count"
   */
  @property({ type: String })
  aggregate = '';

  /**
   * Tri des resultats
   * Format: "field:direction" ou "field__function:direction"
   * Ex: "total_pop:desc" ou "population__sum:desc"
   */
  @property({ type: String, attribute: 'order-by' })
  orderBy = '';

  /**
   * Limite de resultats
   */
  @property({ type: Number })
  limit = 0;

  @state()
  private _data: unknown[] = [];

  @state()
  private _rawData: unknown[] = [];

  /**
   * Tracks which operations have been delegated to dsfr-data-source server-side.
   * When needsClientProcessing comes back true, we fall back to client-side.
   */
  private _serverDelegated = {
    groupBy: false,
    aggregate: false,
    orderBy: false,
    where: false,
  };

  /** Source qui detient actuellement nos overlays de delegation (#276) */
  private _delegatedSourceId: string | null = null;

  /**
   * Derniere commande de delegation dispatchee (cible + contenu) : une
   * re-negociation identique ne redispatche pas — la source est deja dans
   * cet etat, son cache est valide (#276).
   */
  private _lastDelegation: { sourceId: string; cmdJson: string } | null = null;

  /**
   * False entre l'envoi d'une commande a la source et l'emission suivante :
   * le cache de la source est alors perime (pre-commande) et ne doit pas
   * etre lu. Une re-negociation dedupliquee ne le repasse pas a false.
   */
  private _sourceEmittedSinceCommand = true;

  // Pas de rendu - composant invisible
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  render() {
    return html``;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-query');
    this._warnRemovedAttributes();
  }

  /**
   * Attributs supprimes (#277, #279) : transform/server-side/page-size
   * etaient declares mais jamais lus (no-ops), refresh appartient a la
   * source. Previent les integrateurs qui les utilisaient encore.
   */
  private _warnRemovedAttributes() {
    const removed: Array<[string, string]> = [
      [
        'transform',
        'dsfr-data-query recoit un tableau via le data-bridge — utilisez l\'attribut "transform" de dsfr-data-source',
      ],
      [
        'server-side',
        'le relais de commandes (page, where, orderBy) vers la source est toujours actif',
      ],
      ['page-size', 'la taille de page se configure sur dsfr-data-source (attribut "page-size")'],
      [
        'refresh',
        'le rafraichissement periodique se configure sur dsfr-data-source (attribut "refresh") — la source refetche et le pipeline suit (#279)',
      ],
    ];
    for (const [attr, hint] of removed) {
      if (this.hasAttribute(attr)) {
        console.warn(
          `dsfr-data-query[${this.id}]: l'attribut "${attr}" a été retiré (il était sans effet) — ${hint}`
        );
      }
    }
  }

  disconnectedCallback() {
    // Clear server-side overlays on dsfr-data-source before cleanup
    this._clearServerDelegation();
    super.disconnectedCallback();
  }

  /** Alias historique de reinitTransformer() — conserve pour les tests */
  _initialize() {
    this.reinitTransformer();
  }

  // --- Hooks TransformerMixin (#280) ---

  protected transformerName(): string {
    return 'dsfr-data-query';
  }

  /** Tout changement de prop de requete re-negocie et re-souscrit (#281) */
  protected transformerReinitProps(): string[] {
    return ['source', 'where', 'filter', 'groupBy', 'aggregate', 'orderBy', 'limit'];
  }

  protected validateTransformerConfig(): string | null {
    if (!this.id) return 'attribut "id" requis pour identifier la requête';
    if (!this.source) return 'attribut "source" requis';
    return null;
  }

  protected beforeTransformerSubscribe(): void {
    // Un where non parsable etait silencieusement ignore (toutes les lignes
    // passent) — le signaler immediatement (#277). Le traitement continue en
    // mode degrade : les clauses valides s'appliquent, l'erreur est visible
    // en console et via data-dsfr-config-error.
    const filterExpr = this.filter || this.where;
    if (filterExpr) {
      const whereError = this._validateFilterExpr(filterExpr);
      if (whereError) {
        reportConfigError(this, `dsfr-data-query[${this.id}]`, whereError);
      }
    }

    // Negotiate server-side delegation BEFORE subscribing to data.
    // This sends commands to dsfr-data-source so it re-fetches with the right params.
    this._negotiateServerSide();
  }

  /**
   * Le cache de la source est perime entre une commande envoyee et
   * l'emission suivante (#276) — ne pas le lire dans cet intervalle.
   */
  protected shouldReadInitialCache(): boolean {
    return this._sourceEmittedSinceCommand;
  }

  protected onTransformerData(data: unknown): void {
    this._sourceEmittedSinceCommand = true;
    this._rawData = Array.isArray(data) ? data : [data];
    this._handleSourceData();
  }

  // --- Server-side negotiation ---

  /**
   * Check upstream adapter capabilities and delegate operations server-side
   * when possible. Sends commands to dsfr-data-source with groupBy/aggregate/orderBy
   * so the adapter handles them in the API request.
   *
   * Falls back to client-side for operations the adapter can't handle,
   * or when dsfr-data-source already has its own groupBy/aggregate attributes.
   */
  private _negotiateServerSide() {
    const prev = this._serverDelegated;
    const prevSourceId = this._delegatedSourceId;

    // Reset delegation state
    this._serverDelegated = { groupBy: false, aggregate: false, orderBy: false, where: false };

    // Cleanup adresse a l'ANCIENNE source quand la cible a change (#276) —
    // sinon elle garderait indefiniment nos overlays (donnees agregees
    // servies a ses autres abonnes).
    if (prevSourceId && prevSourceId !== this.source) {
      this._sendDelegationClears(prevSourceId, prev);
    }

    const cmd: Record<string, string> = {};

    const rawEl = document.getElementById(this.source);
    const sourceEl = rawEl && 'getAdapter' in rawEl ? (rawEl as unknown as SourceElement) : null;
    const adapter = sourceEl?.getAdapter?.();
    const caps: AdapterCapabilities | undefined = adapter?.capabilities;

    if (sourceEl && adapter && caps) {
      // Don't override if dsfr-data-source already has its own groupBy/aggregate
      // (user explicitly configured them on the source — respect that)
      const sourceGroupBy = sourceEl.groupBy || '';
      const sourceAggregate = sourceEl.aggregate || '';

      // Certains adapters (Tabular) ne peuvent pas deleguer des champs dont le nom
      // contient des espaces/ponctuation (syntaxe a suffixe `colonne__op`). On les
      // interroge avant de deleguer ; sinon on retombe sur le client-side.
      const canDelegateFields = (fields: string[]): boolean => {
        const clean = fields.map((f) => f.trim()).filter(Boolean);
        return adapter.supportsServerFields?.(clean) !== false;
      };

      // Delegate group-by + aggregate together (they're coupled).
      // Don't override if source already has its own groupBy or aggregate.
      if (this.groupBy && caps.serverGroupBy && !sourceGroupBy && !sourceAggregate) {
        // Le where conditionne la délégation du group-by (#275) : un filtre
        // intraduisible doit s'appliquer client-side sur les lignes BRUTES,
        // donc avant un group-by qui reste alors client-side lui aussi.
        // Sans cela, le filtre serait ré-appliqué sur les lignes agrégées où
        // les champs bruts n'existent plus → toutes les lignes éliminées.
        const whereDelegation = this._buildWhereDelegation(
          this.filter || this.where,
          caps.whereFormat
        );
        const fields = [
          ...this.groupBy.split(','),
          ...this._parseAggregates(this.aggregate).map((a) => a.field),
          ...whereDelegation.fields,
        ];
        if (whereDelegation.ok && canDelegateFields(fields)) {
          cmd.groupBy = this.groupBy;
          this._serverDelegated.groupBy = true;

          if (this.aggregate) {
            cmd.aggregate = this.aggregate;
            this._serverDelegated.aggregate = true;
          }

          if (whereDelegation.where) {
            cmd.where = whereDelegation.where;
            cmd.whereKey = this._whereOverlayKey();
            this._serverDelegated.where = true;
          }
        }
      }

      // Delegate order-by
      const sourceOrderBy = sourceEl.orderBy || '';
      if (this.orderBy && caps.serverOrderBy && !sourceOrderBy) {
        const orderField = this.orderBy.split(':')[0] || '';
        if (canDelegateFields([orderField])) {
          cmd.orderBy = this.orderBy;
          this._serverDelegated.orderBy = true;
        }
      }
    }

    // Diff same-source : liberer les operations qui ne sont plus deleguees
    // (retrait de group-by, where disparu…) — envoye dans la MEME commande
    // que les nouvelles delegations pour un seul refetch (#276).
    if (prevSourceId && prevSourceId === this.source) {
      if (prev.groupBy && !this._serverDelegated.groupBy) cmd.groupBy = '';
      if (prev.aggregate && !this._serverDelegated.aggregate) cmd.aggregate = '';
      if (prev.orderBy && !this._serverDelegated.orderBy) cmd.orderBy = '';
      if (prev.where && !this._serverDelegated.where) {
        cmd.where = '';
        cmd.whereKey = this._whereOverlayKey();
      }
    }

    this._delegatedSourceId = this._hasServerDelegation() ? this.source : null;

    if (Object.keys(cmd).length === 0) {
      this._lastDelegation = null;
      return;
    }

    // Dedup cote query (#276) : commande identique a la derniere envoyee a
    // la meme cible → la source est deja dans cet etat, son cache est
    // valide. Redispatchcer ferait sauter le cache a _subscribeToSourceData
    // en attendant une emission que la source (qui deduplique aussi) ne
    // renverrait qu'en async — gel evitable.
    const cmdJson = JSON.stringify(cmd);
    if (
      this._lastDelegation?.sourceId === this.source &&
      this._lastDelegation.cmdJson === cmdJson
    ) {
      return;
    }

    this._lastDelegation = { sourceId: this.source, cmdJson };
    this._sourceEmittedSinceCommand = false;
    dispatchSourceCommand(this.source, cmd);
  }

  /**
   * Envoie les commandes de liberation des operations deleguees a une
   * source donnee (valeurs vides → la source revert a ses propres attributs).
   */
  private _sendDelegationClears(
    targetId: string,
    delegated: { groupBy: boolean; aggregate: boolean; orderBy: boolean; where: boolean }
  ) {
    const cmd: Record<string, string> = {};
    if (delegated.groupBy) cmd.groupBy = '';
    if (delegated.aggregate) cmd.aggregate = '';
    if (delegated.orderBy) cmd.orderBy = '';
    if (delegated.where) {
      cmd.where = '';
      cmd.whereKey = this._whereOverlayKey();
    }
    if (Object.keys(cmd).length > 0) {
      dispatchSourceCommand(targetId, cmd);
    }
  }

  /**
   * Clé du where overlay de cette query sur dsfr-data-source : permet le
   * merge avec les overlays des autres composants (facets, search, bbox).
   */
  private _whereOverlayKey(): string {
    return `query-${this.id}`;
  }

  /**
   * Valide la grammaire colon du where (#277). Retourne un message d'erreur
   * lisible (destine a reportConfigError), ou null si toutes les clauses
   * sont parsables.
   */
  private _validateFilterExpr(filterExpr: string): string | null {
    const parts = filterExpr
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    for (const part of parts) {
      const segments = part.split(':');
      if (segments.length < 2) {
        return (
          `clause where non reconnue "${part}" — syntaxe attendue "champ:operateur[:valeur]" ` +
          `(la syntaxe ODSQL n'est pas supportee par dsfr-data-query ; utilisez-la sur le where de dsfr-data-source)`
        );
      }
      const operator = segments[1] as FilterOperator;
      if (!FILTER_OPERATORS.includes(operator)) {
        return (
          `operateur inconnu "${operator}" dans la clause where "${part}" — ` +
          `operateurs supportes : ${FILTER_OPERATORS.join(', ')}`
        );
      }
      if (segments.length < 3 && operator !== 'isnull' && operator !== 'isnotnull') {
        return `valeur manquante dans la clause where "${part}" (seuls isnull/isnotnull s'utilisent sans valeur)`;
      }
    }
    return null;
  }

  /**
   * Prépare la délégation serveur du where (#275) : valide que chaque clause
   * est exprimable dans la grammaire colon (`field:op[:value]`) puis la
   * traduit au dialecte de l'adapter (ODSQL ou colon pass-through).
   *
   * Retourne ok=false si une clause est intraduisible (syntaxe non-colon,
   * opérateur inconnu) — l'appelant ne délègue alors RIEN.
   */
  private _buildWhereDelegation(
    filterExpr: string,
    format: AdapterCapabilities['whereFormat']
  ): { ok: boolean; where: string; fields: string[] } {
    if (!filterExpr) return { ok: true, where: '', fields: [] };

    // Meme grammaire que la validation #277 : une clause non parsable rend
    // le where intraduisible → aucune delegation.
    if (this._validateFilterExpr(filterExpr) !== null) {
      return { ok: false, where: '', fields: [] };
    }

    const fields = filterExpr
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((part) => part.split(':')[0]);

    const where = format === 'odsql' ? filterToOdsql(filterExpr) : filterExpr;
    return { ok: true, where, fields };
  }

  /**
   * Clear server-side overlays on dsfr-data-source (disconnect cleanup).
   * Sends empty values so dsfr-data-source reverts to its own attributes.
   * Adresse a la source reellement deleguee (#276) — pas a `this.source`,
   * qui peut avoir change entre-temps.
   */
  private _clearServerDelegation() {
    if (this._delegatedSourceId && this._hasServerDelegation()) {
      this._sendDelegationClears(this._delegatedSourceId, this._serverDelegated);
    }
    this._serverDelegated = { groupBy: false, aggregate: false, orderBy: false, where: false };
    this._delegatedSourceId = null;
    this._lastDelegation = null;
  }

  /**
   * Returns true if we delegated any operation server-side.
   */
  private _hasServerDelegation(): boolean {
    return (
      this._serverDelegated.groupBy ||
      this._serverDelegated.aggregate ||
      this._serverDelegated.orderBy ||
      this._serverDelegated.where
    );
  }

  /**
   * Handle data received from upstream source (via onTransformerData).
   */
  private _handleSourceData() {
    try {
      this.emitTransformerLoading();
      this._processClientSide();
    } catch (error) {
      this.emitTransformerError(error as Error);
      console.error(`dsfr-data-query[${this.id}]: Erreur de traitement`, error);
    }
  }

  // --- Client-side processing ---

  /**
   * Traitement des données : applique client-side uniquement les operations
   * qui n'ont pas ete delegues server-side.
   *
   * Si needsClientProcessing est true dans la meta de la source,
   * ca signifie que l'adapter n'a pas pu traiter server-side (ex: Grist SQL
   * indisponible) — on fait le fallback client-side.
   */
  private _processClientSide() {
    let result = [...this._rawData] as Record<string, unknown>[];

    // Check if the adapter flagged that client processing is needed
    // (server-side delegation failed, e.g. Grist SQL endpoint unavailable)
    const meta = getDataMeta(this.source);
    const forceClientSide = meta?.needsClientProcessing === true;

    // 1. Appliquer les filtres
    // Skip si le where est delegue server-side (#275) : apres agregation
    // serveur les champs bruts n'existent plus, re-filtrer eliminerait
    // toutes les lignes. Fallback client si needsClientProcessing (les
    // lignes recues sont alors brutes).
    const filterExpr = this.filter || this.where;
    const needsClientFilter = filterExpr && (!this._serverDelegated.where || forceClientSide);
    if (needsClientFilter) {
      result = this._applyFilters(result, filterExpr);
    }

    // 2. Appliquer le groupement et les agrégations
    // Skip si delegue server-side, SAUF si needsClientProcessing (fallback)
    const needsClientGroupBy = this.groupBy && (!this._serverDelegated.groupBy || forceClientSide);
    if (needsClientGroupBy) {
      result = this._applyGroupByAndAggregate(result);
    } else if (!this.groupBy && this.aggregate) {
      // Agregat global (#278) : aggregate sans group-by produit UNE ligne
      // (la grammaire etait acceptee mais no-op silencieux). Cas d'usage
      // typique : alimenter un dsfr-data-kpi (total, moyenne...).
      result = [this._computeGlobalAggregates(result)];
    }

    // 3. Appliquer le tri
    // Skip si delegue server-side, SAUF si needsClientProcessing (fallback)
    const needsClientSort = this.orderBy && (!this._serverDelegated.orderBy || forceClientSide);
    if (needsClientSort) {
      result = this._applySort(result);
    }

    // 4. Appliquer la limite (toujours client-side)
    if (this.limit > 0) {
      result = result.slice(0, this.limit);
    }

    this._data = result;

    // Emission via le mixin : la meta de pagination amont est propagee et
    // posee AVANT le dispatch (#282) pour les composants aval
    // (dsfr-data-facets, dsfr-data-search, dsfr-data-list).
    this.emitTransformedData(this._data);
  }

  /**
   * Parse et applique les filtres (format: "field:operator:value")
   */
  private _applyFilters(
    data: Record<string, unknown>[],
    filterExpr: string
  ): Record<string, unknown>[] {
    const filters = this._parseFilters(filterExpr);

    return data.filter((item) => {
      return filters.every((filter) => this._matchesFilter(item, filter));
    });
  }

  private _parseFilters(filterExpr: string): QueryFilter[] {
    const filters: QueryFilter[] = [];
    const parts = filterExpr
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    for (const part of parts) {
      const segments = part.split(':');
      if (segments.length >= 2) {
        const field = segments[0];
        const operator = segments[1] as FilterOperator;
        let value: string | number | boolean | (string | number)[] | undefined;

        if (segments.length > 2) {
          const rawValue = segments.slice(2).join(':');

          // Parse la valeur (percent-decodee : , : | structurels echappes
          // par buildColonFacetWhere, #271)
          if (operator === 'in' || operator === 'notin') {
            value = rawValue.split('|').map((v) => {
              const parsed = this._parseValue(unescapeColonValue(v));
              // Pour in/notin, on ne garde que string/number
              return typeof parsed === 'boolean' ? String(parsed) : parsed;
            }) as (string | number)[];
          } else {
            value = this._parseValue(unescapeColonValue(rawValue));
          }
        }

        filters.push({ field, operator, value });
      }
    }

    return filters;
  }

  private _parseValue(val: string): string | number | boolean {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (!isNaN(Number(val)) && val !== '') return Number(val);
    return val;
  }

  /**
   * Egalite unique du pipeline de filtres (#278) : coercition lache
   * string/number (`"75" == 75`), repli `String === String` pour les
   * booleens (`true` vs `"true"` — le `==` JS les declare differents).
   * Utilisee par eq, neq, in, notin : meme entree, memes lignes gardees.
   */
  private _looseEquals(a: unknown, b: unknown): boolean {
    if (a === null || a === undefined) return b === null || b === undefined;
    // eslint-disable-next-line eqeqeq -- coercition lache intentionnelle
    if (a == b) return true;
    return String(a) === String(b);
  }

  /** True si la valeur est interpretable comme nombre (hors null/''). */
  private _isNumericValue(v: unknown): boolean {
    if (typeof v === 'number') return !isNaN(v);
    if (typeof v === 'string') return v.trim() !== '' && !isNaN(Number(v));
    return false;
  }

  /**
   * Comparaison pour gt/gte/lt/lte (#278). Retourne null si la valeur est
   * absente — null/undefined ne matchent JAMAIS une comparaison
   * (`Number(null) === 0` faisait passer les nulls). Numerique si les deux
   * cotes le sont, sinon repli lexicographique (dates ISO).
   */
  private _compareForRange(value: unknown, ref: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (this._isNumericValue(value) && this._isNumericValue(ref)) {
      return Number(value) - Number(ref);
    }
    return String(value).localeCompare(String(ref));
  }

  private _matchesFilter(item: Record<string, unknown>, filter: QueryFilter): boolean {
    const value = getByPath(item, filter.field);

    switch (filter.operator) {
      case 'eq':
        return this._looseEquals(value, filter.value);
      case 'neq':
        return !this._looseEquals(value, filter.value);
      case 'gt': {
        const cmp = this._compareForRange(value, filter.value);
        return cmp !== null && cmp > 0;
      }
      case 'gte': {
        const cmp = this._compareForRange(value, filter.value);
        return cmp !== null && cmp >= 0;
      }
      case 'lt': {
        const cmp = this._compareForRange(value, filter.value);
        return cmp !== null && cmp < 0;
      }
      case 'lte': {
        const cmp = this._compareForRange(value, filter.value);
        return cmp !== null && cmp <= 0;
      }
      case 'contains':
        // null ne contient rien (String(undefined)="undefined" matchait, #278)
        return (
          value !== null &&
          value !== undefined &&
          String(value).toLowerCase().includes(String(filter.value).toLowerCase())
        );
      case 'notcontains':
        return (
          value === null ||
          value === undefined ||
          !String(value).toLowerCase().includes(String(filter.value).toLowerCase())
        );
      case 'in':
        // Meme semantique lache que eq sur chaque valeur (#278) —
        // dept:in:75|13 matche "75" string comme dept:eq:75
        return (
          value !== null &&
          value !== undefined &&
          Array.isArray(filter.value) &&
          filter.value.some((v) => this._looseEquals(value, v))
        );
      case 'notin':
        return (
          value === null ||
          value === undefined ||
          !Array.isArray(filter.value) ||
          !filter.value.some((v) => this._looseEquals(value, v))
        );
      case 'isnull':
        return value === null || value === undefined;
      case 'isnotnull':
        return value !== null && value !== undefined;
      default:
        return true;
    }
  }

  /**
   * Applique le GROUP BY et les agrégations
   */
  private _applyGroupByAndAggregate(data: Record<string, unknown>[]): Record<string, unknown>[] {
    const groupFields = this.groupBy
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    const aggregates = this._parseAggregates(this.aggregate);

    // Créer les groupes
    const groups = new Map<string, Record<string, unknown>[]>();

    for (const item of data) {
      const key = groupFields.map((f) => String(getByPath(item, f) ?? '')).join('|||');
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    }

    // Calculer les agrégations pour chaque groupe
    const result: Record<string, unknown>[] = [];

    for (const [key, items] of groups) {
      const row: Record<string, unknown> = {};

      // Ajouter les champs de regroupement (structure imbriquee preservee)
      const keyParts = key.split('|||');
      groupFields.forEach((field, i) => {
        setByPath(row, field, keyParts[i]);
      });

      // Calculer les agrégations (structure imbriquee preservee)
      for (const agg of aggregates) {
        setByPath(row, agg.alias, this._computeAggregate(items, agg));
      }

      result.push(row);
    }

    return result;
  }

  /** Delegue au parseur partage (convention d'alias unique field__fn, #269) */
  _parseAggregates(aggExpr: string): ParsedAggregate[] {
    return parseAggregates(aggExpr);
  }

  /**
   * Agregat global (#278) : agrege l'ensemble des lignes (filtrees) en une
   * seule ligne, avec la meme convention d'alias field__fn que le group-by.
   */
  private _computeGlobalAggregates(data: Record<string, unknown>[]): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    for (const agg of this._parseAggregates(this.aggregate)) {
      setByPath(row, agg.alias, this._computeAggregate(data, agg));
    }
    return row;
  }

  private _computeAggregate(items: Record<string, unknown>[], agg: QueryAggregate): number {
    // toNumber strict (#301) : decimales francaises parsees, NaN exclus
    const values = items
      .map((item) => toNumber(getByPath(item, agg.field), true))
      .filter((v): v is number => v !== null);

    switch (agg.function) {
      case 'count':
        return items.length;
      case 'sum':
        return values.reduce((a, b) => a + b, 0);
      case 'avg':
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      case 'min':
        return values.length > 0 ? Math.min(...values) : 0;
      case 'max':
        return values.length > 0 ? Math.max(...values) : 0;
      default:
        return 0;
    }
  }

  /**
   * Comparateur total a 3 niveaux : null/vide < numerique < chaine (#278).
   * Transitif — l'ancien comparateur mixte (numerique si LES DEUX valeurs
   * sont numeriques, sinon string) produisait un ordre arbitraire sur les
   * colonnes mixtes, et `Number(null) === 0` classait les nulls parmi les
   * nombres.
   */
  private _compareValues(valA: unknown, valB: unknown): number {
    const rank = (v: unknown): number => {
      if (v === null || v === undefined || v === '') return 0;
      return this._isNumericValue(v) ? 1 : 2;
    };
    const rankA = rank(valA);
    const rankB = rank(valB);
    if (rankA !== rankB) return rankA - rankB;
    if (rankA === 0) return 0;
    if (rankA === 1) return Number(valA) - Number(valB);
    return String(valA).localeCompare(String(valB));
  }

  /**
   * Applique le tri — grammaire commune du pipeline `"field:dir, field2:dir"`
   * (#273), tri stable, comparateur total (#278). En desc, l'ordre est
   * exactement inverse (nulls en dernier).
   */
  private _applySort(data: Record<string, unknown>[]): Record<string, unknown>[] {
    const parts = parseOrderBy(this.orderBy);
    if (parts.length === 0) return data;

    return [...data].sort((a, b) => {
      for (const { field, direction } of parts) {
        const cmp = this._compareValues(getByPath(a, field), getByPath(b, field));
        if (cmp !== 0) return direction === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }

  // --- Public API ---

  /**
   * Retourne le where effectif complet (statique + dynamique).
   * Delegue a la source amont si disponible.
   */
  getEffectiveWhere(excludeKey?: string): string {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getEffectiveWhere' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getEffectiveWhere(excludeKey);
      }
    }
    return this.where || this.filter || '';
  }

  /**
   * Retourne l'adapter courant (delegue a la source amont)
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
   * Retourne les parametres adapter resolus de la source amont
   * (delegation transparente, headers api-key-ref inclus — #274).
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

  /**
   * Force le rechargement des données.
   *
   * Semantique de pur transformateur (#279) : delegue le refetch a la
   * source amont — meme contrat que dsfr-data-source.reload(). L'emission
   * qui suit redescend naturellement le pipeline jusqu'ici (une chaine
   * query → query → source propage le reload jusqu'a la source).
   *
   * Repli : si l'amont n'expose pas reload() (normalize/unpivot/join avant
   * EPIC C #262), retraite le cache courant (ancien comportement).
   */
  public reload() {
    if (!this.source) return;

    const upstream = document.getElementById(this.source) as
      | (HTMLElement & { reload?: () => void })
      | null;
    if (upstream && typeof upstream.reload === 'function') {
      upstream.reload();
      return;
    }

    const cachedData = getDataCache(this.source);
    if (cachedData !== undefined) {
      this._rawData = Array.isArray(cachedData) ? cachedData : [cachedData];
      this._handleSourceData();
    }
  }

  /**
   * Retourne les données actuelles
   * (isLoading() et getError() sont fournis par TransformerMixin, #280)
   */
  public getData(): unknown[] {
    return this._data;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-query': DsfrDataQuery;
  }
}

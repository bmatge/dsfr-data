import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ContextFilterLike } from '@dsfr-data/shared/lib';
import { dispatchSourceCommand } from '../utils/data-bridge.js';
import { filterToOdsql } from '../utils/where.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';

interface SourceWithAdapter extends HTMLElement {
  getAdapter?: () => { capabilities?: { whereFormat?: string } } | null;
}

let contextSeq = 0;

/** Nom de l'evenement document emis a la connexion d'un contexte (#678) */
export const CONTEXT_CONNECTED_EVENT = 'dsfr-data-context-connected';

/**
 * Resout un contexte par id — null si absent ou pas encore defini/upgrade
 * (un element non upgrade n'a pas encore `_registerFilter`). Les filtres
 * declares AVANT le contexte dans le DOM retentent a l'evenement
 * `dsfr-data-context-connected` (#678).
 */
export function findContextById(id: string): DsfrDataContext | null {
  if (!id) return null;
  const el = document.getElementById(id);
  if (!el || el.tagName.toLowerCase() !== 'dsfr-data-context') return null;
  return '_registerFilter' in el ? (el as DsfrDataContext) : null;
}

/**
 * <dsfr-data-context> — chef d'orchestre de filtres transverses (#229).
 *
 * Composant OPT-IN et additif (epic #224, ADR-031) : il tient les filtres
 * communs d'un dashboard multi-vues et les diffuse à N sources nommées —
 * le fan-out qui manquait (chaque dsfr-data-source restait un pipeline
 * isolé, un filtre commun exigeait du JS d'orchestration à la main).
 * Les pages mono-graphique ne sont PAS concernées : sans contexte, tout
 * fonctionne comme avant.
 *
 * Il ne fetch rien et ne transforme rien : il écoute ses filtres et émet
 * des commandes `where` via dispatchSourceCommand, un **whereKey stable
 * par filtre** — le merge multi-émetteurs existant côté source fait le AND
 * (ADR-031 : jamais « le dernier gagne », l'ordre des balises HTML ne
 * change rien).
 *
 * Un seul bus de diffusion (#678, ADR-104) : tout composant qui remplit le
 * contrat `ContextFilterLike` peut s'y enregistrer — les enfants
 * <dsfr-data-context-filter>, mais aussi <dsfr-data-facets context="id">
 * et <dsfr-data-search context="id">, qui vivent hors du contexte dans la
 * mise en page. Le whereKey est indexé sur `uid + champ` : stable à
 * l'insertion tardive d'un filtre, quel que soit l'ordre du DOM.
 *
 * ```html
 * <dsfr-data-context id="ctx" sources="src-a src-b" url-sync>
 *   <dsfr-data-context-filter field="categorie" operator="in" ui="select-cat">
 *   </dsfr-data-context-filter>
 * </dsfr-data-context>
 * <dsfr-data-facets context="ctx" source="src-facettes" server-facets
 *   fields="region,departement" display="region:select | departement:select">
 * </dsfr-data-facets>
 * ```
 *
 * @fires dsfr-data-context-change - sur l'element — l'etat des filtres du contexte a change (utile pour <dsfr-data-context-tags> et la synchro d'URL).
 * @fires dsfr-data-context-connected - `{ id }` sur `document` — le contexte vient d'etre connecte (#678) : les filtres declares avant lui dans le DOM (`context="id"`) s'enregistrent a ce moment.
 * @fires dsfr-data-source-command - `{ sourceId, where, whereKey, origin? }` sur `document` — clause `where` diffusee vers chaque source de `sources`, avec un whereKey stable par filtre (merge en AND cote source, ADR-031). `origin` (#603) nomme le composant emetteur : le bus etant plat, une trace ne pourrait sinon pas dire qui demande quoi.
 */
@customElement('dsfr-data-context')
export class DsfrDataContext extends LitElement {
  /** Ids des sources cibles, séparés par des espaces */
  @property({ type: String })
  sources = '';

  /**
   * Sérialisation URL des filtres (#231, ADR-031) — OPT-IN, défaut OFF
   * (collision possible avec le routing query-string du site hôte).
   * Lecture au chargement (pré-remplit les UI, qui repassent par le même
   * chemin qu'un clic — aucune injection directe dans un where) ; écriture
   * en history.replaceState à chaque changement. Un paramètre par champ,
   * pour les filtres classiques comme pour les facettes et la recherche
   * enregistrées par `context="id"` (#678) : l'URL-sync est unique.
   */
  @property({ type: Boolean, attribute: 'url-sync' })
  urlSync = false;

  /** Renommage des paramètres : "param:field | param2:field2" (#231) */
  @property({ type: String, attribute: 'url-param-map' })
  urlParamMap = '';

  /** Uid stable pour les whereKeys (contexte sans id explicite) */
  private readonly _uid = `dsfr-ctx-${++contextSeq}`;

  /** Filtres enregistrés (tout type : filter, facettes, recherche) */
  private _filters: ContextFilterLike[] = [];

  /**
   * whereKey de chaque filtre, indexé sur `uid + champ` (#678) — stable à
   * l'insertion tardive : un filtre enregistré après coup ne décale pas les
   * clés des autres (l'ancien index d'ordre DOM le faisait).
   */
  private _whereKeys = new Map<ContextFilterLike, string>();

  /** Light DOM : les enfants filter restent visibles/inspectables */
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-context');
    this._validate();
    // Les filtres enregistrés par id (`context="…"`) et déclarés AVANT ce
    // contexte dans le DOM attendent ce signal pour s'enregistrer (#678)
    document.dispatchEvent(
      new CustomEvent(CONTEXT_CONNECTED_EVENT, { detail: { id: this.id || null } })
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Libère tous les filtres actifs (leçon #297 : un orchestrateur retiré
    // ne doit pas laisser les sources figées sur son dernier état)
    for (const filter of this._filters) {
      this._clearFilter(filter);
    }
    this._filters = [];
    this._whereKeys.clear();
  }

  willUpdate(changed: Map<string, unknown>) {
    super.willUpdate(changed);
    if (changed.has('sources')) {
      this._validate();
    }
  }

  private _validate() {
    if (!this.sources.trim()) {
      reportConfigError(
        this,
        'dsfr-data-context',
        'attribut "sources" requis (ids de sources séparés par des espaces)'
      );
    } else {
      clearConfigError(this);
    }
  }

  /** Ids de sources du contexte */
  get sourceIds(): string[] {
    return this.sources.split(/\s+/).filter(Boolean);
  }

  /**
   * Enregistrement d'un filtre (appelé à son montage).
   * Retourne le whereKey stable du filtre — indexé sur `uid + champ` (#678),
   * pas sur l'ordre DOM : un filtre enregistré tard (facette déclarée
   * ailleurs dans la page, contexte connecté après lui) ne décale rien.
   * Deux filtres sur le même champ restent deux émetteurs AND distincts
   * (ADR-031) : le second reçoit un suffixe.
   */
  _registerFilter(filter: ContextFilterLike): string {
    const known = this._whereKeys.get(filter);
    if (known) return known;

    // Doublon field+operator sur les mêmes cibles : AND conservé, mais
    // c'est très probablement une erreur de config (ADR-031)
    if (filter.operator) {
      const duplicate = this._filters.find(
        (f) => f.field === filter.field && f.operator === filter.operator
      );
      if (duplicate) {
        console.warn(
          `dsfr-data-context[${this.id || this._uid}]: deux filtres "${filter.field}" ` +
            `avec le même opérateur "${filter.operator}" — ils se combinent en AND ` +
            `(probable erreur de config ; pour un OU multi-valeurs, utilisez operator="in")`
        );
      }
    }
    this._filters.push(filter);

    const base = `${this._uid}-${filter.field}`;
    const taken = new Set(this._whereKeys.values());
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
    this._whereKeys.set(filter, key);
    return key;
  }

  /** Désenregistrement (disconnect d'un filtre) — son filtre est libéré */
  _unregisterFilter(filter: ContextFilterLike): void {
    if (!this._whereKeys.has(filter)) return;
    this._clearFilter(filter);
    this._filters = this._filters.filter((f) => f !== filter);
    this._whereKeys.delete(filter);
  }

  /**
   * Diffusion d'un filtre : recompose le where AU DIALECTE de chaque source
   * (colon natif ; traduit en ODSQL via la couche partagée #275 quand
   * l'adapter l'exige) et l'émet sur le whereKey du filtre.
   */
  _applyFilter(filter: ContextFilterLike, colonWhere: string): void {
    const whereKey = this._registerFilter(filter);
    for (const sourceId of this._targetsFor(filter)) {
      const where = colonWhere ? this._translateFor(sourceId, colonWhere) : '';
      dispatchSourceCommand(sourceId, { where, whereKey, origin: this.id });
    }
    if (this.urlSync && this.isConnected) {
      this._syncUrl();
    }
    // Notifie les observateurs (dsfr-data-context-tags, #232)
    this.dispatchEvent(new CustomEvent('dsfr-data-context-change'));
  }

  /**
   * Filtres actifs du contexte (#232) — pour les composants d'affichage
   * (tags). Un filtre est actif si sa clause courante est non vide. Tout
   * type de filtre confondu (#678) : filter, facettes, recherche.
   */
  activeFilters(): ContextFilterLike[] {
    return this._filters.filter((f) => f.isConnected && f.buildColonWhere() !== '');
  }

  // --- Sérialisation URL (#231, pattern facets — leçon #312 incluse) ---

  /** Map param URL → field (url-param-map "param:field | ...") */
  private _parseParamMap(): Map<string, string> {
    const map = new Map<string, string>();
    if (!this.urlParamMap) return map;
    for (const pair of this.urlParamMap.split('|')) {
      const [param, field] = pair.split(':').map((s) => s.trim());
      if (param && field) map.set(param, field);
    }
    return map;
  }

  /** Nom du paramètre URL d'un champ (reverse de url-param-map, défaut: field) */
  private _paramNameFor(field: string): string {
    for (const [param, f] of this._parseParamMap()) {
      if (f === field) return param;
    }
    return field;
  }

  /**
   * Valeurs URL pour un champ (consultées par les filtres à leur bind) —
   * encodage lisible ADR-031 : valeurs jointes par virgule. null si absent
   * ou si url-sync est OFF.
   */
  _urlValuesFor(field: string): string[] | null {
    if (!this.urlSync) return null;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(this._paramNameFor(field));
    if (raw === null || raw === '') return null;
    return raw.split(',').map((v) => v.trim());
  }

  /**
   * Écrit l'état courant des filtres dans l'URL. Part des paramètres
   * EXISTANTS et ne gère que les siens (leçon #312 : repartir de zéro
   * effaçait les paramètres des composants voisins). replaceState : pas
   * d'entrée d'historique par frappe (ADR-031).
   */
  private _syncUrl(): void {
    const params = new URLSearchParams(window.location.search);
    for (const filter of this._filters) {
      if (!filter.field) continue;
      const name = this._paramNameFor(filter.field);
      const value = filter.urlValue();
      if (value) {
        params.set(name, value);
      } else {
        params.delete(name);
      }
    }
    const search = params.toString();
    const newUrl = search
      ? `${window.location.pathname}?${search}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, '', newUrl);
  }

  /** Cibles effectives d'un filtre : sources du contexte ∩ apply-to */
  private _targetsFor(filter: ContextFilterLike): string[] {
    const all = this.sourceIds;
    const applyTo = (filter.applyTo || '*').trim();
    if (applyTo === '*' || applyTo === '') return all;
    const wanted = new Set(applyTo.split(/\s+/).filter(Boolean));
    return all.filter((id) => wanted.has(id));
  }

  /** Retire le filtre de toutes ses cibles (where vide, contrat #276) */
  private _clearFilter(filter: ContextFilterLike): void {
    this._applyFilter(filter, '');
  }

  /**
   * Traduit la clause colon vers le dialecte de l'adapter de la source —
   * même chemin que la délégation serveur de dsfr-data-query (#275).
   */
  private _translateFor(sourceId: string, colonWhere: string): string {
    const sourceEl = document.getElementById(sourceId) as SourceWithAdapter | null;
    const whereFormat = sourceEl?.getAdapter?.()?.capabilities?.whereFormat;
    if (whereFormat === 'odsql') {
      return filterToOdsql(colonWhere);
    }
    return colonWhere;
  }

  render() {
    return undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-context': DsfrDataContext;
  }
}

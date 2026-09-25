import type { AdapterParams, ApiAdapter, FacetDescriptor } from '../../adapters/api-adapter.js';
import type { SourceElement } from '../../utils/source-element.js';
import { joinWhere, type WhereDialectCarrier } from '../../utils/where.js';
import type { FacetGroup, FacetSelections, FacetValue } from './facets-types.js';

/**
 * Facettes SERVEUR (#838) : découverte des facettes déclarées, résolution des
 * paramètres de la source amont, regroupement des champs par clause, et le
 * cycle de fetch avec son abandon.
 *
 * Le composant garde l'orchestration (quand fetcher, quoi en faire) ; ce
 * module ne connaît ni Lit, ni le rendu, ni l'URL.
 */

/** Paramètres serveur d'une source, tels que les facettes les consomment. */
export type FacetServerParams = Pick<
  AdapterParams,
  'baseUrl' | 'datasetId' | 'headers' | 'proxyUrl'
>;

/**
 * Découverte memorisee des facettes declarees par un jeu (#680).
 *
 * Un appel par jeu de données : noms et libellés des facettes declarees
 * (utilisés quand `fields` est absent) et champs de type date — utiles meme
 * avec `fields` explicite, car le where d'une annee doit être un intervalle
 * (#676). Une decouverte en echec est memorisee vide (pas de nouvelle
 * tentative a chaque cycle) jusqu'a un changement de jeu.
 */
export class ServerFacetsDiscovery {
  /** Facettes decouvertes ; null tant que la decouverte n'a pas abouti */
  private _facets: FacetDescriptor[] | null = null;

  /** Cle (baseUrl + datasetId) de la decouverte memorisee : un autre jeu l'invalide */
  private _key = '';

  /** Decouverte en vol, partagee entre deux cycles de fetch concurrents */
  private _promise: Promise<FacetDescriptor[]> | null = null;

  /** « Aucune facette déclarée » déjà signale pour ce jeu (un warn, pas un par cycle) */
  emptyWarned = false;

  /** Facettes connues, ou `null` si aucune decouverte n'a encore abouti. */
  get facets(): FacetDescriptor[] | null {
    return this._facets;
  }

  /** Une decouverte est-elle en vol ? */
  get pending(): boolean {
    return this._promise !== null;
  }

  discover(
    adapter: ApiAdapter,
    params: FacetServerParams,
    onError: (error: unknown) => void
  ): Promise<FacetDescriptor[]> {
    if (!adapter.discoverFacets) return Promise.resolve([]);
    const key = `${params.baseUrl}|${params.datasetId}`;
    if (this._key === key) {
      if (this._facets) return Promise.resolve(this._facets);
      if (this._promise) return this._promise;
    }
    this._key = key;
    this._facets = null;
    this.emptyWarned = false;
    const promise = (adapter.discoverFacets?.(params) ?? Promise.resolve([] as FacetDescriptor[]))
      .catch((e: unknown) => {
        onError(e);
        return [] as FacetDescriptor[];
      })
      .then((descriptors) => {
        if (this._key === key) {
          this._facets = descriptors;
          this._promise = null;
        }
        return descriptors;
      });
    this._promise = promise;
    return promise;
  }

  /** Champs date connus par la decouverte (#676) ; undefined avant decouverte ou sans date */
  dateFields(): ReadonlySet<string> | undefined {
    if (!this._facets) return undefined;
    const dates = this._facets.filter((d) => d.isDate).map((d) => d.field);
    return dates.length > 0 ? new Set(dates) : undefined;
  }

  /** Libellé déclaré par le provider pour un champ decouvert (a défaut de `labels`) */
  labelOf(field: string): string | undefined {
    return this._facets?.find((d) => d.field === field)?.label;
  }
}

/** Une selection active porte-t-elle une valeur en forme d'annee ? */
export function hasYearShapedSelection(selections: FacetSelections): boolean {
  return Object.values(selections).some((values) => [...values].some((v) => /^\d{4}$/.test(v)));
}

/** Une selection active porte-t-elle une annee sur un champ date decouvert ? */
export function hasDateYearSelection(
  selections: FacetSelections,
  dateFields: ReadonlySet<string> | undefined
): boolean {
  if (!dateFields) return false;
  return Object.entries(selections).some(
    ([field, values]) => dateFields.has(field) && [...values].some((v) => /^\d{4}$/.test(v))
  );
}

/**
 * Paramètres serveur (baseUrl, datasetId, headers, proxy) de la source
 * amont. Resolus par la source elle-meme (headers effectifs avec
 * api-key-ref) via la délégation SourceElement — re-parser les attributs
 * DOM ratait la resolution d'api-key-ref → 401 sur sources authentifiees
 * (#274). Null sans datasetId.
 *
 * `findUpstream` rend la vraie `dsfr-data-source` du pipeline, pour le repli
 * sur les attributs DOM des sources tierces.
 */
export function resolveServerParams(
  sourceEl: HTMLElement,
  findUpstream: () => HTMLElement | null
): FacetServerParams | null {
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
    const actualSourceEl = findUpstream() || sourceEl;
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

/**
 * Cross-facet : regroupe les champs par clause effective. Les champs qui
 * partagent la meme clause tiennent dans UN appel a l'API.
 *
 * `baseWhere` est invariant : il etait recalcule a chaque iteration (#313).
 * La jointure suit le dialecte de l'adaptateur (`joinWhere`, #1135) : joindre
 * du colon par AND produisait des clauses croisees invalides (#271).
 */
export function groupFieldsByWhere(
  fields: string[],
  baseWhere: string,
  adapter: WhereDialectCarrier | null | undefined,
  facetWhereExcluding: (field: string) => string
): Map<string, string[]> {
  const whereToFields = new Map<string, string[]>();
  for (const field of fields) {
    const effectiveWhere = joinWhere(adapter, [baseWhere, facetWhereExcluding(field)]);
    if (!whereToFields.has(effectiveWhere)) whereToFields.set(effectiveWhere, []);
    whereToFields.get(effectiveWhere)!.push(field);
  }
  return whereToFields;
}

/** Resultat d'un cycle de fetch de facettes. */
export interface FacetsFetchOutcome {
  groups: FacetGroup[];
  /** Message du dernier echec, ou `null` — rendu par le composant (#309). */
  error: string | null;
  /** Cycle annule : l'appelant ne doit rien ecrire. */
  aborted: boolean;
}

/**
 * Un appel par clause distincte. Une erreur n'interrompt pas les autres
 * appels : elle est rendue visible (plus avalee en silence, #309).
 * `fetchFacets` construit son URL en interne : le diagnostic CORS (#598) est
 * joint sans URL par `onError`, le reste du conseil reste valable.
 */
export async function fetchFacetGroups(
  adapter: ApiAdapter,
  params: FacetServerParams,
  whereToFields: Map<string, string[]>,
  signal: AbortSignal,
  labelFor: (field: string) => string,
  sortValues: (values: FacetValue[], field: string) => FacetValue[],
  onError: (error: unknown) => void
): Promise<FacetsFetchOutcome> {
  if (!adapter.fetchFacets) return { groups: [], error: null, aborted: false };

  const groups: FacetGroup[] = [];
  let error: string | null = null;
  for (const [where, groupFields] of whereToFields) {
    try {
      const results = (await adapter.fetchFacets?.(params, groupFields, where, signal)) ?? [];
      for (const result of results) {
        groups.push({
          field: result.field,
          label: labelFor(result.field),
          values: sortValues(result.values, result.field),
        });
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return { groups: [], error: null, aborted: true };
      error = (e as Error).message || 'Erreur de chargement des facettes';
      onError(e);
    }
  }
  return { groups, error, aborted: false };
}

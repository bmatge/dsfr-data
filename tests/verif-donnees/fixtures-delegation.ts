/**
 * Balisages du lot « invariant de délégation » (#836, #838).
 *
 * Ce module n'invente aucune donnée : il réemploie les 137 territoires de
 * `fixtures.ts` et n'écrit que des BALISAGES. Sa raison d'être est qu'un
 * contrôle de ce lot se joue toujours deux fois — le même balisage avec
 * `server-side` sur la source et sans — et que recopier le second à la main
 * laisserait passer la seule chose qu'on veut interdire : une différence
 * involontaire entre les deux pages.
 *
 * Comme le reste de `tests/verif-donnees`, il n'importe rien de `packages/`
 * (test-garde `tests/oracle/guard.test.ts`).
 */
import type { Check, Expect } from '../../tools/oracle/manifest.js';
import { DATASET, HOTE_ODS, RESSOURCE_TABULAR, TERRITOIRES } from './fixtures.js';

/** Chemin ODS `/records` : ce à quoi on restreint un contrôle d'URL. */
export const RECORDS_ODS = `/datasets/${DATASET}/records`;

/** Chemin des données Tabular. */
export const DATA_TABULAR = `/api/resources/${RESSOURCE_TABULAR}/data/`;

/** DSFR Chart depuis node_modules : la vraie bibliothèque, jamais le CDN. */
export const TETE_CHART = `
  <link rel="stylesheet" href="/node_modules/@gouvfr/dsfr-chart/dist/DSFRChart/DSFRChart.css">
  <script type="module" src="/node_modules/@gouvfr/dsfr-chart/dist/DSFRChart/DSFRChart.js"></script>`;

/**
 * Taille de page des contrôles `server-side`.
 *
 * L'invariant « mêmes chiffres avec et sans pagination serveur » n'a de sens
 * que pour un résultat qui TIENT dans une page : sinon les deux balisages ne
 * montrent pas la même chose, et c'est voulu — une liste paginée affiche une
 * page. Les formes contrôlées ici sont agrégées (huit académies, sept pays) ou
 * bornées par un `limit`, toutes très en deçà de ce plafond.
 */
export const TAILLE_PAGE = 40;

/** La source ODS du lot, avec ou sans pagination serveur. */
export function sourceOds(
  id: string,
  options: {
    serverSide?: boolean;
    maxRecords?: number;
    select?: string;
    requireWhere?: boolean;
  } = {}
): string {
  const attrs = [
    `id="${id}"`,
    'api-type="opendatasoft"',
    `base-url="${HOTE_ODS}"`,
    `dataset-id="${DATASET}"`,
  ];
  if (options.serverSide) attrs.push(`server-side page-size="${TAILLE_PAGE}"`);
  if (options.maxRecords) attrs.push(`max-records="${options.maxRecords}"`);
  if (options.select) attrs.push(`select="${options.select}"`);
  if (options.requireWhere) attrs.push('require-where');
  return `<dsfr-data-source ${attrs.join(' ')}></dsfr-data-source>`;
}

/** La source Tabular du lot, avec ou sans pagination serveur. */
export function sourceTabular(
  id: string,
  options: { serverSide?: boolean; select?: string } = {}
): string {
  const attrs = [`id="${id}"`, 'api-type="tabular"', `resource="${RESSOURCE_TABULAR}"`];
  if (options.serverSide) attrs.push(`server-side page-size="${TAILLE_PAGE}"`);
  // `select` devient `columns=` (#985) : la projection de l'API
  if (options.select) attrs.push(`select="${options.select}"`);
  return `<dsfr-data-source ${attrs.join(' ')}></dsfr-data-source>`;
}

/** Une forme de `dsfr-data-query`, éprouvée deux fois : sans puis avec `server-side`. */
export interface Forme {
  /** Racine de l'id des deux contrôles (`-serveur` est ajouté au second). */
  id: string;
  origin: string;
  /** `ods` ou `tabular`. */
  api: 'ods' | 'tabular';
  /** Attributs de la query, hors `source`. */
  query: string;
  /** Colonnes de la liste rendue (`champ:Libellé, …`). */
  colonnes: string;
  /** Les observations, hors celle des URL, écrites une fois pour les deux. */
  expects: Expect[];
  /**
   * Défaut CONNU de la bibliothèque sur la variante `server-side` : le contrôle
   * reste écrit, et ne se mesure pas tant que le défaut est là (`Check.skip`).
   */
  skipServeur?: string;
}

/**
 * Les DEUX contrôles d'une forme : le même balisage, la même attente, la
 * pagination serveur en plus sur le second.
 *
 * C'est l'invariant du lot : `server-side` change la façon dont les lignes
 * arrivent, pas les chiffres qu'on lit. Les ids d'éléments sont communs aux
 * deux pages — chaque contrôle a sa page — ce qui permet d'écrire les
 * observations une seule fois.
 */
export function pairePaginee(forme: Forme, urls?: Expect[]): Check[] {
  const balisage = (serverSide: boolean) =>
    `
  ${forme.api === 'ods' ? sourceOds('s', { serverSide }) : sourceTabular('s', { serverSide })}
  <dsfr-data-query id="q" source="s" ${forme.query}></dsfr-data-query>
  <dsfr-data-list id="l" source="q" columns="${forme.colonnes}"${serverSide ? ' server-sort' : ''}></dsfr-data-list>`;

  return [false, true].map((serverSide) => ({
    id: serverSide ? `${forme.id}-serveur` : forme.id,
    mode: 'deterministic' as const,
    origin: serverSide
      ? `${forme.origin} — avec server-side sur la source : memes chiffres (#838).`
      : forme.origin,
    feed: { kind: 'fixture' as const, datasets: { main: TERRITOIRES } },
    markup: balisage(serverSide),
    expects: [...forme.expects, ...(urls ?? [])],
    ...(serverSide && forme.skipServeur ? { skip: forme.skipServeur } : {}),
  }));
}

/** Un contrôle d'URL restreint aux requêtes de données de l'API visée. */
export function urlsDe(
  id: string,
  api: 'ods' | 'tabular',
  contains: string,
  verdict: 'none' | 'some' | 'all' | 'last' | 'notLast'
): Expect {
  return {
    kind: 'urls',
    id,
    among: api === 'ods' ? RECORDS_ODS : DATA_TABULAR,
    contains,
    verdict,
  };
}

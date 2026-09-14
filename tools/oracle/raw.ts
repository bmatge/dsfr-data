/**
 * Les deux ALIMENTATIONS de l'oracle.
 *
 * - `fixture` : les lignes sont dans le dépôt, et ce sont exactement celles que
 *   `page.route` sert à la page. Zéro réseau : le contrôle est bloquant sur PR.
 * - `raw` : lignes BRUTES d'une API tierce, appelée en direct, clauses écrites
 *   à la main, aucun adaptateur de la lib. Deux formes : l'export JSON d'un
 *   portail Opendatasoft (`RawSource`), ou une URL quelconque dont on nomme le
 *   chemin du tableau de lignes et, s'il y a lieu, celui de la page suivante
 *   (`RawUrlSource` — Tabular, INSEE Melodi). Le contrôle dépend alors d'une
 *   API tierce et ne tourne que la nuit ou à la demande.
 */
import type { Feed, RawSource, RawUrlSource, Row } from './manifest.js';
import { JEU_PRINCIPAL } from './manifest.js';

export function exportUrl(source: RawSource): string {
  const url = new URL(
    `${source.baseUrl}/api/explore/v2.1/catalog/datasets/${encodeURIComponent(source.dataset)}/exports/json`
  );
  if (source.where) url.searchParams.set('where', source.where);
  return url.toString();
}

export async function fetchRawRows(source: RawSource): Promise<Row[]> {
  const url = exportUrl(source);
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`export brut : HTTP ${res.status} sur ${url}`);
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) throw new Error(`export brut : réponse non tabulaire sur ${url}`);
  return body as Row[];
}

/** Une source brute est-elle une URL nue plutôt qu'un jeu Opendatasoft ? */
export function estUrlBrute(source: RawSource | RawUrlSource): source is RawUrlSource {
  return 'url' in source;
}

/** Suit un chemin pointé (`links.next`) dans une réponse JSON. */
export function suivreChemin(valeur: unknown, chemin: string): unknown {
  let courant: unknown = valeur;
  for (const segment of chemin.split('.')) {
    if (courant === null || typeof courant !== 'object') return undefined;
    courant = (courant as Record<string, unknown>)[segment];
  }
  return courant;
}

/**
 * Lignes brutes d'une URL quelconque, page après page. `rowsPath` nomme le
 * tableau dans l'enveloppe, `nextPath` l'URL de la page suivante (résolue
 * contre la page courante si elle est relative).
 */
export async function fetchUrlRows(source: RawUrlSource): Promise<Row[]> {
  const plafond = source.maxPages ?? 50;
  const lignes: Row[] = [];
  let url: string | null = source.url;
  for (let page = 0; page < plafond && url !== null; page++) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`source brute : HTTP ${res.status} sur ${url}`);
    const body = (await res.json()) as unknown;
    const brut = source.rowsPath === undefined ? body : suivreChemin(body, source.rowsPath);
    if (!Array.isArray(brut)) {
      throw new Error(
        `source brute : pas de tableau en « ${source.rowsPath ?? '(racine)'} » sur ${url}`
      );
    }
    lignes.push(...(brut as Row[]));
    const suivant = source.nextPath === undefined ? null : suivreChemin(body, source.nextPath);
    url = typeof suivant === 'string' && suivant !== '' ? new URL(suivant, url).toString() : null;
  }
  return lignes;
}

/**
 * Les téléchargements déjà faits DANS CE RUN, par URL de départ.
 *
 * Plusieurs contrôles reprennent le même jeu du banc — c'est même le cas
 * normal, une page du banc portant plusieurs constats. Sans mémoire, le run
 * retélécharge l'export à chaque contrôle : autant d'appels identiques à une
 * API publique, pour des lignes qui doivent de toute façon être les MÊMES des
 * deux côtés. La clé est l'URL effectivement appelée, clauses comprises : deux
 * `where` différents restent deux téléchargements.
 *
 * La mémoire vit le temps du processus `verif:expected`, jamais sur le disque :
 * rien n'est figé, un jeu qui change entre deux runs change les deux côtés.
 */
const DEJA_TELECHARGE = new Map<string, Promise<Row[]>>();

/**
 * Oublie les téléchargements de ce run — ce que fait naturellement la fin du
 * processus.
 *
 * Exporté pour que l'on puisse éprouver la règle dans les DEUX sens : un run
 * ne retélécharge pas, deux runs retéléchargent. Sans ce geste, un test ne
 * pourrait montrer que la moitié qui arrange.
 */
export function viderCacheBrut(): void {
  DEJA_TELECHARGE.clear();
}

/** Lignes brutes d'une source, une seule fois par URL et par run. */
export function fetchSourceRows(source: RawSource | RawUrlSource): Promise<Row[]> {
  const cle = estUrlBrute(source) ? source.url : exportUrl(source);
  const connu = DEJA_TELECHARGE.get(cle);
  if (connu !== undefined) return connu;
  const promesse = estUrlBrute(source) ? fetchUrlRows(source) : fetchRawRows(source);
  DEJA_TELECHARGE.set(cle, promesse);
  return promesse;
}

/** Les jeux de lignes brutes d'un contrôle, quelle que soit son alimentation. */
export async function resoudreFeed(feed: Feed): Promise<Record<string, Row[]>> {
  if (feed.kind === 'fixture') return feed.datasets;
  const datasets: Record<string, Row[]> = {
    [JEU_PRINCIPAL]: await fetchSourceRows(feed.source),
  };
  for (const [nom, source] of Object.entries(feed.sources ?? {})) {
    datasets[nom] = await fetchSourceRows(source);
  }
  return datasets;
}

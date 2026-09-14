/**
 * Les deux ALIMENTATIONS de l'oracle.
 *
 * - `fixture` : les lignes sont dans le dépôt, et ce sont exactement celles que
 *   `page.route` sert à la page. Zéro réseau : le contrôle est bloquant sur PR.
 * - `raw` : lignes BRUTES d'un jeu Opendatasoft par l'export JSON — appel
 *   direct, clause ODSQL passée telle quelle, aucun adaptateur de la lib. Le
 *   contrôle dépend alors d'une API tierce et ne tourne que la nuit ou à la
 *   demande.
 */
import type { Feed, RawSource, Row } from './manifest.js';
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

/** Les jeux de lignes brutes d'un contrôle, quelle que soit son alimentation. */
export async function resoudreFeed(feed: Feed): Promise<Record<string, Row[]>> {
  if (feed.kind === 'fixture') return feed.datasets;
  return { [JEU_PRINCIPAL]: await fetchRawRows(feed.source) };
}

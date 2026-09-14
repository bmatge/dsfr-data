/**
 * Lignes BRUTES d'un jeu Opendatasoft par l'export JSON — appel direct, clause
 * ODSQL passée telle quelle. Aucune traduction, aucun adaptateur de la lib.
 */
import type { RawSource } from './manifest.js';
import type { Row } from './compute.js';

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

/**
 * data.gouv.fr dataset pages — resource resolution.
 *
 * A data.gouv DATASET page (e.g. /fr/datasets/{slug}/) is NOT a single
 * queryable resource: it holds N files (resources), and only those ingested
 * by the Tabular API are queryable. Unlike OpenDataSoft (1 page = 1 API URL),
 * resolving a data.gouv dataset therefore requires a network lookup + a user
 * choice of which resource to use.
 *
 * PAR DESIGN (#285), ce module n'a NI ProviderId NI adapter : un dataset
 * data.gouv n'est pas un protocole d'API mais un AIGUILLAGE vers des
 * ressources Tabular (chaque ressource retenue est ensuite servie par
 * TABULAR_CONFIG + TabularAdapter). La règle « 1 ProviderConfig + 1 Adapter
 * par protocole d'API » reste donc entière — ne pas créer de
 * 'datagouv-dataset' dans ProviderId.
 *
 * This module provides the pure pieces:
 *   - parseDataGouvDataset()    : URL → dataset slug (page detection)
 *   - dataGouvDatasetApiUrl()   : slug → data.gouv catalog API URL (CORS-open)
 *   - extractDataGouvResources(): catalog JSON → typed resource list, with the
 *                                 Tabular API URL for the ones that are parsed
 *
 * The Tabular-queryable signal is the resource extra
 * `analysis:parsing:parsing_table` (present ⇒ a Tabular table exists ⇒ HTTP 200
 * on tabular-api ; absent ⇒ 404). Relying on `format === 'csv'` is NOT enough.
 */

/**
 * Matches a data.gouv.fr dataset PAGE and captures the first path segment after
 * `datasets/`. The resource permalink form `/datasets/r/{uuid}` captures `r`,
 * which `parseDataGouvDataset` rejects below (it's handled by the Tabular
 * provider). Kept lookahead-free to stay linear-time.
 */
// eslint-disable-next-line security/detect-unsafe-regex -- linéaire : groupe optionnel borné à 2 caractères, pas de quantificateurs imbriqués (faux positif de l'heuristique)
const DATAGOUV_DATASET_RE = /data\.gouv\.fr\/(?:[a-z]{2}\/)?datasets\/([^/?#]+)/i;

/** Extract the dataset slug (or internal id) from a data.gouv dataset page URL. */
export function parseDataGouvDataset(url: string): string | null {
  const m = url.match(DATAGOUV_DATASET_RE);
  const slug = m?.[1];
  return slug && slug !== 'r' ? slug : null;
}

/** Build the data.gouv catalog API URL for a dataset slug (CORS-enabled). */
export function dataGouvDatasetApiUrl(slug: string): string {
  return `https://www.data.gouv.fr/api/1/datasets/${encodeURIComponent(slug)}/`;
}

export interface DataGouvResource {
  /** Resource UUID. */
  id: string;
  /** Human title (falls back to the id). */
  title: string;
  /** Lowercased format, e.g. 'csv', 'xlsx', 'json', 'pdf'. */
  format: string;
  /** Size in bytes if known, else null. */
  size: number | null;
  /** Tabular API data URL when the resource is parsed/queryable, else null. */
  tabularApiUrl: string | null;
}

function toSize(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

/**
 * Parse the `resources[]` of a data.gouv catalog response into a typed list.
 * `tabularApiUrl` is set only for resources that have been parsed by the
 * Tabular API (extra `analysis:parsing:parsing_table` present).
 */
export function extractDataGouvResources(datasetJson: unknown): DataGouvResource[] {
  const resources = (datasetJson as { resources?: unknown[] })?.resources;
  if (!Array.isArray(resources)) return [];

  return resources.flatMap((raw) => {
    const res = raw as Record<string, unknown>;
    const id = res.id != null ? String(res.id) : '';
    if (!id) return [];

    const extras = (res.extras ?? {}) as Record<string, unknown>;
    const isParsed = !!extras['analysis:parsing:parsing_table'];
    const size =
      toSize(extras['analysis:content-length']) ??
      toSize(extras['check:headers:content-length']) ??
      toSize(res.filesize);

    return [
      {
        id,
        title: res.title != null ? String(res.title) : id,
        format: res.format != null ? String(res.format).toLowerCase() : '',
        size,
        tabularApiUrl: isParsed
          ? `https://tabular-api.data.gouv.fr/api/resources/${id}/data/`
          : null,
      },
    ];
  });
}

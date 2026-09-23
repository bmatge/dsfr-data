/**
 * Lecture de l'export Parquet d'une ressource data.gouv (#1055, étude #1022).
 *
 * data.gouv publie, pour chaque ressource tabulaire analysée, un export
 * Parquet (`extras["analysis:parsing:parquet_url"]` de
 * `GET https://www.data.gouv.fr/api/2/datasets/resources/{rid}/`), servi par
 * un S3 (`hydra.s3.rbx.io.cloud.ovh.net`) qui répond
 * `Access-Control-Allow-Origin: *` et lit par plage (`Range`). Le fichier
 * sort de la même analyse que l'API tabulaire : lire l'un plutôt que l'autre
 * ne change rien à la fraîcheur.
 *
 * Mesures de l'étude (poste) : 223 174 lignes IRVE en 0,66 s et 17 requêtes,
 * là où la pagination met 10,8 s et 125 requêtes pour 25 000 lignes. Comptes
 * et sommes identiques au `meta.total` et aux `__sum` de l'API.
 *
 * Ce module est dans le bundle principal, mais il est MINCE : le lecteur
 * lui-même (`hyparquet` + `fzstd`) n'est chargé qu'au premier appel de
 * `readParquetRows`, par `parquet-modules.ts`.
 */
import { importParquetLibraries } from './parquet-modules.js';
import type { ParquetLibraries } from './parquet-types.js';

/** API data.gouv qui résout une ressource vers ses exports (CORS `*`). */
export const DATAGOUV_RESOURCE_API = 'https://www.data.gouv.fr/api/2/datasets/resources/';

/**
 * Taille du premier relevé, qui doit contenir le pied du fichier : 64 Kio au
 * lieu des 512 Kio de hyparquet. Les pieds mesurés font 4 à 37 Kio ; 512 Kio
 * rapatrieraient 62 % du fichier des élus pour rien (#1022).
 */
const PARQUET_FOOTER_FETCH = 64 * 1024;

/** L'export Parquet d'une ressource, tel que data.gouv l'annonce. */
export interface ParquetExport {
  url: string;
  /** Taille en octets (`parquet_size`) : évite une requête HEAD. */
  size?: number;
}

/**
 * Lit l'export Parquet dans la réponse de `DATAGOUV_RESOURCE_API` —
 * `{ resource: { extras } }` — ou `null` quand la ressource n'en a pas (une
 * ressource analysée avant l'arrivée du Parquet, #1022).
 */
export function parquetExportFromResource(json: unknown): ParquetExport | null {
  if (!json || typeof json !== 'object') return null;
  const wrapper = json as { resource?: unknown };
  const resource = (wrapper.resource ?? json) as { extras?: Record<string, unknown> };
  const extras = resource.extras;
  if (!extras || typeof extras !== 'object') return null;
  const url = extras['analysis:parsing:parquet_url'];
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) return null;
  const size = extras['analysis:parsing:parquet_size'];
  return typeof size === 'number' && size > 0 ? { url, size } : { url };
}

let librariesLoading: Promise<ParquetLibraries> | null = null;

/**
 * Charge le lecteur une fois pour toute la page ; un échec (réseau, CSP)
 * n'est pas mémorisé, la lecture suivante réessaie.
 */
function loadParquetLibraries(): Promise<ParquetLibraries> {
  if (!librariesLoading) {
    librariesLoading = importParquetLibraries().catch((err: unknown) => {
      librariesLoading = null;
      throw err;
    });
  }
  return librariesLoading;
}

/** `AAAA-MM-JJ` d'une date UTC à minuit ; horodatage ISO complet sinon. */
function dateToApiString(date: Date): string {
  const iso = date.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
}

/**
 * Une valeur lue dans le Parquet, rendue dans la forme de l'API tabulaire.
 *
 * - `INT64` arrive en `BigInt` : rendu en `number`, comme le JSON de l'API
 *   (un `JSON.stringify` casse sur un `BigInt`, et `a + b` mêlant `number`
 *   et `BigInt` lève une erreur dans tout agrégat) ;
 * - `DATE` arrive en objet `Date` : rendu en chaîne `AAAA-MM-JJ`, la forme
 *   de l'API (`"1967-07-22"`). Un horodatage garde son heure, en ISO.
 *
 * À savoir : deux colonnes `datetime_aware` du profil de l'IRVE
 * (`created_at`, `last_modified`) sont écrites en `DATE` dans le Parquet —
 * l'heure y est PERDUE, là où l'API la rend (#1022).
 */
export function normalizeParquetValue(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return dateToApiString(value);
  return value;
}

/** Options de `readParquetRows`. */
export interface ParquetReadRequest {
  url: string;
  size?: number;
  /** Colonnes à lire (projection du `select`) ; toutes si absent. */
  columns?: string[];
  /** Nombre maximal de lignes à lire (plafond `max-records` / `limit`). */
  maxRows: number;
  signal?: AbortSignal;
}

/** Résultat de `readParquetRows`. */
export interface ParquetReadResult {
  rows: Record<string, unknown>[];
  /** Nombre de lignes du fichier : le total serveur, connu d'avance. */
  numRows: number;
  /** Colonnes demandées que le fichier ne porte pas. */
  missingColumns: string[];
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    throw err;
  }
}

/**
 * Lit au plus `maxRows` lignes de l'export, par plages : le pied d'abord,
 * puis les seuls groupes de lignes (et colonnes) nécessaires. Requêtes SANS
 * credentials : le S3 pose `Access-Control-Allow-Credentials: true` avec
 * `Allow-Origin: *`, combinaison qu'un navigateur refuse sur une requête à
 * cookies.
 *
 * Sans projection, chaque ligne reçoit `__id` (position + 1), la colonne que
 * l'API ajoute à chaque ligne et que le Parquet ne porte pas : la ligne a la
 * même forme par les deux chemins.
 */
export async function readParquetRows(request: ParquetReadRequest): Promise<ParquetReadResult> {
  const { hyparquet, fzstd } = await loadParquetLibraries();
  throwIfAborted(request.signal);

  const requestInit: RequestInit = { credentials: 'omit' };
  if (request.signal) requestInit.signal = request.signal;
  const file = await hyparquet.asyncBufferFromUrl({
    url: request.url,
    ...(request.size ? { byteLength: request.size } : {}),
    requestInit,
  });
  const metadata = await hyparquet.parquetMetadataAsync(file, {
    initialFetchSize: PARQUET_FOOTER_FETCH,
  });
  throwIfAborted(request.signal);

  const numRows = Number(metadata.num_rows);
  const available = new Set(
    hyparquet.parquetSchema(metadata).children.map((child) => child.element.name)
  );
  const requested = request.columns;
  const columns = requested?.filter((c) => available.has(c));
  const missingColumns = requested ? requested.filter((c) => !available.has(c)) : [];
  const rowEnd = Math.min(numRows, Math.max(0, request.maxRows));
  if (rowEnd === 0 || (columns && columns.length === 0)) {
    return { rows: [], numRows, missingColumns };
  }

  const raw = await hyparquet.parquetReadObjects({
    file,
    metadata,
    ...(columns ? { columns } : {}),
    rowStart: 0,
    rowEnd,
    compressors: {
      ZSTD: (input: Uint8Array, outputLength: number) =>
        fzstd.decompress(input, new Uint8Array(outputLength)),
    },
  });
  throwIfAborted(request.signal);

  const withId = !requested && !available.has('__id');
  const rows = new Array<Record<string, unknown>>(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const source = raw[i];
    const row: Record<string, unknown> = withId ? { __id: i + 1 } : {};
    for (const key of Object.keys(source)) {
      row[key] = normalizeParquetValue(source[key]);
    }
    rows[i] = row;
  }
  return { rows, numRows, missingColumns };
}

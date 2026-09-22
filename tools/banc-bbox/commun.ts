/**
 * Banc « zone visible » simulee (#1023) — constantes et requetes partagees.
 * Aucun import de `packages/` ni de `@dsfr-data/*`.
 */
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DOSSIER = fileURLToPath(new URL('.', import.meta.url));
export const SORTIE = fileURLToPath(new URL('./out/', import.meta.url));
export const MESURES = fileURLToPath(new URL('./out/mesures.jsonl', import.meta.url));
export const PORT = 5191;
export const T = 'https://tabular-api.data.gouv.fr/api/resources/';

export interface Rect {
  cle: string;
  nom: string;
  s: number;
  n: number;
  o: number;
  e: number;
}
export const RECTS: Rect[] = [
  { cle: 'ville', nom: 'Paris centre (1er-4e)', s: 48.85, n: 48.87, o: 2.33, e: 2.37 },
  { cle: 'departement', nom: 'Paris (75)', s: 48.815, n: 48.902, o: 2.224, e: 2.47 },
  { cle: 'france', nom: 'France métropolitaine', s: 41.3, n: 51.1, o: -5.2, e: 9.6 },
];

export interface Jeu {
  cle: string;
  nom: string;
  rid: string;
  id: string;
  /** Deux colonnes numeriques, ou une colonne texte « lat, lon » (lon = null). */
  lat: string;
  lon: string | null;
}
export const JEUX: Jeu[] = [
  {
    cle: 'irve',
    nom: 'IRVE consolidée (223 k) — lat/lon float',
    rid: 'eb76d20a-8501-400e-b336-d85724de5435',
    id: 'nom_station',
    lat: 'consolidated_latitude',
    lon: 'consolidated_longitude',
  },
  {
    cle: 'accidents',
    nom: 'Accidents 2024, caractéristiques (54 k) — lat float, long « longitude_l93 »',
    rid: '83f0fb0e-e0ef-47fe-93dd-9aaee851674a',
    id: 'Num_Acc',
    lat: 'lat',
    lon: 'long',
  },
  {
    cle: 'arbres',
    nom: 'Arbres de Paris (220 k) — geo_point_2d texte « lat, lon »',
    rid: '2b07e802-8dd7-4744-a0b2-8810f95efdfc',
    id: 'IDBASE',
    lat: 'geo_point_2d',
    lon: null,
  },
];

const enc = encodeURIComponent;

/**
 * Clause bbox telle que la traduirait l'adaptateur tabulaire depuis
 * `lat:gte:S, lat:lte:N, lon:gte:O, lon:lte:E` (gte -> greater, lte -> less,
 * bornes incluses). Sur une colonne texte « lat, lon », seule la latitude
 * (prefixe de la chaine) est exprimable, et la comparaison est TEXTUELLE.
 */
export function clauses(j: Jeu, r: Rect): string {
  const p = [`${enc(j.lat)}__greater=${r.s}`, `${enc(j.lat)}__less=${r.n}`];
  if (j.lon) p.push(`${enc(j.lon)}__greater=${r.o}`, `${enc(j.lon)}__less=${r.e}`);
  return p.join('&');
}
export function colonnes(j: Jeu): string {
  return (
    'columns=' +
    [j.id, j.lat, j.lon]
      .filter(Boolean)
      .map((c) => enc(String(c)))
      .join(',')
  );
}

export interface Reponse {
  ms: number;
  octets: number;
  statut: number;
  total: number | null;
  lignes: number;
}

/** GET chronometre (Node fetch) : envoi -> corps recu. Octets = corps decompresse. */
export async function lire(url: string, signal?: AbortSignal): Promise<Reponse> {
  const t0 = performance.now();
  const r = await fetch(url, { signal });
  const texte = await r.text();
  const ms = performance.now() - t0;
  let j: { meta?: { total?: number }; data?: unknown[] } = {};
  try {
    j = JSON.parse(texte);
  } catch {
    // corps non JSON (erreur) : le statut suffit
  }
  return {
    ms,
    octets: Buffer.byteLength(texte),
    statut: r.status,
    total: j.meta?.total ?? null,
    lignes: j.data?.length ?? 0,
  };
}

export const attendre = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
export const mediane = (xs: number[]): number => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

export function consigner(ligne: Record<string, unknown>): void {
  appendFileSync(MESURES, JSON.stringify(ligne) + '\n');
}

/**
 * LE VERDICT D'UNE NUIT ROUGE (#884) : bibliothèque, ou donnée ?
 *
 * Le mode vivant tient l'ADR-122 — les deux côtés lisent la même API « au
 * même instant », donc un jeu qui change bouge l'attendu et l'affiché
 * ensemble. Mais « au même instant » vaut quelques minutes : `verif:expected`
 * puis le spec. Un jeu mis à jour entre les deux donne un écart qui n'est ni
 * un bug ni une donnée fausse, et rien ne le distinguait d'un défaut.
 *
 * D'où l'EMPREINTE : au calcul de l'attendu, le nombre de lignes brutes, un
 * SHA-256 de leur forme JSON, et la date de traitement que le portail
 * publie (`metas.default.data_processed` de `/api/explore/v2.1/catalog/
 * datasets/{id}`). Après l'observation, le spec relit cette date — une
 * requête, en cache par jeu — et tranche :
 *
 * - **bibliothèque** : empreinte stable, écart → c'est la lib ; l'échec est
 *   GELÉ en contrôle figé (`gel.ts`) ;
 * - **donnée** : la date a changé entre les deux lectures → le contrôle est
 *   rejoué une fois, dans le même run, sur un attendu recalculé ;
 * - **indéterminé** : pas de métadonnée de fraîcheur (Tabular, Melodi, un
 *   export sans catalogue) → l'écart reste, le verdict le dit.
 *
 * Un contrôle vivant qu'il faut interpréter le matin est un contrôle qu'on
 * finit par ignorer. Le verdict est là pour qu'il n'y ait rien à interpréter.
 */
import { createHash } from 'node:crypto';
import type { RawSource, RawUrlSource, Row } from './manifest.js';
import { estUrlBrute } from './raw.js';

/** L'empreinte d'un jeu brut au moment du calcul de l'attendu. */
export interface Empreinte {
  rows: number;
  sha256: string;
  /** `metas.default.data_processed` du portail, ou `null` sans catalogue. */
  dataProcessed: string | null;
}

/** SHA-256 de la forme JSON des lignes — la même forme des deux côtés. */
export function empreinteLignes(rows: Row[]): string {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

/**
 * L'URL du catalogue d'un jeu Opendatasoft, d'où vient `data_processed` —
 * ou `null` si la source n'en a pas (Tabular, Melodi, une URL quelconque).
 */
export function urlMetadonnees(source: RawSource | RawUrlSource): string | null {
  if (estUrlBrute(source)) {
    const u = new URL(source.url);
    const m = /^(.*\/api\/explore\/v2\.1\/catalog\/datasets\/[^/]+)\/exports\/json$/.exec(
      u.pathname
    );
    return m === null ? null : `${u.origin}${m[1]}`;
  }
  return `${source.baseUrl}/api/explore/v2.1/catalog/datasets/${encodeURIComponent(source.dataset)}`;
}

const DEJA_LU = new Map<string, Promise<string | null>>();

/** Oublie les lectures — la fin du processus le fait ; un test en a besoin. */
export function viderFraicheur(): void {
  DEJA_LU.clear();
}

/**
 * La date de traitement publiée par le portail, une lecture par jeu et par
 * run. `null` quand la source n'a pas de catalogue, quand le portail ne
 * répond pas ou ne porte pas la métadonnée : le verdict sera indéterminé,
 * jamais inventé.
 */
export function lireDataProcessed(source: RawSource | RawUrlSource): Promise<string | null> {
  const url = urlMetadonnees(source);
  if (url === null) return Promise.resolve(null);
  const connu = DEJA_LU.get(url);
  if (connu !== undefined) return connu;
  const promesse = (async () => {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) return null;
      const body = (await res.json()) as { metas?: { default?: { data_processed?: unknown } } };
      const v = body?.metas?.default?.data_processed;
      return typeof v === 'string' && v !== '' ? v : null;
    } catch {
      return null;
    }
  })();
  DEJA_LU.set(url, promesse);
  return promesse;
}

/** L'empreinte d'un jeu, au moment du calcul de l'attendu. */
export async function prendreEmpreinte(
  source: RawSource | RawUrlSource,
  rows: Row[]
): Promise<Empreinte> {
  return {
    rows: rows.length,
    sha256: empreinteLignes(rows),
    dataProcessed: await lireDataProcessed(source),
  };
}

export type VerdictFraicheur = 'bibliothèque' | 'donnée' | 'indéterminé';

/**
 * Le verdict, depuis la date lue AVANT (à l'attendu) et APRÈS (à
 * l'observation). Sans date d'un côté ou de l'autre, indéterminé.
 */
export function verdictFraicheur(avant: string | null, apres: string | null): VerdictFraicheur {
  if (avant === null || apres === null) return 'indéterminé';
  return avant === apres ? 'bibliothèque' : 'donnée';
}

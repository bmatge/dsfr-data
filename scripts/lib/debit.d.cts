// Types de `debit.cjs` (#999) : lus par les `vite.config.ts` et `tests/scripts/debit.test.ts`.

export type ResultatDebit = { ok: true; retryAfter: 0 } | { ok: false; retryAfter: number };

export interface OptionsDebit {
  /** Nombre d'appels acceptes par fenetre glissante (defaut : 10). */
  maxParMinute?: number;
  /** Duree de la fenetre glissante en millisecondes (defaut : 60000). */
  fenetreMs?: number;
  /** Horloge injectable, en millisecondes (defaut : `Date.now`). */
  now?: () => number;
}

export interface Debit {
  /** Consomme un jeton si possible ; sinon `retryAfter` en secondes entieres (>= 1). */
  tenter(): ResultatDebit;
}

export interface ReponseRefus {
  status: 429;
  headers: Record<string, string>;
  /** JSON : `{ error: { type: 'rate_limit_exceeded', message } }`. */
  body: string;
}

export function creerDebit(options?: OptionsDebit): Debit;
export function lireMaxRpm(valeur: string | undefined): number;
export function reponseRefus(retryAfter: number): ReponseRefus;
export const MAX_RPM_DEFAUT: number;
export const FENETRE_MS_DEFAUT: number;

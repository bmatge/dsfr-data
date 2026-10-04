// Types de `garde-proxy.cjs` : lus par `vite.config.ts` et `tests/proxy/*.test.ts`.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { request } from 'node:https';

export type VerdictCible =
  { ok: true; url: URL } | { ok: false; status: 400 | 403; raison: string };

export interface OptionsRelais {
  /** Methodes relayees (hors `OPTIONS`, toujours repondu 204). */
  methodes: readonly string[];
  /** `true` : `Access-Control-Allow-Origin: *` ; `false` : aucune ouverture CORS. */
  cors: boolean;
  /** `Access-Control-Allow-Headers` du preflight quand le client n'en demande aucun. */
  enTetesPreflight?: string;
  /** Corps maximal relaye, en octets (defaut : `TAILLE_MAX_OCTETS`). */
  tailleMaxOctets?: number;
  /** Emetteur de la requete amont, injectable pour les tests (defaut : `https.request`). */
  envoyer?: typeof request;
}

export const SUFFIXES_RESERVES: readonly string[];
export const MOTIF_NOM_RESERVE: string;
export const MOTIF_CIBLE_ADMISE: string;
export const MOTIF_CIBLE_INSTANCE: string;
export const TAILLE_MAX_OCTETS: number;
export const METHODES: Readonly<Record<'/cors-proxy' | '/ia-proxy', readonly string[]>>;
export const MESSAGES: Readonly<Record<string, string>>;

export function hoteSansPort(enTeteHost: string | undefined): string;
export function verifierCible(valeur: unknown, hoteInstance?: string): VerdictCible;
export function creerRelais(
  options: OptionsRelais
): (req: IncomingMessage, res: ServerResponse) => void;

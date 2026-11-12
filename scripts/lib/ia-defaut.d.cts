// Types de `ia-defaut.cjs` : lus par `vite.config.ts` et `tests/scripts/ia-defaut.test.ts`.

/** Reponse de `GET /ia-server-config` (jamais le jeton). */
export type ReponseConfigDefaut =
  { available: true; apiUrl: string; model: string } | { available: false; disabled?: true };

export interface ConfigDefaut {
  /** `IA_DEFAULT_ENABLED` vaut explicitement faux (`false`, `0`, `off`, `no`, `non`). */
  desactivee: boolean;
  /** Jeton effectif : vide si absent OU desactive. */
  token: string;
  apiUrl: string;
  model: string;
  reponse: ReponseConfigDefaut;
}

export function estDesactivee(valeur: string | undefined): boolean;
export function lireConfigDefaut(
  env: Record<string, string | undefined>,
  defauts: { apiUrl: string; model: string }
): ConfigDefaut;

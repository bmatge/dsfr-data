/**
 * Acces au modele pour le banc du Studio (#1112) — PAR LE MEME CHEMIN que le
 * Studio en ligne : le mode serveur de l'instance (`/ia-proxy-default`), dont
 * le proxy porte la cle cote serveur. Aucun secret a fournir.
 *
 * Sobriete : le plafond du proxy (IA_MAX_RPM, 10 appels par minute par defaut)
 * est PARTAGE avec les usagers. Le banc espace ses appels (`creerCadence`) et
 * s'annonce par ses en-tetes — le proxy ne les exploite pas aujourd'hui (il ne
 * journalise ni l'agent ni l'appelant), mais le journal d'acces de nginx garde
 * le User-Agent.
 */

import { postProxy, type OpenAIResponse, type PostChat } from '@dsfr-data/shared';

export const INSTANCE_PAR_DEFAUT = 'https://chartsbuilder.miweb.run';

/** En-tetes qui identifient le banc aupres de l'instance. */
export const EN_TETES_BANC: Readonly<Record<string, string>> = {
  'User-Agent': 'dsfr-data-banc-studio/1 (+https://github.com/bmatge/dsfr-data/issues/1112)',
  'X-Dsfr-Data-Banc': 'studio',
};

/** URL d'instance validee (http ou https), sans barre finale. */
export function normaliserInstance(brute: string): string {
  let url: URL;
  try {
    url = new URL(brute);
  } catch {
    throw new Error(`Instance invalide : ${brute}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Instance invalide (http ou https attendu) : ${brute}`);
  }
  let chemin = url.pathname;
  while (chemin.endsWith('/')) chemin = chemin.slice(0, -1);
  return url.origin + chemin;
}

/** Transport vers `/ia-proxy-default` de l'instance (retry 429 du transport commun). */
export function creerTransport(instance: string, timeoutMs = 120000): PostChat {
  const endpoint = `${instance}/ia-proxy-default`;
  return (body) => postProxy<OpenAIResponse>(endpoint, { ...EN_TETES_BANC }, body, timeoutMs);
}

/**
 * Espacement minimal entre deux DEBUTS d'appel. Rend la fonction a attendre
 * avant chaque appel ; `maintenant` et `dormir` sont injectables (tests).
 */
export function creerCadence(
  pauseMs: number,
  maintenant: () => number = Date.now,
  dormir: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): () => Promise<void> {
  let dernier: number | null = null;
  return async () => {
    if (dernier !== null) {
      const reste = dernier + pauseMs - maintenant();
      if (reste > 0) await dormir(reste);
    }
    dernier = maintenant();
  };
}

export interface ConfigServeur {
  available: boolean;
  model?: string;
}

/** `GET /ia-server-config` : le mode serveur est-il ouvert, et avec quel modele. */
export async function lireConfigServeur(instance: string): Promise<ConfigServeur> {
  const res = await fetch(`${instance}/ia-server-config`, { headers: { ...EN_TETES_BANC } });
  if (!res.ok) return { available: false };
  const json = (await res.json()) as Partial<ConfigServeur>;
  return {
    available: json.available === true,
    model: typeof json.model === 'string' ? json.model : undefined,
  };
}

/** Tampon de fraicheur de l'instance (`/dist/skills-meta.json`), s'il est servi. */
export async function lireFraicheur(
  instance: string
): Promise<{ libVersion?: string; commit?: string }> {
  try {
    const res = await fetch(`${instance}/dist/skills-meta.json`, {
      headers: { ...EN_TETES_BANC },
    });
    if (!res.ok) return {};
    const json = (await res.json()) as Record<string, unknown>;
    return {
      libVersion: typeof json.libVersion === 'string' ? json.libVersion : undefined,
      commit: typeof json.commit === 'string' ? json.commit : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Le Studio lit ses skills par des URL RELATIVES (`/dist/skills.json`), qui
 * n'ont pas de sens sous Node. On les resout contre l'instance : le banc lit
 * ainsi les MEMES fiches que le Studio en ligne. Seules les URL commencant par
 * une barre sont touchees.
 */
export function installerFetchRelatif(instance: string): void {
  const origine = globalThis.fetch;
  const relatif: typeof fetch = (input, init) =>
    typeof input === 'string' && input.startsWith('/')
      ? origine(new URL(input, `${instance}/`), init)
      : origine(input, init);
  globalThis.fetch = relatif;
}

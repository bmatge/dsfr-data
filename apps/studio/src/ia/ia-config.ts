/**
 * Studio IA - Configuration IA (URL, modèle, jeton, sonde des capacités).
 *
 * Le Studio remplace l'Assistant IA comme entrée usager (#1081) : il porte
 * donc lui-même le formulaire qui, jusqu'ici, ne vivait que dans l'Assistant.
 * Sans lui, un déploiement sans jeton serveur laissait le Studio inutilisable
 * (« configure une clé dans l'Assistant IA », devenu introuvable).
 *
 * La clé de stockage est CELLE du transport commun (`IA_CONFIG_KEY`) : une
 * configuration saisie ici vaut pour l'ancien Assistant et pour les
 * assistants contextuels, et réciproquement. L'enregistrement FUSIONNE avec
 * l'existant : les réglages propres à l'ancien Assistant (instructions,
 * paramètres avancés) survivent à un enregistrement depuis le Studio.
 */

import {
  IA_CONFIG_KEY,
  IA_PROXY_DEFAULT_ENDPOINT,
  IA_PROXY_ENDPOINT,
  getServerConfig,
  loadUserConfig,
  proxyFetch,
  runCapabilityProbe,
  toastSuccess,
  userProxyHeaders,
  type ProbeHttpResult,
  type ProbeIO,
  type ProbeReport,
  type UserIAConfig,
} from '@dsfr-data/shared';

/** URL par défaut du gateway (Albert, Etalab). */
export const DEFAULT_API_URL = 'https://albert.api.etalab.gouv.fr/v1/chat/completions';
/** Modèle par défaut : openweight-large = gpt-oss-120b côté Albert. */
export const DEFAULT_MODEL = 'openweight-large';
/** Valeur de l'option « Personnalisé… » du select de modèle. */
export const MODELE_PERSONNALISE = '__custom__';

/** Modèles proposés dans la liste (les autres passent par « Personnalisé… »). */
export const MODELES_PROPOSES = [
  'openweight-large',
  'openweight-medium',
  'openweight-small',
  'albert-large',
] as const;

function champ<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/** Modèle choisi : option de la liste, ou champ « Personnalisé… ». */
export function lireModele(): string {
  const select = champ<HTMLSelectElement>('ia-model');
  if (!select) return DEFAULT_MODEL;
  if (select.value === MODELE_PERSONNALISE) {
    return champ<HTMLInputElement>('ia-model-custom')?.value.trim() || DEFAULT_MODEL;
  }
  return select.value || DEFAULT_MODEL;
}

/** Pose un modèle : option connue, sinon « Personnalisé… » et champ libre. */
export function appliquerModele(model: string): void {
  const select = champ<HTMLSelectElement>('ia-model');
  const custom = champ<HTMLInputElement>('ia-model-custom');
  if (!select) return;
  const connu = (MODELES_PROPOSES as readonly string[]).includes(model);
  select.value = connu ? model : MODELE_PERSONNALISE;
  if (custom) {
    custom.value = connu ? '' : model;
    custom.hidden = connu;
  }
}

/** Affiche le champ libre quand « Personnalisé… » est choisi. */
export function surChangementModele(): void {
  const select = champ<HTMLSelectElement>('ia-model');
  const custom = champ<HTMLInputElement>('ia-model-custom');
  if (select && custom) custom.hidden = select.value !== MODELE_PERSONNALISE;
}

/**
 * Configuration du formulaire, enregistrée ou non : c'est elle qui sert au
 * prochain message, comme dans l'ancien Assistant (on essaie une clé avant
 * de la garder).
 */
export function lireConfigFormulaire(): UserIAConfig {
  return {
    apiUrl: champ<HTMLInputElement>('ia-api-url')?.value.trim() || DEFAULT_API_URL,
    model: lireModele(),
    token: champ<HTMLInputElement>('ia-token')?.value.trim() ?? '',
  };
}

/** Remplit le formulaire depuis la configuration enregistrée (ou le serveur). */
export function chargerConfigIA(): void {
  const saved = loadUserConfig();
  const server = getServerConfig();
  const apiUrl = champ<HTMLInputElement>('ia-api-url');
  if (apiUrl) apiUrl.value = saved.apiUrl || server?.apiUrl || DEFAULT_API_URL;
  appliquerModele(saved.token ? saved.model : server?.model || saved.model || DEFAULT_MODEL);
  const token = champ<HTMLInputElement>('ia-token');
  if (token) token.value = saved.token;
}

/** Lit l'objet enregistré tel quel (il peut porter des champs de l'ancien Assistant). */
function lireEnregistre(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(IA_CONFIG_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Enregistre le formulaire, en conservant les réglages que le Studio n'affiche pas. */
export function enregistrerConfigIA(): void {
  const config = lireConfigFormulaire();
  try {
    localStorage.setItem(IA_CONFIG_KEY, JSON.stringify({ ...lireEnregistre(), ...config }));
  } catch {
    // stockage indisponible : la config du formulaire sert quand même
  }
  majBadgeIA();
  toastSuccess('Configuration IA enregistrée.');
}

/** Oublie la configuration personnelle : retour au jeton serveur s'il existe. */
export function reinitialiserConfigIA(): void {
  try {
    localStorage.removeItem(IA_CONFIG_KEY);
  } catch {
    // rien à oublier
  }
  const server = getServerConfig();
  const apiUrl = champ<HTMLInputElement>('ia-api-url');
  if (apiUrl) apiUrl.value = server?.apiUrl || DEFAULT_API_URL;
  appliquerModele(server?.model || DEFAULT_MODEL);
  const token = champ<HTMLInputElement>('ia-token');
  if (token) token.value = '';
  majBadgeIA();
  toastSuccess('Configuration IA réinitialisée.');
}

/** Mode effectif, tel que le prochain message l'emploiera. */
export function modeIA(): 'user' | 'server' | 'none' {
  const config = lireConfigFormulaire();
  if (config.token) return 'user';
  return getServerConfig()?.available ? 'server' : 'none';
}

/** Pastille du chat et de la section : d'où vient l'IA. */
export function majBadgeIA(): void {
  const libelles = {
    user: { texte: 'Clé perso', classe: 'fr-badge--info' },
    server: { texte: 'IA serveur', classe: 'fr-badge--success' },
    none: { texte: 'IA non configurée', classe: 'fr-badge--warning' },
  } as const;
  const { texte, classe } = libelles[modeIA()];
  for (const id of ['ia-mode-badge', 'ia-config-badge']) {
    const badge = champ<HTMLElement>(id);
    if (!badge) continue;
    badge.textContent = texte;
    badge.className = `fr-badge fr-badge--sm ${classe}`;
  }
}

async function versResultat(res: Response): Promise<ProbeHttpResult> {
  let json: unknown = {};
  try {
    json = await res.json();
  } catch {
    // corps non JSON : seul le statut compte
  }
  return { status: res.status, json };
}

/**
 * Transport de la sonde, selon le mode. Une seule tentative par étape
 * (`proxyFetch`, pas `postProxy`) : la sonde lit elle-même le statut, qu'un
 * retry sur 429 lui cacherait. `null` = rien à sonder.
 */
export function transportDeSonde(config: UserIAConfig = lireConfigFormulaire()): ProbeIO | null {
  if (!config.token && getServerConfig()?.available) {
    return {
      model: getServerConfig()?.model || config.model,
      serverMode: true,
      chat: async (body) => versResultat(await proxyFetch(IA_PROXY_DEFAULT_ENDPOINT, {}, { body })),
    };
  }
  if (!config.token || !config.apiUrl) return null;
  const vers = (url: string) => userProxyHeaders(url, config.token);
  return {
    model: config.model,
    serverMode: false,
    apiUrl: config.apiUrl,
    chat: async (body) =>
      versResultat(await proxyFetch(IA_PROXY_ENDPOINT, vers(config.apiUrl), { body })),
    get: async (url) =>
      versResultat(await proxyFetch(IA_PROXY_ENDPOINT, vers(url), { method: 'GET' })),
    post: async (url, body) =>
      versResultat(await proxyFetch(IA_PROXY_ENDPOINT, vers(url), { body })),
  };
}

/** Rend le rapport de sonde par l'API DOM (le détail vient du gateway : jamais d'innerHTML). */
export function rendreRapport(out: HTMLElement, report: ProbeReport): void {
  out.replaceChildren();
  const liste = document.createElement('ul');
  liste.className = 'studio-probe__steps fr-text--sm';
  for (const etape of report.steps) {
    const li = document.createElement('li');
    li.dataset.ok = etape.ok ? 'true' : 'false';
    const statut = document.createElement('strong');
    statut.textContent = etape.ok ? 'OK' : 'Échec';
    li.append(statut, ` · ${etape.name} — ${etape.detail}`);
    liste.appendChild(li);
  }
  const note = document.createElement('p');
  note.className = 'fr-text--xs fr-mb-0';
  const memorise = report.capabilities.probedAt > 0 && (report.steps[0]?.ok ?? false);
  note.textContent = memorise
    ? 'Capacités mémorisées : elles font foi pour les prochains messages.'
    : 'Échec de connexion : capacités non mémorisées.';
  out.append(liste, note);
}

/** Bouton « Sonder les capacités ». */
export async function sonderCapacites(): Promise<void> {
  const bouton = champ<HTMLButtonElement>('probe-capabilities-btn');
  const out = champ<HTMLElement>('probe-capabilities-result');
  if (!out) return;
  const io = transportDeSonde();
  if (!io) {
    out.textContent =
      'Renseignez une URL d’API et un jeton (ou utilisez un déploiement avec jeton serveur), puis relancez la sonde.';
    return;
  }
  if (bouton) bouton.disabled = true;
  out.textContent = 'Sonde en cours…';
  try {
    rendreRapport(out, await runCapabilityProbe(io));
  } catch (err) {
    out.textContent = `Erreur de sonde : ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    if (bouton) bouton.disabled = false;
  }
}

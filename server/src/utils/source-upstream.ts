/**
 * Source publiée (ADR-165, #1361) : l'URL amont d'une source est FIXÉE par
 * sa configuration enregistrée, jamais par la requête du client.
 *
 * Ce module est pur (aucun accès base, aucun réseau) pour être testé sans
 * MariaDB. La route `/api/public/sources/:token/records` et sa jumelle
 * authentifiée `/api/sources/:id/records` s'appuient sur lui.
 *
 * Règle de sécurité : une clé d'API n'est jamais associée à une URL choisie
 * par le client (sinon la route serait un proxy ouvert authentifié, et tout
 * ce que la clé sait lire deviendrait lisible par tout lecteur de la page).
 */

/** Ce que `sources.config_json` porte pour une source à connexion. */
export interface SourceUpstreamConfig {
  apiUrl?: unknown;
  documentId?: unknown;
  tableId?: unknown;
  connectionId?: unknown;
  apiKey?: unknown;
  isPublic?: unknown;
}

/** Ce que `connections` porte, une fois `config_json` lu et la clé déchiffrée. */
export interface ConnectionForUpstream {
  type?: unknown;
  url?: unknown;
  apiKey?: string | null;
}

export interface ResolvedUpstream {
  /** URL amont, `https` seulement. */
  url: string;
  /** En-têtes à envoyer à l'amont (la clé y est, jamais dans la réponse). */
  headers: Record<string, string>;
}

/**
 * Une source est publiable si elle n'est pas lisible sans l'instance : une
 * table Grist dont la source porte une clé, une connexion, ou un document
 * déclaré non public. Lot 1 (ADR-165) : Grist seulement. Une source
 * manuelle, une jointure, une URL ouverte n'ont rien à publier : leur code
 * généré marche déjà tel quel.
 */
export function isPublishableSource(
  type: unknown,
  config: SourceUpstreamConfig | null | undefined
): boolean {
  if (type !== 'grist') return false;
  if (!config || typeof config !== 'object') return false;
  const hasKey = typeof config.apiKey === 'string' && config.apiKey.trim().length > 0;
  const privateDoc = config.isPublic === false;
  const viaConnection = typeof config.connectionId === 'string' && config.connectionId !== '';
  return hasKey || privateDoc || viaConnection;
}

function httpsOrNull(value: unknown): URL | null {
  if (typeof value !== 'string' || value === '') return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    if (u.port && u.port !== '443') return null;
    return u;
  } catch {
    return null;
  }
}

/**
 * Résout l'URL amont et les en-têtes d'une source Grist à partir de sa
 * configuration et, si elle en a une, de sa connexion.
 *
 * - L'URL est rebâtie depuis `documentId` + `tableId` et l'URL de serveur de
 *   la connexion ; à défaut, `apiUrl` de la source est lue telle quelle, mais
 *   seulement si son chemin est bien `/api/docs/<doc>/tables/<table>/records`.
 * - La clé vient de la connexion d'abord (chiffrée au repos), sinon de la
 *   source (héritage : `apiKey` copié sur la source à sa création).
 * - Rend `null` quand rien ne permet de fixer une URL sûre : la route répond
 *   alors 404, sans contacter personne.
 */
export function resolveGristUpstream(
  config: SourceUpstreamConfig | null | undefined,
  connection: ConnectionForUpstream | null | undefined
): ResolvedUpstream | null {
  if (!config || typeof config !== 'object') return null;

  const docId = typeof config.documentId === 'string' ? config.documentId : '';
  const tableId = typeof config.tableId === 'string' ? config.tableId : '';

  let url: URL | null = null;
  const base = httpsOrNull(connection?.url);
  if (base && docId && tableId) {
    url = new URL(
      `/api/docs/${encodeURIComponent(docId)}/tables/${encodeURIComponent(tableId)}/records`,
      base.origin
    );
  } else {
    const fromSource = httpsOrNull(config.apiUrl);
    if (fromSource && /^\/api\/docs\/[^/]+\/tables\/[^/]+\/records$/.test(fromSource.pathname)) {
      url = new URL(fromSource.pathname, fromSource.origin);
    }
  }
  if (!url) return null;

  const key =
    (typeof connection?.apiKey === 'string' && connection.apiKey.trim()) ||
    (typeof config.apiKey === 'string' && config.apiKey.trim()) ||
    '';

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;
  return { url: url.toString(), headers };
}

/** Jeton de partage : un UUID v4, rien d'autre n'atteint la base. */
export function isWellFormedToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)
  );
}

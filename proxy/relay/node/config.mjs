// Relais cachable (ADR-155) — configuration : fichier JSON et variables d'environnement.
//
// Tout ce qui est refusé ici l'est AU DÉMARRAGE : une configuration douteuse
// n'ouvre pas de port. Liste blanche vide, joker, adresse IP en guise d'hôte,
// clé sans préfixe de chemin, clé absente de l'environnement, champ inconnu
// (une faute de frappe sur `pathPrefixes` ne doit pas ouvrir tout l'hôte).

import { isIP } from 'node:net';
import { isValidHostname } from './addresses.mjs';
import { isSafePath } from './target.mjs';

export class ConfigError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

export const DEFAULTS = Object.freeze({
  listenHost: '127.0.0.1',
  listenPort: 8155,
  prefix: '/donnees-relais',
  ttl: 300,
  staleWhileRevalidate: 60,
  staleIfError: 3600,
  contentTypes: Object.freeze(['application/json', 'application/geo+json', 'text/csv']),
  limits: Object.freeze({
    timeoutMs: 10000,
    maxBytes: 10 * 1024 * 1024,
    maxRedirects: 3,
    maxUrlLength: 8000,
    cacheMaxBytes: 64 * 1024 * 1024,
    cacheMaxEntries: 2000,
    rateLimitRequests: 600,
    rateLimitWindowSeconds: 60,
    maxConnections: 256,
    maxUpstreamRequests: 16,
    maxPendingBytes: 64 * 1024 * 1024,
  }),
});

/** Bornes de chaque plafond : [minimum, maximum]. Le contrat fixe certains maximums. */
const LIMIT_BOUNDS = Object.freeze({
  timeoutMs: [100, 60000],
  maxBytes: [1024, 100 * 1024 * 1024],
  maxRedirects: [0, 3], // « trois au plus » : réglable à la baisse seulement
  maxUrlLength: [256, 8000],
  cacheMaxBytes: [0, 4 * 1024 * 1024 * 1024],
  cacheMaxEntries: [0, 1000000],
  rateLimitRequests: [1, 1000000],
  rateLimitWindowSeconds: [1, 3600],
  maxConnections: [1, 65535],
  maxUpstreamRequests: [1, 1024],
  maxPendingBytes: [2048, 4 * 1024 * 1024 * 1024],
});

/**
 * Types de contenu qu'un intégrateur peut autoriser : une liste FERMÉE de
 * formats de données, inertes sur l'origine du site. Une liste noire (« ni
 * html, ni script ») laissait passer `text/jscript`, `text/css` ou
 * `multipart/x-mixed-replace`.
 */
export const ALLOWABLE_CONTENT_TYPES = Object.freeze([
  'application/json',
  'application/geo+json',
  'application/vnd.geo+json',
  'application/ld+json',
  'application/x-ndjson',
  'text/csv',
  'text/tab-separated-values',
  'text/plain',
]);

/**
 * Suffixes de noms réservés aux réseaux internes : jamais un portail public.
 * La vraie défense reste l'adresse après résolution (C-SSRF-6) ; ce refus évite
 * de démarrer sur une liste blanche qui la met d'emblée à l'épreuve.
 */
const INTERNAL_SUFFIXES = Object.freeze([
  '.localhost',
  '.localdomain',
  '.local',
  '.internal',
  '.home.arpa',
  '.lan',
  '.intranet',
  '.corp',
  '.home',
  '.private',
]);

const TOP_LEVEL_KEYS = [
  '$comment',
  'listen',
  'prefix',
  'hosts',
  'ttl',
  'staleWhileRevalidate',
  'staleIfError',
  'contentTypes',
  'trustedProxies',
  'limits',
  'logQuery',
  'logPath',
];
const HOST_KEYS = [
  'ttl',
  'sharedTtl',
  'staleWhileRevalidate',
  'staleIfError',
  'pathPrefixes',
  'key',
];
const KEY_KEYS = ['header', 'prefix', 'env'];

const TOKEN_RE = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
const MEDIA_TYPE_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const PREFIX_RE = /^\/[A-Za-z0-9\-._~/]*[A-Za-z0-9\-._~]$/;
const ENV_NAME_RE = /^[A-Z][A-Z0-9_]*$/;
/** Valeur d'en-tête : ASCII imprimable et espace. Ni CR, ni LF, ni NUL. */
const HEADER_VALUE_RE = /^[\x20-\x7e]+$/;

/** En-têtes qu'une clé ne peut pas occuper : ils appartiennent au transport. */
const RESERVED_KEY_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'keep-alive',
  'proxy-authorization',
  'proxy-connection',
  'accept',
  'accept-encoding',
  'user-agent',
  'cookie',
  'origin',
  'referer',
  'forwarded',
  'x-forwarded-for',
  'x-real-ip',
]);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {Record<string, unknown>} object
 * @param {readonly string[]} allowed
 * @param {string} where
 */
function rejectUnknownKeys(object, allowed, where) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      throw new ConfigError(`${where} : champ inconnu « ${key} ».`);
    }
  }
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {string} where
 * @returns {number}
 */
function integer(value, min, max, where) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${where} : entier attendu entre ${min} et ${max}.`);
  }
  return value;
}

/**
 * @param {string | undefined} raw
 * @param {string} name
 * @returns {number | undefined}
 */
function envInteger(raw, name) {
  if (raw === undefined || raw === '') return undefined;
  if (!/^\d{1,9}$/.test(raw)) throw new ConfigError(`${name} : entier attendu.`);
  return Number(raw);
}

/**
 * Valide une configuration brute (objet lu du fichier JSON) et la complète par
 * l'environnement. Rend une configuration figée, prête à l'emploi.
 *
 * @param {unknown} raw
 * @param {Record<string, string | undefined>} [env]
 */
export function validateConfig(raw, env = {}) {
  if (!isPlainObject(raw)) throw new ConfigError('La configuration doit être un objet JSON.');
  rejectUnknownKeys(raw, TOP_LEVEL_KEYS, 'configuration');
  /** Ce qui est accepté mais mérite d'être dit au démarrage. Jamais de valeur de clé. */
  const warnings = [];

  // `$comment` : le seul champ libre, pour annoter un fichier JSON (qui n'a pas
  // de commentaires). Du texte, ignoré ; à la racine seulement.
  const comment = raw.$comment;
  const isText = (value) => typeof value === 'string';
  if (comment !== undefined && !isText(comment)) {
    if (!Array.isArray(comment) || !comment.every(isText)) {
      throw new ConfigError('$comment : texte, ou liste de textes, attendu.');
    }
  }

  // --- Écoute ---
  const listen = raw.listen ?? {};
  if (!isPlainObject(listen)) throw new ConfigError('listen : objet attendu.');
  rejectUnknownKeys(listen, ['host', 'port'], 'listen');
  const listenHost = env.RELAY_LISTEN || listen.host || DEFAULTS.listenHost;
  if (typeof listenHost !== 'string' || isIP(listenHost) === 0) {
    throw new ConfigError('listen.host : adresse IP attendue (127.0.0.1 par défaut).');
  }
  if (!/^(?:127\.|::1$)/.test(listenHost)) {
    warnings.push(
      `listen.host : ${listenHost} n'est pas la boucle locale. Le relais ne chiffre rien, ne compresse rien et ne borne pas les connexions par adresse : il doit rester derrière le serveur web du site, joignable de lui seul.`
    );
  }
  const listenPort = integer(
    envInteger(env.RELAY_PORT, 'RELAY_PORT') ?? listen.port ?? DEFAULTS.listenPort,
    0,
    65535,
    'listen.port'
  );

  // --- Préfixe du relais ---
  const prefix = env.RELAY_PREFIX || raw.prefix || DEFAULTS.prefix;
  if (typeof prefix !== 'string' || !PREFIX_RE.test(prefix) || !isSafePath(prefix)) {
    throw new ConfigError(
      'prefix : chemin attendu, commençant par « / », sans barre finale (ex. /donnees-relais).'
    );
  }
  if (prefix === '/health' || prefix.startsWith('/health/')) {
    throw new ConfigError(
      'prefix : « /health » est la route de santé du relais, elle ne peut pas servir de préfixe.'
    );
  }

  // --- Durées de cache par défaut ---
  const ttl = integer(
    envInteger(env.RELAY_TTL, 'RELAY_TTL') ?? raw.ttl ?? DEFAULTS.ttl,
    1,
    86400,
    'ttl'
  );
  const staleWhileRevalidate = integer(
    raw.staleWhileRevalidate ?? DEFAULTS.staleWhileRevalidate,
    0,
    86400,
    'staleWhileRevalidate'
  );
  const staleIfError = integer(
    raw.staleIfError ?? DEFAULTS.staleIfError,
    0,
    604800,
    'staleIfError'
  );

  // --- Liste blanche ---
  const rawHosts = raw.hosts ?? {};
  if (!isPlainObject(rawHosts)) {
    throw new ConfigError('hosts : objet attendu, une entrée par hôte autorisé.');
  }
  /** @type {Record<string, unknown>} */
  const hostEntries = { ...rawHosts };
  for (const name of (env.RELAY_HOSTS ?? '').split(',')) {
    const trimmed = name.trim();
    if (trimmed !== '' && !Object.hasOwn(hostEntries, trimmed)) hostEntries[trimmed] = {};
  }

  /** @type {Map<string, Readonly<HostConfig>>} */
  const hosts = new Map();
  for (const [name, value] of Object.entries(hostEntries)) {
    const where = `hosts["${name}"]`;
    if (name.includes('*')) {
      throw new ConfigError(
        `${where} : pas de joker, la liste blanche est en correspondance exacte.`
      );
    }
    if (!isValidHostname(name)) {
      throw new ConfigError(
        `${where} : nom d'hôte attendu, en minuscules, sans port, sans schéma, sans point final, et pas une adresse IP.`
      );
    }
    if (INTERNAL_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
      throw new ConfigError(
        `${where} : nom réservé à un réseau interne. Le relais ne joint que des portails publics.`
      );
    }
    if (!isPlainObject(value)) throw new ConfigError(`${where} : objet attendu.`);
    rejectUnknownKeys(value, HOST_KEYS, where);

    const hostTtl = integer(value.ttl ?? ttl, 1, 86400, `${where}.ttl`);
    const sharedTtl = integer(value.sharedTtl ?? hostTtl, 1, 86400, `${where}.sharedTtl`);

    const rawPrefixes = value.pathPrefixes ?? [];
    if (!Array.isArray(rawPrefixes))
      throw new ConfigError(`${where}.pathPrefixes : liste attendue.`);
    const pathPrefixes = rawPrefixes.map((entry, index) => {
      if (typeof entry !== 'string' || entry.length < 2 || !isSafePath(entry)) {
        throw new ConfigError(
          `${where}.pathPrefixes[${index}] : chemin attendu, commençant par « / », sans « .. », « // » ni encodage, et autre que « / ».`
        );
      }
      return entry;
    });

    /** @type {{ header: string, value: string, secret: string } | null} */
    let key = null;
    if (value.key !== undefined) {
      if (!isPlainObject(value.key)) throw new ConfigError(`${where}.key : objet attendu.`);
      rejectUnknownKeys(value.key, KEY_KEYS, `${where}.key`);
      const header = value.key.header ?? 'Authorization';
      if (
        typeof header !== 'string' ||
        !TOKEN_RE.test(header) ||
        RESERVED_KEY_HEADERS.has(header.toLowerCase())
      ) {
        throw new ConfigError(`${where}.key.header : nom d'en-tête invalide ou réservé.`);
      }
      const valuePrefix = value.key.prefix ?? '';
      if (
        typeof valuePrefix !== 'string' ||
        (valuePrefix !== '' && !HEADER_VALUE_RE.test(valuePrefix))
      ) {
        throw new ConfigError(`${where}.key.prefix : texte ASCII attendu (ex. « Apikey  »).`);
      }
      const envName = value.key.env;
      if (typeof envName !== 'string' || !ENV_NAME_RE.test(envName)) {
        throw new ConfigError(
          `${where}.key.env : nom de variable d'environnement attendu. La clé elle-même ne s'écrit jamais dans le fichier.`
        );
      }
      const secret = env[envName];
      // Le message nomme la variable, jamais sa valeur.
      if (typeof secret !== 'string' || secret.length < 8 || !HEADER_VALUE_RE.test(secret)) {
        throw new ConfigError(
          `${where}.key : la variable d'environnement ${envName} est absente, trop courte (8 caractères au moins) ou contient des caractères interdits.`
        );
      }
      // Une clé sans préfixe de chemin rendrait public TOUT ce qu'elle sait lire.
      if (pathPrefixes.length === 0) {
        throw new ConfigError(
          `${where} : une clé exige au moins un préfixe de chemin autorisé (pathPrefixes).`
        );
      }
      key = { header, value: `${valuePrefix}${secret}`, secret };
    }

    hosts.set(
      name,
      Object.freeze({
        name,
        ttl: hostTtl,
        sharedTtl,
        staleWhileRevalidate: integer(
          value.staleWhileRevalidate ?? staleWhileRevalidate,
          0,
          86400,
          `${where}.staleWhileRevalidate`
        ),
        staleIfError: integer(
          value.staleIfError ?? staleIfError,
          0,
          604800,
          `${where}.staleIfError`
        ),
        pathPrefixes: Object.freeze(pathPrefixes),
        key: key ? Object.freeze(key) : null,
      })
    );
  }
  if (hosts.size === 0) {
    throw new ConfigError(
      'Liste blanche vide : le relais refuse de démarrer. Déclarer au moins un hôte dans « hosts » ou dans RELAY_HOSTS.'
    );
  }

  // --- Types de contenu ---
  const rawTypes = raw.contentTypes ?? DEFAULTS.contentTypes;
  if (!Array.isArray(rawTypes) || rawTypes.length === 0) {
    throw new ConfigError('contentTypes : liste non vide attendue.');
  }
  const contentTypes = rawTypes.map((entry) => {
    if (typeof entry !== 'string' || !MEDIA_TYPE_RE.test(entry)) {
      throw new ConfigError(
        'contentTypes : types de média en minuscules attendus (ex. application/json).'
      );
    }
    // Le relais répond sur l'origine du site : rien d'exécutable ni d'affichable.
    // Liste fermée, pas liste noire : ce qui n'est pas un format de données connu est refusé.
    if (!ALLOWABLE_CONTENT_TYPES.includes(entry)) {
      throw new ConfigError(
        `contentTypes : « ${entry} » est refusé (jamais de contenu actif sur l'origine du site). Types autorisables : ${ALLOWABLE_CONTENT_TYPES.join(', ')}.`
      );
    }
    return entry;
  });

  // --- Mandataires de confiance ---
  const rawProxies = raw.trustedProxies ?? [];
  if (!Array.isArray(rawProxies))
    throw new ConfigError("trustedProxies : liste d'adresses IP attendue.");
  const trustedProxies = rawProxies.map((entry) => {
    if (typeof entry !== 'string' || isIP(entry) === 0) {
      throw new ConfigError(
        'trustedProxies : adresses IP attendues, une par mandataire (ni nom, ni plage CIDR).'
      );
    }
    // Une adresse que le relais ne verra jamais telle quelle serait acceptée en
    // silence et jamais reconnue : la limite de débit deviendrait globale sans
    // que rien ne le dise.
    if (entry.includes('%')) {
      throw new ConfigError('trustedProxies : pas d’identifiant de zone (« %eth0 »).');
    }
    if (isIP(entry) === 6 && entry.includes('.')) {
      throw new ConfigError(
        'trustedProxies : écrire une IPv4 mappée (« ::ffff:a.b.c.d ») sous sa forme IPv4 (« a.b.c.d »).'
      );
    }
    if (entry === '0.0.0.0' || /^[0:]+$/.test(entry)) {
      throw new ConfigError(
        'trustedProxies : l’adresse nulle ne désigne aucun mandataire (elle ne vaut pas « tous »).'
      );
    }
    return entry;
  });

  // --- Plafonds ---
  const rawLimits = raw.limits ?? {};
  if (!isPlainObject(rawLimits)) throw new ConfigError('limits : objet attendu.');
  rejectUnknownKeys(
    rawLimits,
    [...Object.keys(LIMIT_BOUNDS), 'maxUpstreamRequestsPerClient'],
    'limits'
  );
  /** @type {Record<string, number>} */
  const limits = {};
  for (const [name, [min, max]] of Object.entries(LIMIT_BOUNDS)) {
    limits[name] = integer(rawLimits[name] ?? DEFAULTS.limits[name], min, max, `limits.${name}`);
  }
  // Part d'un seul client dans les places amont : la moitié par défaut. Sans
  // part, une adresse qui demande N URL lentes prive tous les autres visiteurs.
  limits.maxUpstreamRequestsPerClient = integer(
    rawLimits.maxUpstreamRequestsPerClient ?? Math.ceil(limits.maxUpstreamRequests / 2),
    1,
    limits.maxUpstreamRequests,
    'limits.maxUpstreamRequestsPerClient'
  );
  // Un client peut tenir la moitié des octets en attente d'écriture : il faut
  // qu'une réponse de taille maximale y entre, sinon elle ne serait jamais servie.
  if (limits.maxPendingBytes < 2 * limits.maxBytes) {
    throw new ConfigError(
      'limits.maxPendingBytes : au moins deux fois limits.maxBytes (un client en tient la moitié).'
    );
  }

  if (raw.logQuery !== undefined && typeof raw.logQuery !== 'boolean') {
    throw new ConfigError('logQuery : booléen attendu.');
  }
  if (raw.logPath !== undefined && typeof raw.logPath !== 'boolean') {
    throw new ConfigError('logPath : booléen attendu.');
  }

  return Object.freeze({
    listenHost,
    listenPort,
    prefix,
    hosts,
    contentTypes: Object.freeze(contentTypes),
    trustedProxies: Object.freeze(trustedProxies),
    limits: Object.freeze(limits),
    logQuery: raw.logQuery === true,
    // Le chemin est journalisé par défaut ; une API qui porte une saisie dans
    // le chemin (`/recherche/<nom>/…`) le retire.
    logPath: raw.logPath !== false,
    warnings: Object.freeze(warnings),
  });
}

/**
 * @typedef {object} HostConfig
 * @property {string} name le nom d'hôte, tel qu'écrit dans la configuration
 * @property {number} ttl `max-age` servi au navigateur
 * @property {number} sharedTtl `s-maxage`, et fraîcheur du cache du relais
 * @property {number} staleWhileRevalidate
 * @property {number} staleIfError
 * @property {readonly string[]} pathPrefixes
 * @property {{ header: string, value: string, secret: string } | null} key
 */

/**
 * Charge la configuration : fichier désigné par `RELAY_CONFIG` (facultatif),
 * complété par `RELAY_HOSTS`, `RELAY_PORT`, `RELAY_LISTEN`, `RELAY_PREFIX`, `RELAY_TTL`.
 *
 * @param {Record<string, string | undefined>} env
 * @param {(path: string) => string} readFile
 */
export function loadConfig(env, readFile) {
  let raw = {};
  if (env.RELAY_CONFIG) {
    let text;
    try {
      text = readFile(env.RELAY_CONFIG);
    } catch {
      throw new ConfigError(`RELAY_CONFIG : fichier illisible (${env.RELAY_CONFIG}).`);
    }
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ConfigError(`RELAY_CONFIG : JSON invalide (${env.RELAY_CONFIG}).`);
    }
  }
  return validateConfig(raw, env);
}

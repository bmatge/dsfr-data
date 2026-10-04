/**
 * Bornage du proxy generique (`/cors-proxy`, `/ia-proxy`) — docs/SECURITY.md
 * §« Proxy generique ».
 *
 * Ces deux routes lisent leur cible dans l'en-tete client `X-Target-URL`. Sans
 * borne, elles relaient vers n'importe quelle adresse, y compris celles que
 * seul le serveur peut joindre. Ce module porte LA regle, et il est la source
 * de verite des quatre endroits qui l'appliquent :
 *
 *   - developpement : les middlewares de `vite.config.ts` (`creerRelais`) ;
 *   - deploiement : `docker/garde-proxy.conf` (inclus par `docker/nginx.conf` et
 *     `docker/nginx-db.conf`) et `proxy/nginx/nginx.conf`, qui recopient les
 *     MEMES motifs dans des `map` nginx.
 *
 * `tests/proxy/garde-proxy-coherence.test.ts` echoue si un motif nginx differe
 * d'un motif d'ici, et rejoue la meme table de cas des deux cotes.
 *
 * La regle, dans l'ordre :
 *   1. un nom reserve aux reseaux locaux est refuse (`MOTIF_NOM_RESERVE`) ;
 *   2. seule passe une cible `https://<nom DNS public>` sans identifiants ni
 *      port (`MOTIF_CIBLE_ADMISE`) — la forme exigee ecarte d'elle-meme `http`,
 *      toute adresse IP litterale (pointee, decimale, hexadecimale, IPv6), les
 *      noms sans point (`localhost`, services Docker) et `user:pass@hote` ;
 *   3. le domaine de l'instance elle-meme est refuse (`MOTIF_CIBLE_INSTANCE`).
 *
 * Ce que la regle ne voit pas : l'adresse vers laquelle un nom public RESOUT.
 * Le verrou est ailleurs — `https` et port 443 seuls, certificat de l'amont
 * verifie — et sa limite est ecrite dans docs/SECURITY.md.
 *
 * Extension `.cjs` : meme raison que `debit.cjs` (depot `"type": "module"`).
 * Les motifs sont ecrits pour PCRE (nginx) ET pour JavaScript : classes
 * explicites, aucune construction propre a l'un des deux moteurs.
 */

/* global module, require, Buffer */
'use strict';

/** Suffixes reserves aux reseaux locaux ou sans existence publique. */
const SUFFIXES_RESERVES = [
  'localhost',
  'local',
  'localdomain',
  'internal',
  'intranet',
  'lan',
  'home',
  'corp',
  'private',
  'arpa',
  'test',
  'invalid',
  'onion',
];

/** Nom dont le dernier label est reserve : refuse, meme s'il a la bonne forme. */
const MOTIF_NOM_RESERVE = `^https://(?:[a-z0-9-]+\\.)+(?:${SUFFIXES_RESERVES.join('|')})(?:[/?]|$)`;

/**
 * Forme admise : `https://`, des labels DNS separes par des points, un dernier
 * label alphabetique (ou punycode), puis rien, ou un chemin, ou une requete,
 * sans espace ni caractere de controle.
 */
const MOTIF_CIBLE_ADMISE =
  '^https://(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})(?:[/?][^\\x00-\\x20\\x7f]*)?$';

/** Applique a `<hote de l'instance>|<cible>` : la cible vise l'instance elle-meme. */
const MOTIF_CIBLE_INSTANCE = '^([^|]+)\\|https://\\1(?:[/?]|$)';

const RE_NOM_RESERVE = new RegExp(MOTIF_NOM_RESERVE, 'i');
const RE_CIBLE_ADMISE = new RegExp(MOTIF_CIBLE_ADMISE, 'i');
const RE_CIBLE_INSTANCE = new RegExp(MOTIF_CIBLE_INSTANCE, 'i');

/** Corps de requete maximal relaye (le `client_max_body_size 1m` de nginx). */
const TAILLE_MAX_OCTETS = 1024 * 1024;

/** Methodes relayees, par route — ce que l'inventaire des appelants justifie. */
const METHODES = {
  '/cors-proxy': ['GET', 'POST'],
  '/ia-proxy': ['GET', 'POST'],
};

const MESSAGES = {
  'en-tete-absent': 'en-tête X-Target-URL absent',
  'cible-non-admise': 'cible non admise par le proxy',
  'methode-non-admise': 'méthode non admise par le proxy',
  'corps-trop-grand': 'corps de requête trop volumineux',
};

function refus(status, raison) {
  return { ok: false, status, raison };
}

/**
 * Hote d'un en-tete `Host`, sans le port, en minuscules.
 * @param {string | undefined} enTeteHost
 * @returns {string}
 */
function hoteSansPort(enTeteHost) {
  return String(enTeteHost || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

/**
 * Applique la regle a la valeur de `X-Target-URL`.
 *
 * @param {unknown} valeur valeur de l'en-tete, telle que recue
 * @param {string} [hoteInstance] hote par lequel le proxy a ete appele
 * @returns {{ ok: true, url: URL } | { ok: false, status: 400 | 403, raison: string }}
 */
function verifierCible(valeur, hoteInstance) {
  if (typeof valeur !== 'string' || valeur === '') return refus(400, 'en-tete-absent');
  if (RE_NOM_RESERVE.test(valeur)) return refus(403, 'cible-non-admise');
  if (!RE_CIBLE_ADMISE.test(valeur)) return refus(403, 'cible-non-admise');
  if (hoteInstance && RE_CIBLE_INSTANCE.test(`${hoteInstance}|${valeur}`)) {
    return refus(403, 'cible-non-admise');
  }
  // Seconde lecture, par l'analyseur d'URL : ce que le motif a admis doit etre
  // exactement ce que l'analyseur comprend.
  let url;
  try {
    url = new URL(valeur);
  } catch {
    return refus(403, 'cible-non-admise');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return refus(403, 'cible-non-admise');
  }
  return { ok: true, url };
}

function repondreJson(res, status, raison, enTetes) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...enTetes });
  res.end(JSON.stringify({ error: MESSAGES[raison] || raison }));
}

/** En-tetes de la requete entrante qui ne partent jamais vers l'amont. */
const EN_TETES_RETENUS = new Set([
  'host',
  'connection',
  'x-target-url',
  'transfer-encoding',
  'origin',
  'referer',
  // Les cookies sont ceux de l'instance : ils n'ont rien a faire chez un tiers.
  'cookie',
]);

/**
 * Middleware (Connect / `http.createServer`) d'un relais generique borne.
 *
 * Meme contrat que les blocs `location` de nginx : methode, presence et forme de
 * la cible, taille du corps sont verifiees AVANT tout appel amont ; la reponse
 * de l'amont est rendue telle quelle, redirections comprises — jamais suivies.
 *
 * @param {{
 *   methodes: readonly string[],
 *   cors: boolean,
 *   enTetesPreflight?: string,
 *   tailleMaxOctets?: number,
 *   envoyer?: typeof import('node:https').request,
 * }} options
 */
function creerRelais(options) {
  const methodes = options.methodes;
  const tailleMax = options.tailleMaxOctets ?? TAILLE_MAX_OCTETS;
  const envoyer = options.envoyer ?? require('node:https').request;
  const enTetesCors = options.cors ? { 'Access-Control-Allow-Origin': '*' } : {};

  return function relais(req, res) {
    if (req.method === 'OPTIONS') {
      // Sans `cors`, aucun `Access-Control-Allow-Origin` : le preflight d'une
      // autre origine echoue, la route ne sert que l'instance elle-meme.
      res.writeHead(
        204,
        options.cors
          ? {
              ...enTetesCors,
              'Access-Control-Allow-Methods': [...methodes, 'OPTIONS'].join(', '),
              // Echo des en-tetes demandes : toute cle d'API en en-tete passe
              // (parite avec le `*, Authorization` de nginx).
              'Access-Control-Allow-Headers':
                req.headers['access-control-request-headers'] ||
                options.enTetesPreflight ||
                'Content-Type, Authorization, X-Target-URL',
              'Access-Control-Max-Age': '86400',
            }
          : {}
      );
      res.end();
      return;
    }

    if (!methodes.includes(req.method)) {
      repondreJson(res, 405, 'methode-non-admise', enTetesCors);
      return;
    }

    const cible = verifierCible(req.headers['x-target-url'], hoteSansPort(req.headers.host));
    if (!cible.ok) {
      repondreJson(res, cible.status, cible.raison, enTetesCors);
      return;
    }

    if (Number(req.headers['content-length']) > tailleMax) {
      repondreJson(res, 413, 'corps-trop-grand', enTetesCors);
      req.resume();
      return;
    }

    const morceaux = [];
    let recu = 0;
    let trop = false;
    req.on('data', (morceau) => {
      if (trop) return;
      recu += morceau.length;
      if (recu > tailleMax) {
        trop = true;
        repondreJson(res, 413, 'corps-trop-grand', enTetesCors);
        return;
      }
      morceaux.push(morceau);
    });
    req.on('end', () => {
      if (trop) return;
      const corps = Buffer.concat(morceaux);
      const { url } = cible;

      const enTetes = {};
      for (const [cle, val] of Object.entries(req.headers)) {
        if (EN_TETES_RETENUS.has(cle)) continue;
        if (val) enTetes[cle] = Array.isArray(val) ? val[0] : val;
      }
      enTetes['host'] = url.host;
      if (corps.length > 0) enTetes['content-length'] = String(corps.length);

      // `https` et port 443 toujours ; le certificat de l'amont est verifie
      // (defaut de Node). Aucune redirection n'est suivie : la reponse 3xx
      // repart telle quelle.
      const amont = envoyer(
        {
          hostname: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          method: req.method,
          headers: enTetes,
        },
        (reponse) => {
          const rendus = {};
          for (const [cle, val] of Object.entries(reponse.headers)) {
            // Les en-tetes CORS de l'amont ne traversent pas : seul le relais
            // decide de qui peut lire la reponse.
            if (cle.toLowerCase().startsWith('access-control-')) continue;
            rendus[cle] = val;
          }
          if (options.cors) rendus['access-control-allow-origin'] = '*';
          res.writeHead(reponse.statusCode || 502, rendus);
          reponse.pipe(res);
        }
      );

      amont.on('error', (err) => {
        if (res.headersSent) {
          res.end();
          return;
        }
        res.writeHead(502, { 'Content-Type': 'application/json', ...enTetesCors });
        res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
      });

      if (corps.length > 0) amont.write(corps);
      amont.end();
    });
  };
}

module.exports = {
  SUFFIXES_RESERVES,
  MOTIF_NOM_RESERVE,
  MOTIF_CIBLE_ADMISE,
  MOTIF_CIBLE_INSTANCE,
  TAILLE_MAX_OCTETS,
  METHODES,
  MESSAGES,
  hoteSansPort,
  verifierCible,
  creerRelais,
};

// Limites de l'extrait nginx face au contrat du relais (docs/RELAY.md).
//
// Chaque entrée est un test de la suite de conformance qui est ROUGE contre l'extrait
// nginx, et qui le reste : la suite n'est pas adoucie, nginx seul ne sait pas faire ce
// que le test demande. `relais-nginx.test.ts` exige que la liste des tests rouges soit
// EXACTEMENT celle-ci — un rouge de plus est une régression de l'extrait, un rouge de
// moins est une limite levée qu'il faut retirer d'ici, du README de l'extrait et du
// tableau de docs/RELAY.md. `echec` est la raison attendue de l'échec : un test rouge
// pour une AUTRE raison n'est pas la limite documentée.
//
// Ce que chaque limite laisse malgré tout tenir est vérifié par
// `observations.test.mjs`, contre le même nginx.

/**
 * @typedef {object} Limite
 * @property {string} test nom exact du test de `conformance.test.mjs`
 * @property {string} regle règle du contrat
 * @property {string} cle identifiant de la limite, cité par le README de l'extrait
 * @property {RegExp} echec ce que dit l'échec
 */

const TYPES_REFUSES = [
  'HTML de l’amont',
  'SVG de l’amont',
  'JavaScript de l’amont',
  'réponse sans type de l’amont',
].map((sujet) => `C-NAV-3 — ${sujet} : jamais servi sur l’origine du site (502)`);

const TYPES_VOISINS = [
  '`application/json+xml`',
  '`application/jsonx`',
  '`application/jsonp`',
  '`application/xhtml+xml`',
  '`text/xml`',
  '`text/csvx`',
  'une liste de types',
  '`application/octet-stream`',
].map((sujet) => `C-NAV-3 — ${sujet} : le type est comparé EN ENTIER à la liste blanche (502)`);

/** @type {Limite[]} */
export const LIMITES = [
  // nginx répond lui-même, AVANT de choisir une `location` : la réponse ne porte pas
  // les en-têtes du relais. L'amont n'est pas contacté.
  {
    test: 'C-MET-1 — TRACE : 405 avec Allow, l’amont n’est pas contacté',
    regle: 'C-NAV-2, C-NAV-4',
    cle: 'avant-routage',
    echec: /C-NAV-4 — Access-Control-Allow-Origin/,
  },
  {
    test: 'C-SSRF-3 — octet nul encodé dans le segment d’hôte (« ouvert.conformance.test%00 ») : refusé',
    regle: 'C-NAV-2, C-NAV-4',
    cle: 'avant-routage',
    echec: /C-NAV-4 — Access-Control-Allow-Origin/,
  },
  {
    test: 'C-SSRF-4 — chemin piégé, octet nul encodé `%00` : refusé ou contenu sous le préfixe autorisé',
    regle: 'C-NAV-2, C-NAV-4',
    cle: 'avant-routage',
    echec: /C-NAV-4 — Access-Control-Allow-Origin/,
  },
  // nginx ne sait pas refuser une réponse sur son type de contenu : il la sert, sous
  // `application/octet-stream`, au lieu de répondre 502.
  ...[...TYPES_REFUSES, ...TYPES_VOISINS].map((test) => ({
    test,
    regle: 'C-NAV-3',
    cle: 'type-de-contenu',
    echec: /200 !== 502/,
  })),
  // La purge de C-CACHE-6 est tenue par un mémo d'une seconde des 401, 403, 404 et 410.
  {
    test: 'C-CACHE-3 — une 404 de l’amont n’est jamais mise en cache',
    regle: 'C-CACHE-3',
    cle: 'memo-une-seconde',
    echec: /1 !== 2/,
  },
  // nginx n'a pas de plafond de taille de réponse.
  {
    test: 'C-DOS-2 — réponse plus grosse que le plafond : 502, et la connexion à l’amont est coupée EN FLUX',
    regle: 'C-DOS-2',
    cle: 'taille',
    echec: /200 !== 502/,
  },
  {
    test: 'C-DOS-2 — longueur déclarée au-delà du plafond : 502 sans lire le corps',
    regle: 'C-DOS-2',
    cle: 'taille',
    echec: /aborted|socket hang up|ECONNRESET|200 !== 502/i,
  },
];

/** Tests que la suite saute d'elle-même : non observables de l'extérieur (docs/RELAY.md §7). */
export const SAUTES = 3;

/**
 * Plafond global de debit des appels IA cote serveur (#999, epic #993, ADR-143).
 *
 * Module PUR : aucune E/S, aucune variable globale, l'horloge est injectee.
 * Partage par les deux executions du proxy `/ia-proxy-default` :
 *   - production : `scripts/ia-default-server.js` (CommonJS, `require`) ;
 *   - developpement : le middleware de `vite.config.ts` (`import`).
 *
 * Extension `.cjs` (et non `.js`) : le depot est `"type": "module"`, alors que
 * le conteneur execute `ia-default-server.js` en CommonJS hors de tout
 * package.json. Seul un `.cjs` est lu de la meme facon des deux cotes, sans
 * dependre de la version de Node du conteneur (require(esm), detection de
 * syntaxe).
 *
 * Algorithme : seau a jetons sur fenetre glissante. On garde l'horodatage des
 * appels ACCEPTES pendant la derniere fenetre ; tant qu'il y en a moins que le
 * plafond, l'appel passe et consomme un jeton. Au-dela, il est refuse sans rien
 * consommer, et `retryAfter` dit dans combien de SECONDES ENTIERES (RFC 9110,
 * en-tete `Retry-After`) le plus ancien jeton sera rendu — jamais moins de 1.
 */

/* global module */
'use strict';

const MAX_RPM_DEFAUT = 10;
const FENETRE_MS_DEFAUT = 60000;

/**
 * Lit le plafond `IA_MAX_RPM` (appels par minute, tous utilisateurs confondus).
 * Absent, vide, non entier ou inferieur a 1 : valeur par defaut (10).
 *
 * @param {string | undefined} valeur
 * @returns {number}
 */
function lireMaxRpm(valeur) {
  if (valeur === undefined || String(valeur).trim() === '') return MAX_RPM_DEFAUT;
  const n = Number(String(valeur).trim());
  return Number.isInteger(n) && n >= 1 ? n : MAX_RPM_DEFAUT;
}

/**
 * @param {{ maxParMinute?: number, fenetreMs?: number, now?: () => number }} [options]
 */
function creerDebit(options = {}) {
  const maxParMinute = options.maxParMinute ?? MAX_RPM_DEFAUT;
  const fenetreMs = options.fenetreMs ?? FENETRE_MS_DEFAUT;
  const now = options.now ?? Date.now;
  /** Horodatages des appels acceptes, du plus ancien au plus recent. */
  const acceptes = [];

  return {
    /**
     * Tente de consommer un jeton.
     * @returns {{ ok: true, retryAfter: 0 } | { ok: false, retryAfter: number }}
     */
    tenter() {
      const t = now();
      while (acceptes.length > 0 && acceptes[0] <= t - fenetreMs) acceptes.shift();
      if (acceptes.length < maxParMinute) {
        acceptes.push(t);
        return { ok: true, retryAfter: 0 };
      }
      const attenteMs = acceptes[0] + fenetreMs - t;
      return { ok: false, retryAfter: Math.max(1, Math.ceil(attenteMs / 1000)) };
    },
  };
}

/**
 * Reponse 429 commune a la production et au dev : statut, en-tetes et corps
 * JSON. L'en-tete `Access-Control-Allow-Origin` reste pose par chaque appelant.
 *
 * @param {number} retryAfter secondes entieres, >= 1
 */
function reponseRefus(retryAfter) {
  return {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfter),
      // Le transport client lit Retry-After : a exposer si l'appel est cross-origin.
      'Access-Control-Expose-Headers': 'Retry-After',
    },
    body: JSON.stringify({
      error: {
        type: 'rate_limit_exceeded',
        message: `Trop de demandes à l'assistant IA partagé, réessayez dans ${retryAfter} s`,
      },
    }),
  };
}

module.exports = { creerDebit, lireMaxRpm, reponseRefus, MAX_RPM_DEFAUT, FENETRE_MS_DEFAUT };

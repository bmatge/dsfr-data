/**
 * Cle IA serveur : disponible, absente ou DESACTIVEE (IA_DEFAULT_ENABLED).
 *
 * Module PUR, partage par les deux executions du proxy `/ia-proxy-default`
 * (`scripts/ia-default-server.js` en production, middleware de `vite.config.ts`
 * en dev), comme `debit.cjs` — meme raison pour l'extension `.cjs`.
 *
 * Besoin : un deploiement peut vouloir garder sa cle Albert dans le `.env`
 * mais la rendre temporairement indisponible (quota journalier a preserver
 * avant une demonstration, par exemple), pour que chaque usager saisisse sa
 * propre cle dans le Studio. Mettre `IA_DEFAULT_ENABLED=false` suffit : le
 * jeton n'est plus lu, `/ia-proxy-default` repond 503, et `/ia-server-config`
 * le DIT (`disabled: true`) pour que le Studio affiche « Cle serveur
 * desactivee » avec l'aide, plutot que « IA non configuree ».
 *
 * Absente ou toute autre valeur → cle active : comportement inchange.
 */

/* global module */
'use strict';

const VALEURS_DESACTIVEES = new Set(['0', 'false', 'off', 'no', 'non']);

/**
 * Vrai si `IA_DEFAULT_ENABLED` demande explicitement la desactivation.
 * @param {string | undefined} valeur
 */
function estDesactivee(valeur) {
  return VALEURS_DESACTIVEES.has(
    String(valeur ?? '')
      .trim()
      .toLowerCase()
  );
}

/**
 * Lecture de l'environnement : jeton effectif et reponse de `/ia-server-config`.
 * @param {Record<string, string | undefined>} env
 * @param {{ apiUrl: string, model: string }} defauts
 */
function lireConfigDefaut(env, defauts) {
  const desactivee = estDesactivee(env.IA_DEFAULT_ENABLED);
  const token = desactivee ? '' : env.IA_DEFAULT_TOKEN || '';
  const apiUrl = env.IA_DEFAULT_API_URL || defauts.apiUrl;
  const model = env.IA_DEFAULT_MODEL || defauts.model;
  let reponse;
  if (desactivee) {
    reponse = { available: false, disabled: true };
  } else if (token) {
    reponse = { available: true, apiUrl, model };
  } else {
    reponse = { available: false };
  }
  return { desactivee, token, apiUrl, model, reponse };
}

module.exports = { estDesactivee, lireConfigDefaut };

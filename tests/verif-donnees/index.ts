/**
 * Les manifestes de la vérification des données, par domaine.
 *
 * Un manifeste = un domaine = un fichier. Ajouter un contrôle, c'est ajouter
 * une entrée à `checks` du domaine concerné (ou un nouveau fichier et une
 * ligne ici) — jamais toucher au moteur, qui vit dans `tools/oracle`.
 */
import type { Check, Manifest } from '../../tools/oracle/manifest.js';
import { AFFICHAGES } from './affichages.js';
import { BANC } from './banc.js';
import { QUERY } from './query.js';

export const MANIFESTES: Manifest[] = [QUERY, AFFICHAGES, BANC];

/** Tous les contrôles d'un mode, à plat, avec leur domaine. */
export function controlesDuMode(mode: Check['mode']): Array<{ domaine: string; check: Check }> {
  const out: Array<{ domaine: string; check: Check }> = [];
  for (const manifeste of MANIFESTES) {
    for (const check of manifeste.checks) {
      if (check.mode === mode) out.push({ domaine: manifeste.domain, check });
    }
  }
  return out;
}

export { AFFICHAGES, BANC, QUERY };

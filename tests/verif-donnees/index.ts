/**
 * Les manifestes de la vérification des données, par domaine.
 *
 * Un manifeste = un domaine = un fichier. Ajouter un contrôle, c'est ajouter
 * une entrée à `checks` du domaine concerné (ou un nouveau fichier et une
 * ligne ici) — jamais toucher au moteur, qui vit dans `tools/oracle`.
 */
import type { Check, Manifest } from '../../tools/oracle/manifest.js';
import { BANC } from './banc.js';
import { DELEGATION } from './delegation.js';
import { EXPORT_STUDIO } from './export-studio.js';
import { QUERY } from './query.js';

export const MANIFESTES: Manifest[] = [QUERY, DELEGATION, EXPORT_STUDIO, BANC];

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

export { BANC, DELEGATION, EXPORT_STUDIO, QUERY };

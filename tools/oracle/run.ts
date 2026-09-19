/**
 * `npm run verif:expected` — télécharge les lignes brutes de chaque contrôle
 * VIVANT et écrit les valeurs ATTENDUES dans `tools/oracle/out/expected.json`.
 * Le spec Playwright `e2e/verif-donnees.spec.ts` rend ensuite le balisage et
 * compare. Les deux côtés lisent l'API au même moment : l'attendu est produit
 * juste avant le rendu, jamais la veille.
 *
 * Les contrôles déterministes n'ont pas besoin de ce passage : leurs lignes
 * sont dans le dépôt, le spec les recalcule lui-même.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { controlesDuMode } from '../../tests/verif-donnees/index.js';
import { resoudreFeed } from './raw.js';
import { cleAttendu, computeExpectedFor, type ExpectedCheck } from './expected.js';
import { DOSSIER_SORTIE } from './report.js';
import {
  attenduServeur,
  etatQuota,
  fetchAggregate,
  QuotaError,
  type AttenduServeur,
} from './crosscheck.js';
import { prendreEmpreinte } from './fraicheur.js';

export async function computeExpected(): Promise<ExpectedCheck[]> {
  const out: ExpectedCheck[] = [];
  for (const { domaine, check } of controlesDuMode('live')) {
    const datasets = await resoudreFeed(check.feed);
    const attendu = computeExpectedFor(check, datasets);
    // L'EMPREINTE du jeu principal (#884) : ce que le spec relira pour dire
    // « bibliothèque » ou « donnée » sur un écart.
    if (check.feed.kind === 'raw') {
      attendu.fingerprint = await prendreEmpreinte(check.feed.source, datasets.main ?? []);
    }
    // Le RECOUPEMENT SERVEUR (#883) : une requête agrégée par attente qui en
    // demande une, clauses écrites à la main, sous quota. Un portail coupé ou
    // une requête en échec laisse une raison, jamais un chiffre inventé.
    if (check.feed.kind === 'raw') {
      const serveur: Record<string, AttenduServeur> = {};
      for (const e of check.expects) {
        if (!('crosscheck' in e) || !e.crosscheck) continue;
        const source =
          e.from && check.feed.sources?.[e.from] ? check.feed.sources[e.from] : check.feed.source;
        try {
          serveur[cleAttendu(e)] = attenduServeur(e, await fetchAggregate(source, e.crosscheck));
        } catch (erreur) {
          serveur[cleAttendu(e)] = {
            kind: 'absent',
            raison:
              erreur instanceof QuotaError
                ? erreur.message
                : `recoupement en échec : ${String(erreur instanceof Error ? erreur.message : erreur)}`,
          };
        }
      }
      if (Object.keys(serveur).length > 0) attendu.serveur = serveur;
    }
    out.push(attendu);
    process.stdout.write(
      `${domaine}/${check.id}: ${attendu.rawRows} lignes brutes, ` +
        `${Object.keys(attendu.values).length} attendu(s)` +
        (attendu.serveur
          ? `, ${Object.keys(attendu.serveur).length} recoupé(s) par le serveur`
          : '') +
        '\n'
    );
  }
  // L'état des portails, connu à la fin seulement : posé sur chaque contrôle
  // pour que le spec, qui lit par contrôle, le retrouve.
  const portails = etatQuota();
  for (const e of out) e.recoupement = portails;
  for (const [hote, etat] of Object.entries(portails)) {
    process.stdout.write(
      `recoupement ${hote} : ${etat.requetes} requête(s), ${etat.restantes ?? '?'} restante(s)` +
        (etat.coupe ? ` — ${etat.coupe}` : '') +
        '\n'
    );
  }
  return out;
}

const OUT = resolve(DOSSIER_SORTIE, 'expected.json');

const expected = await computeExpected();
mkdirSync(DOSSIER_SORTIE, { recursive: true });
writeFileSync(OUT, JSON.stringify(expected, null, 2));
process.stdout.write(`→ ${OUT}\n`);

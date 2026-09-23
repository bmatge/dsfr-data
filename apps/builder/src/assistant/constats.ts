/**
 * Constats propres au builder graphique (#1017, ADR-143 §3).
 *
 * Les règles génériques (`REGLES_GENERIQUES`) ne connaissent aucune app : elles
 * ne citent aucun repère. Celle-ci dit mieux une panne générique dans le
 * vocabulaire du builder et DÉSIGNE le réglage qui la corrige :
 *
 * - `builder/source-vide` : la source de l'aperçu a répondu sans ligne. Elle
 *   remplace `pipeline/zero-ligne` sur les sources (et sur ce qu'elles
 *   alimentent directement) ; « Me montrer » ouvre la section Source.
 *
 * Mêmes invariants que `packages/shared/src/debug/constats.ts` : fonction pure
 * de la trace, aucun chiffre absent de la trace (ADR-122), aucune expression
 * régulière. `check:reperes` (règle 5) vérifie que les repères cités existent :
 * ce fichier est déclaré dans `reperes.config.ts` (`constats`).
 */
import { plural, topoOrder, type Constat, type RegleConstat } from '@dsfr-data/shared';

const REGLE_SOURCE_VIDE = 'builder/source-vide';

export const sourceVide: RegleConstat = {
  id: REGLE_SOURCE_VIDE,
  appliesTo: ['builder'],
  tags: ['dsfr-data-source'],
  remplace: ['pipeline/zero-ligne'],
  evaluer: (trace) => {
    const constats: Constat[] = [];
    for (const node of topoOrder(trace.graph)) {
      if (node.tag !== 'dsfr-data-source') continue;
      const etat = trace.states[node.id];
      if (etat?.status !== 'loaded' || etat.rows !== 0) continue;
      constats.push({
        id: `${REGLE_SOURCE_VIDE}@${node.id}`,
        regle: REGLE_SOURCE_VIDE,
        gravite: 'avertissement',
        titre: `${node.id} : la source ne renvoie aucune ligne`,
        explication:
          "La source a répondu sans ligne : le graphique n'a rien à afficher. Le filtre de la source, ou la source elle-même, est vide.",
        action: 'Choisir une autre source, ou vérifier son filtre',
        reperes: ['builder.source'],
        preuve: `${node.id} → ${plural(etat.rows, 'ligne')}`,
        etape: node.id,
      });
    }
    return constats;
  },
};

/** Règles du builder, à composer après les génériques. */
export const REGLES_BUILDER: readonly RegleConstat[] = [sourceVide];

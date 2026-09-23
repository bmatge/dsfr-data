/**
 * Source « données » du registre de repères du pipeline (#1008, ADR-143).
 *
 * Projette `NODE_CONFIGS` en `REPERES_DONNEES` : une zone par type de nœud
 * (`pipeline.source`, libellé du nœud) et un contrôle par attribut
 * (`pipeline.source.api-type`, libellé de l'attribut, balise rendue par
 * `attribute-control-element.ts`, attribut de la bibliothèque piloté).
 * `npm run build:reperes` l'importe (champ `donnees` de `reperes.config.ts`)
 * et soumet ces entrées aux mêmes règles que le balisage.
 *
 * Ne dépend que de `node-configs.ts` (qui n'importe que des types) et de
 * `reperes-ids.ts` : aucun Rete, aucun Lit à la génération.
 */
import type { RepereDonnee } from '@dsfr-data/shared';
import type { AttributeDef } from '../nodes/base-node.js';
import { NODE_CONFIGS } from '../nodes/node-configs.js';
import { repereAttribut, zoneNoeud } from './reperes-ids.js';

/**
 * Types de nœud qu'un bouton de la barre ajoute : leurs repères exigent un
 * nœud de ce type (prérequis `noeud-<type>`, levé par ce bouton). `a11y` n'a
 * pas de bouton (il naît de l'import d'un code) : pas de prérequis.
 */
export const TYPES_AJOUTABLES: readonly string[] = [
  'source',
  'normalize',
  'query',
  'join',
  'search',
  'facets',
  'output',
];

/** Balise rendue par `attribute-control-element.ts` pour une définition. */
export function baliseDuControle(def: AttributeDef): 'select' | 'input' {
  return def.type === 'select' && def.options ? 'select' : 'input';
}

/**
 * Attributs de nœud que le pipeline émet mais que le composant ne déclare PAS
 * dans le custom-elements manifest : ils ne pilotent rien, le registre ne les
 * annonce donc pas comme attributs de la bibliothèque. Chaque entrée dit
 * pourquoi ; `check:reperes` refuse tout autre écart (règle 2).
 */
export const ATTRIBUTS_HORS_MANIFESTE: Readonly<Record<string, string>> = {
  'facets.type':
    "dsfr-data-facets lit `display` (champ:mode), pas `type` : l'attribut émis par le nœud Facettes est ignoré par le composant.",
};

function prerequisDe(type: string): string[] {
  return TYPES_AJOUTABLES.includes(type) ? [`noeud-${type}`] : [];
}

export const REPERES_DONNEES: readonly RepereDonnee[] = Object.values(NODE_CONFIGS).flatMap(
  (config) => {
    const composant = config.component.startsWith('dsfr-data-') ? config.component : null;
    const zone: RepereDonnee = {
      id: zoneNoeud(config.type),
      genre: 'zone',
      libelle: `Étape ${config.label}`,
      element: 'div',
      prerequis: prerequisDe(config.type),
    };
    const controles = config.attributes.map((def): RepereDonnee => ({
      id: repereAttribut(config.type, def.name),
      genre: 'controle',
      libelle: def.label,
      element: baliseDuControle(def),
      attributs:
        composant && !(`${config.type}.${def.name}` in ATTRIBUTS_HORS_MANIFESTE)
          ? [`${composant}:${def.name}`]
          : [],
      prerequis: prerequisDe(config.type),
    }));
    return [zone, ...controles];
  }
);

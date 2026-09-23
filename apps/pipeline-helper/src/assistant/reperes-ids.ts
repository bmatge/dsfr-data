/**
 * Identifiants des repères du pipeline (#1008, epic #992, ADR-143).
 *
 * Les contrôles d'un nœud sont rendus par un élément Lit générique
 * (`attribute-control-element.ts`) : leur repère ne peut pas être un littéral
 * de gabarit. Il est CALCULÉ depuis la définition du nœud (`node-configs.ts`)
 * par la fonction ci-dessous, la seule qui le forme — utilisée à la fois au
 * rendu (`AttributeControl.repere`) et à la génération du registre
 * (`reperes-donnees.ts`). Les deux ne peuvent pas diverger.
 *
 * Module pur, sans import : `npm run build:reperes` le charge par vite-node.
 */

/** Préfixe des repères du pipeline. */
export const PREFIXE_PIPELINE = 'pipeline';

/** Zone d'un type de nœud : `pipeline.source`. */
export function zoneNoeud(type: string): string {
  return `${PREFIXE_PIPELINE}.${type}`;
}

/** Repère d'un attribut de nœud : `pipeline.source.api-type`. */
export function repereAttribut(type: string, nom: string): string {
  return `${zoneNoeud(type)}.${nom}`;
}

/**
 * Type de nœud désigné par un repère `pipeline.<type>…`, s'il en désigne un
 * parmi `types` ; `undefined` pour les repères statiques (barre, panneau).
 */
export function typeDuRepere(id: string, types: readonly string[]): string | undefined {
  const [prefixe, type] = id.split('.');
  return prefixe === PREFIXE_PIPELINE && types.includes(type) ? type : undefined;
}

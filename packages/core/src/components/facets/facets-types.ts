/**
 * Vocabulaire partagé des modules de `<dsfr-data-facets>` (#838).
 *
 * Le composant portait quatre responsabilités dans un seul fichier de 2 736
 * lignes : facettes client, facettes serveur, valeurs statiques, liaison au
 * contexte (celle-ci déjà sortie dans `utils/context-binding.ts`, #837). Les
 * trois premières vivent désormais dans `components/facets/`, en fonctions
 * pures ; ce module ne porte que les types et les constantes qu'elles
 * partagent, pour qu'aucune ne dépende du composant.
 */

export type FacetDisplayMode = 'checkbox' | 'select' | 'multiselect' | 'radio' | 'radio-inline';

/** Modes d'affichage reconnus par `display` (toute autre valeur est ignoree) */
export const FACET_DISPLAY_MODES: ReadonlySet<string> = new Set<FacetDisplayMode>([
  'checkbox',
  'select',
  'multiselect',
  'radio',
  'radio-inline',
]);

/** Tri resolu d'une facette : critère et sens (#645, par champ depuis #741) */
export interface FacetSort {
  by: 'count' | 'alpha';
  dir: 'asc' | 'desc';
}

/** Critères de tri reconnus — sert aussi a distinguer forme globale et forme par champ (#741) */
export const FACET_SORT_CRITERIA: ReadonlySet<string> = new Set(['count', 'alpha']);

/** Tri applique a un champ que `sort` ne nomme pas */
export const DEFAULT_FACET_SORT: FacetSort = { by: 'count', dir: 'desc' };

export interface FacetValue {
  value: string;
  count: number;
  /**
   * Libellé lisible de la valeur (#928) : un champ de code (`dep_code`)
   * affiche « Finistère » et continue de filtrer « 29 ». Posé par
   * `value-labels` uniquement — absent, tout se comporte comme avant et la
   * valeur brute reste affichée.
   */
  label?: string;
  /** Valeur selectionnee absente des données courantes (#310) : rendue
   * desactivable pour ne pas laisser un filtre invisible actif */
  missing?: boolean;
}

export interface FacetGroup {
  field: string;
  label: string;
  values: FacetValue[];
}

/** Sélections actives, par champ. */
export type FacetSelections = Record<string, Set<string>>;

/** Une ligne de données telle que la facette la lit. */
export type FacetRow = Record<string, unknown>;

/** Parse a comma-separated string into trimmed non-empty tokens */
export function parseCSV(value: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

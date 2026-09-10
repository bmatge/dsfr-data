/**
 * Résolution d'un dsfr-data-context par id, SANS importer le composant.
 *
 * Les filtres enregistrés par `context="id"` (#678, ADR-104) vivent dans
 * des bundles différents du contexte : la carte (`dsfr-data.map`) ne doit
 * pas embarquer `dsfr-data-context` — deux bundles qui définissent le même
 * tag lèvent `NotSupportedError` à la seconde définition (ARCHITECTURE.md
 * §12, `@customElement` par effet de bord). Ce module ne connaît le
 * contexte que par sa forme (`ContextHost`) ; `dsfr-data-context.ts`
 * ré-exporte ces symboles typés sur la classe pour ses voisins du bundle
 * core (facettes, recherche, context-filter).
 */
import type { ContextFilterLike } from '@dsfr-data/shared/lib';

/** Nom de l'événement document émis à la connexion d'un contexte (#678) */
export const CONTEXT_CONNECTED_EVENT = 'dsfr-data-context-connected';

/** Ce qu'un filtre attend d'un dsfr-data-context (vue structurelle, #681) */
export interface ContextHost extends HTMLElement {
  _registerFilter(filter: ContextFilterLike): string;
  _unregisterFilter(filter: ContextFilterLike): void;
  _applyFilter(filter: ContextFilterLike, colonWhere: string): void;
  _urlValuesFor(field: string): string[] | null;
}

/**
 * Résout un contexte par id — null si absent ou pas encore défini/upgradé
 * (un élément non upgradé n'a pas encore `_registerFilter`). Les filtres
 * déclarés AVANT le contexte dans le DOM retentent à l'événement
 * `dsfr-data-context-connected` (#678).
 */
export function findContextHostById(id: string): ContextHost | null {
  if (!id) return null;
  const el = document.getElementById(id);
  if (!el || el.tagName.toLowerCase() !== 'dsfr-data-context') return null;
  return '_registerFilter' in el ? (el as ContextHost) : null;
}

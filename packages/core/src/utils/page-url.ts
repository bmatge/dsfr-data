/**
 * L'URL de la page, en un seul endroit (#683, #837).
 *
 * `dsfr-data-context`, `dsfr-data-facets` et `dsfr-data-search` écrivaient
 * chacun `new URL(window.location.href)` puis `history.replaceState`. La
 * leçon qui a produit cette forme est la même pour les trois, et elle ne
 * doit pas être réapprise à chaque fois : concaténer `pathname` produisait,
 * sur une page servie sous `//chemin`, une URL relative au schéma
 * (`//chemin?…` = autre hôte) et `replaceState` levait SecurityError — toute
 * la synchro d'URL cessait, en silence.
 */

/** L'URL courante de la page, construite par l'API `URL` (#683) */
export function currentUrl(): URL {
  return new URL(window.location.href);
}

/**
 * Réécrit l'URL courante sans entrée d'historique (ADR-031) : une frappe ou
 * un clic de facette ne doit pas remplir le bouton « précédent ».
 */
export function replaceUrl(url: URL): void {
  window.history.replaceState(null, '', url.href);
}

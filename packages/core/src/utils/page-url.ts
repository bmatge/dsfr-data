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

/**
 * L'origine de la page, base de résolution des URL relatives écrites dans
 * les attributs (`url="/api/…"`), ou `undefined` si rien d'absolu n'existe.
 *
 * `window.location.origin` ne suffit pas : dans une iframe `srcdoc` (aperçu
 * du Builder, du Playground, du Studio), Firefox renvoie `"null"` là où
 * Chrome renvoie l'origine du document parent. `new URL(relatif, undefined)`
 * levait alors « URL constructor: /api/sources/… is not a valid URL » et
 * l'aperçu d'une table Grist à clé (ADR-165) affichait « Données
 * momentanément indisponibles » sur Firefox seul. `document.baseURI` porte,
 * dans tous les navigateurs, l'URL du document parent pour un `about:srcdoc`
 * (base de repli du standard HTML) : son origine est celle que Chrome donne.
 */
export function pageOrigin(): string | undefined {
  const loc = typeof window !== 'undefined' ? window.location : undefined;
  if (loc?.origin && loc.origin !== 'null') return loc.origin;
  const base = typeof document !== 'undefined' ? document.baseURI : '';
  if (!base) return undefined;
  try {
    const origin = new URL(base).origin;
    return origin !== 'null' ? origin : undefined;
  } catch {
    return undefined;
  }
}

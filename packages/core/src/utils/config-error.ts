/**
 * Marque un composant `dsfr-data-*` comme ayant une erreur de configuration
 * (attribut requis manquant, etc.).
 *
 * Effets :
 * - `console.error(...)` (croix rouge, plus visible que `console.warn`)
 * - pose l'attribut `data-dsfr-config-error="<message>"` sur l'element, visible
 *   immediatement dans l'inspecteur DevTools.
 *
 * Les composants visuels (dsfr-data-facets, dsfr-data-search) peuvent en plus
 * stocker le message retourne dans un `@state()` pour afficher une alerte DSFR
 * dans leur `render()`.
 *
 * @param el            l'element custom concerne
 * @param componentName ex: "dsfr-data-facets"
 * @param message       cause lisible, ex: 'attribut "id" requis pour identifier la sortie'
 * @returns le message (commodite pour assigner a un state)
 */
export function reportConfigError(el: HTMLElement, componentName: string, message: string): string {
  el.setAttribute('data-dsfr-config-error', message);
  console.error(`${componentName}: ${message}`);
  return message;
}

/**
 * Retire le marqueur d'erreur de configuration pose par `reportConfigError`.
 * A appeler quand la configuration redevient valide.
 */
export function clearConfigError(el: HTMLElement): void {
  el.removeAttribute('data-dsfr-config-error');
}

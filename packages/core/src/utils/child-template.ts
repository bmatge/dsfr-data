/**
 * Lecture du `<template>` enfant d'un composant à gabarit (#894, #890).
 *
 * Trois composants portent un gabarit HTML en enfant `<template>` :
 * `dsfr-data-display`, `dsfr-data-map-popup` et `dsfr-data-repeat`. Tous ont
 * le même piège : quand le bundle est chargé dans le `<head>` sans `defer`,
 * `customElements.define()` tourne avant que l'analyseur atteigne l'élément,
 * et `connectedCallback` se déclenche **avant** que l'enfant `<template>`
 * existe. Une lecture faite là rend `null` — pas une erreur, un gabarit vide.
 *
 * La règle, une seule fois ici plutôt que trois : **lire paresseusement**, au
 * premier usage (rendu, ouverture du popup), jamais à la connexion ; et si le
 * document est encore en cours d'analyse, prévoir une seconde chance
 * (`DOMContentLoaded` pour `display`, #895 ; `MutationObserver` sur
 * `childList` pour `repeat`).
 *
 * Retourne le **premier** `<template>` descendant de l'hôte (le contrat
 * historique de `querySelector('template')`, conservé à l'identique), ou
 * `null` s'il n'est pas — ou pas encore — là.
 */
export function readChildTemplate(host: Element): HTMLTemplateElement | null {
  return host.querySelector('template');
}

/**
 * Le gabarit sérialisé (`innerHTML` du `<template>`) pour les rendus par
 * chaîne (`display`, `map-popup`), ou `''` s'il n'est pas encore analysé.
 */
export function readChildTemplateHtml(host: Element): string {
  return readChildTemplate(host)?.innerHTML ?? '';
}

/**
 * Escape HTML special characters to prevent XSS
 * Uses string replacement approach (works in both browser and Node/test environments)
 */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Serialise une valeur en JSON destine a un attribut HTML a guillemets
 * SIMPLES — `data='…'`, le patron des donnees embarquees.
 *
 * `JSON.stringify` echappe les guillemets doubles, jamais les simples : une
 * etiquette francaise ordinaire (« Provence-Alpes-Cote d'Azur », « Val-d'Oise »,
 * « Cote-d'Or ») fermait donc l'attribut a la premiere apostrophe. Le parseur
 * avalait la fin de la balise, le composant ne recevait qu'un fragment
 * tronque, et l'utilisateur voyait un podium ou une carte vide sans le
 * moindre message (#615).
 *
 * L'esperluette compte autant : sans elle, un `&amp;` present dans la donnee
 * est redecode en `&` a la lecture de l'attribut — corruption silencieuse.
 *
 * `escapeHtml` ne convient pas ici : il echapperait aussi `"`, ce qui
 * casserait le JSON lui-meme.
 */
export function jsonAttr(value: unknown): string {
  return JSON.stringify(value).replace(/&/g, '&amp;').replace(/'/g, '&#039;').replace(/</g, '&lt;');
}

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
 * Echappe une chaine destinee a un attribut HTML a guillemets SIMPLES —
 * `data='…'`, `x='…'`, le patron des donnees embarquees.
 *
 * Trois caracteres, trois raisons :
 *
 *   - `'` ferme l'attribut. Une etiquette francaise ordinaire
 *     (« Provence-Alpes-Cote d'Azur », « Val-d'Oise », « Cote-d'Or ») suffit :
 *     le parseur avale la fin de la balise, le composant ne recoit qu'un
 *     fragment tronque, et l'utilisateur voit un podium ou une carte vide
 *     sans le moindre message (#615).
 *   - `&` est decode a la lecture : un `&amp;` present dans la DONNEE
 *     ressortirait en `&`. Corruption silencieuse.
 *   - `<` ne casse pas un attribut bien forme, mais un `</script>` glisse
 *     dans une valeur casserait un bloc englobant.
 *
 * `escapeHtml` ne convient pas ici : il echapperait aussi `"`, ce qui
 * casserait le JSON que ces attributs transportent presque toujours.
 */
export function singleQuoteAttr(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/'/g, '&#039;').replace(/</g, '&lt;');
}

/**
 * Serialise une valeur en JSON pour un attribut a guillemets simples.
 *
 * `JSON.stringify` echappe les guillemets doubles, jamais les simples — d'ou
 * le passage obligatoire par `singleQuoteAttr`. Utiliser cette fonction quand
 * on part de la VALEUR ; `singleQuoteAttr` quand la serialisation a deja eu
 * lieu en amont.
 */
export function jsonAttr(value: unknown): string {
  return singleQuoteAttr(JSON.stringify(value));
}

/**
 * Rend une chaine sous forme de litteral JavaScript, guillemets COMPRIS,
 * pour injection dans un `<script>` genere.
 *
 * A ne pas confondre avec `singleQuoteAttr` : une entite HTML n'a aucun sens
 * en contexte JS. `el.setAttribute('name', '&#039;')` pose litteralement les
 * six caracteres `&#039;` — `setAttribute` ne decode pas les entites — et la
 * legende affiche « Val-d&#039;Oise ». C'est exactement le cas francais qui a
 * motive #615, deplace d'un contexte a l'autre.
 *
 * `JSON.stringify` produit un litteral correctement echappe ; reste `<`, pour
 * qu'un `</script>` dans la donnee ne ferme pas le bloc.
 */
export function jsStringLiteral(value: string): string {
  return JSON.stringify(String(value)).replace(/</g, '\\u003c');
}

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
 * Rend une valeur sous forme de litteral JavaScript, pour injection dans un
 * `<script>` genere — `const data = …;`.
 *
 * `JSON.stringify` produit deja un litteral valide ; le seul danger restant
 * est `</script>` dans une chaine, qui ferme le bloc quel que soit le
 * contexte JS. Le parseur HTML ne connait pas la syntaxe JavaScript : il
 * cherche la sequence, point. `\u003c` est vu par JS comme un `<` et par le
 * parseur HTML comme six caracteres anodins.
 */
export function jsonLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Rend une chaine sous forme de litteral JavaScript, guillemets COMPRIS.
 *
 * A ne pas confondre avec `singleQuoteAttr` : une entite HTML n'a aucun sens
 * en contexte JS. `el.setAttribute('name', '&#039;')` pose litteralement les
 * six caracteres `&#039;` — `setAttribute` ne decode pas les entites — et la
 * legende affiche « Val-d&#039;Oise ». C'est exactement le cas francais qui a
 * motive #615, deplace d'un contexte a l'autre.
 *
 * L'autre usage, plus insidieux, est l'interpolation d'un NOM DE CHAMP :
 * `label: '${config.valueField}'` ou `d['${config.labelField}']`. Un en-tete
 * de colonne francais ordinaire — « Nombre d'habitants » — y ferme la chaine
 * et rend le script entier invalide. Le code exporte ne leve rien a la
 * generation : il meurt dans la page de l'utilisateur.
 *
 * Cette fonction pose ses PROPRES guillemets : ecrire `d[${jsStringLiteral(f)}]`
 * et non `d['${jsStringLiteral(f)}']`.
 */
export function jsStringLiteral(value: string): string {
  return jsonLiteral(String(value));
}

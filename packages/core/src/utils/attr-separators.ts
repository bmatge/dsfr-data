/**
 * Avertissement de séparateur suspect sur un attribut multi-entrées (#731, #772).
 *
 * Deux séparateurs d'entrées coexistent dans la bibliothèque : la barre
 * verticale (`display`, `labels`, `sort` des facettes, `rename` du normalize)
 * et la virgule (`fields`, `split`, `round`, `fold`). Un attribut écrit avec
 * l'autre séparateur est lu comme UNE seule entrée, sans un mot : la page a
 * l'air juste et n'applique que la première règle. Pire, les deux séparateurs
 * cohabitent sur la même balise (`rename` et `fold` sur `dsfr-data-normalize`).
 *
 * L'avertissement est émis une fois par instance, par attribut et par valeur
 * reçue : les parseurs sont rappelés à chaque rendu.
 */

export interface SeparatorCheck {
  /** Balise qui porte l'attribut, ex. `dsfr-data-facets`. */
  component: string;
  /** Id de l'instance, repris dans le message pour la retrouver. */
  id: string;
  /** Nom HTML de l'attribut. */
  attr: string;
  /** Valeur reçue. */
  raw: string;
  /** Séparateur d'entrées attendu. */
  expected: '|' | ',';
  /** Forme attendue, citée dans le message (ex. `"champ:alpha | champ2:count"`). */
  example: string;
  /**
   * Les valeurs sont des libellés humains, où une virgule est légitime
   * (« Département, région ») : on n'y voit un mauvais séparateur qu'à une
   * virgule suivie d'une entrée `nom:`. Sans effet quand `expected` vaut `,`.
   */
  humanValues?: boolean;
}

/**
 * La valeur semble-t-elle écrite avec le mauvais séparateur ?
 * - barre attendue : une virgule sans aucune barre (et, pour des libellés
 *   humains, une virgule suivie d'une nouvelle entrée `nom:`) ;
 * - virgule attendue : une barre verticale, qui n'a de sens dans aucune
 *   entrée de ces attributs (noms de champs, motifs).
 */
export function hasSuspectSeparator(
  raw: string,
  expected: '|' | ',',
  humanValues = false
): boolean {
  if (expected === ',') return raw.includes('|');
  if (raw.includes('|') || !raw.includes(',')) return false;
  if (humanValues && !/,\s*[^,:|]+:/.test(raw)) return false;
  return true;
}

/**
 * Émet l'avertissement si la valeur est suspecte et qu'il n'a pas déjà été
 * émis pour cette instance, cet attribut et cette valeur (`warned`, un
 * ensemble propre à l'instance). Rend `true` si la valeur est suspecte.
 */
export function warnSuspectSeparator(check: SeparatorCheck, warned: Set<string>): boolean {
  const { component, id, attr, raw, expected, example, humanValues } = check;
  if (!hasSuspectSeparator(raw, expected, humanValues)) return false;
  const key = `${attr}=${raw}`;
  if (warned.has(key)) return true;
  warned.add(key);
  const found = expected === '|' ? 'une virgule' : 'une barre verticale';
  const wanted = expected === '|' ? 'la barre verticale' : 'la virgule';
  const who = id ? `${component}[${id}]` : component;
  console.warn(
    `${who} : attribut "${attr}" — les entrées semblent séparées par ${found}, or le ` +
      `séparateur attendu est ${wanted}. Forme attendue : ${example}. En l'état, une seule ` +
      `entrée est lue. Valeur reçue : "${raw}".`
  );
  return true;
}

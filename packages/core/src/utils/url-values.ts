/**
 * Valeurs d'un paramètre d'URL : UNE grammaire pour toutes les surfaces qui
 * écrivent un filtre dans la barre d'adresse (#1243, famille de BUG-031).
 *
 * Posée pour `dsfr-data-facets` (#1227, #1236), elle sert aussi au contexte
 * (`dsfr-data-context`), à ses filtres (`dsfr-data-context-filter`), à la
 * recherche en mode `context` et à la sélection au clic (`refine-on-click`).
 * Module sans dépendance ni effet de bord : il est embarqué par le bundle
 * carte comme par le bundle cœur.
 *
 * Trois lectures, selon ce que le paramètre porte :
 * - une LISTE (`in`, facette) : `splitUrlValues` ;
 * - une valeur UNIQUE (`eq`, `contains`, sélection, terme de recherche) :
 *   `readUrlScalar` ;
 * - une liste à positions FIXES (`between` : min, max) : `splitUrlPositions`.
 */

/**
 * Grammaire d'un paramètre d'URL de filtre (BUG-031 du banc d'essai, #1227 ;
 * étendue à toutes les surfaces du contexte par #1243).
 *
 * Un paramètre porte les valeurs d'UN champ, jointes par des virgules :
 * `?region=IDF,PACA`. C'est la forme historique, et celle des liens déjà
 * partagés — elle reste écrite et lue telle quelle. Ce qui manquait est un
 * échappement : une valeur qui CONTIENT une virgule (« 1,5 à 2 parcours »)
 * était recoupée en deux à la lecture, deux cases fantômes, zéro résultat.
 *
 * Trois choses s'échappent en percent DANS la valeur, avant la jointure —
 * même convention que `where`, `replace` et `color-map` (#676) :
 * - `,` → `%2C` : le séparateur ;
 * - `%` → `%25` : pour que le décodage soit réversible ;
 * - les blancs de TÊTE et de QUEUE (`%20`…) : le lecteur les retire autour de
 *   chaque morceau, pour tolérer un lien écrit à la main (`?r=IDF, PACA`).
 *
 * Dans la barre d'adresse le `%` est encodé une seconde fois par
 * `URLSearchParams` : la valeur se lit `1%252C5+à+2+parcours`.
 *
 * Paramètre répété ou échappement ? Le paramètre répété (`?r=a&r=b`) ne
 * suffit pas seul : une valeur unique à virgule (`?r=1,5 à 2`) resterait
 * indiscernable de deux valeurs historiques (`?r=IDF,PACA`), sauf à casser
 * tous les liens déjà partagés. L'échappement lève l'ambiguïté sans changer
 * la forme d'un lien qui n'a pas de virgule dans ses valeurs. Le paramètre
 * répété reste LU (ses occurrences se cumulent), jamais écrit.
 */
export function escapeUrlValue(value: string): string {
  const escaped = value.replace(/%/g, '%25').replace(/,/g, '%2C');
  const body = escaped.trim();
  if (body === escaped) return escaped;
  if (body === '') return encodeURIComponent(escaped);
  const head = escaped.slice(0, escaped.length - escaped.trimStart().length);
  const tail = escaped.slice(escaped.trimEnd().length);
  return encodeURIComponent(head) + body + encodeURIComponent(tail);
}

/**
 * Inverse d'`escapeUrlValue`, appliqué à un morceau DÉJÀ découpé.
 *
 * Chaque suite de séquences `%XX` est décodée d'un bloc (un blanc insécable
 * tient sur deux octets). Une suite qui n'est pas de l'UTF-8 valide est
 * laissée telle quelle : un lien historique dont la valeur porte un `%`
 * littéral (« 50 % », « 100%de ») se relit comme avant.
 */
export function unescapeUrlValue(piece: string): string {
  if (!piece.includes('%')) return piece;
  let out = '';
  let i = 0;
  while (i < piece.length) {
    // Une suite : autant de `%XX` qu'il s'en présente d'affilée.
    let end = i;
    while (isPercentByte(piece, end)) end += 3;
    if (end === i) {
      out += piece[i];
      i++;
      continue;
    }
    const run = piece.slice(i, end);
    try {
      out += decodeURIComponent(run);
    } catch {
      out += run;
    }
    i = end;
  }
  return out;
}

/** `%` suivi de deux chiffres hexadécimaux, à la position `at` ? */
function isPercentByte(text: string, at: number): boolean {
  return text[at] === '%' && /^[0-9A-Fa-f]{2}$/.test(text.slice(at + 1, at + 3));
}

/** Valeurs d'un champ → valeur du paramètre d'URL (une seule occurrence). */
export function joinUrlValues(values: Iterable<string>): string {
  return [...values].map(escapeUrlValue).join(',');
}

/**
 * Valeur d'un paramètre d'URL → valeurs du champ.
 *
 * `known` est facultatif : les valeurs que les données portent pour ce champ.
 * Il ne sert qu'à RECOLLER un lien écrit avant l'échappement, dont une valeur
 * contenait une virgule (`?intensite=1,5 à 2 parcours`) : un morceau inconnu
 * des données est prolongé par les suivants jusqu'à former une valeur connue.
 * Un morceau connu n'est jamais recollé — `?r=A,B` reste deux valeurs même si
 * « A,B » existe aussi —, et sans valeur connue qui convienne le morceau est
 * rendu seul, comme avant (case cochée « indisponible », #310).
 */
export function splitUrlValues(raw: string, known?: ReadonlySet<string> | null): string[] {
  const pieces = raw.split(',');
  const values: string[] = [];
  let i = 0;
  while (i < pieces.length) {
    const single = unescapeUrlValue(pieces[i].trim());
    if (known && known.size > 0 && single !== '' && !known.has(single)) {
      const rejoined = rejoinLegacyPieces(pieces, i, known);
      if (rejoined) {
        values.push(rejoined.value);
        i = rejoined.next;
        continue;
      }
    }
    if (single !== '') values.push(single);
    i++;
  }
  return values;
}

/**
 * Plus courte suite de morceaux, à partir de `start`, qui forme une valeur
 * connue une fois recollée par des virgules. Les blancs INTÉRIEURS sont ceux
 * du lien (« Paris, France ») ; seuls ceux des bords sont retirés.
 */
function rejoinLegacyPieces(
  pieces: string[],
  start: number,
  known: ReadonlySet<string>
): { value: string; next: number } | null {
  let joined = pieces[start];
  for (let end = start + 1; end < pieces.length; end++) {
    joined += ',' + pieces[end];
    const candidate = unescapeUrlValue(joined.trim());
    if (known.has(candidate)) return { value: candidate, next: end + 1 };
  }
  return null;
}

/**
 * Paramètre d'URL → valeur UNIQUE (filtre `eq`, terme de recherche, sélection
 * au clic).
 *
 * Le paramètre entier est UNE valeur : il n'est jamais découpé. Écrit par
 * `escapeUrlValue`, il se décode exactement ; écrit par une version
 * antérieure, virgule nue (`?q=Paris, France`), il se relit tel qu'il a été
 * écrit — là où l'ancien découpage rendait `Paris,France` (blanc perdu) ou
 * seulement `Paris` (sélection tronquée). Les blancs des bords sont retirés,
 * comme avant ; ceux que l'on veut garder arrivent en percent.
 */
export function readUrlScalar(raw: string): string {
  return unescapeUrlValue(raw.trim());
}

/**
 * Paramètre d'URL → valeurs à positions FIXES (`between` : `min,max`). Les
 * morceaux VIDES sont gardés — `,2024` dit « pas de minimum » —, ce que
 * `splitUrlValues` ne fait pas.
 */
export function splitUrlPositions(raw: string): string[] {
  return raw.split(',').map((piece) => unescapeUrlValue(piece.trim()));
}

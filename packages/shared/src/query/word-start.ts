/**
 * Opérateur `wordstart` — « un mot commence par » (#1285).
 *
 * `champ:wordstart:lycée prof` retient les lignes dont le champ porte, pour
 * CHAQUE mot de la saisie, un mot qui COMMENCE par lui — dans n'importe quel
 * ordre, sans adjacence, sans égard pour la casse ni les accents. C'est ce que
 * fait le `like "lycee* prof*"` d'un portail Opendatasoft, auquel la clause est
 * déléguée ; ce module est son calcul À L'IDENTIQUE côté client, pour que la
 * même clause retienne les mêmes lignes qu'elle parte au portail ou non
 * (ADR-139).
 *
 * Tout ce qui suit a été MESURÉ le 2026-10-13, par 59 requêtes en lecture
 * seule, sur `rappelconso-v2-gtin-trie` (data.economie.gouv.fr, 18 559
 * lignes), `fr-en-annuaire-education` et `retours-formulaire-votre-avis-copie`
 * (data.education.gouv.fr). Le portail découpe comme le « standard tokenizer »
 * d'Elasticsearch (Unicode UAX #29), retire l'article élidé, puis replie casse
 * et accents — pas de racinisation, pas de mots vides :
 *
 *   CE QU'EST UN MOT
 *   categorie_produit = « bébés-enfants (hors alimentaire) », 1 266 lignes
 *     like "enfants*" / "enf*" / "hors*" / "(hors*"   -> 1 266   tiret, parenthèse : coupent
 *   marque_produit : « b&s cuisine », « jambon sec s/os … » trouvés par
 *     like "s"                                                  `&` et `/` coupent
 *   sous_categorie_produit = « produits de la pêche et d'aquaculture », 1 178
 *     like "aquaculture" / "d'aquaculture" / "aqua*"  -> 1 178   l'article élidé tombe…
 *     like "d"                                        ->     0   …et n'est pas un mot
 *     like "hygiène" (« produits d’hygiène »)         ->     6   apostrophe typographique aussi
 *   nom_commune : like "l" -> 0, like "hay" -> 23 (« L'Haÿ-les-Roses »)
 *   marque_produit = « kellogg's », 9 lignes
 *     like "kellogg" -> 0 ; like "kellogg's" -> 9 ; like "kellogg*" -> 9
 *                                  hors article, l'apostrophe NE coupe PAS
 *   mail = « …@ac-aix-marseille.fr »
 *     like "marseille.fr" -> 2 434 ; like "marseille*" -> 2 443
 *                                  un point entre deux lettres NE coupe PAS…
 *     like "fr" -> 190 (« lamoriciere@ec44.fr »)   …entre un chiffre et une lettre, si
 *   conditionnements : like "1,5" -> 28   une virgule entre deux chiffres ne coupe pas
 *   identifiant_de_l_etablissement = « 0130001A » : like "a" -> 0
 *                                  pas de coupe entre chiffre et lettre
 *
 *   PLUSIEURS TERMES : un ET, sans ordre ni adjacence, l'étoile vaut par terme
 *     like "enfants bébés" -> 1 266 ; like "bébés hors" -> 1 266
 *     like "ali* hor*" -> 1 266 ; like "hor* aliment" -> 0 ; like "hor alimentaire" -> 0
 *
 *   CASSE, ACCENTS, LIGATURES : repliés des deux côtés
 *     like "*ALIMENT*" = like "alim*" = 15 632 ; like "ÉLECTRO*" -> 676
 *     like "francais" = like "français" = 5 ; like "coeur" = like "cœur" = 341
 *
 *   CHAMP MULTIVALUÉ : les mots de tous les éléments, ensemble
 *     themes_attendus like "elev*" -> 124 (= le compte de `= "Elèves"`)
 *     themes_attendus like "finan* elev*" -> 31
 *
 *   CHAMP NON TEXTE : `gtin like "69*"` (entier) -> 0 ligne, sans erreur ;
 *     `date_publication like "2022*"` -> HTTP 400 « must be a field of type text »
 *
 *   TERME VIDE, ÉTOILES : like "" -> 0 ; like "*" -> 18 559 (tout) ;
 *     like "a*" -> 16 682 (un caractère suffit) ;
 *     like "al*tion" -> 0, like "al*alimentation" -> 0 (l'étoile ne vaut qu'en fin de terme)
 *
 * CE QUI PART AU PORTAIL. La saisie est découpée ICI, avec les mêmes règles,
 * et seuls ses MOTS partent, repliés, chacun suivi d'une étoile :
 * `like "lycee* prof*"`. Aucun caractère spécial de la saisie (`*`, `"`, `\`,
 * `%`, parenthèse…) n'atteint donc le portail — il n'y a rien à échapper.
 * RESTRICTION : un mot de la saisie qui garde un signe (« kellogg's »,
 * « marseille.fr », « 1,5 ») n'est PAS délégué — la lecture que le portail fait
 * d'un terme étoilé portant un signe n'a été mesurée que sur un cas — la
 * clause est alors calculée côté client. Même chose pour un mot hors de
 * l'alphabet latin replié et des chiffres.
 *
 * LIMITES CONNUES, non mesurables à ce coût : les écritures sans espace
 * (chinois, japonais, thaï), que le portail découpe caractère par caractère ;
 * un mot de plus de 255 caractères ; le soulignement (`_`), tenu pour un
 * caractère de mot comme le veut UAX #29 ; les deux-points entre deux lettres,
 * tenus pour une coupe.
 *
 * Module lib-safe, sans dépendance : il est importé par la bibliothèque
 * (`@dsfr-data/shared/lib`) comme par les applications.
 */

/** Nom de l'opérateur dans la grammaire colon. */
export const WORD_START_OPERATOR = 'wordstart';

/** Articles élidés que le portail retire en tête de mot (« d'aquaculture » -> « aquaculture »). */
const ARTICLES_ELIDES: ReadonlySet<string> = new Set([
  'l',
  'm',
  't',
  'qu',
  'n',
  's',
  'j',
  'd',
  'c',
  'jusqu',
  'quoiqu',
  'lorsqu',
  'puisqu',
]);

/** Apostrophes : droite, typographiques, modificative. */
const APOSTROPHES = "'‘’ʼ＇";

/**
 * Signes qui ne coupent PAS entre deux LETTRES (UAX #29, MidLetter et
 * MidNumLet) : apostrophes, point, point médian.
 */
const ENTRE_LETTRES = APOSTROPHES + '.·‧․﹒．';

/**
 * Signes qui ne coupent PAS entre deux CHIFFRES (UAX #29, MidNum et
 * MidNumLet) : virgule, point-virgule, point, apostrophes.
 */
const ENTRE_CHIFFRES = APOSTROPHES + '.,;․﹒．，；';

const LETTRE = /[\p{L}\p{M}]/u;
const CHIFFRE = /\p{Nd}/u;

type Classe = 'lettre' | 'chiffre' | 'souligne' | 'autre';

function classe(c: string): Classe {
  if (c === '_') return 'souligne';
  if (CHIFFRE.test(c)) return 'chiffre';
  if (LETTRE.test(c)) return 'lettre';
  return 'autre';
}

/** Lettres que la décomposition Unicode ne replie pas, et leur forme ASCII. */
const REPLIS: Readonly<Record<string, string>> = {
  œ: 'oe',
  æ: 'ae',
  ß: 'ss',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ł: 'l',
  ı: 'i',
};

/** Casse, accents et ligatures repliés — « Cœur » et « COEUR » donnent « coeur ». */
export function foldWord(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[œæßøđðþłı]/g, (c) => REPLIS[c] ?? c)
    .replace(/[‘’ʼ＇]/g, "'");
}

/** Retire l'article élidé de tête : « d'aquaculture » -> « aquaculture », « kellogg's » intact. */
function sansArticle(mot: string): string {
  const i = mot.indexOf("'");
  if (i <= 0) return mot;
  return ARTICLES_ELIDES.has(mot.slice(0, i)) ? mot.slice(i + 1) : mot;
}

/**
 * Les MOTS d'un texte, tels que le portail les indexe : découpés (UAX #29),
 * sans article élidé, casse et accents repliés.
 *
 *   « Bébés-enfants (hors alimentaire) » -> bebes, enfants, hors, alimentaire
 *   « produits de la pêche et d'aquaculture » -> produits, de, la, peche, et, aquaculture
 *   « kellogg's » -> kellogg's            « ce.0130001a@ac-aix-marseille.fr » -> ce, 0130001a, ac, aix, marseille.fr
 */
export function wordTokens(text: string): string[] {
  const chars = Array.from(text);
  const mots: string[] = [];
  let courant = '';
  let precedente: Classe = 'autre';

  const clore = (): void => {
    if (courant && /[\p{L}\p{Nd}]/u.test(courant)) {
      const mot = sansArticle(foldWord(courant));
      if (mot) mots.push(mot);
    }
    courant = '';
    precedente = 'autre';
  };

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const k = classe(c);
    if (k !== 'autre') {
      courant += c;
      precedente = k;
      continue;
    }
    // Un signe ne tient deux caractères ensemble que s'il est ENTRE deux
    // lettres (apostrophe, point) ou ENTRE deux chiffres (virgule, point).
    const suivante = i + 1 < chars.length ? classe(chars[i + 1]) : 'autre';
    const tient =
      (precedente === 'lettre' && suivante === 'lettre' && ENTRE_LETTRES.includes(c)) ||
      (precedente === 'chiffre' && suivante === 'chiffre' && ENTRE_CHIFFRES.includes(c));
    if (tient) {
      courant += c;
      precedente = 'autre';
    } else {
      clore();
    }
  }
  clore();
  return mots;
}

/** Les mots d'une valeur de champ : texte, ou tableau de textes (champ multivalué). */
function valueTokens(value: unknown): string[] | null {
  if (typeof value === 'string') return wordTokens(value);
  if (Array.isArray(value)) {
    const mots: string[] = [];
    for (const element of value) {
      if (typeof element === 'string') {
        for (const mot of wordTokens(element)) mots.push(mot);
      }
    }
    return mots;
  }
  // Nombre, booléen, objet, absent : le portail ne cherche de mots que dans
  // un champ TEXTE (`gtin like "69*"` rend 0 ligne sur un entier, mesuré).
  return null;
}

/**
 * `champ:wordstart:saisie` sur une valeur : chaque mot de la saisie est-il le
 * DÉBUT d'un mot de la valeur ? Une saisie sans aucun mot (vide, ou faite de
 * signes) ne retient rien, comme `like ""` sur le portail. Une valeur qui
 * n'est pas du texte (nombre, booléen, absente) ne contient aucun mot.
 */
export function matchesWordStart(value: unknown, term: string): boolean {
  return matchesWordStartTokens(value, wordTokens(term));
}

/** Variante à saisie déjà découpée — une seule découpe pour tout un jeu. */
export function matchesWordStartTokens(value: unknown, queryWords: readonly string[]): boolean {
  if (queryWords.length === 0) return false;
  const mots = valueTokens(value);
  if (!mots || mots.length === 0) return false;
  return queryWords.every((q) => mots.some((mot) => mot.startsWith(q)));
}

/** Un mot que le portail lit sans ambiguïté : lettres latines repliées et chiffres. */
const MOT_SIMPLE = /^[a-z0-9]+$/;

/**
 * Le motif `like` d'un portail Opendatasoft pour une saisie : ses mots,
 * repliés, chacun étoilé — `lycee* prof*`. Une saisie sans mot rend `''`
 * (`like ""`, 0 ligne, comme le client). `null` quand un mot de la saisie ne
 * peut pas être confié au portail (il porte un signe, ou sort de l'alphabet
 * latin) : la clause reste alors au client.
 */
export function wordStartLikePattern(term: string): string | null {
  const mots = wordTokens(term);
  if (!mots.every((mot) => MOT_SIMPLE.test(mot))) return null;
  return mots.map((mot) => `${mot}*`).join(' ');
}

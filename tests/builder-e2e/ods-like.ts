/**
 * Le `like` d'un portail Opendatasoft, TEL QUE MESURÉ (#1285).
 *
 * Les faux portails du dépôt lisaient `champ like "%x%"` comme une recherche
 * de sous-chaîne. Le vrai portail ne fait pas ça : il compare des MOTS, et le
 * `%` n'y est pas un joker. Mesuré le 2026-10-12 sur
 * `rappelconso-v2-gtin-trie` (data.economie.gouv.fr) : `categorie_produit
 * like "%aliment%"` rend 0 ligne quand 14 366 valent « alimentation ». Tous
 * les contrôles d'un `contains` délégué étaient donc verts sur un
 * comportement que le portail n'a pas — un oracle qui partage le défaut de
 * son sujet ne teste rien.
 *
 * Ce module rend aux faux portails la lecture du vrai. Il est écrit sans rien
 * importer de la bibliothèque, et par une autre technique que la sienne (une
 * expression régulière à assertions, là où `word-start.ts` parcourt les
 * caractères) : deux écritures de la même règle mesurée.
 *
 * LA RÈGLE (59 requêtes en lecture seule, 2026-10-13, deux portails) :
 *
 * 1. Le motif est découpé en TERMES sur les blancs. Un terme terminé par `*`
 *    est un DÉBUT de mot, les autres des mots ENTIERS ; une étoile de tête est
 *    ignorée, une étoile au milieu d'un terme ne trouve rien
 *    (`like "al*tion"` -> 0). Les termes sont reliés par un ET, sans ordre ni
 *    adjacence (`like "enfants bébés"` trouve « bébés-enfants … »).
 * 2. Valeur et termes passent par le même analyseur : découpage en mots
 *    (Unicode UAX #29 — tiret, parenthèse, `&`, `/` coupent ; une apostrophe
 *    ou un point entre deux lettres, une virgule ou un point entre deux
 *    chiffres ne coupent pas ; pas de coupe entre lettre et chiffre), article
 *    élidé retiré (« d'aquaculture » -> « aquaculture », mais « kellogg's »
 *    reste entier), casse, accents et ligatures repliés. Ni racinisation ni
 *    mots vides (`like "et"` -> 9 296).
 * 3. Un champ multivalué met en commun les mots de tous ses éléments ; un
 *    champ qui n'est pas du texte ne contient aucun mot (`gtin like "69*"`
 *    rend 0 sur un entier).
 * 4. `like ""` ne trouve rien ; `like "*"` trouve tout.
 *
 * Voir le tableau des mesures en tête de
 * `packages/shared/src/query/word-start.ts`.
 */

const ARTICLES = new Set([
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

/**
 * Un mot : des lettres, chiffres et soulignés, que peut tenir ensemble UN
 * signe placé entre deux lettres (apostrophe, point, point médian) ou entre
 * deux chiffres (virgule, point-virgule, point, apostrophe).
 */
const MOT =
  /[\p{L}\p{M}\p{Nd}_]+(?:(?:(?<=[\p{L}\p{M}])['‘’.·](?=[\p{L}\p{M}])|(?<=\p{Nd})['‘’.,;](?=\p{Nd}))[\p{L}\p{M}\p{Nd}_]+)*/gu;

const LIGATURES: Record<string, string> = {
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

function replier(mot: string): string {
  return mot
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[œæßøđðþłı]/g, (c) => LIGATURES[c])
    .replace(/[‘’]/g, "'");
}

/** Les mots d'un texte, comme le portail les indexe. */
export function motsPortail(texte: string): string[] {
  const mots: string[] = [];
  for (const trouve of texte.match(MOT) ?? []) {
    if (!/[\p{L}\p{Nd}]/u.test(trouve)) continue;
    let mot = replier(trouve);
    const apostrophe = mot.indexOf("'");
    if (apostrophe > 0 && ARTICLES.has(mot.slice(0, apostrophe))) mot = mot.slice(apostrophe + 1);
    if (mot) mots.push(mot);
  }
  return mots;
}

/** Les mots d'une valeur de champ : texte, ou tableau de textes ; rien sinon. */
function motsValeur(valeur: unknown): string[] {
  if (typeof valeur === 'string') return motsPortail(valeur);
  if (Array.isArray(valeur)) {
    return valeur.flatMap((element) => (typeof element === 'string' ? motsPortail(element) : []));
  }
  return [];
}

/** `valeur like "motif"`, lu comme le portail. */
export function likePortail(valeur: unknown, motif: string): boolean {
  const termes = motif.split(/\s+/).filter(Boolean);
  const attendus: Array<{ mot: string; debut: boolean }> = [];
  let etoileSeule = false;
  for (const terme of termes) {
    const debut = terme.endsWith('*');
    const coeur = terme.replace(/^\*+/, '').replace(/\*+$/, '');
    // Une étoile au milieu d'un terme : mesuré à 0 ligne.
    if (coeur.includes('*')) return false;
    const mots = motsPortail(coeur);
    if (mots.length === 0) {
      if (terme.includes('*')) etoileSeule = true;
      continue;
    }
    mots.forEach((mot, rang) => attendus.push({ mot, debut: debut && rang === mots.length - 1 }));
  }
  // `like ""` : rien ; `like "*"` : tout.
  if (attendus.length === 0) return etoileSeule;
  const mots = motsValeur(valeur);
  return attendus.every(({ mot, debut }) =>
    mots.some((m) => (debut ? m.startsWith(mot) : m === mot))
  );
}

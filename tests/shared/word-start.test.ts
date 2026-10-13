import { describe, it, expect, vi } from 'vitest';
import {
  WORD_START_OPERATOR,
  wordTokens,
  matchesWordStart,
  wordStartLikePattern,
  applyLocalFilter,
  filterToOdsql,
  odsqlCanExpress,
  splitFilterForOdsql,
  serverComputesClause,
  splitFilterForProvider,
  validateColonFilter,
} from '@dsfr-data/shared';
import { likePortail, motsPortail } from '../builder-e2e/ods-like.js';
import { motsDe, unMotCommencePar } from '../../tools/oracle/compute.js';

/**
 * #1285 — l'opérateur `wordstart`, « un mot commence par ».
 *
 * Trois écritures de la même règle MESURÉE sur un portail Opendatasoft
 * (2026-10-13, 59 requêtes) doivent s'accorder : celle de la bibliothèque
 * (`word-start.ts`, parcours des caractères), celle du faux portail des
 * recettes (`ods-like.ts`, expression régulière), celle de l'oracle
 * (`compute.ts`, recollage de morceaux). La quatrième, en Python, les
 * rencontre par `attendus.json`.
 */

/** Valeurs relevées sur le portail, et leurs mots tels que les mesures les établissent. */
const CORPUS: Array<[string, string[]]> = [
  ['alimentation', ['alimentation']],
  // tiret et parenthèse coupent : like "enfants*", "hors*", "(hors*" -> 1 266
  ['bébés-enfants (hors alimentaire)', ['bebes', 'enfants', 'hors', 'alimentaire']],
  // l'article élidé tombe : like "aquaculture" -> 1 178, like "d" -> 0
  ["produits de la pêche et d'aquaculture", ['produits', 'de', 'la', 'peche', 'et', 'aquaculture']],
  // apostrophe typographique : like "hygiène" -> 6
  [
    'produits d’hygiène (cotons, intime, papiers)',
    ['produits', 'hygiene', 'cotons', 'intime', 'papiers'],
  ],
  // hors article, l'apostrophe ne coupe pas : like "kellogg" -> 0, "kellogg's" -> 9
  ["kellogg's", ["kellogg's"]],
  // `&` coupe, « m' » est un article : like "s" trouve « m&m's »
  ["m&m's", ['m', 's']],
  ['b&s cuisine', ['b', 's', 'cuisine']],
  // `/` coupe : like "s" trouve « s/os »
  ['jambon sec s/os andré cazaux', ['jambon', 'sec', 's', 'os', 'andre', 'cazaux']],
  // un point entre deux lettres ne coupe pas : like "marseille.fr" -> 2 434
  ['ce.0130001a@ac-aix-marseille.fr', ['ce', '0130001a', 'ac', 'aix', 'marseille.fr']],
  // …entre un chiffre et une lettre, si : like "fr" trouve « ec44.fr »
  ['lamoriciere@ec44.fr', ['lamoriciere', 'ec44', 'fr']],
  // like "l" -> 0, like "hay" -> 23
  ["L'Haÿ-les-Roses", ['hay', 'les', 'roses']],
  // ligature : like "coeur" = like "cœur" = 341
  ['École du Sacré-Cœur', ['ecole', 'du', 'sacre', 'coeur']],
  // une virgule entre deux chiffres ne coupe pas : like "1,5" -> 28
  ['bouteille 1,5 l', ['bouteille', '1,5', 'l']],
  // pas de coupe entre chiffre et lettre : like "a" -> 0 sur « 0130001A »
  ['0130001A', ['0130001a']],
  ['2022-11-0094', ['2022', '11', '0094']],
  ['Lycée professionnel Jean Moulin', ['lycee', 'professionnel', 'jean', 'moulin']],
  ['', []],
  ['--- (…) !', []],
];

describe('#1285 — ce qu’est un mot : trois écritures, une règle mesurée', () => {
  it.each(CORPUS)('%s', (texte, mots) => {
    expect(wordTokens(texte)).toEqual(mots);
    expect(motsPortail(texte)).toEqual(mots);
    expect(motsDe(texte)).toEqual(mots);
  });
});

describe('#1285 — wordstart côté client = like "mot*" du portail', () => {
  const VALEUR = 'bébés-enfants (hors alimentaire)';

  /** Saisies mesurées sur le portail, avec ce qu'il rend pour la valeur ci-dessus. */
  const SAISIES: Array<[string, boolean]> = [
    ['enf', true], // like "enf*" -> 1 266
    ['ALIMENT', true], // casse repliée
    ['bebes', true], // accents repliés
    ['hors alim', true], // like "hors alim*" : un ET
    ['alim hor', true], // sans ordre ni adjacence — like "ali* hor*" -> 1 266
    ['(hors', true], // la parenthèse de la saisie est un signe
    ['bébés-enf', true],
    ['tation', false], // jamais de milieu de mot
    ['fants', false],
    ['hors xyz', false], // un mot absent suffit
    ['', false], // like "" -> 0
    ['***', false],
  ];

  it.each(SAISIES)('« %s » -> %s', (saisie, attendu) => {
    expect(matchesWordStart(VALEUR, saisie)).toBe(attendu);
    expect(unMotCommencePar(VALEUR, saisie)).toBe(attendu);
    // Ce que la bibliothèque émet, lu par le faux portail fidèle.
    const motif = wordStartLikePattern(saisie);
    expect(motif).not.toBeNull();
    expect(likePortail(VALEUR, motif as string)).toBe(attendu);
  });

  it('champ multivalué : les mots de tous les éléments, ensemble', () => {
    // themes_attendus like "finan* elev*" -> 31 sur le portail
    const themes = ['Elèves', 'Finances', 'Examens'];
    expect(matchesWordStart(themes, 'elev')).toBe(true);
    expect(matchesWordStart(themes, 'finan elev')).toBe(true);
    expect(matchesWordStart(themes, 'finan trans')).toBe(false);
    expect(unMotCommencePar(themes, 'finan elev')).toBe(true);
    expect(likePortail(themes, 'finan* elev*')).toBe(true);
  });

  it('un champ qui n’est pas du texte n’a pas de mot (gtin like "69*" -> 0)', () => {
    for (const valeur of [6922080060801, true, null, undefined, { a: 1 }]) {
      expect(matchesWordStart(valeur, '69')).toBe(false);
      expect(unMotCommencePar(valeur, '69')).toBe(false);
      expect(likePortail(valeur, '69*')).toBe(false);
    }
  });
});

describe('#1285 — le faux portail lit like comme le vrai', () => {
  it('like "%aliment%" ne trouve PAS « alimentation » : le % n’est pas un joker', () => {
    expect(likePortail('alimentation', '%aliment%')).toBe(false); // mesuré : 0 sur 14 366
    expect(likePortail('alimentation', '%alimentation%')).toBe(true); // mot entier
    expect(likePortail('habitat et jardin', '%habitat%')).toBe(true); // mesuré : 637
  });

  it('étoiles : en fin de terme seulement', () => {
    expect(likePortail('alimentation', 'alim*')).toBe(true);
    expect(likePortail('alimentation', '*alim*')).toBe(true); // l'étoile de tête ne compte pas
    expect(likePortail('alimentation', '*tation')).toBe(false);
    expect(likePortail('alimentation', 'al*tion')).toBe(false);
    expect(likePortail('alimentation', 'al*alimentation')).toBe(false);
    expect(likePortail('alimentation', '*')).toBe(true);
    expect(likePortail('alimentation', '')).toBe(false);
  });

  it('plusieurs termes : un ET, l’étoile vaut par terme', () => {
    const v = 'bébés-enfants (hors alimentaire)';
    expect(likePortail(v, 'enfants bébés')).toBe(true);
    expect(likePortail(v, 'bébés hors')).toBe(true);
    expect(likePortail(v, 'hor* alimentaire')).toBe(true);
    expect(likePortail(v, 'hor alimentaire')).toBe(false);
    expect(likePortail(v, 'hor* aliment')).toBe(false);
  });

  it('article élidé et apostrophe', () => {
    const v = "produits de la pêche et d'aquaculture";
    expect(likePortail(v, 'aquaculture')).toBe(true);
    expect(likePortail(v, "d'aquaculture")).toBe(true);
    expect(likePortail(v, 'd')).toBe(false);
    expect(likePortail("kellogg's", 'kellogg')).toBe(false);
    expect(likePortail("kellogg's", "kellogg's")).toBe(true);
    expect(likePortail("kellogg's", 'kellogg*')).toBe(true);
  });
});

describe('#1285 — ce qui part au portail', () => {
  it('les mots de la saisie, repliés, chacun étoilé', () => {
    expect(wordStartLikePattern('Lycée Prof')).toBe('lycee* prof*');
    expect(wordStartLikePattern("l'école")).toBe('ecole*');
    expect(wordStartLikePattern('  bébés-enf ')).toBe('bebes* enf*');
  });

  it('aucun caractère spécial de la saisie n’atteint le portail', () => {
    expect(wordStartLikePattern('al*tion')).toBe('al* tion*');
    expect(wordStartLikePattern('a"b\\c%d')).toBe('a* b* c* d*');
    expect(filterToOdsql('nom:wordstart:a"b\\c')).toBe('nom like "a* b* c*"');
  });

  it('un mot qui garde un signe n’est pas délégué', () => {
    expect(wordStartLikePattern("kellogg's")).toBeNull();
    expect(wordStartLikePattern('marseille.fr')).toBeNull();
    expect(wordStartLikePattern('1,5')).toBeNull();
    expect(wordStartLikePattern('école Ελλάδα')).toBeNull();
    expect(odsqlCanExpress("marque:wordstart:kellogg's")).toBe(false);
    expect(odsqlCanExpress('marque:wordstart:kellogg')).toBe(true);
  });

  it('une saisie sans mot : like "", zéro ligne des deux côtés', () => {
    expect(wordStartLikePattern('---')).toBe('');
    expect(filterToOdsql('nom:wordstart:---')).toBe('nom like ""');
    expect(likePortail('alimentation', '')).toBe(false);
    expect(matchesWordStart('alimentation', '---')).toBe(false);
  });
});

describe('#1285 — la grammaire colon', () => {
  const LIGNES = [
    { id: 1, nom: 'Lycée professionnel Jean Moulin', ville: 'Sète' },
    { id: 2, nom: 'École élémentaire du Port', ville: 'Marseille' },
    { id: 3, nom: 'Collège Jean Jaurès', ville: 'Port-Vendres' },
    { id: 4, nom: null, ville: 'Lyon' },
  ];

  it('est un opérateur de la grammaire', () => {
    expect(WORD_START_OPERATOR).toBe('wordstart');
    expect(validateColonFilter('nom:wordstart:lycée prof')).toBeNull();
    expect(validateColonFilter('nom:wordstart')).toContain('valeur manquante');
  });

  it('filtre côté client', () => {
    const ids = (expr: string) => applyLocalFilter(LIGNES, expr).map((l) => l.id);
    expect(ids('nom:wordstart:jean')).toEqual([1, 3]);
    expect(ids('nom:wordstart:prof lyc')).toEqual([1]);
    expect(ids('nom:wordstart:ecole')).toEqual([2]);
    expect(ids('nom:wordstart:cole')).toEqual([]);
    // Champs multiples (#1026) : un OU entre les champs
    expect(ids('nom|ville:wordstart:port')).toEqual([2, 3]);
  });

  it('contains reste une sous-chaîne, sensible aux accents', () => {
    const ids = (expr: string) => applyLocalFilter(LIGNES, expr).map((l) => l.id);
    expect(ids('nom:contains:cole')).toEqual([2]);
    expect(ids('nom:contains:ecole')).toEqual([]);
    expect(ids('nom:notcontains:jean')).toEqual([2, 4]); // la valeur absente est gardée
  });

  it('splitFilterForOdsql : ce qui part, ce qui reste', () => {
    expect(splitFilterForOdsql('annee:eq:2024, nom:contains:aliment')).toEqual({
      server: 'annee:eq:2024',
      client: 'nom:contains:aliment',
      odsql: 'annee = "2024"',
    });
    expect(splitFilterForOdsql('nom:wordstart:aliment')).toEqual({
      server: 'nom:wordstart:aliment',
      client: '',
      odsql: 'nom like "aliment*"',
    });
  });

  it('filterToOdsql n’écrit plus jamais like "%…%"', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(filterToOdsql('nom:contains:aliment')).toBe('');
    expect(filterToOdsql('nom:notcontains:aliment')).toBe('');
    expect(filterToOdsql('a|b:contains:x')).toBe('');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("n'a pas d'équivalent ODSQL"));
    warn.mockRestore();
  });
});

describe('#1285 — table de délégation par fournisseur', () => {
  const cas: Array<[string, string, boolean]> = [
    ['opendatasoft', 'n:contains:x', false],
    ['opendatasoft', 'n:notcontains:x', false],
    ['opendatasoft', 'n:wordstart:x', true],
    ['opendatasoft', "n:wordstart:o'brien", false],
    ['opendatasoft', 'n:eq:x', true],
    ['tabular', 'n:contains:x', true],
    ['tabular', 'n:contains:100%', true], // échappé par l'adaptateur
    ['tabular', 'n:contains:a\\b', false], // antislash : échappement non mesuré
    ['tabular', 'n:notcontains:x', false], // l'API écarte les valeurs absentes
    ['tabular', 'n:wordstart:x', false],
    ['grist', 'n:contains:x', false],
    ['grist', 'n:notcontains:x', false],
    ['grist', 'n:wordstart:x', false],
    ['grist', 'n:gte:3', true],
    ['insee', 'GEO:eq:FRANCE', true],
    ['insee', 'GEO:in:A|B', true],
    ['insee', 'GEO:contains:FR', false],
    ['insee', 'OBS_VALUE:gt:3', false],
    ['generic', 'n:wordstart:x', false],
    ['generic', 'n:contains:x', true],
  ];
  it.each(cas)('%s — %s -> %s', (fournisseur, clause, attendu) => {
    expect(serverComputesClause(fournisseur, clause)).toBe(attendu);
  });

  it('partage un filtre entre le serveur et le client', () => {
    expect(splitFilterForProvider('tabular', 'a:eq:1, n:notcontains:x, n:contains:y')).toEqual({
      server: 'a:eq:1, n:contains:y',
      client: 'n:notcontains:x',
    });
  });
});

/**
 * Faux serveurs des trois variantes API de la recette (#625).
 *
 * CE MODULE NE SAIT RIEN DE PLAYWRIGHT : il prend une URL, il rend une
 * reponse. C'est ce qui permet de l'eprouver hors ligne
 * (`tests/builder-e2e/api-fixtures.test.ts`) plutot que de decouvrir ses
 * propres bugs a travers un echec de rendu.
 *
 * Les trois enveloppes sont celles des API reelles, verifiees dans les
 * adaptateurs :
 *   - OpenDataSoft : `{ total_count, results }`, pagine par `offset`/`limit`,
 *     100 lignes par page (`ODS_PAGE_SIZE`) ;
 *   - Tabular      : `{ data, links, meta: { page, page_size, total } }`,
 *     pagine par `page`, la page suivante annoncee dans `links.next` ;
 *   - API generique : tableau nu.
 * Plus la quatrieme, celle du mode `fetch-mode="export"` (#689, ADR-106) :
 * `/exports/json` rend TOUT le jeu en un tableau nu, borne par `limit`.
 *
 * Fidelite volontaire sur deux points contre-intuitifs :
 *   - sur une requete `group_by`, ODS renvoie un `total_count` egal a la
 *     TAILLE DE PAGE, pas au nombre de groupes (#641). L'adaptateur a raison
 *     de l'ignorer ; le faux serveur ment donc comme le vrai.
 *   - Tabular accepte `colonne__op` sur un nom a espaces, accents ou
 *     apostrophe, percent-encode (#985, mesure du 2026-09-22) : l'adaptateur
 *     les delegue, et le faux serveur les lit tels quels (`URLSearchParams`
 *     decode). `columns=` projette les lignes, et le refuse a cote d'un
 *     agregateur, comme le vrai.
 */

/**
 * Une ligne du jeu de recette.
 *
 * Alias de type et non interface : seul un alias recoit la signature d'index
 * implicite qui le rend assignable a `Ligne` (`Record<string, unknown>`), la
 * forme que manipulent les faux serveurs.
 */
export type LigneRecette = {
  region: string;
  code_dept: string;
  code_reg: string;
  academie: string;
  pays_iso2: string;
  population: number;
  /** Le nom de colonne piegeux : apostrophe + espaces (#615). */
  "Nombre d'habitants": number;
};

/** Taille de page de l'API ODS — doit rester alignee sur `ODS_PAGE_SIZE`. */
export const ODS_PAGE_SIZE = 100;

/** Taille de page de l'API Tabular (200, son maximum reel, #1019) — doit rester alignee sur `TABULAR_PAGE_SIZE`. */
export const TABULAR_PAGE_SIZE = 200;

/**
 * Hotes des trois variantes.
 *
 * Tabular est le VRAI hote : `generateSourceHTML` n'emet pas de `base-url`
 * pour cette variante, l'adaptateur retombe donc sur
 * `TABULAR_CONFIG.defaultBaseUrl`. Les deux autres sont en `.invalid` (TLD
 * reserve, RFC 2606) : meme si une route venait a manquer, aucune requete ne
 * peut joindre quoi que ce soit.
 */
export const HOTES = {
  page: 'https://recette.invalid',
  ods: 'https://donnees.recette.invalid',
  tabular: 'https://tabular-api.data.gouv.fr',
  generique: 'https://api.recette.invalid',
} as const;

/** Identifiants de ressource des deux variantes a adaptateur. */
export const RESSOURCES = {
  datasetId: 'jeu-de-recette',
  resourceId: 'ea1b5c3d-0000-4000-8000-recette00625',
} as const;

/** URL du jeu, variante API generique (tableau nu). */
export const URL_GENERIQUE = `${HOTES.generique}/api/territoires`;

/**
 * Etiquettes piegeuses, reprises de la recette locale (#615) : ce sont elles
 * qui cassaient les attributs `data='…'` et les litteraux JS.
 */
const PIEGES: Array<Pick<LigneRecette, 'region' | 'code_dept'>> = [
  { region: "Val-d'Oise", code_dept: '95' },
  { region: "Provence-Alpes-Côte d'Azur", code_dept: '13' },
  { region: 'Recherche & Développement', code_dept: '75' },
  { region: "Côte-d'Or", code_dept: '21' },
  { region: 'Ille-et-Vilaine', code_dept: '35' },
];

/** Codes departements valides (cf. `isValidDeptCode`). */
const CODES_DEPT = [
  ...Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, '0')).filter((c) => c !== '20'),
  '2A',
  '2B',
  '971',
  '972',
  '973',
  '974',
  '976',
];

const CODES_REG = ['11', '24', '27', '28', '32', '44', '52', '53', '75', '76', '84', '93', '94'];

const ACADEMIES = [
  'PARIS',
  'LYON',
  'LILLE',
  'NANTES',
  'RENNES',
  'BORDEAUX',
  'TOULOUSE',
  'GRENOBLE',
];

const PAYS = ['FR', 'DE', 'ES', 'IT', 'BE', 'PT', 'NL'];

/**
 * Le jeu doit depasser `ODS_PAGE_SIZE` pour que la pagination ODS soit
 * REELLEMENT exercee : a 100 lignes ou moins, la seconde requete n'existe pas
 * et `offset=100` ne serait jamais verifie.
 */
export const NOMBRE_DE_LIGNES = 137;

/** Le jeu de recette, partage par les quatre faux serveurs. */
export const JEU: LigneRecette[] = Array.from({ length: NOMBRE_DE_LIGNES }, (_, i) => {
  const piege = PIEGES[i];
  const population = 1_000_000 - i * 1_000;
  return {
    region: piege ? piege.region : `Territoire ${String(i + 1).padStart(3, '0')}`,
    code_dept: piege ? piege.code_dept : CODES_DEPT[i % CODES_DEPT.length],
    code_reg: CODES_REG[i % CODES_REG.length],
    academie: ACADEMIES[i % ACADEMIES.length],
    pays_iso2: PAYS[i % PAYS.length],
    population,
    "Nombre d'habitants": population,
  };
});

/** Le nom de colonne piegeux, expose pour les assertions. */
export const CHAMP_PIEGE = "Nombre d'habitants";

/** Une ligne quelconque du jeu, indexable par nom de colonne. */
type Ligne = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Outils ODSQL
// ---------------------------------------------------------------------------

/** Retire les backquotes d'un identifiant ODSQL echappe (#289). */
function denuder(identifiant: string): string {
  const nu = identifiant.trim();
  return nu.startsWith('`') && nu.endsWith('`') ? nu.slice(1, -1) : nu;
}

/** Decoupe une liste ODSQL sur les virgules DE PREMIER NIVEAU. */
function decouperNiveauUn(expression: string): string[] {
  const morceaux: string[] = [];
  let profondeur = 0;
  let courant = '';
  for (const caractere of expression) {
    if (caractere === '(') profondeur++;
    if (caractere === ')') profondeur--;
    if (caractere === ',' && profondeur === 0) {
      morceaux.push(courant);
      courant = '';
      continue;
    }
    courant += caractere;
  }
  morceaux.push(courant);
  return morceaux.map((m) => m.trim()).filter(Boolean);
}

/** Un element de `select` ODS : une agregation aliasee, ou un champ nu. */
interface ElementSelect {
  alias: string;
  fonction: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinct' | null;
  champ: string;
}

const AGREGAT = /^(sum|avg|min|max|count)\s*\(\s*(.*?)\s*\)\s+as\s+(.+)$/i;

function analyserSelect(select: string): ElementSelect[] {
  return decouperNiveauUn(select).map((element) => {
    const trouve = AGREGAT.exec(element);
    if (!trouve) {
      const champ = denuder(element);
      return { alias: champ, fonction: null, champ };
    }
    const [, fonctionBrute, argument, alias] = trouve;
    const fonction = fonctionBrute.toLowerCase() as ElementSelect['fonction'];
    if (fonction === 'count' && /^distinct\s+/i.test(argument)) {
      return {
        alias: denuder(alias),
        fonction: 'distinct',
        champ: denuder(argument.replace(/^distinct\s+/i, '')),
      };
    }
    return { alias: denuder(alias), fonction, champ: denuder(argument) };
  });
}

function nombre(valeur: unknown): number {
  const n = Number(valeur);
  return Number.isFinite(n) ? n : 0;
}

function appliquerAgregat(element: ElementSelect, lignes: Ligne[]): unknown {
  const valeurs = lignes.map((l) => nombre(l[element.champ]));
  switch (element.fonction) {
    case 'sum':
      return valeurs.reduce((a, b) => a + b, 0);
    case 'avg':
      return valeurs.length === 0 ? 0 : valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
    case 'min':
      return Math.min(...valeurs);
    case 'max':
      return Math.max(...valeurs);
    case 'count':
      return lignes.length;
    case 'distinct':
      return new Set(lignes.map((l) => String(l[element.champ]))).size;
    default:
      return lignes[0]?.[element.champ];
  }
}

/** Un predicat ODSQL compile : une ligne, un booleen. */
type PredicatOdsql = (ligne: Ligne) => boolean;

/** Tout refus du parseur porte le meme prefixe : le harnais ne ment jamais en silence. */
function refus(where: string, position: number, raison: string): Error {
  return new Error(
    `clause ODSQL non geree par la fixture : « ${where} » — ${raison} (position ${position})`
  );
}

/**
 * Sous-ensemble d'ODSQL reellement emis par le pipeline : comparaisons
 * (`champ = "valeur"`, `champ >= 12`) combinees par `AND` / `OR` et
 * regroupees par des PARENTHESES, avec les guillemets echappes `\"` dans les
 * litteraux chaine. Le vrai portail lit cette grammaire ; le harnais aussi,
 * sans quoi un `where` a parentheses (#767) serait rejete par la fixture alors
 * que la bibliotheque l'a correctement transmis — et l'echec accuserait le
 * mauvais coupable.
 *
 * Toute autre forme (`LIKE`, `date'…'`, fonctions) est REFUSEE, jamais ignoree :
 * rendre le jeu complet en silence transformerait un filtre perdu en succes.
 */
function analyserOdsql(where: string): PredicatOdsql {
  let i = 0;

  const blancs = (): void => {
    while (i < where.length && /\s/.test(where[i])) i++;
  };

  /** Consomme un mot-cle (`and`, `or`) s'il vient ensuite, sans couper un identifiant. */
  const motCle = (mot: string): boolean => {
    blancs();
    if (where.slice(i, i + mot.length).toLowerCase() !== mot) return false;
    const apres = where[i + mot.length];
    if (apres !== undefined && /[\w.]/.test(apres)) return false;
    i += mot.length;
    return true;
  };

  const identifiant = (): string => {
    blancs();
    if (where[i] === '`') {
      const fin = where.indexOf('`', i + 1);
      if (fin === -1) throw refus(where, i, 'identifiant echappe non ferme');
      const nom = where.slice(i + 1, fin);
      i = fin + 1;
      return nom;
    }
    const debut = i;
    while (i < where.length && /[\w.]/.test(where[i])) i++;
    if (i === debut) throw refus(where, i, 'identifiant attendu');
    return denuder(where.slice(debut, i));
  };

  /** Litteral chaine `"…"` ou `'…'` — ODSQL accepte les deux —, `\"` compris. */
  const chaine = (): string => {
    const guillemet = where[i];
    i++;
    let valeur = '';
    while (i < where.length && where[i] !== guillemet) {
      if (where[i] === '\\') {
        i++;
        valeur += where[i] ?? '';
        i++;
        continue;
      }
      valeur += where[i];
      i++;
    }
    if (where[i] !== guillemet) throw refus(where, i, 'litteral chaine non ferme');
    i++;
    return valeur;
  };

  const OPERATEURS = ['>=', '<=', '!=', '=', '>', '<'] as const;

  const comparaison = (): PredicatOdsql => {
    const champ = identifiant();
    blancs();
    const operateur = OPERATEURS.find((o) => where.startsWith(o, i));
    if (!operateur) throw refus(where, i, 'operateur de comparaison attendu');
    i += operateur.length;
    blancs();

    if (where[i] === '"' || where[i] === "'") {
      const attendue = chaine();
      return (ligne) => {
        // Logique SQL a TROIS valeurs (#958) : une valeur ABSENTE ne satisfait
        // NI `=` NI `!=`. Mesure du 2026-09-20 sur data.education.gouv.fr,
        // `themes_attendus` (176 lignes dont 21 nulles) : `= "Eleves"` -> 124,
        // `!= "Eleves"` -> 31 (= 155 renseignees - 124), et non 52. La fixture
        // rendait 52 : elle aurait fait passer pour juste un client divergent.
        const brut = ligne[champ];
        if (brut === null || brut === undefined) return false;
        const gauche = String(brut);
        return operateur === '!=' ? gauche !== attendue : gauche === attendue;
      };
    }

    const debut = i;
    while (i < where.length && /[-\d.]/.test(where[i])) i++;
    if (i === debut) throw refus(where, i, 'litteral chaine ou numerique attendu');
    const droite = Number(where.slice(debut, i));
    return (ligne) => {
      const brut = ligne[champ];
      // Absent : ni `=` ni `!=` (#958), comme ci-dessus.
      if (brut === null || brut === undefined) return false;
      const valeur = nombre(brut);
      switch (operateur) {
        case '=':
          return valeur === droite;
        case '!=':
          return valeur !== droite;
        case '>':
          return valeur > droite;
        case '<':
          return valeur < droite;
        case '>=':
          return valeur >= droite;
        default:
          return valeur <= droite;
      }
    };
  };

  const facteur = (): PredicatOdsql => {
    blancs();
    if (where[i] !== '(') return comparaison();
    i++;
    const dedans = expression();
    blancs();
    if (where[i] !== ')') throw refus(where, i, 'parenthese non fermee');
    i++;
    return dedans;
  };

  const terme = (): PredicatOdsql => {
    let gauche = facteur();
    while (motCle('and')) {
      const precedent = gauche;
      const droite = facteur();
      gauche = (ligne) => precedent(ligne) && droite(ligne);
    }
    return gauche;
  };

  function expression(): PredicatOdsql {
    let gauche = terme();
    while (motCle('or')) {
      const precedent = gauche;
      const droite = terme();
      gauche = (ligne) => precedent(ligne) || droite(ligne);
    }
    return gauche;
  }

  const predicat = expression();
  blancs();
  if (i < where.length) throw refus(where, i, 'texte inattendu apres la clause');
  return predicat;
}

export function filtrerOdsql(lignes: Ligne[], where: string): Ligne[] {
  if (!where.trim()) return lignes;
  const predicat = analyserOdsql(where);
  return lignes.filter(predicat);
}

/** `"champ DESC, autre ASC"` — la forme qu'emet `toOdsOrderBy`. */
function trierOds(lignes: Ligne[], orderBy: string): Ligne[] {
  if (!orderBy.trim()) return lignes;
  const criteres = orderBy.split(',').map((part) => {
    const [champ, direction = 'ASC'] = part.trim().split(/\s+/);
    return { champ: denuder(champ), descendant: direction.toUpperCase() === 'DESC' };
  });
  return [...lignes].sort((a, b) => {
    for (const { champ, descendant } of criteres) {
      const ga = a[champ];
      const gb = b[champ];
      const comparaison =
        typeof ga === 'number' && typeof gb === 'number'
          ? ga - gb
          : String(ga).localeCompare(String(gb), 'fr');
      if (comparaison !== 0) return descendant ? -comparaison : comparaison;
    }
    return 0;
  });
}

function agregerOds(lignes: Ligne[], groupBy: string, select: string): Ligne[] {
  const champs = decouperNiveauUn(groupBy).map(denuder);
  const elements = analyserSelect(select);
  const groupes = new Map<string, Ligne[]>();
  for (const ligne of lignes) {
    const cle = champs.map((c) => String(ligne[c])).join('');
    const seau = groupes.get(cle);
    if (seau) seau.push(ligne);
    else groupes.set(cle, [ligne]);
  }
  return [...groupes.values()].map((seau) => {
    const sortie: Ligne = {};
    for (const champ of champs) sortie[champ] = seau[0][champ];
    for (const element of elements) {
      if (element.fonction === null && champs.includes(element.champ)) continue;
      sortie[element.alias] = appliquerAgregat(element, seau);
    }
    return sortie;
  });
}

/**
 * Un `select` d'agregats SEULS, sans `group_by` (#810) : `count(*) as n,
 * sum(population) as pop`. Un seul champ nu dans la liste annule tout — c'est
 * la regle que suit l'adaptateur pour choisir son chemin « une requete, une
 * ligne ».
 */
function estAgregatSeul(select: string): boolean {
  if (!select.trim()) return false;
  const elements = analyserSelect(select);
  return elements.length > 0 && elements.every((e) => e.fonction !== null);
}

/**
 * Agregat global : UNE ligne, ou AUCUNE.
 *
 * Le vrai portail rend `results: []` quand le filtre ne garde rien — il ne
 * synthetise pas une ligne de zeros. C'est precisement ce que l'adaptateur
 * doit rattraper (`count` → 0, les autres → null) ; le faux serveur ment donc
 * comme le vrai, sans quoi ce rattrapage ne serait jamais exerce.
 */
function agregerGlobal(lignes: Ligne[], select: string): Ligne[] {
  if (lignes.length === 0) return [];
  const sortie: Ligne = {};
  for (const element of analyserSelect(select)) {
    sortie[element.alias] = appliquerAgregat(element, lignes);
  }
  return [sortie];
}

/** Le corps commun de `/records` et `/exports/json` : filtre, agregation, tri. */
function calculerOds(jeu: Ligne[], p: URLSearchParams): Ligne[] {
  const filtrees = filtrerOdsql(jeu, p.get('where') ?? '');
  const groupBy = p.get('group_by') ?? '';
  const select = p.get('select') ?? '';
  const completes = groupBy
    ? agregerOds(filtrees, groupBy, select)
    : estAgregatSeul(select)
      ? agregerGlobal(filtrees, select)
      : filtrees;
  return trierOds(completes, p.get('order_by') ?? '');
}

// ---------------------------------------------------------------------------
// Les quatre faux serveurs
// ---------------------------------------------------------------------------

/** Enveloppe ODS `/records`. */
export interface EnveloppeOds {
  total_count: number;
  results: Ligne[];
}

/**
 * `/api/explore/v2.1/catalog/datasets/ID/records`.
 *
 * `total_count` sur une requete `group_by` vaut la taille de page, pas le
 * nombre de groupes : c'est le mensonge du vrai ODS (#641), reproduit ici
 * pour que la recette prouve que l'adaptateur a raison de l'ignorer.
 */
export function repondreOdsRecords(url: URL, jeu: Ligne[] = JEU): EnveloppeOds {
  const p = url.searchParams;
  const groupBy = p.get('group_by') ?? '';
  const limite = Number(p.get('limit') ?? String(ODS_PAGE_SIZE));
  const decalage = Number(p.get('offset') ?? '0');

  const triees = calculerOds(jeu, p);
  const page = triees.slice(decalage, decalage + limite);

  return { total_count: groupBy ? page.length : triees.length, results: page };
}

/**
 * `/api/explore/v2.1/catalog/datasets/ID/exports/json` (#689, ADR-106) :
 * tout le jeu en UNE requete, tableau NU. `limit` y borne la requete entiere,
 * pas une page — le mode `export` demande `plafond + 1` pour detecter la
 * troncature en l'absence de `total_count`.
 */
export function repondreOdsExport(url: URL, jeu: Ligne[] = JEU): Ligne[] {
  const p = url.searchParams;
  const triees = calculerOds(jeu, p);
  const limite = Number(p.get('limit') ?? '0');
  return limite > 0 ? triees.slice(0, limite) : triees;
}

/** Enveloppe ODS `/facets`. */
export interface EnveloppeFacettes {
  facets: Array<{ name: string; facets: Array<{ value: string; count: number }> }>;
}

/**
 * `/api/explore/v2.1/catalog/datasets/ID/facets` : valeurs distinctes et
 * comptes, calcules sur le jeu (filtre par `where` s'il y en a un).
 */
export function repondreOdsFacets(url: URL, jeu: Ligne[] = JEU): EnveloppeFacettes {
  const p = url.searchParams;
  const filtrees = filtrerOdsql(jeu, p.get('where') ?? '');
  const champs = p.getAll('facet');
  return {
    facets: champs.map((champ) => {
      const comptes = new Map<string, number>();
      for (const ligne of filtrees) {
        const valeur = String(ligne[champ] ?? '');
        comptes.set(valeur, (comptes.get(valeur) ?? 0) + 1);
      }
      return {
        name: champ,
        facets: [...comptes.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([value, count]) => ({ value, count })),
      };
    }),
  };
}

/** Metadonnees du jeu ODS (`/datasets/ID`) — source de la decouverte de facettes (#680). */
export function repondreOdsMetadonnees(): Record<string, unknown> {
  return {
    dataset_id: RESSOURCES.datasetId,
    fields: [
      { name: 'region', label: 'Région', type: 'text', annotations: { facet: true } },
      { name: 'code_dept', label: 'Code département', type: 'text', annotations: { facet: true } },
      { name: 'population', label: 'Population', type: 'int' },
      { name: CHAMP_PIEGE, label: CHAMP_PIEGE, type: 'int' },
    ],
  };
}

/** Enveloppe Tabular. */
export interface EnveloppeTabular {
  data: Ligne[];
  links: { next: string | null; prev: string | null };
  /**
   * `total` ABSENT d'une reponse agregee : l'API ne le donne pas, seul
   * `links.next` pagine les groupes (mesure du 2026-09-22, #1025).
   */
  meta: { page: number; page_size: number; total?: number };
  /**
   * Requete refusee (#985). Le vrai serveur repond 400 avec ce seul champ ;
   * le faux le sert en 200 avec `data` VIDE — l'adaptateur lit alors zero
   * ligne, et tout chiffre calcule dessus tombe, ce qui suffit a rougir le
   * controle qui l'aurait provoque.
   */
  errors?: Array<{ title: string; detail: string }>;
}

/** Reponse d'erreur Tabular : pas de lignes, le motif dans `errors`. */
function erreurTabular(page: number, taille: number, detail: string): EnveloppeTabular {
  return {
    data: [],
    links: { next: null, prev: null },
    meta: { page, page_size: taille },
    errors: [{ title: 'Invalid query string', detail }],
  };
}

/**
 * `/api/resources/ID/data/`.
 *
 * Les flags nus (`colonne__groupby`, `colonne__sum`) arrivent SANS `=` :
 * `URLSearchParams` les rend avec une valeur vide, ce qui suffit a les
 * distinguer des parametres values (#596).
 *
 * `columns=a,b` (#985) projette les lignes sur ces colonnes, comme l'API
 * (mesure du 2026-09-22) : une colonne inconnue est une erreur (42703), et
 * `columns` a cote d'un agregateur aussi (« the argument `columns` cannot be
 * set alongside aggregators »). Sans cette fidelite, le deterministe ne
 * verrait pas la projection — ni une projection qui retirerait une colonne
 * lue en aval.
 */
export function repondreTabular(url: URL, jeu: Ligne[] = JEU): EnveloppeTabular {
  const p = url.searchParams;
  const page = Number(p.get('page') ?? '1');
  const taille = Number(p.get('page_size') ?? String(TABULAR_PAGE_SIZE));
  const colonnes = p.has('columns')
    ? (p.get('columns') ?? '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
    : null;

  const groupes: string[] = [];
  const agregats: Array<{ champ: string; fonction: string }> = [];
  const tris: Array<{ champ: string; descendant: boolean }> = [];
  let filtrees: Ligne[] = jeu;

  for (const [cle, valeur] of p.entries()) {
    if (valeur === '' && cle.endsWith('__groupby')) {
      groupes.push(cle.slice(0, -'__groupby'.length));
      continue;
    }
    const agregat = /^(.+)__(sum|avg|min|max|count)$/.exec(cle);
    if (valeur === '' && agregat) {
      agregats.push({ champ: agregat[1], fonction: agregat[2] });
      continue;
    }
    if (cle.endsWith('__sort')) {
      tris.push({ champ: cle.slice(0, -'__sort'.length), descendant: valeur === 'desc' });
      continue;
    }
    const filtre =
      /^(.+)__(exact|differs|strictly_greater|greater|strictly_less|less|contains|in)$/.exec(cle);
    if (filtre) {
      const [, champ, operateur] = filtre;
      filtrees = filtrerTabular(filtrees, champ, operateur, valeur);
    }
  }

  if (colonnes !== null) {
    if (groupes.length > 0 || agregats.length > 0) {
      return erreurTabular(
        page,
        taille,
        'Malformed query: the argument `columns` cannot be set alongside aggregators'
      );
    }
    const connues = new Set(jeu.flatMap((ligne) => Object.keys(ligne)));
    const inconnue = colonnes.find((c) => !connues.has(c));
    if (inconnue !== undefined) {
      return erreurTabular(page, taille, `column ${inconnue} does not exist`);
    }
  }

  let lignes = filtrees;
  if (groupes.length > 0 && agregats.length === 0) {
    // `champ__groupby` SEUL : l'API ne regroupe pas, elle rend une ligne par
    // ligne brute, reduite aux champs de regroupement — des modalites
    // REPETEES (`Code sexe__groupby&page_size=5` → F, M, M, F, M, mesure du
    // 2026-09-22, api-tabular#119, #1025).
    lignes = filtrees.map((ligne) =>
      Object.fromEntries(groupes.map((g) => [g, ligne[g]] as const))
    );
  } else if (groupes.length > 0) {
    const select = [
      ...agregats.map((a) => `${a.fonction}(\`${a.champ}\`) as \`${a.champ}__${a.fonction}\``),
      ...groupes.map((g) => `\`${g}\``),
    ].join(', ');
    lignes = agregerOds(filtrees, groupes.map((g) => `\`${g}\``).join(', '), select);
  }
  if (tris.length > 0) {
    lignes = trierOds(
      lignes,
      tris.map((t) => `${t.champ} ${t.descendant ? 'DESC' : 'ASC'}`).join(', ')
    );
  }

  const debut = (page - 1) * taille;
  const tranche = lignes.slice(debut, debut + taille);
  const restant = debut + tranche.length < lignes.length;
  const suivante = `/api/resources/${RESSOURCES.resourceId}/data/?page=${page + 1}&page_size=${taille}`;

  return {
    // Projection APRES filtres et tris : un filtre ou un tri peut porter sur
    // une colonne que `columns` ne rend pas (mesure du 2026-09-22).
    data:
      colonnes === null
        ? tranche
        : tranche.map((ligne) => Object.fromEntries(colonnes.map((c) => [c, ligne[c]] as const))),
    links: {
      next: restant ? suivante : null,
      prev: page > 1 ? `/api/resources/${RESSOURCES.resourceId}/data/?page=${page - 1}` : null,
    },
    // Reponse agregee : pas de `meta.total` (`{page, page_size}` seulement,
    // mesure du 2026-09-22, #1025) — un faux serveur qui le fournirait
    // cacherait le defaut que le vrai revele.
    meta:
      agregats.length > 0
        ? { page, page_size: taille }
        : { page, page_size: taille, total: lignes.length },
  };
}

function filtrerTabular(
  lignes: Ligne[],
  champ: string,
  operateur: string,
  valeur: string
): Ligne[] {
  return lignes.filter((ligne) => {
    const gauche = ligne[champ];
    switch (operateur) {
      case 'exact':
        return String(gauche) === valeur;
      case 'differs':
        return String(gauche) !== valeur;
      case 'contains':
        return String(gauche).toLowerCase().includes(valeur.toLowerCase());
      case 'strictly_less':
        return nombre(gauche) < Number(valeur);
      case 'less':
        return nombre(gauche) <= Number(valeur);
      case 'strictly_greater':
        return nombre(gauche) > Number(valeur);
      case 'greater':
        return nombre(gauche) >= Number(valeur);
      case 'in':
        return valeur.split(',').includes(String(gauche));
      default:
        return true;
    }
  });
}

/** API generique : tableau NU, sans enveloppe ni pagination. */
export function repondreGenerique(jeu: Ligne[] = JEU): Ligne[] {
  return jeu;
}

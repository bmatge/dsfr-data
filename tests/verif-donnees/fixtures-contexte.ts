/**
 * Alimentation déterministe du lot « contexte, facettes, recherche, URL ».
 *
 * Les lignes servies à la page et celles dont l'oracle repart sont les MÊMES.
 * Ce module ne sait rien de Playwright : il prend une URL, il rend une
 * réponse — le spec e2e branche `page.route` dessus, à travers `fixtures.ts`.
 *
 * Le jeu est écrit à la main, pas engendré : chaque ligne y sert un contrôle
 * précis, et les bornes de date sont posées à une journée près.
 *
 *   - `date` couvre mars 2025 → octobre 2026, avec les voisinages qui font
 *     échouer une borne fausse : le 2026-03-15 et le 2026-03-16 (lendemain
 *     exclusif de `lt-day-after`), le 2026-05-24 et le 2026-05-25 (J-7 d'une
 *     horloge posée au 1er juin), le 2026-05-31 et le 2026-06-01 (bascule de
 *     mois, en JOUR CIVIL LOCAL) ;
 *   - `region` et `categorie` ont des effectifs TOUS DIFFÉRENTS (8/7/6/4 et
 *     10/8/7) : un tri par compteur décroissant a donc un seul ordre juste,
 *     et un compteur faux se voit sans départager d'ex æquo ;
 *   - `libelle` porte des accents (« École », « Sète », « Béziers ») : une
 *     recherche sur « ecole » doit les trouver ;
 *   - `effectif` sert de `weight-field` — un compteur qui somme une mesure au
 *     lieu de compter des lignes.
 *
 * Le second jeu, `BUDGETS`, n'a PAS de colonne `categorie` : c'est la source
 * cible dont un filtre de contexte doit s'exclure au lieu de partir chercher
 * un HTTP 400 (#805).
 */
import type { Row } from '../../tools/oracle/manifest.js';

/** Hôtes fictifs — TLD réservé (RFC 2606) : rien ne peut joindre le réseau. */
export const HOTE_API_CONTEXTE = 'https://api.contexte.invalid';
export const HOTE_ODS_CONTEXTE = 'https://ods.contexte.invalid';

/** Jeux ODS du lot — le second n'a pas de colonne `categorie` (#805). */
export const DATASET_CONTEXTE = 'etablissements';
export const DATASET_BUDGETS = 'budgets';

// Une ligne par établissement : un jeu de fixtures se lit comme un tableau.
// prettier-ignore
export const ETABLISSEMENTS: Row[] = [
  { id: '01', date: '2025-03-15', region: 'Occitanie',                  departement: '31', categorie: 'École',   population: 1200, effectif: 30, libelle: 'École Jean Jaurès' },
  { id: '02', date: '2025-09-01', region: 'Occitanie',                  departement: '31', categorie: 'Collège', population: 2400, effectif: 60, libelle: 'Collège Victor Hugo' },
  { id: '03', date: '2025-09-15', region: 'Bretagne',                   departement: '35', categorie: 'École',   population:  800, effectif: 20, libelle: 'École des Îles' },
  { id: '04', date: '2025-11-20', region: 'Bretagne',                   departement: '29', categorie: 'Lycée',   population: 3000, effectif: 75, libelle: 'Lycée de la Mer' },
  { id: '05', date: '2025-12-31', region: 'Normandie',                  departement: '76', categorie: 'École',   population:  500, effectif: 10, libelle: 'École du Havre' },
  { id: '06', date: '2026-01-10', region: 'Normandie',                  departement: '14', categorie: 'Collège', population: 1500, effectif: 40, libelle: 'Collège de Caen' },
  { id: '07', date: '2026-02-14', region: 'Occitanie',                  departement: '34', categorie: 'Lycée',   population: 2200, effectif: 55, libelle: 'Lycée de Montpellier' },
  { id: '08', date: '2026-03-01', region: "Provence-Alpes-Côte d'Azur", departement: '13', categorie: 'École',   population:  900, effectif: 25, libelle: 'École de Marseille Sud' },
  { id: '09', date: '2026-03-15', region: "Provence-Alpes-Côte d'Azur", departement: '06', categorie: 'Collège', population: 1800, effectif: 45, libelle: 'Collège de Nice' },
  { id: '10', date: '2026-03-16', region: 'Bretagne',                   departement: '35', categorie: 'École',   population:  700, effectif: 18, libelle: 'École de Rennes' },
  { id: '11', date: '2026-03-31', region: 'Occitanie',                  departement: '31', categorie: 'Lycée',   population: 2600, effectif: 65, libelle: 'Lycée de Toulouse Centre' },
  { id: '12', date: '2026-04-02', region: 'Bretagne',                   departement: '35', categorie: 'École',   population:  400, effectif: 12, libelle: 'École de Vitré' },
  { id: '13', date: '2026-05-05', region: 'Normandie',                  departement: '14', categorie: 'Lycée',   population: 2500, effectif: 62, libelle: 'Lycée de Lisieux' },
  { id: '14', date: '2026-05-10', region: 'Bretagne',                   departement: '29', categorie: 'Collège', population: 1100, effectif: 28, libelle: 'Collège de Brest' },
  { id: '15', date: '2026-05-24', region: "Provence-Alpes-Côte d'Azur", departement: '13', categorie: 'École',   population:  950, effectif: 22, libelle: "École d'Aubagne" },
  { id: '16', date: '2026-05-25', region: "Provence-Alpes-Côte d'Azur", departement: '06', categorie: 'Lycée',   population: 2100, effectif: 52, libelle: "Lycée d'Antibes" },
  { id: '17', date: '2026-05-31', region: 'Occitanie',                  departement: '34', categorie: 'École',   population:  600, effectif: 15, libelle: 'École de Sète' },
  { id: '18', date: '2026-06-01', region: 'Occitanie',                  departement: '31', categorie: 'Collège', population: 1700, effectif: 42, libelle: 'Collège des Minimes' },
  { id: '19', date: '2026-06-01', region: 'Bretagne',                   departement: '35', categorie: 'Lycée',   population: 2900, effectif: 70, libelle: 'Lycée de Saint-Malo' },
  { id: '20', date: '2026-06-10', region: 'Occitanie',                  departement: '31', categorie: 'École',   population:  550, effectif: 14, libelle: 'École de Blagnac' },
  { id: '21', date: '2026-06-20', region: "Provence-Alpes-Côte d'Azur", departement: '13', categorie: 'Collège', population: 1600, effectif: 38, libelle: "Collège d'Aix" },
  { id: '22', date: '2026-07-05', region: 'Occitanie',                  departement: '34', categorie: 'Lycée',   population: 2300, effectif: 58, libelle: 'Lycée de Béziers' },
  { id: '23', date: '2026-08-30', region: 'Bretagne',                   departement: '29', categorie: 'École',   population:  750, effectif: 19, libelle: 'École de Quimper' },
  { id: '24', date: '2026-09-02', region: 'Normandie',                  departement: '76', categorie: 'Collège', population: 1300, effectif: 33, libelle: 'Collège de Dieppe' },
  { id: '25', date: '2026-10-15', region: "Provence-Alpes-Côte d'Azur", departement: '06', categorie: 'Lycée',   population: 2000, effectif: 50, libelle: 'Lycée de Cannes' },
];

/**
 * Le jeu SANS colonne `categorie` (#805). Un filtre de contexte posé sur
 * `categorie` et visant les deux sources doit exclure celle-ci — et le dire —
 * plutôt que lui envoyer une clause que l'API refuserait.
 */
export const BUDGETS: Row[] = [
  { region: 'Occitanie', montant: 5000 },
  { region: 'Bretagne', montant: 4000 },
  { region: 'Normandie', montant: 3000 },
  { region: "Provence-Alpes-Côte d'Azur", montant: 2000 },
];

/** Les jeux du lot, sous le nom que le manifeste leur donne. */
export const JEUX_CONTEXTE = {
  etablissements: ETABLISSEMENTS,
  budgets: BUDGETS,
} as const;

/** URL du jeu servi en tableau nu (API générique). */
export function urlContexte(nom: keyof typeof JEUX_CONTEXTE): string {
  return `${HOTE_API_CONTEXTE}/${nom}`;
}

// ---------------------------------------------------------------------------
// Faux serveur Opendatasoft du lot
// ---------------------------------------------------------------------------

/**
 * Le faux serveur ODS du harnais de recette ne lit que les égalités et les
 * comparaisons (`tests/builder-e2e/api-fixtures.ts`). Ce lot a besoin des
 * trois autres formes que la lib émet DÈS QU'UN UTILISATEUR TOUCHE À QUELQUE
 * CHOSE : `in (…)` d'une sélection multiple, `like "%…%"` d'un `contains`, et
 * `search("…")` de la recherche serveur. Elles sont donc lues ici, dans le
 * fichier du lot, plutôt qu'ajoutées au harnais d'un autre.
 *
 * Comme lui, il REFUSE une clause qu'il n'a pas su lire : rendre le jeu
 * complet en silence transformerait un filtre perdu en contrôle vert.
 */

/** Retire les backquotes d'un identifiant ODSQL échappé. */
function denuder(identifiant: string): string {
  const nu = identifiant.trim();
  return nu.startsWith('`') && nu.endsWith('`') ? nu.slice(1, -1) : nu;
}

/** Déséchappe un littéral ODSQL (`\"` et `\\`). */
function litteral(brut: string): string {
  return brut.replace(/\\(["\\])/g, '$1');
}

/** Découpe une clause sur les ` AND ` de PREMIER NIVEAU, hors chaînes. */
function decouperAnd(where: string): string[] {
  const parts: string[] = [];
  let courant = '';
  let profondeur = 0;
  let dansChaine = false;
  for (let i = 0; i < where.length; i++) {
    const c = where[i];
    if (dansChaine) {
      if (c === '\\') {
        courant += c + (where[i + 1] ?? '');
        i++;
        continue;
      }
      if (c === '"') dansChaine = false;
      courant += c;
      continue;
    }
    if (c === '"') {
      dansChaine = true;
      courant += c;
      continue;
    }
    if (c === '(') profondeur++;
    if (c === ')') profondeur--;
    if (profondeur === 0 && /\s/.test(c) && /^AND\s/i.test(where.slice(i + 1))) {
      parts.push(courant);
      courant = '';
      i += 3;
      continue;
    }
    courant += c;
  }
  parts.push(courant);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Sans accents, sans casse — ce que fait une recherche plein texte. */
function replier(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase();
}

const IDENT = '(`[^`]+`|[\\w.]+)';
const SEARCH = /^search\(\s*"((?:[^"\\]|\\.)*)"\s*\)$/i;
const LIKE = new RegExp(`^${IDENT}\\s+like\\s+"%((?:[^"\\\\]|\\\\.)*)%"$`, 'i');
const DANS = new RegExp(`^${IDENT}\\s+in\\s*\\((.*)\\)$`, 'i');
const COMPARAISON = new RegExp(
  `^${IDENT}\\s*(=|!=|>=|<=|>|<)\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|([-\\d.]+))$`
);

function comparer(gauche: unknown, operateur: string, droite: string, numerique: boolean): boolean {
  if (numerique) {
    const a = Number(gauche);
    const b = Number(droite);
    switch (operateur) {
      case '=':
        return a === b;
      case '!=':
        return a !== b;
      case '>':
        return a > b;
      case '<':
        return a < b;
      case '>=':
        return a >= b;
      default:
        return a <= b;
    }
  }
  const a = String(gauche ?? '');
  switch (operateur) {
    case '=':
      return a === droite;
    case '!=':
      return a !== droite;
    case '>':
      return a > droite;
    case '<':
      return a < droite;
    case '>=':
      return a >= droite;
    default:
      return a <= droite;
  }
}

/** Applique une clause ODSQL au jeu, ou lève si elle n'est pas lisible. */
export function filtrerOdsqlContexte(lignes: Row[], where: string): Row[] {
  if (!where.trim()) return lignes;
  const clauses = decouperAnd(where);
  return lignes.filter((ligne) =>
    clauses.every((clause) => {
      const recherche = SEARCH.exec(clause);
      if (recherche) {
        const terme = replier(litteral(recherche[1]));
        return Object.values(ligne).some((v) => replier(v).includes(terme));
      }
      const sousChaine = LIKE.exec(clause);
      if (sousChaine) {
        const valeur = String(ligne[denuder(sousChaine[1])] ?? '').toLowerCase();
        return valeur.includes(litteral(sousChaine[2]).toLowerCase());
      }
      const dans = DANS.exec(clause);
      if (dans) {
        const attendues = dans[2]
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
          .map((v) => litteral(v.replace(/^"|"$/g, '')));
        return attendues.includes(String(ligne[denuder(dans[1])] ?? ''));
      }
      const comparaison = COMPARAISON.exec(clause);
      if (comparaison) {
        const [, champ, operateur, chaine, nombre] = comparaison;
        return comparer(
          ligne[denuder(champ)],
          operateur,
          chaine === undefined ? nombre : litteral(chaine),
          chaine === undefined
        );
      }
      throw new Error(`clause ODSQL non gérée par la fixture du lot : « ${clause} »`);
    })
  );
}

const PREFIXE_ODS_CONTEXTE = '/api/explore/v2.1/catalog/datasets/';

/** Métadonnées du jeu : c'est là qu'ODS déclare quelles colonnes sont des facettes. */
function metadonnees(dataset: string): Record<string, unknown> {
  return {
    dataset_id: dataset,
    fields: [
      { name: 'region', label: 'Région', type: 'text', annotations: { facet: true } },
      { name: 'categorie', label: 'Catégorie', type: 'text', annotations: { facet: true } },
      { name: 'departement', label: 'Département', type: 'text', annotations: { facet: true } },
      { name: 'population', label: 'Population', type: 'int' },
      { name: 'effectif', label: 'Effectif', type: 'int' },
      { name: 'libelle', label: 'Libellé', type: 'text' },
      { name: 'date', label: 'Date', type: 'text' },
    ],
  };
}

/**
 * Une URL, une réponse — ou `null` si l'URL n'est pas prévue, auquel cas
 * l'appelant la REFUSE plutôt que de la laisser sortir.
 */
export function repondreContexte(url: URL): unknown | null {
  if (url.origin === HOTE_API_CONTEXTE) {
    const nom = url.pathname.replace(/^\//, '') as keyof typeof JEUX_CONTEXTE;
    return JEUX_CONTEXTE[nom] ?? null;
  }
  if (url.origin !== HOTE_ODS_CONTEXTE) return null;
  if (!url.pathname.startsWith(PREFIXE_ODS_CONTEXTE)) return null;

  const apres = url.pathname.slice(PREFIXE_ODS_CONTEXTE.length);
  const separateur = apres.indexOf('/');
  const dataset = (
    separateur === -1 ? apres : apres.slice(0, separateur)
  ) as keyof typeof JEUX_CONTEXTE;
  const jeu = JEUX_CONTEXTE[dataset];
  if (!jeu) return null;
  const reste = separateur === -1 ? '' : apres.slice(separateur);
  const p = url.searchParams;
  if (reste === '') return metadonnees(dataset);

  const filtrees = filtrerOdsqlContexte(jeu as Row[], p.get('where') ?? '');

  if (reste === '/records') {
    const limite = Number(p.get('limit') ?? '100');
    const decalage = Number(p.get('offset') ?? '0');
    return { total_count: filtrees.length, results: filtrees.slice(decalage, decalage + limite) };
  }
  if (reste === '/exports/json') {
    const limite = Number(p.get('limit') ?? '0');
    return limite > 0 ? filtrees.slice(0, limite) : filtrees;
  }
  if (reste === '/facets') {
    return {
      facets: p.getAll('facet').map((champ) => {
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
  return null;
}

/**
 * Recalcul INDÉPENDANT : tableaux nus, aucune importation de `packages/`.
 * Écrit à part de la bibliothèque, exprès — le test-garde `tests/oracle/guard.test.ts`
 * refuse tout import vers `packages/`, `@dsfr-data/` ou l'alias `@/`, sur tout
 * le graphe atteignable depuis `tools/oracle` et `tests/verif-donnees`. Si la
 * lib et ce fichier se trompent, ce n'est pas de la même façon.
 */
import type { Agg, AggSpec, PivotAgg, Row, RowFilter, Step } from './manifest.js';
import { JEU_PRINCIPAL } from './manifest.js';
import { deriver } from './expression.js';

export type { Row } from './manifest.js';

/** Nombre lisible : nombre JS, ou chaîne numérique (point ou virgule décimale). */
export function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Absent ou vide — ce que `count(champ)` et `count(distinct champ)` excluent,
 * et ce qui ne peut pas servir de clé de jointure.
 */
export function absent(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/**
 * Égalité de l'oracle, énoncée en toutes lettres plutôt qu'empruntée à la lib :
 * deux valeurs vides sont égales ; une valeur vide n'est égale à RIEN d'autre
 * (c'est le piège `'' == 0` de #846) ; un TABLEAU est égal dès qu'un de ses
 * éléments l'est, et garde en plus son rendu texte (#953 — mesuré au portail :
 * `where=champ = "x"` trouve sur n'importe quel élément) ; sinon égalité
 * numérique si les deux côtés sont numériques, sinon égalité de chaînes.
 */
export function egal(a: unknown, b: unknown): boolean {
  const va = absent(a);
  const vb = absent(b);
  if (va || vb) return va && vb;
  if (Array.isArray(a) && a.some((el) => egal(el, b))) return true;
  const na = toNum(a);
  const nb = toNum(b);
  if (na !== null && nb !== null) return na === nb;
  return String(a) === String(b);
}

/**
 * Comparaison d'ordre, sur le contrat DOCUMENTÉ de la bibliothèque (JSDoc de
 * `where`, de `compute`, et de `compareForRange` dans `shared`) : numérique
 * quand les DEUX côtés le sont (décimales françaises comprises),
 * LEXICOGRAPHIQUE sinon — et une valeur absente ou vide ne matche jamais,
 * quel que soit l'opérateur.
 *
 * Le repli lexicographique sur une paire mixte range « NC » par le hasard de
 * sa première lettre, et c'est discutable ; mais c'est le comportement écrit,
 * donc celui que l'oracle doit tenir. L'oracle ne vérifie pas ce qu'on aurait
 * aimé, il vérifie ce qui est promis : le débat sur le comportement lui-même
 * se tranche dans la bibliothèque, pas ici (doctrine, README).
 */
function compare(a: unknown, b: unknown): number | null {
  if (absent(a) || absent(b)) return null;
  const na = toNum(a);
  const nb = toNum(b);
  if (na !== null && nb !== null) return na - nb;
  return String(a).localeCompare(String(b));
}

/**
 * Repliement d'un texte : sans accents, sans casse, sans blancs de bord.
 * Écrit ici plutôt qu'emprunté à la lib — c'est le point de l'oracle. La
 * décomposition NFD sépare la lettre de son diacritique, que la classe
 * unicode des marques combinantes retire ensuite.
 */
export function replier(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim();
}

/** Un filtre ligne à ligne. */
export function passeFiltre(row: Row, filter: RowFilter): boolean {
  const v = row[filter.field];
  switch (filter.op) {
    case 'isnotnull':
      return !absent(v);
    case 'isnull':
      return absent(v);
    // Absent SEULEMENT : une chaîne vide est une valeur renseignée, comme
    // pour le `where` de la bibliothèque.
    case 'isnull-strict':
      return v === null || v === undefined;
    case 'isnotnull-strict':
      return v !== null && v !== undefined;
    case 'in':
      // Une valeur vide n'appartient à rien, pas même à un ensemble qui
      // contiendrait une chaîne vide : c'est la règle d'`egal`.
      return filter.values.some((candidat) => egal(v, candidat));
    case 'notin':
      return !filter.values.some((candidat) => egal(v, candidat));
    case 'eq':
      return filter.fold ? replier(v) === replier(filter.value) : egal(v, filter.value);
    // L'égalité de la FORME TEXTE (PG-030) : `'1'` et `1` s'écrivent pareil,
    // `'01'` non ; un absent n'égale rien. Aucune lecture numérique.
    case 'eq-strict':
      return !absent(v) && String(v) === String(filter.value);
    // `neq` : la logique SQL à TROIS VALEURS du portail (#958). Une valeur
    // ABSENTE — `null` ou champ manquant — ne satisfait NI `eq` NI `neq`.
    // Mesuré le 2026-09-20 sur data.education.gouv.fr, `themes_attendus`
    // (176 lignes, 21 nulles) : `= "Elèves"` -> 124, `!= "Elèves"` -> 31,
    // soit 155 − 124, et non 176 − 124. La CHAÎNE VIDE reste une valeur pour
    // la bibliothèque : elle passe le `neq`, comme `''` passait déjà un `eq:`
    // vide — d'où le test strict et non `absent()`.
    // `notin` / `notcontains`, eux, gardent les absents : ODSQL n'a pas
    // d'infixe `not in` / `not like`, ils se délèguent en `NOT …`, qui les
    // garde (mesuré : 52).
    case 'neq':
      return v !== null && v !== undefined && !egal(v, filter.value);
    case 'contains':
      return filter.fold
        ? replier(v).includes(replier(filter.value))
        : String(v ?? '')
            .toLowerCase()
            .includes(String(filter.value).toLowerCase());
    case 'notcontains':
      // Complément exact de `contains`, repliement compris : une valeur
      // absente ne contient rien, donc elle passe.
      return filter.fold
        ? !replier(v).includes(replier(filter.value))
        : !String(v ?? '')
            .toLowerCase()
            .includes(String(filter.value).toLowerCase());
    default: {
      const c = compare(v, filter.value);
      if (c === null) return false;
      if (filter.op === 'gt') return c > 0;
      if (filter.op === 'gte') return c >= 0;
      if (filter.op === 'lt') return c < 0;
      return c <= 0;
    }
  }
}

export function applyFilter(rows: Row[], filters?: RowFilter | RowFilter[]): Row[] {
  if (!filters) return rows;
  const list = Array.isArray(filters) ? filters : [filters];
  if (list.length === 0) return rows;
  return rows.filter((r) => list.every((f) => passeFiltre(r, f)));
}

/** Nombre de valeurs distinctes non vides d'un champ (`count(distinct x)`). */
export function countDistinct(rows: Row[], field: string): number {
  const vues = new Set<string>();
  for (const r of rows) {
    const v = r[field];
    if (absent(v)) continue;
    vues.add(String(v));
  }
  return vues.size;
}

/**
 * Moyenne pondérée : somme(valeur × poids) / somme(poids), sur les seules
 * lignes où LES DEUX sont numériques. Poids total nul : `null`, jamais 0 —
 * une moyenne sans effectif n'est pas une moyenne de zéro.
 */
export function weightedAverage(rows: Row[], field: string, weight: string): number | null {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    const v = toNum(r[field]);
    const w = toNum(r[weight]);
    if (v === null || w === null) continue;
    num += v * w;
    den += w;
  }
  return den === 0 ? null : num / den;
}

/**
 * Taux d'évolution d'un champ : (dernière − première) / première, sur les
 * seules valeurs numériques renseignées, DANS L'ORDRE REÇU. Moins de deux
 * valeurs, ou première nulle : `null` — un taux sans point de départ n'est
 * pas un taux de zéro.
 */
export function evolution(rows: Row[], field: string): number | null {
  const nums = rows.map((r) => toNum(r[field])).filter((n): n is number => n !== null);
  if (nums.length < 2) return null;
  const premiere = nums[0];
  if (premiere === 0) return null;
  return (nums[nums.length - 1] - premiere) / premiere;
}

/**
 * Valeur BRUTE d'un champ sur la première ou la dernière ligne, dans l'ordre
 * reçu — sans conversion : une date ISO reste une chaîne.
 */
export function edgeValue(rows: Row[], field: string, bout: 'first' | 'last'): unknown {
  if (rows.length === 0) return null;
  return rows[bout === 'first' ? 0 : rows.length - 1][field];
}

/**
 * Agrégat rendu en TEXTE, pour les colonnes que la page n'affiche pas comme
 * des nombres (dates ISO) : `first` / `last` prennent le bout de la table
 * dans l'ordre reçu, `min` / `max` comparent en chaîne — l'ordre
 * lexicographique d'une date ISO est son ordre chronologique.
 */
export function aggregateText(rows: Row[], agg: Agg, field: string): string | null {
  if (agg === 'first' || agg === 'last') {
    const v = edgeValue(rows, field, agg);
    return absent(v) ? null : String(v);
  }
  const valeurs = rows
    .map((r) => r[field])
    .filter((v) => !absent(v))
    .map(String);
  if (valeurs.length === 0) return null;
  if (agg === 'min') return valeurs.reduce((a, b) => (b < a ? b : a));
  if (agg === 'max') return valeurs.reduce((a, b) => (b > a ? b : a));
  throw new Error(`${agg} ne rend pas un texte`);
}

/** Date ISO (AAAA-MM-JJ…) en JJ/MM/AAAA, la forme rendue par la lib (#667). */
export function isoToFrDate(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  return m === null ? null : `${m[3]}/${m[2]}/${m[1]}`;
}

export function aggregate(rows: Row[], agg: Agg, field?: string, weight?: string): number | null {
  if (agg === 'count') {
    // count sans champ : lignes ; avec champ : valeurs non vides.
    if (!field) return rows.length;
    return rows.filter((r) => !absent(r[field])).length;
  }
  if (!field) throw new Error(`${agg} exige un champ`);
  if (agg === 'distinct') return countDistinct(rows, field);
  if (agg === 'wavg') {
    if (!weight) throw new Error('wavg exige un champ de pondération');
    return weightedAverage(rows, field, weight);
  }
  if (agg === 'evolution') return evolution(rows, field);
  if (agg === 'first' || agg === 'last') return toNum(edgeValue(rows, field, agg));
  const nums = rows.map((r) => toNum(r[field])).filter((n): n is number => n !== null);
  if (nums.length === 0) return null;
  switch (agg) {
    case 'sum':
      return nums.reduce((a, b) => a + b, 0);
    case 'avg':
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'min':
      return Math.min(...nums);
    case 'max':
      return Math.max(...nums);
  }
}

function appliquer(rows: Row[], spec: AggSpec): number | null {
  return aggregate(applyFilter(rows, spec.filter), spec.agg, spec.field, spec.weight);
}

/**
 * Séparateur d'une clé composite : le caractère de contrôle « unit separator »,
 * qu'aucune donnée ne porte. CONSTRUIT et non écrit : un octet de contrôle posé
 * dans le source ferait classer ce fichier comme binaire par le suivi de
 * version — diff illisible et rebase insoluble.
 */
const SEPARATEUR_CLE = String.fromCharCode(31);

/**
 * Group-by en tableaux nus : une ligne par combinaison distincte de `by`.
 * Un champ à plusieurs valeurs fait une clé composite, dans l'ordre déclaré.
 */
export function groupBy(
  rows: Row[],
  by: string | string[],
  columns: Record<string, AggSpec>
): Row[] {
  const champs = Array.isArray(by) ? by : [by];
  const groupes = new Map<string, { cles: string[]; membres: Row[] }>();
  for (const r of rows) {
    const cles = champs.map((f) => (r[f] === null || r[f] === undefined ? '' : String(r[f])));
    const key = cles.join(SEPARATEUR_CLE);
    const seau = groupes.get(key);
    if (seau) seau.membres.push(r);
    else groupes.set(key, { cles, membres: [r] });
  }
  return [...groupes.values()].map(({ cles, membres }) => {
    const row: Row = {};
    champs.forEach((f, i) => (row[f] = cles[i]));
    for (const [nom, spec] of Object.entries(columns)) row[nom] = appliquer(membres, spec);
    return row;
  });
}

/** Agrégat global : une seule ligne, mêmes noms de colonnes qu'un group-by. */
export function globalAggregate(rows: Row[], columns: Record<string, AggSpec>): Row[] {
  const row: Row = {};
  for (const [nom, spec] of Object.entries(columns)) row[nom] = appliquer(rows, spec);
  return [row];
}

/** Tri stable sur une colonne, nombres d'abord puis chaînes ; vides en queue. */
export function orderBy(rows: Row[], column: string, dir: 'asc' | 'desc'): Row[] {
  return orderByKeys(rows, [{ column, dir }]);
}

/**
 * Tri stable à plusieurs clés : la première départage, la suivante ne
 * tranche que les ex æquo. Même comparaison qu'à une clé — vides en queue.
 *
 * Réserve : la bibliothèque TRIE sur un ordre total à trois rangs (vide <
 * nombre < chaîne), qui n'est pas celui de ses comparaisons de filtre. Un tri
 * sur une colonne mêlant nombres et non-nombres n'est donc pas comparable
 * d'un côté à l'autre, et aucun contrôle ne doit s'y appuyer.
 */
export function orderByKeys(
  rows: Row[],
  keys: Array<{ column: string; dir: 'asc' | 'desc' }>
): Row[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      for (const { column, dir } of keys) {
        const c = compare(a.row[column], b.row[column]);
        if (c === null || c === 0) {
          const va = absent(a.row[column]);
          const vb = absent(b.row[column]);
          if (va !== vb) return va ? 1 : -1;
          continue;
        }
        return (dir === 'desc' ? -1 : 1) * c;
      }
      return a.i - b.i;
    })
    .map((e) => e.row);
}

/**
 * Cumul (`running_sum`) : chaque ligne porte la somme des précédentes, dans
 * l'ordre reçu. Une valeur non numérique n'ajoute rien au cumul.
 */
export function runningSum(rows: Row[], from: string, as: string): Row[] {
  let total = 0;
  return rows.map((r) => {
    const v = toNum(r[from]);
    if (v !== null) total += v;
    return { ...r, [as]: total };
  });
}

/**
 * Écart à la ligne précédente (`diff`), inverse du cumul. La PREMIÈRE ligne
 * vaut `null`, jamais 0 — un incrément inconnu n'est pas un incrément nul ;
 * une valeur non numérique donne `null` pour elle ET pour la suivante.
 */
export function diff(rows: Row[], from: string, as: string): Row[] {
  let precedent: number | null = null;
  return rows.map((r, i) => {
    const v = toNum(r[from]);
    const ecart = i === 0 || v === null || precedent === null ? null : v - precedent;
    precedent = v;
    return { ...r, [as]: ecart };
  });
}

/**
 * Part du total (`share`, #926) : valeur de la ligne divisée par la somme de
 * la colonne sur toutes les lignes reçues. `scale` vaut 100 pour une part en
 * points de pourcentage. Total nul, ou valeur non numérique : `null`.
 */
export function shareColumn(rows: Row[], from: string, as: string, scale = 1): Row[] {
  const valeurs = rows.map((r) => toNum(r[from]));
  const total = valeurs.reduce<number>((acc, v) => acc + (v ?? 0), 0);
  return rows.map((r, i) => {
    const v = valeurs[i];
    return { ...r, [as]: v === null || total === 0 ? null : (v / total) * scale };
  });
}

/**
 * Quotient de deux colonnes, ligne à ligne — la FRACTION qu'un ratio de KPI
 * affiche (#673). Dénominateur nul, absent ou non numérique : `null`, jamais
 * l'infini ni un zéro de complaisance.
 */
export function ratioColumn(
  rows: Row[],
  numerator: string,
  denominator: string,
  as: string
): Row[] {
  return rows.map((r) => {
    const num = toNum(r[numerator]);
    const den = toNum(r[denominator]);
    return { ...r, [as]: num === null || den === null || den === 0 ? null : num / den };
  });
}

/** Clé de jointure : absente ou vide = pas de clé (une ligne sans clé n'apparie rien). */
export function joinKey(row: Row, field: string | string[]): string | null {
  const champs = Array.isArray(field) ? field : [field];
  const segments: string[] = [];
  for (const f of champs) {
    const v = row[f];
    if (absent(v)) return null;
    segments.push(String(v));
  }
  return segments.join('|');
}

/** Type de jointure, dans la grammaire de `dsfr-data-join`. */
export type TypeJointure = 'inner' | 'left' | 'right' | 'full';

/**
 * Découpe un `on` en paires de champs : `"code"`, `"code=code_insee"`, ou
 * une clé composite `"annee, code=code_insee"`.
 */
export function joinFields(on: string): Array<{ gauche: string; droite: string }> {
  return on.split(',').map((part) => {
    const [gauche, droite = gauche] = part.split('=').map((s) => s.trim());
    return { gauche, droite };
  });
}

/**
 * Jointure par clé, en tableaux nus. `on` s'écrit `"code"`,
 * `"code=code_insee"` ou, pour une clé composite, `"annee, code"`. Les clés
 * sont comparées EN CHAÎNE, sans trim ni complétion (`201` et `"201"`
 * s'apparient, `"0201"` et `"201"` non), et une clé vide n'apparie rien — pas
 * même une autre clé vide.
 *
 * Les quatre types : `inner` (les seules paires), `left` (toute ligne gauche),
 * `right` (toute ligne droite, dans l'ordre de la droite), `full` (les lignes
 * gauche puis les lignes droite restées seules). Une colonne non-clé portée
 * des DEUX côtés est préfixée côté droit.
 */
export function joinRows(
  left: Row[],
  right: Row[],
  on: string,
  type: TypeJointure = 'left',
  prefixRight = 'right_'
): Row[] {
  const paires = joinFields(on);
  const champsGauche = paires.map((p) => p.gauche);
  const champsDroite = paires.map((p) => p.droite);
  const champsCles = new Set([...champsGauche, ...champsDroite]);

  // Collisions relevées une fois, sur la première ligne de chaque côté —
  // le schéma d'un jeu ne change pas d'une ligne à l'autre.
  const collisions = new Set<string>();
  if (left.length > 0 && right.length > 0) {
    for (const nom of Object.keys(right[0])) {
      if (nom in left[0] && !champsCles.has(nom)) collisions.add(nom);
    }
  }

  const fusionner = (l: Row | null, r: Row | null): Row => {
    const out: Row = {};
    if (l) for (const [nom, valeur] of Object.entries(l)) out[nom] = valeur;
    if (r) {
      for (const [nom, valeur] of Object.entries(r)) {
        const paire = paires.find((p) => p.droite === nom);
        if (paire) {
          // La clé n'est jamais dupliquée : elle prend le nom du champ gauche,
          // et n'est portée par la droite que si la gauche manque.
          if (!l) out[paire.gauche] = valeur;
          continue;
        }
        out[collisions.has(nom) ? `${prefixRight}${nom}` : nom] = valeur;
      }
    }
    return out;
  };

  const indexer = (rows: Row[], champs: string[]): Map<string, Row[]> => {
    const index = new Map<string, Row[]>();
    for (const r of rows) {
      const k = joinKey(r, champs);
      if (k === null) continue;
      const seau = index.get(k);
      if (seau) seau.push(r);
      else index.set(k, [r]);
    }
    return index;
  };

  const indexDroite = indexer(right, champsDroite);
  const out: Row[] = [];

  if (type === 'right') {
    const indexGauche = indexer(left, champsGauche);
    for (const r of right) {
      const k = joinKey(r, champsDroite);
      const apparies = k === null ? undefined : indexGauche.get(k);
      if (!apparies) {
        out.push(fusionner(null, r));
        continue;
      }
      for (const l of apparies) out.push(fusionner(l, r));
    }
    return out;
  }

  const clesDroiteApparees = new Set<string>();
  for (const l of left) {
    const k = joinKey(l, champsGauche);
    const apparies = k === null ? undefined : indexDroite.get(k);
    if (!apparies) {
      if (type === 'left' || type === 'full') out.push(fusionner(l, null));
      continue;
    }
    clesDroiteApparees.add(k as string);
    for (const r of apparies) out.push(fusionner(l, r));
  }
  if (type === 'full') {
    for (const r of right) {
      const k = joinKey(r, champsDroite);
      if (k === null || !clesDroiteApparees.has(k)) out.push(fusionner(null, r));
    }
  }
  return out;
}

/** Une valeur qui ne peut pas devenir une colonne de pivot. */
function celluleVide(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * Réduction d'une cellule de pivot. Une cellule sans valeur exploitable rend
 * `null`, jamais 0. `min` / `max` rangent des dates ISO dans l'ordre
 * lexicographique quand aucune valeur n'est numérique.
 */
function reduireCellule(valeurs: unknown[], agg: PivotAgg): unknown {
  if (valeurs.length === 0) return null;
  if (agg === 'count') return valeurs.filter((v) => !celluleVide(v)).length;
  if (agg === 'first') return valeurs[0] ?? null;
  if (agg === 'last') return valeurs[valeurs.length - 1] ?? null;
  const nombres = valeurs.map(toNum).filter((n): n is number => n !== null);
  if (agg === 'sum') return nombres.length > 0 ? nombres.reduce((a, b) => a + b, 0) : null;
  if (agg === 'avg') {
    return nombres.length > 0 ? nombres.reduce((a, b) => a + b, 0) / nombres.length : null;
  }
  if (nombres.length > 0) return agg === 'min' ? Math.min(...nombres) : Math.max(...nombres);
  const textes = valeurs.filter((v) => !celluleVide(v)).map((v) => String(v));
  if (textes.length === 0) return null;
  return textes.reduce((acc, s) => (agg === 'min' ? (s < acc ? s : acc) : s > acc ? s : acc));
}

export interface OptionsPivot {
  row: string | string[];
  column: string;
  value: string;
  aggregate?: PivotAgg;
  columnFormat?: string;
  columnOrder?: 'asc' | 'desc';
}

/**
 * Repli long → large : une ligne par identité, une colonne par valeur
 * distincte du champ pivoté, toutes les colonnes portées par toutes les
 * lignes. Une ligne dont le champ pivoté est vide est écartée.
 */
export function pivotRows(rows: Row[], options: OptionsPivot): Row[] {
  const champsLigne = Array.isArray(options.row) ? options.row : [options.row];
  const agg = options.aggregate ?? 'sum';
  const gabarit = options.columnFormat || '{value}';

  const brutes: string[] = [];
  const groupes = new Map<string, { porte: Row; cellules: Map<string, unknown[]> }>();
  for (const r of rows) {
    const brut = r[options.column];
    if (celluleVide(brut)) continue;
    const col = String(brut);
    if (!brutes.includes(col)) brutes.push(col);
    const cle = JSON.stringify(champsLigne.map((f) => r[f] ?? null));
    let groupe = groupes.get(cle);
    if (!groupe) {
      const porte: Row = {};
      for (const f of champsLigne) porte[f] = r[f] ?? null;
      groupe = { porte, cellules: new Map() };
      groupes.set(cle, groupe);
    }
    const cellule = groupe.cellules.get(col);
    if (cellule) cellule.push(r[options.value]);
    else groupe.cellules.set(col, [r[options.value]]);
  }

  let ordonnees = brutes;
  if (options.columnOrder) {
    const toutNumerique = brutes.every((v) => toNum(v) !== null);
    ordonnees = [...brutes].sort((a, b) =>
      toutNumerique ? (toNum(a) as number) - (toNum(b) as number) : a.localeCompare(b, 'fr')
    );
    if (options.columnOrder === 'desc') ordonnees.reverse();
  }
  const nomDe = new Map<string, string>();
  for (const brut of ordonnees) {
    const nom = gabarit.split('{value}').join(brut);
    // Une collision de noms est une ERREUR de configuration, pas un tableau
    // plausible : la bibliothèque refuse d'émettre, l'oracle refuse de
    // recalculer — sinon il produirait un attendu que rien ne peut afficher.
    if (champsLigne.includes(nom)) {
      throw new Error(`pivot : la colonne générée « ${nom} » porte le nom d'un champ de « row »`);
    }
    if ([...nomDe.values()].includes(nom)) {
      throw new Error(
        `pivot : deux valeurs de « ${options.column} » produisent la colonne « ${nom} »`
      );
    }
    nomDe.set(brut, nom);
  }

  return [...groupes.values()].map(({ porte, cellules }) => {
    const ligne: Row = { ...porte };
    for (const brut of ordonnees) {
      const valeurs = cellules.get(brut);
      ligne[nomDe.get(brut) as string] = valeurs ? reduireCellule(valeurs, agg) : null;
    }
    return ligne;
  });
}

export interface OptionsUnpivot {
  idCols: string[];
  valueCols: Array<{ column: string; as?: string }>;
  varName?: string;
  valueName?: string;
  dropEmpty?: boolean;
}

/**
 * Dépliage large → long : une ligne par (ligne d'entrée × colonne dépliée).
 * La valeur est laissée BRUTE — le typage est l'affaire de la normalisation.
 */
export function unpivotRows(rows: Row[], options: OptionsUnpivot): Row[] {
  const varName = options.varName || 'variable';
  const valueName = options.valueName || 'value';
  const out: Row[] = [];
  for (const r of rows) {
    const porte: Row = {};
    for (const f of options.idCols) porte[f] = r[f];
    for (const { column, as } of options.valueCols) {
      const cellule = r[column];
      if (options.dropEmpty && celluleVide(cellule)) continue;
      out.push({ ...porte, [varName]: as ?? column, [valueName]: cellule });
    }
  }
  return out;
}

/**
 * Éclate un champ MULTIVALUÉ : une ligne par valeur du tableau, le champ
 * portant cette valeur. Une ligne dont le champ n'est pas un tableau, ou un
 * tableau vide, n'en produit aucune — c'est ce qu'une facette fait d'un
 * champ tableau (BUG-006), et ce qu'un regroupement client ne fait PAS (il
 * compte les combinaisons).
 */
export function explodeRows(rows: Row[], field: string): Row[] {
  const out: Row[] = [];
  for (const r of rows) {
    const v = r[field];
    if (!Array.isArray(v)) continue;
    for (const valeur of v) out.push({ ...r, [field]: valeur });
  }
  return out;
}

/** Colonnes d'un jeu, toutes lignes confondues. */
function schemaDe(rows: Row[]): Set<string> {
  const cles = new Set<string>();
  for (const r of rows) for (const c of Object.keys(r)) cles.add(c);
  return cles;
}

/**
 * Un empilement de schémas DIVERGENTS n'émet rien du tout côté bibliothèque :
 * c'est une erreur de configuration nommée, jamais une colonne vide muette.
 * L'oracle lève donc lui aussi, plutôt que de rendre un attendu plausible que
 * la page ne montrera jamais. Même règle pour une colonne de provenance qui
 * écraserait une colonne des données.
 */
function verifierSchemas(
  datasets: Record<string, Row[]>,
  sources: string[],
  originField?: string
): void {
  const jeux = sources.map((nom) => datasets[nom] ?? []);
  const reference = jeux.findIndex((rows) => rows.length > 0);
  if (reference === -1) return;
  const attendu = schemaDe(jeux[reference]);
  jeux.forEach((rows, i) => {
    if (i === reference || rows.length === 0) return;
    const schema = schemaDe(rows);
    const manquantes = [...attendu].filter((c) => !schema.has(c));
    const surnumeraires = [...schema].filter((c) => !attendu.has(c));
    if (manquantes.length === 0 && surnumeraires.length === 0) return;
    throw new Error(
      `empilement : schémas divergents entre « ${sources[reference]} » et « ${sources[i]} » ` +
        `(manquantes : ${manquantes.join(', ') || 'aucune'} ; ` +
        `en trop : ${surnumeraires.join(', ') || 'aucune'})`
    );
  });
  if (originField && jeux.some((rows) => rows.some((r) => originField in r))) {
    throw new Error(
      `empilement : la colonne de provenance « ${originField} » écraserait une colonne des données`
    );
  }
}

/** Empilement de plusieurs jeux, dans l'ordre, chaque ligne pouvant dire d'où elle vient. */
export function concatRows(
  datasets: Record<string, Row[]>,
  sources: string[],
  originField?: string,
  originLabels: Record<string, string> = {}
): Row[] {
  verifierSchemas(datasets, sources, originField);
  const out: Row[] = [];
  for (const nom of sources) {
    const jeu = datasets[nom];
    if (!jeu) throw new Error(`empilement : jeu « ${nom} » absent du feed`);
    for (const r of jeu) {
      out.push(originField ? { ...r, [originField]: originLabels[nom] ?? nom } : { ...r });
    }
  }
  return out;
}

/**
 * Bornes d'une discrétisation à intervalles égaux : l'étendue [min, max] est
 * découpée en `steps` classes de même largeur, `steps - 1` bornes supérieures.
 */
export function equalIntervalBreaks(values: number[], steps: number): number[] {
  if (values.length === 0 || steps < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const largeur = (max - min) / steps;
  const bornes: number[] = [];
  for (let i = 1; i < steps; i++) bornes.push(min + largeur * i);
  return bornes;
}

/**
 * Bornes d'une discrétisation par QUANTILES : chaque classe couvre le même
 * nombre de valeurs. Sur la suite triée de `n` valeurs, la borne supérieure de
 * la classe `i` est la valeur d'indice `⌊i·n / steps⌋` (bornée au dernier
 * rang) — `steps - 1` bornes, comme les intervalles égaux.
 */
export function quantileBreaks(values: number[], steps: number): number[] {
  if (values.length === 0 || steps < 2) return [];
  const triees = [...values].sort((a, b) => a - b);
  const bornes: number[] = [];
  for (let i = 1; i < steps; i++) {
    const rang = Math.floor((i / steps) * triees.length);
    bornes.push(triees[Math.min(rang, triees.length - 1)]);
  }
  return bornes;
}

/** Discrétisation d'une choroplèthe, selon la méthode déclarée par la page. */
export type MethodeClasses = 'equal' | 'quantile' | 'manual';

export function discretiser(
  values: number[],
  steps: number,
  method: MethodeClasses = 'equal',
  manuelles?: number[]
): number[] {
  if (method === 'manual') {
    const bornes = (manuelles ?? []).filter((n) => Number.isFinite(n));
    return [...new Set(bornes)].sort((a, b) => a - b);
  }
  return method === 'quantile' ? quantileBreaks(values, steps) : equalIntervalBreaks(values, steps);
}

/** Classes attendues d'une choroplèthe : bornes chiffrées, extrémités comprises. */
export function legendClasses(
  values: number[],
  steps: number,
  method: MethodeClasses = 'equal',
  manuelles?: number[]
): Array<{ from: number | null; to: number | null }> {
  const bornes = discretiser(values, steps, method, manuelles);
  if (bornes.length === 0 || values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const classes: Array<{ from: number | null; to: number | null }> = [];
  const n = bornes.length + 1;
  for (let i = 0; i < n; i++) {
    const from = i === 0 ? min : bornes[i - 1];
    const to = i === n - 1 ? max : bornes[i];
    if (i > 0 && from >= to) continue;
    classes.push({ from, to });
  }
  return classes;
}

/** Déroule une suite d'étapes sur un jeu de départ. */
export function runPipeline(
  datasets: Record<string, Row[]>,
  steps: Step[],
  from: string = JEU_PRINCIPAL
): Row[] {
  let rows = datasets[from] ?? [];
  for (const step of steps) {
    switch (step.op) {
      case 'filter':
        rows = applyFilter(rows, step.filters);
        break;
      case 'group-by':
        rows = groupBy(rows, step.by, step.columns);
        break;
      case 'global':
        rows = globalAggregate(rows, step.columns);
        break;
      case 'order-by':
        rows = orderBy(rows, step.column, step.dir);
        break;
      case 'order-by-keys':
        rows = orderByKeys(rows, step.keys);
        break;
      case 'derive':
        rows = deriver(rows, step.expr);
        break;
      case 'explode':
        rows = explodeRows(rows, step.field);
        break;
      case 'pivot':
        rows = pivotRows(rows, step);
        break;
      case 'unpivot':
        rows = unpivotRows(rows, step);
        break;
      case 'concat':
        rows = concatRows(datasets, step.sources, step.originField, step.originLabels);
        break;
      case 'limit':
        rows = rows.slice(0, step.n);
        break;
      case 'page':
        rows = rows.slice((step.number - 1) * step.size, step.number * step.size);
        break;
      case 'running':
        rows =
          step.kind === 'running_sum'
            ? runningSum(rows, step.from, step.as)
            : diff(rows, step.from, step.as);
        break;
      case 'share':
        rows = shareColumn(rows, step.from, step.as, step.scale ?? 1);
        break;
      case 'ratio':
        rows = ratioColumn(rows, step.numerator, step.denominator, step.as);
        break;
      case 'join': {
        const droite = datasets[step.right];
        if (!droite) throw new Error(`jointure : jeu « ${step.right} » absent du feed`);
        rows = joinRows(rows, droite, step.on, step.type, step.prefixRight);
        break;
      }
    }
  }
  return rows;
}

/** Arrondi à `decimals` décimales, comme l'affichage du KPI. */
export function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Lecture d'un nombre affiché en fr-FR par la lib : espaces (fines ou
 * insécables) de milliers, virgule décimale, unité ou symbole en suffixe.
 */
export function parseDisplayedNumber(text: string): number | null {
  const cleaned = text
    .replace(/[\u202f\u00a0\s]/g, '')
    .replace(/[^0-9,.\-\u2212]/g, '')
    .replace('\u2212', '-')
    .replace(',', '.');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Relit un CSV en tableau de cellules : BOM retiré, guillemets RFC 4180
 * (doublés à l'intérieur), séparateur `;` par défaut. Écrit ici plutôt
 * qu'emprunté au constructeur de la lib — c'est tout l'intérêt de le relire.
 */
export function parseCsv(text: string, separator = ';'): string[][] {
  const sansBom = text.replace(/^\uFEFF/, '');
  const lignes: string[][] = [];
  let cellule = '';
  let ligne: string[] = [];
  let dansGuillemets = false;
  for (let i = 0; i < sansBom.length; i++) {
    const c = sansBom[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (sansBom[i + 1] === '"') {
          cellule += '"';
          i++;
        } else dansGuillemets = false;
      } else cellule += c;
      continue;
    }
    if (c === '"') dansGuillemets = true;
    else if (c === separator) {
      ligne.push(cellule);
      cellule = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && sansBom[i + 1] === '\n') i++;
      ligne.push(cellule);
      lignes.push(ligne);
      cellule = '';
      ligne = [];
    } else cellule += c;
  }
  if (cellule !== '' || ligne.length > 0) {
    ligne.push(cellule);
    lignes.push(ligne);
  }
  return lignes;
}

/**
 * Couleur ramenée à `r,g,b` : le navigateur rend `rgb(0, 0, 145)` là où la
 * page déclare `#000091`. Rien d'autre n'est reconnu (une couleur nommée rend
 * `null` : mieux vaut ne pas comparer que comparer à tort).
 */
export function toRgb(color: string): string | null {
  const t = color.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(t);
  if (hex) {
    const h =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((c) => c + c)
            .join('')
        : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(t);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter((s) => s !== '');
    if (parts.length < 3) return null;
    return parts
      .slice(0, 3)
      .map((p) => String(Math.round(Number(p))))
      .join(',');
  }
  return null;
}

/** Égalité à la précision affichée (± un demi-pas de la dernière décimale), sinon exacte. */
export function closeEnough(observed: number, expected: number, decimals = 0): boolean {
  const tol = decimals > 0 ? 0.5 / 10 ** decimals + 1e-9 : 0.5;
  return Math.abs(observed - expected) <= tol;
}

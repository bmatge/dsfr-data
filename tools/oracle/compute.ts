/**
 * Recalcul INDÉPENDANT : tableaux nus, aucune importation de `packages/`.
 * Écrit à part de la bibliothèque, exprès — le test-garde `tests/oracle/guard.test.ts`
 * refuse tout import vers `packages/`, `@dsfr-data/` ou l'alias `@/`, sur tout
 * le graphe atteignable depuis `tools/oracle` et `tests/verif-donnees`. Si la
 * lib et ce fichier se trompent, ce n'est pas de la même façon.
 */
import type { Agg, AggSpec, Row, RowFilter, Step } from './manifest.js';
import { JEU_PRINCIPAL } from './manifest.js';

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
 * (c'est le piège `'' == 0` de #846) ; sinon égalité numérique si les deux
 * côtés sont numériques, sinon égalité de chaînes.
 */
export function egal(a: unknown, b: unknown): boolean {
  const va = absent(a);
  const vb = absent(b);
  if (va || vb) return va && vb;
  const na = toNum(a);
  const nb = toNum(b);
  if (na !== null && nb !== null) return na === nb;
  return String(a) === String(b);
}

/**
 * Comparaison d'ordre : numérique si les DEUX côtés le sont, lexicale si aucun
 * ne l'est (dates ISO), et INCOMPARABLE si un seul l'est — « NC » n'est ni
 * au-dessus ni au-dessous de 100. Le repli lexicographique sur une paire mixte
 * range les non-nombres par le hasard de leur première lettre.
 */
function compare(a: unknown, b: unknown): number | null {
  if (absent(a) || absent(b)) return null;
  const na = toNum(a);
  const nb = toNum(b);
  if (na !== null && nb !== null) return na - nb;
  if (na !== null || nb !== null) return null;
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
    case 'in':
      // Une valeur vide n'appartient à rien, pas même à un ensemble qui
      // contiendrait une chaîne vide : c'est la règle d'`egal`.
      return filter.values.some((candidat) => egal(v, candidat));
    case 'eq':
      return filter.fold ? replier(v) === replier(filter.value) : egal(v, filter.value);
    case 'neq':
      return !egal(v, filter.value);
    case 'contains':
      return filter.fold
        ? replier(v).includes(replier(filter.value))
        : String(v ?? '')
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
  return aggregate(rows, spec.agg, spec.field, spec.weight);
}

/** Group-by en tableaux nus : une ligne par valeur distincte de `by`. */
export function groupBy(rows: Row[], by: string, columns: Record<string, AggSpec>): Row[] {
  const groupes = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r[by] === null || r[by] === undefined ? '' : String(r[by]);
    const seau = groupes.get(key);
    if (seau) seau.push(r);
    else groupes.set(key, [r]);
  }
  return [...groupes.entries()].map(([key, membres]) => {
    const row: Row = { [by]: key };
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
  const signe = dir === 'desc' ? -1 : 1;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const c = compare(a.row[column], b.row[column]);
      if (c === null || c === 0) {
        const va = absent(a.row[column]);
        const vb = absent(b.row[column]);
        if (va !== vb) return va ? 1 : -1;
        return a.i - b.i;
      }
      return signe * c;
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

/** Clé de jointure : absente ou vide = pas de clé (une ligne sans clé n'apparie rien). */
export function joinKey(row: Row, field: string): string | null {
  const v = row[field];
  if (absent(v)) return null;
  return String(v);
}

/**
 * Jointure simple par clé, en tableaux nus. `on` s'écrit `"code"` ou
 * `"code=code_insee"`. Les clés sont comparées EN CHAÎNE, sans trim ni
 * complétion (`201` et `"201"` s'apparient, `"0201"` et `"201"` non), et une
 * clé vide n'apparie rien — pas même une autre clé vide.
 */
export function joinRows(
  left: Row[],
  right: Row[],
  on: string,
  type: 'inner' | 'left' = 'left',
  prefixRight = 'right_'
): Row[] {
  const [champGauche, champDroite = champGauche] = on.split('=').map((s) => s.trim());
  const index = new Map<string, Row[]>();
  for (const r of right) {
    const k = joinKey(r, champDroite);
    if (k === null) continue;
    const seau = index.get(k);
    if (seau) seau.push(r);
    else index.set(k, [r]);
  }
  const out: Row[] = [];
  for (const l of left) {
    const k = joinKey(l, champGauche);
    const apparies = k === null ? undefined : index.get(k);
    if (!apparies || apparies.length === 0) {
      if (type === 'left') out.push({ ...l });
      continue;
    }
    for (const r of apparies) {
      const fusion: Row = { ...l };
      for (const [nom, valeur] of Object.entries(r)) {
        if (nom === champDroite) continue;
        fusion[nom in l ? `${prefixRight}${nom}` : nom] = valeur;
      }
      out.push(fusion);
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

/** Classes attendues d'une choroplèthe : bornes chiffrées, extrémités comprises. */
export function legendClasses(
  values: number[],
  steps: number
): Array<{ from: number | null; to: number | null }> {
  const bornes = equalIntervalBreaks(values, steps);
  if (bornes.length === 0) return [];
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
      case 'limit':
        rows = rows.slice(0, step.n);
        break;
      case 'running':
        rows =
          step.kind === 'running_sum'
            ? runningSum(rows, step.from, step.as)
            : diff(rows, step.from, step.as);
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

/** Égalité à la précision affichée (± un demi-pas de la dernière décimale), sinon exacte. */
export function closeEnough(observed: number, expected: number, decimals = 0): boolean {
  const tol = decimals > 0 ? 0.5 / 10 ** decimals + 1e-9 : 0.5;
  return Math.abs(observed - expected) <= tol;
}

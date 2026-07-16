/**
 * Outils d'introspection de données pour la boucle agentique.
 *
 * Donnent a l'IA des "yeux" sur state.localData : au lieu de deviner les noms de
 * champs et les valeurs a partir d'un unique enregistrement-exemple, le modele
 * peut inspecter la donnee reelle (valeurs distinctes, min/max, nb de lignes qui
 * matchent un filtre) AVANT de generer une action, puis verifier son resultat via
 * un diagnostic. C'est l'analogue, cote donnees, des outils read/grep de Claude
 * Code : observer l'etat reel plutot qu'halluciner.
 *
 * Tout est PUR (data en parametre, aucun acces au DOM ni au state global) → 100 %
 * testable et reutilisable. `applyWhereFilter` est la source unique de verite du
 * filtre "champ:op:valeur" (chart-renderer l'importe aussi).
 */

import { toNumber, looksLikeNumber } from '@dsfr-data/shared';
import type { ChartConfig, Field, AggregatedResult } from '../state.js';

export type Row = Record<string, unknown>;
export type Aggregation = 'sum' | 'avg' | 'count' | 'min' | 'max';

/** Réduit une liste de valeurs numeriques selon la fonction d'agrégation. */
function reduceValues(values: number[], agg: Aggregation, count: number): number {
  switch (agg) {
    case 'count':
      return count;
    case 'min':
      return values.length ? Math.min(...values) : 0;
    case 'max':
      return values.length ? Math.max(...values) : 0;
    case 'avg':
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    case 'sum':
    default:
      return values.reduce((a, b) => a + b, 0);
  }
}

/**
 * Agrège `valueField` par `labelField` (ordre de premiere apparition preserve).
 * Si labelField est absent, agrège tout en une seule entree.
 */
export function aggregateBy(
  data: Row[],
  labelField: string | undefined,
  valueField: string,
  agg: Aggregation = 'sum'
): AggregatedResult[] {
  const order: string[] = [];
  const groups = new Map<string, number[]>();
  const counts = new Map<string, number>();
  for (const row of data) {
    const label = labelField ? String(row[labelField] ?? 'N/A') : 'Total';
    if (!groups.has(label)) {
      groups.set(label, []);
      counts.set(label, 0);
      order.push(label);
    }
    groups.get(label)!.push(toNumber(row[valueField]));
    counts.set(label, counts.get(label)! + 1);
  }
  return order.map((label) => ({
    label,
    value: reduceValues(groups.get(label)!, agg, counts.get(label)!),
  }));
}

/**
 * Construit un jeu multi-séries aligne sur un meme axe d'etiquettes (LARGE).
 * `fields` = [valueField, ...valueFields]. Les labels suivent l'ordre de la
 * premiere série ; les valeurs manquantes valent 0.
 */
export function buildMultiSeries(
  data: Row[],
  labelField: string | undefined,
  fields: string[],
  agg: Aggregation = 'sum'
): { labels: string[]; series: { field: string; values: number[] }[] } {
  const perField = fields.map((field) => ({
    field,
    map: new Map(aggregateBy(data, labelField, field, agg).map((r) => [r.label, r.value])),
  }));
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const { label } of aggregateBy(data, labelField, fields[0], agg)) {
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return {
    labels,
    series: perField.map(({ field, map }) => ({
      field,
      values: labels.map((l) => map.get(l) ?? 0),
    })),
  };
}

/**
 * Filtre des données avec la syntaxe dsfr-data-query "champ:op:valeur".
 * Plusieurs filtres separes par virgule (logique AND).
 * Operateurs : eq, neq, gt, gte, lt, lte, contains, notcontains, in, notin,
 * isnull, isnotnull. (`in`/`notin` : valeurs separees par `|`.)
 */
export function applyWhereFilter(data: Row[], where: string): Row[] {
  const parts = where
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  return data.filter((record) => {
    return parts.every((part) => {
      const segments = part.split(':');
      if (segments.length < 2) return true;
      const field = segments[0];
      const op = segments[1];
      const rawValue = segments.slice(2).join(':');
      const itemValue = record[field];

      switch (op) {
        case 'eq':
          return String(itemValue) === rawValue || Number(itemValue) === Number(rawValue);
        case 'neq':
          return String(itemValue) !== rawValue && Number(itemValue) !== Number(rawValue);
        case 'gt':
          return Number(itemValue) > Number(rawValue);
        case 'gte':
          return Number(itemValue) >= Number(rawValue);
        case 'lt':
          return Number(itemValue) < Number(rawValue);
        case 'lte':
          return Number(itemValue) <= Number(rawValue);
        case 'contains':
          return String(itemValue).toLowerCase().includes(rawValue.toLowerCase());
        case 'notcontains':
          return !String(itemValue).toLowerCase().includes(rawValue.toLowerCase());
        case 'in':
          return rawValue
            .split('|')
            .some((v) => String(itemValue) === v || Number(itemValue) === Number(v));
        case 'notin':
          return !rawValue
            .split('|')
            .some((v) => String(itemValue) === v || Number(itemValue) === Number(v));
        case 'isnull':
          return itemValue === null || itemValue === undefined;
        case 'isnotnull':
          return itemValue !== null && itemValue !== undefined;
        default:
          return true;
      }
    });
  });
}

/** Liste des cles (noms de champs) presentes dans les données. */
function dataKeys(data: Row[]): string[] {
  return data.length > 0 ? Object.keys(data[0]) : [];
}

/** Valeurs non nulles d'un champ. */
function columnValues(data: Row[], field: string): unknown[] {
  const out: unknown[] = [];
  for (const r of data) {
    const v = r[field];
    if (v !== null && v !== undefined && v !== '') out.push(v);
  }
  return out;
}

/** Vrai si une valeur est un nombre natif fini ou une chaine numerique. */
function isNumericValue(v: unknown): boolean {
  return typeof v === 'number' ? Number.isFinite(v) : looksLikeNumber(v);
}

/** Vrai si une majorite des valeurs non nulles du champ sont numeriques. */
function isNumericField(data: Row[], field: string): boolean {
  const vals = columnValues(data, field);
  if (vals.length === 0) return false;
  let numeric = 0;
  for (const v of vals) if (isNumericValue(v)) numeric += 1;
  return numeric / vals.length >= 0.7;
}

/**
 * inspect_data : panorama complet de l'aperçu — pour chaque champ, type, nombre
 * de valeurs distinctes, echantillon de valeurs (texte) ou min/max (nombre).
 * Bien plus riche que l'unique enregistrement-exemple du dataContext.
 */
export function inspectData(data: Row[], fields: Field[], sampleSize = 8): string {
  if (data.length === 0)
    return 'Aucune donnee chargee. Demande a l utilisateur de choisir une source.';
  // Type de reference : celui deja analyse (cohérent avec l'UI) sinon detection.
  const typeByName = new Map(fields.map((f) => [f.name, f.type]));
  const keys = fields.length > 0 ? fields.map((f) => f.name) : dataKeys(data);
  const lines: string[] = [];
  for (const key of keys) {
    const vals = columnValues(data, key);
    const distinct = new Set(vals.map((v) => String(v)));
    const analyzed = typeByName.get(key);
    const numeric = analyzed ? analyzed === 'numérique' : isNumericField(data, key);
    if (numeric) {
      const nums = vals.map((v) => toNumber(v)).filter((n): n is number => Number.isFinite(n));
      const min = nums.length ? Math.min(...nums) : NaN;
      const max = nums.length ? Math.max(...nums) : NaN;
      lines.push(`- ${key} (nombre) — min ${min}, max ${max}, ${distinct.size} valeurs distinctes`);
    } else {
      const sample = Array.from(distinct)
        .slice(0, sampleSize)
        .map((v) => `"${v}"`)
        .join(', ');
      const more = distinct.size > sampleSize ? `, … (+${distinct.size - sampleSize})` : '';
      lines.push(`- ${key} (texte) — ${distinct.size} valeurs distinctes : ${sample}${more}`);
    }
  }
  return `Aperçu de ${data.length} enregistrements :\n${lines.join('\n')}`;
}

/**
 * distinct_values : valeurs reelles d'une colonne. Indispensable pour ne plus
 * inventer de valeurs de filtre (where ... eq ...).
 */
export function distinctValues(data: Row[], field: string, limit = 30): string {
  if (data.length === 0) return 'Aucune donnee chargee.';
  const keys = dataKeys(data);
  if (!keys.includes(field)) {
    return `Le champ "${field}" n existe pas. Champs disponibles : ${keys.join(', ')}.`;
  }
  const distinct = new Set(columnValues(data, field).map((v) => String(v)));
  const shown = Array.from(distinct)
    .slice(0, limit)
    .map((v) => `"${v}"`)
    .join(', ');
  const more = distinct.size > limit ? ` (affiche ${limit} sur ${distinct.size})` : '';
  return `Valeurs distinctes de "${field}" — ${distinct.size} au total${more} :\n${shown}`;
}

/**
 * count_where : combien de lignes matchent un filtre, AVANT de generer. Evite les
 * graphiques vides (cause n°1 des resultats "faux mais l IA s arrete").
 */
export function countWhere(data: Row[], where: string): string {
  if (data.length === 0) return 'Aucune donnee chargee.';
  if (!where || !where.trim()) return `Aucun filtre fourni : ${data.length} enregistrements.`;
  const matched = applyWhereFilter(data, where).length;
  const verdict =
    matched === 0
      ? ' ⚠️ ZERO ligne — verifie le nom du champ et la valeur (utilise distinct_values).'
      : '';
  return `Filtre "${where}" → ${matched} / ${data.length} enregistrements.${verdict}`;
}

/** Resultat d'un diagnostic de config. */
export interface Diagnosis {
  /** Faux s'il y a au moins une erreur bloquante (champ absent, 0 ligne…). */
  ok: boolean;
  /** Texte a remettre au modele (tool result). */
  text: string;
}

/**
 * diagnoseConfig : simule ce que `create_chart` va rendre et renvoie un verdict
 * actionnable. C'est le cœur de la boucle observe→corrige : appele AVANT de
 * laisser une action createChart terminer la boucle, il bloque les configs
 * manifestement cassees (champ inexistant, filtre a zero ligne, valueField non
 * numerique) et explique au modele quoi corriger.
 */
export function diagnoseConfig(config: Partial<ChartConfig>, data: Row[]): Diagnosis {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (data.length === 0) {
    return { ok: false, text: '⚠️ Aucune donnee chargee : impossible de generer un aperçu.' };
  }
  const keys = dataKeys(data);
  const type = config.type ?? '';

  // 1) Existence des champs references.
  const checkField = (label: string, name?: string) => {
    if (name && !keys.includes(name)) {
      errors.push(`Le champ ${label} "${name}" n existe pas. Champs : ${keys.join(', ')}.`);
      return false;
    }
    return true;
  };
  const labelOk = checkField('labelField', config.labelField);
  const valueOk = checkField('valueField', config.valueField);
  checkField('valueField2', config.valueField2);
  checkField('codeField', config.codeField);
  const extraFields = Array.isArray(config.valueFields) ? config.valueFields : [];
  for (const f of extraFields) checkField('série valueFields', f);

  // 2) Champs requis par type.
  if (type !== 'kpi' && type !== 'datalist' && !config.labelField) {
    warnings.push(
      'labelField absent : la plupart des graphiques ont besoin d un champ d etiquette.'
    );
  }
  if (type === 'datalist' && !config.colonnes) {
    warnings.push('datalist sans "colonnes" : toutes les colonnes seront affichees.');
  }
  if (
    (type === 'map' || type === 'map-reg' || type === 'map-aca' || type === 'map-monde') &&
    !config.codeField &&
    !config.labelField
  ) {
    errors.push(
      'Carte sans codeField : un champ code est requis (INSEE departement/region, nom d academie ou code pays ISO).'
    );
  }

  // 3) Filtre WHERE.
  let working = data;
  if (config.where) {
    working = applyWhereFilter(data, config.where);
    if (working.length === 0) {
      errors.push(
        `Le filtre "${config.where}" ne matche AUCUNE ligne. Verifie via count_where / distinct_values.`
      );
    }
  }

  // 4) valueField(s) numerique(s) — sinon graphique a plat sur 0 (bug n°1).
  const agg = (config.aggregation ?? 'sum') as Aggregation;
  if (type !== 'datalist' && agg !== 'count') {
    const numericTargets = [config.valueField, config.valueField2, ...extraFields].filter(
      (f): f is string => typeof f === 'string' && f.length > 0 && keys.includes(f)
    );
    const sample = working.length ? working : data;
    const nonNumeric = numericTargets.filter((f) => !isNumericField(sample, f));
    if (nonNumeric.length > 0) {
      errors.push(
        `Champ(s) non numerique(s) pour l agregation ${agg} : ${nonNumeric.join(', ')} → le graphique serait a plat sur 0. Choisis un champ nombre (vois inspect_data) ou aggregation="count".`
      );
    } else if (valueOk && config.valueField) {
      // Garde-fou supplementaire : meme avec un champ "numerique", verifie que le
      // resultat agrege n'est pas integralement nul.
      const agg2 = aggregateBy(sample, config.labelField, config.valueField, agg);
      if (agg2.length > 0 && agg2.every((r) => r.value === 0)) {
        errors.push(
          `L agregation de "${config.valueField}" donne 0 partout : champ probablement mal choisi. Verifie avec distinct_values / inspect_data.`
        );
      }
    }
  }

  // 5) Cardinalite apres agregation (sur le label).
  if (labelOk && config.labelField && working.length > 0 && type !== 'kpi' && type !== 'datalist') {
    const groups = new Set(working.map((r) => String(r[config.labelField!] ?? 'N/A'))).size;
    if (groups <= 1) {
      warnings.push(
        'Une seule categorie apres regroupement : un graphique sera peu lisible (envisage un KPI).'
      );
    } else if ((type === 'pie' || type === 'doughnut') && groups > 20) {
      warnings.push(
        `${groups} parts pour un ${type} : peu lisible au-dela de ~12. Ajoute limit ou choisis bar.`
      );
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      text: `⚠️ Aperçu NON valide (type=${type || '?'}, valueField=${config.valueField ?? '?'}, labelField=${config.labelField ?? '?'}) :\n- ${[...errors, ...warnings].join('\n- ')}\nCorrige la config puis rappelle create_chart.`,
    };
  }
  const rows = working.length;
  const warnText = warnings.length ? `\nRemarques : ${warnings.join(' ')}` : '';
  return {
    ok: true,
    text: `✓ Aperçu valide (type=${type}, valueField=${config.valueField ?? '?'}, labelField=${config.labelField ?? '?'}) — ${rows} lignes en entree.${warnText}`,
  };
}

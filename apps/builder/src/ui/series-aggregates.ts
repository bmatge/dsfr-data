/**
 * Les séries d'un graphique dynamique, dans le formulaire ou en « Requête
 * avancée » (#1170).
 *
 * En requête avancée, seul le PREMIER agrégat de « Agrégations multiples »
 * était tracé ; les suivants n'arrivaient qu'au tableau accessible, et la
 * « Série 2 » du formulaire disparaissait du code dès que le champ était
 * rempli. Ce module donne une seule réponse aux trois générateurs
 * (OpenDataSoft, Tabular, query générique) : chaque agrégat déclaré est une
 * série, et les séries du formulaire s'ajoutent à la suite au lieu d'être
 * perdues.
 */

import { state } from '../state.js';

/** Types qui tracent plusieurs séries. */
export const MULTI_SERIES_TYPES = ['bar', 'horizontalBar', 'line', 'radar'];

export interface SeriesAggregate {
  field: string;
  func: string;
  /** Colonne produite : l'alias écrit, sinon `champ__fonction` (grammaire de dsfr-data-query). */
  alias: string;
  /** Nom de la série dans la légende. */
  label: string;
  /** L'alias a-t-il été écrit par l'utilisateur ? */
  explicitAlias: boolean;
}

function fieldPath(name: string): string {
  return state.fields.find((f) => f.name === name)?.fullPath || name;
}

/** Séries supplémentaires du formulaire, pour les types qui en tracent plusieurs. */
export function formExtraSeries(): typeof state.extraSeries {
  return state.extraSeries.filter((s) => s.field && MULTI_SERIES_TYPES.includes(state.chartType));
}

/**
 * Agrégats de la requête avancée (`champ:fonction[:alias]`, séparés par des
 * virgules), suivis des séries supplémentaires du formulaire qui n'y
 * figurent pas déjà. Vide hors requête avancée.
 */
export function advancedAggregates(): SeriesAggregate[] {
  if (!state.advancedMode || !state.queryAggregate.trim()) return [];
  const out: SeriesAggregate[] = [];
  for (const part of state.queryAggregate.split(',')) {
    const [field, func, alias] = part
      .trim()
      .split(':')
      .map((x) => x.trim());
    if (!field || !func) continue;
    out.push({
      field,
      func,
      alias: alias || `${field}__${func}`,
      label: alias || `${field} (${func})`,
      explicitAlias: !!alias,
    });
  }
  for (const s of formExtraSeries()) {
    const path = fieldPath(s.field);
    const alias = `${path}__${state.aggregation}`;
    if (out.some((a) => a.alias === alias)) continue;
    out.push({
      field: path,
      func: state.aggregation,
      alias,
      label: s.label || s.field,
      explicitAlias: false,
    });
  }
  return out;
}

/** `champ:fonction[:alias]` d'un agrégat, pour l'attribut `aggregate` de dsfr-data-query. */
export function colonAggregate(a: SeriesAggregate): string {
  return a.explicitAlias ? `${a.field}:${a.func}:${a.alias}` : `${a.field}:${a.func}`;
}

/**
 * Colonnes tracées en plus de la première : toutes les suivantes pour un type
 * multi-séries, aucune sinon (un camembert n'a qu'une série).
 */
export function extraTraced(aggs: SeriesAggregate[]): string[] {
  if (!MULTI_SERIES_TYPES.includes(state.chartType)) return [];
  return aggs.slice(1).map((a) => a.alias);
}

/**
 * Noms des séries pour l'attribut `name` du graphique, quand il en trace
 * plusieurs : ceux des agrégats en requête avancée, sinon ceux du formulaire.
 */
export function seriesNames(): string[] {
  const aggs = advancedAggregates();
  if (aggs.length > 0) return aggs.map((a) => a.label);
  return [
    state.valueFieldLabel || state.valueField,
    ...formExtraSeries().map((s) => s.label || s.field),
  ];
}

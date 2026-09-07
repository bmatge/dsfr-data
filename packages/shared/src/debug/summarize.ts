/**
 * Résumé d'une charge de données observée sur le bus (#604).
 *
 * Règle cardinale : **on ne stocke jamais le payload complet**. Une source de
 * 50 000 lignes qui repagine dix fois ferait exploser la mémoire du volet et
 * le contexte de l'assistant. On garde le compte, la liste des champs et
 * quelques lignes d'échantillon — ce qui suffit à répondre aux trois
 * questions du diagnostic : combien, quels champs, à quoi ça ressemble.
 */

import { analyzeDataFields, type Field, type Row } from '../ia/data-tools.js';

export interface StageSummary {
  rows: number;
  fields: Field[];
  sample: Row[];
  /** Forme reçue avant extraction : utile quand rien ne sort d'un objet. */
  shape: 'array' | 'wrapped' | 'object' | 'empty';
}

/**
 * Extrait les lignes d'une charge, quelle que soit son enveloppe.
 *
 * Les sources ne livrent pas toutes un tableau nu : `results` (OpenDataSoft)
 * et `records` (Grist) sont les deux enveloppes rencontrées en pratique. Une
 * charge qui n'en est pas une reste diagnosticable — savoir qu'on a reçu un
 * objet non déroulable EST l'information utile.
 */
export function extractRows(data: unknown): { rows: Row[]; shape: StageSummary['shape'] } {
  if (Array.isArray(data)) {
    return { rows: data as Row[], shape: 'array' };
  }
  if (data && typeof data === 'object') {
    const wrapped = data as { results?: unknown; records?: unknown };
    if (Array.isArray(wrapped.results)) return { rows: wrapped.results as Row[], shape: 'wrapped' };
    if (Array.isArray(wrapped.records)) return { rows: wrapped.records as Row[], shape: 'wrapped' };
    return { rows: [], shape: 'object' };
  }
  return { rows: [], shape: 'empty' };
}

/** Résume une charge : compte, champs typés, échantillon borné. */
export function summarizeStage(data: unknown, sampleRows = 5): StageSummary {
  const { rows, shape } = extractRows(data);
  if (rows.length === 0) {
    return { rows: 0, fields: [], sample: [], shape };
  }
  return {
    rows: rows.length,
    fields: analyzeDataFields(rows),
    sample: rows.slice(0, sampleRows),
    shape,
  };
}

export interface FieldDiff {
  added: string[];
  removed: string[];
  kept: string[];
}

/**
 * Ce qu'une étape a fait aux champs.
 *
 * C'est l'unité d'information du diagnostic : un champ disparu entre deux
 * étapes explique une dataviz vide bien mieux que deux listes complètes à
 * comparer à l'œil.
 */
export function diffFields(before: Field[], after: Field[]): FieldDiff {
  const beforeNames = new Set(before.map((f) => f.name));
  const afterNames = new Set(after.map((f) => f.name));
  return {
    added: after.filter((f) => !beforeNames.has(f.name)).map((f) => f.name),
    removed: before.filter((f) => !afterNames.has(f.name)).map((f) => f.name),
    kept: after.filter((f) => beforeNames.has(f.name)).map((f) => f.name),
  };
}

/**
 * Matrice champ × étape, pour l'onglet « Champs » du volet.
 *
 * Rend, pour chaque champ jamais vu dans le flux, son type à chaque étape ou
 * `null` s'il en est absent. Un renommage en amont — le mode de panne le plus
 * coûteux, parce qu'il ne lève aucune erreur — y saute aux yeux.
 */
export function fieldMatrix(
  stages: Array<{ id: string; fields: Field[] }>
): Array<{ field: string; byStage: Array<string | null> }> {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const stage of stages) {
    for (const f of stage.fields) {
      if (!seen.has(f.name)) {
        seen.add(f.name);
        order.push(f.name);
      }
    }
  }
  return order.map((field) => ({
    field,
    byStage: stages.map((stage) => stage.fields.find((f) => f.name === field)?.type ?? null),
  }));
}

/**
 * Utilitaire de vérification de cohérence des données
 *
 * Compare les valeurs affichées dans le graphique avec les calculs attendus
 * depuis la source de données.
 */

import { Page } from '@playwright/test';

export interface TestDataset {
  data: Record<string, any>[];
  groupByField: string;
  valueField: string;
  aggregation: 'avg' | 'sum' | 'count' | 'min' | 'max';
}

export interface ConsistencyResult {
  passed: boolean;
  expected: number[];
  actual: number[];
  errors: string[];
}

/**
 * Calcule les valeurs attendues pour un dataset donné
 */
export function calculateExpectedValues(dataset: TestDataset): Map<string, number> {
  const { data, groupByField, valueField, aggregation } = dataset;
  const groups = new Map<string, number[]>();

  // Grouper les données
  for (const row of data) {
    const groupKey = String(row[groupByField] || 'N/A');
    const value = Number(row[valueField]) || 0;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(value);
  }

  // Appliquer l'agrégation
  const result = new Map<string, number>();
  for (const [key, values] of groups.entries()) {
    let aggregatedValue: number;

    switch (aggregation) {
      case 'sum':
        aggregatedValue = values.reduce((a, b) => a + b, 0);
        break;
      case 'avg':
        aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'count':
        aggregatedValue = values.length;
        break;
      case 'min':
        aggregatedValue = Math.min(...values);
        break;
      case 'max':
        aggregatedValue = Math.max(...values);
        break;
      default:
        aggregatedValue = 0;
    }

    // Arrondir à 2 décimales (comme le builder)
    result.set(key, Math.round(aggregatedValue * 100) / 100);
  }

  return result;
}

/**
 * Extrait les valeurs réelles du preview du builder
 */
export async function extractActualValues(page: Page): Promise<Map<string, number>> {
  return await page.evaluate(() => {
    const state = (window as any).__BUILDER_STATE__;
    if (!state || !state.data) return new Map();

    const result = new Map<string, number>();
    for (const row of state.data) {
      const label = row[state.labelField] || 'N/A';
      const value = Math.round((row.value || 0) * 100) / 100;
      result.set(String(label), value);
    }
    return result;
  });
}

/**
 * Compare les valeurs attendues avec les valeurs réelles
 */
export function compareValues(
  expected: Map<string, number>,
  actual: Map<string, number>,
  tolerance: number = 0.01
): ConsistencyResult {
  const errors: string[] = [];
  const expectedValues: number[] = [];
  const actualValues: number[] = [];

  // Vérifier que toutes les clés attendues sont présentes
  for (const [key, expectedValue] of expected.entries()) {
    expectedValues.push(expectedValue);

    if (!actual.has(key)) {
      errors.push(`Clé manquante: "${key}" (attendu: ${expectedValue})`);
      actualValues.push(0);
      continue;
    }

    const actualValue = actual.get(key)!;
    actualValues.push(actualValue);

    // Vérifier la valeur avec tolérance
    const diff = Math.abs(expectedValue - actualValue);
    if (diff > tolerance) {
      errors.push(
        `Valeur incorrecte pour "${key}": attendu ${expectedValue}, obtenu ${actualValue} (diff: ${diff})`
      );
    }
  }

  // Vérifier qu'il n'y a pas de clés en trop
  for (const key of actual.keys()) {
    if (!expected.has(key)) {
      errors.push(`Clé non attendue: "${key}" (valeur: ${actual.get(key)})`);
    }
  }

  return {
    passed: errors.length === 0,
    expected: expectedValues,
    actual: actualValues,
    errors,
  };
}

/**
 * Vérifie la cohérence complète d'un test
 */
export async function verifyConsistency(
  page: Page,
  dataset: TestDataset,
  tolerance: number = 0.01
): Promise<ConsistencyResult> {
  const expected = calculateExpectedValues(dataset);
  const actual = await extractActualValues(page);
  return compareValues(expected, actual, tolerance);
}

/**
 * Formate un rapport de cohérence
 */
export function formatConsistencyReport(result: ConsistencyResult): string {
  if (result.passed) {
    return '✅ Toutes les valeurs sont cohérentes avec la source de données';
  }

  let report = '❌ Des incohérences ont été détectées:\n\n';

  report += '**Valeurs attendues:**\n';
  report += result.expected.map((v, i) => `  ${i + 1}. ${v}`).join('\n');
  report += '\n\n';

  report += '**Valeurs obtenues:**\n';
  report += result.actual.map((v, i) => `  ${i + 1}. ${v}`).join('\n');
  report += '\n\n';

  report += '**Erreurs:**\n';
  report += result.errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n');

  return report;
}

/**
 * Datasets de test prédéfinis
 */
export const PRESET_DATASETS = {
  regions: {
    data: [
      { region: 'Ile-de-France', population: 12000, budget: 500, code: '75' },
      { region: 'Provence', population: 5000, budget: 200, code: '13' },
      { region: 'Bretagne', population: 3000, budget: 150, code: '35' },
      { region: 'Normandie', population: 3300, budget: 180, code: '14' },
    ],
    groupByField: 'region',
    valueField: 'population',
    aggregation: 'sum' as const,
  },
  duplicateRegions: {
    // Dataset avec des doublons pour tester l'agrégation
    data: [
      { region: 'Bretagne', score: 100 },
      { region: 'Bretagne', score: 200 },
      { region: 'Normandie', score: 150 },
      { region: 'Normandie', score: 250 },
    ],
    groupByField: 'region',
    valueField: 'score',
    aggregation: 'avg' as const,
  },
  numericalCategories: {
    // Dataset avec des catégories numériques
    data: [
      { annee: 2020, ventes: 1000 },
      { annee: 2021, ventes: 1200 },
      { annee: 2022, ventes: 1500 },
      { annee: 2023, ventes: 1800 },
    ],
    groupByField: 'annee',
    valueField: 'ventes',
    aggregation: 'sum' as const,
  },
};

/**
 * Valeurs attendues pour les datasets prédéfinis
 */
export const EXPECTED_RESULTS = {
  regions: {
    sum: new Map([
      ['Ile-de-France', 12000],
      ['Provence', 5000],
      ['Bretagne', 3000],
      ['Normandie', 3300],
    ]),
    avg: new Map([
      ['Ile-de-France', 12000],
      ['Provence', 5000],
      ['Bretagne', 3000],
      ['Normandie', 3300],
    ]),
    count: new Map([
      ['Ile-de-France', 1],
      ['Provence', 1],
      ['Bretagne', 1],
      ['Normandie', 1],
    ]),
    min: new Map([
      ['Ile-de-France', 12000],
      ['Provence', 5000],
      ['Bretagne', 3000],
      ['Normandie', 3300],
    ]),
    max: new Map([
      ['Ile-de-France', 12000],
      ['Provence', 5000],
      ['Bretagne', 3000],
      ['Normandie', 3300],
    ]),
  },
  duplicateRegions: {
    sum: new Map([
      ['Bretagne', 300],
      ['Normandie', 400],
    ]),
    avg: new Map([
      ['Bretagne', 150],
      ['Normandie', 200],
    ]),
    count: new Map([
      ['Bretagne', 2],
      ['Normandie', 2],
    ]),
    min: new Map([
      ['Bretagne', 100],
      ['Normandie', 150],
    ]),
    max: new Map([
      ['Bretagne', 200],
      ['Normandie', 250],
    ]),
  },
};

/**
 * Helper pour injecter un dataset dans le builder
 */
export async function loadDatasetIntoBuilder(page: Page, dataset: TestDataset) {
  await page.evaluate(({ data, groupByField, valueField }) => {
    const state = (window as any).__BUILDER_STATE__ || {};
    state.localData = data;
    state.labelField = groupByField;
    state.valueField = valueField;

    // Détecter les fields automatiquement
    if (data.length > 0) {
      const firstRow = data[0];
      state.fields = Object.keys(firstRow).map(key => ({
        name: key,
        type: typeof firstRow[key],
        sample: firstRow[key],
      }));
    }

    (window as any).__BUILDER_STATE__ = state;
  }, dataset);
}

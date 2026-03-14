/**
 * Tests de cohérence des agrégations
 *
 * Vérifie que les valeurs calculées par le builder correspondent exactement
 * aux calculs attendus depuis la source de données.
 */

import { test, expect } from '@playwright/test';
import {
  calculateExpectedValues,
  verifyConsistency,
  formatConsistencyReport,
  loadDatasetIntoBuilder,
  PRESET_DATASETS,
  EXPECTED_RESULTS,
  type TestDataset,
} from './data-consistency-checker';

test.describe('Builder - Cohérence des agrégations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/apps/builder/');
    await page.waitForSelector('#generate-btn');
  });

  const aggregations: Array<'sum' | 'avg' | 'count' | 'min' | 'max'> = [
    'sum',
    'avg',
    'count',
    'min',
    'max',
  ];

  for (const aggregation of aggregations) {
    test(`Agrégation ${aggregation.toUpperCase()} - valeurs cohérentes avec la source`, async ({
      page,
    }) => {
      const dataset: TestDataset = {
        ...PRESET_DATASETS.regions,
        aggregation,
      };

      // Charger le dataset
      await loadDatasetIntoBuilder(page, dataset);

      // Configurer le builder
      await page.selectOption('#label-field', dataset.groupByField);
      await page.selectOption('#value-field', dataset.valueField);
      await page.selectOption('#aggregation', aggregation);

      // Générer le graphique
      await page.click('#generate-btn');
      await page.waitForTimeout(500);

      // Vérifier la cohérence
      const result = await verifyConsistency(page, dataset);

      // Afficher le rapport si échec
      if (!result.passed) {
        console.error(formatConsistencyReport(result));
      }

      expect(result.passed).toBeTruthy();
      expect(result.errors).toHaveLength(0);
    });
  }

  test('Agrégation AVG avec doublons - moyenne correcte', async ({ page }) => {
    const dataset: TestDataset = {
      ...PRESET_DATASETS.duplicateRegions,
      aggregation: 'avg',
    };

    await loadDatasetIntoBuilder(page, dataset);

    await page.selectOption('#label-field', dataset.groupByField);
    await page.selectOption('#value-field', dataset.valueField);
    await page.selectOption('#aggregation', 'avg');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const result = await verifyConsistency(page, dataset);

    // Vérifications spécifiques pour la moyenne
    const expectedBretagneAvg = 150; // (100 + 200) / 2
    const expectedNormandieAvg = 200; // (150 + 250) / 2

    expect(result.passed).toBeTruthy();

    // Vérifier les valeurs exactes
    const actualMap = await page.evaluate(() => {
      const state = (window as any).__BUILDER_STATE__;
      const map = new Map<string, number>();
      for (const row of state.data || []) {
        map.set(row[state.labelField], Math.round((row.value || 0) * 100) / 100);
      }
      return Object.fromEntries(map);
    });

    expect(actualMap['Bretagne']).toBe(expectedBretagneAvg);
    expect(actualMap['Normandie']).toBe(expectedNormandieAvg);
  });

  test('Agrégation SUM - total global correct', async ({ page }) => {
    const dataset: TestDataset = {
      ...PRESET_DATASETS.regions,
      aggregation: 'sum',
    };

    await loadDatasetIntoBuilder(page, dataset);

    await page.selectOption('#label-field', dataset.groupByField);
    await page.selectOption('#value-field', dataset.valueField);
    await page.selectOption('#aggregation', 'sum');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    // Calculer le total attendu
    const expectedTotal = dataset.data.reduce((sum, row) => sum + row[dataset.valueField], 0);

    // Récupérer le total depuis le preview
    const actualTotal = await page.evaluate(() => {
      const state = (window as any).__BUILDER_STATE__;
      return (state.data || []).reduce((sum: number, row: any) => sum + (row.value || 0), 0);
    });

    expect(Math.round(actualTotal)).toBe(expectedTotal);
  });

  test('Agrégation COUNT - nombre correct de groupes', async ({ page }) => {
    const dataset: TestDataset = {
      ...PRESET_DATASETS.duplicateRegions,
      aggregation: 'count',
    };

    await loadDatasetIntoBuilder(page, dataset);

    await page.selectOption('#label-field', dataset.groupByField);
    await page.selectOption('#value-field', dataset.valueField);
    await page.selectOption('#aggregation', 'count');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    // Il y a 4 lignes au total, mais seulement 2 groupes distincts
    const actualData = await page.evaluate(() => {
      return (window as any).__BUILDER_STATE__?.data || [];
    });

    // 2 groupes : Bretagne et Normandie
    expect(actualData.length).toBe(2);

    // Chaque groupe doit avoir count = 2
    for (const row of actualData) {
      expect(row.value).toBe(2);
    }
  });

  test('Agrégation MIN - valeur minimale correcte', async ({ page }) => {
    const dataset: TestDataset = {
      ...PRESET_DATASETS.regions,
      aggregation: 'min',
    };

    await loadDatasetIntoBuilder(page, dataset);

    await page.selectOption('#label-field', dataset.groupByField);
    await page.selectOption('#value-field', dataset.valueField);
    await page.selectOption('#aggregation', 'min');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const values = await page.evaluate(() => {
      const state = (window as any).__BUILDER_STATE__;
      return (state.data || []).map((row: any) => row.value || 0);
    });

    // Trouver le minimum global
    const minValue = Math.min(...values);

    // Le minimum dans le dataset est 3000 (Bretagne)
    expect(minValue).toBe(3000);
  });

  test('Agrégation MAX - valeur maximale correcte', async ({ page }) => {
    const dataset: TestDataset = {
      ...PRESET_DATASETS.regions,
      aggregation: 'max',
    };

    await loadDatasetIntoBuilder(page, dataset);

    await page.selectOption('#label-field', dataset.groupByField);
    await page.selectOption('#value-field', dataset.valueField);
    await page.selectOption('#aggregation', 'max');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const values = await page.evaluate(() => {
      const state = (window as any).__BUILDER_STATE__;
      return (state.data || []).map((row: any) => row.value || 0);
    });

    // Trouver le maximum global
    const maxValue = Math.max(...values);

    // Le maximum dans le dataset est 12000 (Ile-de-France)
    expect(maxValue).toBe(12000);
  });

  test('Tri DESC - valeurs triées correctement', async ({ page }) => {
    const dataset: TestDataset = {
      ...PRESET_DATASETS.regions,
      aggregation: 'sum',
    };

    await loadDatasetIntoBuilder(page, dataset);

    await page.selectOption('#label-field', dataset.groupByField);
    await page.selectOption('#value-field', dataset.valueField);
    await page.selectOption('#aggregation', 'sum');
    await page.selectOption('#sort-order', 'desc');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const values = await page.evaluate(() => {
      const state = (window as any).__BUILDER_STATE__;
      return (state.data || []).map((row: any) => row.value || 0);
    });

    // Vérifier que les valeurs sont triées en décroissant
    for (let i = 0; i < values.length - 1; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i + 1]);
    }

    // La première valeur doit être 12000 (max)
    expect(values[0]).toBe(12000);
  });

  test('Tri ASC - valeurs triées correctement', async ({ page }) => {
    const dataset: TestDataset = {
      ...PRESET_DATASETS.regions,
      aggregation: 'sum',
    };

    await loadDatasetIntoBuilder(page, dataset);

    await page.selectOption('#label-field', dataset.groupByField);
    await page.selectOption('#value-field', dataset.valueField);
    await page.selectOption('#aggregation', 'sum');
    await page.selectOption('#sort-order', 'asc');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const values = await page.evaluate(() => {
      const state = (window as any).__BUILDER_STATE__;
      return (state.data || []).map((row: any) => row.value || 0);
    });

    // Vérifier que les valeurs sont triées en croissant
    for (let i = 0; i < values.length - 1; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i + 1]);
    }

    // La première valeur doit être 3000 (min)
    expect(values[0]).toBe(3000);
  });

  test('Filtre avancé - résultats filtrés correctement', async ({ page }) => {
    const dataset: TestDataset = {
      ...PRESET_DATASETS.regions,
      aggregation: 'sum',
    };

    await loadDatasetIntoBuilder(page, dataset);

    await page.selectOption('#label-field', dataset.groupByField);
    await page.selectOption('#value-field', dataset.valueField);
    await page.selectOption('#aggregation', 'sum');

    // Activer mode avancé et filtrer
    await page.check('#advanced-mode-toggle');
    await page.fill('#query-filter', 'population:gte:4000');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const resultCount = await page.evaluate(() => {
      const state = (window as any).__BUILDER_STATE__;
      return (state.data || []).length;
    });

    // Seulement 2 régions ont population >= 4000 : Ile-de-France (12000) et Provence (5000)
    expect(resultCount).toBe(2);

    const values = await page.evaluate(() => {
      const state = (window as any).__BUILDER_STATE__;
      return (state.data || []).map((row: any) => row.value || 0);
    });

    // Toutes les valeurs doivent être >= 4000
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(4000);
    }
  });
});

test.describe('Builder - Rapport de cohérence', () => {
  test('Génère un rapport de test complet', async ({ page }) => {
    await page.goto('http://localhost:5173/apps/builder/');

    const report: { aggregation: string; passed: boolean; errors: string[] }[] = [];

    for (const aggregation of ['sum', 'avg', 'count', 'min', 'max']) {
      const dataset: TestDataset = {
        ...PRESET_DATASETS.regions,
        aggregation: aggregation as any,
      };

      await loadDatasetIntoBuilder(page, dataset);

      await page.selectOption('#label-field', dataset.groupByField);
      await page.selectOption('#value-field', dataset.valueField);
      await page.selectOption('#aggregation', aggregation);

      await page.click('#generate-btn');
      await page.waitForTimeout(300);

      const result = await verifyConsistency(page, dataset);

      report.push({
        aggregation,
        passed: result.passed,
        errors: result.errors,
      });
    }

    // Afficher le rapport
    console.log('\n=== RAPPORT DE COHÉRENCE ===\n');
    for (const item of report) {
      const status = item.passed ? '✅' : '❌';
      console.log(`${status} ${item.aggregation.toUpperCase()}`);
      if (!item.passed) {
        item.errors.forEach(err => console.log(`   - ${err}`));
      }
    }

    const allPassed = report.every(item => item.passed);
    expect(allPassed).toBeTruthy();
  });
});

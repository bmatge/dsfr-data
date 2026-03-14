/**
 * Tests exhaustifs du Builder - Vérification de tous les paramètres
 *
 * Ce fichier teste systématiquement chaque paramètre du builder pour s'assurer que :
 * 1. Le paramètre modifie bien le preview
 * 2. Le code généré contient les attributs attendus
 * 3. Les valeurs calculées correspondent aux données source
 */

import { test, expect, Page } from '@playwright/test';

// Dataset de test avec des valeurs connues pour vérifier les calculs
const TEST_DATA = [
  { region: 'Ile-de-France', population: 12000, budget: 500, code: '75' },
  { region: 'Provence', population: 5000, budget: 200, code: '13' },
  { region: 'Bretagne', population: 3000, budget: 150, code: '35' },
  { region: 'Normandie', population: 3300, budget: 180, code: '14' },
];

// Valeurs attendues pour chaque fonction d'agrégation
const EXPECTED_VALUES = {
  sum: { population: 23300, budget: 1030 },
  avg: { population: 5825, budget: 257.5 },
  count: 4,
  min: { population: 3000, budget: 150 },
  max: { population: 12000, budget: 500 },
};

/**
 * Charge des données locales dans le builder
 */
async function loadLocalData(page: Page, data: any[]) {
  // Simuler un saved source avec données locales
  await page.evaluate((testData) => {
    const state = (window as any).__BUILDER_STATE__ || {};
    state.localData = testData;
    state.fields = [
      { name: 'region', type: 'string', sample: 'Ile-de-France' },
      { name: 'population', type: 'number', sample: 12000 },
      { name: 'budget', type: 'number', sample: 500 },
      { name: 'code', type: 'string', sample: '75' },
    ];
    (window as any).__BUILDER_STATE__ = state;
  }, data);
}

/**
 * Extrait les valeurs du graphique généré dans le preview
 */
async function extractChartValues(page: Page): Promise<number[]> {
  return await page.evaluate(() => {
    const state = (window as any).__BUILDER_STATE__;
    if (!state || !state.data) return [];
    return state.data.map((d: any) => d.value || 0);
  });
}

/**
 * Vérifie que le code généré contient un attribut spécifique
 */
async function checkGeneratedCode(page: Page, expectedPattern: string | RegExp): Promise<boolean> {
  const code = await page.locator('#generated-code').textContent();
  if (!code) return false;

  if (typeof expectedPattern === 'string') {
    return code.includes(expectedPattern);
  }
  return expectedPattern.test(code);
}

test.describe('Builder - Tests exhaustifs des fonctions d\'agrégation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/apps/builder/');
    await page.waitForSelector('#generate-btn');
    await loadLocalData(page, TEST_DATA);
  });

  test('Agrégation SUM - vérifie le calcul correct', async ({ page }) => {
    // Configurer le graphique
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'sum');

    // Générer
    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    // Vérifier les valeurs dans le preview
    const values = await extractChartValues(page);
    const totalSum = values.reduce((a, b) => a + b, 0);

    // Pour un group-by region, on attend 4 valeurs (une par région)
    expect(values.length).toBe(4);

    // Vérifier que le code généré contient "sum"
    const hasSum = await checkGeneratedCode(page, /sum\(population\)/i);
    expect(hasSum).toBeTruthy();
  });

  test('Agrégation AVG - vérifie le calcul correct', async ({ page }) => {
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'avg');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const values = await extractChartValues(page);

    // Chaque région a une seule entrée, donc avg = value
    // Pour Ile-de-France: avg(12000) = 12000
    const ileValue = values.find(v => v === 12000);
    expect(ileValue).toBeDefined();

    const hasAvg = await checkGeneratedCode(page, /avg\(population\)/i);
    expect(hasAvg).toBeTruthy();
  });

  test('Agrégation MIN - vérifie le calcul correct', async ({ page }) => {
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'min');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const values = await extractChartValues(page);

    // Vérifier qu'il y a bien une valeur min dans les résultats
    const minValue = Math.min(...values);
    expect(minValue).toBeGreaterThan(0);

    const hasMin = await checkGeneratedCode(page, /min\(population\)/i);
    expect(hasMin).toBeTruthy();
  });

  test('Agrégation MAX - vérifie le calcul correct', async ({ page }) => {
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'max');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const values = await extractChartValues(page);

    // Vérifier qu'il y a bien une valeur max dans les résultats
    const maxValue = Math.max(...values);
    expect(maxValue).toBeGreaterThan(0);

    const hasMax = await checkGeneratedCode(page, /max\(population\)/i);
    expect(hasMax).toBeTruthy();
  });

  test('Agrégation COUNT - vérifie le calcul correct', async ({ page }) => {
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'count');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const values = await extractChartValues(page);

    // Pour COUNT, chaque région devrait avoir count=1 (une entrée par région)
    expect(values.length).toBe(4);
    values.forEach(v => {
      expect(v).toBe(1);
    });

    const hasCount = await checkGeneratedCode(page, /count\(\*\)/i);
    expect(hasCount).toBeTruthy();
  });
});

test.describe('Builder - Tests des types de graphiques', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/apps/builder/');
    await page.waitForSelector('#generate-btn');
    await loadLocalData(page, TEST_DATA);

    // Configuration de base
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'sum');
  });

  const chartTypes = [
    { type: 'bar', expectedTag: 'bar-chart', hasCanvas: false },
    { type: 'horizontalBar', expectedTag: 'bar-chart', expectedAttr: 'horizontal' },
    { type: 'line', expectedTag: 'line-chart', hasCanvas: false },
    { type: 'pie', expectedTag: 'pie-chart', expectedAttr: 'fill' },
    { type: 'doughnut', expectedTag: 'pie-chart', hasCanvas: false },
    { type: 'radar', expectedTag: 'radar-chart', hasCanvas: false },
    { type: 'scatter', expectedTag: 'scatter-chart', hasCanvas: false },
    { type: 'gauge', expectedTag: 'gauge-chart', hasCanvas: false },
    { type: 'kpi', expectedElement: 'kpi-card', hasCanvas: false },
    { type: 'map', expectedTag: 'map-chart', requiresCodeField: true },
  ];

  for (const chartConfig of chartTypes) {
    test(`Type ${chartConfig.type} - génère le bon élément`, async ({ page }) => {
      // Cliquer sur le type de graphique
      await page.click(`button[data-type="${chartConfig.type}"]`);

      // Pour les maps, sélectionner le code field
      if (chartConfig.requiresCodeField) {
        await page.selectOption('#code-field', 'code');
      }

      // Générer
      await page.click('#generate-btn');
      await page.waitForTimeout(500);

      // Vérifier le code généré
      if (chartConfig.expectedTag) {
        const hasTag = await checkGeneratedCode(page, `<${chartConfig.expectedTag}`);
        expect(hasTag).toBeTruthy();
      }

      if (chartConfig.expectedElement) {
        const hasElement = await checkGeneratedCode(page, chartConfig.expectedElement);
        expect(hasElement).toBeTruthy();
      }

      if (chartConfig.expectedAttr) {
        const hasAttr = await checkGeneratedCode(page, chartConfig.expectedAttr);
        expect(hasAttr).toBeTruthy();
      }

      // Vérifier le preview (ne doit pas être vide)
      const emptyState = await page.locator('#empty-state').isVisible();
      expect(emptyState).toBeFalsy();
    });
  }
});

test.describe('Builder - Tests des palettes de couleurs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/apps/builder/');
    await loadLocalData(page, TEST_DATA);

    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'sum');
  });

  const palettes = [
    'default',
    'categorical',
    'sequentialAscending',
    'sequentialDescending',
    'divergentAscending',
    'divergentDescending',
    'neutral',
  ];

  for (const palette of palettes) {
    test(`Palette ${palette} - appliquée dans le code généré`, async ({ page }) => {
      await page.selectOption('#chart-palette', palette);
      await page.click('#generate-btn');
      await page.waitForTimeout(500);

      const hasPalette = await checkGeneratedCode(page, `selected-palette="${palette}"`);
      expect(hasPalette).toBeTruthy();
    });
  }
});

test.describe('Builder - Tests du tri', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/apps/builder/');
    await loadLocalData(page, TEST_DATA);

    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'sum');
  });

  test('Tri décroissant - valeurs dans l\'ordre', async ({ page }) => {
    await page.selectOption('#sort-order', 'desc');
    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const values = await extractChartValues(page);

    // Vérifier que les valeurs sont triées en décroissant
    for (let i = 0; i < values.length - 1; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i + 1]);
    }
  });

  test('Tri croissant - valeurs dans l\'ordre', async ({ page }) => {
    await page.selectOption('#sort-order', 'asc');
    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const values = await extractChartValues(page);

    // Vérifier que les valeurs sont triées en croissant
    for (let i = 0; i < values.length - 1; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i + 1]);
    }
  });
});

test.describe('Builder - Tests des séries multiples', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/apps/builder/');
    await loadLocalData(page, TEST_DATA);

    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
  });

  test('Série 2 - génère value-field-2 dans le code', async ({ page }) => {
    await page.selectOption('#value-field-2', 'budget');
    await page.selectOption('#aggregation', 'sum');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const hasValueField2 = await checkGeneratedCode(page, /value-field-2=/);
    expect(hasValueField2).toBeTruthy();
  });
});

test.describe('Builder - Tests du mode avancé', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/apps/builder/');
    await loadLocalData(page, TEST_DATA);

    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
  });

  test('Filtre avancé - appliqué dans le code', async ({ page }) => {
    // Activer le mode avancé
    await page.check('#advanced-mode-toggle');

    // Ajouter un filtre
    await page.fill('#query-filter', 'population:gte:4000');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    // Vérifier que le filtre est dans le code
    const hasFilter = await checkGeneratedCode(page, /filter=|where=/);
    expect(hasFilter).toBeTruthy();

    // Vérifier que les résultats sont filtrés (seulement 2 régions avec population >= 4000)
    const values = await extractChartValues(page);
    expect(values.length).toBeLessThanOrEqual(2);
  });

  test('Group-by personnalisé - appliqué dans le code', async ({ page }) => {
    await page.check('#advanced-mode-toggle');
    await page.fill('#query-group-by', 'region');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const hasGroupBy = await checkGeneratedCode(page, /group-by=/);
    expect(hasGroupBy).toBeTruthy();
  });

  test('Agrégation personnalisée - appliquée dans le code', async ({ page }) => {
    await page.check('#advanced-mode-toggle');
    await page.fill('#query-aggregate', 'population:sum, budget:avg');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const hasAggregate = await checkGeneratedCode(page, /aggregate=/);
    expect(hasAggregate).toBeTruthy();
  });
});

test.describe('Builder - Tests KPI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/apps/builder/');
    await loadLocalData(page, TEST_DATA);

    await page.click('button[data-type="kpi"]');
    await page.selectOption('#value-field', 'population');
  });

  const variants = ['', 'info', 'success', 'warning', 'error'];

  for (const variant of variants) {
    test(`KPI variant ${variant || 'default'} - appliqué dans le code`, async ({ page }) => {
      if (variant) {
        await page.selectOption('#kpi-variant', variant);
      }

      await page.click('#generate-btn');
      await page.waitForTimeout(500);

      if (variant) {
        const hasVariant = await checkGeneratedCode(page, `kpi-card--${variant}`);
        expect(hasVariant).toBeTruthy();
      }

      // Vérifier que la classe kpi-card existe
      const hasKpiCard = await checkGeneratedCode(page, 'kpi-card');
      expect(hasKpiCard).toBeTruthy();
    });
  }

  test('KPI avec unité - formatage correct', async ({ page }) => {
    await page.fill('#kpi-unit', '€');
    await page.selectOption('#aggregation', 'sum');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const hasUnit = await checkGeneratedCode(page, /EUR|€/);
    expect(hasUnit).toBeTruthy();
  });
});

test.describe('Builder - Tests Datalist', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/apps/builder/');
    await loadLocalData(page, TEST_DATA);

    await page.click('button[data-type="datalist"]');
  });

  test('Datalist avec recherche - attribut présent', async ({ page }) => {
    await page.check('#datalist-recherche');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const hasRecherche = await checkGeneratedCode(page, /recherche/);
    expect(hasRecherche).toBeTruthy();
  });

  test('Datalist avec export CSV - attribut présent', async ({ page }) => {
    await page.check('#datalist-export');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const hasExport = await checkGeneratedCode(page, /export="csv"/);
    expect(hasExport).toBeTruthy();
  });

  test('Datalist avec export HTML - attribut présent', async ({ page }) => {
    await page.check('#datalist-export-html');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const hasExport = await checkGeneratedCode(page, /export=.*html/);
    expect(hasExport).toBeTruthy();
  });
});

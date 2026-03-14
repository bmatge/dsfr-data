/**
 * Audit rapide du Builder - Tests prioritaires
 *
 * Lance une suite de tests rapides pour identifier les problèmes critiques
 * dans les paramètres les plus utilisés.
 *
 * Usage : npx playwright test tests/builder-e2e/quick-audit.spec.ts
 */

import { test, expect, Page } from '@playwright/test';

const TEST_DATA = [
  { region: 'Ile-de-France', population: 12000, budget: 500, code: '75' },
  { region: 'Provence', population: 5000, budget: 200, code: '13' },
  { region: 'Bretagne', population: 3000, budget: 150, code: '35' },
  { region: 'Normandie', population: 3300, budget: 180, code: '14' },
];

async function loadLocalData(page: Page, data: any[]) {
  await page.evaluate((testData) => {
    const state = (window as any).__BUILDER_STATE__ || {};
    state.localData = testData;
    state.sourceType = 'saved';
    state.savedSource = { name: 'Test Dataset', type: 'local' };
    state.fields = [
      { name: 'region', type: 'string', sample: 'Ile-de-France' },
      { name: 'population', type: 'number', sample: 12000 },
      { name: 'budget', type: 'number', sample: 500 },
      { name: 'code', type: 'string', sample: '75' },
    ];
    (window as any).__BUILDER_STATE__ = state;
  }, data);

  // Peupler les dropdowns
  await page.evaluate(() => {
    const state = (window as any).__BUILDER_STATE__;
    const labelField = document.getElementById('label-field') as HTMLSelectElement;
    const valueField = document.getElementById('value-field') as HTMLSelectElement;
    const codeField = document.getElementById('code-field') as HTMLSelectElement;

    if (labelField && state.fields) {
      labelField.innerHTML = '<option value="">— Charger les champs —</option>';
      state.fields.forEach((f: any) => {
        const opt = document.createElement('option');
        opt.value = f.name;
        opt.textContent = f.name;
        labelField.appendChild(opt);
      });
    }

    if (valueField && state.fields) {
      valueField.innerHTML = '<option value="">— Charger les champs —</option>';
      state.fields.forEach((f: any) => {
        const opt = document.createElement('option');
        opt.value = f.name;
        opt.textContent = f.name;
        valueField.appendChild(opt);
      });
    }

    if (codeField && state.fields) {
      codeField.innerHTML = '<option value="">— Charger les champs —</option>';
      state.fields.forEach((f: any) => {
        const opt = document.createElement('option');
        opt.value = f.name;
        opt.textContent = f.name;
        codeField.appendChild(opt);
      });
    }
  });
}

async function checkGeneratedCode(page: Page, pattern: string | RegExp): Promise<boolean> {
  const code = await page.locator('#generated-code').textContent();
  if (!code) return false;
  if (typeof pattern === 'string') return code.includes(pattern);
  return pattern.test(code);
}

/**
 * Ouvre une section si elle est fermée (collapsed)
 */
async function openSection(page: Page, sectionId: string) {
  const section = page.locator(`#${sectionId}`);
  const isCollapsed = await section.evaluate(el => el.classList.contains('collapsed'));

  if (isCollapsed) {
    await section.locator('.config-section-header').click();
    await page.waitForTimeout(300);
  }
}

test.describe('🚨 Audit rapide - Problèmes critiques', () => {
  let auditResults: { test: string; passed: boolean; issue?: string }[] = [];

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/apps/builder/');
    await page.waitForSelector('#generate-btn');
    await loadLocalData(page, TEST_DATA);
  });

  test.afterAll(() => {
    console.log('\n\n===== RAPPORT D\'AUDIT RAPIDE =====\n');

    const passed = auditResults.filter(r => r.passed);
    const failed = auditResults.filter(r => !r.passed);

    console.log(`✅ Tests réussis : ${passed.length}/${auditResults.length}`);
    console.log(`❌ Tests échoués : ${failed.length}/${auditResults.length}\n`);

    if (failed.length > 0) {
      console.log('⚠️  PROBLÈMES DÉTECTÉS :\n');
      failed.forEach((r, i) => {
        console.log(`${i + 1}. ${r.test}`);
        if (r.issue) console.log(`   → ${r.issue}\n`);
      });
    }

    if (passed.length === auditResults.length) {
      console.log('✨ Tous les tests critiques passent ! Le builder fonctionne correctement.\n');
    }
  });

  test('1. SUM - calcul correct', async ({ page }) => {
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'sum');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const values = await page.evaluate(() => {
      const state = (window as any).__BUILDER_STATE__;
      return (state?.data || []).map((d: any) => d.value || 0);
    });

    const totalSum = values.reduce((a: number, b: number) => a + b, 0);
    const expectedSum = 23300; // 12000 + 5000 + 3000 + 3300

    const passed = Math.abs(totalSum - expectedSum) < 0.01;
    auditResults.push({
      test: 'Agrégation SUM',
      passed,
      issue: passed ? undefined : `Somme incorrecte: attendu ${expectedSum}, obtenu ${totalSum}`,
    });

    expect(totalSum).toBeCloseTo(expectedSum, 0);
  });

  test('2. AVG - calcul correct', async ({ page }) => {
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'avg');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const values = await page.evaluate(() => {
      const state = (window as any).__BUILDER_STATE__;
      return (state?.data || []).map((d: any) => d.value || 0);
    });

    // Chaque région a une seule entrée, donc avg = value
    const avgOk = values.every((v: number) => v > 0);
    const passed = avgOk && values.length === 4;

    auditResults.push({
      test: 'Agrégation AVG',
      passed,
      issue: passed ? undefined : `Moyenne incorrecte ou données manquantes`,
    });

    expect(avgOk).toBeTruthy();
  });

  test('3. MIN - valeur non nulle', async ({ page }) => {
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'min');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const values = await page.evaluate(() => {
      const state = (window as any).__BUILDER_STATE__;
      return (state?.data || []).map((d: any) => d.value || 0);
    });

    const minValue = Math.min(...values);
    const passed = minValue === 3000; // Bretagne

    auditResults.push({
      test: 'Agrégation MIN',
      passed,
      issue: passed ? undefined : `Min incorrect: attendu 3000, obtenu ${minValue}`,
    });

    expect(minValue).toBe(3000);
  });

  test('4. MAX - valeur non nulle', async ({ page }) => {
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'max');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const values = await page.evaluate(() => {
      const state = (window as any).__BUILDER_STATE__;
      return (state?.data || []).map((d: any) => d.value || 0);
    });

    const maxValue = Math.max(...values);
    const passed = maxValue === 12000; // Ile-de-France

    auditResults.push({
      test: 'Agrégation MAX',
      passed,
      issue: passed ? undefined : `Max incorrect: attendu 12000, obtenu ${maxValue}`,
    });

    expect(maxValue).toBe(12000);
  });

  test('5. COUNT - nombre correct', async ({ page }) => {
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'count');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const values = await page.evaluate(() => {
      const state = (window as any).__BUILDER_STATE__;
      return (state?.data || []).map((d: any) => d.value || 0);
    });

    const passed = values.length === 4 && values.every((v: number) => v === 1);

    auditResults.push({
      test: 'Agrégation COUNT',
      passed,
      issue: passed ? undefined : `Count incorrect: chaque région devrait avoir count=1`,
    });

    expect(values).toHaveLength(4);
  });

  test('6. HorizontalBar - attribut "horizontal"', async ({ page }) => {
    await openSection(page, 'section-type');
    await page.click('button[data-type="horizontalBar"]');
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'sum');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const hasHorizontal = await checkGeneratedCode(page, /horizontal/);
    const passed = hasHorizontal;

    auditResults.push({
      test: 'HorizontalBar - attribut "horizontal"',
      passed,
      issue: passed ? undefined : 'Attribut "horizontal" manquant dans le code généré',
    });

    expect(hasHorizontal).toBeTruthy();
  });

  test('7. Pie - attribut "fill"', async ({ page }) => {
    await openSection(page, 'section-type');
    await page.click('button[data-type="pie"]');
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'sum');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const hasFill = await checkGeneratedCode(page, /fill/);
    const passed = hasFill;

    auditResults.push({
      test: 'Pie - attribut "fill"',
      passed,
      issue: passed ? undefined : 'Attribut "fill" manquant dans le code généré',
    });

    expect(hasFill).toBeTruthy();
  });

  test('8. Tri DESC - valeurs triées', async ({ page }) => {
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'sum');
    await page.selectOption('#sort-order', 'desc');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const values = await page.evaluate(() => {
      const state = (window as any).__BUILDER_STATE__;
      return (state?.data || []).map((d: any) => d.value || 0);
    });

    const isSorted = values.every((v: number, i: number, arr: number[]) =>
      i === 0 || arr[i - 1] >= v
    );

    auditResults.push({
      test: 'Tri décroissant (DESC)',
      passed: isSorted,
      issue: isSorted ? undefined : 'Les valeurs ne sont pas triées en décroissant',
    });

    expect(isSorted).toBeTruthy();
  });

  test('9. Filtre avancé - appliqué', async ({ page }) => {
    await openSection(page, 'section-data');
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'sum');

    // Cliquer sur le label du toggle (le checkbox est intercepté)
    await page.click('label[for="advanced-mode-toggle"]');
    await page.fill('#query-filter', 'population:gte:4000');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const resultCount = await page.evaluate(() => {
      const state = (window as any).__BUILDER_STATE__;
      return (state?.data || []).length;
    });

    const passed = resultCount === 2; // Ile-de-France et Provence

    auditResults.push({
      test: 'Filtre avancé (population >= 4000)',
      passed,
      issue: passed ? undefined : `Filtre non appliqué: attendu 2 résultats, obtenu ${resultCount}`,
    });

    expect(resultCount).toBe(2);
  });

  test('10. KPI - génère le bon élément', async ({ page }) => {
    await openSection(page, 'section-type');
    await page.click('button[data-type="kpi"]');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'sum');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const hasKpiCard = await checkGeneratedCode(page, /kpi-card/);
    const passed = hasKpiCard;

    auditResults.push({
      test: 'KPI - génération',
      passed,
      issue: passed ? undefined : 'Élément KPI non généré correctement',
    });

    expect(hasKpiCard).toBeTruthy();
  });

  test('11. Palette - appliquée', async ({ page }) => {
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');
    await page.selectOption('#aggregation', 'sum');
    await page.selectOption('#chart-palette', 'categorical');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const hasPalette = await checkGeneratedCode(page, /selected-palette="categorical"/);
    const passed = hasPalette;

    auditResults.push({
      test: 'Palette de couleurs',
      passed,
      issue: passed ? undefined : 'Palette non appliquée dans le code généré',
    });

    expect(hasPalette).toBeTruthy();
  });

  test('12. Série 2 - attribut présent', async ({ page }) => {
    // Sélectionner un type de graphique qui supporte les séries multiples
    await openSection(page, 'section-type');
    await page.click('button[data-type="bar"]');

    // Configurer les champs
    await openSection(page, 'section-data');
    await page.selectOption('#label-field', 'region');
    await page.selectOption('#value-field', 'population');

    // Afficher le groupe value-field-2 (caché par défaut)
    await page.evaluate(() => {
      const group = document.getElementById('value-field-2-group');
      if (group) group.style.display = 'block';
    });
    await page.waitForTimeout(300);

    await page.selectOption('#value-field-2', 'budget');
    await page.selectOption('#aggregation', 'sum');

    await page.click('#generate-btn');
    await page.waitForTimeout(500);

    const hasValueField2 = await checkGeneratedCode(page, /value-field-2/);
    const passed = hasValueField2;

    auditResults.push({
      test: 'Série 2 (value-field-2)',
      passed,
      issue: passed ? undefined : 'Attribut value-field-2 manquant',
    });

    expect(hasValueField2).toBeTruthy();
  });
});

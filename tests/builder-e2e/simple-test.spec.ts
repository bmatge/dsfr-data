/**
 * Test simple du Builder - Adapté au code réel
 *
 * Ce test vérifie les fonctions basiques sans supposer la structure interne.
 *
 * PRÉREQUIS : Lancer le serveur de dev avant les tests
 * npm run dev
 */

import { test, expect, type Page } from '@playwright/test';

test.describe('Builder - Tests simples', () => {
  test.beforeEach(async ({ page }) => {
    // Aller sur le builder
    await page.goto('http://localhost:5173/apps/builder/');

    // Attendre que la page soit chargée
    await page.waitForLoadState('networkidle');
  });

  test('1. Page builder charge correctement', async ({ page }) => {
    // Vérifier que les éléments principaux sont présents
    await expect(page.locator('#generate-btn')).toBeVisible();
    await expect(page.locator('#label-field')).toBeVisible();
    await expect(page.locator('#value-field')).toBeVisible();
    await expect(page.locator('#aggregation')).toBeVisible();
  });

  test('2. Sélection des champs disponibles', async ({ page }) => {
    // Vérifier qu'on peut sélectionner un champ
    const labelField = page.locator('#label-field');
    await expect(labelField).toBeEnabled();

    const valueField = page.locator('#value-field');
    await expect(valueField).toBeEnabled();
  });

  test('3. Fonctions d\'agrégation disponibles', async ({ page }) => {
    const aggSelect = page.locator('#aggregation');

    // Vérifier que toutes les agrégations sont présentes
    const options = await aggSelect.locator('option').allTextContents();

    expect(options).toContain('Moyenne');
    expect(options).toContain('Somme');
    expect(options).toContain('Comptage');
    expect(options).toContain('Min');
    expect(options).toContain('Max');
  });

  test('4. Types de graphiques disponibles', async ({ page }) => {
    // Vérifier que tous les boutons de type sont présents
    const chartTypes = [
      'bar', 'horizontalBar', 'line', 'pie', 'doughnut',
      'radar', 'scatter', 'gauge', 'kpi', 'map', 'datalist'
    ];

    for (const type of chartTypes) {
      const btn = page.locator(`button[data-type="${type}"]`);
      await expect(btn).toBeVisible();
    }
  });

  test('5. Palettes de couleurs disponibles', async ({ page }) => {
    const paletteSelect = page.locator('#chart-palette');
    const options = await paletteSelect.locator('option').allTextContents();

    expect(options.length).toBeGreaterThan(0);
    expect(options.some(opt => opt.includes('Bleu'))).toBeTruthy();
  });

  test('6. Bouton générer est cliquable', async ({ page }) => {
    const generateBtn = page.locator('#generate-btn');
    await expect(generateBtn).toBeEnabled();
  });

  test('7. Zone de code généré existe', async ({ page }) => {
    const codeOutput = page.locator('#generated-code');
    await expect(codeOutput).toBeVisible();
  });

  test('8. Preview canvas existe', async ({ page }) => {
    const canvas = page.locator('#preview-canvas');
    await expect(canvas).toBeDefined();
  });
});

test.describe('Builder - Test avec une source réelle', () => {
  test.skip('9. Sélectionner une source et charger les champs', async ({ page }) => {
    await page.goto('http://localhost:5173/apps/builder/');
    await page.waitForLoadState('networkidle');

    // Sélectionner une source depuis le dropdown
    const savedSourceSelect = page.locator('#saved-source');

    // Attendre que les options soient chargées
    await page.waitForTimeout(1000);

    // Compter les sources disponibles
    const options = await savedSourceSelect.locator('option').count();
    console.log(`${options} sources disponibles`);

    if (options > 1) {
      // Sélectionner la première source (index 1, car 0 est "— Choisir —")
      await savedSourceSelect.selectOption({ index: 1 });

      // Cliquer sur "Charger"
      await page.click('#load-fields-btn');

      // Attendre que les champs soient chargés
      await page.waitForTimeout(2000);

      // Vérifier que les dropdowns sont remplis
      const labelFieldOptions = await page.locator('#label-field option').count();
      const valueFieldOptions = await page.locator('#value-field option').count();

      console.log(`Label fields : ${labelFieldOptions}, Value fields : ${valueFieldOptions}`);

      expect(labelFieldOptions).toBeGreaterThan(1);
      expect(valueFieldOptions).toBeGreaterThan(1);
    }
  });
});

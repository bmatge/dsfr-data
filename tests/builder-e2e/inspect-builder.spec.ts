/**
 * Script d'inspection du Builder
 *
 * Ce test analyse la structure réelle du builder pour adapter les autres tests.
 *
 * Usage : npx playwright test inspect-builder.spec.ts --headed
 */

import { test } from '@playwright/test';

test('Inspecter la structure du Builder', async ({ page }) => {
  console.log('\n========================================');
  console.log('🔍 INSPECTION DU BUILDER');
  console.log('========================================\n');

  // 1. Charger la page
  await page.goto('http://localhost:5173/apps/builder/');
  await page.waitForLoadState('networkidle');

  console.log('✅ Page chargée\n');

  // 2. Inspecter les ID HTML disponibles
  console.log('📋 ID HTML disponibles :');
  const ids = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('[id]'));
    return elements.map(el => ({
      id: el.id,
      tag: el.tagName.toLowerCase(),
      type: (el as HTMLInputElement).type || '',
    }));
  });

  const grouped = ids.reduce((acc, item) => {
    if (!acc[item.tag]) acc[item.tag] = [];
    acc[item.tag].push(item);
    return acc;
  }, {} as Record<string, typeof ids>);

  for (const [tag, items] of Object.entries(grouped)) {
    console.log(`\n  ${tag.toUpperCase()} :`);
    items.forEach(item => {
      const typeInfo = item.type ? ` (type=${item.type})` : '';
      console.log(`    - ${item.id}${typeInfo}`);
    });
  }

  // 3. Inspecter l'objet state global
  console.log('\n📦 État global (window) :');
  const windowKeys = await page.evaluate(() => {
    return Object.keys(window).filter(key =>
      key.toLowerCase().includes('state') ||
      key.toLowerCase().includes('builder') ||
      key.toLowerCase().includes('chart')
    );
  });

  if (windowKeys.length > 0) {
    console.log('  Variables trouvées :');
    windowKeys.forEach(key => console.log(`    - window.${key}`));
  } else {
    console.log('  ⚠️  Aucune variable "state" trouvée dans window');
  }

  // 4. Inspecter le module state
  console.log('\n📦 Module state :');
  const stateModule = await page.evaluate(() => {
    try {
      // Essayer d'accéder à state via le module
      const stateObj = (window as any).state || (window as any).__BUILDER_STATE__;
      if (stateObj) {
        return {
          exists: true,
          keys: Object.keys(stateObj),
          sample: {
            chartType: stateObj.chartType,
            aggregation: stateObj.aggregation,
            hasData: Array.isArray(stateObj.data),
            hasFields: Array.isArray(stateObj.fields),
          },
        };
      }
      return { exists: false };
    } catch (e) {
      return { exists: false, error: String(e) };
    }
  });

  if (stateModule.exists) {
    console.log('  ✅ Objet state trouvé');
    console.log('  Propriétés :', stateModule.keys);
    console.log('  Échantillon :', JSON.stringify(stateModule.sample, null, 2));
  } else {
    console.log('  ⚠️  Objet state NON trouvé');
    if (stateModule.error) {
      console.log('  Erreur :', stateModule.error);
    }
  }

  // 5. Inspecter les options de sélection disponibles
  console.log('\n📋 Options dans les selects :');

  const selects = ['label-field', 'value-field', 'aggregation', 'sort-order', 'chart-palette'];

  for (const selectId of selects) {
    const options = await page.evaluate((id) => {
      const select = document.getElementById(id) as HTMLSelectElement;
      if (!select) return null;
      return Array.from(select.options).map(opt => ({
        value: opt.value,
        text: opt.textContent?.trim(),
      }));
    }, selectId);

    if (options) {
      console.log(`\n  #${selectId} :`);
      options.slice(0, 5).forEach(opt => {
        console.log(`    - value="${opt.value}" text="${opt.text}"`);
      });
      if (options.length > 5) {
        console.log(`    ... et ${options.length - 5} autres`);
      }
    } else {
      console.log(`\n  #${selectId} : ❌ NON TROUVÉ`);
    }
  }

  // 6. Inspecter les boutons de type de graphique
  console.log('\n📊 Types de graphiques disponibles :');
  const chartTypes = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button[data-type]'));
    return buttons.map(btn => btn.getAttribute('data-type'));
  });

  if (chartTypes.length > 0) {
    console.log('  Types :', chartTypes.join(', '));
  } else {
    console.log('  ⚠️  Aucun bouton [data-type] trouvé');
  }

  // 7. Inspecter les fonctions du builder
  console.log('\n⚙️  Fonctions disponibles :');
  const functions = await page.evaluate(() => {
    const funcs: string[] = [];
    for (const key in window) {
      if (typeof (window as any)[key] === 'function' &&
          (key.toLowerCase().includes('generate') ||
           key.toLowerCase().includes('chart') ||
           key.toLowerCase().includes('load'))) {
        funcs.push(key);
      }
    }
    return funcs;
  });

  if (functions.length > 0) {
    console.log('  Fonctions :', functions.join(', '));
  } else {
    console.log('  ⚠️  Aucune fonction pertinente trouvée');
  }

  // 8. Recommandations
  console.log('\n========================================');
  console.log('💡 RECOMMANDATIONS');
  console.log('========================================\n');

  if (!stateModule.exists) {
    console.log('⚠️  Le state n\'est pas accessible globalement.');
    console.log('   → Les tests doivent injecter du code dans la page pour accéder au state');
    console.log('   → Ou modifier le builder pour exposer window.__BUILDER_STATE__\n');
  }

  if (chartTypes.length === 0) {
    console.log('⚠️  Les boutons de type ne sont pas trouvés avec [data-type]');
    console.log('   → Vérifier la structure HTML dans apps/builder/index.html\n');
  }

  console.log('📝 Prochaines étapes :');
  console.log('   1. Vérifier que tous les ID existent dans le HTML');
  console.log('   2. Adapter les tests pour utiliser la structure réelle');
  console.log('   3. Tester une fonction à la fois (SUM, AVG, etc.)\n');

  // Garder la page ouverte pour inspection manuelle
  console.log('🔍 Page ouverte pour inspection manuelle');
  console.log('   Ouvrez DevTools et inspectez :');
  console.log('   - window.state ou window.__BUILDER_STATE__');
  console.log('   - Les ID HTML des éléments');
  console.log('   - La console pour les erreurs\n');

  // Attendre 30 secondes pour laisser le temps d'inspecter
  await page.waitForTimeout(30000);
});

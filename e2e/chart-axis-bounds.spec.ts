import { test, expect, type Page } from '@playwright/test';

/**
 * #1273 — bornes d'axe (`x-min`, `x-max`, `y-min`, `y-max`) par type de
 * graphique, lues sur le VRAI DSFR Chart (chargé depuis node_modules).
 *
 * La règle : pour chaque couple attribut × type, la borne AGIT — posée
 * exactement sur l'échelle Chart.js que l'usager lit — ou elle est SIGNALÉE en
 * console. Jamais ignorée en silence, jamais posée à contresens (une borne
 * relayée à un axe d'étiquettes y devenait une catégorie fantôme).
 *
 * Ce que le test unitaire ne peut pas dire : que DSFR Chart lit bien
 * l'attribut relayé (`y-bar-max`, `x-max` pour des barres horizontales), que
 * l'instance Chart.js est retrouvée (y compris sous DataBox), et que l'échelle
 * dessinée est celle que le plan a décidée.
 */

interface Echelle {
  type: string;
  min: number;
  max: number;
  /** Étiquettes d'un axe de catégories, telles que Chart.js les porte. */
  labels: string[] | null;
}

async function lireEchelles(page: Page, id: string): Promise<Record<string, Echelle> | null> {
  try {
    return await lireEchellesDansLaPage(page, id);
  } catch (erreur) {
    // Le serveur de dev surveille `e2e/` : un rechargement complet peut
    // détruire le contexte sous la lecture. Ce n'est pas une échelle fausse,
    // c'est une lecture qui n'a pas eu lieu — le tour de scrutation suivant
    // la refait (même parti pris que `verif-donnees.spec.ts`).
    if (/Execution context was destroyed|Target (page|closed)/.test(String(erreur))) return null;
    throw erreur;
  }
}

function lireEchellesDansLaPage(page: Page, id: string): Promise<Record<string, Echelle> | null> {
  return page.evaluate((cible) => {
    const hote = document.getElementById(cible);
    const el = hote?.querySelector(
      'bar-chart, line-chart, bar-line-chart, scatter-chart, radar-chart, pie-chart'
    ) as (Element & { _instance?: { proxy?: { chart?: unknown } } }) | null;
    const chart = el?._instance?.proxy?.chart as
      | {
          chartArea?: { width: number };
          scales?: Record<
            string,
            { type: string; min: number; max: number; getLabels?: () => unknown[] }
          >;
        }
      | undefined;
    if (!chart?.scales || !chart.chartArea || chart.chartArea.width <= 0) return null;
    const out: Record<string, { type: string; min: number; max: number; labels: string[] | null }> =
      {};
    for (const [nom, e] of Object.entries(chart.scales)) {
      out[nom] = {
        type: e.type,
        min: e.min,
        max: e.max,
        labels: e.type === 'category' ? (e.getLabels?.() ?? []).map(String) : null,
      };
    }
    return out;
  }, id);
}

const ETIQUETTES = ['A', 'B', 'C', 'D'];

let avertissements: string[] = [];

test.beforeEach(async ({ page }) => {
  avertissements = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning' && msg.text().startsWith('dsfr-data-chart[')) {
      avertissements.push(msg.text());
    }
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/e2e/chart-axis-bounds.html');
});

/** Attend que l'échelle `axe` de `id` porte les bornes voulues (rendu différé). */
async function attendreEchelle(
  page: Page,
  id: string,
  axe: string,
  bornes: [number, number]
): Promise<Record<string, Echelle>> {
  await expect
    .poll(
      async () => {
        const e = (await lireEchelles(page, id))?.[axe];
        return e ? [e.min, e.max] : null;
      },
      { timeout: 15_000, message: `#${id} : échelle ${axe}` }
    )
    .toEqual(bornes);
  return (await lireEchelles(page, id))!;
}

/** Avertissements émis pour un graphique, sans le préfixe. */
const pour = (id: string) =>
  avertissements
    .filter((a) => a.startsWith(`dsfr-data-chart[${id}]: `))
    .map((a) => a.slice(`dsfr-data-chart[${id}]: `.length));

test.describe('la borne agit, exactement', () => {
  test('barres : y-min négatif et y-max hors graduation', async ({ page }) => {
    const e = await attendreEchelle(page, 'barres-y', 'y', [-10, 37]);
    expect(e.x.labels).toEqual(ETIQUETTES);
    expect(pour('barres-y')).toEqual([]);
  });

  test('barres empilées : y-max au-dessus du cumul', async ({ page }) => {
    await attendreEchelle(page, 'barres-empilees', 'y', [0, 600]);
    expect(pour('barres-empilees')).toEqual([]);
  });

  test('barres horizontales : y-* borne l’axe des VALEURS, sans catégorie fantôme', async ({
    page,
  }) => {
    const e = await attendreEchelle(page, 'barres-h-y', 'x', [-10, 40]);
    // Avant #1273 : y portait ['A','B','C','D','-10','40'].
    expect(e.y.type).toBe('category');
    expect(e.y.labels).toEqual(ETIQUETTES);
    expect(pour('barres-h-y')).toEqual([]);
  });

  test('barres horizontales : x-max, ce que le Builder écrit depuis la 0.48.0', async ({
    page,
  }) => {
    const e = await attendreEchelle(page, 'barres-h-x', 'x', [0, 40]);
    expect(e.y.labels).toEqual(ETIQUETTES);
    expect(pour('barres-h-x')).toEqual([]);
  });

  test('courbe : un minimum positif n’est plus arrondi à la graduation inférieure', async ({
    page,
  }) => {
    // Avant #1273 : y-min="5" rendait 0..40.
    await attendreEchelle(page, 'courbe-y', 'y', [5, 37]);
    expect(pour('courbe-y')).toEqual([]);
  });

  test('courbe à étiquettes numériques : x-min / x-max élargissent l’axe', async ({ page }) => {
    const e = await attendreEchelle(page, 'courbe-x-num', 'x', [2018, 2030]);
    expect(e.x.type).toBe('linear');
    expect(pour('courbe-x-num')).toEqual([]);
  });

  test('barres + ligne : y-* borne l’axe des barres, l’axe de la ligne reste libre', async ({
    page,
  }) => {
    // Avant #1273 : y restait 0..40, les attributs n'étaient lus par personne.
    const e = await attendreEchelle(page, 'barres-ligne-y', 'y', [-10, 37]);
    expect([e.yLine.min, e.yLine.max]).toEqual([0, 600]);
    expect(e.x.labels).toEqual(ETIQUETTES);
    expect(pour('barres-ligne-y')).toEqual([]);
  });

  test('nuage : les deux axes', async ({ page }) => {
    const e = await attendreEchelle(page, 'nuage', 'y', [-7, 40]);
    expect(e.x.min).toBe(2018);
    expect(pour('nuage')).toEqual([]);
  });

  test('radar : échelle radiale inchangée, x-min signalé', async ({ page }) => {
    await attendreEchelle(page, 'radar', 'r', [0, 40]);
    expect(pour('radar')).toEqual([
      'x-min est sans effet sur type="radar" : un radar n\'a qu\'une échelle radiale, que bornent y-min / y-max',
    ]);
  });

  test('sous DataBox : l’instance téléportée est retrouvée', async ({ page }) => {
    await attendreEchelle(page, 'courbe-databox', 'y', [5, 40]);
  });
});

test.describe('la borne n’agit pas : elle est signalée, et l’axe reste entier', () => {
  test('barres : un minimum positif (des barres partent de zéro)', async ({ page }) => {
    await attendreEchelle(page, 'barres-min-positif', 'y', [0, 35]);
    expect(pour('barres-min-positif')).toEqual([
      'y-min="5" est ignoré sur type="bar" : des barres partent de zéro (seul un minimum négatif ou nul agit)',
    ]);
  });

  test('barres : x-* sur l’axe des étiquettes — plus de catégorie fantôme', async ({ page }) => {
    const e = await attendreEchelle(page, 'barres-x', 'y', [0, 35]);
    // Avant #1273 : x portait ['A','B','C','D','5','40'].
    expect(e.x.labels).toEqual(ETIQUETTES);
    expect(pour('barres-x')).toHaveLength(2);
    expect(pour('barres-x')[0]).toContain('x-min est sans effet sur type="bar"');
    expect(pour('barres-x')[0]).toContain('y-min / y-max');
  });

  test('barres empilées : y-max sous le cumul', async ({ page }) => {
    await attendreEchelle(page, 'barres-empilees-sous-cumul', 'y', [0, 600]);
    expect(pour('barres-empilees-sous-cumul')).toHaveLength(1);
    expect(pour('barres-empilees-sous-cumul')[0]).toContain('543');
  });

  test('courbe : des bornes qui masqueraient des points', async ({ page }) => {
    const e = await attendreEchelle(page, 'courbe-masque', 'y', [10, 40]);
    expect(e.y.min).toBeLessThanOrEqual(12);
    expect(e.y.max).toBeGreaterThanOrEqual(33);
    expect(pour('courbe-masque')).toHaveLength(2);
    expect(pour('courbe-masque')[0]).toContain('y-min="20" est ignoré');
    expect(pour('courbe-masque')[1]).toContain('y-max="25" est ignoré');
  });

  test('courbe à étiquettes texte : x-* — plus de catégorie fantôme', async ({ page }) => {
    const e = await attendreEchelle(page, 'courbe-x-texte', 'y', [10, 40]);
    expect(e.x.type).toBe('category');
    expect(e.x.labels).toEqual(ETIQUETTES);
    expect(pour('courbe-x-texte')).toHaveLength(2);
    expect(pour('courbe-x-texte')[0]).toContain('x-min est sans effet sur type="line"');
  });

  test('camembert : un type sans axe', async ({ page }) => {
    await expect(page.locator('#camembert canvas')).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => pour('camembert'), { timeout: 10_000 })
      .toEqual(['y-min est sans effet sur type="pie" : ce type n\'a pas d\'axe']);
  });
});

test('un avertissement par attribut, pas un par rendu', async ({ page }) => {
  await attendreEchelle(page, 'barres-min-positif', 'y', [0, 35]);
  // Un changement d'attribut relance un rendu complet du composant.
  await page.evaluate(() => {
    document.getElementById('barres-min-positif')!.setAttribute('unit-tooltip', '%');
  });
  await page.waitForTimeout(800);
  expect(pour('barres-min-positif')).toHaveLength(1);
});

test('un repère se place sur l’échelle bornée, pas sur celle d’avant', async ({ page }) => {
  await attendreEchelle(page, 'courbe-repere', 'y', [5, 40]);
  const ligne = page.locator('#courbe-repere .dsfr-data-chart__reflines line').first();
  await expect(ligne).toBeAttached({ timeout: 10_000 });
  // La position du seuil 20, recalculée depuis l'échelle que Chart.js applique.
  const attendue = await page.evaluate(() => {
    const el = document.querySelector('#courbe-repere line-chart') as Element & {
      _instance: { proxy: { chart: { scales: { y: { getPixelForValue(v: number): number } } } } };
    };
    return el._instance.proxy.chart.scales.y.getPixelForValue(20);
  });
  await expect
    .poll(async () => Number(await ligne.getAttribute('y1')), { timeout: 10_000 })
    .toBeCloseTo(attendue, 0);
});

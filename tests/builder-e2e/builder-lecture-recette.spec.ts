/**
 * Recette des réglages de lecture du Builder « Créer un graphique » (#1218).
 *
 * `tests/apps/builder/lecture-1218.test.ts` vérifie la FORME du code généré.
 * Ce qu'il ne peut pas dire : qu'un réglage posé dans le volet change vraiment
 * ce que l'aperçu AFFICHE. Chaque cas rouvre un état déposé (le chemin d'un
 * favori), pose les réglages PAR L'INTERFACE, clique « Générer », puis lit
 * dans l'aperçu ce que DSFR Chart a dessiné : échelles Chart.js, étiquettes,
 * calques des lignes de référence et des cibles, chiffre de synthèse.
 *
 * C'est aussi ce qui garde la table « quel réglage pour quel type » de
 * `apps/builder/src/lecture.ts`, mesurée dans le navigateur : sur des barres
 * horizontales l'axe des valeurs est l'axe X, sur un barres + ligne les bornes
 * sont sans effet (le formulaire ne les y propose pas).
 *
 * RECETTE MANUELLE, HORS CI : l'aperçu du Builder charge DSFR et DSFR Chart
 * depuis leur CDN, donc le réseau. `builder-e2e.yml` nomme ses specs une par
 * une et ne lance pas celui-ci.
 *
 *   npm run build:shared && npm run build:app-ui && npm run build
 *   npx playwright test --config tests/builder-e2e/playwright.config.ts \
 *     builder-lecture-recette
 */

import { test, expect, type Page } from '@playwright/test';

type Ligne = Record<string, string | number>;

const REGIONS: Ligne[] = [
  { region: 'Bretagne', taux: 10, effectif: 300 },
  { region: 'Corse', taux: 14, effectif: 350 },
  { region: 'Occitanie', taux: 12, effectif: 420 },
  { region: 'Normandie', taux: 18, effectif: 380 },
  { region: '', taux: 6, effectif: 90 },
];
const ANNEES: Ligne[] = [
  { annee: '2020', taux: 10, budget: 300 },
  { annee: '2021', taux: 14, budget: 350 },
  { annee: '2022', taux: 12, budget: 420 },
  { annee: '2023', taux: 18, budget: 380 },
];
const POINTS: Ligne[] = [
  { x: 1, y: 10 },
  { x: 2, y: 14 },
  { x: 3, y: 12 },
  { x: 4, y: 18 },
];
const DEPARTEMENTS: Ligne[] = [
  { dep: '75', licences: 1200 },
  { dep: '13', licences: 800 },
  { dep: '69', licences: 650 },
  { dep: '33', licences: 400 },
  { dep: '59', licences: 900 },
];

/** Champs d'un jeu, déduits de sa première ligne. */
function champs(lignes: Ligne[]): { name: string; type: string; sample: string | number }[] {
  return Object.entries(lignes[0]).map(([name, sample]) => ({
    name,
    type: typeof sample === 'number' ? 'number' : 'string',
    sample,
  }));
}

/** État déposé comme le fait la page Favoris, AVANT #1218 : aucun réglage de lecture. */
function etat(
  chartType: string,
  lignes: Ligne[],
  labelField: string,
  valueField: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    chartType,
    labelField,
    valueField,
    aggregation: 'sum',
    sortOrder: 'none',
    title: 'Recette des réglages de lecture',
    palette: 'default',
    fields: champs(lignes),
    localData: lignes,
    data: [],
    savedSource: { id: 'recette-1218', name: 'Jeu de recette', type: 'manual' },
    generationMode: 'embedded',
    ...extra,
  };
}

/** Ouvre le Builder sur un état déposé, section « Apparence » dépliée. */
async function ouvrir(page: Page, depose: Record<string, unknown>): Promise<string[]> {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.addInitScript((etatDepose) => {
    // Dans la page seulement : l'iframe d'aperçu partage l'origine. Redéposé à
    // chaque chargement — à froid, Vite recharge la page après avoir optimisé
    // ses dépendances, et le premier dépôt a déjà été consommé.
    if (window.top !== window) return;
    sessionStorage.setItem('builder-state', JSON.stringify(etatDepose));
    // La visite guidée du premier passage pose un voile qui intercepte les clics.
    localStorage.setItem('dsfr-data-tours', JSON.stringify({ disabled: true, tours: {} }));
  }, depose);
  await page.goto('/apps/builder/?from=favorites');
  await expect(page.locator('#generate-btn')).toBeEnabled();
  await page.evaluate(() => {
    for (const s of document.querySelectorAll('.config-section')) s.classList.add('collapsed');
    document.getElementById('section-appearance')?.classList.remove('collapsed');
  });
  return erreurs;
}

async function generer(page: Page): Promise<string> {
  await page.locator('#generate-btn').click();
  await expect(page.locator('#builder-dirty-status-text')).toHaveText('Graphique à jour');
  return (await page.locator('#generated-code').textContent()) ?? '';
}

/** Ce que DSFR Chart a dessiné dans l'aperçu. */
interface Rendu {
  echelles: Record<string, [number, number]>;
  etiquettes: string[];
  /** Traits des calques de la bibliothèque (lignes de référence, trajectoires). */
  traits: number;
  /** Losanges des cibles. */
  losanges: number;
  /** Attribut `value` de la balise de carte : le chiffre de synthèse. */
  synthese: string | null;
  texte: string;
}

async function lireApercu(page: Page): Promise<Rendu | null> {
  return page.evaluate(() => {
    interface ChartJs {
      scales: Record<string, { min: number; max: number }>;
      data: { labels?: unknown[] };
    }
    interface VueHote extends Element {
      _instance?: { proxy?: { chart?: unknown }; ctx?: { chart?: unknown } };
    }
    const doc = (document.getElementById('preview-iframe') as HTMLIFrameElement | null)
      ?.contentDocument;
    const hote = doc?.querySelector('dsfr-data-chart');
    if (!hote) return null;
    let chart: ChartJs | null = null;
    for (const el of hote.querySelectorAll<VueHote>('*')) {
      const brut = el._instance?.proxy?.chart ?? el._instance?.ctx?.chart;
      const valeur = (
        brut && (brut as { __v_isRef?: boolean }).__v_isRef
          ? (brut as { value: unknown }).value
          : brut
      ) as ChartJs | undefined;
      if (valeur?.scales) {
        chart = valeur;
        break;
      }
    }
    const echelles: Record<string, [number, number]> = {};
    for (const [nom, e] of Object.entries(chart?.scales ?? {})) echelles[nom] = [e.min, e.max];
    return {
      echelles,
      etiquettes: (chart?.data.labels ?? []).map(String),
      traits: hote.querySelectorAll('svg line').length,
      losanges: hote.querySelectorAll('svg polygon').length,
      synthese: hote.querySelector('map-chart, map-chart-reg')?.getAttribute('value') ?? null,
      texte: (hote.textContent ?? '').replace(/\s+/g, ' '),
    };
  });
}

/** Attend le rendu de DSFR Chart, puis rend ce qu'il a dessiné. */
async function apercu(page: Page, pret: (r: Rendu) => boolean): Promise<Rendu> {
  await expect
    .poll(
      async () => {
        const r = await lireApercu(page);
        return r !== null && pret(r);
      },
      { timeout: 15_000 }
    )
    .toBe(true);
  return (await lireApercu(page))!;
}

const aDesEchelles = (r: Rendu): boolean => Object.keys(r.echelles).length > 0;

test.describe('réglages de lecture : le volet change ce que l’aperçu affiche (#1218)', () => {
  test('ancien favori : rouvert sans réglage, balise DSFR Chart nue', async ({ page }) => {
    const erreurs = await ouvrir(page, etat('bar', REGIONS, 'region', 'taux'));
    const code = await generer(page);
    expect(code).toContain('<bar-chart id="chart"');
    expect(code).not.toContain('<dsfr-data-chart');
    for (const id of ['chart-unit', 'empty-label', 'axis-max']) {
      await expect(page.locator(`#${id}`)).toHaveValue('');
    }
    await expect(page.locator('.lecture-row')).toHaveCount(0);
    expect(erreurs).toEqual([]);
  });

  test('barres : unité, catégorie vide, couleur, borne, seuil', async ({ page }) => {
    const erreurs = await ouvrir(page, etat('bar', REGIONS, 'region', 'taux'));
    await generer(page);
    await page.fill('#chart-unit', '%');
    await page.fill('#empty-label', 'Sans région');
    await page.click('#color-map-details > summary');
    await page.click('#add-color-map-btn');
    await page.fill('#color-map-key-0', 'Corse');
    await page.fill('#color-map-color-0', '#e1000f');
    await page.click('#axes-details > summary');
    await page.fill('#axis-max', '40');
    await page.click('#add-reference-line-btn');
    await page.fill('#reference-value-0', '13');
    await page.fill('#reference-label-0', 'Moyenne nationale');
    await expect(page.locator('#builder-dirty-status-text')).toHaveText(
      'Modifications non générées'
    );

    const code = await generer(page);
    for (const attendu of [
      'unit-tooltip="%"',
      'empty-label="Sans région"',
      'y-max="40"',
      'color-map="Corse:#e1000f"',
      `reference-lines='[{"axis":"y","value":13,"label":"Moyenne nationale"}]'`,
    ]) {
      expect(code).toContain(attendu);
    }
    const r = await apercu(page, (x) => x.echelles.y?.[1] === 40 && x.traits > 0);
    expect(r.echelles.y).toEqual([0, 40]);
    expect(r.etiquettes).toEqual(['Bretagne', 'Corse', 'Occitanie', 'Normandie', 'Sans région']);
    expect(r.texte).toContain('Moyenne nationale');
    expect(erreurs).toEqual([]);
  });

  test('barres horizontales : la borne agit sur l’axe X, sans catégorie fantôme', async ({
    page,
  }) => {
    await ouvrir(page, etat('horizontalBar', REGIONS.slice(0, 4), 'region', 'taux'));
    await page.click('#axes-details > summary');
    await page.fill('#axis-max', '40');
    await page.click('#add-reference-line-btn');
    await page.fill('#reference-value-0', '13');
    const code = await generer(page);
    expect(code).toContain('x-max="40"');
    expect(code).not.toContain('y-max=');
    expect(code).toContain('"axis":"x","value":13');
    const r = await apercu(page, (x) => x.echelles.x?.[1] === 40 && x.traits > 0);
    expect(r.echelles.x).toEqual([0, 40]);
    expect(r.etiquettes).toEqual(['Bretagne', 'Corse', 'Occitanie', 'Normandie']);
  });

  test('lignes : minimum, repère sur une étiquette, cible au-delà des données', async ({
    page,
  }) => {
    await ouvrir(page, etat('line', ANNEES, 'annee', 'taux'));
    await page.click('#axes-details > summary');
    await page.fill('#axis-min', '0');
    await page.click('#add-reference-line-btn');
    await page.selectOption('#reference-kind-0', 'label');
    await page.fill('#reference-value-0', '2022');
    await page.fill('#reference-label-0', 'Réforme');
    await page.click('#add-target-btn');
    await page.fill('#target-x-0', '2030');
    await page.fill('#target-value-0', '26');
    await page.fill('#target-label-0', 'Cible 2030');
    await generer(page);
    const r = await apercu(page, (x) => x.etiquettes.includes('2030') && x.losanges > 0);
    expect(r.echelles.y[0]).toBe(0);
    expect(r.echelles.y[1]).toBeGreaterThanOrEqual(26);
    expect(r.etiquettes).toEqual(['2020', '2021', '2022', '2023', '2030']);
    expect(r.texte).toContain('Réforme');
    expect(r.texte).toContain('Cible 2030');
    expect(r.texte).toContain('Trajectoire');
  });

  test('cible rouverte d’un favori : sans légende une fois la case décochée', async ({ page }) => {
    await ouvrir(
      page,
      etat('line', ANNEES, 'annee', 'taux', {
        targets: [{ x: '2030', value: '26', label: 'Cible', series: 'line' }],
      })
    );
    // Le réglage rouvert se montre : la divulgation est dépliée, la ligne remplie.
    await expect(page.locator('#target-x-0')).toHaveValue('2030');
    await page.click('label[for="targets-legend"]');
    const code = await generer(page);
    expect(code).toContain('targets-legend="off"');
    const r = await apercu(page, (x) => x.losanges > 0);
    expect(r.texte).not.toContain('Trajectoire');
  });

  test('barres + ligne : deux unités, cible sur la ligne, pas de bornes proposées', async ({
    page,
  }) => {
    await ouvrir(page, etat('bar-line', ANNEES, 'annee', 'taux', { lineField: 'budget' }));
    await expect(page.locator('label[for="chart-unit"]')).toContainText('Unité de la ligne');
    await page.fill('#chart-unit', 'M€');
    await page.fill('#chart-unit-bar', '%');
    await page.click('#axes-details > summary');
    await expect(page.locator('#axis-max')).toBeHidden();
    await page.click('#add-target-btn');
    await page.fill('#target-x-0', '2026');
    await page.fill('#target-value-0', '500');
    const code = await generer(page);
    expect(code).toContain('unit-tooltip-bar="%"');
    expect(code).toContain('unit-tooltip="M€"');
    expect(code).toContain('"series":1');
    const r = await apercu(page, (x) => x.etiquettes.includes('2026') && x.losanges > 0);
    expect(r.echelles.yLine[1]).toBeGreaterThanOrEqual(500);
  });

  test('nuage de points : les deux axes se bornent', async ({ page }) => {
    await ouvrir(page, etat('scatter', POINTS, 'x', 'y'));
    await page.click('#axes-details > summary');
    await page.fill('#axis-max', '40');
    await page.fill('#x-axis-min', '-2');
    await page.fill('#x-axis-max', '10');
    await generer(page);
    const r = await apercu(page, (x) => x.echelles.y?.[1] === 40);
    expect(r.echelles.x[0]).toBeLessThanOrEqual(-2);
    expect(r.echelles.x[1]).toBe(10);
    expect(r.echelles.y[1]).toBe(40);
  });

  test('radar : l’échelle radiale suit les bornes', async ({ page }) => {
    await ouvrir(page, etat('radar', REGIONS.slice(0, 4), 'region', 'taux'));
    await page.click('#axes-details > summary');
    await page.fill('#axis-min', '0');
    await page.fill('#axis-max', '40');
    await generer(page);
    const r = await apercu(page, (x) => x.echelles.r?.[1] === 40);
    expect(r.echelles.r).toEqual([0, 40]);
  });

  test('carte : la somme remplace la moyenne, puis la valeur publiée', async ({ page }) => {
    await ouvrir(
      page,
      etat('map', DEPARTEMENTS, '', 'licences', {
        codeField: 'dep',
        palette: 'sequentialAscending',
      })
    );
    // Sans réglage : la moyenne des cinq départements (3 950 / 5).
    let code = await generer(page);
    expect(code).toContain('value="790"');

    await page.selectOption('#map-summary', 'sum');
    code = await generer(page);
    expect(code).toContain('map-summary="sum"');
    // DSFR Chart pose l'attribut en différé : on attend le chiffre, pas la balise.
    let r = await apercu(page, (x) => Number(x.synthese) === 3950);
    expect(Number(r.synthese)).toBe(3950);

    await page.selectOption('#map-summary', 'value');
    await page.fill('#map-summary-value', '310 480');
    code = await generer(page);
    expect(code).toContain('map-summary-value="310480"');
    r = await apercu(page, (x) => Number(x.synthese) === 310480);
    expect(Number(r.synthese)).toBe(310480);
  });

  test('téléphone (375 px) : pas de débordement horizontal, « Générer » reste à l’écran', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await ouvrir(page, etat('line', ANNEES, 'annee', 'taux'));
    await page.click('#axes-details > summary');
    await page.click('#add-reference-line-btn');
    await page.fill('#reference-value-0', '13');
    await page.click('#add-target-btn');
    await page.click('#color-map-details > summary');
    await page.click('#add-color-map-btn');
    const mesure = await page.evaluate(() => {
      const r = document.getElementById('generate-btn')!.getBoundingClientRect();
      return {
        debordement: document.documentElement.scrollWidth - window.innerWidth,
        haut: r.top,
        bas: r.bottom,
        hauteur: window.innerHeight,
      };
    });
    expect(mesure.debordement).toBeLessThanOrEqual(0);
    expect(mesure.haut).toBeGreaterThanOrEqual(0);
    expect(mesure.bas).toBeLessThanOrEqual(mesure.hauteur);
    await generer(page);
    await apercu(page, aDesEchelles);
  });

  test('bureau : la page ne défile pas, le volet défile seul', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await ouvrir(page, etat('line', ANNEES, 'annee', 'taux'));
    const avant = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight
    );
    await page.click('#axes-details > summary');
    for (let i = 0; i < 3; i++) await page.click('#add-reference-line-btn');
    for (let i = 0; i < 3; i++) await page.click('#add-target-btn');
    await page.click('#color-map-details > summary');
    for (let i = 0; i < 3; i++) await page.click('#add-color-map-btn');
    const apres = await page.evaluate(() => ({
      page: document.documentElement.scrollHeight - window.innerHeight,
      volet: (() => {
        const v = document.querySelector('.builder-scroll')!;
        return v.scrollHeight - v.clientHeight;
      })(),
    }));
    // Neuf lignes de plus dans le volet : la hauteur de la PAGE n'a pas bougé.
    expect(apres.page).toBe(avant);
    expect(apres.volet).toBeGreaterThan(0);
    await expect(page.locator('#generate-btn')).toBeInViewport();
  });
});

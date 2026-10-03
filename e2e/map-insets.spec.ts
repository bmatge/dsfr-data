import { test, expect, type Page } from '@playwright/test';

/**
 * BUG-034 (banc d'essai open-data-viz, #1229) — un encart de carte clonait la
 * couche entière : chaque encart traçait TOUTES les entités, parfois en
 * double, et gardait les anciennes après un filtre.
 *
 * Ce que seul un vrai navigateur prouve : l'ORDRE d'initialisation des cartes
 * (chacune attend sa visibilité, puis l'import de Leaflet), d'où venait le
 * doublon, et les formes réellement posées sur chaque carte Leaflet. Les
 * tests unitaires (`tests/map-inset-clone.test.ts`) tiennent la logique sur
 * une carte factice.
 *
 * Les comptes se lisent sur les objets que Leaflet a posés (`eachLayer`) et
 * sur les formes du DOM, carte par carte : une forme d'encart n'est jamais
 * comptée avec celles de la carte principale.
 */

interface EtatCarte {
  carte: string;
  /** Lignes reçues par la couche. */
  lignes: number;
  /** `getRenderedCount()` de la couche. */
  tracees: number;
  /** Objets Leaflet posés sur la carte (cercles, marqueurs, formes), grappes exclues. */
  posees: number;
  /** Points projetés par la carte de chaleur. */
  chaleur: number;
  /** Rayons des cercles posés, en pixels. */
  rayons: number[];
  /** Couleurs de remplissage distinctes des formes posées. */
  couleurs: string[];
  /** Résumé des couches dans la description lue par les lecteurs d'écran. */
  description: string;
}

/** Relève, pour la carte hôte puis chacun de ses encarts, ce qui est tracé. */
function etat(page: Page, id: string): Promise<EtatCarte[]> {
  return page.evaluate((idHote) => {
    interface Couche extends Element {
      _data?: unknown[];
      getRenderedCount(): number;
    }
    interface Forme {
      getLatLng?: () => unknown;
      getAllChildMarkers?: () => unknown;
      getRadius?: () => number;
      feature?: unknown;
      _heat?: unknown;
      _latlngs?: unknown[];
      options?: { fillColor?: string };
    }
    interface Carte extends Element {
      getLeafletMap(): { eachLayer(fn: (l: Forme) => void): void } | null;
    }
    const hote = document.getElementById(idHote) as unknown as Carte;
    const cartes = [hote, ...(hote.querySelectorAll('dsfr-data-map') as NodeListOf<Carte>)];
    return cartes.map((c) => {
      const couches = [...c.querySelectorAll<Couche>('dsfr-data-map-layer')].filter(
        (l) => l.closest('dsfr-data-map') === c
      );
      let posees = 0;
      let chaleur = 0;
      const rayons: number[] = [];
      const couleurs = new Set<string>();
      c.getLeafletMap()?.eachLayer((l) => {
        if (l._heat && l._latlngs) {
          chaleur = l._latlngs.length;
          return;
        }
        if (l.getAllChildMarkers) return;
        if (!l.getLatLng && !l.feature) return;
        posees++;
        if (l.getRadius) rayons.push(Math.round(l.getRadius() * 10) / 10);
        if (l.options?.fillColor) couleurs.add(l.options.fillColor);
      });
      const description = c.querySelector(':scope > .dsfr-data-map__sr-only')?.textContent ?? '';
      return {
        carte: c.getAttribute('name') ?? c.id,
        lignes: couches[0]?._data?.length ?? 0,
        tracees: couches[0]?.getRenderedCount() ?? 0,
        posees,
        chaleur,
        rayons,
        couleurs: [...couleurs].sort(),
        description: /Couches : [^.]*\./.exec(description)?.[0] ?? '',
      };
    });
  }, id);
}

/**
 * Amène la carte et chacun de ses encarts à l'écran : une carte ne
 * s'initialise qu'à la visibilité, encarts compris.
 */
async function montrer(page: Page, id: string) {
  await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  await expect(page.locator(`#${id} > .leaflet-container`)).toBeVisible({ timeout: 10_000 });
  const encarts = page.locator(`#${id} dsfr-data-map-inset`);
  for (let i = 0; i < (await encarts.count()); i++) {
    await encarts.nth(i).scrollIntoViewIfNeeded();
    await expect(encarts.nth(i).locator('.leaflet-container')).toBeVisible({ timeout: 10_000 });
  }
}

/** Les comptes posés, carte par carte : `{ Points: 4, 'Encart — Guadeloupe': 1, … }`. */
async function posees(page: Page, id: string): Promise<Record<string, number>> {
  return Object.fromEntries((await etat(page, id)).map((c) => [c.carte, c.posees]));
}

/** Coche ou décoche, dans la facette `#f`, la case dont le libellé commence par `valeur`. */
async function basculer(page: Page, valeur: string) {
  const trouve = await page.evaluate((v) => {
    const cases = [...document.querySelectorAll<HTMLInputElement>('#f input[type=checkbox]')];
    const cible = cases.find((c) =>
      (c.closest('.fr-checkbox-group')?.textContent ?? '').trim().startsWith(v)
    );
    cible?.click();
    return !!cible;
  }, valeur);
  expect(trouve, `case « ${valeur} » de la facette`).toBe(true);
}

test.beforeEach(async ({ page }) => {
  // Aucune tuile : la page ne touche aucun serveur tiers.
  await page.route('**/tuiles-absentes/**', (route) => route.abort());
});

test('page du banc : chaque encart trace les entités de son emprise, une fois, à jour après un filtre', async ({
  page,
}) => {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto('/e2e/map-insets.html');
  await montrer(page, 'm');

  // Quatre points : deux en métropole, un à La Réunion, un en Guadeloupe.
  // Avant le correctif : 4 dans chaque encart, et 8 dans ceux qui s'étaient
  // initialisés avant la carte hôte.
  await expect
    .poll(() => posees(page, 'm'))
    .toEqual({
      Points: 4,
      'Encart — Guadeloupe': 1,
      'Encart — Martinique': 0,
      'Encart — Guyane': 0,
      'Encart — La Réunion': 1,
      'Encart — Mayotte': 0,
    });
  // Les formes du DOM disent la même chose que Leaflet : aucune forme en trop.
  await expect(page.locator('#m > .dsfr-data-map__container path.encart-cercle')).toHaveCount(4);
  await expect(page.locator('#m dsfr-data-map-inset path.encart-cercle')).toHaveCount(2);

  // Filtre t=a : les deux points de métropole. Avant le correctif, les
  // encarts doublés en gardaient 6 (les 4 anciens et les 2 nouveaux).
  await basculer(page, 'a');
  await expect
    .poll(() => posees(page, 'm'))
    .toEqual({
      Points: 2,
      'Encart — Guadeloupe': 0,
      'Encart — Martinique': 0,
      'Encart — Guyane': 0,
      'Encart — La Réunion': 0,
      'Encart — Mayotte': 0,
    });
  await expect(page.locator('#m dsfr-data-map-inset path.encart-cercle')).toHaveCount(0);

  // Filtre retiré : retour à l'état de départ, sans rien d'accumulé.
  await basculer(page, 'a');
  await expect
    .poll(() => posees(page, 'm'))
    .toEqual({
      Points: 4,
      'Encart — Guadeloupe': 1,
      'Encart — Martinique': 0,
      'Encart — Guyane': 0,
      'Encart — La Réunion': 1,
      'Encart — Mayotte': 0,
    });

  // La carte hôte redit « prête » à toutes ses couches (c'est ce qu'elle
  // faisait aux couches des encarts, selon l'ordre d'initialisation) : rien
  // ne doit être tracé une seconde fois.
  await page.evaluate(() => {
    for (const couche of document.querySelectorAll('#m dsfr-data-map-layer')) {
      (couche as unknown as { _onMapReady(): void })._onMapReady();
    }
  });
  await expect
    .poll(() => posees(page, 'm'))
    .toEqual({
      Points: 4,
      'Encart — Guadeloupe': 1,
      'Encart — Martinique': 0,
      'Encart — Guyane': 0,
      'Encart — La Réunion': 1,
      'Encart — Mayotte': 0,
    });
  await expect(page.locator('#m dsfr-data-map-inset path.encart-cercle')).toHaveCount(2);

  // Filtre t=b : les deux points d'outre-mer, un par encart — puis retrait.
  // La couche de la carte hôte retrace AVANT celles des encarts : sa
  // description se compose donc pendant que les encarts montrent encore
  // l'état précédent (ici un cercle chacun), le cas où elle les recomptait.
  await basculer(page, 'b');
  await expect
    .poll(() => posees(page, 'm'))
    .toEqual({
      Points: 2,
      'Encart — Guadeloupe': 1,
      'Encart — Martinique': 0,
      'Encart — Guyane': 0,
      'Encart — La Réunion': 1,
      'Encart — Mayotte': 0,
    });
  await basculer(page, 'b');
  await expect.poll(async () => (await posees(page, 'm')).Points).toBe(4);

  // La description lue par les lecteurs d'écran : la carte principale compte
  // ses quatre cercles UNE fois (elle en annonçait six fois quatre), chaque
  // encart compte ce qu'il montre, et un encart vide ne dit rien.
  const cartes = await etat(page, 'm');
  expect(cartes.map((c) => c.description)).toEqual([
    'Couches : 4 cercles.',
    'Couches : 1 cercles.',
    '',
    '',
    'Couches : 1 cercles.',
    '',
  ]);
  // Chaque couche a bien reçu les quatre lignes : c'est le TRACÉ qui est borné.
  expect(cartes.map((c) => c.lignes)).toEqual([4, 4, 4, 4, 4, 4]);

  expect(erreurs).toEqual([]);
});

test('une seule requête pour la source, quel que soit le nombre de couches clonées', async ({
  page,
}) => {
  let requetes = 0;
  page.on('request', (r) => {
    if (r.url().includes('/e2e/map-insets-points.json')) requetes++;
  });
  await page.goto('/e2e/map-insets.html');
  for (const id of ['m-grappes', 'm-proportionnels', 'm-formes', 'm-chaleur', 'm-temps']) {
    await montrer(page, id);
  }
  await expect.poll(async () => (await etat(page, 'm-temps'))[2].lignes).toBe(6);
  // Six couches d'origine et onze clones lisent cette source : une requête.
  expect(requetes).toBe(1);
});

test('grappes, cercles proportionnels, formes en classes, chaleur : l’emprise, avec les échelles du jeu entier', async ({
  page,
}) => {
  await page.goto('/e2e/map-insets.html');

  // Marqueurs en grappes : un en Guadeloupe, deux à La Réunion.
  await montrer(page, 'm-grappes');
  await expect
    .poll(async () => (await etat(page, 'm-grappes')).map((c) => c.tracees))
    .toEqual([6, 1, 2]);
  await expect(
    page.locator('#m-grappes dsfr-data-map-inset[territory="la-reunion"] .dsfr-data-map__marker')
  ).toHaveCount(2);
  await expect(
    page.locator('#m-grappes dsfr-data-map-inset[territory="guadeloupe"] .dsfr-data-map__marker')
  ).toHaveCount(1);

  // Cercles proportionnels (aire, radius-max 20) : le maximum du jeu est 160
  // (Pointe-à-Pitre). Saint-Pierre (40) fait 10 px sur la carte principale ET
  // dans l'encart ; une échelle recalculée sur les deux seuls points de l'île
  // (maximum 40) lui donnerait 20 px, et 14,1 à Saint-Denis au lieu de 7,1.
  await montrer(page, 'm-proportionnels');
  await expect
    .poll(async () => (await etat(page, 'm-proportionnels')).map((c) => c.rayons))
    .toEqual([[5, 10, 15, 7.1, 10, 20], [20], [7.1, 10]]);

  // Formes en trois classes d'égale étendue, de 10 à 160 : Saint-Denis (20) et
  // Saint-Pierre (40) sont dans la MÊME classe, la première. Recalculées sur
  // les deux zones de l'île (de 20 à 40), les classes les sépareraient.
  await montrer(page, 'm-formes');
  await expect
    .poll(async () => (await etat(page, 'm-formes')).map((c) => c.posees))
    .toEqual([6, 1, 2]);
  const [principale, guadeloupe, reunion] = await etat(page, 'm-formes');
  expect(principale.couleurs).toHaveLength(3);
  expect(reunion.couleurs).toHaveLength(1);
  expect(guadeloupe.couleurs).toHaveLength(1);
  expect(principale.couleurs).toContain(reunion.couleurs[0]);
  expect(principale.couleurs).toContain(guadeloupe.couleurs[0]);
  expect(reunion.couleurs[0]).not.toBe(guadeloupe.couleurs[0]);
  await expect(
    page.locator('#m-formes dsfr-data-map-inset[territory="la-reunion"] path.encart-forme')
  ).toHaveCount(2);

  // Carte de chaleur : un seul canevas, on compte les points projetés.
  await montrer(page, 'm-chaleur');
  await expect
    .poll(async () => (await etat(page, 'm-chaleur')).map((c) => c.chaleur))
    .toEqual([6, 1, 2]);
});

test('pas de temps : les encarts suivent la timeline, même désignée par `for`', async ({
  page,
}) => {
  await page.goto('/e2e/map-insets.html');
  await montrer(page, 'm-temps');

  // Premier pas (2023) : Paris, Saint-Denis, Pointe-à-Pitre.
  await expect
    .poll(async () => (await etat(page, 'm-temps')).map((c) => c.posees))
    .toEqual([3, 1, 1]);

  // Pas suivant (2024) : Lyon, Marseille, Saint-Pierre — plus rien en Guadeloupe.
  await page.locator('#m-temps dsfr-data-map-timeline').getByLabel('Image suivante').click();
  await expect
    .poll(async () => (await etat(page, 'm-temps')).map((c) => c.posees))
    .toEqual([3, 0, 1]);
});

test('un encart agrandi retrace sa nouvelle emprise', async ({ page }) => {
  await page.goto('/e2e/map-insets.html');
  await montrer(page, 'm-recadrage');

  // Zoom 10 sur Saint-Denis : Saint-Pierre est hors du cadre de 160 px.
  await expect
    .poll(async () => (await etat(page, 'm-recadrage')).map((c) => c.posees))
    .toEqual([6, 1]);

  // L'encart passe à 900 px de haut : Saint-Pierre entre dans le cadre.
  await page.evaluate(() =>
    document.getElementById('encart-saint-denis')!.setAttribute('height', '900px')
  );
  await expect
    .poll(async () => (await etat(page, 'm-recadrage')).map((c) => c.posees))
    .toEqual([6, 2]);
});

test('couche en bbox : l’encart ne commande pas la source avec son emprise', async ({ page }) => {
  const POINTS = [
    { nom: 'Paris', position: { lat: 48.85, lon: 2.35 } },
    { nom: 'Lyon', position: { lat: 45.76, lon: 4.83 } },
    { nom: 'Pointe-à-Pitre', position: { lat: 16.24, lon: -61.53 } },
  ];
  /** Bord ouest de chaque clause de zone visible reçue par le faux portail. */
  const ouests: number[] = [];
  await page.route('https://exemple.invalid/**', async (route) => {
    const where = new URL(route.request().url()).searchParams.get('where') ?? '';
    const zone = /in_bbox\(position,\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/.exec(
      where
    );
    let results = POINTS;
    if (zone) {
      const [sud, ouest, nord, est] = zone.slice(1).map(Number);
      ouests.push(ouest);
      results = POINTS.filter(
        (p) =>
          p.position.lat >= sud &&
          p.position.lat <= nord &&
          p.position.lon >= ouest &&
          p.position.lon <= est
      );
    }
    await route.fulfill({ json: { total_count: results.length, results } });
  });
  await page.goto('/e2e/map-insets-bbox.html');
  await montrer(page, 'm-bbox');

  // La carte principale a demandé SA zone visible : Paris et Lyon.
  const cercles = page.locator('#m-bbox > .dsfr-data-map__container path.encart-bbox');
  await expect.poll(() => ouests.length).toBeGreaterThan(0);
  await expect(cercles).toHaveCount(2);
  // Le temps qu'une commande d'encart serait partie (anti-rebond de 50 ms),
  // puis revenue : la carte principale garde ses deux points.
  await page.waitForTimeout(600);
  await expect(cercles).toHaveCount(2);
  // Aucune clause n'a porté sur la Guadeloupe (61° ouest) : avant le
  // correctif, le clone poussait son emprise sous la même clé que la couche
  // d'origine, et la source ne rendait plus que Pointe-à-Pitre.
  expect(ouests.filter((ouest) => ouest < -30)).toEqual([]);
});

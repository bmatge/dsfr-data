import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #1288, proposition A — une source en panne est dite PARTOUT, et aucun
 * afficheur ne garde à l'écran une ligne de l'ancien jeu.
 *
 * Les tests unitaires (`tests/panne-partout.test.ts`) portent le balisage et
 * les textes par cause. Ce spec porte ce qu'ils ne voient pas, sur de vrais
 * composants (DSFR Chart depuis node_modules, Leaflet) :
 *
 * - le RÉSEAU : un faux serveur qui passe de 200 à 503 (puis 404, puis un
 *   réseau réellement coupé), et qui revient ;
 * - ce qui est TRACÉ : les formes Leaflet de la carte hôte et de son encart,
 *   les grappes, le canevas de la carte de chaleur ;
 * - le FICHIER : un export qui sort — ou non — du navigateur ;
 * - le FOCUS : un bouton désactivé qui garde le focus qu'il portait ;
 * - les BOÎTES : le message centré sur la carte, la ligne d'état dans sa
 *   largeur, aucun défilement horizontal à 375 px ;
 * - les CONTRASTES des phrases ajoutées.
 *
 * Déterministe : toutes les données viennent de `page.route`, les tuiles sont
 * coupées. Seule la feuille DSFR vient du CDN, comme `layout-grid.spec.ts`.
 *
 * Captures : `PANNE_1288_CAPTURES=<dossier>` enregistre chaque bloc pendant la
 * panne (hors dépôt, jamais en CI).
 */

const BUREAU = { width: 1280, height: 900 };
const TELEPHONE = { width: 375, height: 800 };
const LARGEURS = [
  ['bureau', BUREAU],
  ['375px', TELEPHONE],
] as const;
const CAPTURES = process.env.PANNE_1288_CAPTURES;

const JEUX: Record<string, unknown[]> = {
  aides: [
    { region: 'Auvergne-Rhône-Alpes', beneficiaires: 2412, montant: 118.4 },
    { region: 'Île-de-France', beneficiaires: 1987, montant: 96 },
    { region: 'Occitanie', beneficiaires: 1640, montant: 82.3 },
    { region: 'Nouvelle-Aquitaine', beneficiaires: 1502, montant: 74.1 },
  ],
  bornes: [
    { nom: 'Paris', lat: 48.85, lon: 2.35 },
    { nom: 'Lyon', lat: 45.76, lon: 4.83 },
    { nom: 'Toulouse', lat: 43.6, lon: 1.44 },
    { nom: 'Pointe-à-Pitre', lat: 16.24, lon: -61.53 },
  ],
  stations: [
    { nom: 'Nantes', lat: 47.22, lon: -1.55 },
    { nom: 'Lille', lat: 50.63, lon: 3.06 },
  ],
  annuaire: [
    { nom: 'Atelier du Nord', type: 'PME' },
    { nom: 'Forge de Lyon', type: 'PME' },
    { nom: 'Acier Atlantique', type: 'ETI' },
    { nom: 'Usine du Sud', type: 'ETI' },
    { nom: 'Fonderie Est', type: 'Grande entreprise' },
  ],
};
const COMMUNES = Array.from({ length: 13 }, (_, i) => ({
  nom: `Commune ${String(i + 1).padStart(2, '0')}`,
  population: 1000 * (i + 1),
}));

/**
 * Le faux serveur. `pannes` : nom du jeu → code HTTP ; `pages:4` vise une
 * seule page d'un jeu paginé ; `reseau` coupe tout (les réponses viennent de
 * `page.route`, que `context.setOffline` seul ne ferait pas échouer) ;
 * `lenteur` fait attendre chaque réponse (en ms) — un service en panne répond
 * rarement dans l'instant, et c'est pendant l'attente qu'un bouton désactivé
 * trop tôt perd son focus. Vidé, tout répond 200 sans délai.
 */
type Pannes = Record<string, number>;

async function serveur(page: Page): Promise<Pannes> {
  const pannes: Pannes = {};
  const refus = (status: number) => ({
    status,
    contentType: 'application/json',
    body: '{"error":"panne"}',
  });
  await page.route('**/e2e/panne-partout/**', async (route) => {
    const url = new URL(route.request().url());
    const nom = url.pathname.split('/').pop() as string;
    if (pannes.lenteur) await new Promise((suite) => setTimeout(suite, pannes.lenteur));
    if (pannes.reseau) return route.abort('internetdisconnected');
    if (pannes[nom]) return route.fulfill(refus(pannes[nom]));
    if (nom.startsWith('pages')) {
      const p = Number(url.searchParams.get('page') ?? 1);
      const taille = Number(url.searchParams.get('page_size') ?? 3);
      if (pannes[`${nom}:${p}`]) return route.fulfill(refus(pannes[`${nom}:${p}`]));
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: COMMUNES.slice((p - 1) * taille, p * taille),
          meta: { page: p, page_size: taille, total: COMMUNES.length },
        }),
      });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(JEUX[nom]) });
  });
  await page.route('**/e2e/tuiles-absentes/**', (route) =>
    route.fulfill({ status: 404, body: '' })
  );
  return pannes;
}

async function ouvrir(
  page: Page,
  viewport: { width: number; height: number },
  requete = ''
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto(`/e2e/panne-partout.html${requete}`);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).fontFamily))
    .toContain('Marianne');
  // Tout est tracé : le graphique, les quatre cartes, les listes, les filtres.
  // Une carte ne s'initialise qu'à l'approche de l'écran : chacune y est
  // amenée, et le premier rendu a le temps d'un poste chargé.
  const pret = { timeout: 20_000 };
  await expect(page.locator('#g canvas').first()).toBeVisible(pret);
  for (const id of ['carte-seule', 'carte-deux', 'carte-grappes', 'carte-chaleur']) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  }
  await expect(formes(page, 'carte-seule', 'forme-seule')).toHaveCount(4, pret);
  await expect(formes(page, 'carte-deux', 'forme-bornes')).toHaveCount(4, pret);
  await expect(formes(page, 'carte-deux', 'forme-stations')).toHaveCount(2, pret);
  await expect(page.locator('#carte-grappes .leaflet-marker-icon')).not.toHaveCount(0, pret);
  await expect(page.locator('#carte-chaleur canvas.leaflet-heatmap-layer')).toHaveCount(1, pret);
  await page.locator('#page').scrollIntoViewIfNeeded();
  await expect(page.locator('#liste tbody tr')).toHaveCount(3);
  await expect(page.locator('#fiches .fiche')).toHaveCount(3);
  await expect(page.locator('#resultats tbody tr')).toHaveCount(5);
  // Le tableau équivalent est dans un accordéon : ouvert, pour le voir.
  await page.evaluate(() =>
    document.querySelectorAll('dsfr-data-a11y details').forEach((d) => d.setAttribute('open', ''))
  );
}

/** Formes d'une couche tracées sur la carte HÔTE (hors encarts). */
const formes = (page: Page, carte: string, classe: string) =>
  page.locator(`#${carte} > .dsfr-data-map__container path.${classe}`);

/** Fait recharger des sources : c'est l'appel suivant qui tombe sur la panne. */
const recharger = (page: Page, ...ids: string[]) =>
  page.evaluate((liste) => {
    for (const id of liste)
      (document.getElementById(id) as HTMLElement & { reload(): void }).reload();
  }, ids);

async function capturer(page: Page, selecteur: string, nom: string): Promise<void> {
  if (!CAPTURES) return;
  mkdirSync(CAPTURES, { recursive: true });
  await page.locator(selecteur).screenshot({ path: join(CAPTURES, `${nom}.png`) });
}

/** Rapport de contraste WCAG entre la couleur d'un texte et le fond réellement peint dessous. */
const contraste = (page: Page, selecteur: string): Promise<number> =>
  page
    .locator(selecteur)
    .first()
    .evaluate((el) => {
      const rgb = (c: string): number[] | null => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(',').map((x) => parseFloat(x));
        return p.length > 3 && p[3] === 0 ? null : p.slice(0, 3);
      };
      const lum = (c: number[]): number => {
        const [r, g, b] = c.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      let fond: number[] | null = null;
      for (let n: Element | null = el; n && !fond; n = n.parentElement) {
        fond = rgb(getComputedStyle(n).backgroundColor);
      }
      const a = lum(rgb(getComputedStyle(el).color) as number[]);
      const b = lum(fond ?? [255, 255, 255]);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });

/** La page ne défile pas horizontalement. */
const sansDefilement = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const [nom, viewport] of LARGEURS) {
  test.describe(`source en panne — ${nom}`, () => {
    test('tableau équivalent : retiré, export désactivé sans perdre le focus, aucun fichier', async ({
      page,
    }) => {
      const pannes = await serveur(page);
      await ouvrir(page, viewport);
      const bouton = page.locator('#acc button', { hasText: 'Télécharger en CSV' });
      await expect(page.locator('#acc tbody tr')).toHaveCount(4);

      // L'export marche tant que la source répond : le témoin du « aucun fichier ».
      const [fichier] = await Promise.all([page.waitForEvent('download'), bouton.click()]);
      const csv = readFileSync((await fichier.path()) as string, 'utf8');
      expect(csv).toContain('Occitanie;1640;82.3');

      // Le service met du temps à refuser : le bloc passe par « chargement »
      // avant la panne, et le bouton doit garder son focus tout du long.
      await bouton.focus();
      pannes.aides = 503;
      pannes.lenteur = 400;
      await recharger(page, 'aides');

      await expect(page.locator('#acc table')).toHaveCount(0);
      await expect(page.locator('#acc .dsfr-data-a11y__unavailable')).toHaveText(
        'Données momentanément indisponibles. Le tableau et le téléchargement reviendront avec les données.'
      );
      await expect(bouton).toHaveAttribute('aria-disabled', 'true');
      await expect(bouton).toBeFocused();
      await expect(bouton).toHaveAttribute('aria-describedby', 'acc-unavailable');
      await expect(page.locator('#acc-desc')).toHaveText(
        'Données du graphique momentanément indisponibles.'
      );
      // Le graphique visé décrit par cette phrase, et non plus par « 4 lignes »
      await expect(page.locator('#g')).toHaveAttribute('aria-describedby', /acc-desc/);
      // Aucun chiffre de l'ancien jeu dans la section
      expect(await page.locator('#acc section').innerText()).not.toMatch(/\d/);

      // Entrée sur le bouton désactivé : aucun fichier ne sort.
      let sorti = false;
      page.once('download', () => (sorti = true));
      await page.keyboard.press('Enter');
      // `force` : Playwright n'actionne pas de lui-même un contrôle aria-disabled
      await bouton.click({ force: true });
      await page.waitForTimeout(400);
      expect(sorti).toBe(false);

      // La panne est annoncée par le graphique, pas une fois de plus ici.
      await expect(page.locator('#g [role="status"]')).toHaveCount(1);
      await expect(page.locator('#acc [role="status"]')).toHaveCount(0);
      expect(await contraste(page, '#acc .dsfr-data-a11y__unavailable')).toBeGreaterThanOrEqual(
        4.5
      );
      expect(await sansDefilement(page)).toBe(true);
      await capturer(page, '#s-graphique', `tableau-panne-${nom}`);

      // Le cadre officiel n'a pas ce défaut : son tableau et son export
      // partent avec le graphique, remplacés par le message de panne.
      await expect(page.locator('#g-cadre .dsfr-data-status--source-error')).toHaveCount(1);
      await expect(page.locator('#g-cadre table')).toHaveCount(0);
      await expect(page.locator('#g-cadre button', { hasText: 'Télécharger' })).toHaveCount(0);

      // Le service revient : « Réessayer » du graphique rend aussi le tableau.
      delete pannes.aides;
      delete pannes.lenteur;
      await page.locator('#g button.dsfr-data-status__retry').click();
      await expect(page.locator('#acc tbody tr')).toHaveCount(4);
      await expect(bouton).not.toHaveAttribute('aria-disabled', /.*/);
      await expect(page.locator('#acc .dsfr-data-a11y__unavailable')).toHaveCount(0);
      const [retour] = await Promise.all([page.waitForEvent('download'), bouton.click()]);
      expect(readFileSync((await retour.path()) as string, 'utf8')).toContain(
        'Occitanie;1640;82.3'
      );
    });

    test('carte : la couche en panne est vidée partout, message centré, fond manipulable', async ({
      page,
    }) => {
      const pannes = await serveur(page);
      await ouvrir(page, viewport);
      await expect(page.locator('#carte-seule dsfr-data-map-inset path.forme-seule')).toHaveCount(
        1
      );
      await expect(page.locator('#carte-seule-desc')).toContainText('Couches : 4 cercles.');

      pannes.bornes = 503;
      await recharger(page, 'bornes');

      // Formes de la carte hôte, clone de l'encart, grappes, carte de chaleur, légende.
      await expect(formes(page, 'carte-seule', 'forme-seule')).toHaveCount(0);
      await expect(page.locator('#carte-seule dsfr-data-map-inset path.forme-seule')).toHaveCount(
        0
      );
      await expect(page.locator('#carte-grappes .leaflet-marker-icon')).toHaveCount(0);
      await expect(page.locator('#carte-chaleur canvas.leaflet-heatmap-layer')).toHaveCount(0);
      await expect(page.locator('#carte-seule dsfr-data-map-legend li')).toHaveCount(0);

      // Le message : le gabarit commun, dans la carte hôte seulement.
      const bloc = page.locator('#carte-seule > .dsfr-data-map__container .dsfr-data-map__error');
      await expect(bloc.locator('.dsfr-data-status__title')).toHaveText(
        'Données momentanément indisponibles'
      );
      await expect(bloc.locator('.dsfr-data-status__detail')).toHaveText(
        'Le service qui publie ces chiffres ne répond pas pour l’instant.'
      );
      await expect(bloc).toHaveAttribute('role', 'status');
      await expect(
        page.locator('#carte-seule dsfr-data-map-inset .dsfr-data-map__error')
      ).toHaveCount(0);
      await expect(page.locator('#carte-seule .dsfr-data-map__layer-status')).toHaveCount(0);

      // La description lue ne compte plus de marqueurs, et dit la panne.
      const description = page.locator('#carte-seule-desc');
      await expect(description).toContainText('Données momentanément indisponibles.');
      expect(await description.innerText()).not.toMatch(/Couches|\d/);
      // Le tableau équivalent de la carte suit.
      await expect(page.locator('#acc-carte table')).toHaveCount(0);
      await expect(page.locator('#acc-carte-desc')).toHaveText(
        'Données de la carte momentanément indisponibles.'
      );

      // Centré sur le fond, dans la carte, sans la déborder.
      const carte = (await page
        .locator('#carte-seule > .dsfr-data-map__container')
        .boundingBox()) as { x: number; y: number; width: number; height: number };
      const boite = (await bloc.boundingBox()) as typeof carte;
      expect(Math.abs(boite.x + boite.width / 2 - (carte.x + carte.width / 2))).toBeLessThan(2);
      expect(boite.x).toBeGreaterThanOrEqual(carte.x);
      expect(boite.x + boite.width).toBeLessThanOrEqual(carte.x + carte.width + 0.5);
      expect(boite.y).toBeGreaterThanOrEqual(carte.y);
      expect(boite.y + boite.height).toBeLessThanOrEqual(carte.y + carte.height + 0.5);
      expect(
        await contraste(page, '#carte-seule .dsfr-data-map__error .dsfr-data-status__detail')
      ).toBeGreaterThanOrEqual(4.5);
      expect(await sansDefilement(page)).toBe(true);
      await capturer(page, '#s-carte-seule', `carte-seule-panne-${nom}`);

      // Le fond reste manipulable : le zoom répond, sous le message.
      const zoom = () =>
        page.evaluate(() =>
          (
            document.getElementById('carte-seule') as HTMLElement & {
              getLeafletMap(): { getZoom(): number };
            }
          )
            .getLeafletMap()
            .getZoom()
        );
      const avant = await zoom();
      await page
        .locator('#carte-seule > .dsfr-data-map__container .leaflet-control-zoom-in')
        .click();
      await expect.poll(zoom).toBe(avant + 1);
      // … et un clic sur « Détails techniques » n'est pas un clic sur la carte.
      await bloc.locator('summary').click();
      await expect(bloc.locator('details')).toContainText('Code HTTP : 503');
      await bloc.locator('summary').click();

      // « Réessayer » qui échoue encore : le message reste, rien ne revient.
      const retry = bloc.locator('button.dsfr-data-status__retry');
      await retry.click();
      await page.waitForTimeout(300);
      await expect(bloc).toBeVisible();
      await expect(formes(page, 'carte-seule', 'forme-seule')).toHaveCount(0);

      // Le service revient : tout est retracé, le focus passe à la carte.
      delete pannes.bornes;
      await retry.click();
      await expect(formes(page, 'carte-seule', 'forme-seule')).toHaveCount(4);
      await expect(page.locator('#carte-seule dsfr-data-map-inset path.forme-seule')).toHaveCount(
        1
      );
      await expect(page.locator('#carte-seule .dsfr-data-map__error')).toHaveCount(0);
      await expect(page.locator('#carte-seule > .dsfr-data-map__container')).toBeFocused();
      await expect(description).toContainText('Couches : 4 cercles.');
      await expect(page.locator('#carte-grappes .leaflet-marker-icon')).not.toHaveCount(0);
      await expect(page.locator('#carte-chaleur canvas.leaflet-heatmap-layer')).toHaveCount(1);
      await expect(page.locator('#carte-seule dsfr-data-map-legend li')).not.toHaveCount(0);
    });

    test('carte à deux couches : une ligne d’état nomme la couche en panne, l’autre trace toujours', async ({
      page,
    }) => {
      const pannes = await serveur(page);
      await ouvrir(page, viewport);

      pannes.bornes = 503;
      await recharger(page, 'bornes');

      await expect(formes(page, 'carte-deux', 'forme-bornes')).toHaveCount(0);
      await expect(formes(page, 'carte-deux', 'forme-stations')).toHaveCount(2);
      await expect(page.locator('#carte-deux .dsfr-data-map__error')).toHaveCount(0);

      const ligne = page.locator('#carte-deux > .dsfr-data-map__layer-status');
      await expect(ligne.locator('.dsfr-data-map__layer-status-text')).toHaveText(
        'Couche « Bornes de recharge » : données momentanément indisponibles.'
      );
      await expect(ligne).toHaveAttribute('role', 'status');
      const description = page.locator('#carte-deux-desc');
      await expect(description).toContainText('Couches : 2 cercles.');
      await expect(description).toContainText(
        'Couche « Bornes de recharge » : données momentanément indisponibles.'
      );

      // En bas de carte, dans sa largeur — le texte passe à la ligne à 375 px.
      const carte = (await page
        .locator('#carte-deux > .dsfr-data-map__container')
        .boundingBox()) as { x: number; y: number; width: number; height: number };
      const boite = (await ligne.boundingBox()) as typeof carte;
      expect(boite.x).toBeGreaterThanOrEqual(carte.x);
      expect(boite.x + boite.width).toBeLessThanOrEqual(carte.x + carte.width + 0.5);
      expect(boite.y + boite.height).toBeLessThanOrEqual(carte.y + carte.height + 0.5);
      expect(boite.y).toBeGreaterThan(carte.y + carte.height / 2);
      expect(
        await contraste(page, '#carte-deux .dsfr-data-map__layer-status-text')
      ).toBeGreaterThanOrEqual(4.5);
      expect(await sansDefilement(page)).toBe(true);
      await capturer(page, '#s-carte-deux', `carte-deux-panne-${nom}`);

      // « Réessayer » de la ligne : 44 px, et la couche revient.
      const retry = ligne.locator('button.dsfr-data-status__retry');
      expect(((await retry.boundingBox()) as { height: number }).height).toBeGreaterThanOrEqual(44);
      delete pannes.bornes;
      await retry.click();
      await expect(formes(page, 'carte-deux', 'forme-bornes')).toHaveCount(4);
      await expect(ligne).toHaveCount(0);
      await expect(description).toContainText('Couches : 4 cercles, 2 cercles.');

      // L'autre couche tombe SEULE à son tour : la ligne la nomme, elle.
      pannes.stations = 503;
      await recharger(page, 'stations');
      await expect(
        page.locator('#carte-deux > .dsfr-data-map__layer-status .dsfr-data-map__layer-status-text')
      ).toHaveText('Couche « Stations » : données momentanément indisponibles.');
      // Puis la première aussi : plus rien de tracé, le bloc central remplace la ligne.
      pannes.bornes = 503;
      await recharger(page, 'bornes');
      await expect(page.locator('#carte-deux .dsfr-data-map__error')).toHaveCount(1);
      await expect(page.locator('#carte-deux > .dsfr-data-map__layer-status')).toHaveCount(0);
    });

    test('pagination serveur : la page refusée est dite, la page affichée reste la précédente', async ({
      page,
    }) => {
      const pannes = await serveur(page);
      await ouvrir(page, viewport);

      for (const [id, ligne] of [
        ['liste', 'tbody tr td:first-child'],
        ['fiches', '.fiche'],
      ] as const) {
        const bloc = page.locator(`#${id}`);
        const numero = (n: number) => bloc.locator(`button[aria-label^="Page ${n}"]`);
        await numero(3).click();
        await expect(bloc.locator(ligne).first()).toContainText('Commune 07');

        pannes[`${id === 'liste' ? 'pages' : 'pages-fiches'}:4`] = 503;
        await numero(4).click();

        const encart = bloc.locator('.dsfr-data-status--page-error');
        await expect(encart.locator('.dsfr-data-status__title')).toHaveText(
          'La page 4 n’a pas pu être chargée. Vous consultez toujours la page 3.'
        );
        // Les lignes sont celles de la page 3 — pas une de la page 4, pas un message de panne.
        await expect(bloc.locator(ligne)).toHaveCount(3);
        await expect(bloc.locator(ligne).first()).toContainText('Commune 07');
        await expect(bloc.locator(ligne).last()).toContainText('Commune 09');
        await expect(bloc.locator('[aria-current="page"]')).toHaveText('3');
        await expect(bloc.locator('.dsfr-data-status--source-error')).toHaveCount(0);
        // Annoncé par la région live de la liste, pas par une seconde.
        await expect(bloc.locator('.fr-sr-only[aria-live]')).toHaveText(
          'La page 4 n’a pas pu être chargée. Vous consultez toujours la page 3.'
        );
        await expect(encart).not.toHaveAttribute('role', /.*/);
        expect(
          await contraste(page, `#${id} .dsfr-data-status--page-error .dsfr-data-status__title`)
        ).toBeGreaterThanOrEqual(4.5);
        expect(await sansDefilement(page)).toBe(true);
        await capturer(page, `#s-${id}`, `${id}-page-refusee-${nom}`);

        // Redemander la page 4 pendant la panne : même phrase, même page.
        await numero(4).click();
        await expect(encart.locator('.dsfr-data-status__title')).toContainText(
          'La page 4 n’a pas pu être chargée.'
        );
        await expect(bloc.locator(ligne).first()).toContainText('Commune 07');
        // Une autre page répond : elle s'affiche, l'encart part.
        await numero(2).click();
        await expect(bloc.locator(ligne).first()).toContainText('Commune 04');
        await expect(encart).toHaveCount(0);

        // Retour en page 3, nouvelle demande de la page 4, refusée ; le
        // service revient et le MÊME geste — redemander la page 4 — l'obtient.
        await numero(3).click();
        await expect(bloc.locator(ligne).first()).toContainText('Commune 07');
        await numero(4).click();
        await expect(encart).toHaveCount(1);
        delete pannes[`${id === 'liste' ? 'pages' : 'pages-fiches'}:4`];
        await numero(4).click();
        await expect(bloc.locator(ligne).first()).toContainText('Commune 10');
        await expect(bloc.locator('[aria-current="page"]')).toHaveText('4');
        await expect(encart).toHaveCount(0);
      }

      // Une panne qui n'est PAS un changement de page ne laisse aucune ligne.
      pannes.pages = 503;
      await recharger(page, 'pages');
      await expect(page.locator('#liste .dsfr-data-status--source-error')).toHaveCount(1);
      await expect(page.locator('#liste table')).toHaveCount(0);
    });

    test('facettes et recherche : désactivées, focus gardé, sélection retrouvée au retour', async ({
      page,
    }) => {
      const pannes = await serveur(page);
      await ouvrir(page, viewport);

      // Une sélection posée AVANT la panne : une facette, un terme.
      const pme = page.locator('#f .fr-checkbox-group', { hasText: 'PME' }).locator('input');
      await pme.check({ force: true });
      const champ = page.locator('#r input');
      await champ.fill('Forge');
      await expect(page.locator('#resultats tbody tr')).toHaveCount(1);
      await expect(page.locator('#r .dsfr-data-search-count')).toHaveText('1 résultat');
      await champ.focus();

      pannes.annuaire = 503;
      await recharger(page, 'annuaire');

      await expect(page.locator('#f .dsfr-data-filters-unavailable')).toHaveText(
        'Filtres momentanément indisponibles.'
      );
      await expect(page.locator('#r .dsfr-data-filters-unavailable')).toHaveText(
        'Filtres momentanément indisponibles.'
      );
      // Le champ garde le focus et son terme ; il n'est plus modifiable.
      await expect(champ).toBeFocused();
      await expect(champ).toHaveAttribute('aria-disabled', 'true');
      await expect(champ).toHaveJSProperty('readOnly', true);
      await expect(champ).toHaveValue('Forge');
      await page.keyboard.type('xyz');
      await expect(champ).toHaveValue('Forge');
      // Le compte datait du dernier chargement : il n'est plus là.
      await expect(page.locator('#r .dsfr-data-search-count')).toHaveCount(0);
      // Les facettes : désactivées, sans compteur, la case cochée le reste.
      const casesAria = await page
        .locator('#f input[type=checkbox]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('aria-disabled')));
      expect(casesAria).toEqual(['true', 'true', 'true']);
      expect(await page.locator('#f .dsfr-data-facets__group').first().innerText()).not.toMatch(
        /\d/
      );
      await expect(pme).toBeChecked();

      // Un geste ne fait rien : ni à la souris, ni au clavier.
      const eti = page.locator('#f .fr-checkbox-group', { hasText: 'ETI' });
      await eti.locator('label').click({ force: true });
      await eti.locator('input').focus();
      await page.keyboard.press('Space');
      await expect(eti.locator('input')).not.toBeChecked();
      await expect(pme).toBeChecked();
      // La raison n'est pas une annonce de plus : le tableau en aval dit la panne.
      await expect(page.locator('#f [role="status"], #r [role="status"]')).toHaveCount(0);
      await expect(page.locator('#resultats .dsfr-data-status--source-error')).toHaveCount(1);
      expect(await contraste(page, '#f .dsfr-data-filters-unavailable')).toBeGreaterThanOrEqual(
        4.5
      );
      expect(await sansDefilement(page)).toBe(true);
      await capturer(page, '#s-filtres', `filtres-panne-${nom}`);

      // Le service revient : la sélection d'avant la panne s'applique de nouveau.
      delete pannes.annuaire;
      await page.locator('#resultats button.dsfr-data-status__retry').click();
      await expect(page.locator('#resultats tbody tr')).toHaveCount(1);
      await expect(page.locator('#resultats tbody tr')).toContainText('Forge de Lyon');
      await expect(pme).toBeChecked();
      await expect(champ).toHaveValue('Forge');
      await expect(champ).toHaveJSProperty('readOnly', false);
      await expect(page.locator('.dsfr-data-filters-unavailable')).toHaveCount(0);
      await expect(page.locator('#r .dsfr-data-search-count')).toHaveText('1 résultat');
      // … et les filtres répondent de nouveau.
      await champ.fill('');
      await expect(page.locator('#resultats tbody tr')).toHaveCount(2);
    });

    test('avec un bandeau : une seule annonce, un seul « Réessayer » par source', async ({
      page,
    }) => {
      const pannes = await serveur(page);
      await ouvrir(page, viewport, '?bandeau=1');
      await page.locator('#liste button[aria-label^="Page 3"]').click();
      await expect(page.locator('#liste tbody tr td').first()).toContainText('Commune 07');

      Object.assign(pannes, { aides: 503, bornes: 503, annuaire: 503, 'pages:4': 503 });
      await recharger(page, 'aides', 'bornes', 'annuaire');
      await page.locator('#liste button[aria-label^="Page 4"]').click();

      await expect(page.locator('#bandeau [role="status"]')).toHaveCount(1);
      await expect(page.locator('#carte-seule .dsfr-data-map__error')).toHaveCount(1);
      await expect(page.locator('#carte-deux > .dsfr-data-map__layer-status')).toHaveCount(1);
      await expect(page.locator('#liste .dsfr-data-status--page-error')).toHaveCount(1);
      await expect(page.locator('#acc .dsfr-data-a11y__unavailable')).toHaveCount(1);
      await expect(page.locator('.dsfr-data-filters-unavailable')).toHaveCount(2);

      // Hors du bandeau : aucune région d'annonce de panne, aucun « Réessayer ».
      await expect(
        page.locator(
          '#page [role="status"]:is(.dsfr-data-status--source-error, .dsfr-data-map__layer-status, .dsfr-data-a11y__unavailable, .dsfr-data-status--page-error, .dsfr-data-filters-unavailable)'
        )
      ).toHaveCount(0);
      await expect(page.locator('#page section button.dsfr-data-status__retry')).toHaveCount(0);
      // Les phrases, elles, restent écrites dans chaque bloc.
      await expect(page.locator('#carte-deux .dsfr-data-map__layer-status-text')).toHaveText(
        'Couche « Bornes de recharge » : données momentanément indisponibles.'
      );
      await capturer(page, '#page', `bandeau-${nom}`);

      // Le bandeau relance tout : chaque bloc revient, la liste arrive en page 4.
      for (const k of Object.keys(pannes)) delete pannes[k];
      const relances = page.locator('#bandeau button', { hasText: 'Réessayer' });
      const n = await relances.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) await relances.first().click();
      await expect(page.locator('#acc tbody tr')).toHaveCount(4);
      await expect(formes(page, 'carte-seule', 'forme-seule')).toHaveCount(4);
      await expect(formes(page, 'carte-deux', 'forme-bornes')).toHaveCount(4);
      await expect(page.locator('#liste tbody tr td').first()).toContainText('Commune 10');
      await expect(page.locator('.dsfr-data-filters-unavailable')).toHaveCount(0);
    });
  });
}

test.describe('source en panne — les autres causes', () => {
  test('404 : les phrases disent des données retirées, sans « Réessayer »', async ({ page }) => {
    const pannes = await serveur(page);
    await ouvrir(page, BUREAU);
    Object.assign(pannes, { aides: 404, bornes: 404, annuaire: 404 });
    await recharger(page, 'aides', 'bornes', 'annuaire');

    await expect(page.locator('#acc .dsfr-data-a11y__unavailable')).toHaveText(
      'Ces données ne sont plus publiées à cette adresse. Le tableau et le téléchargement ne sont pas disponibles.'
    );
    await expect(
      page.locator('#carte-seule .dsfr-data-map__error .dsfr-data-status__title')
    ).toHaveText('Ces données ne sont plus publiées à cette adresse');
    await expect(page.locator('#carte-seule .dsfr-data-map__error button')).toHaveCount(0);
    await expect(page.locator('#carte-deux .dsfr-data-map__layer-status-text')).toHaveText(
      'Couche « Bornes de recharge » : ces données ne sont plus publiées à cette adresse.'
    );
    await expect(page.locator('#carte-deux > .dsfr-data-map__layer-status button')).toHaveCount(0);
    await expect(page.locator('#f .dsfr-data-filters-unavailable')).toHaveText(
      'Filtres indisponibles. Ces données ne sont plus publiées à cette adresse.'
    );
    await capturer(page, '#page', 'cause-404-bureau');
  });

  test('error-message de la source remplace la phrase du tableau équivalent', async ({ page }) => {
    const pannes = await serveur(page);
    await ouvrir(
      page,
      BUREAU,
      `?message=${encodeURIComponent('Chiffres en cours de mise à jour.')}`
    );
    pannes.aides = 503;
    await recharger(page, 'aides');
    await expect(page.locator('#acc .dsfr-data-a11y__unavailable')).toHaveText(
      'Chiffres en cours de mise à jour. Le tableau et le téléchargement reviendront avec les données.'
    );
  });

  test('réseau coupé : la phrase tient pendant le nouvel essai, tout revient avec la connexion', async ({
    page,
    context,
  }) => {
    const pannes = await serveur(page);
    await ouvrir(page, BUREAU);

    // Chaque texte de panne vu à l'écran, dans l'ordre — un clignotement s'y lirait.
    await page.evaluate(() => {
      const vus: string[] = [];
      (window as unknown as { __vus: string[] }).__vus = vus;
      const lire = () => {
        const t = document.querySelector('#acc .dsfr-data-a11y__unavailable')?.textContent;
        const propre = (t ?? '').replace(/\s+/g, ' ').trim();
        if (propre && vus.at(-1) !== propre) vus.push(propre);
      };
      new MutationObserver(lire).observe(document.getElementById('acc') as HTMLElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });

    pannes.reseau = 1;
    await context.setOffline(true);
    await recharger(page, 'aides', 'bornes');
    await expect(page.locator('#acc .dsfr-data-a11y__unavailable')).toHaveText(
      'Vous semblez hors connexion. Le tableau et le téléchargement reviendront avec les données.'
    );
    await expect(
      page.locator('#carte-seule .dsfr-data-map__error .dsfr-data-status__title')
    ).toHaveText('Vous semblez hors connexion');
    await expect(page.locator('#carte-deux .dsfr-data-map__layer-status-text')).toHaveText(
      'Couche « Bornes de recharge » : vous semblez hors connexion.'
    );
    await expect(formes(page, 'carte-seule', 'forme-seule')).toHaveCount(0);

    // La connexion revient : la source se relance seule (#1203), sans geste.
    delete pannes.reseau;
    await context.setOffline(false);
    await expect(page.locator('#acc tbody tr')).toHaveCount(4);
    await expect(formes(page, 'carte-seule', 'forme-seule')).toHaveCount(4);
    await expect(page.locator('#carte-deux > .dsfr-data-map__layer-status')).toHaveCount(0);

    // Pendant l'essai, la phrase n'a pas changé : une seule a été vue.
    const vus = await page.evaluate(() => (window as unknown as { __vus: string[] }).__vus);
    expect(vus).toEqual([
      'Vous semblez hors connexion. Le tableau et le téléchargement reviendront avec les données.',
    ]);
  });
});

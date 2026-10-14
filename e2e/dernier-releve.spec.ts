import { test, expect, type Locator, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #1288, proposition B — le dernier relevé, daté et marqué, quand la source
 * porte `stale-if-error`.
 *
 * Les tests unitaires (`tests/dernier-releve*.test.ts`) portent la règle, les
 * textes et le balisage. Ce spec porte ce qu'ils ne voient pas, sur de vrais
 * composants (DSFR Chart depuis node_modules, Leaflet) :
 *
 * - le RÉSEAU et l'HORLOGE : un faux serveur qui passe de 200 à 503 (puis 404)
 *   et qui revient, une horloge tenue par `page.clock` — l'heure affichée est
 *   celle du chargement, et le bloc bascule SEUL au message de panne quand la
 *   durée est passée ;
 * - ce qui est TRACÉ : le canevas du graphique et les formes Leaflet restent,
 *   désaturés ; leur contraste est MESURÉ sur les pixels réellement peints
 *   (capture de l'élément, filtre compris), en clair et en sombre ;
 * - le FICHIER : un export qui sort du navigateur avec la date du relevé dans
 *   son nom, et le contenu d'avant la panne ;
 * - les BOÎTES : la tuile de KPI garde 140 px, aucun défilement horizontal à
 *   375 px, la ligne d'état tient dans la carte.
 *
 * Déterministe : toutes les données viennent de `page.route`, les tuiles sont
 * coupées. Seule la feuille DSFR vient du CDN, comme `layout-grid.spec.ts`.
 *
 * Captures : `RELEVE_1288_CAPTURES=<dossier>` enregistre chaque scène dans ses
 * quatre états (normal, relevé, échu, retour), bureau et 375 px, clair et
 * sombre (hors dépôt, jamais en CI).
 */

// « aujourd’hui à 14 h 32 » est une heure LOCALE : fuseau fixé.
test.use({ timezoneId: 'Europe/Paris', locale: 'fr-FR' });

const BUREAU = { width: 1280, height: 900 };
const TELEPHONE = { width: 375, height: 800 };
const LARGEURS = [
  ['bureau', BUREAU],
  ['375px', TELEPHONE],
] as const;
const CAPTURES = process.env.RELEVE_1288_CAPTURES;

/** Mardi 13 octobre 2026, 14 h 32 min 07 s à Paris : le chargement de la page. */
const RELEVE = new Date('2026-10-13T14:32:07+02:00');
const DATE_ISO = '2026-10-13T12:32:';

const JEUX: Record<string, unknown[]> = {
  aides: [
    { region: 'Auvergne-Rhône-Alpes', beneficiaires: 2412, montant: 118.4 },
    { region: 'Île-de-France', beneficiaires: 1987, montant: 96 },
    { region: 'Occitanie', beneficiaires: 1640, montant: 82.3 },
    { region: 'Nouvelle-Aquitaine', beneficiaires: 1502, montant: 74.1 },
  ],
  entreprises: [{ nom: 'A' }, { nom: 'B' }, { nom: 'C' }, { nom: 'D' }, { nom: 'E' }],
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
};
/** Le jeu « aides » après le retour du service : d'autres chiffres, pour le voir. */
const AIDES_RETOUR = [
  { region: 'Auvergne-Rhône-Alpes', beneficiaires: 2500, montant: 120 },
  { region: 'Île-de-France', beneficiaires: 2000, montant: 100 },
  { region: 'Occitanie', beneficiaires: 1700, montant: 85 },
  { region: 'Nouvelle-Aquitaine', beneficiaires: 1600, montant: 80 },
];
const COMMUNES = Array.from({ length: 13 }, (_, i) => ({
  nom: `Commune ${String(i + 1).padStart(2, '0')}`,
  population: 1000 * (i + 1),
}));

/**
 * Le faux serveur. `pannes` : nom du jeu → code HTTP ; `pages:2` vise une seule
 * page du jeu paginé ; `lenteur` fait attendre chaque réponse (en ms) — un
 * service en panne passe d'abord par « chargement » ; `retour` sert le second
 * jeu d'aides. Vidé, tout répond 200 sans délai.
 */
type Pannes = Record<string, number>;

async function serveur(page: Page): Promise<Pannes> {
  const pannes: Pannes = {};
  const refus = (status: number) => ({
    status,
    contentType: 'application/json',
    body: '{"error":"panne"}',
  });
  await page.route('**/e2e/dernier-releve/**', async (route) => {
    const url = new URL(route.request().url());
    const nom = url.pathname.split('/').pop() as string;
    if (pannes.lenteur) await new Promise((suite) => setTimeout(suite, pannes.lenteur));
    if (pannes[nom]) return route.fulfill(refus(pannes[nom]));
    if (nom === 'pages') {
      const p = Number(url.searchParams.get('page') ?? 1);
      const taille = Number(url.searchParams.get('page_size') ?? 3);
      if (pannes[`pages:${p}`]) return route.fulfill(refus(pannes[`pages:${p}`]));
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: COMMUNES.slice((p - 1) * taille, p * taille),
          meta: { page: p, page_size: taille, total: COMMUNES.length },
        }),
      });
    }
    const jeu = nom === 'aides' && pannes.retour ? AIDES_RETOUR : JEUX[nom];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(jeu) });
  });
  await page.route('**/e2e/tuiles-absentes/**', (route) =>
    route.fulfill({ status: 404, body: '' })
  );
  return pannes;
}

/** Formes d'une couche tracées sur la carte. */
const formes = (page: Page, carte: string, classe: string) =>
  page.locator(`#${carte} > .dsfr-data-map__container path.${classe}`);

async function ouvrir(
  page: Page,
  viewport: { width: number; height: number },
  requete = ''
): Promise<void> {
  await page.setViewportSize(viewport);
  // L'horloge part du relevé et court ensuite d'elle-même : la panne
  // survient quelques secondes après le chargement, comme en vrai.
  await page.clock.install({ time: RELEVE });
  await page.goto(`/e2e/dernier-releve.html${requete}`);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).fontFamily))
    .toContain('Marianne');
  const pret = { timeout: 20_000 };
  await expect(page.locator('#g canvas').first()).toBeVisible(pret);
  await expect(page.locator('#g-cadre canvas').first()).toBeVisible(pret);
  for (const id of ['carte-seule', 'carte-deux']) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  }
  await expect(formes(page, 'carte-seule', 'forme-seule')).toHaveCount(4, pret);
  await expect(formes(page, 'carte-deux', 'forme-bornes')).toHaveCount(4, pret);
  await expect(formes(page, 'carte-deux', 'forme-stations')).toHaveCount(2, pret);
  await page.locator('#page').scrollIntoViewIfNeeded();
  await expect(page.locator('#liste tbody tr')).toHaveCount(3);
  await expect(page.locator('#liste-serveur tbody tr')).toHaveCount(3);
  await expect(page.locator('#k-beneficiaires .dsfr-data-kpi__value')).toHaveText(/7\s541/);
  await page.evaluate(() =>
    document.querySelectorAll('dsfr-data-a11y details').forEach((d) => d.setAttribute('open', ''))
  );
}

/** Fait recharger des sources : c'est l'appel suivant qui tombe sur la panne. */
const recharger = (page: Page, ...ids: string[]) =>
  page.evaluate((liste) => {
    for (const id of liste)
      (document.getElementById(id) as HTMLElement & { reload(): void }).reload();
  }, ids);

async function capturer(page: Page, selecteur: string, nom: string): Promise<void> {
  if (!CAPTURES) return;
  mkdirSync(CAPTURES, { recursive: true });
  await page.locator(selecteur).scrollIntoViewIfNeeded();
  await page.locator(selecteur).screenshot({ path: join(CAPTURES, `${nom}.png`) });
}

type Rgb = [number, number, number];

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Rapport de contraste WCAG entre deux couleurs. */
function rapport(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Consigne une mesure dans `contrastes.jsonl`, à côté des captures : le thème,
 * la largeur, ce qui est mesuré et le rapport obtenu. Rien hors captures.
 */
function consigner(page: Page, quoi: string, mesure: number, couleurs?: unknown): void {
  if (!CAPTURES) return;
  mkdirSync(CAPTURES, { recursive: true });
  const sombre = new URL(page.url()).searchParams.get('theme') === 'dark';
  appendFileSync(
    join(CAPTURES, 'contrastes.jsonl'),
    `${JSON.stringify({
      theme: sombre ? 'sombre' : 'clair',
      largeur: page.viewportSize()?.width,
      quoi,
      rapport: Math.round(mesure * 100) / 100,
      ...(couleurs ? { couleurs } : {}),
    })}\n`
  );
}

/** Rapport de contraste WCAG entre la couleur d'un texte et le fond réellement peint dessous. */
async function contraste(page: Page, selecteur: string): Promise<number> {
  const mesure = await contrasteCalcule(page, selecteur);
  consigner(page, `texte ${selecteur}`, mesure);
  return mesure;
}

const contrasteCalcule = (page: Page, selecteur: string): Promise<number> =>
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

/**
 * Les couleurs RÉELLEMENT peintes d'un élément, des plus aux moins fréquentes.
 *
 * Capture de l'élément (le filtre CSS y est appliqué — `getImageData` sur le
 * canevas d'origine rendrait les couleurs d'avant filtre), décodée dans la
 * page. Couleurs EXACTES : un aplat pèse des milliers de pixels, l'anticrénelage
 * de ses bords quelques dizaines par nuance — il ne prend pas la tête du compte.
 */
async function couleursPeintes(page: Page, cible: Locator): Promise<Array<{ c: Rgb; n: number }>> {
  const png = (await cible.screenshot()).toString('base64');
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, img.width, img.height).data;
    const compte = new Map<string, number>();
    for (let i = 0; i < px.length; i += 4) {
      const cle = `${px[i]},${px[i + 1]},${px[i + 2]}`;
      compte.set(cle, (compte.get(cle) ?? 0) + 1);
    }
    return [...compte.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([cle, n]) => ({ c: cle.split(',').map(Number) as [number, number, number], n }));
  }, png);
}

/** Une couleur est-elle grise (désaturée) ? */
const gris = ([r, g, b]: Rgb): boolean => Math.max(r, g, b) - Math.min(r, g, b) <= 16;

/**
 * Contraste d'une FORME avec le fond sur lequel elle est peinte : les deux
 * aplats les plus étendus d'une capture qui se distinguent l'un de l'autre
 * (les traits fins et le texte pèsent bien moins). Sur un graphique le plus
 * étendu est le fond ; sur une capture cadrée sur une forme de carte, c'est la
 * forme — le rapport est le même dans les deux sens. `forme` nomme ici celui
 * des deux qui n'est PAS le plus étendu.
 */
async function contrasteForme(
  page: Page,
  cible: Locator
): Promise<{ rapport: number; forme: Rgb; fond: Rgb }> {
  const couleurs = await couleursPeintes(page, cible);
  const fond = couleurs[0].c;
  const forme = couleurs.slice(1).find(({ c }) => rapport(c, fond) > 1.15)?.c ?? fond;
  consigner(page, `forme ${String(cible)}`, rapport(forme, fond), { forme, fond });
  return { rapport: rapport(forme, fond), forme, fond };
}

/** Les DEUX aplats d'une mesure sont-ils gris ? (la forme, quel que soit celui des deux qu'elle est) */
const tousGris = (mesure: { forme: Rgb; fond: Rgb }): boolean =>
  gris(mesure.forme) && gris(mesure.fond);

/** La page ne défile pas horizontalement. */
const sansDefilement = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** Hauteur de la carte d'une tuile, en pixels entiers. */
const hauteur = (page: Page, id: string): Promise<number> =>
  page
    .locator(`#${id} .dsfr-data-kpi`)
    .evaluate((el) => Math.round(el.getBoundingClientRect().height));

/** Texte d'un nœud, espaces ramenés à un seul et collés à la ponctuation. */
const texte = async (cible: Locator): Promise<string> =>
  ((await cible.first().textContent()) ?? '')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,])/g, '$1')
    .trim();

const MENTION = 'Chiffres relevés aujourd’hui à 14 h 32.';

for (const [nom, viewport] of LARGEURS) {
  test.describe(`dernier relevé — ${nom}`, () => {
    test('KPI : le chiffre reste, daté, dans 140 px ; passé la durée, « — » sans geste', async ({
      page,
    }) => {
      const pannes = await serveur(page);
      await ouvrir(page, viewport);
      const normale = await hauteur(page, 'k-beneficiaires');
      const figure = page.locator('#k-beneficiaires [role="figure"]');
      await expect(figure).toHaveAttribute('aria-label', /^Bénéficiaires: 7\s541, etat bon$/);
      await capturer(page, '#s-kpi', `kpi-1-normal-${nom}`);

      // Le service met du temps à refuser, cinq minutes après le chargement :
      // l'heure affichée doit rester celle du chargement.
      await page.clock.fastForward('05:00');
      pannes.aides = 503;
      pannes.lenteur = 300;
      await recharger(page, 'aides');

      const tuile = page.locator('#k-beneficiaires');
      await expect(tuile.locator('.dsfr-data-kpi--stale')).toHaveCount(1);
      await expect(tuile.locator('.dsfr-data-kpi__value')).toHaveText(/7\s541/);
      expect(
        await texte(tuile.locator('.dsfr-data-kpi__stale-line .dsfr-data-status__title'))
      ).toBe('Relevé à 14 h 32 · non actualisé');
      await expect(tuile.locator('time')).toHaveAttribute('datetime', new RegExp(`^${DATE_ISO}`));
      await expect(figure).toHaveAttribute(
        'aria-label',
        /^Bénéficiaires: 7\s541, chiffre relevé aujourd’hui à 14 h 32, non actualisé$/
      );
      // Avec titre de tuile : le nom le reprend
      await expect(page.locator('#k-montant [role="figure"]')).toHaveAttribute(
        'aria-label',
        /^Budget — Montant engagé: 370,8\sM€, chiffre relevé aujourd’hui à 14 h 32, non actualisé$/
      );
      // La tuile d'une AUTRE source n'est pas touchée
      await expect(page.locator('#k-entreprises .dsfr-data-kpi--stale')).toHaveCount(0);
      await expect(page.locator('#k-entreprises .dsfr-data-kpi__value')).toHaveText('5');

      // 140 px : la hauteur d'une tuile normale à cette largeur
      expect(normale).toBe(140);
      for (const id of ['k-beneficiaires', 'k-regions', 'k-entreprises']) {
        expect(await hauteur(page, id), `hauteur de #${id}`).toBeLessThanOrEqual(normale + 1);
      }

      // Contrastes : le chiffre et la ligne datée (4,5:1), le filet (3:1)
      expect(
        await contraste(page, '#k-beneficiaires .dsfr-data-kpi__value')
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contraste(
          page,
          '#k-beneficiaires .dsfr-data-kpi__stale-line .dsfr-data-status__title'
        )
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contraste(page, '#k-beneficiaires .dsfr-data-kpi__stale-line time')
      ).toBeGreaterThanOrEqual(4.5);
      const filet = await tuile.locator('.dsfr-data-kpi').evaluate((el) => {
        const s = getComputedStyle(el);
        return { style: s.borderLeftStyle, couleur: s.borderLeftColor, fond: s.backgroundColor };
      });
      expect(filet.style).toBe('dashed');
      const rgb = (c: string) => (c.match(/\d+/g) as string[]).slice(0, 3).map(Number) as Rgb;
      expect(rapport(rgb(filet.couleur), rgb(filet.fond))).toBeGreaterThanOrEqual(3);
      expect(await sansDefilement(page)).toBe(true);
      await capturer(page, '#s-kpi', `kpi-2-releve-${nom}`);

      // Un nouvel essai qui échoue encore : le chiffre reste, pas de sablier
      await tuile.locator('button.dsfr-data-status__retry').click();
      await expect(tuile.locator('button.dsfr-data-status__retry')).toHaveText(
        'Nouvel essai en cours…'
      );
      await expect(tuile.locator('.dsfr-data-kpi__loading')).toHaveCount(0);
      await expect(tuile.locator('.dsfr-data-kpi__value')).toHaveText(/7\s541/);
      await expect(tuile.locator('button.dsfr-data-status__retry')).toHaveText('Réessayer');

      // Passé la durée (une heure après le RELEVÉ) : « — », sans aucun geste
      await page.clock.fastForward('56:00');
      await expect(tuile.locator('.dsfr-data-kpi__value')).toHaveText('—');
      await expect(tuile.locator('.dsfr-data-kpi--stale')).toHaveCount(0);
      await expect(tuile.locator('time')).toHaveCount(0);
      expect(await tuile.innerText()).not.toMatch(/7\s541/);
      expect(await hauteur(page, 'k-beneficiaires')).toBeLessThanOrEqual(normale + 1);
      await capturer(page, '#s-kpi', `kpi-3-echu-${nom}`);

      // Le service revient : le NOUVEAU chiffre, plus de marque
      delete pannes.aides;
      delete pannes.lenteur;
      pannes.retour = 1;
      await tuile.locator('button.dsfr-data-status__retry').click();
      await expect(tuile.locator('.dsfr-data-kpi__value')).toHaveText(/7\s800/);
      await expect(tuile.locator('.dsfr-data-kpi--stale')).toHaveCount(0);
      await expect(figure).toHaveAttribute('aria-label', /^Bénéficiaires: 7\s800, etat bon$/);
      await capturer(page, '#s-kpi', `kpi-4-retour-${nom}`);
    });

    test('graphique et cadre officiel : le tracé reste, désaturé, sous la mention', async ({
      page,
    }) => {
      const pannes = await serveur(page);
      await ouvrir(page, viewport);
      const avant = await contrasteForme(page, page.locator('#g canvas').first());
      expect(gris(avant.forme)).toBe(false);
      await capturer(page, '#s-graphique', `graphique-1-normal-${nom}`);
      await capturer(page, '#s-cadre', `cadre-1-normal-${nom}`);

      pannes.aides = 503;
      pannes.lenteur = 300;
      await recharger(page, 'aides');

      for (const id of ['g', 'g-cadre']) {
        const bloc = page.locator(`#${id}`);
        await expect(bloc.locator('.dsfr-data-status__stale-badge')).toHaveText('Non actualisé');
        expect(await texte(bloc.locator('.dsfr-data-status__stale-text'))).toBe(MENTION);
        await expect(bloc.locator('canvas').first()).toBeVisible();
        await expect(bloc.locator('.dsfr-data-status--source-error')).toHaveCount(0);
        await expect(bloc).toHaveClass(/dsfr-data-chart--stale/);
        // La mention est au-dessus du tracé
        const mention = (await bloc.locator('.dsfr-data-chart__stale').boundingBox()) as {
          y: number;
          height: number;
        };
        const canevas = (await bloc.locator('canvas').first().boundingBox()) as { y: number };
        expect(mention.y + mention.height).toBeLessThanOrEqual(canevas.y + 1);
        expect(
          await contraste(page, `#${id} .dsfr-data-status__stale-text`)
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          await contraste(page, `#${id} .dsfr-data-status__stale-badge`)
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          await contraste(page, `#${id} .dsfr-data-status__stale-time`)
        ).toBeGreaterThanOrEqual(4.5);
        // Les barres : grises, et toujours à 3:1 au moins du fond — MESURÉ
        const barres = await contrasteForme(page, bloc.locator('canvas').first());
        expect(gris(barres.forme)).toBe(true);
        expect(barres.rapport).toBeGreaterThanOrEqual(3);
      }
      await expect(page.locator('#g .dsfr-data-chart__wrapper')).toHaveAttribute(
        'aria-label',
        'Graphique barres, 4 valeurs. Chiffres relevés aujourd’hui à 14 h 32, non actualisés.'
      );
      // Sans bandeau, la mention annonce et porte « Réessayer » (44 px)
      await expect(page.locator('#g .dsfr-data-chart__stale')).toHaveAttribute('role', 'status');
      const retry = page.locator('#g button.dsfr-data-status__retry');
      expect(((await retry.boundingBox()) as { height: number }).height).toBeGreaterThanOrEqual(44);
      // Le cadre officiel garde SA date : celle de la donnée, pas celle du relevé
      await expect(page.locator('#g-cadre data-box')).toHaveAttribute('date', '31/12/2025');
      expect(await sansDefilement(page)).toBe(true);
      await capturer(page, '#s-graphique', `graphique-2-releve-${nom}`);
      await capturer(page, '#s-cadre', `cadre-2-releve-${nom}`);

      // Nouvel essai qui échoue : le canevas n'est pas remonté (pas de clignotement)
      await page
        .locator('#g canvas')
        .first()
        .evaluate((c) => c.setAttribute('data-temoin', '1'));
      await retry.click();
      await expect(retry).toHaveText('Nouvel essai en cours…');
      await expect(retry).toHaveText('Réessayer');
      await expect(page.locator('#g canvas[data-temoin="1"]')).toHaveCount(1);

      // Passé la durée : le message de panne, plus aucun tracé
      await page.clock.fastForward('01:00:01');
      for (const id of ['g', 'g-cadre']) {
        await expect(page.locator(`#${id} .dsfr-data-status--source-error`)).toHaveCount(1);
        await expect(page.locator(`#${id} canvas`)).toHaveCount(0);
        await expect(page.locator(`#${id}`)).not.toHaveClass(/dsfr-data-chart--stale/);
      }
      await capturer(page, '#s-graphique', `graphique-3-echu-${nom}`);
      await capturer(page, '#s-cadre', `cadre-3-echu-${nom}`);

      // Le service revient : le tracé en couleur, sans mention
      delete pannes.aides;
      delete pannes.lenteur;
      pannes.retour = 1;
      await page.locator('#g button.dsfr-data-status__retry').click();
      for (const id of ['g', 'g-cadre']) {
        await expect(page.locator(`#${id} canvas`).first()).toBeVisible();
        await expect(page.locator(`#${id} .dsfr-data-chart__stale`)).toHaveCount(0);
      }
      await expect(page.locator('#g .dsfr-data-chart__wrapper')).toHaveAttribute(
        'aria-label',
        'Graphique barres, 4 valeurs'
      );
      await expect
        .poll(async () =>
          gris((await contrasteForme(page, page.locator('#g canvas').first())).forme)
        )
        .toBe(false);
      await capturer(page, '#s-graphique', `graphique-4-retour-${nom}`);
      await capturer(page, '#s-cadre', `cadre-4-retour-${nom}`);
    });

    test('liste : les lignes restent, tri et pagination locaux, export daté ; pagination serveur neutralisée', async ({
      page,
    }) => {
      const pannes = await serveur(page);
      await ouvrir(page, viewport);
      await capturer(page, '#s-liste', `liste-1-normal-${nom}`);

      pannes.aides = 503;
      pannes.pages = 503;
      await recharger(page, 'aides', 'pages');

      const liste = page.locator('#liste');
      expect(await texte(liste.locator('.dsfr-data-status__stale-text'))).toBe(MENTION);
      await expect(liste.locator('.dsfr-data-status__stale-badge')).toHaveText('Non actualisé');
      await expect(liste.locator('tbody tr')).toHaveCount(3);
      await expect(liste.locator('tbody tr').first()).toContainText('Auvergne-Rhône-Alpes');
      expect(await contraste(page, '#liste .dsfr-data-status__stale-text')).toBeGreaterThanOrEqual(
        4.5
      );
      expect(await sansDefilement(page)).toBe(true);
      await capturer(page, '#s-liste', `liste-2-releve-${nom}`);

      // Pagination LOCALE : elle ne pose aucune requête, elle répond
      await liste.locator('.fr-pagination__link--next').click();
      await expect(liste.locator('tbody tr')).toHaveCount(1);
      await expect(liste.locator('tbody tr').first()).toContainText('Nouvelle-Aquitaine');
      expect(await texte(liste.locator('.dsfr-data-status__stale-text'))).toBe(MENTION);

      // Export : il sort, daté dans son libellé et dans son nom
      const bouton = liste.locator('button', { hasText: 'Exporter CSV' });
      await expect(bouton).toHaveText(/Exporter CSV \(chiffres relevés à 14 h 32\)/);
      const [fichier] = await Promise.all([page.waitForEvent('download'), bouton.click()]);
      expect(fichier.suggestedFilename()).toBe('export_relevé-2026-10-13-14h32.csv');
      expect(readFileSync((await fichier.path()) as string, 'utf8')).toContain('Occitanie;1640');

      // Pagination SERVEUR : la page reste, les autres sont neutralisées et c'est dit
      const serveurListe = page.locator('#liste-serveur');
      expect(await texte(serveurListe.locator('.dsfr-data-status__stale-text'))).toBe(
        `${MENTION} Les autres pages reviendront avec les données.`
      );
      await expect(serveurListe.locator('tbody tr')).toHaveCount(3);
      await expect(serveurListe.locator('tbody tr').first()).toContainText('Commune 01');
      const suivante = serveurListe.locator('.fr-pagination__link--next');
      await expect(suivante).toHaveAttribute('aria-disabled', 'true');
      await suivante.click({ force: true });
      await page.waitForTimeout(300);
      await expect(serveurListe.locator('tbody tr').first()).toContainText('Commune 01');
      await expect(serveurListe.locator('.dsfr-data-status--page-error')).toHaveCount(0);
      await capturer(page, '#s-liste-serveur', `liste-serveur-2-releve-${nom}`);

      // Passé la durée : plus aucune ligne
      await page.clock.fastForward('01:00:01');
      await expect(liste.locator('tbody tr')).toHaveCount(0);
      await expect(liste.locator('.dsfr-data-status--source-error')).toHaveCount(1);
      await expect(serveurListe.locator('tbody tr')).toHaveCount(0);
      await expect(liste.locator('button', { hasText: 'Exporter CSV' })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
      await capturer(page, '#s-liste', `liste-3-echu-${nom}`);

      // Le service revient
      delete pannes.aides;
      delete pannes.pages;
      pannes.retour = 1;
      await liste.locator('button.dsfr-data-status__retry').click();
      await expect(liste.locator('tbody tr')).toHaveCount(3);
      await expect(liste.locator('.dsfr-data-list__stale')).toHaveCount(0);
      await expect(liste.locator('tbody tr').first()).toContainText(/2\s500/);
      await expect(liste.locator('button', { hasText: 'Exporter CSV' })).toHaveText(
        /Exporter CSV\s*$/
      );
      await capturer(page, '#s-liste', `liste-4-retour-${nom}`);
    });

    test('tableau équivalent : légende datée, fichier daté dans son nom, contenu d’avant la panne', async ({
      page,
    }) => {
      const pannes = await serveur(page);
      await ouvrir(page, viewport);
      const bouton = page.locator('#acc button', { hasText: 'Télécharger en CSV' });
      const [temoin] = await Promise.all([page.waitForEvent('download'), bouton.click()]);
      expect(temoin.suggestedFilename()).toBe('données.csv');
      const avant = readFileSync((await temoin.path()) as string, 'utf8');
      await capturer(page, '#s-tableau', `tableau-1-normal-${nom}`);

      await bouton.focus();
      pannes.aides = 503;
      pannes.lenteur = 300;
      await recharger(page, 'aides');

      const legende = page.locator('#acc caption');
      await expect(legende).toHaveClass('dsfr-data-a11y__stale-caption');
      expect(await texte(legende)).toBe(
        'Données du graphique — Non actualisé chiffres relevés aujourd’hui à 14 h 32'
      );
      await expect(legende).toBeVisible();
      await expect(page.locator('#acc tbody tr')).toHaveCount(4);
      await expect(bouton).toHaveText(/Télécharger en CSV \(chiffres relevés à 14 h 32\)/);
      await expect(bouton).not.toHaveAttribute('aria-disabled', /.*/);
      // Le bouton a gardé le focus à travers le chargement puis la panne
      await expect(bouton).toBeFocused();
      await expect(page.locator('#acc-desc')).toContainText(
        'Chiffres relevés aujourd’hui à 14 h 32, non actualisés.'
      );
      // Le graphique voisin annonce ; le tableau, jamais une fois de plus
      await expect(page.locator('#acc [role="status"]')).toHaveCount(0);
      expect(await contraste(page, '#acc caption')).toBeGreaterThanOrEqual(4.5);
      expect(
        await contraste(page, '#acc caption .dsfr-data-status__stale-badge')
      ).toBeGreaterThanOrEqual(4.5);
      expect(await sansDefilement(page)).toBe(true);

      const [fichier] = await Promise.all([page.waitForEvent('download'), bouton.click()]);
      expect(fichier.suggestedFilename()).toBe('données_relevé-2026-10-13-14h32.csv');
      // Contenu inchangé : celui d'avant la panne, brut
      expect(readFileSync((await fichier.path()) as string, 'utf8')).toBe(avant);
      await capturer(page, '#s-tableau', `tableau-2-releve-${nom}`);

      // Passé la durée : ni tableau ni fichier (proposition A)
      await page.clock.fastForward('01:00:01');
      await expect(page.locator('#acc table')).toHaveCount(0);
      await expect(bouton).toHaveAttribute('aria-disabled', 'true');
      await expect(bouton).toHaveText(/Télécharger en CSV\s*$/);
      let sorti = false;
      page.once('download', () => (sorti = true));
      await bouton.click({ force: true });
      await page.waitForTimeout(300);
      expect(sorti).toBe(false);
      await capturer(page, '#s-tableau', `tableau-3-echu-${nom}`);

      // Le service revient : le nouveau jeu, la légende de nouveau masquée
      delete pannes.aides;
      delete pannes.lenteur;
      pannes.retour = 1;
      await page.locator('#g-acc button.dsfr-data-status__retry').click();
      await expect(page.locator('#acc tbody tr')).toHaveCount(4);
      await expect(page.locator('#acc caption')).toHaveClass('dsfr-data-a11y__sr-only');
      const [retour] = await Promise.all([page.waitForEvent('download'), bouton.click()]);
      expect(retour.suggestedFilename()).toBe('données.csv');
      expect(readFileSync((await retour.path()) as string, 'utf8')).toContain('Occitanie;1700;85');
      await capturer(page, '#s-tableau', `tableau-4-retour-${nom}`);
    });

    test('carte, une couche : les formes restent, grises et pointillées, la ligne les date', async ({
      page,
    }) => {
      const pannes = await serveur(page);
      await ouvrir(page, viewport);
      await capturer(page, '#s-carte-seule', `carte-seule-1-normal-${nom}`);

      // Témoin : avant la panne, la forme est en couleur
      expect(
        tousGris(await contrasteForme(page, formes(page, 'carte-seule', 'forme-seule').first()))
      ).toBe(false);
      // Une bulle ouverte AVANT la panne : elle ne porte encore aucune note
      const carte = page.locator('#carte-seule');
      const bulle = carte.locator('.leaflet-popup-content');
      await formes(page, 'carte-seule', 'forme-seule').first().dispatchEvent('click');
      await expect(bulle).toBeVisible();
      await expect(bulle.locator('.dsfr-data-map__popup-stale')).toHaveCount(0);

      pannes.bornes = 503;
      pannes.lenteur = 300;
      await recharger(page, 'bornes');

      const ligne = carte.locator('> .dsfr-data-map__layer-status');
      expect(await texte(ligne.locator('.dsfr-data-map__layer-status-text'))).toBe(
        'Points relevés aujourd’hui à 14 h 32.'
      );
      await expect(ligne.locator('.dsfr-data-status__stale-badge')).toHaveText('Non actualisé');
      await expect(ligne).toHaveAttribute('role', 'status');
      await expect(carte).toHaveClass(/dsfr-data-map--stale/);
      await expect(formes(page, 'carte-seule', 'forme-seule')).toHaveCount(4);
      await expect(carte.locator('.dsfr-data-map__error')).toHaveCount(0);
      // L'encart suit : sa forme reste, atténuée elle aussi, sans répéter la ligne
      const encart = carte.locator('dsfr-data-map-inset');
      await expect(encart.locator('path.forme-seule')).toHaveCount(1);
      await expect(encart.locator('dsfr-data-map')).toHaveClass(/dsfr-data-map--stale/);
      await expect(encart.locator('.dsfr-data-map__layer-status')).toHaveCount(0);
      await expect(page.locator('#carte-seule-desc')).toContainText('Couches : 4 cercles.');
      await expect(page.locator('#carte-seule-desc')).toContainText(
        'Points relevés aujourd’hui à 14 h 32, non actualisés.'
      );
      // La bulle restée ouverte a pris la note : son contenu date d'avant la panne
      expect(await texte(bulle.locator('.dsfr-data-map__popup-stale'))).toBe(
        'Non actualisé Relevé aujourd’hui à 14 h 32.'
      );
      await carte.locator('.leaflet-popup-close-button').dispatchEvent('click');
      await expect(carte.locator('.leaflet-popup')).toHaveCount(0);

      // Désaturées et pointillées : filtre sur le volet, tirets sur le contour
      const volet = carte.locator('> .dsfr-data-map__container .leaflet-overlay-pane');
      expect(await volet.evaluate((el) => getComputedStyle(el).filter)).toBe('grayscale(1)');
      const forme = formes(page, 'carte-seule', 'forme-seule').first();
      expect(await forme.evaluate((el) => getComputedStyle(el).strokeDasharray)).not.toBe('none');
      // Contraste MESURÉ de la forme sur le fond de carte
      const mesure = await contrasteForme(page, forme);
      expect(tousGris(mesure)).toBe(true);
      expect(mesure.rapport).toBeGreaterThanOrEqual(3);

      // La ligne : en bas de carte, dans sa largeur, lisible
      const boiteCarte = (await carte.locator('> .dsfr-data-map__container').boundingBox()) as {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      const boite = (await ligne.boundingBox()) as typeof boiteCarte;
      expect(boite.x).toBeGreaterThanOrEqual(boiteCarte.x);
      expect(boite.x + boite.width).toBeLessThanOrEqual(boiteCarte.x + boiteCarte.width + 0.5);
      expect(boite.y + boite.height).toBeLessThanOrEqual(boiteCarte.y + boiteCarte.height + 0.5);
      expect(
        await contraste(page, '#carte-seule .dsfr-data-map__layer-status-text')
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        await contraste(page, '#carte-seule .dsfr-data-map__layer-status time')
      ).toBeGreaterThanOrEqual(4.5);
      expect(await sansDefilement(page)).toBe(true);
      await capturer(page, '#s-carte-seule', `carte-seule-2-releve-${nom}`);

      // Une bulle ouverte sur un point relevé porte la même mention
      await forme.dispatchEvent('click');
      await expect(bulle.locator('.dsfr-data-map__popup-stale')).toHaveCount(1);
      expect(await texte(bulle.locator('.dsfr-data-map__popup-stale'))).toBe(
        'Non actualisé Relevé aujourd’hui à 14 h 32.'
      );

      // Passé la durée : la couche est vidée — sa bulle ouverte part avec
      // elle —, le message centré revient
      await page.clock.fastForward('01:00:01');
      await expect(formes(page, 'carte-seule', 'forme-seule')).toHaveCount(0);
      await expect(encart.locator('path.forme-seule')).toHaveCount(0);
      await expect(carte.locator('.leaflet-popup')).toHaveCount(0);
      await expect(carte).not.toHaveClass(/dsfr-data-map--stale/);
      await expect(carte.locator('.dsfr-data-map__error .dsfr-data-status__title')).toHaveText(
        'Données momentanément indisponibles'
      );
      await expect(ligne).toHaveCount(0);
      expect(await page.locator('#carte-seule-desc').innerText()).not.toMatch(/Couches|relevés/);
      await capturer(page, '#s-carte-seule', `carte-seule-3-echu-${nom}`);

      // Le service revient : formes en couleur, plus de mention, bulle sans note
      delete pannes.bornes;
      delete pannes.lenteur;
      await carte.locator('.dsfr-data-map__error button.dsfr-data-status__retry').click();
      await expect(formes(page, 'carte-seule', 'forme-seule')).toHaveCount(4);
      await expect(carte.locator('.dsfr-data-map__layer-status')).toHaveCount(0);
      await expect(carte.locator('.dsfr-data-map__error')).toHaveCount(0);
      expect(await volet.evaluate((el) => getComputedStyle(el).filter)).toBe('none');
      await formes(page, 'carte-seule', 'forme-seule').first().dispatchEvent('click');
      await expect(bulle).toBeVisible();
      await expect(carte.locator('.dsfr-data-map__popup-stale')).toHaveCount(0);
      await carte.locator('.leaflet-popup-close-button').dispatchEvent('click');
      await expect(carte.locator('.leaflet-popup')).toHaveCount(0);
      await capturer(page, '#s-carte-seule', `carte-seule-4-retour-${nom}`);
    });

    test('carte, deux couches : toute la carte est atténuée, la ligne nomme la couche périmée', async ({
      page,
    }) => {
      const pannes = await serveur(page);
      await ouvrir(page, viewport);
      await capturer(page, '#s-carte-deux', `carte-deux-1-normal-${nom}`);

      pannes.bornes = 503;
      await recharger(page, 'bornes');

      const carte = page.locator('#carte-deux');
      const ligne = carte.locator('> .dsfr-data-map__layer-status');
      expect(await texte(ligne.locator('.dsfr-data-map__layer-status-text'))).toBe(
        'Couche « Bornes de recharge » : points relevés aujourd’hui à 14 h 32.'
      );
      await expect(carte).toHaveClass(/dsfr-data-map--stale/);
      await expect(formes(page, 'carte-deux', 'forme-bornes')).toHaveCount(4);
      await expect(formes(page, 'carte-deux', 'forme-stations')).toHaveCount(2);
      // TOUTE la carte : la couche à jour est atténuée elle aussi
      for (const classe of ['forme-bornes', 'forme-stations']) {
        const mesure = await contrasteForme(page, formes(page, 'carte-deux', classe).first());
        expect(tousGris(mesure)).toBe(true);
        expect(mesure.rapport).toBeGreaterThanOrEqual(3);
      }
      await expect(page.locator('#carte-deux-desc')).toContainText(
        'Couche « Bornes de recharge » : points relevés aujourd’hui à 14 h 32, non actualisés.'
      );
      const boiteCarte = (await carte.locator('> .dsfr-data-map__container').boundingBox()) as {
        x: number;
        width: number;
      };
      const boite = (await ligne.boundingBox()) as typeof boiteCarte;
      expect(boite.x).toBeGreaterThanOrEqual(boiteCarte.x);
      expect(boite.x + boite.width).toBeLessThanOrEqual(boiteCarte.x + boiteCarte.width + 0.5);
      expect(await sansDefilement(page)).toBe(true);
      await capturer(page, '#s-carte-deux', `carte-deux-2-releve-${nom}`);

      // Passé la durée : la couche périmée est vidée, l'autre trace, en couleur
      await page.clock.fastForward('01:00:01');
      await expect(formes(page, 'carte-deux', 'forme-bornes')).toHaveCount(0);
      await expect(formes(page, 'carte-deux', 'forme-stations')).toHaveCount(2);
      await expect(carte).not.toHaveClass(/dsfr-data-map--stale/);
      expect(await texte(ligne.locator('.dsfr-data-map__layer-status-text'))).toBe(
        'Couche « Bornes de recharge » : données momentanément indisponibles.'
      );
      await capturer(page, '#s-carte-deux', `carte-deux-3-echu-${nom}`);

      delete pannes.bornes;
      await ligne.locator('button.dsfr-data-status__retry').click();
      await expect(formes(page, 'carte-deux', 'forme-bornes')).toHaveCount(4);
      await expect(ligne).toHaveCount(0);
      await capturer(page, '#s-carte-deux', `carte-deux-4-retour-${nom}`);
    });
  });
}

test.describe('dernier relevé — garde-fous', () => {
  test('sans l’attribut : le rendu de la proposition A, à l’identique', async ({ page }) => {
    const pannes = await serveur(page);
    await ouvrir(page, BUREAU, '?duree=0');
    pannes.aides = 503;
    pannes.bornes = 503;
    await recharger(page, 'aides', 'bornes');

    await expect(page.locator('#k-beneficiaires .dsfr-data-kpi__value')).toHaveText('—');
    await expect(page.locator('#g .dsfr-data-status--source-error')).toHaveCount(1);
    await expect(page.locator('#g canvas')).toHaveCount(0);
    await expect(page.locator('#liste tbody tr')).toHaveCount(0);
    await expect(page.locator('#acc table')).toHaveCount(0);
    await expect(page.locator('#acc button')).toHaveAttribute('aria-disabled', 'true');
    await expect(formes(page, 'carte-seule', 'forme-seule')).toHaveCount(0);
    await expect(page.locator('#carte-seule .dsfr-data-map__error')).toHaveCount(1);
    // Aucune trace du relevé nulle part
    await expect(page.locator('.dsfr-data-status--stale')).toHaveCount(0);
    await expect(page.locator('.dsfr-data-status__stale-badge')).toHaveCount(0);
    await expect(page.locator('time')).toHaveCount(0);
    expect(await page.locator('#page').innerText()).not.toMatch(/relevé|Non actualisé/i);
    await capturer(page, '#s-kpi', 'kpi-0-sans-attribut-bureau');
    await capturer(page, '#s-graphique', 'graphique-0-sans-attribut-bureau');
  });

  test('données retirées (404) : le message de panne, jamais le relevé', async ({ page }) => {
    const pannes = await serveur(page);
    await ouvrir(page, BUREAU);
    pannes.aides = 404;
    pannes.bornes = 404;
    await recharger(page, 'aides', 'bornes');

    await expect(page.locator('#k-beneficiaires .dsfr-data-kpi__value')).toHaveText('—');
    await expect(page.locator('#g .dsfr-data-status--source-error')).toHaveAttribute(
      'data-cause',
      'donnees-introuvables'
    );
    await expect(page.locator('#liste tbody tr')).toHaveCount(0);
    await expect(page.locator('#acc table')).toHaveCount(0);
    await expect(formes(page, 'carte-seule', 'forme-seule')).toHaveCount(0);
    await expect(page.locator('.dsfr-data-status--stale')).toHaveCount(0);
  });

  test('page changée puis échec : la page précédente, dite pour ce qu’elle est — pas un relevé', async ({
    page,
  }) => {
    const pannes = await serveur(page);
    await ouvrir(page, BUREAU);
    pannes['pages:2'] = 503;
    const liste = page.locator('#liste-serveur');
    await liste.locator('.fr-pagination__link--next').click();
    await expect(liste.locator('.dsfr-data-status--page-error')).toContainText(
      'La page 2 n’a pas pu être chargée. Vous consultez toujours la page 1.'
    );
    await expect(liste.locator('.dsfr-data-list__stale')).toHaveCount(0);
    await expect(liste.locator('tbody tr').first()).toContainText('Commune 01');
  });

  test('avec un bandeau : il dit la panne, chaque bloc dit son heure ; ni bouton ni annonce dans les blocs', async ({
    page,
  }) => {
    const pannes = await serveur(page);
    await ouvrir(page, BUREAU, '?bandeau=1');
    pannes.aides = 503;
    await recharger(page, 'aides');

    const alerte = page.locator('#bandeau .dsfr-data-source-status__alert[data-source="aides"]');
    await expect(alerte.locator('.fr-alert__title')).toHaveText(
      'Une partie des chiffres de cette page n’a pas pu être actualisée'
    );
    await expect(alerte.locator('.dsfr-data-source-status__text')).toHaveText(
      'Le service qui publie ces chiffres ne répond pas pour l’instant. Les derniers chiffres ' +
        'reçus restent affichés, avec l’heure de leur relevé ; le reste de la page est à jour.'
    );
    expect(await alerte.innerText()).not.toMatch(/14 h 32/);
    // Les blocs gardent leur date, sans bouton ni région live
    expect(await texte(page.locator('#g .dsfr-data-status__stale-text'))).toBe(MENTION);
    await expect(page.locator('#g button.dsfr-data-status__retry')).toHaveCount(0);
    await expect(page.locator('#g [role="status"]')).toHaveCount(0);
    await expect(page.locator('#k-beneficiaires button')).toHaveCount(0);
    await expect(page.locator('#k-beneficiaires [role="status"]')).toHaveCount(0);
    await capturer(page, '#page', 'bandeau-releve-bureau');

    // Passé la durée, le bandeau reprend son texte ordinaire, sans geste
    await page.clock.fastForward('01:00:01');
    await expect(alerte.locator('.fr-alert__title')).toHaveText(
      'Une partie des chiffres de cette page est momentanément indisponible'
    );
    // « Réessayer » du bandeau rend tout
    delete pannes.aides;
    await alerte.locator('button').click();
    await expect(page.locator('#k-beneficiaires .dsfr-data-kpi__value')).toHaveText(/7\s541/);
    await expect(page.locator('#bandeau .dsfr-data-source-status__alert')).toHaveCount(0);
  });

  test('un autre jour : la date est écrite en entier', async ({ page }) => {
    const pannes = await serveur(page);
    await ouvrir(page, BUREAU, '?duree=172800');
    pannes.aides = 503;
    await recharger(page, 'aides');
    expect(await texte(page.locator('#g .dsfr-data-status__stale-text'))).toBe(MENTION);
    // Minuit passe : le texte se met à jour de lui-même
    await page.clock.fastForward('10:00:00');
    await expect
      .poll(() => texte(page.locator('#g .dsfr-data-status__stale-text')))
      .toBe('Chiffres relevés le 13 octobre à 14 h 32.');
    expect(
      await texte(
        page.locator('#k-beneficiaires .dsfr-data-kpi__stale-line .dsfr-data-status__title')
      )
    ).toBe('Relevé le 13/10 à 14 h 32 · non actualisé');
  });
});

for (const [nom, viewport] of LARGEURS) {
  test(`thème sombre — contrastes mesurés (${nom})`, async ({ page }) => {
    const pannes = await serveur(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await ouvrir(page, viewport, '?theme=dark');
    for (const [scene, fichier] of [
      ['#s-kpi', 'kpi'],
      ['#s-graphique', 'graphique'],
      ['#s-cadre', 'cadre'],
      ['#s-liste', 'liste'],
      ['#s-tableau', 'tableau'],
      ['#s-carte-seule', 'carte-seule'],
      ['#s-carte-deux', 'carte-deux'],
    ]) {
      await capturer(page, scene, `${fichier}-1-normal-${nom}-sombre`);
    }

    pannes.aides = 503;
    pannes.bornes = 503;
    await recharger(page, 'aides', 'bornes');
    await expect(page.locator('#g .dsfr-data-chart__stale')).toHaveCount(1);
    await expect(page.locator('#carte-seule')).toHaveClass(/dsfr-data-map--stale/);

    // Texte : 4,5:1
    for (const selecteur of [
      '#k-beneficiaires .dsfr-data-kpi__value',
      '#k-beneficiaires .dsfr-data-kpi__stale-line .dsfr-data-status__title',
      '#k-beneficiaires .dsfr-data-kpi__stale-line time',
      '#g .dsfr-data-status__stale-text',
      '#g .dsfr-data-status__stale-badge',
      '#g .dsfr-data-status__stale-time',
      '#g-cadre .dsfr-data-status__stale-text',
      '#liste .dsfr-data-status__stale-text',
      '#acc caption',
      '#acc caption .dsfr-data-status__stale-badge',
      '#carte-seule .dsfr-data-map__layer-status-text',
      '#carte-seule .dsfr-data-map__layer-status time',
      '#carte-seule .dsfr-data-map__layer-status .dsfr-data-status__stale-badge',
    ]) {
      expect(await contraste(page, selecteur), selecteur).toBeGreaterThanOrEqual(4.5);
    }
    // Formes : 3:1, mesuré sur les pixels peints
    for (const [id, cible] of [
      ['g', page.locator('#g canvas').first()],
      ['g-cadre', page.locator('#g-cadre canvas').first()],
      ['carte-seule', formes(page, 'carte-seule', 'forme-seule').first()],
      ['carte-deux bornes', formes(page, 'carte-deux', 'forme-bornes').first()],
      ['carte-deux stations', formes(page, 'carte-deux', 'forme-stations').first()],
    ] as const) {
      const mesure = await contrasteForme(page, cible);
      expect(tousGris(mesure), id).toBe(true);
      expect(mesure.rapport, id).toBeGreaterThanOrEqual(3);
    }
    const filet = await page.locator('#k-beneficiaires .dsfr-data-kpi').evaluate((el) => {
      const s = getComputedStyle(el);
      return { couleur: s.borderLeftColor, fond: s.backgroundColor };
    });
    const rgb = (c: string) => (c.match(/\d+/g) as string[]).slice(0, 3).map(Number) as Rgb;
    expect(rapport(rgb(filet.couleur), rgb(filet.fond))).toBeGreaterThanOrEqual(3);
    expect(await hauteur(page, 'k-beneficiaires')).toBeLessThanOrEqual(141);
    expect(await sansDefilement(page)).toBe(true);
    for (const [scene, fichier] of [
      ['#s-kpi', 'kpi'],
      ['#s-graphique', 'graphique'],
      ['#s-cadre', 'cadre'],
      ['#s-liste', 'liste'],
      ['#s-tableau', 'tableau'],
      ['#s-carte-seule', 'carte-seule'],
      ['#s-carte-deux', 'carte-deux'],
    ]) {
      await capturer(page, scene, `${fichier}-2-releve-${nom}-sombre`);
    }

    await page.clock.fastForward('01:00:01');
    await expect(page.locator('#g .dsfr-data-status--source-error')).toHaveCount(1);
    for (const [scene, fichier] of [
      ['#s-kpi', 'kpi'],
      ['#s-graphique', 'graphique'],
      ['#s-cadre', 'cadre'],
      ['#s-liste', 'liste'],
      ['#s-tableau', 'tableau'],
      ['#s-carte-seule', 'carte-seule'],
      ['#s-carte-deux', 'carte-deux'],
    ]) {
      await capturer(page, scene, `${fichier}-3-echu-${nom}-sombre`);
    }

    delete pannes.aides;
    delete pannes.bornes;
    pannes.retour = 1;
    await recharger(page, 'aides', 'bornes');
    await expect(page.locator('#k-beneficiaires .dsfr-data-kpi__value')).toHaveText(/7\s800/);
    await expect(formes(page, 'carte-seule', 'forme-seule')).toHaveCount(4);
    await expect(page.locator('#g canvas').first()).toBeVisible();
    for (const [scene, fichier] of [
      ['#s-kpi', 'kpi'],
      ['#s-graphique', 'graphique'],
      ['#s-cadre', 'cadre'],
      ['#s-liste', 'liste'],
      ['#s-tableau', 'tableau'],
      ['#s-carte-seule', 'carte-seule'],
      ['#s-carte-deux', 'carte-deux'],
    ]) {
      await capturer(page, scene, `${fichier}-4-retour-${nom}-sombre`);
    }
  });
}

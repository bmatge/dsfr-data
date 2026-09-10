/**
 * Recette des 16 types x 3 variantes API, par interception de route (#625).
 *
 * L'ANGLE MORT QUE CE FICHIER FERME. `builder-ia-recette.spec.ts` rend les
 * 16 types sur une source LOCALE ; `code-generator-recette.test.ts` verifie la
 * FORME du code des trois variantes API hors ligne. Personne n'avait jamais
 * RENDU le cote API — or les deux defauts que la recette a trouves (podium
 * vide, datalist pilotee par script) produisaient un code parfaitement bien
 * forme. Rien ne garantissait que le cote API en soit exempt.
 *
 * ECRIT CONTRE L'EXPORT PARTAGE, PAS CONTRE L'ASSISTANT (arbitrage ADR-106) :
 * la page sous test est celle de `packages/shared/src/dashboard/export-html.ts`,
 * qui sert le Studio ET l'Assistant IA. Un harnais ecrit contre l'Assistant
 * seul serait a refaire, celui-ci ne l'est pas (ADR-099 §4).
 *
 * AUCUN RESEAU REEL, AUCUN SERVEUR. Tout passe par `page.route()` :
 * la page, les actifs CDN, les trois API. Un hote non prevu est refuse et
 * journalise — chaque test le verifie. Voir `api-harness.ts` pour le detail.
 *
 *   npm run build   # une fois : le bundle dist est servi a la place du CDN
 *   npx playwright test --config tests/builder-e2e/playwright.config.ts \
 *     export-html-api-recette
 */

import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

import type { ChartConfig } from '../../packages/shared/src/dashboard/chart-config.js';
import {
  ID_SOURCE,
  LIBELLE_VARIANTE,
  TAILLE_DE_PAGE,
  VARIANTES,
  appelsContenant,
  configListe,
  installerHarnais,
  pagePartagee,
  pagePour,
  verifierBundleConstruit,
  type Harnais,
} from './api-harness.js';
import { CHAMP_PIEGE, JEU, NOMBRE_DE_LIGNES, ODS_PAGE_SIZE } from './api-fixtures.js';

const TYPES: ChartConfig['type'][] = [
  'bar',
  'line',
  'pie',
  'doughnut',
  'radar',
  'horizontalBar',
  'scatter',
  'gauge',
  'kpi',
  'map',
  'bar-line',
  'map-reg',
  'map-aca',
  'map-monde',
  'datalist',
  'podium',
];

/**
 * Erreurs console tolerees. La liste est PLUS COURTE que celle de la recette
 * locale : ici rien ne vient du reseau, donc plus aucun `net::ERR_` ni
 * `Failed to load resource` n'est acceptable — un tel message signalerait une
 * fuite du harnais.
 */
const TOLEREES = [/favicon/i];

/** Le champ geographique coherent pour chaque type de carte. */
const CHAMP_GEO: Record<string, string> = {
  map: 'code_dept',
  'map-reg': 'code_reg',
  'map-aca': 'academie',
  'map-monde': 'pays_iso2',
};

/**
 * Configuration COHERENTE pour chaque type — celle qu'un assistant bien
 * eleve produit. Les cartes groupent sur leur champ geographique : agreger
 * sur `region` en gardant `code-field="code_dept"` perdrait le code a
 * l'agregation, et la carte se rendrait vide. Ce cas-la a son propre test
 * plus bas, il n'a pas a polluer la matrice.
 */
function configPour(type: ChartConfig['type']): ChartConfig {
  const base: ChartConfig = {
    type,
    labelField: 'region',
    valueField: 'population',
    aggregation: 'sum',
    sortOrder: 'desc',
    title: `Recette ${type}`,
  };
  const geo = CHAMP_GEO[type];
  if (geo) return { ...base, labelField: geo, codeField: geo };
  if (type === 'kpi') return { ...base, unit: 'hab.' };
  if (type === 'podium') return { ...base, limit: 3, unit: 'hab.' };
  if (type === 'datalist') return configListe();
  return base;
}

/** Le composant d'affichage qu'`export-html` emet pour ce type. */
function selecteurPour(type: ChartConfig['type']): string {
  if (type === 'kpi') return 'dsfr-data-kpi';
  if (type === 'datalist') return 'dsfr-data-list';
  if (type === 'podium') return 'dsfr-data-podium';
  return 'dsfr-data-chart';
}

/** Vue interne des composants d'affichage (mixin SourceSubscriber). */
interface VueAbonne extends Element {
  _sourceData?: unknown;
  getSkippedCount?: () => number;
}

/** Nombre de lignes REELLEMENT recues par le composant d'affichage. */
async function lignesRecues(page: Page, selecteur: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as (Element & { _sourceData?: unknown }) | null;
    const donnees = el?._sourceData;
    return Array.isArray(donnees) ? donnees.length : -1;
  }, selecteur);
}

/** Collecte les erreurs console non tolerees. */
function collecterErreurs(page: Page): string[] {
  const erreurs: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const texte = msg.text();
    if (!TOLEREES.some((r) => r.test(texte))) erreurs.push(texte);
  });
  page.on('pageerror', (err) => erreurs.push(`pageerror: ${err.message}`));
  return erreurs;
}

test.beforeAll(() => {
  verifierBundleConstruit();
});

let harnais: Harnais;

test.beforeEach(async ({ page }) => {
  harnais = await installerHarnais(page);
});

test.describe('les 16 types rendent sur les 3 variantes API', () => {
  for (const type of TYPES) {
    for (const variante of VARIANTES) {
      test(`${type} — ${LIBELLE_VARIANTE[variante]}`, async ({ page }) => {
        const erreurs = collecterErreurs(page);
        const selecteur = selecteurPour(type);

        await harnais.ouvrir(pagePour(configPour(type), variante));

        // 1. Le composant a REELLEMENT recu des lignes. Mesure attentiste :
        //    le bundle, la source et le bus s'enchainent apres le parsing.
        await expect
          .poll(() => lignesRecues(page, selecteur), {
            timeout: 20_000,
            message: `${selecteur} n'a recu aucune ligne`,
          })
          .toBeGreaterThan(0);

        // 2. Le rendu produit des pixels, pas une balise vide.
        const composant = page.locator(selecteur);
        await expect
          .poll(() => composant.evaluate((el) => el.getBoundingClientRect().height), {
            timeout: 20_000,
            message: 'le composant ne rend rien',
          })
          .toBeGreaterThan(30);

        // 3. Une carte qui ecarte toutes ses lignes faute de code
        //    geographique se rend « normalement » : vide, sans erreur. C'est
        //    le defaut de classe « podium vide », version cartographique.
        if (CHAMP_GEO[type]) {
          const ecartees = await composant.evaluate(
            (el) => (el as VueAbonne).getSkippedCount?.() ?? -1
          );
          expect(ecartees, 'lignes ecartees faute de code geographique').toBe(0);
        }

        // 4. Aucune sortie vers un hote non prevu.
        expect(harnais.journal.inattendues, 'fuite reseau').toEqual([]);
        expect(erreurs, `erreurs console pour ${type} / ${variante}`).toEqual([]);
      });
    }
  }
});

test.describe('les etiquettes et colonnes piegeuses traversent l’API', () => {
  for (const variante of VARIANTES) {
    test(`datalist — « Val-d'Oise » et « ${CHAMP_PIEGE} » (${LIBELLE_VARIANTE[variante]})`, async ({
      page,
    }) => {
      const erreurs = collecterErreurs(page);
      await harnais.ouvrir(pagePour(configPour('datalist'), variante));

      const liste = page.locator('dsfr-data-list');
      // L'en-tete vient de l'attribut `columns`, dont la valeur porte une
      // apostrophe : elle a deja disloque l'attribut une fois (#615).
      await expect(liste.getByRole('columnheader', { name: 'Habitants' })).toBeVisible({
        timeout: 20_000,
      });
      // Val-d'Oise porte la plus forte valeur du jeu : avec le tri
      // descendant, elle est en tete de la premiere page.
      await expect(liste.getByText("Val-d'Oise", { exact: false }).first()).toBeVisible({
        timeout: 20_000,
      });
      // Une cellule vide signalerait une colonne lue sous un autre nom.
      const habitants = await liste.locator('tbody tr').first().locator('td').last().textContent();
      expect(habitants?.trim(), 'colonne a apostrophe non lue').not.toBe('');

      expect(harnais.journal.inattendues).toEqual([]);
      expect(erreurs).toEqual([]);
    });
  }

  test('ODS agrege sur le nom de colonne a apostrophe, backquote', async ({ page }) => {
    // `escapeOdsqlIdentifier` (#289) doit entourer le champ de backquotes :
    // sans elles, ODS repond 400 et le graphique reste vide.
    await harnais.ouvrir(pagePour({ ...configPour('bar'), valueField: CHAMP_PIEGE }, 'ods'));

    await expect
      .poll(() => lignesRecues(page, 'dsfr-data-chart'), { timeout: 20_000 })
      .toBeGreaterThan(0);

    const agregations = appelsContenant(harnais.journal, `sum(\`${CHAMP_PIEGE}\`)`);
    expect(agregations.length, 'aucune agregation ODS sur le champ piegeux').toBeGreaterThan(0);
  });
});

test.describe('la pagination des adaptateurs enchaine reellement', () => {
  // Documents a SOURCE PARTAGEE : c'est desormais la forme qui charge tout le
  // jeu, la liste seule paginant cote serveur (ADR-109).
  test(`ODS — la seconde page est demandee avec offset=${ODS_PAGE_SIZE}`, async ({ page }) => {
    // Le jeu depasse ODS_PAGE_SIZE : `fetchAll` doit enchainer une seconde
    // requete. A 100 lignes ou moins, ce chemin n'existerait pas.
    await harnais.ouvrir(pagePartagee('ods'));

    await expect
      .poll(() => lignesRecues(page, 'dsfr-data-list'), { timeout: 20_000 })
      .toBe(NOMBRE_DE_LIGNES);

    expect(
      appelsContenant(harnais.journal, `offset=${ODS_PAGE_SIZE}`).length,
      'la seconde page ODS n’a pas ete demandee'
    ).toBeGreaterThan(0);
    expect(harnais.journal.inattendues).toEqual([]);
  });

  test('Tabular — les pages s’enchainent via links.next', async ({ page }) => {
    await harnais.ouvrir(pagePartagee('tabular'));

    await expect
      .poll(() => lignesRecues(page, 'dsfr-data-list'), { timeout: 20_000 })
      .toBe(NOMBRE_DE_LIGNES);

    expect(appelsContenant(harnais.journal, 'page=2').length).toBeGreaterThan(0);
    expect(harnais.journal.inattendues).toEqual([]);
  });
});

test.describe('pagination serveur emise par l’export (ADR-109, #717)', () => {
  const TAILLE = TAILLE_DE_PAGE;

  test('la source d’une liste seule porte server-side et page-size', async () => {
    // Garde-fou de FORME sur le document reellement monte par les tests
    // suivants : sans lui, un echec de rendu ne dirait pas si la regle
    // d'emission ou le composant est en cause.
    const html = pagePour(configPour('datalist'), 'ods');
    expect(html).toContain(`server-side page-size="${TAILLE}"`);
    expect(html).toContain('server-sort');
    expect(html).not.toContain('fetch-mode');
  });

  test('ODS — la page 2 est demandee et affichee', async ({ page }) => {
    const erreurs = collecterErreurs(page);
    await harnais.ouvrir(pagePour(configPour('datalist'), 'ods'));

    const liste = page.locator('dsfr-data-list');
    await expect.poll(() => lignesRecues(page, 'dsfr-data-list'), { timeout: 20_000 }).toBe(TAILLE);

    // La pagination DSFR est faite de boutons ; leur nom accessible est la
    // position complete (« Page 2 sur 14 »).
    await liste
      .getByRole('button', { name: /^Page 2( sur|$)/ })
      .first()
      .click();

    // La requete porte le decalage d'une page, et les lignes affichees sont
    // celles de la page 2 du tri descendant — pas celles de la page 1.
    await expect
      .poll(() => appelsContenant(harnais.journal, `offset=${TAILLE}`).length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    const attendue = [...JEU].sort((a, b) => b.population - a.population)[TAILLE].region;
    await expect(liste.getByText(attendue, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });

    expect(harnais.journal.inattendues).toEqual([]);
    expect(erreurs).toEqual([]);
  });

  test('le tri delegue emet une commande orderBy', async ({ page }) => {
    await harnais.ouvrir(pagePour(configPour('datalist'), 'ods'));

    await expect.poll(() => lignesRecues(page, 'dsfr-data-list'), { timeout: 20_000 }).toBe(TAILLE);

    await page
      .locator('dsfr-data-list')
      .getByRole('button', { name: 'Trier par Territoire' })
      .click();

    const commandes = await page.evaluate(
      () => (window as Window & { __commandes?: Array<Record<string, unknown>> }).__commandes ?? []
    );
    const tris = commandes.filter((c) => typeof c.orderBy === 'string' && c.orderBy !== '');
    expect(
      tris.map((c) => c.orderBy),
      'aucune commande de tri sur le bus'
    ).toContain('region:asc');
    // La commande vise bien la source, pas un id fantome.
    expect(tris.some((c) => c.sourceId === ID_SOURCE)).toBe(true);
    // Et elle repart en requete : le tri delegue serait inutile sans cela.
    await expect
      .poll(() => appelsContenant(harnais.journal, 'order_by=region ASC').length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
  });
});

test.describe('une source partagee garde ses chiffres (ADR-109, #717)', () => {
  /** Le total que le KPI doit afficher : la somme sur le jeu ENTIER. */
  const SOMME = JEU.reduce((total, ligne) => total + ligne.population, 0);

  for (const variante of ['ods', 'tabular'] as const) {
    test(`${LIBELLE_VARIANTE[variante]} — le KPI totalise les ${NOMBRE_DE_LIGNES} lignes`, async ({
      page,
    }) => {
      // LA REGRESSION SILENCIEUSE QUE LA REGLE INTERDIT. Une source n'est
      // emise qu'une fois : si l'export posait `server-side` parce qu'une
      // liste paginee la consomme, le KPI d'a cote ne recevrait plus qu'une
      // page de dix lignes et afficherait un total FAUX — sans erreur, sur un
      // HTML parfaitement bien forme. Seul un rendu peut le voir.
      const erreurs = collecterErreurs(page);
      const html = pagePartagee(variante);
      expect(html, 'une source partagee ne doit jamais paginer cote serveur').not.toContain(
        'server-side'
      );

      await harnais.ouvrir(html);

      // Le KPI et la liste partagent la meme balise : tous deux recoivent le
      // jeu entier.
      await expect
        .poll(() => lignesRecues(page, 'dsfr-data-kpi'), { timeout: 20_000 })
        .toBe(NOMBRE_DE_LIGNES);
      await expect
        .poll(() => lignesRecues(page, 'dsfr-data-list'), { timeout: 20_000 })
        .toBe(NOMBRE_DE_LIGNES);

      // Et le chiffre AFFICHE est le bon. Compare sur les seuls chiffres :
      // le format « nombre » insere des separateurs de milliers insecables.
      await expect
        .poll(
          async () =>
            ((await page.locator('dsfr-data-kpi').first().textContent()) ?? '').replace(/\D/g, ''),
          { timeout: 20_000, message: 'le KPI n’affiche pas le total du jeu entier' }
        )
        .toContain(String(SOMME));

      expect(harnais.journal.inattendues).toEqual([]);
      expect(erreurs).toEqual([]);
    });
  }
});

test.describe('le champ de code survit a l’agregation', () => {
  test('map — group-by sur region, code-field code_dept', async ({ page }) => {
    // LE DEFAUT QUE CETTE RECETTE A TROUVE. Configuration la plus naturelle
    // cote assistant (« population par region, coloriee par departement ») :
    // `export-html` emettait group-by="region" seul, les lignes agregees ne
    // portaient plus de `code_dept`, et la carte ecartait ses 137 lignes pour
    // se rendre VIDE — sans erreur, sur un HTML bien forme. Corrige en
    // ajoutant le champ de code au group-by ; garde-fou de rendu ici,
    // garde-fou de forme dans tests/shared/dashboard-export-html.test.ts.
    await harnais.ouvrir(
      pagePour(
        {
          type: 'map',
          labelField: 'region',
          valueField: 'population',
          codeField: 'code_dept',
          aggregation: 'sum',
          title: 'Carte agregee par region',
        },
        'ods'
      )
    );

    const carte = page.locator('dsfr-data-chart');
    await expect
      .poll(() => lignesRecues(page, 'dsfr-data-chart'), { timeout: 20_000 })
      .toBeGreaterThan(0);

    const ecartees = await carte.evaluate((el) => (el as VueAbonne).getSkippedCount?.() ?? -1);
    expect(ecartees, 'le champ de code ne survit pas au group-by : carte vide et silencieuse').toBe(
      0
    );
  });
});

test.describe('mode export ODS (#689, ADR-106)', () => {
  // Le faux serveur `/exports/json` sert un tableau nu et respecte `limit`
  // (cf. api-fixtures.test.ts) ; l'attribut est livre par #689.
  //
  // POSE SUR LE DOCUMENT A SOURCE PARTAGEE, et c'est le point : `fetch-mode`
  // et `server-side` s'excluent par construction (dsfr-data-source pose alors
  // un attribut de diagnostic et reste sur l'endpoint pagine). Une source
  // partagee etant precisement celle qu'ADR-109 laisse en chargement complet,
  // c'est la seule ou l'export a un sens — et la seule ou les deux ne peuvent
  // pas se croiser.
  test('fetch-mode="export" charge tout en une requete', async ({ page }) => {
    const base = pagePartagee('ods');
    expect(base, 'fetch-mode ne doit jamais croiser server-side').not.toContain('server-side');
    const html = base.replace(
      /<dsfr-data-source id="([^"]+)"/,
      '<dsfr-data-source fetch-mode="export" id="$1"'
    );
    await harnais.ouvrir(html);

    await expect
      .poll(() => lignesRecues(page, 'dsfr-data-list'), { timeout: 20_000 })
      .toBe(NOMBRE_DE_LIGNES);

    expect(appelsContenant(harnais.journal, '/exports/json').length).toBe(1);
    expect(appelsContenant(harnais.journal, '/records').length).toBe(0);
    // `limit` = plafond + 1 : c'est le seul moyen de detecter une troncature
    // sans `total_count`.
    expect(appelsContenant(harnais.journal, 'limit=1001').length).toBe(1);
  });
});

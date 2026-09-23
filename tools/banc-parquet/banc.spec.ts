/**
 * Banc Parquet (#1022) — mesure, ne verifie rien de la bibliotheque.
 *
 * Pour chaque jeu x scenario x profil : 3 repetitions, chacune dans un
 * contexte de navigateur neuf (cache HTTP vide). Les octets et requetes sont
 * comptes par le protocole DevTools (`Network.loadingFinished`), pas par
 * `performance.getEntriesByType('resource')` : sans `Timing-Allow-Origin`,
 * les hotes de data.gouv renvoient `transferSize = 0` en cross-origin.
 *
 * Chaque mesure est ajoutee a out/mesures.jsonl ; rapport.ts (globalTeardown)
 * en tire resultats-AAAA-MM-JJ.md.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  JEUX,
  FRAICHEUR,
  PLAFOND_ADAPTATEUR,
  FAST_3G,
  PORT,
  consigner,
  type Jeu,
  type Profil,
} from './commun';

const REPETITIONS = Number(process.env.BANC_REPETITIONS || 3);
const PROFILS: Profil[] = (process.env.BANC_PROFILS || 'poste,mobile').split(',') as Profil[];
/**
 * Scenarios et plafonds. Le 2026-09-22, deux passages enchainant B et C a
 * 25 000 lignes (≈ 250 requetes en 15 s, 700 en quelques minutes) ont fait
 * REFUSER les connexions de ce poste par tabular-api ET www.data.gouv.fr
 * pendant 58 min (ECONNREFUSED). D'ou :
 *  - B et C au plafond #1020 (1 000 lignes, 5 requetes), 3 repetitions ;
 *  - B au plafond de l'adaptateur (25 000 lignes, 125 requetes) UNE fois par
 *    jeu et par profil, precede d'une longue pause ;
 *  - C a 25 000 lignes (≈ 80 requetes/s) NON mesure.
 */
const SCENARIOS = ['A', 'B1k', 'C1k', 'B25k'] as const;
type Scenario = (typeof SCENARIOS)[number];
const PLAFOND: Record<Scenario, number> = {
  A: 0,
  B1k: 1_000,
  C1k: 1_000,
  B25k: PLAFOND_ADAPTATEUR,
};
const REPS: Record<Scenario, number> = {
  A: REPETITIONS,
  B1k: REPETITIONS,
  C1k: REPETITIONS,
  B25k: 1,
};
const PAUSE: Record<Scenario, number> = {
  A: 0,
  B1k: Number(process.env.BANC_PAUSE_MS || 10_000),
  C1k: Number(process.env.BANC_PAUSE_MS || 10_000),
  B25k: Number(process.env.BANC_PAUSE_LONGUE_MS || 150_000),
};

/** Retour commun des scenarios (page/banc.js). */
interface Mesure {
  ttfr: number;
  total: number;
  lignes: number;
  totalServeur: number;
  picOctets: number;
  retenuOctets: number;
  [cle: string]: number;
}

/** Surface exposee par page/banc.js (`window.banc`). */
interface BancPage {
  importer(): Promise<{ ms: number }>;
  scenarioA(a: unknown): Promise<Mesure>;
  scenarioTabular(a: unknown): Promise<Mesure>;
  schema(a: unknown): Promise<Record<string, unknown>>;
  sommeParquet(a: unknown): Promise<Record<string, number>>;
}
type W = Window & { banc: BancPage };
type NavigatorConnexion = Navigator & {
  connection?: { effectiveType: string; downlink: number; rtt: number };
};

interface Compteur {
  octets: Record<string, number>;
  requetes: Record<string, number>;
  preflights: number;
  /** Statuts HTTP hors 2xx et echecs reseau, par hote : `tabular 429` -> n. */
  anomalies: Record<string, number>;
}

function hote(url: string): string {
  if (url.includes('hydra.s3')) return 's3';
  if (url.includes('tabular-api')) return 'tabular';
  if (url.includes('www.data.gouv.fr')) return 'datagouv';
  if (url.includes('jsdelivr')) return 'cdn';
  return 'local';
}

async function ouvrir(browser: Browser, profil: Profil) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const urls = new Map<string, string>();
  const compteur: Compteur = { octets: {}, requetes: {}, preflights: 0, anomalies: {} };
  cdp.on('Network.requestWillBeSent', (e) => {
    urls.set(e.requestId, e.request.url);
    if (e.request.method === 'OPTIONS') compteur.preflights++;
  });
  const anomalie = (cle: string) => {
    compteur.anomalies[cle] = (compteur.anomalies[cle] || 0) + 1;
  };
  cdp.on('Network.responseReceived', (e) => {
    if (e.response.status >= 300) anomalie(`${hote(e.response.url)} ${e.response.status}`);
  });
  cdp.on('Network.loadingFailed', (e) => {
    anomalie(
      `${hote(urls.get(e.requestId) || '')} ${e.blockedReason || e.corsErrorStatus?.corsError || e.errorText}`
    );
  });
  cdp.on('Network.loadingFinished', (e) => {
    const h = hote(urls.get(e.requestId) || '');
    compteur.octets[h] = (compteur.octets[h] || 0) + e.encodedDataLength;
    compteur.requetes[h] = (compteur.requetes[h] || 0) + 1;
  });
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForFunction(() => (window as unknown as { banc?: unknown }).banc);
  if (profil === 'mobile') {
    await cdp.send('Network.emulateNetworkConditions', FAST_3G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  const remettre = () => {
    compteur.octets = {};
    compteur.requetes = {};
    compteur.preflights = 0;
    compteur.anomalies = {};
  };
  return { context, page, cdp, compteur, remettre };
}

async function executer(page: Page, jeu: Jeu, scenario: Scenario): Promise<Mesure> {
  const args = { rid: jeu.rid, colonnes: jeu.colonnes, plafond: PLAFOND[scenario] };
  if (scenario === 'A') {
    return page.evaluate((a) => (window as unknown as W).banc.scenarioA(a), args);
  }
  const parallele = scenario.startsWith('C') ? 4 : 1;
  return page.evaluate((a) => (window as unknown as W).banc.scenarioTabular(a), {
    ...args,
    parallele,
  });
}

test.describe.configure({ mode: 'serial' });

test('environnement', async ({ browser }) => {
  const { context, page } = await ouvrir(browser, 'poste');
  const nav = await page.evaluate(() => {
    const c = (navigator as NavigatorConnexion).connection;
    return {
      userAgent: navigator.userAgent,
      cpus: navigator.hardwareConcurrency,
      connexion: c ? { type: c.effectiveType, downlinkMbps: c.downlink, rttMs: c.rtt } : null,
    };
  });
  // Latence de l'API tabulaire depuis ce poste : 3 requetes minimales.
  const lat: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    await fetch(`https://tabular-api.data.gouv.fr/api/resources/${JEUX[0].rid}/data/?page_size=1`);
    lat.push(performance.now() - t0);
  }
  consigner({
    type: 'env',
    navigateur: browser.version(),
    ...nav,
    latenceTabularMs: lat,
    debut: new Date().toISOString(),
  });
  await context.close();
});

for (const profil of PROFILS) {
  for (const jeu of JEUX) {
    for (const scenario of SCENARIOS) {
      test(`${profil} · ${jeu.cle} · ${scenario}`, async ({ browser }) => {
        test.setTimeout(20 * 60_000);
        for (let rep = 1; rep <= REPS[scenario]; rep++) {
          await new Promise((ok) => setTimeout(ok, PAUSE[scenario]));
          const { context, page, compteur, remettre } = await ouvrir(browser, profil);
          let importMs: number | null = null;
          let importOctets: number | null = null;
          if (scenario === 'A') {
            remettre();
            const imp = await page.evaluate(() => (window as unknown as W).banc.importer());
            importMs = imp.ms;
            importOctets = compteur.octets.cdn || 0;
          }
          remettre();
          const r = await executer(page, jeu, scenario);
          expect(r.lignes).toBeGreaterThan(0);
          consigner({
            type: 'mesure',
            profil,
            jeu: jeu.cle,
            scenario,
            rep,
            ...r,
            importMs,
            importOctets,
            octets: { ...compteur.octets },
            requetes: { ...compteur.requetes },
            preflights: compteur.preflights,
            anomalies: { ...compteur.anomalies },
            horodatage: new Date().toISOString(),
          });
          await context.close();
        }
      });
    }
  }
}

// Jeu entier par l'API (C, 4 en vol), une fois, poste : meme nombre de lignes
// que Parquet, pour la comparaison « a lignes egales ». Opt-in (1 100+ requetes).
test('poste · irve · C jeu entier', async ({ browser }) => {
  test.skip(!process.env.BANC_JEU_ENTIER, 'BANC_JEU_ENTIER=1 pour la lancer');
  test.setTimeout(30 * 60_000);
  const jeu = JEUX[1];
  await new Promise((ok) => setTimeout(ok, PAUSE.B25k * 2));
  const { context, page, compteur, remettre } = await ouvrir(browser, 'poste');
  remettre();
  const r = await page.evaluate((a) => (window as unknown as W).banc.scenarioTabular(a), {
    rid: jeu.rid,
    colonnes: jeu.colonnes,
    plafond: 0,
    parallele: 4,
  });
  consigner({
    type: 'jeu-entier',
    profil: 'poste',
    jeu: jeu.cle,
    scenario: 'C',
    ...r,
    octets: { ...compteur.octets },
    requetes: { ...compteur.requetes },
    anomalies: { ...compteur.anomalies },
  });
  await context.close();
});

test('typage et intégrité', async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const { context, page } = await ouvrir(browser, 'poste');
  await page.evaluate(() => (window as unknown as W).banc.importer());
  for (const jeu of JEUX) {
    const schema = await page.evaluate((a) => (window as unknown as W).banc.schema(a), {
      rid: jeu.rid,
    });
    const profile = await (
      await fetch(`https://tabular-api.data.gouv.fr/api/resources/${jeu.rid}/profile/`)
    ).json();
    const somme = await page.evaluate((a) => (window as unknown as W).banc.sommeParquet(a), {
      rid: jeu.rid,
      colonne: jeu.somme,
    });
    const base = `https://tabular-api.data.gouv.fr/api/resources/${jeu.rid}/data/`;
    const total = (await (await fetch(`${base}?page_size=1`)).json()).meta.total;
    const agg = (await (await fetch(`${base}?${encodeURIComponent(jeu.somme)}__sum`)).json())
      .data[0][`${jeu.somme}__sum`];
    consigner({
      type: 'typage',
      jeu: jeu.cle,
      schema,
      profile: profile.profile.columns,
    });
    consigner({
      type: 'integrite',
      jeu: jeu.cle,
      colonne: jeu.somme,
      parquet: somme,
      tabular: { total, somme: agg },
    });
  }
  await context.close();
});

test('fraîcheur', async () => {
  for (const rid of FRAICHEUR) {
    const j = await (
      await fetch(`https://www.data.gouv.fr/api/2/datasets/resources/${rid}/`)
    ).json();
    const r = j.resource || j;
    consigner({
      type: 'fraicheur',
      rid,
      titre: r.title,
      lastModified: r.last_modified,
      contenuModifie: r.extras?.['analysis:last-modified-at'] ?? null,
      finishedAt: r.extras?.['analysis:parsing:finished_at'] ?? null,
      parquet: Boolean(r.extras?.['analysis:parsing:parquet_url']),
      parquetTaille: r.extras?.['analysis:parsing:parquet_size'] ?? null,
      fichierTaille: r.filesize ?? null,
    });
  }
});

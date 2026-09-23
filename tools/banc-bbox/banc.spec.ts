/**
 * Banc « zone visible » simulee (#1023) — mesure, ne verifie rien de la lib.
 *
 * Les requetes vers l'API tabulaire partent de Node (`fetch`) : on mesure le
 * serveur, pas un rendu. Seule l'exactitude passe par le navigateur, qui relit
 * le jeu ENTIER depuis l'export Parquet (hyparquet via CDN) pour compter les
 * points d'un rectangle sans 1 000+ requetes a l'API — lesquelles font bloquer
 * l'adresse IP par data.gouv.fr (constate le 2026-09-22, voir README).
 *
 * Chaque bloc consigne dans out/mesures.jsonl ; rapport.ts (globalTeardown)
 * ecrit resultats-AAAA-MM-JJ.md.
 */
import { test } from '@playwright/test';
import {
  JEUX,
  RECTS,
  PORT,
  T,
  attendre,
  clauses,
  colonnes,
  consigner,
  lire,
  type Rect,
  type Reponse,
} from './commun';

const REPETITIONS = Number(process.env.BANC_REPETITIONS || 3);
/** Pause entre deux series de requetes, pour ne pas declencher le blocage IP. */
const PAUSE = Number(process.env.BANC_PAUSE_MS || 20_000);

type W = Window & {
  banc: {
    compter(a: unknown): Promise<{
      lignes: number;
      sansCoord: number;
      res: {
        rect: string;
        exact: number;
        client25k: number;
        bandeLat: number;
        texte: number | null;
      }[];
    }>;
  };
};

test.describe.configure({ mode: 'serial' });

test('rectangles', async () => {
  test.setTimeout(20 * 60_000);
  for (const j of JEUX) {
    for (const r of RECTS) {
      for (const avec of [true, false]) {
        const url = `${T}${j.rid}/data/?${clauses(j, r)}&page_size=200${avec ? '&' + colonnes(j) : ''}`;
        const essais: Reponse[] = [];
        for (let i = 0; i < REPETITIONS; i++) {
          essais.push(await lire(url));
          await attendre(500);
        }
        consigner({
          type: 'rectangle',
          jeu: j.cle,
          rect: r.cle,
          colonnes: avec,
          ms: essais.map((e) => e.ms),
          octets: essais.map((e) => e.octets),
          statut: essais.map((e) => e.statut),
          total: essais[0].total,
        });
      }
    }
    await attendre(PAUSE);
  }
});

test('exactitude (Parquet, jeu entier)', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForFunction(() => (window as unknown as { banc?: unknown }).banc);
  for (const j of JEUX) {
    const r = await page.evaluate((a) => (window as unknown as W).banc.compter(a), {
      rid: j.rid,
      lat: j.lat,
      lon: j.lon,
      rects: RECTS,
    });
    consigner({ type: 'exactitude', jeu: j.cle, ...r });
  }
});

test('séquence pan', async () => {
  test.setTimeout(20 * 60_000);
  const irve = JEUX[0];
  const pas: Rect[] = Array.from({ length: 10 }, (_, i) => ({
    ...RECTS[0],
    o: RECTS[0].o + i * 0.004,
    e: RECTS[0].e + i * 0.004,
  }));
  const url = (r: Rect) =>
    `${T}${irve.rid}/data/?${clauses(irve, r)}&page_size=200&${colonnes(irve)}`;
  for (let rep = 1; rep <= REPETITIONS; rep++) {
    // a. sans anti-rebond ni annulation : 10 requetes, on attend la derniere.
    {
      const t0 = performance.now();
      const fins: number[] = [];
      const reps = await Promise.all(
        pas.map(async (r, i) => {
          await attendre(i * 100);
          const x = await lire(url(r));
          fins[i] = performance.now() - t0;
          return x;
        })
      );
      consigner({
        type: 'pan',
        rep,
        strategie: 'sans anti-rebond, sans annulation',
        envoyees: 10,
        derniereDonnee: fins[9] - 900,
        serveurMs: reps.map((x) => x.ms),
        octets: reps.reduce((s, x) => s + x.octets, 0),
        statuts: reps.map((x) => x.statut),
      });
    }
    await attendre(PAUSE);
    // b. annulation client de la precedente (AbortController, comme
    //    dsfr-data-source en mode adaptateur) : le serveur calcule quand meme.
    {
      const t0 = performance.now();
      let ctrl: AbortController | null = null;
      let annulees = 0;
      let derniere = NaN;
      await Promise.all(
        pas.map(async (r, i) => {
          await attendre(i * 100);
          ctrl?.abort();
          const c = new AbortController();
          ctrl = c;
          try {
            await lire(url(r), c.signal);
            if (i === 9) derniere = performance.now() - t0 - 900;
          } catch {
            annulees++;
          }
        })
      );
      consigner({
        type: 'pan',
        rep,
        strategie: 'sans anti-rebond, annulation client',
        envoyees: 10,
        annulees,
        derniereDonnee: derniere,
      });
    }
    await attendre(PAUSE);
    // c. anti-rebond de 300 ms (defaut de `bbox-debounce`).
    {
      const t0 = performance.now();
      let minuterie: ReturnType<typeof setTimeout> | null = null;
      let envoyees = 0;
      const d = await new Promise<number>((ok) => {
        pas.forEach((r, i) =>
          setTimeout(() => {
            if (minuterie) clearTimeout(minuterie);
            minuterie = setTimeout(async () => {
              envoyees++;
              await lire(url(r));
              ok(performance.now() - t0 - 900);
            }, 300);
          }, i * 100)
        );
      });
      consigner({
        type: 'pan',
        rep,
        strategie: 'anti-rebond 300 ms (défaut)',
        envoyees,
        derniereDonnee: d,
      });
    }
    await attendre(PAUSE);
  }
});

test('premier affichage', async () => {
  test.setTimeout(20 * 60_000);
  const irve = JEUX[0];
  const base = `${T}${irve.rid}/data/?page_size=200&${colonnes(irve)}`;
  // Pages sequentielles, comme TabularAdapter.fetchAll : la source ne publie
  // qu'apres la derniere page, le premier point s'affiche donc a la fin.
  const seq = async (prefixe: string, plafond: number) => {
    const t0 = performance.now();
    let n = 0;
    let requetes = 0;
    let octets = 0;
    for (let p = 1; n < plafond; p++) {
      const r = await lire(`${prefixe}&page=${p}`);
      requetes++;
      octets += r.octets;
      n += r.lignes;
      if (r.lignes < 200) break;
    }
    return { ms: performance.now() - t0, lignes: Math.min(n, plafond), requetes, octets };
  };
  const bbox75 = `${base}&${clauses(irve, RECTS[1])}`;
  const cas: [string, string, number][] = [
    ['sans filtre, limit 1 000 (#1020, référence « avant »)', base, 1_000],
    ['require-where + bbox Paris (75), limit 1 000', bbox75, 1_000],
    ['require-where + bbox Paris (75), plafond 25 000', bbox75, 25_000],
  ];
  for (const [nom, url, plafond] of cas) {
    const essais = [];
    // 25 000 lignes : une seule mesure (≈ 70 requetes), blocage IP oblige.
    const n = plafond > 1_000 ? 1 : REPETITIONS;
    for (let i = 0; i < n; i++) {
      essais.push(await seq(url, plafond));
      await attendre(PAUSE / 4);
    }
    consigner({
      type: 'premier',
      cas: nom,
      ms: essais.map((e) => e.ms),
      lignes: essais[0].lignes,
      requetes: essais[0].requetes,
      octets: essais[0].octets,
    });
  }
});

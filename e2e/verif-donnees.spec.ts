import { test, expect, type Page, type Route } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { controlesDuMode } from '../tests/verif-donnees/index.js';
import { repondre } from '../tests/verif-donnees/fixtures.js';
import type { Action, Check, Expect } from '../tools/oracle/manifest.js';
import { computeExpectedFor, cleAttendu, type ExpectedCheck } from '../tools/oracle/expected.js';
import { comparer, type Constat, type Observation } from '../tools/oracle/compare.js';
import {
  lireAttribut,
  lireCache,
  lireClasses,
  lireExportCsv,
  lireFacettes,
  lireGraphique,
  lireKpi,
  lireLegende,
  lireListe,
  lirePastilles,
  lireTexte,
  lireTextes,
} from '../tools/oracle/observe.js';
import { toRgb } from '../tools/oracle/compute.js';
import { DOSSIER_SORTIE, ecrireRapport } from '../tools/oracle/report.js';
import { lireJusquAStabilite } from '../tools/oracle/stabilite.js';

/**
 * VÉRIFICATION DES DONNÉES — un seul spec, deux alimentations (ADR-122).
 *
 * La bibliothèque rend un balisage `dsfr-data-*` et l'on lit ce qu'elle
 * AFFICHE ; l'oracle (`tools/oracle`) repart des lignes BRUTES et recalcule en
 * tableaux nus, sans rien lui emprunter. Un écart à la précision affichée est
 * un échec.
 *
 *   `npm run verif`       — mode DÉTERMINISTE (défaut) : les réponses d'API
 *      sont servies par `page.route` depuis `tests/verif-donnees/fixtures.ts`,
 *      et l'oracle recalcule depuis les MÊMES lignes. Zéro réseau, bloquant
 *      sur chaque PR.
 *   `npm run verif:live`  — mode VIVANT (`VERIF_MODE=live`) : l'attendu vient
 *      de `tools/oracle/out/expected.json`, produit juste avant par
 *      `verif:expected` contre les vraies API. Jamais bloquant.
 *
 * Le rapport de fin de run est écrit dans `tools/oracle/out/report.{json,txt}`.
 */

const ICI = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(ICI, 'verif-donnees');
const EXPECTED_PATH = resolve(DOSSIER_SORTIE, 'expected.json');

const MODE = process.env.VERIF_MODE === 'live' ? 'live' : 'deterministic';

/** Hôtes de tuiles : une carte en demande, personne ne les sert, ce n'est pas une fuite. */
const TUILES = /tile\.|openstreetmap|geopf\.fr|basemaps|cartocdn|ign\.fr/i;

// Pas de `mode: 'serial'` : il ferait sauter tous les contrôles suivant le
// premier échec, et le rapport serait tronqué là où il est le plus utile. Les
// tests d'un fichier tournent déjà dans l'ordre sur un seul worker, ce dont le
// `beforeAll` qui écrit les pages de fixture a besoin — rien de plus.
test.setTimeout(MODE === 'live' ? 180_000 : 90_000);

const constats: Constat[] = [];

function chargerAttendus(): Map<string, ExpectedCheck> {
  if (!existsSync(EXPECTED_PATH)) {
    throw new Error(
      `${EXPECTED_PATH} absent : lancer d'abord \`npm run verif:expected\` (ou \`npm run verif:live\`).`
    );
  }
  const liste = JSON.parse(readFileSync(EXPECTED_PATH, 'utf-8')) as ExpectedCheck[];
  return new Map(liste.map((e) => [e.id, e]));
}

/** Page de fixture : la lib depuis la SOURCE (redirection /dist du serveur de dev). */
function ecrireFixture(domaine: string, check: Check): string {
  mkdirSync(FIXTURES, { recursive: true });
  const nom = `${domaine}-${check.id}.html`;
  writeFileSync(
    resolve(FIXTURES, nom),
    `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>vérif — ${check.id}</title>
<!-- Proxy désactivé : les URL des fixtures sont appelées telles quelles,
     aucune réécriture /…-proxy/ du serveur de dev ne s'interpose. -->
<script>window.DSFR_DATA_PROXY = false;</script>${check.head ?? ''}
<script type="module">
  import { getDataCache } from '/dist/dsfr-data.esm.js';
  window.__verif = { getDataCache };
</script>
<style>body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }</style>
</head><body>
<!-- ${check.origin.replace(/--+/g, '—')} -->
${check.markup}
</body></html>`
  );
  // Un lien profond (`?page=2`) est un chemin d'affichage à part entière
  // (`url-sync`) : la page s'ouvre où le contrôle veut la lire, sans pilotage.
  return `/e2e/verif-donnees/${nom}${check.query ? `?${check.query}` : ''}`;
}

/** Le faux réseau du mode déterministe : les fixtures, et rien d'autre. */
async function installerReseau(page: Page, fuites: string[]): Promise<void> {
  await page.route('**/*', async (route: Route) => {
    const brut = route.request().url();
    let url: URL;
    try {
      url = new URL(brut);
    } catch {
      fuites.push(brut);
      await route.abort('blockedbyclient');
      return;
    }
    // Le serveur de dev sert la page, la lib depuis la source et node_modules.
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      await route.continue();
      return;
    }
    const charge = repondre(url);
    if (charge !== null) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
        body: JSON.stringify(charge),
      });
      return;
    }
    if (url.pathname !== '/favicon.ico' && !TUILES.test(brut)) fuites.push(brut);
    await route.abort('blockedbyclient');
  });
}

/**
 * Lit dans la page ce que le contrôle observe, sans rien supposer prêt.
 *
 * Le contexte d'exécution peut disparaître sous la lecture : le serveur de dev
 * surveille `e2e/`, et l'écriture des pages de fixture y déclenche un
 * rechargement complet. Ce n'est pas une observation fausse, c'est une
 * observation qui n'a pas eu lieu — elle se retente au tour de scrutation
 * suivant.
 */
async function observer(page: Page, e: Expect): Promise<Observation> {
  try {
    switch (e.kind) {
      case 'kpi':
        return await page.evaluate(lireKpi, e.id);
      case 'rows':
        return await page.evaluate(lireCache, e.id);
      case 'chart':
        return await page.evaluate(lireGraphique, e.id);
      case 'list':
        return await page.evaluate(lireListe, e.id);
      case 'legend':
        return await page.evaluate(lireLegende, e.id);
      case 'facets':
        return await page.evaluate(lireFacettes, e.id);
      case 'text':
        return await page.evaluate(lireTexte, { id: e.id, selector: e.selector });
      case 'texts':
        return await page.evaluate(lireTextes, { id: e.id, selecteur: e.selector });
      case 'class':
        return await page.evaluate(lireClasses, {
          id: e.id,
          selecteur: e.selector,
          pret: e.ready,
        });
      case 'attr':
        return await page.evaluate(lireAttribut, { id: e.id, attribut: e.attr });
      case 'csv':
        return await page.evaluate(lireExportCsv, e.id);
      case 'dots':
        return await page.evaluate(lirePastilles, e.id);
    }
  } catch (erreur) {
    if (/Execution context was destroyed|Target (page|closed)/.test(String(erreur))) return null;
    throw erreur;
  }
}

/** Une observation est-elle exploitable ? Un contrôle ne compare pas du vide. */
function prete(e: Expect, obs: Observation): boolean {
  if (obs === null || obs === undefined) return false;
  switch (e.kind) {
    case 'kpi': {
      const texte = (obs as { text: string }).text.trim();
      return texte !== '' && !/^(—|…|-|—)$/.test(texte);
    }
    case 'rows':
      return Array.isArray(obs) && obs.length > 0;
    case 'chart':
      return (obs as { labels: string[] }).labels.length > 0;
    case 'list':
      return (obs as { rows: string[][] }).rows.length > 0;
    case 'legend':
    case 'facets':
      return Array.isArray(obs) && obs.length > 0;
    case 'text':
      return (obs as { text: string }).text.trim() !== '';
    case 'texts':
      return Array.isArray(obs) && obs.length > 0;
    case 'class':
      return (obs as { classes: string[] }).classes.length > 0;
    case 'attr':
      return typeof obs === 'string' && obs.trim() !== '';
    case 'csv':
      // Un export lancé avant l'arrivée des données rend l'en-tête seule :
      // ce n'est pas un fichier vide à constater, c'est un fichier pas encore
      // exportable. Tant qu'il n'a pas de ligne, l'observation n'a pas eu lieu.
      return typeof obs === 'string' && obs.includes('\n');
    case 'dots': {
      // Les pastilles apparaissent AVANT d'être recolorées (le report attend
      // que l'aire du graphique existe). Tant qu'aucune couleur déclarée n'est
      // posée, on lit une légende à mi-rendu, pas une légende fausse.
      const couleurs = (obs as string[]).map(toRgb);
      const voulues = Object.values(e.colorMap).map(toRgb);
      return couleurs.length > 0 && voulues.some((c) => c !== null && couleurs.includes(c));
    }
  }
}

/**
 * Observe en DEUX temps, parce que ce sont deux questions différentes.
 *
 * 1. Y a-t-il quelque chose à lire ? (borne `delai` — le chargement initial
 *    d'une source peut être long, et il l'est vraiment en mode vivant.)
 * 2. Ce qu'on lit a-t-il fini de bouger ? (borne `LIMITE_STABILITE` — deux
 *    lectures identiques espacées de `PAUSE_STABILITE`.)
 *
 * La seconde question est celle que posent les GESTES : un filtre client ne
 * touche pas au réseau, `networkidle` est donc immédiat, et le rendu Lit qui
 * suit le geste est asynchrone. Sans elle, on lirait la valeur d'AVANT le
 * geste — et le contrôle serait vert ou rouge au hasard de la machine.
 */
async function attendreObservation(page: Page, e: Expect, delai: number): Promise<Observation> {
  let derniere: Observation = null;
  await expect
    .poll(
      async () => {
        derniere = await observer(page, e);
        return prete(e, derniere);
      },
      { timeout: delai, message: `#${e.id} (${e.kind}) n'a rien affiché` }
    )
    .toBe(true);

  return await lireJusquAStabilite<Observation>(
    async () => {
      const obs = await observer(page, e);
      return prete(e, obs) ? obs : null;
    },
    {
      dormir: (ms) => page.waitForTimeout(ms),
      quoi: `#${e.id} (${e.kind})`,
    }
  );
}

const controles = controlesDuMode(MODE);
const attendusVivants = MODE === 'live' ? chargerAttendus() : null;

/**
 * Les clés attendues du rapport, dans l'ordre des manifestes. Playwright
 * redémarre le worker après un échec : le rapport se fusionne d'un worker à
 * l'autre, et cette liste lui donne son ordre.
 */
const ORDRE = controles.flatMap(({ domaine, check }) =>
  check.expects.map((e) => `${domaine}/${check.id}/${cleAttendu(e)}`)
);

test.afterAll(() => {
  if (constats.length === 0) return;
  process.stdout.write(`\n${ecrireRapport(constats, ORDRE)}\n`);
});

// Les pages de fixture sont RÉGÉNÉRÉES à chaque run (dossier gitignoré) — un
// balisage modifié dans un manifeste doit être celui qui est rendu — et toutes
// EN UNE FOIS, avant la première navigation : le serveur de dev surveille
// `e2e/`, et une écriture en cours de route y déclenche un rechargement.
const pages = new Map<string, string>();
test.beforeAll(() => {
  rmSync(FIXTURES, { recursive: true, force: true });
  for (const { domaine, check } of controles) {
    pages.set(check.id, ecrireFixture(domaine, check));
  }
});

if (controles.length === 0) {
  test(`aucun contrôle en mode ${MODE}`, () => {
    throw new Error(`aucun contrôle déclaré en mode ${MODE} — manifestes vides ?`);
  });
}

/**
 * Les GESTES joués dans la page avant l'observation (#L4).
 *
 * Un filtre qui vient de l'utilisateur ne se vérifie pas sur un rendu figé :
 * c'est le clic ou la frappe qui produit le chiffre, et l'ordre des
 * événements compte. `goto` sans valeur recharge l'URL courante — celle que
 * la synchro d'URL vient d'écrire.
 */
async function jouerActions(page: Page, actions: Action[]): Promise<void> {
  for (const action of actions) {
    switch (action.kind) {
      case 'goto':
        await page.goto(action.value ? new URL(action.value, page.url()).href : page.url(), {
          waitUntil: 'domcontentloaded',
        });
        break;
      case 'click':
        await page.click(action.selector!);
        break;
      case 'fill':
        await page.fill(action.selector!, action.value ?? '');
        break;
      case 'select':
        await page.selectOption(action.selector!, action.values ?? [action.value ?? '']);
        break;
    }
  }
  // Un geste peut déclencher un re-fetch (délégation serveur) : on laisse
  // retomber le réseau. Pour le reste — un filtre client ne touche à rien et
  // `networkidle` est immédiat — c'est `attendreObservation` qui constate que
  // la valeur lue ne bouge plus, observation par observation. Pas de sommeil
  // fixe : une attente qui ne vérifie rien ne garantit rien.
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function executer(domaine: string, check: Check, page: Page): Promise<void> {
  const fuites: string[] = [];
  if (MODE === 'deterministic') await installerReseau(page, fuites);

  const attendu =
    MODE === 'live'
      ? attendusVivants!.get(check.id)
      : computeExpectedFor(check, check.feed.kind === 'fixture' ? check.feed.datasets : {});
  expect(attendu, `pas d'attendu pour ${check.id} : relancer verif:expected`).toBeDefined();

  // Horloge FIXE avant toute navigation : les bornes dynamiques
  // (`today`, `current-month`, `last-n-days`) se calculent au montage.
  if (check.clock) await page.clock.setFixedTime(new Date(check.clock.now));

  await page.goto(pages.get(check.id)!, { waitUntil: 'domcontentloaded' });
  if (check.actions?.length) await jouerActions(page, check.actions);

  const delai = MODE === 'live' ? 120_000 : 30_000;
  const echecs: string[] = [];
  for (const e of check.expects) {
    const observation = await attendreObservation(page, e, delai);
    const valeurAttendue = attendu!.values[cleAttendu(e)];
    expect(valeurAttendue, `attendu manquant pour ${cleAttendu(e)}`).toBeDefined();
    const constat = comparer(
      { domaine, controle: check.id, mode: check.mode, rawRows: attendu!.rawRows },
      e,
      valeurAttendue,
      observation
    );
    constats.push(constat);
    if (!constat.ok) {
      echecs.push(`${constat.observation} : ${constat.message}`);
      continue;
    }
    // Un contrôle vert qui n'a rien comparé ne garde rien.
    expect(constat.comparaisons, `${cleAttendu(e)} : aucune valeur comparée`).toBeGreaterThan(0);
  }

  if (MODE === 'deterministic') {
    expect(fuites, `requêtes sorties du faux réseau : ${fuites.join(', ')}`).toEqual([]);
  }
  expect(echecs, echecs.join('\n')).toEqual([]);
}

for (const { domaine, check } of controles) {
  const titre = `${domaine}/${check.id} — ${check.origin}`;
  // Le fuseau est une option de CONTEXTE, pas de page : un contrôle qui pose
  // une horloge locale s'isole dans son propre describe pour le déclarer.
  if (check.clock) {
    test.describe(check.id, () => {
      test.use({ timezoneId: check.clock!.timezone ?? 'UTC' });
      test(titre, async ({ page }) => executer(domaine, check, page));
    });
  } else {
    test(titre, async ({ page }) => executer(domaine, check, page));
  }
}

import { test, expect, type Page, type Route } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { controlesDuMode } from '../tests/verif-donnees/index.js';
import { repondre } from '../tests/verif-donnees/fixtures.js';
import type { Check, Expect } from '../tools/oracle/manifest.js';
import { computeExpectedFor, cleAttendu, type ExpectedCheck } from '../tools/oracle/expected.js';
import { comparer, type Constat, type Observation } from '../tools/oracle/compare.js';
import {
  lireCache,
  lireGraphique,
  lireKpi,
  lireLegende,
  lireListe,
  lireUrls,
} from '../tools/oracle/observe.js';
import { DOSSIER_SORTIE, ecrireRapport } from '../tools/oracle/report.js';

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
<script>window.DSFR_DATA_PROXY = false;</script>
<!-- Journal des URL appelées, pose AVANT la bibliothèque : les premières
     requêtes partent des le connectedCallback des sources, un observateur
     installe apres le chargement arriverait toujours trop tard (expect urls). -->
<script>
  window.__verifUrls = [];
  (function () {
    var brut = window.fetch;
    window.fetch = function (entree) {
      try {
        window.__verifUrls.push(typeof entree === 'string' ? entree : entree.url);
      } catch (e) { /* une entree exotique ne doit pas casser la page */ }
      return brut.apply(this, arguments);
    };
  })();
</script>${check.head ?? ''}
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
  return `/e2e/verif-donnees/${nom}`;
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
      case 'urls':
        return await page.evaluate(lireUrls);
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
      return Array.isArray(obs) && obs.length > 0;
    // Un contrôle d'URL se lit APRÈS les chiffres qu'il explique : les expects
    // d'un check sont observés dans l'ordre, il se place en dernier.
    case 'urls':
      return Array.isArray(obs) && obs.length > 0;
  }
}

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
  return derniere;
}

const controles = controlesDuMode(MODE);
const attendusVivants = MODE === 'live' ? chargerAttendus() : null;

/**
 * Les clés attendues du rapport, dans l'ordre des manifestes. Playwright
 * redémarre le worker après un échec : le rapport se fusionne d'un worker à
 * l'autre, et cette liste lui donne son ordre.
 */
const ORDRE = controles.flatMap(({ domaine, check }) =>
  check.expects.map((e) => `${domaine}/${check.id}/${e.kind}:${e.id}`)
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

for (const { domaine, check } of controles) {
  test(`${domaine}/${check.id} — ${check.origin}`, async ({ page }) => {
    // Contrôle légitime qu'un défaut CONNU de la bibliothèque fait tomber : il
    // reste écrit, il reste lisible, il ne se mesure pas. Le supprimer ou
    // l'adoucir reviendrait à écrire dans le dépôt que le défaut n'existe pas.
    test.skip(Boolean(check.skip), check.skip ?? '');

    const fuites: string[] = [];
    if (MODE === 'deterministic') await installerReseau(page, fuites);

    const attendu =
      MODE === 'live'
        ? attendusVivants!.get(check.id)
        : computeExpectedFor(check, check.feed.kind === 'fixture' ? check.feed.datasets : {});
    expect(attendu, `pas d'attendu pour ${check.id} : relancer verif:expected`).toBeDefined();

    await page.goto(pages.get(check.id)!, { waitUntil: 'domcontentloaded' });

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
  });
}

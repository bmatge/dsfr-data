import { test, expect, type Page, type Route } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { controlesDuMode } from '../tests/verif-donnees/index.js';
import { repondre } from '../tests/verif-donnees/fixtures.js';
import { estReponseBinaire, trancheDemandee } from '../tests/verif-donnees/fixtures-adaptateurs.js';
import type { Action, Check, Expect } from '../tools/oracle/manifest.js';
import { computeExpectedFor, cleAttendu, type ExpectedCheck } from '../tools/oracle/expected.js';
import { comparer, type Constat, type Observation } from '../tools/oracle/compare.js';
import {
  lireAttribut,
  lireCache,
  lireClasses,
  lireCompte,
  lireDiagnostics,
  lireExportCsv,
  lireFacettes,
  lireGraphique,
  lireKpi,
  lireLegende,
  lireListe,
  lirePastilles,
  lireTexte,
  lireTextes,
  lireUrls,
} from '../tools/oracle/observe.js';
import { toRgb } from '../tools/oracle/compute.js';
import { DOSSIER_SORTIE, ecrireRapport } from '../tools/oracle/report.js';
import { lireJusquAStabilite } from '../tools/oracle/stabilite.js';
import { attenduPython, lireAttendusPython } from '../tools/oracle/troisieme-voix.js';
import { evaluerInvariants } from '../tools/oracle/invariants.js';
import { accordAvecServeur, verdictRecoupement } from '../tools/oracle/crosscheck.js';
import {
  lireDataProcessed,
  prendreEmpreinte,
  verdictFraicheur,
} from '../tools/oracle/fraicheur.js';
import { geler } from '../tools/oracle/gel.js';
import { resoudreFeed, viderCacheBrut } from '../tools/oracle/raw.js';

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
/** Les attendus de la TROISIÈME VOIX (Python, #880), versionnés — mode déterministe seulement. */
const ATTENDUS_PYTHON_PATH = resolve(ICI, '../tests/verif-donnees/attendus.json');

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
</script>
<!-- Journal des SILENCES (expect diagnostic, #878) : ce que la bibliotheque
     ecrit en console, warn et error, pose AVANT son chargement — ses
     validations partent des le connectedCallback. Le lecteur ne retient que
     les messages qui la nomment (dsfr-data-…). -->
<script>
  window.__verifConsole = [];
  (function () {
    function texte(args) {
      var out = [];
      for (var i = 0; i < args.length; i++) {
        var a = args[i];
        out.push(typeof a === 'string' ? a : (a && a.message) ? a.message : String(a));
      }
      return out.join(' ');
    }
    ['warn', 'error'].forEach(function (niveau) {
      var brut = console[niveau];
      console[niveau] = function () {
        try { window.__verifConsole.push({ level: niveau, text: texte(arguments) }); }
        catch (e) { /* le journal ne doit jamais casser la page */ }
        return brut.apply(this, arguments);
      };
    });
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
    // Un fichier (export Parquet, #1055) : servi PAR PLAGES, comme le S3 de
    // data.gouv — `Range: bytes=a-b` → 206 et la seule tranche demandée.
    if (estReponseBinaire(charge)) {
      const tranche = trancheDemandee(charge.binaire, route.request().headers()['range']);
      await route.fulfill({
        status: tranche.partielle ? 206 : 200,
        contentType: charge.contentType,
        headers: {
          'access-control-allow-origin': '*',
          'cache-control': 'no-store',
          'accept-ranges': 'bytes',
          ...(tranche.partielle ? { 'content-range': tranche.contentRange } : {}),
        },
        body: Buffer.from(tranche.octets),
      });
      return;
    }
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
      case 'count':
        return await page.evaluate(lireCompte, { id: e.id, selecteur: e.selector });
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
      case 'urls':
        return await page.evaluate(lireUrls);
      case 'diagnostic':
        return await page.evaluate(lireDiagnostics, e.id);
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
    // Zéro tracé est l'état d'AVANT le rendu : il ne s'observe pas. Une couche
    // qui ne trace rien tombe donc sur « n'a rien affiché » — c'est le défaut
    // de #1053 ; une absence VOULUE se constate par un diagnostic.
    case 'count':
      return typeof obs === 'number' && obs > 0;
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
    // Un contrôle d'URL se lit APRÈS les chiffres qu'il explique : les expects
    // d'un check sont observés dans l'ordre, il se place en dernier.
    case 'urls':
      return Array.isArray(obs) && obs.length > 0;
    // Un diagnostic se lit tout de suite : scruter un avertissement qui ne
    // vient pas coûterait la borne entière pour dire, moins bien, ce que le
    // comparateur dit déjà (« elle n'a rien dit »). Il se place en DERNIER
    // dans `expects`, après les chiffres qu'il qualifie : quand ceux-ci ont
    // fini de bouger, la page a eu le temps de parler — et la lecture en deux
    // temps de `stabilite.ts` attend encore que le journal ne bouge plus.
    case 'diagnostic':
      return true;
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
// La troisième voix ne parle qu'en déterministe : ses attendus sont figés
// sur les jeux du dépôt. Fichier absent (python3 manquant, attendus jamais
// produits) : deux voix, et le rapport le dit.
const attendusPython = MODE === 'deterministic' ? lireAttendusPython(ATTENDUS_PYTHON_PATH) : null;

/**
 * Les clés attendues du rapport, dans l'ordre des manifestes. Playwright
 * redémarre le worker après un échec : le rapport se fusionne d'un worker à
 * l'autre, et cette liste lui donne son ordre.
 */
const ORDRE = controles.flatMap(({ domaine, check }) =>
  check.expects.flatMap((e) => [
    `${domaine}/${check.id}/${cleAttendu(e)}`,
    // Les invariants d'une attente suivent sa valeur dans le rapport (#881).
    ...('invariants' in e && e.invariants
      ? e.invariants.map((inv) => `${domaine}/${check.id}/${cleInvariant(e, inv)}`)
      : []),
  ])
);

/** Clé d'un invariant dans le rapport : `<clé d'attente>#<kind>[:champ]`. */
function cleInvariant(e: Expect, inv: { kind: string; field?: string }): string {
  return `${cleAttendu(e)}#${inv.kind}${inv.field ? `:${inv.field}` : ''}`;
}

test.afterAll(() => {
  if (constats.length === 0) return;
  process.stdout.write(
    `\n${ecrireRapport(
      constats,
      ORDRE,
      controles.map(({ check }) => check)
    )}\n`
  );
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

/** Ce qu'un passage sur la page a donné : les constats du contrôle, et ses échecs. */
interface Passage {
  constatsCheck: Constat[];
  echecs: string[];
}

/**
 * Navigue, joue les gestes, observe chaque attente et la compare — sans rien
 * pousser au rapport : c'est l'appelant qui décide, parce qu'une nuit rouge
 * peut REJOUER le passage (#884) et ne garder que le second.
 */
async function passer(
  page: Page,
  domaine: string,
  check: Check,
  attendu: ExpectedCheck
): Promise<Passage> {
  // Horloge FIXE avant toute navigation : les bornes dynamiques
  // (`today`, `current-month`, `last-n-days`) se calculent au montage.
  if (check.clock) await page.clock.setFixedTime(new Date(check.clock.now));

  await page.goto(pages.get(check.id)!, { waitUntil: 'domcontentloaded' });
  if (check.actions?.length) await jouerActions(page, check.actions);

  const delai = MODE === 'live' ? 120_000 : 30_000;
  const constatsCheck: Constat[] = [];
  const echecs: string[] = [];
  for (const e of check.expects) {
    const observation = await attendreObservation(page, e, delai);
    const valeurAttendue = attendu.values[cleAttendu(e)];
    expect(valeurAttendue, `attendu manquant pour ${cleAttendu(e)}`).toBeDefined();
    const constat = comparer(
      { domaine, controle: check.id, mode: check.mode, rawRows: attendu.rawRows },
      e,
      valeurAttendue,
      observation
    );
    // La TROISIÈME VOIX (#880) : la même comparaison, contre l'attendu Python
    // figé. Deux écarts sur la même observation, ou aucun — jamais un seul
    // qui masquerait l'autre.
    const entreePython = attendusPython?.get(`${domaine}/${check.id}/${cleAttendu(e)}`);
    const attenduTiers = entreePython ? attenduPython(entreePython, e) : null;
    if (attenduTiers) {
      const tiers = comparer(
        { domaine, controle: check.id, mode: check.mode, rawRows: attendu.rawRows },
        e,
        attenduTiers,
        observation
      );
      constat.python = tiers.oracle;
      constat.ecartPython = tiers.ecart;
      if (!tiers.ok) {
        constat.ok = false;
        constat.message = [constat.message, `Python : ${tiers.message}`]
          .filter((m) => m !== '')
          .join(' — ');
      }
    }
    // Le RECOUPEMENT SERVEUR (#883), mode vivant : le troisième chiffre, et le
    // verdict à trois — qui est d'accord avec qui. Un recoupement à qualifier
    // n'est jamais un échec de la bibliothèque ; un serveur d'accord avec la
    // page contre l'oracle désigne le recalcul.
    const reponseServeur = attendu.serveur?.[cleAttendu(e)];
    if (reponseServeur) {
      if (reponseServeur.kind === 'absent') {
        constat.serveur = reponseServeur.raison;
        constat.ecartServeur = null;
      } else {
        const valeurLib =
          e.kind === 'kpi'
            ? { kind: 'kpi' as const, value: (observation as { value: number | null }).value }
            : { kind: 'rows' as const, rows: observation as Array<Record<string, unknown>> };
        const valeurOracle =
          valeurAttendue.kind === 'kpi'
            ? { kind: 'kpi' as const, value: valeurAttendue.value }
            : valeurAttendue.kind === 'rows'
              ? { kind: 'rows' as const, rows: valeurAttendue.rows }
              : null;
        const libServeur = accordAvecServeur(e, reponseServeur, valeurLib);
        const oracleServeur = accordAvecServeur(e, reponseServeur, valeurOracle);
        const verdict = verdictRecoupement(oracleServeur.ok, constat.ok, libServeur.ok);
        constat.serveur = libServeur.serveur;
        constat.ecartServeur = libServeur.ecart;
        constat.verdict = verdict.texte;
        if (verdict.echec && constat.ok) {
          constat.ok = false;
          constat.message = verdict.texte;
        }
      }
    }
    constatsCheck.push(constat);

    // Les INVARIANTS de l'attente (#881) : sur l'observation, face aux lignes
    // brutes — jamais face à l'attendu. `not-truncated` lit en plus les
    // silences de la page. Un invariant en attente est rendu, pas bloquant.
    const invariants = attendu.invariants?.[cleAttendu(e)];
    if (invariants && invariants.length > 0) {
      const litLesSilences = invariants.some((i) => i.invariant.kind === 'not-truncated');
      const diagnostics = litLesSilences ? await page.evaluate(lireDiagnostics, e.id) : null;
      // Un verdict par invariant, dans l'ordre déclaré.
      evaluerInvariants(e, invariants, observation, diagnostics).forEach((verdict, i) => {
        const inv = invariants[i].invariant;
        constatsCheck.push({
          domaine,
          controle: check.id,
          mode: check.mode,
          rawRows: attendu.rawRows,
          observation: cleInvariant(e, inv),
          lib: verdict.lib,
          oracle: verdict.brut,
          ecart: null,
          comparaisons: verdict.comparaisons,
          ok: verdict.ok,
          message: verdict.message,
          invariant: true,
          ...(verdict.attente ? { attente: verdict.attente } : {}),
        });
        if (!verdict.ok && !verdict.attente) {
          echecs.push(`${cleInvariant(e, inv)} : ${verdict.message}`);
        }
      });
    }

    if (!constat.ok) {
      echecs.push(`${constat.observation} : ${constat.message}`);
      continue;
    }
    // Un contrôle vert qui n'a rien comparé ne garde rien.
    expect(constat.comparaisons, `${cleAttendu(e)} : aucune valeur comparée`).toBeGreaterThan(0);
  }
  return { constatsCheck, echecs };
}

/** Dossier où une nuit rouge écrit ses contrôles gelés, prêts à committer. */
const DOSSIER_GEL_SORTIE = resolve(DOSSIER_SORTIE, 'gel');

/**
 * Simulation d'un jeu qui bouge (#884) : `VERIF_SIMULER_DONNEE=<id>` fait
 * lire, APRÈS l'observation, une date de traitement différente de celle de
 * l'attendu pour ce contrôle — le verdict « donnée » et le rejeu s'éprouvent
 * sans attendre qu'un portail republie une nuit de run.
 */
const SIMULER_DONNEE = process.env.VERIF_SIMULER_DONNEE ?? '';

async function executer(domaine: string, check: Check, page: Page, retry = 0): Promise<void> {
  // Contrôle légitime que la bibliothèque ne passe pas encore : il reste écrit,
  // il reste lisible, il ne se mesure pas. Le supprimer ou l'adoucir
  // reviendrait à écrire dans le dépôt qu'il n'y avait rien à voir.
  test.skip(Boolean(check.skip), check.skip ?? '');

  const fuites: string[] = [];
  if (MODE === 'deterministic') await installerReseau(page, fuites);

  let attendu =
    MODE === 'live'
      ? attendusVivants!.get(check.id)
      : computeExpectedFor(check, check.feed.kind === 'fixture' ? check.feed.datasets : {});
  expect(attendu, `pas d'attendu pour ${check.id} : relancer verif:expected`).toBeDefined();

  let passage = await passer(page, domaine, check, attendu!);

  // LE VERDICT D'UNE NUIT ROUGE (#884), mode vivant, sur un écart : la date de
  // traitement du jeu est relue. Stable : bibliothèque, et l'échec est GELÉ en
  // contrôle figé prêt à committer. Changée : donnée, et le contrôle est rejoué
  // une fois, dans ce run, sur un attendu recalculé. Sans date : indéterminé,
  // l'écart reste, le verdict le dit.
  if (MODE === 'live' && passage.echecs.length > 0 && check.feed.kind === 'raw') {
    const avant = attendu!.fingerprint?.dataProcessed ?? null;
    const apres =
      SIMULER_DONNEE === check.id
        ? `${avant ?? ''}+simulé`
        : await lireDataProcessed(check.feed.source);
    const verdict = verdictFraicheur(avant, apres);
    if (verdict === 'donnée') {
      viderCacheBrut();
      const datasets = await resoudreFeed(check.feed);
      attendu = computeExpectedFor(check, datasets);
      attendu.fingerprint = await prendreEmpreinte(check.feed.source, datasets.main ?? []);
      passage = await passer(page, domaine, check, attendu);
      for (const c of passage.constatsCheck) c.fraicheur = 'donnée, rejoué';
    } else {
      for (const c of passage.constatsCheck) c.fraicheur = verdict;
      if (verdict === 'bibliothèque') {
        const datasets = await resoudreFeed(check.feed);
        const gel = geler(domaine, check, datasets, passage.echecs);
        mkdirSync(DOSSIER_GEL_SORTIE, { recursive: true });
        writeFileSync(
          resolve(DOSSIER_GEL_SORTIE, `${gel.check.id}.json`),
          JSON.stringify(gel, null, 2)
        );
        process.stdout.write(
          `gel : ${domaine}/${check.id} → tools/oracle/out/gel/${gel.check.id}.json — à copier sous tests/verif-donnees/gel/\n`
        );
      }
    }
  }

  // Vert au retry seulement : compté à part, jamais fondu dans le vert.
  if (retry > 0 && passage.echecs.length === 0) {
    for (const c of passage.constatsCheck) c.instable = true;
  }
  constats.push(...passage.constatsCheck);

  if (MODE === 'deterministic') {
    expect(fuites, `requêtes sorties du faux réseau : ${fuites.join(', ')}`).toEqual([]);
  }
  expect(passage.echecs, passage.echecs.join('\n')).toEqual([]);
}

for (const { domaine, check } of controles) {
  const titre = `${domaine}/${check.id} — ${check.origin}`;
  // Le fuseau est une option de CONTEXTE, pas de page : un contrôle qui pose
  // une horloge locale s'isole dans son propre describe pour le déclarer.
  if (check.clock) {
    test.describe(check.id, () => {
      test.use({ timezoneId: check.clock!.timezone ?? 'UTC' });
      test(titre, async ({ page }, testInfo) => executer(domaine, check, page, testInfo.retry));
    });
  } else {
    test(titre, async ({ page }, testInfo) => executer(domaine, check, page, testInfo.retry));
  }
}

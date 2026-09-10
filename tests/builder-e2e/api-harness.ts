/**
 * Harnais d'interception des trois variantes API (#625, arbitrage ADR-106).
 *
 * Il monte la page reellement exportee — celle que produit
 * `packages/shared/src/dashboard/export-html.ts`, partagee par le Studio et
 * l'Assistant IA — et lui sert un reseau ENTIEREMENT FIGE :
 *
 *   - la page elle-meme, sur un hote `.invalid` (TLD reserve, RFC 2606) ;
 *   - les actifs CDN, depuis `node_modules` et `packages/core/dist` ;
 *   - les trois API, depuis `api-fixtures.ts` ;
 *   - TOUT LE RESTE est refuse et journalise. Une suite qui joindrait le
 *     reseau reel serait lente, dependante d'un quota partage, et verte le
 *     jour ou l'API tombe.
 *
 * Pourquoi un hote fictif plutot que le serveur de dev : le bundle livre
 * traite `localhost:<port>` comme le dev Vite de ce depot et reecrit alors les
 * hotes connus (Tabular, Grist, INSEE) vers des chemins `/…-proxy/` relatifs.
 * Sur un hote sans port, la resolution retombe en mode `direct` — c'est-a-dire
 * exactement ce que voit une page publiee, qui est ce que la recette doit
 * eprouver. Corollaire : ce harnais ne demande AUCUN serveur.
 *
 * Prerequis : `npm run build` (le bundle `packages/core/dist` est servi a la
 * place du CDN). Le harnais le dit clairement s'il manque.
 */

import type { Page, Route } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CDN_URLS } from '../../packages/shared/src/templates/cdn-versions.js';
import { LIB_URL } from '../../packages/shared/src/api/proxy-config.js';
import { generateDashboardHTML } from '../../packages/shared/src/dashboard/export-html.js';
import type { ChartConfig } from '../../packages/shared/src/dashboard/chart-config.js';
import type { DashboardData, DashboardSource } from '../../packages/shared/src/dashboard/model.js';

import {
  HOTES,
  RESSOURCES,
  URL_GENERIQUE,
  repondreGenerique,
  repondreOdsExport,
  repondreOdsFacets,
  repondreOdsMetadonnees,
  repondreOdsRecords,
  repondreTabular,
} from './api-fixtures.js';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Les trois facons dont l'export HTML branche une source d'API. */
export type Variante = 'ods' | 'tabular' | 'generique';

export const VARIANTES: Variante[] = ['ods', 'tabular', 'generique'];

/** Libelle lisible d'une variante, pour les noms de tests. */
export const LIBELLE_VARIANTE: Record<Variante, string> = {
  ods: 'API OpenDataSoft',
  tabular: 'API Tabular',
  generique: 'API generique',
};

// ---------------------------------------------------------------------------
// Journal du faux reseau
// ---------------------------------------------------------------------------

export interface Journal {
  /** Toutes les URLs d'API servies, dans l'ordre. */
  api: string[];
  /** Ce qui a tente de sortir vers un hote non prevu — doit rester vide. */
  inattendues: string[];
}

/**
 * Les URLs d'API contenant un fragment donne, comparees sur leur forme
 * DECODEE. `URLSearchParams` encode l'espace en `+` : une assertion sur
 * `sum(\`Nombre d'habitants\`)` ou `order_by=region ASC` ne trouverait rien
 * sur l'URL brute, et le test passerait au rouge pour la mauvaise raison.
 */
export function appelsContenant(journal: Journal, fragment: string): string[] {
  return journal.api.filter((u) => decodeURIComponent(u.replace(/\+/g, ' ')).includes(fragment));
}

// ---------------------------------------------------------------------------
// Actifs servis hors ligne
// ---------------------------------------------------------------------------

/**
 * Actifs purement cosmetiques servis VIDES : `@gouvfr/dsfr` n'est pas une
 * dependance installee du depot (les pages generees le prennent au CDN). Son
 * absence ne change rien a ce que la recette mesure — des donnees recues, des
 * lignes rendues, une console propre — et la servir vide garantit une suite
 * hors ligne. Les feuilles et scripts qui COMPTENT (dsfr-chart, dsfr-data)
 * sont servis depuis le disque.
 */
const ACTIFS_VIDES: Record<string, string> = {
  [CDN_URLS.dsfrCss]: 'text/css',
  [CDN_URLS.dsfrUtilityCss]: 'text/css',
  [CDN_URLS.dsfrModuleJs]: 'text/javascript',
  'https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css': 'text/css',
};

const ACTIFS_FICHIERS: Record<string, { chemin: string; type: string }> = {
  [CDN_URLS.dsfrChartCss]: {
    chemin: 'node_modules/@gouvfr/dsfr-chart/dist/DSFRChart/DSFRChart.css',
    type: 'text/css',
  },
  [CDN_URLS.dsfrChartJs]: {
    chemin: 'node_modules/@gouvfr/dsfr-chart/dist/DSFRChart/DSFRChart.js',
    type: 'text/javascript',
  },
};

/** En-tetes CORS : la page et les actifs sont sur des origines differentes. */
const ENTETES = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };

/**
 * Verifie une bonne fois que le bundle attendu est sur le disque. Sans lui la
 * page se monterait sans composants et CHAQUE test echouerait sur une
 * assertion de rendu, ce qui ne dirait rien de la cause.
 */
export function verifierBundleConstruit(): void {
  const bundle = resolve(RACINE, 'packages/core/dist/dsfr-data.core.esm.js');
  if (!existsSync(bundle)) {
    throw new Error(
      `Bundle absent (${bundle}) : lancer « npm run build » avant cette recette — ` +
        `le harnais sert packages/core/dist a la place du CDN.`
    );
  }
}

// ---------------------------------------------------------------------------
// Installation du faux reseau
// ---------------------------------------------------------------------------

export interface Harnais {
  journal: Journal;
  /** Pose le HTML sous test et navigue dessus. */
  ouvrir(html: string): Promise<void>;
}

function servirJson(route: Route, charge: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: ENTETES,
    body: JSON.stringify(charge),
  });
}

/** Route ODS : records, exports/json, facets, metadonnees du jeu. */
function routerOds(route: Route, url: URL, journal: Journal): Promise<void> | null {
  const prefixe = `/api/explore/v2.1/catalog/datasets/${RESSOURCES.datasetId}`;
  if (!url.pathname.startsWith(prefixe)) return null;
  journal.api.push(url.toString());
  const reste = url.pathname.slice(prefixe.length);
  if (reste === '/records') return servirJson(route, repondreOdsRecords(url));
  if (reste === '/exports/json') return servirJson(route, repondreOdsExport(url));
  if (reste === '/facets') return servirJson(route, repondreOdsFacets(url));
  if (reste === '') return servirJson(route, repondreOdsMetadonnees());
  return null;
}

export async function installerHarnais(page: Page): Promise<Harnais> {
  const journal: Journal = { api: [], inattendues: [] };
  let pageCourante = '<!DOCTYPE html><title>vide</title>';

  // Observateur du bus, pose AVANT tout script de la page : les commandes
  // partent des le premier connectedCallback, un ecouteur installe apres le
  // chargement arriverait systematiquement trop tard.
  await page.addInitScript(() => {
    const fenetre = window as Window & { __commandes?: unknown[] };
    fenetre.__commandes = [];
    document.addEventListener('dsfr-data-source-command', (e) => {
      fenetre.__commandes!.push((e as CustomEvent).detail);
    });
  });

  await page.route('**/*', async (route: Route) => {
    const brut = route.request().url();
    let url: URL;
    try {
      url = new URL(brut);
    } catch {
      journal.inattendues.push(brut);
      await route.abort('blockedbyclient');
      return;
    }

    // 1. La page sous test
    if (url.origin === HOTES.page) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        headers: ENTETES,
        body: pageCourante,
      });
      return;
    }

    // 2. Actifs : bundle dsfr-data, dsfr-chart, coquilles vides
    const sansRequete = brut.split('?')[0];
    if (sansRequete.startsWith(`${LIB_URL}/`)) {
      const fichier = resolve(RACINE, 'packages/core/dist', sansRequete.slice(LIB_URL.length + 1));
      if (existsSync(fichier)) {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          headers: ENTETES,
          body: readFileSync(fichier, 'utf8'),
        });
        return;
      }
    }
    const fichierConnu = ACTIFS_FICHIERS[sansRequete];
    if (fichierConnu) {
      await route.fulfill({
        status: 200,
        contentType: `${fichierConnu.type}; charset=utf-8`,
        headers: ENTETES,
        body: readFileSync(resolve(RACINE, fichierConnu.chemin), 'utf8'),
      });
      return;
    }
    const typeVide = ACTIFS_VIDES[sansRequete];
    if (typeVide) {
      await route.fulfill({
        status: 200,
        contentType: `${typeVide}; charset=utf-8`,
        headers: ENTETES,
        body: '',
      });
      return;
    }

    // 3. Les trois API
    if (url.origin === HOTES.ods) {
      const servi = routerOds(route, url, journal);
      if (servi) {
        await servi;
        return;
      }
    }
    if (url.origin === HOTES.tabular) {
      if (url.pathname === `/api/resources/${RESSOURCES.resourceId}/data/`) {
        journal.api.push(url.toString());
        await servirJson(route, repondreTabular(url));
        return;
      }
    }
    if (sansRequete === URL_GENERIQUE) {
      journal.api.push(url.toString());
      await servirJson(route, repondreGenerique());
      return;
    }

    // 4. Rien d'autre ne sort. Un favicon reclame par le navigateur n'est pas
    //    une fuite : il est refuse sans etre compte comme telle.
    if (url.pathname !== '/favicon.ico') journal.inattendues.push(brut);
    await route.abort('blockedbyclient');
  });

  return {
    journal,
    async ouvrir(html: string) {
      pageCourante = html;
      await page.goto(`${HOTES.page}/recette.html`, { waitUntil: 'domcontentloaded' });
    },
  };
}

// ---------------------------------------------------------------------------
// Construction du document exporte
// ---------------------------------------------------------------------------

/** Id de la source du document, partage par toutes les variantes. */
export const ID_SOURCE = 'src-recette';

/**
 * La source telle que le Studio l'enregistre pour chaque variante.
 *
 * `generateSourceHTML` discrimine sur `provider` + `resourceIds` : ODS et
 * Tabular donnent une balise a adaptateur (`api-type`), tout le reste retombe
 * sur le mode URL brute (`url=`), qui est la variante « API generique ».
 * Tabular n'emet PAS de `base-url` : l'adaptateur utilise son hote par defaut,
 * d'ou l'interception du vrai `tabular-api.data.gouv.fr`.
 */
export function sourceDe(variante: Variante): DashboardSource {
  switch (variante) {
    case 'ods':
      return {
        id: ID_SOURCE,
        name: 'Jeu de recette (ODS)',
        provider: 'opendatasoft',
        apiUrl: `${HOTES.ods}/api/explore/v2.1/catalog/datasets/${RESSOURCES.datasetId}/records`,
        resourceIds: { datasetId: RESSOURCES.datasetId },
      };
    case 'tabular':
      return {
        id: ID_SOURCE,
        name: 'Jeu de recette (Tabular)',
        provider: 'tabular',
        apiUrl: `${HOTES.tabular}/api/resources/${RESSOURCES.resourceId}/data/`,
        resourceIds: { resourceId: RESSOURCES.resourceId },
      };
    case 'generique':
      return { id: ID_SOURCE, name: 'Jeu de recette (API)', apiUrl: URL_GENERIQUE };
  }
}

/** Document a un seul bloc `chart` produit par l'assistant (`fromBuilder`). */
export function documentPour(chart: ChartConfig, variante: Variante): DashboardData {
  return {
    id: 'recette-625',
    name: `Recette ${chart.type}`,
    description: '',
    createdAt: null,
    updatedAt: null,
    layout: { columns: 1, gap: 'fr-grid-row--gutters' },
    sources: [sourceDe(variante)],
    widgets: [
      {
        id: 'w1',
        title: chart.title ?? `Recette ${chart.type}`,
        position: { row: 0, col: 0 },
        type: 'chart',
        config: { fromBuilder: true, chart, sourceId: ID_SOURCE },
      },
    ],
  };
}

/** Le HTML exporte pour une configuration et une variante. */
export function pagePour(chart: ChartConfig, variante: Variante): string {
  return generateDashboardHTML(documentPour(chart, variante));
}

/**
 * Active la pagination serveur sur la page exportee.
 *
 * `export-html.ts` n'emet ni `server-side` ni `server-sort` : le document du
 * Studio charge tout le jeu (plafonne par `max-records`) puis pagine dans le
 * navigateur. Le generateur de l'Assistant IA, lui, emet bien les deux pour
 * une datalist sur source paginee (`code-generator.ts`). Cette reecriture pose
 * donc, sur la page partagee, la forme que l'Assistant produit deja — c'est
 * elle qui exerce `fetchPage`, la commande `page` et le tri delegue, que le
 * chemin `fetchAll` ne peut pas montrer.
 */
export function avecPaginationServeur(html: string, tailleDePage: number): string {
  const avecSource = html.replace(
    /<dsfr-data-source id="([^"]+)"/,
    `<dsfr-data-source server-side page-size="${tailleDePage}" id="$1"`
  );
  const avecListe = avecSource.replace(/<dsfr-data-list /, '<dsfr-data-list server-sort ');
  if (avecSource === html || avecListe === avecSource) {
    throw new Error(
      'avecPaginationServeur : la page exportee ne porte plus les balises attendues ' +
        '(dsfr-data-source / dsfr-data-list) — reecriture a revoir.'
    );
  }
  return avecListe;
}

/**
 * Parite du Studio IA avec `builder-ia-recette` : le parcours COMPLET (#1081).
 *
 * `builder-ia-recette` passe par `applyChartConfig`, « exactement comme le
 * fait l'assistant apres une reponse » : c'est le chemin d'une reponse du
 * modele jusqu'a l'apercu. `studio-recette` rend les 16 types dans le Studio,
 * mais en posant le document dans l'etat de l'app : il saute le chemin que
 * prend une reponse du modele. Ce spec le parcourt, par l'interface, comme un
 * usager :
 *
 *   1. la source est choisie dans le select, et le chat l'annonce ;
 *   2. la demande part du champ du chat, par le bouton « Envoyer » ;
 *   3. le modele recoit le prompt systeme (qui decrit les champs de la
 *      source) et les outils de document ;
 *   4. sa reponse — un appel `add_blocks` — passe la validation du Studio
 *      (`champsRequisManquants`, `diagnoseConfig` sur les donnees chargees) ;
 *   5. le bloc atterrit dans le document, l'onglet Code et l'apercu, qui rend
 *      les etiquettes piegeuses intactes, sans erreur console ;
 *   6. `finish` clot le tour, son message s'affiche dans le chat.
 *
 * Le modele est SIMULE : `/ia-proxy` est intercepte par `page.route()`, qui
 * repond `add_blocks` au premier tour et `finish` au second. Aucun appel ne
 * sort vers un fournisseur ; la config serveur est figee a « indisponible »
 * pour que le mode ne depende pas de l'environnement de dev.
 *
 * Ce que ce spec NE refait PAS, parce que c'est deja garde ailleurs :
 *   - le rendu des 16 types depuis un document pose : `studio-recette` ;
 *   - l'export sur les trois variantes API : `export-html-api-recette`, ecrit
 *     contre l'export partage (celui du Studio) ;
 *   - le volet Diagnostic du Studio : `layout-diagnostic-recette` ;
 *   - la navigation et la redirection : `studio-navigation-recette`.
 *
 *   npx playwright test --config tests/builder-e2e/playwright.config.ts \
 *     studio-parite-recette
 */

import { test, expect, type ConsoleMessage, type Page, type Route } from '@playwright/test';

const APP_URL = 'http://localhost:5173/apps/studio/';

const TYPES = [
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
] as const;

/** Meme jeu piegeux que les deux autres recettes (#615). */
const LIGNES = [
  { region: "Provence-Alpes-Cote d'Azur", code_dept: '13', population: 5098666 },
  { region: "Val-d'Oise", code_dept: '95', population: 1249674 },
  { region: 'Recherche & Developpement', code_dept: '75', population: 2161000 },
  { region: 'Nord', code_dept: '59', population: 2604000 },
  { region: 'Rhone', code_dept: '69', population: 1876000 },
];

const SOURCE = {
  id: 'recette-parite',
  name: 'Recette parite',
  type: 'manual',
  data: LIGNES,
  recordCount: LIGNES.length,
};

const TOLEREES = [
  /favicon/i,
  /net::ERR_/i,
  /Failed to load resource/i,
  /remixicon/i,
  /Content Security Policy/i,
];

/** Message de `finish` : ce que l'usager lit a la fin du tour. */
const messageFinal = (type: string) => `Bloc ${type} compose pour la recette.`;

interface MessageModele {
  role: string;
  content?: string;
}

interface CorpsModele {
  messages?: MessageModele[];
  tools?: { function?: { name?: string } }[];
}

/** Ce que le modele simule a recu et renvoye, pour les assertions. */
interface Echanges {
  requetes: CorpsModele[];
  /** Compte-rendu de `add_blocks` rendu au modele (message `tool`). */
  retourOutil: string;
}

function reponseOutil(nom: string, args: Record<string, unknown>, id: string) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id, type: 'function', function: { name: nom, arguments: JSON.stringify(args) } },
          ],
        },
      },
    ],
  };
}

/**
 * Modele simule : `add_blocks` au premier tour, `finish` des qu'un message
 * `tool` est revenu. Le compte-rendu de l'outil est garde pour dire, en cas
 * d'echec, POURQUOI le Studio a refuse le bloc.
 */
async function simulerModele(page: Page, type: string): Promise<Echanges> {
  const echanges: Echanges = { requetes: [], retourOutil: '' };

  await page.route(
    (url) => url.pathname === '/ia-server-config',
    (route: Route) => route.fulfill({ json: { available: false } })
  );
  await page.route(
    (url) => url.pathname === '/ia-proxy',
    async (route: Route) => {
      const corps = route.request().postDataJSON() as CorpsModele;
      echanges.requetes.push(corps);
      const retour = (corps.messages ?? []).find((m) => m.role === 'tool');
      if (!retour) {
        await route.fulfill({
          json: reponseOutil(
            'add_blocks',
            {
              blocks: [
                {
                  kind: 'chart',
                  title: `Recette ${type}`,
                  config: {
                    type,
                    labelField: 'region',
                    valueField: 'population',
                    codeField: 'code_dept',
                    aggregation: 'sum',
                    title: `Recette ${type}`,
                  },
                },
              ],
            },
            'appel-1'
          ),
        });
        return;
      }
      echanges.retourOutil = retour.content ?? '';
      await route.fulfill({
        json: reponseOutil('finish', { message: messageFinal(type) }, 'appel-2'),
      });
    }
  );
  return echanges;
}

/** Etat navigateur d'un usager qui a configure son IA et enregistre une source. */
async function preparerNavigateur(page: Page, avecJeton: boolean): Promise<void> {
  await page.addInitScript(
    ({ source, avecJeton }) => {
      // Le tour d'accueil pose un voile qui intercepterait les clics.
      localStorage.setItem('dsfr-data-tours', JSON.stringify({ disabled: true, tours: {} }));
      localStorage.setItem('dsfr-data-sources', JSON.stringify([source]));
      if (avecJeton) {
        localStorage.setItem(
          'dsfr-data-ia-config',
          JSON.stringify({
            apiUrl: 'https://llm.recette.invalid/v1/chat/completions',
            model: 'modele-recette',
            token: 'jeton-recette',
          })
        );
      }
    },
    { source: SOURCE, avecJeton }
  );
}

test.describe('parite du Studio avec l’Assistant — de la reponse du modele a l’apercu', () => {
  for (const type of TYPES) {
    test(`${type} : demande au chat, add_blocks valide, apercu et code`, async ({ page }) => {
      const erreurs: string[] = [];
      page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() !== 'error') return;
        const texte = msg.text();
        if (!TOLEREES.some((r) => r.test(texte))) erreurs.push(texte);
      });
      page.on('pageerror', (err) => erreurs.push(`pageerror: ${err.message}`));

      await preparerNavigateur(page, true);
      const echanges = await simulerModele(page, type);
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

      // 1. La source se choisit dans le select, et le chat l'annonce.
      await page.locator('#saved-source').selectOption(SOURCE.id);
      const chat = page.locator('#chat-messages');
      await expect(
        chat.locator('.chat-message--assistant', { hasText: `Source « ${SOURCE.name} » chargée` })
      ).toHaveCount(1);

      // 2. La demande part par l'interface.
      await page.locator('#chat-input').fill(`Un graphique ${type} de la population par région`);
      await page.locator('#chat-send-btn').click();

      // 6. Le tour se clot sur le message de `finish`.
      await expect(
        chat.locator('.chat-message--assistant', { hasText: messageFinal(type) })
      ).toBeVisible({ timeout: 20_000 });

      // 3. Le modele a recu les outils de document et un prompt systeme qui
      //    decrit la source chargee.
      expect(echanges.requetes.length, 'deux tours attendus : add_blocks puis finish').toBe(2);
      const premier = echanges.requetes[0];
      const outils = (premier.tools ?? []).map((t) => t.function?.name);
      expect(outils).toEqual(expect.arrayContaining(['add_blocks', 'finish']));
      const systeme = (premier.messages ?? []).find((m) => m.role === 'system')?.content ?? '';
      for (const champ of ['region', 'code_dept', 'population']) {
        expect(systeme, `le prompt systeme ne cite pas le champ ${champ}`).toContain(champ);
      }

      // 4. Le Studio a accepte le bloc (sinon : son refus, tel que le modele l'a lu).
      expect(echanges.retourOutil, 'bloc refuse par le Studio').toContain('ajouté');
      expect(echanges.retourOutil).not.toContain('refusé');

      // 5. Le bloc est dans le code copiable…
      const code = page.locator('#generated-code');
      await expect(code).toContainText(`Recette ${type}`);
      await expect(code).toContainText('<dsfr-data-');

      // … et l'apercu le rend : mesure sur LE composant d'affichage.
      await expect(page.locator('#preview-frame')).toBeVisible();
      const affichage = page
        .frameLocator('#preview-frame')
        .locator('dsfr-data-chart, dsfr-data-kpi, dsfr-data-list, dsfr-data-podium')
        .first();
      await expect
        .poll(() => affichage.evaluate((el) => el.getBoundingClientRect().height), {
          timeout: 20_000,
          message: 'le composant d’affichage reste vide',
        })
        .toBeGreaterThan(60);

      if (/podium|datalist/.test(type)) {
        await expect(
          page.frameLocator('#preview-frame').getByText("Val-d'Oise", { exact: false }).first()
        ).toBeVisible({ timeout: 20_000 });
      }

      expect(erreurs, `erreurs console pour ${type}`).toEqual([]);
    });
  }

  test('sans IA configuree, le chat dit ou la regler et ouvre le reglage', async ({ page }) => {
    await preparerNavigateur(page, false);
    let appelsModele = 0;
    await page.route(
      (url) => url.pathname === '/ia-server-config',
      (route: Route) => route.fulfill({ json: { available: false } })
    );
    await page.route(
      (url) => url.pathname === '/ia-proxy' || url.pathname === '/ia-proxy-default',
      (route: Route) => {
        appelsModele += 1;
        return route.abort();
      }
    );
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

    await page.locator('#saved-source').selectOption(SOURCE.id);
    await page.locator('#chat-input').fill('Un graphique en barres');
    await page.locator('#chat-send-btn').click();

    await expect(
      page.locator('#chat-messages .chat-message--assistant', {
        hasText: 'Aucune configuration IA disponible',
      })
    ).toBeVisible();
    await expect(page.locator('#section-ia-config')).toHaveJSProperty('open', true);
    expect(appelsModele, 'aucun appel au modele sans configuration').toBe(0);
    await expect(page.locator('#preview-frame')).toBeHidden();
  });
});

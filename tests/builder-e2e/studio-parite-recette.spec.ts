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

/**
 * Source donnee par URL (#1140) : l'usager ne choisit AUCUNE source, il donne
 * l'adresse d'un jeu Opendatasoft sur domaine propre dans sa demande. Le modele
 * (simule) appelle `charger_source_url`, puis `add_blocks` sur les champs que
 * l'outil lui a rendus, puis `finish`. L'API du portail est servie par
 * `page.route` : aucun appel ne sort.
 *
 * Chemin relatif (`/apps/studio/`) : le spec suit le `baseURL` de la config.
 */
test.describe('source donnee par URL dans la conversation (#1140)', () => {
  const URL_JEU =
    'https://data.economie.gouv.fr/explore/dataset/les-jeunes-entreprises-innovantes/';
  const JEI = [
    { annee: '2004', montant_d_exoneration: 62416226, nombre_de_jei: 1302 },
    { annee: '2010', montant_d_exoneration: 143485878, nombre_de_jei: 2937 },
    { annee: '2017', montant_d_exoneration: 187960511, nombre_de_jei: 3798 },
  ];
  const FIN = 'Graphique de l’évolution des JEI composé.';

  test('« fais un graphique … avec https://data.economie.gouv.fr/explore/dataset/… » : source chargée, bloc créé', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('dsfr-data-tours', JSON.stringify({ disabled: true, tours: {} }));
      localStorage.setItem(
        'dsfr-data-ia-config',
        JSON.stringify({
          apiUrl: 'https://llm.recette.invalid/v1/chat/completions',
          model: 'modele-recette',
          token: 'jeton-recette',
        })
      );
    });

    // Le portail, joint en direct (apercu) ou par le proxy CORS generique
    // (`/api-proxy` + X-Target-URL : l'outil route comme une connexion API).
    const CHEMIN_API = '/api/explore/v2.1/catalog/datasets/les-jeunes-entreprises-innovantes';
    const appelsPortail: string[] = [];
    const servirPortail = (route: Route) => {
      const cible = route.request().headers()['x-target-url'] ?? route.request().url();
      if (!cible.includes(`data.economie.gouv.fr${CHEMIN_API}`)) return route.fallback();
      appelsPortail.push(cible);
      return route.fulfill({ json: { total_count: JEI.length, results: JEI } });
    };
    await page.route(
      (url) => url.hostname === 'data.economie.gouv.fr' && url.pathname.startsWith(CHEMIN_API),
      servirPortail
    );
    // `/cors-proxy` : le proxy CORS generique en dev (proxy relatif) — sans
    // lui, l'outil joignait le vrai portail par le proxy de Vite (#1132).
    await page.route(
      (url) => url.pathname === '/api-proxy' || url.pathname === '/cors-proxy',
      servirPortail
    );
    await page.route(
      (url) => url.pathname === '/ia-server-config',
      (route: Route) => route.fulfill({ json: { available: false } })
    );
    const retours: string[] = [];
    await page.route(
      (url) => url.pathname === '/ia-proxy',
      async (route: Route) => {
        const corps = route.request().postDataJSON() as CorpsModele;
        const outils = (corps.messages ?? []).filter((m) => m.role === 'tool');
        const dernier = outils.at(-1);
        if (dernier) retours.push(dernier.content ?? '');
        const reponse =
          outils.length === 0
            ? reponseOutil('charger_source_url', { url: URL_JEU }, 'appel-1')
            : outils.length === 1
              ? reponseOutil(
                  'add_blocks',
                  {
                    blocks: [
                      {
                        kind: 'chart',
                        title: 'Nombre de JEI par année',
                        config: { type: 'line', labelField: 'annee', valueField: 'nombre_de_jei' },
                      },
                    ],
                  },
                  'appel-2'
                )
              : reponseOutil('finish', { message: FIN }, 'appel-3');
        await route.fulfill({ json: reponse });
      }
    );

    await page.goto('/apps/studio/', { waitUntil: 'domcontentloaded' });
    await page
      .locator('#chat-input')
      .fill(`Fais un graphique de l’évolution du nombre de JEI par année avec ${URL_JEU}`);
    await page.locator('#chat-send-btn').click();

    const chat = page.locator('#chat-messages');
    await expect(chat.locator('.chat-message--assistant', { hasText: FIN })).toBeVisible({
      timeout: 20_000,
    });

    // L'outil a charge le jeu par l'API du portail et l'a resume au modele.
    expect(appelsPortail.length, 'le portail n’a pas été interrogé').toBeGreaterThan(0);
    expect(retours[0]).toContain('Source chargée');
    expect(retours[0]).toContain('nombre_de_jei');
    expect(retours[1], 'bloc refusé par le Studio').toContain('ajouté');

    // La source est celle du selecteur, comme choisie a la main.
    const idSource = 'url_opendatasoft_les-jeunes-entreprises-innovantes';
    await expect(page.locator('#saved-source')).toHaveValue(idSource);

    // Le code exporte une source Opendatasoft declarative et le bloc.
    const code = page.locator('#generated-code');
    await expect(code).toContainText('api-type="opendatasoft"');
    await expect(code).toContainText('dataset-id="les-jeunes-entreprises-innovantes"');
    await expect(code).toContainText('Nombre de JEI par année');
    await expect(
      page.frameLocator('#preview-frame').locator('dsfr-data-chart').first()
    ).toBeAttached({ timeout: 20_000 });
  });
});

/**
 * « Ouvrir dans le Studio IA » depuis le Playground (#1132) : un code Opendatasoft
 * + graphique + tableau croise (`dsfr-data-pivot`) arrive dans le Studio avec
 * sa source DEJA chargee (chemin de `charger_source_url`), la consigne de
 * reconstruction posee dans le champ et RIEN d'envoye au modele. Apres envoi
 * par l'usager, le modele (simule) reconstruit en un bloc chart guide et un
 * bloc « composant libre » pour le pivot ; l'apercu rend les deux. Le lien
 * « Retour au Playground » rend le code d'origine.
 */
test.describe('Playground → Studio IA (#1132)', () => {
  const ID_SOURCE = 'url_opendatasoft_industrie-du-futur';
  const LIGNES_ODS = [
    { region: 'Bretagne', annee: '2022', nombre: 12 },
    { region: 'Bretagne', annee: '2023', nombre: 15 },
    { region: 'Corse', annee: '2022', nombre: 3 },
    { region: 'Corse', annee: '2023', nombre: 4 },
  ];
  const CODE_PLAYGROUND = `<div class="fr-container fr-my-4w">
  <dsfr-data-source id="data" api-type="opendatasoft"
    base-url="https://data.economie.gouv.fr"
    dataset-id="industrie-du-futur">
  </dsfr-data-source>
  <dsfr-data-chart source="data" type="bar" label-field="region" value-field="nombre"></dsfr-data-chart>
  <dsfr-data-pivot id="croise" source="data" row="region" column="annee" value="nombre"></dsfr-data-pivot>
  <dsfr-data-list source="croise"></dsfr-data-list>
</div>`;
  const FIN = 'Code du Playground reconstruit : un graphique et un tableau croisé.';

  test('source chargée, consigne posée sans envoi, reconstruction fidèle, retour au Playground', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('dsfr-data-tours', JSON.stringify({ disabled: true, tours: {} }));
      localStorage.setItem(
        'dsfr-data-ia-config',
        JSON.stringify({
          apiUrl: 'https://llm.recette.invalid/v1/chat/completions',
          model: 'modele-recette',
          token: 'jeton-recette',
        })
      );
    });

    const CHEMIN_API = '/api/explore/v2.1/catalog/datasets/industrie-du-futur';
    const appelsPortail: string[] = [];
    const servirPortail = (route: Route) => {
      const cible = route.request().headers()['x-target-url'] ?? route.request().url();
      if (!cible.includes(`data.economie.gouv.fr${CHEMIN_API}`)) return route.fallback();
      appelsPortail.push(cible);
      return route.fulfill({ json: { total_count: LIGNES_ODS.length, results: LIGNES_ODS } });
    };
    await page.route(
      (url) => url.hostname === 'data.economie.gouv.fr' && url.pathname.startsWith(CHEMIN_API),
      servirPortail
    );
    // Proxy CORS generique : `/cors-proxy` quand le proxy est relatif (dev),
    // `/api-proxy` sur une instance distante.
    await page.route(
      (url) => url.pathname === '/api-proxy' || url.pathname === '/cors-proxy',
      servirPortail
    );
    await page.route(
      (url) => url.pathname === '/ia-server-config',
      (route: Route) => route.fulfill({ json: { available: false } })
    );
    const requetesModele: CorpsModele[] = [];
    const retours: string[] = [];
    await page.route(
      (url) => url.pathname === '/ia-proxy',
      async (route: Route) => {
        const corps = route.request().postDataJSON() as CorpsModele;
        requetesModele.push(corps);
        const outils = (corps.messages ?? []).filter((m) => m.role === 'tool');
        const dernier = outils.at(-1);
        if (dernier) retours.push(dernier.content ?? '');
        const a = (name: string, value: string) => ({ name, value });
        const reponse =
          outils.length === 0
            ? reponseOutil(
                'add_blocks',
                {
                  blocks: [
                    {
                      kind: 'chart',
                      title: 'Nombre par région',
                      config: { type: 'bar', labelField: 'region', valueField: 'nombre' },
                    },
                    {
                      kind: 'component',
                      title: 'Tableau croisé',
                      components: [
                        {
                          tag: 'dsfr-data-pivot',
                          attributes: [
                            a('id', 'croise'),
                            a('source', ID_SOURCE),
                            a('row', 'region'),
                            a('column', 'annee'),
                            a('value', 'nombre'),
                          ],
                        },
                        { tag: 'dsfr-data-list', attributes: [a('source', 'croise')] },
                      ],
                    },
                  ],
                },
                'appel-1'
              )
            : reponseOutil('finish', { message: FIN }, 'appel-2');
        await route.fulfill({ json: reponse });
      }
    );

    // 1. Le Playground, avec le code de l'usager.
    await page.goto('/apps/playground/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!document.querySelector('.CodeMirror'));
    await page.evaluate((code) => {
      const cm = (
        document.querySelector('.CodeMirror') as unknown as {
          CodeMirror: { setValue(v: string): void };
        }
      ).CodeMirror;
      cm.setValue(code);
    }, CODE_PLAYGROUND);

    // 2. « Ouvrir dans le Studio IA », dans « Plus d'actions ».
    const bouton = page.locator('#studio-btn');
    if (!(await bouton.isVisible())) {
      await page.getByRole('button', { name: "Plus d'actions" }).click();
    }
    await expect(bouton).toHaveText('Ouvrir dans le Studio IA');
    await bouton.click();
    await page.waitForURL(/\/apps\/studio\/index\.html\?from=playground$/);

    // 3. La source du code est chargée, comme par charger_source_url.
    await expect(page.locator('#saved-source')).toHaveValue(ID_SOURCE, { timeout: 20_000 });
    const chat = page.locator('#chat-messages');
    await expect(
      chat.locator('.chat-message--assistant', { hasText: 'chargée depuis ce code' })
    ).toBeVisible();
    expect(appelsPortail.length, 'le portail n’a pas été interrogé').toBeGreaterThan(0);

    // 4. La consigne est dans le champ, et RIEN n'est parti vers le modèle.
    const champ = page.locator('#chat-input');
    await expect(champ).toHaveValue(/Reconstruisez fidèlement/);
    await expect(champ).toHaveValue(/composant libre/);
    await expect(champ).toHaveValue(/dsfr-data-pivot id="croise"/);
    await expect(champ).toHaveValue(new RegExp(`id « ${ID_SOURCE} »`));
    expect(requetesModele, 'aucun appel au modèle sans action de l’usager').toHaveLength(0);

    // 5. L'usager envoie : le modèle reçoit le code et reconstruit.
    await page.locator('#chat-send-btn').click();
    await expect(chat.locator('.chat-message--assistant', { hasText: FIN })).toBeVisible({
      timeout: 20_000,
    });
    const demande = (requetesModele[0].messages ?? []).filter((m) => m.role === 'user').at(-1);
    expect(demande?.content).toContain('dsfr-data-pivot');
    expect(retours[0], 'blocs refusés par le Studio').toContain('ajouté');
    expect(retours[0]).not.toContain('refusé');

    // 6. Même rendu : graphique et tableau croisé, dans le code et l'aperçu.
    const code = page.locator('#generated-code');
    await expect(code).toContainText('api-type="opendatasoft"');
    await expect(code).toContainText('dataset-id="industrie-du-futur"');
    await expect(code).toContainText('<dsfr-data-chart');
    await expect(code).toContainText('<dsfr-data-pivot');
    const apercu = page.frameLocator('#preview-frame');
    await expect(apercu.locator('dsfr-data-chart').first()).toBeAttached({ timeout: 20_000 });
    await expect(apercu.locator('dsfr-data-list').getByText('Bretagne').first()).toBeVisible({
      timeout: 20_000,
    });

    // 7. Retour au Playground : le code d'origine, et le lien vers le Studio.
    const retour = page.locator('#retour-playground-link');
    await expect(retour).toBeVisible();
    await retour.click();
    await page.waitForURL(/\/apps\/playground\/index\.html\?from=studio$/);
    await expect(page.getByRole('link', { name: 'Retour au Studio IA' })).toBeVisible();
    const codeRendu = await page.evaluate(() =>
      (
        document.querySelector('.CodeMirror') as unknown as {
          CodeMirror: { getValue(): string };
        }
      ).CodeMirror.getValue()
    );
    expect(codeRendu).toBe(CODE_PLAYGROUND);
  });
});

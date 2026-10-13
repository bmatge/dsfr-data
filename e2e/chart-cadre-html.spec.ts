import { test, expect, type Page } from '@playwright/test';

/**
 * #1289 — cadre officiel de `dsfr-data-chart` : ce que DSFR Chart fait des
 * attributs qu'on lui relaie, mesuré sur le VRAI DSFR Chart (chargé depuis
 * node_modules) dans un vrai navigateur.
 *
 * Pourquoi ici et pas en unitaire : DSFR Chart pose `modal-content` et l'unité
 * des infobulles par `innerHTML`. happy-dom n'exécute pas un `onerror`, et
 * surtout il ne lit pas une balise comme Chromium — or les contournements
 * fermés par #1289 tenaient tous à cet écart (`<textarea>` qui avale sa
 * fermeture, `<a ="…">`, `&#106avascript:`, deux morceaux qui se recollent
 * après un retrait). Les tests unitaires disent ce que le composant relaie ;
 * celui-ci dit que rien ne s'exécute.
 *
 * Chaque charge de `chart-cadre-html.html` pousse son nom dans
 * `window.__exec`. PREUVE DE MUTATION (rejouée à l'écriture) : `_htmlRelaye`
 * rendu inopérant dans `dsfr-data-chart.ts` → les trois premiers tests
 * rougissent, en nommant les charges exécutées.
 */

const PAGE = '/e2e/chart-cadre-html.html';

async function ouvrir(page: Page): Promise<string[]> {
  const console_: string[] = [];
  page.on('console', (m) => console_.push(`${m.type()}: ${m.text()}`));
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto(PAGE);
  // Tous les cadres sont montés (DSFR Chart rend de façon asynchrone).
  await expect(page.locator('#fenetre-simple .databox')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#t-empty-label canvas')).toBeVisible({ timeout: 15_000 });
  return console_;
}

const executees = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __exec: string[] }).__exec);

/**
 * Promène la souris sur le canvas, colonne par colonne. `assez` arrête le
 * balayage dès que ce qu'on attend est apparu (l'infobulle et son unité).
 */
async function survoler(
  page: Page,
  id: string,
  pas = 16,
  assez?: () => Promise<boolean>
): Promise<void> {
  const canvas = page.locator(`[id="${id}"] canvas`).first();
  await canvas.scrollIntoViewIfNeeded();
  const b = await canvas.boundingBox();
  if (!b) throw new Error(`canvas de ${id} sans boîte`);
  const lignes = pas / 2;
  for (let i = 1; i < pas; i++) {
    for (let j = 1; j < lignes; j++) {
      await page.mouse.move(b.x + (b.width * i) / pas, b.y + (b.height * j) / lignes);
    }
    if (assez && (await assez())) return;
  }
}

test('fenêtre du cadre : le HTML simple est rendu, aucune charge ne s’exécute', async ({
  page,
}) => {
  await ouvrir(page);

  // --- Rétrocompatibilité : gras, italique, lien, liste, paragraphe gardés.
  const simple = page.locator('dialog[id="modal-databox-fenetre-simple"] .fr-modal__content');
  await expect(simple.locator('strong')).toHaveText('DEPP');
  await expect(simple.locator('em')).toHaveText('rentrée 2025');
  await expect(simple.locator('a')).toHaveAttribute('href', 'https://exemple.fr/methode');
  await expect(simple.locator('ul > li')).toHaveText(['un', 'deux']);
  await expect(simple.locator('p').first()).toContainText('Source :');

  // --- La charge de l'issue, écrite dans l'attribut : l'image est rendue
  //     (HTML gardé), son gestionnaire ne l'est pas.
  const ecrite = page.locator('dialog[id="modal-databox-fenetre-ecrite"] .fr-modal__content');
  await expect(ecrite.locator('img[data-sonde="fenetre-ecrite"]')).toHaveCount(1);
  await expect(ecrite.locator('img[data-sonde="fenetre-ecrite"]')).not.toHaveAttribute(
    'onerror',
    /.*/
  );
  await expect(ecrite.locator('p')).toHaveText(['avant', 'après']);

  // --- Chaque charge a sa fenêtre : le cadre est monté, donc DSFR Chart a
  //     bien posé le contenu (sinon le test ne prouverait rien).
  const charges = await page.evaluate(
    () => (window as unknown as { __charges: string[] }).__charges
  );
  expect(charges.length).toBeGreaterThan(12);
  for (const nom of charges) {
    await expect(page.locator(`dialog[id="modal-databox-charge-${nom}"]`)).toHaveCount(1);
  }

  // Les liens qui exigent un clic : on clique. `HTMLElement.click()` suit le
  // lien même dans une fenêtre fermée ; un lien SVG reçoit un vrai événement.
  await page.evaluate(() => {
    for (const lien of document.querySelectorAll('dialog[id^="modal-databox-charge-"] a')) {
      if (lien instanceof HTMLElement) lien.click();
      else lien.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  });
  // Laisse aux `onerror` (chargement d'image échoué) le temps de se produire.
  await page.waitForTimeout(800);

  expect(await executees(page)).toEqual([]);
  // Rien d'actif ne subsiste dans aucune fenêtre.
  const actifs = await page.evaluate(() => {
    const vus: string[] = [];
    for (const el of document.querySelectorAll('dialog[id^="modal-databox-"] *')) {
      const nom = el.tagName.toLowerCase();
      if (['script', 'iframe', 'animate', 'set', 'textarea', 'noscript', 'style'].includes(nom)) {
        vus.push(nom);
      }
      for (const attr of el.attributes) {
        if (attr.name.toLowerCase().startsWith('on')) vus.push(`${nom}[${attr.name}]`);
        if (/^\s*javascript:/i.test(attr.value)) vus.push(`${nom}[${attr.name}]`);
      }
    }
    return vus;
  });
  expect(actifs).toEqual([]);
});

test('unité des infobulles : rendue comme du HTML simple, jamais exécutée', async ({ page }) => {
  test.setTimeout(90_000);
  await ouvrir(page);

  // L'unité `m<sup>2</sup>` d'une page existante garde son exposant.
  const exposant = page.locator('#fenetre-simple .tooltip_place sup');
  await survoler(page, 'fenetre-simple', 16, async () => (await exposant.count()) > 0);
  await expect(page.locator('#fenetre-simple .tooltip_place sup').first()).toHaveText('2');

  const unites = await page.evaluate(() => (window as unknown as { __unites: string[] }).__unites);
  expect(unites).toEqual(['unite-bar', 'unite-line', 'unite-pie', 'unite-radar', 'unite-bar-line']);
  for (const id of unites) {
    const dansInfobulle = page.locator(`[id="${id}"] .tooltip_place img[data-sonde]`);
    await survoler(page, id, 16, async () => (await dansInfobulle.count()) > 0);
    // L'infobulle a bien reçu l'unité (l'image y est), sans son gestionnaire :
    // sans cette assertion, un survol manqué passerait pour un succès.
    const image = page.locator(`[id="${id}"] .tooltip_place img[data-sonde]`).first();
    await expect(image, `infobulle de ${id}`).toHaveCount(1);
    await expect(image).not.toHaveAttribute('onerror', /.*/);
  }
  await page.waitForTimeout(500);
  expect(await executees(page)).toEqual([]);
});

/**
 * Le TABLEAU de la PR : hors la fenêtre et l'unité, tout libellé est rendu
 * comme du TEXTE. Une montée de version de DSFR Chart qui ferait d'un de ces
 * puits du HTML rougit ici, avant d'atteindre une page.
 */
test('les autres attributs sont rendus comme du texte', async ({ page }) => {
  test.setTimeout(60_000);
  await ouvrir(page);
  const ids = await page.evaluate(() => (window as unknown as { __texte: string[] }).__texte);
  expect(ids.length).toBeGreaterThanOrEqual(16);
  // Survol plus lâche que pour les unités : il suffit qu'une infobulle se soit
  // ouverte sur chaque graphique pour que ses libellés y soient écrits.
  for (const id of ids) await survoler(page, id, 8);
  // Vue tableau de chaque cadre : les libellés et l'en-tête y sont écrits.
  await page.waitForTimeout(800);

  const enHtml = await page.evaluate(() =>
    [...document.querySelectorAll('img[data-sonde^="t-"]')].map(
      (i) => (i as HTMLElement).dataset.sonde
    )
  );
  expect(enHtml).toEqual([]);
  expect(await executees(page)).toEqual([]);

  // Rendus comme du texte : la balise se LIT à l'écran.
  await expect(page.locator('#t-databox-title .databox_header')).toContainText('<img data-sonde');
  await expect(page.locator('#t-databox-source .databox_footer')).toContainText('<img data-sonde');
  await expect(page.locator('#t-databox-tooltip-content .fr-tooltip')).toContainText(
    '<img data-sonde',
    { useInnerText: false }
  );
  await expect(page.locator('#t-databox-actions button[data-action]')).toContainText(
    '<img data-sonde',
    { useInnerText: false }
  );
});

test('databox-actions mal formé : le cadre reste, l’erreur est lisible', async ({ page }) => {
  const console_ = await ouvrir(page);

  // Avant #1289 : `JSON.parse` levait dans DSFR Chart, le cadre disparaissait.
  const fautives = page.locator('#actions-fautives');
  await expect(fautives.locator('.databox')).toBeVisible();
  await expect(fautives.locator('canvas')).toBeVisible();
  await expect(fautives.locator('button[data-action]')).toHaveCount(0);
  await expect(fautives).toHaveAttribute(
    'data-dsfr-config-error',
    /databox-actions.*JSON invalide/
  );

  // Entrées fautives écartées, la bonne gardée — et branchable par `data-action`.
  const melees = page.locator('#actions-melees');
  await expect(melees.locator('.databox')).toBeVisible();
  await expect(melees.locator('button[data-action]')).toHaveCount(1);
  await expect(melees.locator('button[data-action="methode"]')).toHaveText('Méthode');
  await expect(melees).toHaveAttribute(
    'data-dsfr-config-error',
    /entrées 1 \(un nombre\), 3 \(null\) écartées/
  );

  expect(
    console_.filter((m) => m.startsWith('error: dsfr-data-chart: databox-actions'))
  ).toHaveLength(2);
  // Aucune exception de DSFR Chart sur la page.
  expect(console_.filter((m) => /SyntaxError|normalize is not a function/.test(m))).toEqual([]);
});

test('attributs sans effet et JavaScript du DSFR absent : dits une fois', async ({ page }) => {
  const console_ = await ouvrir(page);
  const avertis = (motif: string): string[] =>
    console_.filter((m) => m.startsWith('warning:') && m.includes(motif));

  // Mesure de l'issue : aucun sélecteur de source, aucun bouton de fenêtre.
  await expect(page.locator('#defaut select')).toHaveCount(0);
  await expect(page.locator('#plein-seul button[aria-controls^="modal-"]')).toHaveCount(0);
  expect(avertis('dsfr-data-chart[defaut]: databox-default-source est sans effet')).toHaveLength(1);
  expect(
    avertis(
      'dsfr-data-chart[plein-seul]: databox-fullscreen est sans effet sans databox-modal-title'
    )
  ).toHaveLength(1);

  // Sans le script du DSFR, le menu ne s'ouvre pas : c'est le défaut signalé.
  const menu = page.locator('#fenetre-simple button[title="Plus d\'actions"]');
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');

  // Un seul avertissement pour toute la page, après l'événement load.
  await expect.poll(() => avertis('JavaScript du DSFR').length, { timeout: 8_000 }).toBe(1);
  expect(avertis('JavaScript du DSFR')[0]).toContain('dsfr.module.min.js');
  await page.waitForTimeout(2_500);
  expect(avertis('JavaScript du DSFR')).toHaveLength(1);
});

test('JavaScript du DSFR chargé après le composant : aucun faux positif', async ({ page }) => {
  // `dsfr.module.min.js` n'est pas une dépendance du dépôt : on rejoue ce
  // qu'il expose — `window.dsfr`, une fonction — et QUAND : un module différé
  // s'exécute après l'analyse du document, donc après un composant déjà monté.
  // Ici, plus tard encore : après l'événement load.
  await page.addInitScript(() => {
    // Objet de configuration posé avant le script : ce n'est pas le script.
    (window as unknown as { dsfr: unknown }).dsfr = { mode: 'manual' };
    window.addEventListener('load', () => {
      setTimeout(() => {
        const api = Object.assign(() => undefined, { version: '1.15.3' });
        (window as unknown as { dsfr: unknown }).dsfr = api;
      }, 600);
    });
  });
  const console_ = await ouvrir(page);
  await page.waitForTimeout(4_000);
  expect(console_.filter((m) => m.includes('JavaScript du DSFR'))).toEqual([]);
});

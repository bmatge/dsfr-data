import { test, expect, type Page } from '@playwright/test';

/**
 * #924 (PG-030) — un filtre de contexte compare une CHAÎNE à un champ que le
 * jeu publie en NOMBRE : `reg = "01"` ne rencontre jamais l'entier 1, le KPI
 * affiche « — », et rien ne le dit.
 *
 * Ce que seul un vrai navigateur prouve : le piège ne se manifeste qu'à
 * l'émission réelle de la clause vers une source qui a déjà rendu ses
 * lignes. Le type du champ vient d'elles — aucun schéma n'est lu côté
 * bibliothèque — donc la chaîne d'événements (source montée → lignes
 * émises → geste → clause) fait partie de ce qui est vérifié.
 *
 * AUCUN comportement ne change : la clause émise est exactement celle
 * d'avant. Ces specs mesurent aussi ça, et le NOMBRE de messages, qui est la
 * moitié du sujet.
 */

interface Commande {
  sourceId: string;
  where: string;
}

declare global {
  interface Window {
    __cmds?: Commande[];
  }
}

async function collecte(page: Page) {
  const avertissements: string[] = [];
  const erreurs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning') avertissements.push(m.text());
    if (m.type() === 'error') erreurs.push(m.text());
  });
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.addInitScript(() => {
    window.__cmds = [];
    document.addEventListener('dsfr-data-source-command', (e) => {
      const d = (e as CustomEvent).detail ?? {};
      window.__cmds?.push({ sourceId: String(d.sourceId ?? ''), where: String(d.where ?? '') });
    });
  });
  return { avertissements, erreurs };
}

const commandes = (page: Page) => page.evaluate(() => window.__cmds ?? []);
const mismatches = (av: string[]) => av.filter((m) => m.includes('en TEXTE'));

test('#924 — « 01 » sur un champ entier est nommé, et seulement sur la source concernée', async ({
  page,
}) => {
  const { avertissements, erreurs } = await collecte(page);
  await page.goto('/e2e/contexte-champ-entier.html');
  // Les deux sources ont rendu leurs lignes : c'est d'elles que vient le
  // type du champ, rien n'est su avant.
  await expect(page.locator('#kpi-int')).toContainText('5 517');
  await expect(page.locator('#kpi-txt')).toContainText('5 517');

  await page.selectOption('#sel-reg', '01');
  await expect.poll(() => mismatches(avertissements).length).toBe(1);

  const messages = mismatches(avertissements);
  expect(messages).toHaveLength(1);
  expect(messages[0]).toContain('(reg)');
  expect(messages[0]).toContain('"01"');
  expect(messages[0]).toContain('"src-int"');
  expect(messages[0]).not.toContain('"src-txt"');
  expect(messages[0]).toContain('NOMBRE');
  expect(messages[0]).toContain('"1"');

  // Le comportement ne change pas : la clause part telle quelle, et le jeu
  // en entier ne répond toujours rien (c'est bien le piège, pas corrigé ici).
  const cmds = await commandes(page);
  expect(cmds.filter((c) => c.where !== '').map((c) => c.where)).toContain('reg:eq:01');
  expect(erreurs).toEqual([]);
});

test('#924 — « 75 » passe, et ne fait rien dire', async ({ page }) => {
  const { avertissements, erreurs } = await collecte(page);
  await page.goto('/e2e/contexte-champ-entier.html');
  await expect(page.locator('#kpi-int')).toContainText('5 517');

  await page.selectOption('#sel-reg', '75');
  await expect
    .poll(async () => (await commandes(page)).filter((c) => c.where !== '').length)
    .toBeGreaterThan(0);

  expect(mismatches(avertissements)).toEqual([]);
  expect(erreurs).toEqual([]);
});

test('#924 — cent gestes, deux champs, quatre jeux : quatre avertissements', async ({ page }) => {
  const { avertissements, erreurs } = await collecte(page);
  await page.goto('/e2e/contexte-champ-entier-mesure.html');
  await expect(page.locator('#m-kpi')).toContainText('60');

  for (let i = 0; i < 50; i++) {
    await page.selectOption('#sel-reg', ['01', '02', '75', ''][i % 4]);
    await page.selectOption('#sel-dep', ['01', '09', '33', ''][i % 4]);
  }

  // Deux champs de code × deux sources réellement numériques : quatre
  // situations distinctes, et pas un message de plus, quel que soit le
  // nombre d'événements.
  const messages = mismatches(avertissements);
  expect(messages).toHaveLength(4);
  expect(new Set(messages).size).toBe(4);
  expect(messages.filter((m) => m.includes('(reg)'))).toHaveLength(2);
  expect(messages.filter((m) => m.includes('(dep)'))).toHaveLength(2);
  expect(messages.some((m) => m.includes('"m-txt-a"'))).toBe(false);
  expect(messages.some((m) => m.includes('"m-txt-b"'))).toBe(false);
  expect(erreurs).toEqual([]);
});

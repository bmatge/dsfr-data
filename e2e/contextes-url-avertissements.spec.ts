import { test, expect, type Page } from '@playwright/test';

/**
 * #922 et #923 — les deux pièges du registre de contextes cessent d'être
 * silencieux.
 *
 * Ce que seul un vrai navigateur prouve : ces deux pièges ne se manifestent
 * qu'au montage réel (ordre des callbacks de cycle de vie) et au
 * rechargement avec des paramètres d'URL (`history.replaceState` puis
 * relecture). Les tests unitaires portent la règle ; ces specs portent le
 * symptôme tel que l'intégrateur le voit — et le NOMBRE de messages, qui
 * est la moitié du sujet : un avertissement répété à chaque événement
 * cesse d'être lu.
 *
 * AUCUN comportement ne change : l'URL écrite et les clauses émises sont
 * exactement celles d'avant. Ces specs mesurent aussi ça.
 *
 * Les clauses sont relevées sur le bus `dsfr-data-source-command` — ce que
 * les contextes demandent réellement aux sources, indépendamment de ce que
 * les sources en font.
 */

interface Commande {
  sourceId: string;
  where: string;
  origin: string;
}

declare global {
  interface Window {
    __commandes?: Commande[];
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
    window.__commandes = [];
    document.addEventListener('dsfr-data-source-command', (e) => {
      const d = (e as CustomEvent).detail ?? {};
      window.__commandes?.push({
        sourceId: String(d.sourceId ?? ''),
        where: String(d.where ?? ''),
        origin: String(d.origin ?? ''),
      });
    });
  });
  return { avertissements, erreurs };
}

const commandes = (page: Page) => page.evaluate(() => window.__commandes ?? []);

/** Dernière clause non vide reçue par une source */
function dernierWhere(cmds: Commande[], sourceId: string): string {
  const pour = cmds.filter((c) => c.sourceId === sourceId && c.where !== '');
  return pour.length ? pour[pour.length - 1].where : '';
}

test('#922 — le paramètre d’URL partagé par deux contextes url-sync est signalé une fois', async ({
  page,
}) => {
  const { avertissements, erreurs } = await collecte(page);
  await page.goto('/e2e/contextes-url-partage.html');

  await page.selectOption('#sel-ref', 'Bretagne');
  await page.selectOption('#sel-cmp', 'Normandie');
  // Dix gestes de plus : la déduplication doit tenir, message unique
  for (let i = 0; i < 10; i++) {
    await page.selectOption('#sel-ref', i % 2 ? 'Bretagne' : 'Normandie');
    await page.selectOption('#sel-cmp', i % 2 ? 'Normandie' : 'Bretagne');
  }

  const conflits = avertissements.filter((m) => m.includes("le paramètre d'URL"));
  expect(conflits).toHaveLength(1);
  expect(conflits[0]).toContain('"reg_nom"');
  expect(conflits[0]).toContain('"ctx-ref"');
  expect(conflits[0]).toContain('"ctx-cmp"');
  expect(conflits[0]).toContain('url-param-map');

  // Le comportement ne change pas : l'URL ne porte toujours QU'UN paramètre
  // pour les deux contextes (c'est bien le piège, et il reste tel quel).
  const params = new URL(page.url()).searchParams;
  expect(params.getAll('reg_nom')).toHaveLength(1);
  expect(erreurs).toEqual([]);
});

test('#923 — l’ordre piégeux est signalé une fois, le résultat reste celui d’avant', async ({
  page,
}) => {
  const { avertissements, erreurs } = await collecte(page);
  await page.goto('/e2e/contextes-ordre-plain-dabord.html?reg_nom=Bretagne');
  await expect(page.locator('#sel-reg')).toHaveValue('Bretagne');

  // Le filtre du contexte déclaré en premier est resté sur l'option par
  // défaut : c'est le piège, et il n'est PAS corrigé ici — seulement dit.
  const cmds = await commandes(page);
  expect(dernierWhere(cmds, 'src-a')).toContain('Bretagne');
  expect(dernierWhere(cmds, 'src-b')).toContain('Normandie');

  const ordre = avertissements.filter((m) => m.includes('pré-rempli depuis'));
  expect(ordre).toHaveLength(1);
  expect(ordre[0]).toContain('#sel-reg');
  expect(ordre[0]).toContain('(reg_nom)');
  expect(ordre[0]).toContain('"nom_region"');
  expect(ordre[0]).toContain('"ctx-plain"');
  expect(ordre[0]).toContain('EN PREMIER');
  expect(erreurs).toEqual([]);
});

test('#923 — l’ordre sain n’émet aucun avertissement d’ordre', async ({ page }) => {
  const { avertissements, erreurs } = await collecte(page);
  await page.goto('/e2e/contextes-ordre-sync-dabord.html?reg_nom=Bretagne');
  await expect(page.locator('#sel-reg')).toHaveValue('Bretagne');

  const cmds = await commandes(page);
  expect(dernierWhere(cmds, 'src-a')).toContain('Bretagne');
  expect(dernierWhere(cmds, 'src-b')).toContain('Bretagne');

  expect(avertissements.filter((m) => m.includes('pré-rempli depuis'))).toEqual([]);
  expect(erreurs).toEqual([]);
});

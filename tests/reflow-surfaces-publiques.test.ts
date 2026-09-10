import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';

/**
 * Garde-fou de reflow (WCAG 1.4.10, niveau AA — repris par le RGAA), ADR-108, #720.
 *
 * A 320 pixels CSS de large, ce que produit un zoom navigateur a 400 % sur un
 * ecran de 1280, le contenu doit rester utilisable SANS defilement dans les deux
 * directions. La mesure Playwright du 2026-09-10 a trouve un seul defaut, et il
 * est partout le meme : un tableau large pose directement dans le flux, sans
 * aucun ancetre en `overflow-x`. Les pages de specs debordaient de 355 px
 * (`table.attr-table` de 659 px dans un conteneur de 288 px), Monitoring de
 * 657 px (`table.monitoring-table` de 961 px).
 *
 * Le correctif est le conteneur DSFR : `div.fr-table > table`, dont la regle
 * `display: block; overflow: auto` confine le defilement au tableau. Cette garde
 * verrouille la FORME du correctif — c'est un test statique, jsdom ne fait pas
 * de mise en page — en verifiant qu'aucun `<table>` d'une surface publique ne
 * reste hors d'un `div.fr-table`.
 *
 * Piege verrouille au passage : ecrire `<table class="fr-table">` au lieu de
 * `<div class="fr-table"><table>`. C'est ce que faisaient Monitoring et deux
 * pages du guide, et cela n'ouvre AUCUN defilement — la regle DSFR est
 * `.fr-table > table`, elle ne s'applique jamais a la table elle-meme.
 *
 * PERIMETRE (ADR-108) : surfaces publiques uniquement — `specs/`, `guide/` et
 * l'app Monitoring, qui est de la consultation. Les apps de creation sont
 * explicitement HORS de cette garde : elles ne produisent aucun debordement
 * horizontal a 320 px (mesure du 2026-09-10) et leur engagement est traite
 * separement par le message de seuil.
 */

const RACINE = join(__dirname, '..');

/** Surfaces publiques scannees. Ne pas y ajouter d'app de creation (ADR-108). */
const SURFACES_PUBLIQUES = ['specs', 'guide'];

/**
 * Apps de creation, hors perimetre : la garde ne doit jamais se mettre a les
 * scanner par derapage d'un futur ajout dans SURFACES_PUBLIQUES.
 */
const APPS_DE_CREATION = [
  'builder',
  'builder-ia',
  'builder-carto',
  'dashboard',
  'playground',
  'studio',
  'favorites',
  'pipeline-helper',
  'sources',
  'admin',
];

function pagesHtml(dir: string, out: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) pagesHtml(chemin, out);
    else if (entree.endsWith('.html')) out.push(chemin);
  }
  return out;
}

/** Retire les blocs `<template>` : leur contenu n'est pas dans le flux de la page. */
function sansTemplates(html: string): string {
  return html.replace(/<template[\s\S]*?<\/template>/g, '');
}

/** Les `<table>` qui ne sont pas precedes immediatement d'un `<div class="fr-table…">`. */
function tablesSansConteneur(html: string): number[] {
  const fautifs: number[] = [];
  const nettoye = sansTemplates(html);
  for (const m of nettoye.matchAll(/<table\b[^>]*>/g)) {
    const avant = nettoye.slice(0, m.index).trimEnd();
    if (!/<div class="fr-table[^"]*">$/.test(avant)) {
      fautifs.push(nettoye.slice(0, m.index).split('\n').length);
    }
  }
  return fautifs;
}

describe('reflow a 320 px sur les surfaces publiques (#720, ADR-108)', () => {
  it('tout <table> des pages publiques est dans un conteneur div.fr-table', () => {
    const fautes: string[] = [];
    let scannees = 0;

    for (const surface of SURFACES_PUBLIQUES) {
      const dir = join(RACINE, surface);
      if (!existsSync(dir)) continue;
      for (const page of pagesHtml(dir)) {
        scannees++;
        const html = readFileSync(page, 'utf-8');
        for (const ligne of tablesSansConteneur(html)) {
          fautes.push(`${relative(RACINE, page)}:${ligne}`);
        }
      }
    }

    expect(scannees).toBeGreaterThan(20);
    expect(fautes).toEqual([]);
  });

  it('les 20 pages de composants portent bien leur table d attributs enveloppee', () => {
    const dir = join(RACINE, 'specs/components');
    const avecAttrTable = pagesHtml(dir).filter((p) =>
      readFileSync(p, 'utf-8').includes('class="attr-table"')
    );
    expect(avecAttrTable.length).toBe(20);

    for (const page of avecAttrTable) {
      const html = readFileSync(page, 'utf-8');
      const total = [...html.matchAll(/<table class="attr-table">/g)].length;
      const enveloppees = [...html.matchAll(/<div class="fr-table">\s*<table class="attr-table">/g)]
        .length;
      expect(`${relative(RACINE, page)}: ${enveloppees}/${total}`).toBe(
        `${relative(RACINE, page)}: ${total}/${total}`
      );
    }
  });

  it('Monitoring rend son tableau dans un conteneur, pas avec fr-table sur la table', () => {
    const source = readFileSync(join(RACINE, 'apps/monitoring/src/main.ts'), 'utf-8');
    expect(source).toMatch(/<div class="fr-table">\s*<table class="monitoring-table">/);
    expect(source).not.toMatch(/<table class="[^"]*\bfr-table\b/);
  });

  it('aucune app de creation n est entrainee dans cette garde (ADR-108)', () => {
    for (const app of APPS_DE_CREATION) {
      expect(SURFACES_PUBLIQUES).not.toContain(`apps/${app}`);
      expect(SURFACES_PUBLIQUES).not.toContain(app);
    }
  });
});

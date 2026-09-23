/**
 * Complétude des repères de l'app Sources PAR LE RENDU (#1007, epic #992,
 * ADR-143).
 *
 * `check:reperes` lit le source : une ligne d'en-tête HTTP, une colonne de
 * table Grist ou une cellule de l'éditeur de tableau, rendues par un gabarit
 * TS, n'y ont pas d'ancêtre lexical. Ce test charge le vrai `index.html`,
 * exécute le vrai `main.ts`, ouvre chaque modale, rend chaque type de
 * connexion (détection, Grist, API REST et ses en-têtes) et chaque mode de
 * l'éditeur de source manuelle (tableau — lignes et colonnes ajoutées, table
 * rechargée —, JSON, CSV), puis vérifie sur le DOM :
 *
 *   1. tout contrôle rendu dans une ZONE DE RÉGLAGE porte un repère, sauf
 *      exception déclarée (la liste des connexions, `sources.connexions`, est
 *      une zone de visite, pas de réglage : ses lignes n'y sont pas soumises) ;
 *   2. tout `data-repere` / `data-zone` rendu est au registre, même balise ;
 *   3. la zone DOM la plus proche d'un repère est celle que son id annonce ;
 *   4. l'union des repères rendus est EXACTEMENT le registre.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { openModal, closeModal, type Repere } from '@dsfr-data/shared';
import config from '../../../apps/sources/src/assistant/reperes.config';
import { REPERES } from '../../../apps/sources/src/assistant/reperes.generated';
import {
  openPreviewPanel,
  setConnType,
  setConnectionModalStep,
} from '../../../apps/sources/src/connections/connection-manager';
import { loadTableData, resetTableEditor } from '../../../apps/sources/src/editors/table-editor';

vi.mock('@dsfr-data/shared', async (importOriginal) => {
  const reel = await importOriginal<Record<string, unknown>>();
  return {
    ...reel,
    initAuth: vi.fn(async () => {}),
    injectTourStyles: vi.fn(),
    startTourIfFirstVisit: vi.fn(),
    startTour: vi.fn(),
  };
});

const RACINE = resolve(import.meta.dirname, '../../..');
const CONTROLES = 'input:not([type="hidden"]), select, textarea, button';
const PAR_ID = new Map<string, Repere>(REPERES.map((r) => [r.id, r]));
const REGLAGE = new Set(config.zonesDeReglage);
const idsDuGenre = (genre: 'controle' | 'zone') =>
  REPERES.filter((r) => r.genre === genre)
    .map((r) => r.id)
    .sort();

function corpsIndex(): string {
  const html = readFileSync(join(RACINE, 'apps/sources/index.html'), 'utf-8');
  const ouverture = html.indexOf('>', html.indexOf('<body')) + 1;
  let corps = html.slice(ouverture, html.indexOf('</body>'));
  for (let debut = corps.indexOf('<script'); debut !== -1; debut = corps.indexOf('<script')) {
    const fin = corps.indexOf('</script>', debut);
    corps = corps.slice(0, debut) + corps.slice(fin + '</script>'.length);
  }
  return corps;
}

function decrire(el: Element): string {
  const id = el.getAttribute('id');
  const classe = el.getAttribute('class');
  return `<${el.tagName.toLowerCase()}${id ? ` id="${id}"` : ''}${classe && !id ? ` class="${classe}"` : ''}>`;
}

/** Contrôles rendus dans une zone de réglage, sans repère ni exception déclarée. */
function controlesSansRepere(racine: ParentNode): string[] {
  return [...racine.querySelectorAll<HTMLElement>(CONTROLES)]
    .filter((el) => {
      const zone = el.closest('[data-zone]')?.getAttribute('data-zone');
      return zone !== undefined && zone !== null && REGLAGE.has(zone);
    })
    .filter((el) => !el.hasAttribute('data-repere'))
    .filter((el) => !config.exceptions.some((x) => el.matches(x.cible)))
    .map(decrire);
}

function ecartsAuRegistre(racine: ParentNode): string[] {
  const ecarts: string[] = [];
  for (const el of racine.querySelectorAll<HTMLElement>('[data-repere], [data-zone]')) {
    const id = el.getAttribute('data-repere') ?? el.getAttribute('data-zone')!;
    const genre = el.hasAttribute('data-repere') ? 'controle' : 'zone';
    const r = PAR_ID.get(id);
    if (!r || r.genre !== genre) {
      ecarts.push(`${genre} rendu absent du registre : ${id} (${decrire(el)})`);
      continue;
    }
    if (r.element !== el.tagName.toLowerCase()) {
      ecarts.push(`${id} : rendu sur <${el.tagName.toLowerCase()}>, registre <${r.element}>`);
    }
    const zoneDom = el.parentElement?.closest('[data-zone]')?.getAttribute('data-zone');
    if (zoneDom !== undefined && zoneDom !== r.zone) {
      ecarts.push(`${id} : rendu dans la zone ${zoneDom}, son identifiant annonce ${r.zone}`);
    }
  }
  return ecarts;
}

function cliquer(selecteur: string): void {
  const el = document.querySelector<HTMLElement>(selecteur);
  expect(el, `${selecteur} introuvable`).not.toBeNull();
  el!.click();
}

describe("repères de l'app Sources : complétude par le rendu (#1007)", () => {
  const rendus = new Set<string>();
  const zonesRendues = new Set<string>();
  const constats: string[] = [];

  const releve = (scenario: string) => {
    for (const el of document.querySelectorAll('[data-repere]')) {
      rendus.add(el.getAttribute('data-repere')!);
    }
    for (const el of document.querySelectorAll('[data-zone]')) {
      zonesRendues.add(el.getAttribute('data-zone')!);
    }
    for (const c of [...controlesSansRepere(document), ...ecartsAuRegistre(document)]) {
      constats.push(`[${scenario}] ${c}`);
    }
  };

  beforeAll(async () => {
    localStorage.clear();
    document.body.innerHTML = corpsIndex();
    await import('../../../apps/sources/src/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.waitFor(() => {
      expect(document.getElementById('local-sources-list')!.childElementCount).toBeGreaterThan(0);
    });
  });

  beforeEach(() => {
    constats.length = 0;
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  it('rendu initial et panneau d’aperçu : conformes au registre', () => {
    openPreviewPanel();
    releve('initial');
    expect(constats).toEqual([]);
  });

  it('connexion, étape détection par URL', () => {
    cliquer('#add-connection-btn');
    expect(document.getElementById('connection-modal')!.classList.contains('active')).toBe(true);
    releve('connexion-detection');
    expect(constats).toEqual([]);
  });

  it('connexion API REST, avec des en-têtes', () => {
    cliquer('#manual-link');
    cliquer('#add-api-header-btn');
    cliquer('#add-api-header-btn');
    expect(document.querySelectorAll('.api-headers-row')).toHaveLength(2);
    releve('connexion-api');
    expect(constats).toEqual([]);
  });

  it('connexion Grist', () => {
    setConnectionModalStep('manual');
    setConnType('grist');
    releve('connexion-grist');
    closeModal('connection-modal');
    expect(constats).toEqual([]);
  });

  it('création de table Grist, colonne ajoutée', () => {
    openModal('create-table-modal');
    cliquer('#add-column-btn');
    expect(document.querySelectorAll('#columns-list .column-item')).toHaveLength(3);
    releve('table-grist');
    closeModal('create-table-modal');
    expect(constats).toEqual([]);
  });

  it('export vers Grist et jointure', () => {
    openModal('export-grist-modal');
    openModal('join-source-modal');
    releve('export-jointure');
    closeModal('export-grist-modal');
    closeModal('join-source-modal');
    expect(constats).toEqual([]);
  });

  it('source manuelle, mode tableau : lignes et colonnes ajoutées, table rechargée', () => {
    cliquer('#add-source-btn');
    releve('tableau-initial');
    cliquer('[data-repere="sources.manuelle.tableau.ajouter-ligne"]');
    cliquer('[data-repere="sources.manuelle.tableau.ajouter-colonne"]');
    releve('tableau-ajouts');
    loadTableData([{ nom: 'Paris', pop: 2 }]);
    releve('tableau-charge');
    resetTableEditor();
    releve('tableau-reinitialise');
    expect(constats).toEqual([]);
  });

  it('source manuelle, modes JSON et CSV', () => {
    cliquer('[data-source-mode="json"]');
    releve('json');
    cliquer('[data-source-mode="csv"]');
    releve('csv');
    expect(constats).toEqual([]);
  });

  it("l'union des repères rendus est exactement le registre", () => {
    expect([...rendus].sort()).toEqual(idsDuGenre('controle'));
    expect([...zonesRendues].sort()).toEqual(idsDuGenre('zone'));
  });

  it('preuve de mutation : une ligne d’en-tête rendue sans repère est vue', () => {
    // Le cas que la règle lexicale ne voit pas : la ligne vient d'un gabarit TS.
    const hote = document.createElement('div');
    hote.innerHTML = document.getElementById('connection-modal')!.outerHTML;
    expect(controlesSansRepere(hote)).toEqual([]);
    hote.querySelector('.api-header-value')!.removeAttribute('data-repere');
    expect(controlesSansRepere(hote)).toEqual([
      '<input class="fr-input fr-input--sm api-header-value">',
    ]);
  });

  it('preuve de mutation : une cellule posée dans la mauvaise zone est vue', () => {
    const hote = document.createElement('div');
    hote.innerHTML = document.getElementById('manual-source-modal')!.outerHTML;
    const cellule = hote.querySelector('[data-repere="sources.manuelle.tableau.cellule"]')!;
    hote.querySelector('[data-zone="sources.manuelle.json"]')!.appendChild(cellule);
    expect(ecartsAuRegistre(hote)).toContain(
      'sources.manuelle.tableau.cellule : rendu dans la zone sources.manuelle.json, son identifiant annonce sources.manuelle.tableau'
    );
  });
});

/**
 * Complétude des repères du dashboard PAR LE RENDU (#1007, epic #992, ADR-143).
 *
 * `check:reperes` lit le source : un formulaire de widget (`widget-config.ts`)
 * ou une ligne de grille (`grid.ts`) rendus par un gabarit TS n'y ont pas
 * d'ancêtre lexical. Ce test charge le vrai `index.html`, exécute le vrai
 * `main.ts`, pose un widget de CHAQUE sorte (KPI, graphique manuel, graphique
 * issu des favoris, graphique produit par l'assistant, tableau, texte), ouvre
 * sa modale, ouvre la modale d'enregistrement, puis vérifie sur le DOM :
 *
 *   1. tout contrôle rendu dans une zone porte un repère, sauf exception
 *      déclarée (config, ou exception DE RENDU ci-dessous, avec sa raison) ;
 *   2. tout `data-repere` / `data-zone` rendu est au registre, même balise ;
 *   3. la zone DOM la plus proche d'un repère est celle que son id annonce ;
 *   4. l'union des repères rendus est EXACTEMENT le registre.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Repere } from '@dsfr-data/shared';
import config from '../../../apps/dashboard/src/assistant/reperes.config';
import { REPERES } from '../../../apps/dashboard/src/assistant/reperes.generated';
import { state, createWidget, type Widget } from '../../../apps/dashboard/src/state';
import { renderWidget } from '../../../apps/dashboard/src/widgets';
import { closeConfigModal, openConfigModal } from '../../../apps/dashboard/src/widget-config';
import { openSaveModal } from '../../../apps/dashboard/src/dashboards';

vi.mock('@dsfr-data/shared', async (importOriginal) => {
  const reel = await importOriginal<Record<string, unknown>>();
  return {
    ...reel,
    initAuth: vi.fn(async () => {}),
    mountDiagnosticPanel: vi.fn(),
    injectTourStyles: vi.fn(),
    startTourIfFirstVisit: vi.fn(),
    startTour: vi.fn(),
  };
});

/**
 * Exceptions DE RENDU : contrôles créés par `createElement`, que la règle
 * lexicale de `check:reperes` ne voit pas.
 */
const EXCEPTIONS_RENDU: readonly { cible: string; raison: string }[] = [
  {
    cible: 'button.widget-action-btn',
    raison:
      "Actions d'un widget posé (dupliquer, éditer, configurer, supprimer), une série par widget : elles désignent le widget, pas un réglage. La configuration se montre par la modale (dashboard.widget).",
  },
];

const RACINE = resolve(import.meta.dirname, '../../..');
const CONTROLES = 'input:not([type="hidden"]), select, textarea, button';
const PAR_ID = new Map<string, Repere>(REPERES.map((r) => [r.id, r]));
const idsDuGenre = (genre: 'controle' | 'zone') =>
  REPERES.filter((r) => r.genre === genre)
    .map((r) => r.id)
    .sort();

function corpsIndex(): string {
  const html = readFileSync(join(RACINE, 'apps/dashboard/index.html'), 'utf-8');
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

function controlesSansRepere(racine: ParentNode): string[] {
  const exceptions = [...config.exceptions, ...EXCEPTIONS_RENDU];
  return [...racine.querySelectorAll<HTMLElement>(CONTROLES)]
    .filter((el) => el.closest('[data-zone]') !== null)
    .filter((el) => !el.hasAttribute('data-repere'))
    .filter((el) => !exceptions.some((x) => el.matches(x.cible)))
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

/** Cellule vide de la grille, pour poser un widget. */
function celluleVide(): HTMLElement {
  const cell = document.querySelector<HTMLElement>('.drop-cell.empty');
  expect(cell, 'cellule vide').not.toBeNull();
  return cell!;
}

/** Pose un widget sur la grille (sans passer par le glisser-déposer) et le rend. */
function poser(widget: Widget): Widget {
  const cell = celluleVide();
  widget.position = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
  state.dashboard.widgets.push(widget);
  renderWidget(widget, cell);
  return widget;
}

const SORTES: { nom: string; fabriquer: () => Widget }[] = [
  { nom: 'KPI', fabriquer: () => createWidget('kpi', 0, 0) },
  { nom: 'graphique manuel', fabriquer: () => createWidget('chart', 0, 0) },
  {
    nom: 'graphique issu des favoris',
    fabriquer: () => ({
      ...createWidget('chart', 0, 0),
      type: 'chart',
      config: { fromFavorite: true, favoriteId: 'f1', code: '<p>x</p>' },
    }),
  },
  {
    nom: "graphique produit par l'assistant",
    fabriquer: () => ({
      ...createWidget('chart', 0, 0),
      type: 'chart',
      config: { fromBuilder: true, chart: { type: 'bar', valueField: 'population' } },
    }),
  },
  { nom: 'tableau', fabriquer: () => createWidget('table', 0, 0) },
  { nom: 'texte', fabriquer: () => createWidget('text', 0, 0) },
];

describe('repères du dashboard : complétude par le rendu (#1007)', () => {
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
    await import('../../../apps/dashboard/src/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.waitFor(() => {
      expect(document.querySelector('.row-controls')).not.toBeNull();
    });
  });

  beforeEach(() => {
    constats.length = 0;
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  it('rendu initial (grille vide) : conforme au registre', () => {
    releve('initial');
    expect(constats).toEqual([]);
  });

  for (const sorte of SORTES) {
    it(`widget ${sorte.nom} : modale de configuration conforme au registre`, () => {
      if (!document.querySelector('.drop-cell.empty')) {
        document.getElementById('add-row-btn')!.click();
      }
      const widget = poser(sorte.fabriquer());
      openConfigModal(widget);
      expect(document.getElementById('config-modal')!.classList.contains('active')).toBe(true);
      releve(sorte.nom);
      closeConfigModal();
      expect(constats).toEqual([]);
    });
  }

  it("modale d'enregistrement : conforme au registre", () => {
    openSaveModal();
    releve('enregistrement');
    document.getElementById('save-modal')!.classList.remove('active');
    expect(constats).toEqual([]);
  });

  it("l'union des repères rendus est exactement le registre", () => {
    expect([...rendus].sort()).toEqual(idsDuGenre('controle'));
    expect([...zonesRendues].sort()).toEqual(idsDuGenre('zone'));
  });

  it('chaque exception de rendu a sa raison et sert', () => {
    for (const x of EXCEPTIONS_RENDU) {
      expect(x.raison.trim().length, x.cible).toBeGreaterThan(0);
      expect(document.querySelector(x.cible), x.cible).not.toBeNull();
    }
  });

  it('preuve de mutation : un champ de widget rendu sans repère est vu', () => {
    const widget = state.dashboard.widgets.find((w) => w.type === 'kpi')!;
    openConfigModal(widget);
    const hote = document.createElement('div');
    hote.innerHTML = document.getElementById('config-modal')!.outerHTML;
    closeConfigModal();
    expect(controlesSansRepere(hote)).toEqual([]);
    hote.querySelector('#config-format')!.removeAttribute('data-repere');
    expect(controlesSansRepere(hote)).toEqual(['<select id="config-format">']);
  });

  it('preuve de mutation : un repère posé dans la mauvaise zone est vu', () => {
    const widget = state.dashboard.widgets.find((w) => w.type === 'table')!;
    openConfigModal(widget);
    const hote = document.createElement('div');
    hote.innerHTML = document.getElementById('config-modal')!.outerHTML;
    closeConfigModal();
    const tri = hote.querySelector('#config-sortable')!;
    const kpiZone = document.createElement('div');
    kpiZone.setAttribute('data-zone', 'dashboard.widget.kpi');
    kpiZone.appendChild(tri);
    hote.appendChild(kpiZone);
    expect(ecartsAuRegistre(hote)).toContain(
      'dashboard.widget.tableau.tri : rendu dans la zone dashboard.widget.kpi, son identifiant annonce dashboard.widget.tableau'
    );
  });
});

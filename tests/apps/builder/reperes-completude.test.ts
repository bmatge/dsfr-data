/**
 * Complétude des repères du builder graphique PAR LE RENDU (#1006, epic #992,
 * ADR-143).
 *
 * `check:reperes` lit le source : il ne voit que les littéraux, et un contrôle
 * rendu par un gabarit TS (séries, lignes de filtre, colonnes du tableau,
 * facettes, jeux d'exemple) n'y a pas d'ancêtre lexical — sa règle « tout
 * contrôle d'une zone porte un repère » ne s'y applique pas. Ce test charge le
 * vrai `index.html`, exécute le vrai `main.ts`, charge un jeu d'exemple et REND
 * chaque gabarit pour chaque `ChartType`, puis vérifie sur le DOM obtenu :
 *
 *   1. tout contrôle (`input`, `select`, `textarea`, `button`) rendu dans une
 *      zone porte un repère, sauf exception déclarée dans `reperes.config.ts` ;
 *   2. tout `data-repere` et tout `data-zone` rendus sont au registre, avec la
 *      même balise ;
 *   3. la zone DOM la plus proche d'un repère est celle que son identifiant
 *      annonce (le chemin « Configuration des données › Séries › … » est vrai) ;
 *   4. l'union des repères rendus sur tous les scénarios est EXACTEMENT le
 *      registre : pas de repère fantôme, pas de contrôle jamais rendu.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Repere } from '@dsfr-data/shared';
import config from '../../../apps/builder/src/assistant/reperes.config';
import { REPERES } from '../../../apps/builder/src/assistant/reperes.generated';
import {
  MULTI_SERIES_TYPES,
  type BuilderState,
  type ChartType,
} from '../../../apps/builder/src/state';

// Le journal réseau et console (#994) patche fetch/console : sans objet ici.
vi.mock('@dsfr-data/shared/debug/installer-journal', () => ({}));
// Chrome applicatif qui touche au réseau ou à des composants non chargés.
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

const RACINE = resolve(import.meta.dirname, '../../..');
const CONTROLES = 'input:not([type="hidden"]), select, textarea, button';

const PAR_ID = new Map<string, Repere>(REPERES.map((r) => [r.id, r]));
const idsDuGenre = (genre: 'controle' | 'zone') =>
  REPERES.filter((r) => r.genre === genre)
    .map((r) => r.id)
    .sort();

/** Corps de `index.html`, sans ses `<script>` (le module de l'app est importé à part). */
function corpsIndex(): string {
  const html = readFileSync(join(RACINE, 'apps/builder/index.html'), 'utf-8');
  const ouverture = html.indexOf('>', html.indexOf('<body')) + 1;
  let corps = html.slice(ouverture, html.indexOf('</body>'));
  for (let debut = corps.indexOf('<script'); debut !== -1; debut = corps.indexOf('<script')) {
    const fin = corps.indexOf('</script>', debut);
    corps = corps.slice(0, debut) + corps.slice(fin + '</script>'.length);
  }
  return corps;
}

// ---------------------------------------------------------------------------
// Vérifications sur un DOM rendu (pures : réutilisées par la preuve de mutation)
// ---------------------------------------------------------------------------

/** Contrôles rendus dans une zone, sans repère et sans exception déclarée. */
function controlesSansRepere(racine: ParentNode): string[] {
  return [...racine.querySelectorAll<HTMLElement>(CONTROLES)]
    .filter((el) => el.closest('[data-zone]') !== null)
    .filter((el) => !el.hasAttribute('data-repere'))
    .filter((el) => !config.exceptions.some((x) => el.matches(x.cible)))
    .map(decrire);
}

/** Écarts entre les marques rendues et le registre (inconnue, balise, zone). */
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

function decrire(el: Element): string {
  const id = el.getAttribute('id');
  const classe = el.getAttribute('class');
  return `<${el.tagName.toLowerCase()}${id ? ` id="${id}"` : ''}${classe && !id ? ` class="${classe}"` : ''}>`;
}

const TYPES: ChartType[] = [
  'bar',
  'horizontalBar',
  'line',
  'pie',
  'doughnut',
  'radar',
  'scatter',
  'gauge',
  'kpi',
  'map',
  'datalist',
];

function cliquer(selecteur: string): void {
  const el = document.querySelector<HTMLElement>(selecteur);
  expect(el, `${selecteur} introuvable`).not.toBeNull();
  el!.click();
}

describe('repères du builder : complétude par le rendu (#1006)', () => {
  let state: BuilderState;
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
    sessionStorage.clear();
    document.body.className = 'builder-v2';
    document.body.innerHTML = corpsIndex();
    await import('../../../apps/builder/src/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    // Sans source enregistrée, la section Source propose les jeux d'exemple.
    await vi.waitFor(() => {
      expect(document.querySelector('.sample-dataset-card')).not.toBeNull();
    });
    const expose = (window as Window & { __BUILDER_STATE__?: BuilderState }).__BUILDER_STATE__;
    expect(expose, 'état exposé par main.ts').toBeDefined();
    state = expose!;
  });

  beforeEach(() => {
    constats.length = 0;
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  it('rendu initial (aucune source) : conforme au registre', () => {
    releve('initial');
    expect(constats).toEqual([]);
  });

  it("jeu d'exemple chargé : champs, bouton « Voir »", async () => {
    cliquer('.sample-dataset-card');
    await vi.waitFor(() => {
      expect(state.fields.length).toBeGreaterThan(0);
      expect(document.querySelector('#show-data-preview-btn')).not.toBeNull();
    });
    releve('source');
    expect(constats).toEqual([]);
  });

  for (const type of TYPES) {
    it(`type ${type} : séries, filtres, modales rendus conformes au registre`, () => {
      cliquer(`.chart-type-btn[data-type="${type}"]`);
      expect(state.chartType).toBe(type);
      if (MULTI_SERIES_TYPES.includes(type)) {
        cliquer('#add-series-btn');
        expect(document.querySelector('.extra-series-row')).not.toBeNull();
      }
      cliquer('#add-filter-btn');
      expect(document.querySelector('.filter-row')).not.toBeNull();
      cliquer('#datalist-columns-btn');
      expect(document.querySelector('.datalist-column-row')).not.toBeNull();
      cliquer('#facets-fields-btn');
      expect(document.querySelector('#facets-fields-list tr[data-field]')).not.toBeNull();
      releve(type);
      expect(constats).toEqual([]);
    });
  }

  it("l'union des repères rendus est exactement le registre", () => {
    expect([...rendus].sort()).toEqual(idsDuGenre('controle'));
    expect([...zonesRendues].sort()).toEqual(idsDuGenre('zone'));
  });

  it('preuve de mutation : une ligne de série rendue sans repère est vue', () => {
    // Le cas que la règle lexicale ne voit pas : extra-series.ts n'a pas
    // d'ancêtre data-zone. On retire le repère d'un contrôle rendu : rouge.
    cliquer('.chart-type-btn[data-type="bar"]');
    cliquer('#add-series-btn');
    const groupe = document.getElementById('extra-series-group')!;
    const hote = document.createElement('div');
    hote.setAttribute('data-zone', 'builder.donnees');
    hote.appendChild(groupe.cloneNode(true));
    expect(controlesSansRepere(hote)).toEqual([]);
    hote.querySelector('.extra-series-field')!.removeAttribute('data-repere');
    const vus = controlesSansRepere(hote);
    expect(vus).toHaveLength(1);
    expect(vus[0]).toMatch(/^<select id="extra-series-field-\d+">$/);
  });

  it('preuve de mutation : un repère posé dans la mauvaise zone est vu', () => {
    cliquer('#add-filter-btn');
    const hote = document.createElement('div');
    hote.innerHTML = document.getElementById('section-data')!.outerHTML;
    const valeur = hote.querySelector('.filter-row__value')!;
    hote.querySelector('[data-zone="builder.donnees.series"]')!.appendChild(valeur);
    expect(ecartsAuRegistre(hote)).toContain(
      'builder.donnees.filtres.valeur : rendu dans la zone builder.donnees.series, son identifiant annonce builder.donnees.filtres'
    );
  });
});

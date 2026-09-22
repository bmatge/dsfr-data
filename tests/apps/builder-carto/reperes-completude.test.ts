/**
 * Complétude des repères de la carto PAR LE RENDU (#1002, epic #992, ADR-143).
 *
 * `check:reperes` lit le source : il ne voit pas un contrôle produit par une
 * fonction qui n'est pas déclarée comme helper (`popupFieldsHtml(layer)`), ni un
 * gabarit rendu par `innerHTML` hors de toute sous-zone (ARCHITECTURE.md §12,
 * « un repère est un littéral, et sa complétude n'est que lexicale »). Ce test
 * charge le vrai `index.html`, exécute le vrai `main.ts` et REND chaque panneau
 * pour chaque `LayerType` × `PopupMode` × options avancées fermées / ouvertes,
 * puis vérifie, sur le DOM obtenu :
 *
 *   1. tout contrôle (`input`, `select`, `textarea`, `button`) rendu dans une
 *      zone porte un repère, sauf exception déclarée dans `reperes.config.ts` ;
 *   2. tout `data-repere` et tout `data-zone` rendus sont au registre, avec la
 *      même balise ;
 *   3. la zone DOM la plus proche d'un repère est celle que son identifiant
 *      annonce (le chemin « Éléments › Au clic › … » est vrai à l'écran) ;
 *   4. l'union des repères rendus sur tous les scénarios est EXACTEMENT le
 *      registre : pas de repère fantôme, pas de contrôle jamais rendu.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Repere } from '@dsfr-data/shared';
import config from '../../../apps/builder-carto/src/assistant/reperes.config';
import { REPERES } from '../../../apps/builder-carto/src/assistant/reperes.generated';
import type {
  CartoState,
  FieldInfo,
  LayerConfig,
  LayerType,
  PopupMode,
} from '../../../apps/builder-carto/src/state';

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
  const html = readFileSync(join(RACINE, 'apps/builder-carto/index.html'), 'utf-8');
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

// ---------------------------------------------------------------------------
// Scénarios de rendu
// ---------------------------------------------------------------------------

const TYPES: LayerType[] = ['marker', 'geoshape', 'circle', 'heatmap'];
const MODES: PopupMode[] = ['none', 'tooltip', 'popup', 'panel-right', 'panel-left'];

const CHAMPS: FieldInfo[] = [
  { name: 'nom', type: 'string', fillRate: 1 },
  { name: 'population', type: 'number', fillRate: 1 },
  { name: 'geo', type: 'object', fillRate: 1 },
];

/**
 * Variantes des sections conditionnelles. « fermées » : la couche telle qu'on
 * la crée, sans champ détecté. « ouvertes » : chaque option qui déplie un
 * contrôle est activée (clustering, choroplèthe, catégories, temps, bbox,
 * encarts…), avec deux méthodes de découpage — l'une montre « Nombre de
 * classes », l'autre « Bornes hautes ».
 */
type Variante = 'fermees' | 'ouvertes' | 'ouvertes-bornes' | 'decorative';
const VARIANTES: Variante[] = ['fermees', 'ouvertes', 'ouvertes-bornes', 'decorative'];

interface Etat {
  state: CartoState;
  createLayer: () => LayerConfig;
}

function couche(e: Etat, type: LayerType, mode: PopupMode, v: Variante): LayerConfig {
  const l = e.createLayer();
  Object.assign(l, {
    id: 'layer-1',
    type,
    popupMode: mode,
    source: { id: 'src', name: 'Source', type: 'manual', data: [] },
  });
  if (v === 'decorative') l.noInteractive = true;
  if (v === 'ouvertes' || v === 'ouvertes-bornes') {
    Object.assign(l, {
      fields: CHAMPS,
      popupFields: 'nom',
      geoField: 'geo',
      cluster: true,
      fillField: 'population',
      classMethod: v === 'ouvertes' ? 'equal' : 'manual',
      radiusUnit: v === 'ouvertes' ? 'px' : 'm',
      colorField: 'nom',
      timeField: 'nom',
      bbox: true,
    });
  }
  return l;
}

/** Rend tous les panneaux pour l'état donné, par le vrai chemin de l'interface. */
function rendre(e: Etat, couches: LayerConfig[], ouvrirEncarts: boolean): void {
  e.state.layers = couches;
  e.state.activeLayerId = couches[0].id;
  e.state.map.insets = ouvrirEncarts ? ['guyane'] : [];
  // Clic sur la ligne de la couche : c'est lui qui appelle renderAll().
  const ligne = document.querySelector<HTMLElement>(
    `#layers-list [data-layer-id="${couches[0].id}"]`
  );
  expect(ligne, 'ligne de couche introuvable').not.toBeNull();
  ligne!.click();
}

describe('repères de la carto : complétude par le rendu (#1002)', () => {
  let e: Etat;
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
    document.body.className = 'carto-app';
    document.body.innerHTML = corpsIndex();
    await import('../../../apps/builder-carto/src/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    // Le gestionnaire est asynchrone (await initAuth) : on attend le premier rendu.
    await vi.waitFor(() => {
      expect(document.querySelector('#layers-list [data-layer-id]')).not.toBeNull();
    });
    const mod = await import('../../../apps/builder-carto/src/state');
    const state = (window as Window & { __BUILDER_CARTO_STATE__?: CartoState })
      .__BUILDER_CARTO_STATE__;
    expect(state, 'état exposé par main.ts').toBeDefined();
    e = { state: state!, createLayer: mod.createLayer };
  });

  // Chaque scénario ne répond que de ses propres constats.
  beforeEach(() => {
    constats.length = 0;
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  it('rendu initial (couche sans données) : conforme au registre', () => {
    releve('initial');
    expect(constats).toEqual([]);
  });

  for (const v of VARIANTES) {
    it(`chaque LayerType × PopupMode, options ${v} : conforme au registre`, () => {
      for (const type of TYPES) {
        for (const mode of MODES) {
          const principale = couche(e, type, mode, v);
          // Deux couches : le bouton « Supprimer » n'existe qu'à partir de deux.
          const seconde = couche(e, 'marker', 'none', 'fermees');
          seconde.id = 'layer-2';
          rendre(e, [principale, seconde], v !== 'fermees');
          releve(`${type} × ${mode} × ${v}`);
        }
      }
      expect(constats).toEqual([]);
    });
  }

  it('couche sans données : section Données seule, sans repère orphelin', () => {
    const l = e.createLayer();
    l.id = 'layer-1';
    rendre(e, [l], false);
    releve('sans-source');
    expect(constats).toEqual([]);
  });

  it("l'union des repères rendus est exactement le registre", () => {
    expect([...rendus].sort()).toEqual(idsDuGenre('controle'));
    expect([...zonesRendues].sort()).toEqual(idsDuGenre('zone'));
  });

  it('preuve de mutation : un contrôle de popupFieldsHtml sans repère est vu', () => {
    // Le cas que la règle lexicale ne voit pas : popupFieldsHtml n'est pas un
    // helper déclaré. On rend un scénario où ses cases existent, puis on retire
    // le repère d'une case : le test doit rougir.
    rendre(e, [couche(e, 'marker', 'popup', 'ouvertes')], false);
    const clone = document.getElementById('layer-config')!.cloneNode(true) as HTMLElement;
    const hote = document.createElement('section');
    hote.setAttribute('data-zone', 'carto.elements');
    hote.appendChild(clone);
    expect(controlesSansRepere(hote)).toEqual([]);
    const caseChamp = hote.querySelector('[data-pf]')!;
    caseChamp.removeAttribute('data-repere');
    expect(controlesSansRepere(hote)).toEqual(['<input>']);
  });

  it('preuve de mutation : un repère posé dans la mauvaise zone est vu', () => {
    rendre(e, [couche(e, 'circle', 'popup', 'ouvertes')], false);
    const hote = document.createElement('div');
    hote.innerHTML = document.getElementById('layer-config')!.innerHTML;
    const opacite = hote.querySelector('#layer-circle-fill-opacity')!;
    hote.querySelector('[data-zone="carto.elements.clic"]')!.appendChild(opacite);
    expect(ecartsAuRegistre(hote)).toContain(
      'carto.elements.avancees.opacite : rendu dans la zone carto.elements.clic, son identifiant annonce carto.elements.avancees'
    );
  });
});

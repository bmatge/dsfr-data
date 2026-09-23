/**
 * Adaptateur de révélation de la carto (#1005, ADR-143 §6), sur le vrai
 * `index.html` et le vrai `main.ts` : panneau replié déplié, `<details>`
 * « Options avancées » ouvert, panneaux re-rendus quand le DOM est en retard
 * sur l'état, onglet Code sélectionné ; `null` pour un contrôle que la couche
 * n'affiche pas ; jamais de changement d'état. Puis le chemin complet par
 * `montrer()` : sans couche active, le prérequis `couche-active` montre
 * d'abord la liste des couches ; après sélection, « Comportement au clic » est
 * révélé et surligné.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { CLASSE_REPERE_MONTRE, effacerSurbrillance, montrer } from '@dsfr-data/shared';
import type { AdaptateurReperage } from '@dsfr-data/shared';
import type { CartoState, LayerConfig } from '../../../apps/builder-carto/src/state';

vi.mock('@dsfr-data/shared/debug/installer-journal', () => ({}));
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

type ModuleAdaptateur = typeof import('../../../apps/builder-carto/src/assistant/adaptateur');
type ModuleRegistre = typeof import('../../../apps/builder-carto/src/assistant/reperes.generated');

describe('adaptateur de révélation de la carto (#1005)', () => {
  let state: CartoState;
  let createLayer: () => LayerConfig;
  let renderAll: () => void;
  let mod: ModuleAdaptateur;
  let registre: ModuleRegistre;
  let rendus: number;
  let adaptateur: AdaptateurReperage<CartoState>;

  beforeAll(async () => {
    localStorage.clear();
    document.body.className = 'carto-app';
    document.body.innerHTML = corpsIndex();
    const main = await import('../../../apps/builder-carto/src/main');
    renderAll = main.renderAll;
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.waitFor(() => {
      expect(document.querySelector('#layers-list [data-layer-id]')).not.toBeNull();
    });
    createLayer = (await import('../../../apps/builder-carto/src/state')).createLayer;
    mod = await import('../../../apps/builder-carto/src/assistant/adaptateur');
    registre = await import('../../../apps/builder-carto/src/assistant/reperes.generated');
    state = (window as Window & { __BUILDER_CARTO_STATE__?: CartoState }).__BUILDER_CARTO_STATE__!;
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  /** Une couche de points avec des données, active, rendue par le vrai chemin. */
  function coucheDePoints(extra: Partial<LayerConfig> = {}): LayerConfig {
    const l = createLayer();
    Object.assign(l, {
      id: 'layer-1',
      name: 'Écoles',
      source: { id: 's', name: 'Écoles', type: 'api', apiUrl: 'https://exemple.fr/data' },
      latField: 'lat',
      lonField: 'lon',
      ...extra,
    });
    state.layers = [l];
    state.activeLayerId = l.id;
    renderAll();
    return l;
  }

  beforeEach(() => {
    rendus = 0;
    adaptateur = mod.creerAdaptateurCarto({
      rendre: () => {
        rendus++;
        renderAll();
      },
    });
    coucheDePoints();
  });

  afterEach(() => {
    effacerSurbrillance();
  });

  describe('tables', () => {
    it('chaque zone à panneau existe dans le registre et porte son panneau dans le DOM', () => {
      const zones = new Set<string>(
        registre.REPERES.filter((r) => r.genre === 'zone').map((r) => r.id)
      );
      for (const [zone, panneau] of Object.entries(mod.PANNEAU_DE_ZONE)) {
        expect(zones.has(zone), zone).toBe(true);
        expect(document.getElementById(panneau)?.getAttribute('data-zone'), zone).toBe(zone);
      }
    });

    it('panneau et onglet se déduisent de l’identifiant', () => {
      expect(mod.panneauDuRepere('carto.elements.clic.popup-mode')).toBe('panel-elements');
      expect(mod.panneauDuRepere('carto.carte.avancees.zoom-max')).toBe('panel-carte');
      expect(mod.panneauDuRepere('carto.actions.generer')).toBeUndefined();
      expect(mod.estDansOngletCode('carto.code.mode')).toBe(true);
      expect(mod.estDansOngletCode('carto.code.onglet')).toBe(false);
    });
  });

  describe('reveler()', () => {
    it('déplie le panneau replié qui porte le repère', async () => {
      const panneau = document.getElementById('panel-carte')!;
      expect(panneau.classList.contains(mod.CLASSE_PANNEAU_REPLIE)).toBe(true);
      const el = await adaptateur.reveler('carto.carte.fond');
      expect(el?.id).toBe('map-tiles');
      expect(panneau.classList.contains(mod.CLASSE_PANNEAU_REPLIE)).toBe(false);
      // Rail + volet unique (#1088) : le bouton du rail suit, les autres
      // volets se masquent.
      const bouton = document.querySelector('[data-volet="panel-carte"]')!;
      expect(bouton.getAttribute('aria-expanded')).toBe('true');
      for (const autre of ['panel-couches', 'panel-elements']) {
        expect(document.getElementById(autre)!.classList.contains(mod.CLASSE_PANNEAU_REPLIE)).toBe(
          true
        );
      }
    });

    it('ouvre le <details> « Options avancées » du panneau Éléments', async () => {
      const details = document.querySelector<HTMLDetailsElement>(
        '[data-zone="carto.elements.avancees"]'
      )!;
      expect(details.open).toBe(false);
      const el = await adaptateur.reveler('carto.elements.avancees.max-items');
      expect(el?.getAttribute('data-repere')).toBe('carto.elements.avancees.max-items');
      expect(details.open).toBe(true);
    });

    it('une zone <details> est dépliée elle-même', async () => {
      const el = await adaptateur.reveler('carto.carte.avancees');
      expect(el).toBeInstanceOf(HTMLDetailsElement);
      expect((el as HTMLDetailsElement).open).toBe(true);
    });

    it('panneaux en retard sur l’état : re-rendus avant la résolution', async () => {
      // L'état change sans rendu : la couche active n'est plus celle du DOM.
      const autre = createLayer();
      Object.assign(autre, { id: 'layer-2', name: 'Zones', type: 'geoshape' });
      state.layers = [...state.layers, autre];
      state.activeLayerId = 'layer-2';
      await adaptateur.reveler('carto.couches.nom');
      expect(rendus).toBe(1);
      const active = document.querySelector('#layers-list .carto-layers__item--active');
      expect(active?.getAttribute('data-layer-id')).toBe('layer-2');
      // À jour : pas de second rendu.
      await adaptateur.reveler('carto.couches.nom');
      expect(rendus).toBe(1);
    });

    it('onglet Code : sélectionné par son bouton', async () => {
      const bouton = document.getElementById('carto-tab-code-btn')!;
      const clic = vi.fn();
      bouton.addEventListener('click', clic);
      const el = await adaptateur.reveler('carto.code.mode');
      expect(el?.id).toBe('gen-mode');
      expect(clic).toHaveBeenCalledTimes(1);
      bouton.removeEventListener('click', clic);
    });

    it('contrôle que la couche n’affiche pas : null, jamais révélé de force', async () => {
      // Le champ d'infobulle n'existe qu'en mode « infobulle ».
      coucheDePoints({ popupMode: 'popup' });
      expect(await adaptateur.reveler('carto.elements.clic.tooltip-field')).toBeNull();
      expect(state.layers[0].popupMode).toBe('popup');
    });

    it('identifiant hors grammaire ou absent du DOM : null', async () => {
      expect(await adaptateur.reveler('carto.x"] *')).toBeNull();
      expect(await adaptateur.reveler('carto.couches.inexistant')).toBeNull();
    });

    it('ne modifie jamais l’état de la carte', async () => {
      const avant = JSON.stringify(state);
      for (const r of registre.REPERES) {
        // L'onglet Code se sélectionne par son bouton, dont main.ts rafraîchit le code.
        await adaptateur.reveler(r.id);
      }
      expect(JSON.stringify(state)).toBe(avant);
    });
  });

  describe('etat() et onEtatChange()', () => {
    it('etat() est l’état singleton de la carto', () => {
      expect(adaptateur.etat()).toBe(state);
    });

    it('un changement de contrôle rappelle une fois, en microtâche, puis se désabonne', async () => {
      let appels = 0;
      const stop = adaptateur.onEtatChange!(() => appels++);
      const champ = document.getElementById('layer-name') ?? document.body;
      champ.dispatchEvent(new Event('change', { bubbles: true }));
      champ.dispatchEvent(new Event('input', { bubbles: true }));
      expect(appels).toBe(0);
      await Promise.resolve();
      expect(appels).toBe(1);
      stop();
      champ.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      expect(appels).toBe(1);
    });
  });

  describe('montrer() : « Comportement au clic » (carto.elements.clic.popup-mode)', () => {
    const ID = 'carto.elements.clic.popup-mode';

    it('sans couche active : le prérequis couche-active montre d’abord la liste des couches', async () => {
      state.activeLayerId = 'aucune';
      const r = await montrer(ID, {
        registre: registre.REGISTRE,
        adaptateur,
        mode: 'dire',
      });
      expect(r.ok).toBe(false);
      expect(r.raison).toBe('prerequis');
      expect(r.prerequis).toBe('couche-active');
      expect(r.element?.id).toBe('layers-list');
      expect(r.chemin).toEqual(['Couches de données', 'Couches de la carte']);
      expect(r.element?.classList.contains(CLASSE_REPERE_MONTRE)).toBe(true);
      // Le panneau Éléments dit « Sélectionnez une couche » : le contrôle n'y est pas.
      expect(document.querySelector(`[data-repere="${ID}"]`)).toBeNull();
    });

    it('après sélection de la couche : le contrôle est révélé et surligné', async () => {
      state.activeLayerId = 'aucune';
      renderAll();
      // L'usager sélectionne la couche dans la liste, par le vrai chemin.
      document.querySelector<HTMLElement>('#layers-list [data-layer-id="layer-1"]')!.click();
      expect(state.activeLayerId).toBe('layer-1');
      // Panneau Éléments replié entre-temps : l'adaptateur le déplie.
      document.getElementById('panel-elements')!.classList.add(mod.CLASSE_PANNEAU_REPLIE);

      const r = await montrer(ID, { registre: registre.REGISTRE, adaptateur, mode: 'dire' });
      expect(r.ok).toBe(true);
      expect(r.element?.id).toBe('layer-popup-mode');
      expect(r.element?.classList.contains(CLASSE_REPERE_MONTRE)).toBe(true);
      expect(r.chemin).toEqual([
        'Éléments de la couche',
        'Au clic sur un élément',
        'Comportement au clic',
      ]);
      expect(
        document.getElementById('panel-elements')!.classList.contains(mod.CLASSE_PANNEAU_REPLIE)
      ).toBe(false);
    });

    it('couche sans données : le prérequis couche-source montre le choix des données', async () => {
      coucheDePoints({ source: null });
      const r = await montrer(ID, { registre: registre.REGISTRE, adaptateur, mode: 'dire' });
      expect(r.prerequis).toBe('couche-source');
      expect(r.element?.getAttribute('data-repere')).toBe('carto.couches.source');
    });

    it('couche décorative : le prérequis couche-interactive montre l’option avancée', async () => {
      coucheDePoints({ noInteractive: true });
      const r = await montrer(ID, { registre: registre.REGISTRE, adaptateur, mode: 'dire' });
      expect(r.prerequis).toBe('couche-interactive');
      expect(r.element?.getAttribute('data-repere')).toBe('carto.elements.avancees.no-interactive');
      expect(
        document.querySelector<HTMLDetailsElement>('[data-zone="carto.elements.avancees"]')!.open
      ).toBe(true);
    });
  });
});

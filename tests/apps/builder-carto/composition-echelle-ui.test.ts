/**
 * Composition par échelle, par le vrai chemin de l'interface (#1021) : le
 * vrai `index.html`, le vrai `main.ts`. Le total arrive comme dans l'aperçu
 * (`dsfr-data-map-layer-render` d'une couche rendue) ; l'encart se pose dans
 * le panneau Couches SANS rien ouvrir ; la confirmation ne vient qu'au clic ;
 * refusée, rien ne change ; acceptée, deux couches et leurs zooms.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { CartoState, LayerConfig } from '../../../apps/builder-carto/src/state';

const confirmation = vi.hoisted(() => ({ reponse: true, appels: [] as string[] }));

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
    confirmDialog: vi.fn(async (message: string) => {
      confirmation.appels.push(message);
      return confirmation.reponse;
    }),
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

const BOUTON = '[data-repere="carto.couches.composition.composer"]';

describe('composition par échelle : encart, confirmation, deux couches (#1021)', () => {
  let state: CartoState;
  let createLayer: () => LayerConfig;

  beforeAll(async () => {
    localStorage.clear();
    document.body.className = 'carto-app';
    document.body.innerHTML = corpsIndex();
    await import('../../../apps/builder-carto/src/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.waitFor(() => {
      expect(document.querySelector('#layers-list [data-layer-id]')).not.toBeNull();
    });
    const mod = await import('../../../apps/builder-carto/src/state');
    createLayer = mod.createLayer;
    state = (window as Window & { __BUILDER_CARTO_STATE__?: CartoState }).__BUILDER_CARTO_STATE__!;
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  /** Une couche de points Tabular dont l'analyse a détecté un code de département. */
  function preparer(): LayerConfig {
    const l = createLayer();
    Object.assign(l, {
      id: 'layer-1',
      name: 'Élus',
      source: {
        id: 's',
        name: 'Élus',
        type: 'api',
        apiUrl:
          'https://tabular-api.data.gouv.fr/api/resources/2876a346-d50c-4911-934e-19ee07b0e503/data/',
      },
      latField: 'lat',
      lonField: 'lon',
      territoire: { champ: 'Code du département', niveau: 'departement' },
    });
    state.layers = [l];
    state.activeLayerId = l.id;
    // Premier clic : la liste se re-rend sur le nouvel état ; second clic : la
    // ligne de la couche, par le vrai chemin de sélection (renderAll).
    document.querySelector<HTMLElement>('#layers-list [data-layer-id]')!.click();
    document.querySelector<HTMLElement>(`#layers-list [data-layer-id="${l.id}"]`)!.click();
    expect(state.activeLayerId).toBe(l.id);
    return l;
  }

  /** Le total rapporté par la couche rendue dans l'aperçu. */
  function rapporterTotal(source: string, total: number, dansUnEncart = false) {
    const hote = document.getElementById('map-canvas')!;
    const parent = dansUnEncart ? document.createElement('dsfr-data-map-inset') : hote;
    if (dansUnEncart) hote.appendChild(parent);
    const couche = document.createElement('dsfr-data-map-layer');
    couche.setAttribute('source', source);
    parent.appendChild(couche);
    couche.dispatchEvent(
      new CustomEvent('dsfr-data-map-layer-render', { bubbles: true, detail: { total } })
    );
    (dansUnEncart ? parent : couche).remove();
  }

  beforeEach(() => {
    confirmation.reponse = true;
    confirmation.appels = [];
  });

  it('sous le plafond : aucun encart', () => {
    preparer();
    rapporterTotal('layer-1', 800);
    expect(document.querySelector(BOUTON)).toBeNull();
  });

  it('un encart territorial ne compte pas : seule la carte principale rapporte le total', () => {
    preparer();
    rapporterTotal('layer-1', 34826, true);
    expect(document.querySelector(BOUTON)).toBeNull();
  });

  it('au-delà : l’encart se pose, rien ne s’ouvre de soi-même, le lecteur d’écran est prévenu', () => {
    preparer();
    rapporterTotal('layer-1', 34826);
    const bouton = document.querySelector<HTMLButtonElement>(BOUTON);
    expect(bouton).not.toBeNull();
    expect(bouton!.type).toBe('button');
    expect(bouton!.textContent?.trim()).toBe('Composer par échelle');
    expect(document.getElementById('composition-echelle')!.textContent).toContain('34');
    expect(confirmation.appels).toEqual([]);
    const annonce = document.getElementById('composition-echelle-annonce')!;
    expect(annonce.getAttribute('role')).toBe('status');
    expect(annonce.textContent).toContain('composer par échelle');
  });

  it('confirmation refusée : rien ne change', async () => {
    confirmation.reponse = false;
    const l = preparer();
    rapporterTotal('layer-1', 34826);
    document.querySelector<HTMLButtonElement>(BOUTON)!.click();
    await vi.waitFor(() => expect(confirmation.appels).toHaveLength(1));
    expect(state.layers).toHaveLength(1);
    expect(l.minZoom).toBe(0);
  });

  it('confirmée : deux couches, zooms 7 / 8, code généré à jour', async () => {
    const l = preparer();
    rapporterTotal('layer-1', 34826);
    document.querySelector<HTMLButtonElement>(BOUTON)!.click();
    await vi.waitFor(() => expect(state.layers).toHaveLength(2));
    expect(confirmation.appels[0]).toContain('34');
    expect(confirmation.appels[0]).toContain('zoom 7');
    const [zones, points] = state.layers;
    expect(points).toBe(l);
    expect(points.minZoom).toBe(8);
    expect(zones.maxZoom).toBe(7);
    expect(zones.agregat).toEqual({
      champ: 'Code du département',
      niveau: 'departement',
      depuis: l.id,
    });

    // L'encart laisse la place au constat, et l'annonce le dit.
    expect(document.querySelector(BOUTON)).toBeNull();
    expect(document.getElementById('composition-echelle')!.textContent).toContain(
      'Composée par échelle'
    );
    expect(document.getElementById('composition-echelle-annonce')!.textContent).toContain(
      'Élus par département'
    );
    const code = document.getElementById('code-output')!.textContent!;
    expect(code).toContain('aggregate="Code du département:count"');
    expect(code).toContain('min-zoom="8"');
    expect(code).toContain('max-zoom="7"');
  });
});

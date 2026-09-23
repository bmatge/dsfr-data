/**
 * Le code copié depuis le Builder Carto porte ses dépendances.
 *
 * Le mode « page autonome » est le DÉFAUT : collé dans un fichier vierge, le
 * code doit s'afficher. Auparavant le défaut était « ma page charge déjà
 * dsfr-data » — qui donne une page blanche, sans rien pour le dire — et même le
 * mode autonome était incomplet : pas de feuille utilitaire (les popups posent
 * `fr-mb-1v`), et un seul bundle chargé en module.
 *
 * Ce que le bloc doit contenir, et ce qu'il ne doit PAS contenir : aucune carte
 * ne dépend de `@gouvfr/dsfr-chart`, et la feuille de Leaflet est injectée par
 * `dsfr-data-map` lui-même.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CDN_URLS } from '@dsfr-data/shared';
import { state, resetState } from '../../../apps/builder-carto/src/state';
import { generateCode } from '../../../apps/builder-carto/src/ui/code-generator';

function carteSimple() {
  const layer = state.layers[0];
  layer.source = {
    id: 'src',
    name: 'Test',
    type: 'manual',
    data: [{ ville: 'Paris', lat: 48.85, lon: 2.35 }],
  };
  layer.latField = 'lat';
  layer.lonField = 'lon';
}

beforeEach(() => {
  localStorage.clear();
  resetState();
  carteSimple();
});

describe('dépendances du code exporté', () => {
  it('le mode par défaut est la page autonome', () => {
    expect(state.generationMode).toBe('dynamic');
  });

  it('porte le DSFR, sa feuille utilitaire et les deux bundles dsfr-data', () => {
    const code = generateCode();
    expect(code).toContain(`<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">`);
    expect(code).toContain(`<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">`);
    expect(code).toMatch(/<script src="[^"]+\/dsfr-data\.core\.umd\.js"><\/script>/);
    expect(code).toMatch(/<script src="[^"]+\/dsfr-data\.map\.umd\.js"><\/script>/);
  });

  it('les dépendances précèdent le premier composant', () => {
    const code = generateCode();
    expect(code.indexOf('dsfr-data.map.umd.js')).toBeLessThan(code.indexOf('<dsfr-data-source'));
  });

  it('n’embarque ni dsfr-chart ni la feuille de Leaflet', () => {
    const code = generateCode();
    expect(code).not.toContain('dsfr-chart');
    expect(code).not.toContain('leaflet.css');
  });

  it('le mode « ma page charge déjà dsfr-data » reste sans dépendances', () => {
    state.generationMode = 'embedded';
    const code = generateCode();
    expect(code).not.toContain('<link rel="stylesheet"');
    expect(code).not.toContain('<script src=');
    expect(code).toContain('<dsfr-data-map');
  });
});

/**
 * Tests du générateur de code du Builder Carto (#461) : nouveaux attributs
 * carte (insets, locked, sovereign-only), couche (shape-class, no-interactive),
 * timeline configurée, compagnon a11y et template auto des popups.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { state, createLayer, resetState, DROM_IDS } from '../../../apps/builder-carto/src/state';
import {
  generateCode,
  buildSourceTag,
  insetsAttrValue,
} from '../../../apps/builder-carto/src/ui/code-generator';

function withManualSource(layer = state.layers[0]) {
  layer.source = {
    id: 'test-src',
    name: 'Test',
    type: 'manual',
    data: [{ ville: 'Paris', lat: 48.85, lon: 2.35, population: 2133111 }],
  };
  layer.latField = 'lat';
  layer.lonField = 'lon';
  return layer;
}

beforeEach(() => {
  resetState();
});

describe('generateCode — carte', () => {
  it('émet id + compagnon a11y par défaut', () => {
    withManualSource();
    const code = generateCode();
    expect(code).toContain('<dsfr-data-map id="carte">');
    expect(code).toContain('<dsfr-data-a11y for="carte" source="layer-1" table download>');
  });

  it("n'émet ni id ni compagnon quand a11y est décoché", () => {
    withManualSource();
    state.map.a11y = false;
    const code = generateCode();
    expect(code).toContain('<dsfr-data-map>');
    expect(code).not.toContain('dsfr-data-a11y');
  });

  it('émet locked, sovereign-only et no-controls', () => {
    withManualSource();
    state.map.locked = true;
    state.map.sovereignOnly = true;
    state.map.noControls = true;
    const code = generateCode();
    expect(code).toContain('sovereign-only');
    expect(code).toContain('no-controls');
    expect(code).toMatch(/<dsfr-data-map[^>]* locked[ >]/);
  });

  it('compresse les 5 DROM en groupe drom dans insets', () => {
    state.map.insets = [...DROM_IDS, 'corse'];
    expect(insetsAttrValue()).toBe('drom,corse');
    state.map.insets = ['guadeloupe', 'corse'];
    expect(insetsAttrValue()).toBe('guadeloupe,corse');
    withManualSource();
    state.map.insets = [...DROM_IDS];
    expect(generateCode()).toContain('insets="drom"');
  });

  it('le compagnon a11y pointe vers la query quand la couche est filtrée', () => {
    const layer = withManualSource();
    layer.filter = 'population:gt:100000';
    const code = generateCode();
    expect(code).toContain('<dsfr-data-query id="layer-1-filtre" source="layer-1"');
    expect(code).toContain('source="layer-1-filtre"');
    expect(code).toContain('<dsfr-data-a11y for="carte" source="layer-1-filtre"');
  });
});

describe('generateCode — couche', () => {
  it('émet no-interactive et supprime tooltip et popup', () => {
    const layer = withManualSource();
    layer.noInteractive = true;
    layer.popupMode = 'panel-right';
    layer.tooltipField = 'ville';
    const code = generateCode();
    expect(code).toContain('no-interactive');
    expect(code).not.toContain('tooltip-field');
    expect(code).not.toContain('dsfr-data-map-popup');
  });

  it('émet shape-class et fill-opacity pour les cercles', () => {
    const layer = withManualSource();
    layer.type = 'circle';
    layer.shapeClass = 'territoire-hachure';
    layer.fillOpacity = 0.2;
    const code = generateCode();
    expect(code).toContain('shape-class="territoire-hachure"');
    expect(code).toContain('fill-opacity="0.2"');
  });

  it('génère un template depuis les champs affichés (mode panneau)', () => {
    const layer = withManualSource();
    layer.popupMode = 'panel-right';
    layer.popupFields = 'ville, population';
    const code = generateCode();
    expect(code).toContain('mode="panel-right"');
    expect(code).toContain('<template>');
    expect(code).toContain('{{ville}}');
    expect(code).toContain('{{population}}');
  });

  it('émet cluster (et son rayon) en mode marqueurs (#482)', () => {
    const layer = withManualSource();
    layer.type = 'marker';
    layer.cluster = true;
    layer.clusterRadius = 120;
    const code = generateCode();
    expect(code).toMatch(/<dsfr-data-map-layer[^>]*[\s\n]cluster[\s\n>]/);
    expect(code).toContain('cluster-radius="120"');
  });

  it("n'émet pas cluster hors mode marqueurs (#482 bug 6 : cercles clusterisés)", () => {
    const layer = withManualSource();
    layer.type = 'circle';
    layer.cluster = true; // état conservé pour un retour aux marqueurs
    const code = generateCode();
    expect(code).not.toMatch(/[\s\n]cluster[\s\n>=]/);
  });

  it('le template explicite prime sur les champs affichés', () => {
    const layer = withManualSource();
    layer.popupMode = 'popup';
    layer.popupFields = 'ville';
    layer.popupTemplate = '<h3>{{ville}}</h3>';
    const code = generateCode();
    expect(code).toContain('<h3>{{ville}}</h3>');
    expect(code).not.toContain('<strong>ville :</strong>');
  });
});

describe('generateCode — timeline', () => {
  it('émet la timeline avec vitesse et intervalle non par défaut', () => {
    const layer = withManualSource();
    layer.timeField = 'date';
    layer.timeBucket = 'month';
    layer.timeMode = 'cumulative';
    state.map.timelineSpeed = 2;
    state.map.timelineInterval = 1500;
    const code = generateCode();
    expect(code).toContain('time-field="date"');
    expect(code).toContain('time-bucket="month"');
    expect(code).toContain('time-mode="cumulative"');
    expect(code).toContain('<dsfr-data-map-timeline speed="2" interval="1500">');
  });

  it('timeline sans attributs aux valeurs par défaut', () => {
    const layer = withManualSource();
    layer.timeField = 'date';
    const code = generateCode();
    expect(code).toContain('<dsfr-data-map-timeline></dsfr-data-map-timeline>');
  });
});

describe('buildSourceTag', () => {
  it('adapter ODS avec id et limit de scan', () => {
    const layer = createLayer();
    layer.source = {
      id: 's1',
      name: 'ODS',
      type: 'api',
      apiUrl: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/mon-jeu/records',
    };
    const tag = buildSourceTag(layer, { id: 'scan-1', limit: 50 });
    expect(tag).toContain('id="scan-1"');
    expect(tag).toContain('api-type="opendatasoft"');
    expect(tag).toContain('dataset-id="mon-jeu"');
    expect(tag).toContain('limit="50"');
  });

  it('max-items devient limit pour les adapters', () => {
    const layer = createLayer();
    layer.source = {
      id: 's1',
      name: 'ODS',
      type: 'api',
      apiUrl: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/mon-jeu/records',
    };
    layer.maxItems = 200;
    const tag = buildSourceTag(layer);
    expect(tag).toContain('limit="200"');
  });

  it('source manuelle : données inline', () => {
    const layer = withManualSource(createLayer());
    const tag = buildSourceTag(layer);
    expect(tag).toContain("data='[{");
    expect(tag).not.toContain('api-type');
  });

  it('source vide : chaîne vide', () => {
    const layer = createLayer();
    expect(buildSourceTag(layer)).toBe('');
  });
});

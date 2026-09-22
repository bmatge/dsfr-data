/**
 * Composition par échelle du Builder Carto (#1021, volet builder) : détection
 * du champ territoire, conditions de la proposition, couche agrégée créée et
 * code généré (deux couches, zooms 7 / 8, query agrégée seule lectrice de sa
 * source, fond administratif joint sur le code).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { state, createLayer, resetState } from '../../../apps/builder-carto/src/state';
import type { LayerConfig } from '../../../apps/builder-carto/src/state';
import { generateCode } from '../../../apps/builder-carto/src/ui/code-generator';
import {
  composerParEchelle,
  defaireComposition,
  detecterChampTerritoire,
  estComposee,
  proposerComposition,
  urlContours,
  MAX_ZOOM_AGREGAT,
  MIN_ZOOM_POINTS,
} from '../../../apps/builder-carto/src/composition-echelle';
import { computeFields } from '../../../apps/builder-carto/src/field-service';

const ELUS =
  'https://tabular-api.data.gouv.fr/api/resources/2876a346-d50c-4911-934e-19ee07b0e503/data/';

beforeEach(() => {
  resetState();
});

// ---------------------------------------------------------------------------
// Détection du champ territoire
// ---------------------------------------------------------------------------

describe('detecterChampTerritoire', () => {
  const lignes = (valeurs: unknown[], champ = 'Code du département') =>
    valeurs.map((v, i) => ({ [champ]: v, nom: `Élu ${i}` }));

  it('un code de département en chaîne, zéros de tête compris', () => {
    expect(detecterChampTerritoire(lignes(['01', '2A', '75', '971', '13']))).toEqual({
      champ: 'Code du département',
      niveau: 'departement',
    });
  });

  it('un code de région, annoncé par le nom du champ', () => {
    expect(detecterChampTerritoire(lignes(['11', '84', '93', '02'], 'code_region'))).toEqual({
      champ: 'code_region',
      niveau: 'region',
    });
  });

  it('des nombres : refusés — `1` ne s’apparierait pas au `01` du fond', () => {
    expect(detecterChampTerritoire(lignes([1, 13, 75, 95]))).toBeNull();
  });

  it('un nom qui n’annonce aucun niveau : refusé (`11` est un département ET une région)', () => {
    expect(detecterChampTerritoire(lignes(['11', '24', '75'], 'code'))).toBeNull();
  });

  it('moins de 90 % de codes connus : refusé', () => {
    expect(detecterChampTerritoire(lignes(['01', '02', 'ZZ', '99', '75']))).toBeNull();
  });

  it('un libellé de département n’est pas un code', () => {
    expect(detecterChampTerritoire(lignes(['Ain', 'Aisne'], 'Libellé du département'))).toBeNull();
  });

  it('un nom portant un séparateur de la grammaire est écarté', () => {
    expect(detecterChampTerritoire(lignes(['01', '02'], 'dep:code'))).toBeNull();
    expect(detecterChampTerritoire(lignes(['01', '02'], 'dep.code'))).toBeNull();
  });

  it('les valeurs vides sont ignorées, pas comptées contre le champ', () => {
    expect(detecterChampTerritoire(lignes(['01', '', null, '02']))?.niveau).toBe('departement');
  });

  it('un nom avec « code » l’emporte, puis le département sur la région', () => {
    const r = [
      { Département: '01', 'Code du département': '01', 'Code région': '84' },
      { Département: '75', 'Code du département': '75', 'Code région': '11' },
    ];
    expect(detecterChampTerritoire(r)?.champ).toBe('Code du département');
  });

  it('field-service le propose avec les autres suggestions', () => {
    const r = computeFields(lignes(['01', '02', '03']));
    expect(r.suggestions.territoire).toEqual({
      champ: 'Code du département',
      niveau: 'departement',
    });
  });
});

// ---------------------------------------------------------------------------
// Proposition, composition, retour arrière
// ---------------------------------------------------------------------------

function pointsTabular(): LayerConfig {
  const points = state.layers[0];
  points.name = 'Élus';
  points.source = { id: 's-elus', name: 'Élus', type: 'api', apiUrl: ELUS };
  points.latField = 'lat';
  points.lonField = 'lon';
  points.fields = [
    { name: 'Code du département', type: 'string', fillRate: 1 },
    { name: 'lat', type: 'number', fillRate: 1 },
    { name: 'lon', type: 'number', fillRate: 1 },
  ];
  points.territoire = { champ: 'Code du département', niveau: 'departement' };
  return points;
}

describe('proposerComposition', () => {
  it('seulement quand le jeu dépasse le plafond', () => {
    const points = pointsTabular();
    expect(proposerComposition(state, points, 34826)).toBe(true);
    expect(proposerComposition(state, points, 1000)).toBe(false);
    expect(proposerComposition(state, points, undefined)).toBe(false);
  });

  it('jamais sans champ territoire, ni sur une couche déjà composée ou agrégée', () => {
    const points = pointsTabular();
    points.territoire = null;
    expect(proposerComposition(state, points, 34826)).toBe(false);

    points.territoire = { champ: 'Code du département', niveau: 'departement' };
    const zones = composerParEchelle(state, points, createLayer);
    expect(estComposee(state, points)).toBe(true);
    expect(proposerComposition(state, points, 34826)).toBe(false);
    expect(proposerComposition(state, zones, 34826)).toBe(false);
  });
});

describe('composerParEchelle', () => {
  it('ajoute la couche agrégée sous les points et règle les zooms', () => {
    const points = pointsTabular();
    const zones = composerParEchelle(state, points, createLayer);
    expect(state.layers.map((l) => l.id)).toEqual([zones.id, points.id]);
    expect(zones).toMatchObject({
      name: 'Élus par département',
      type: 'geoshape',
      geoField: 'geometry',
      fillField: 'Code du département__count',
      tooltipField: 'nom',
      minZoom: 0,
      maxZoom: MAX_ZOOM_AGREGAT,
      agregat: { champ: 'Code du département', niveau: 'departement', depuis: points.id },
    });
    expect(points.minZoom).toBe(MIN_ZOOM_POINTS);
    expect(MAX_ZOOM_AGREGAT).toBe(7);
    expect(MIN_ZOOM_POINTS).toBe(8);
    // Sa propre source : une copie, pas la même référence.
    expect(zones.source).toEqual(points.source);
    expect(zones.source).not.toBe(points.source);
  });

  it('supprimer la couche agrégée rend les points visibles à tous les zooms', () => {
    const points = pointsTabular();
    const zones = composerParEchelle(state, points, createLayer);
    defaireComposition(state, zones);
    expect(points.minZoom).toBe(0);
  });
});

describe('urlContours', () => {
  it('suit le CDN npm de LIB_URL, jsDelivr sinon', () => {
    expect(urlContours('departement', 'https://cdn.jsdelivr.net/npm/dsfr-data@0/dist')).toBe(
      'https://cdn.jsdelivr.net/npm/dsfr-data@0/geo/departements.json'
    );
    expect(urlContours('region', 'https://unpkg.com/dsfr-data@0/dist')).toBe(
      'https://unpkg.com/dsfr-data@0/geo/regions.json'
    );
    // Instance auto-hébergée : `geo/` n'y est pas servi.
    expect(urlContours('region', 'https://mon-instance.example/dist')).toBe(
      'https://cdn.jsdelivr.net/npm/dsfr-data@0/geo/regions.json'
    );
  });
});

// ---------------------------------------------------------------------------
// Code généré
// ---------------------------------------------------------------------------

describe('generateCode — composition par échelle', () => {
  function composer() {
    const points = pointsTabular();
    const zones = composerParEchelle(state, points, createLayer);
    return { points, zones, code: generateCode() };
  }

  /** Balise ouvrante complète d'un élément, par son id. */
  function balise(code: string, tag: string, id: string): string {
    const m = new RegExp(`<${tag} id="${id}"[^>]*>`).exec(code);
    expect(m, `<${tag} id="${id}">`).not.toBeNull();
    return m![0];
  }

  /** Balise ouvrante d'une couche, par sa source. */
  function couche(code: string, source: string): string {
    const m = new RegExp(`<dsfr-data-map-layer source="${source}"[^>]*>`).exec(code);
    expect(m, `couche source="${source}"`).not.toBeNull();
    return m![0];
  }

  it('deux couches : la choroplèthe jusqu’au zoom 7, les points à partir du 8', () => {
    const { points, zones, code } = composer();
    expect(code.match(/<dsfr-data-map-layer /g)).toHaveLength(2);

    const agregee = couche(code, `${zones.id}-zones`);
    expect(agregee).toContain('type="geoshape"');
    expect(agregee).toContain('geo-field="geometry"');
    expect(agregee).toContain('fill-field="Code du département__count"');
    expect(agregee).toContain('tooltip-field="nom"');
    expect(agregee).toContain('max-zoom="7"');
    expect(agregee).not.toContain('min-zoom=');

    const pts = couche(code, points.id);
    expect(pts).toContain('min-zoom="8"');
    expect(pts).not.toContain('max-zoom=');
    // La choroplèthe est dessinée SOUS les points.
    expect(code.indexOf(agregee)).toBeLessThan(code.indexOf(pts));
  });

  it('la query agrégée compte par département, seule lectrice de sa propre source', () => {
    const { points, zones, code } = composer();
    const query = balise(code, 'dsfr-data-query', `${zones.id}-agrege`);
    expect(query).toContain(`source="${zones.id}"`);
    expect(query).toContain('group-by="Code du département"');
    expect(query).toContain('aggregate="Code du département:count"');

    // Sa source : la même API que les points, SANS plafond ni projection (le
    // comptage porte sur tout le jeu ; Tabular refuse `columns` à côté d'un
    // agrégateur).
    const src = balise(code, 'dsfr-data-source', zones.id);
    expect(src).toContain('api-type="tabular"');
    expect(src).toContain('resource="2876a346-d50c-4911-934e-19ee07b0e503"');
    expect(src).not.toContain('limit=');
    expect(src).not.toContain('select=');

    // Personne d'autre ne lit la source agrégée (#765), sinon le regroupement
    // ne serait plus délégué. La source des points garde son plafond.
    expect(code.match(new RegExp(`source="${zones.id}"`, 'g'))).toHaveLength(1);
    expect(balise(code, 'dsfr-data-source', points.id)).toContain('limit="1000"');
  });

  it('le fond des départements du paquet, aplati, joint sur le code', () => {
    const { zones, code } = composer();
    const contours = balise(code, 'dsfr-data-source', `${zones.id}-contours`);
    expect(contours).toContain(
      'url="https://cdn.jsdelivr.net/npm/dsfr-data@0/geo/departements.json"'
    );
    expect(contours).toContain('transform="features"');
    const plats = balise(code, 'dsfr-data-normalize', `${zones.id}-contours-plats`);
    expect(plats).toContain(`source="${zones.id}-contours"`);
    expect(plats).toContain('flatten="properties"');
    const join = balise(code, 'dsfr-data-join', `${zones.id}-zones`);
    expect(join).toContain(`left="${zones.id}-contours-plats"`);
    expect(join).toContain(`right="${zones.id}-agrege"`);
    expect(join).toContain('on="code=Code du département"');
    expect(join).toContain('type="inner"');
  });

  it('le filtre des points devient le where du comptage : les deux échelles comptent les mêmes lignes', () => {
    state.layers[0].filter = 'Code sexe:eq:F';
    const { zones, code } = composer();
    expect(balise(code, 'dsfr-data-query', `${zones.id}-agrege`)).toContain(
      'where="Code sexe:eq:F"'
    );
  });

  it('le tableau d’accessibilité lit les points, pas les géométries des zones', () => {
    const { points, code } = composer();
    expect(code).toContain(`<dsfr-data-a11y for="carte" source="${points.id}" table download>`);
  });

  it('points masqués : le tableau lit le comptage, jamais la source agrégée', () => {
    const { points, zones } = composer();
    points.visible = false;
    expect(generateCode()).toContain(
      `<dsfr-data-a11y for="carte" source="${zones.id}-agrege" table download>`
    );
  });

  it('niveau région : le fond des régions', () => {
    const points = pointsTabular();
    points.territoire = { champ: 'code_region', niveau: 'region' };
    const zones = composerParEchelle(state, points, createLayer);
    expect(zones.name).toBe('Élus par région');
    expect(generateCode()).toContain(
      'url="https://cdn.jsdelivr.net/npm/dsfr-data@0/geo/regions.json"'
    );
  });
});

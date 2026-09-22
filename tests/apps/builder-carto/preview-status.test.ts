/**
 * Ligne de statut de l'aperçu carto rendue depuis les constats (#1000).
 *
 * Les trois verdicts historiques de `updatePreviewStatus` (#482 bugs 7 et 8)
 * sont reproduits PAR CONSTATS, sur des traces fabriquées : le compte vient
 * de `renderedCount` (pas du DOM Leaflet), « Zones sans géométrie » désigne la
 * représentation, « aucune donnée » attend la quatrième sonde.
 */
import { describe, expect, it } from 'vitest';
import {
  evaluerConstats,
  REGLES_BUILDER_CARTO,
  type StageNode,
  type StageState,
  type Trace,
} from '@dsfr-data/shared';
import {
  comptesDessines,
  statutDepuisConstats,
} from '../../../apps/builder-carto/src/ui/preview-status';

function couche(id: string, extra: Partial<StageNode> = {}): StageNode {
  return {
    id,
    tag: 'dsfr-data-map-layer',
    role: 'display',
    synthetic: true,
    ambiguous: false,
    upstream: ['pts'],
    attrs: { type: 'marker', 'lat-field': 'lat', 'lon-field': 'lon' },
    ...extra,
  };
}

const PARIS = [
  { nom: 'Louvre', lat: 48.8606, lon: 2.3376 },
  { nom: 'Orsay', lat: 48.86, lon: 2.3266 },
];

function source(rows: number, sample: Record<string, unknown>[] = PARIS): StageState {
  const noms = [...new Set(sample.flatMap((r) => Object.keys(r)))];
  return {
    status: 'loaded',
    rows,
    fields: noms.map((name) => ({ name, type: 'string', sample: 'x' })),
    sample,
    emissions: 1,
  };
}

function trace(couches: StageNode[], pts: StageState): Trace {
  const nodes: StageNode[] = [
    {
      id: 'pts',
      tag: 'dsfr-data-source',
      role: 'source',
      synthetic: false,
      ambiguous: false,
      upstream: [],
      attrs: {},
    },
    ...couches,
  ];
  return {
    graph: { nodes, dangling: [] },
    events: [],
    states: {
      pts,
      ...Object.fromEntries(couches.map((c) => [c.id, { status: 'idle', emissions: 0 }])),
    },
    order: nodes.map((n) => n.id),
    sinceLastEventMs: null,
    lastEventAt: null,
    quiescent: true,
    delegation: {},
    reseau: [],
    console: [],
  };
}

/** Ce que fait le volet (#1001) puis `updatePreviewStatus` à la sonde `sonde`. */
function statut(t: Trace, sonde: number) {
  const constats = evaluerConstats(t, { app: 'builder-carto' }, REGLES_BUILDER_CARTO);
  return statutDepuisConstats(constats, t, sonde);
}

describe('ligne de statut carto — les trois verdicts historiques (#482)', () => {
  it('bug 7 : le compte vient de la couche (heatmap : N points, pas « 1 »), encarts non recomptés', () => {
    const t = trace(
      [
        couche('map-layer@1', {
          attrs: { type: 'heatmap', 'lat-field': 'lat', 'lon-field': 'lon' },
          renderedCount: 500,
        }),
        couche('map-layer@2', { renderedCount: 500, inset: true }),
      ],
      source(500)
    );
    expect(comptesDessines(t)).toEqual({ dessines: 500, recus: 500 });
    expect(statut(t, 1)).toEqual({
      ton: 'ok',
      icone: 'ri-check-line',
      texte: '500 éléments affichés (500 enregistrements)',
    });
  });

  it('bug 8 : Zones sans géométrie — le constat désigne la représentation et le champ géo', () => {
    const t = trace(
      [couche('map-layer@1', { attrs: { type: 'geoshape' }, renderedCount: 0 })],
      source(96, [{ code: '75', nom: 'Paris' }])
    );
    // Première sonde : Leaflet n'a peut-être pas encore dessiné, on attend.
    expect(statut(t, 1)).toBeNull();
    const s = statut(t, 2);
    expect(s?.ton).toBe('err');
    expect(s?.constat?.regle).toBe('carte/sans-champ-geo');
    expect(s?.constat?.reperes).toEqual([
      'carto.couches.geo-field',
      'carto.elements.representation.type',
    ]);
    expect(s?.texte).toContain('zones');
  });

  it('bug 8 : chargé mais rien dessiné, hors Zones', () => {
    const t = trace([couche('map-layer@1', { renderedCount: 0 })], source(2));
    const s = statut(t, 2);
    expect(s?.ton).toBe('err');
    expect(s?.constat?.regle).toBe('carte/rien-dessine');
    expect(s?.texte.startsWith('map-layer@1 : données chargées, rien de dessiné')).toBe(true);
  });

  it('Zones sans geo-field avec une colonne geo_shape : le conseil cite la détection automatique', () => {
    // Vrai avant et après #1056 : dessinée, la couche est au vert ; si la
    // bibliothèque chargée ne détecte pas la colonne, le conseil l'explique.
    const geom = {
      type: 'Polygon',
      coordinates: [
        [
          [2, 48],
          [3, 48],
          [3, 49],
          [2, 48],
        ],
      ],
    };
    const avec = (rendu: number) =>
      trace(
        [couche('map-layer@1', { attrs: { type: 'geoshape' }, renderedCount: rendu })],
        source(1, [{ nom: 'Paris', geo_shape: geom }])
      );
    expect(statut(avec(1), 2)?.ton).toBe('ok');
    const s = statut(avec(0), 2);
    expect(s?.constat?.regle).toBe('carte/rien-dessine');
    expect(s?.constat?.explication).toContain('la cherche seule');
  });

  it('aucune donnée : attend la quatrième sonde, puis le dit', () => {
    const t = trace([couche('map-layer@1', { renderedCount: 0 })], source(0, []));
    expect(statut(t, 2)).toBeNull();
    const s = statut(t, 4);
    expect(s?.ton).toBe('err');
    expect(s?.constat?.regle).toBe('carte/aucune-donnee');
  });
});

describe('ligne de statut carto — choix et attente', () => {
  it('une erreur du pipeline s’affiche dès la première sonde', () => {
    const t = trace([couche('map-layer@1', { renderedCount: 0 })], {
      status: 'error',
      message: 'HTTP 500',
      emissions: 0,
    });
    const s = statut(t, 1);
    expect(s?.ton).toBe('err');
    expect(s?.constat?.regle).toBe('pipeline/etape-en-erreur');
  });

  it('pendant le chargement, rien avant la quatrième sonde', () => {
    const t = trace([couche('map-layer@1', { renderedCount: 0 })], {
      status: 'loading',
      emissions: 0,
    });
    expect(statut(t, 1)).toBeNull();
    expect(statut(t, 3)).toBeNull();
  });

  it('un avertissement passe au orange, et renvoie aux autres constats', () => {
    const t = trace(
      [
        couche('map-layer@1', { renderedCount: 2, skippedRows: 5 }),
        couche('map-layer@3', { renderedCount: 2, stackedPositions: { positions: 1, items: 20 } }),
      ],
      source(7)
    );
    const s = statut(t, 2);
    expect(s?.ton).toBe('warn');
    expect(s?.texte).toContain('Autres constats dans le volet Diagnostic.');
  });

  it('un constat info ne change pas la ligne', () => {
    const t = trace([couche('map-layer@1', { renderedCount: 2 })], {
      ...source(2),
      meta: { page: 1, pageSize: 2, needsClientProcessing: true },
    });
    expect(statut(t, 2)?.ton).toBe('ok');
  });

  it('sans trace ni constat : on garde le statut courant', () => {
    expect(statutDepuisConstats([], null, 5)).toBeNull();
  });
});

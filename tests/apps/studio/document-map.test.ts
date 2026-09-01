/**
 * Bloc map du studio (#531) : validation observe→corrige des couches contre
 * les donnees chargees, defaut de source, multi-sources tolere.
 */
import { describe, it, expect } from 'vitest';
import { createEmptyDashboard } from '@dsfr-data/shared';
import { addBlocks, updateBlock, type DocumentContext } from '../../../apps/studio/src/document';

const ctx: DocumentContext = {
  data: [{ nom: 'Lycée A', lat: 48.85, lon: 2.35, effectif: 120 }],
  fields: [
    { name: 'nom', type: 'texte', sample: 'Lycée A' },
    { name: 'lat', type: 'numérique', sample: 48.85 },
    { name: 'lon', type: 'numérique', sample: 2.35 },
    { name: 'effectif', type: 'numérique', sample: 120 },
  ],
  sourceId: 'src-1',
};

describe('studio/document — bloc map (#531)', () => {
  it('ajoute une carte 2 couches, source par defaut + source explicite', () => {
    const doc = createEmptyDashboard();
    const outcome = addBlocks(
      doc,
      [
        {
          kind: 'map',
          title: 'Établissements',
          layers: [
            {
              type: 'circle',
              latField: 'lat',
              lonField: 'lon',
              valueField: 'effectif',
              tooltipField: 'nom',
            },
            { type: 'geoshape', sourceId: 'src-academies', geoField: 'geometry' },
          ],
        },
      ],
      ctx
    );
    expect(outcome.ok).toBe(true);
    const w = doc.widgets[0];
    if (w.type !== 'map') throw new Error('map attendu');
    expect(w.config.layers[0].sourceId).toBe('src-1'); // defaut : la source chargee
    expect(w.config.layers[1].sourceId).toBe('src-academies'); // multi-sources
    expect(w.config.fitBounds).toBe(true);
    // Pleine largeur par defaut.
    expect(doc.layout.rowColumns).toEqual({ 0: 1 });
  });

  it('refuse une couche dont le champ de coordonnee est inexistant ou non numerique', () => {
    const doc = createEmptyDashboard();
    const missing = addBlocks(
      doc,
      [{ kind: 'map', layers: [{ type: 'marker', latField: 'latitude', lonField: 'lon' }] }],
      ctx
    );
    expect(missing.ok).toBe(false);
    expect(missing.summary).toContain('latitude');
    expect(doc.widgets).toHaveLength(0);

    const notNumeric = addBlocks(
      doc,
      [{ kind: 'map', layers: [{ type: 'marker', latField: 'nom', lonField: 'lon' }] }],
      ctx
    );
    expect(notNumeric.ok).toBe(false);
    expect(notNumeric.summary).toContain('numerique');
  });

  it('refuse les structures incompletes (pas de couche, geoshape sans geoField, sans lat/lon)', () => {
    const doc = createEmptyDashboard();
    expect(addBlocks(doc, [{ kind: 'map' }], ctx).ok).toBe(false);
    expect(addBlocks(doc, [{ kind: 'map', layers: [{ type: 'geoshape' }] }], ctx).ok).toBe(false);
    expect(addBlocks(doc, [{ kind: 'map', layers: [{ type: 'heatmap' }] }], ctx).ok).toBe(false);
    expect(doc.widgets).toHaveLength(0);
  });

  it('update_block remplace les couches apres validation', () => {
    const doc = createEmptyDashboard();
    addBlocks(
      doc,
      [{ kind: 'map', layers: [{ type: 'marker', latField: 'lat', lonField: 'lon' }] }],
      ctx
    );
    const ok = updateBlock(
      doc,
      'b1',
      {
        kind: 'map',
        layers: [{ type: 'circle', latField: 'lat', lonField: 'lon', valueField: 'effectif' }],
      },
      ctx
    );
    expect(ok.ok).toBe(true);
    const w = doc.widgets[0];
    if (w.type !== 'map') throw new Error('map attendu');
    expect(w.config.layers[0].type).toBe('circle');

    const ko = updateBlock(
      doc,
      'b1',
      { kind: 'map', layers: [{ type: 'circle', latField: 'inconnu', lonField: 'lon' }] },
      ctx
    );
    expect(ko.ok).toBe(false);
    expect(w.config.layers[0].latField).toBe('lat'); // inchange
  });
});

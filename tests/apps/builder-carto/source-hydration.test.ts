/**
 * Regression : une source IMPORTEE (fichier CSV/JSON charge dans l'app
 * Sources) choisie dans le Builder Carto arrivait vide.
 *
 * L'etat du builder ne persiste qu'un pointeur — `lightweightSource` retire
 * `data`/`rawRecords`, qui pesent des Mo et saturaient le quota localStorage.
 * Pour une source d'API le pointeur suffit (l'URL refait le fetch), mais une
 * source manuelle n'a QUE ses lignes : `buildSourceTag` rendait alors la
 * chaine vide, `scanLayerFields` rejetait, et le panneau restait fige sur
 * « Analyse des champs en cours… » — sans jamais nommer la cause.
 *
 * `hydrateSource` rebranche les lignes depuis `STORAGE_KEYS.SOURCES`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { STORAGE_KEYS } from '@dsfr-data/shared';
import { state, resetState, hydrateSource } from '../../../apps/builder-carto/src/state';
import { buildSourceTag } from '../../../apps/builder-carto/src/ui/code-generator';
import { scanLayerFields } from '../../../apps/builder-carto/src/field-service';

const LIGNES = [
  { ville: 'Paris', lat: 48.85, lon: 2.35, aides: 12 },
  { ville: 'Lyon', lat: 45.76, lon: 4.84, aides: 7 },
];

beforeEach(() => {
  resetState();
  localStorage.clear();
  localStorage.setItem(
    STORAGE_KEYS.SOURCES,
    JSON.stringify([{ id: 'csv-1', name: 'aides.csv', type: 'manual', data: LIGNES }])
  );
});

describe('hydrateSource', () => {
  it('rebranche les lignes d’un pointeur de source importee', () => {
    const hydratee = hydrateSource({ id: 'csv-1', name: 'aides.csv', type: 'manual' });
    expect(hydratee?.data).toEqual(LIGNES);
  });

  it('laisse intacte une source qui porte deja ses lignes', () => {
    const src = { id: 'autre', type: 'manual', data: [{ a: 1 }] };
    expect(hydrateSource(src)).toBe(src);
  });

  it('laisse intacte une source d’API (le pointeur suffit)', () => {
    const src = { id: 'api-1', type: 'api', apiUrl: 'https://exemple.fr/data.json' };
    expect(hydrateSource(src)).toBe(src);
  });

  it('ne fabrique rien quand la source a disparu de l’app Sources', () => {
    const src = { id: 'inconnue', type: 'manual' };
    expect(hydrateSource(src)?.data).toBeUndefined();
  });
});

describe('consommateurs du pointeur', () => {
  it('le code genere porte les lignes rebranchees', () => {
    const layer = state.layers[0];
    layer.source = { id: 'csv-1', name: 'aides.csv', type: 'manual' };
    layer.latField = 'lat';
    layer.lonField = 'lon';
    const tag = buildSourceTag(layer);
    expect(tag).toContain('data=');
    expect(tag).toContain('Paris');
  });

  it('le scan des champs lit les lignes rebranchees', async () => {
    const layer = state.layers[0];
    layer.source = { id: 'csv-1', name: 'aides.csv', type: 'manual' };
    const res = await scanLayerFields(layer);
    expect(res.sampleSize).toBe(2);
    expect(res.fields.map((f) => f.name).sort()).toEqual(['aides', 'lat', 'lon', 'ville']);
    expect(res.suggestions.lat).toBe('lat');
    expect(res.suggestions.lon).toBe('lon');
  });

  it('nomme la cause quand les lignes sont introuvables (au lieu de rester muet)', async () => {
    const layer = state.layers[0];
    layer.source = { id: 'disparue', name: 'aides.csv', type: 'manual' };
    await expect(scanLayerFields(layer)).rejects.toThrow(/introuvables/);
  });
});

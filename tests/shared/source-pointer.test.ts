import { describe, it, expect } from 'vitest';
import { toSourcePointer, resolveSelectedSource } from '../../packages/shared/src/types/source.js';
import type { Source } from '../../packages/shared/src/types/source.js';

/** Un jeu volumineux, comme ceux qui saturaient le quota (#592). */
function bigSource(rows = 10_000): Source {
  return {
    id: 'api_insee_deces',
    name: 'DS_EC_DECES',
    type: 'api',
    apiUrl: 'https://api.insee.fr/melodi/data/DS_EC_DECES',
    connectionId: 'c1',
    recordCount: rows,
    data: Array.from({ length: rows }, (_, i) => ({
      GEO: '2025-DEP-01',
      AGE: 'Y65T74',
      OBS_VALUE: i,
    })),
  };
}

describe('toSourcePointer', () => {
  it('retire les lignes mais garde tout le descripteur', () => {
    const source = bigSource(3);
    const pointer = toSourcePointer(source);

    expect(pointer.data).toBeUndefined();
    expect(pointer.rawRecords).toBeUndefined();
    expect(pointer).toMatchObject({
      id: 'api_insee_deces',
      name: 'DS_EC_DECES',
      type: 'api',
      apiUrl: 'https://api.insee.fr/melodi/data/DS_EC_DECES',
      connectionId: 'c1',
    });
  });

  it('conserve le compteur de lignes, y compris deduit de data', () => {
    expect(toSourcePointer(bigSource(42)).recordCount).toBe(42);

    const sansCompteur: Source = { id: 's', name: 'S', type: 'manual', data: [{ a: 1 }, { a: 2 }] };
    expect(toSourcePointer(sansCompteur).recordCount).toBe(2);
  });

  it("ne mute pas la source d'origine", () => {
    const source = bigSource(5);
    toSourcePointer(source);
    expect(source.data).toHaveLength(5);
  });

  // Le point de l'issue : les lignes ne doivent etre serialisees qu'une fois.
  it("un jeu de 10 000 lignes n'est ecrit qu'une fois entre les deux cles", () => {
    const source = bigSource();
    const sources = [source];

    const octetsSources = JSON.stringify(sources).length;
    const octetsPointeur = JSON.stringify(toSourcePointer(source)).length;

    // Avant #592 les deux cles portaient les memes lignes : le total valait
    // deux fois SOURCES. Le pointeur doit etre negligeable devant elles.
    expect(octetsPointeur).toBeLessThan(octetsSources / 100);
    expect(octetsSources + octetsPointeur).toBeLessThan(octetsSources * 1.05);
  });
});

describe('resolveSelectedSource', () => {
  it('rebranche les lignes depuis SOURCES', () => {
    const source = bigSource(4);
    const resolved = resolveSelectedSource(toSourcePointer(source), [source]);

    expect(resolved?.data).toHaveLength(4);
    expect(resolved?.id).toBe(source.id);
    expect(resolved?.apiUrl).toBe(source.apiUrl);
  });

  it('retourne null sans pointeur', () => {
    expect(resolveSelectedSource(null, [])).toBeNull();
    expect(resolveSelectedSource(undefined, [])).toBeNull();
  });

  it('laisse le pointeur sans lignes si la source a disparu de SOURCES', () => {
    // Cas d'une source supprimee alors qu'elle restait selectionnee : les
    // gardes appelantes testent `data.length`, donc l'absence de lignes doit
    // rester observable plutot que d'etre masquee par recordCount.
    const pointer = toSourcePointer(bigSource(7));
    const resolved = resolveSelectedSource(pointer, []);

    expect(resolved?.data).toBeUndefined();
    expect(resolved?.recordCount).toBe(7);
  });

  it('accepte une entree ecrite avant #592 (lignes en ligne)', () => {
    // Compatibilite ascendante : un localStorage deja peuple porte encore les
    // lignes dans SELECTED_SOURCE, et SOURCES peut ne rien contenir.
    const legacy = bigSource(3);
    const resolved = resolveSelectedSource(legacy, []);

    expect(resolved?.data).toHaveLength(3);
  });
});

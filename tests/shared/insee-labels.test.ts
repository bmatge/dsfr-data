import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildInseeLabelIndex,
  applyInseeLabels,
  fetchInseeLabelIndex,
  clearInseeLabelCache,
  INSEE_CODE_SUFFIX,
  type InseeRange,
} from '../../packages/shared/src/providers/insee-labels.js';

/**
 * Extrait fidele de https://api.insee.fr/melodi/range/DS_EC_DECES (#592).
 * `GEO` porte `code` + `id`, les modalites n'ont qu'un `code`, `TIME_PERIOD`
 * n'a pas de liste.
 */
const RANGE: InseeRange = {
  code: 'DS_EC_DECES',
  label: { fr: 'Décès quotidiens et mensuels', en: 'Daily and monthly deaths' },
  range: [
    {
      concept: { code: 'GEO', label: { fr: 'Géographie', en: 'Geography' } },
      type: 'geo',
      values: [
        { code: '01', id: '2025-DEP-01', label: { fr: 'Ain' } },
        { code: '02', id: '2025-DEP-02', label: { fr: 'Aisne' } },
      ],
    },
    {
      concept: { code: 'SEX', label: { fr: 'Sexe', en: 'Sex' } },
      type: 'modalites',
      values: [
        { code: 'F', label: { fr: 'Femme', en: 'Female' } },
        { code: 'M', label: { fr: 'Homme', en: 'Male' } },
      ],
    },
    {
      concept: { code: 'AGE', label: { fr: 'Âge' } },
      type: 'modalites',
      values: [{ code: 'Y65T74', label: { fr: 'De 65 à 74 ans', en: 'From 65 to 74 years' } }],
    },
    {
      concept: { code: 'TIME_PERIOD', label: { fr: 'Période temporelle' } },
      type: 'date',
      values: [],
    },
  ],
};

/** Observation reelle, apres aplatissement par flattenInseeObservation. */
const OBS = {
  GEO: '2025-DEP-01',
  SEX: 'M',
  AGE: 'Y65T74',
  FREQ: 'D',
  TIME_PERIOD: '2026-06-21',
  OBS_VALUE: 5,
};

describe('buildInseeLabelIndex', () => {
  it('indexe les modalites sur leur code', () => {
    const index = buildInseeLabelIndex(RANGE);
    expect(index.get('SEX')?.get('M')).toBe('Homme');
    expect(index.get('AGE')?.get('Y65T74')).toBe('De 65 à 74 ans');
  });

  it("indexe le geo sur l'id, qui est ce que portent les observations", () => {
    const index = buildInseeLabelIndex(RANGE);
    expect(index.get('GEO')?.get('2025-DEP-01')).toBe('Ain');
    // Le code court reste accepte en second recours.
    expect(index.get('GEO')?.get('01')).toBe('Ain');
  });

  it('ignore les dimensions sans modalites', () => {
    expect(buildInseeLabelIndex(RANGE).has('TIME_PERIOD')).toBe(false);
  });

  it('respecte la langue demandee, avec repli sur le francais', () => {
    const en = buildInseeLabelIndex(RANGE, 'en');
    expect(en.get('SEX')?.get('M')).toBe('Male');
    // « Ain » n'existe qu'en francais : repli plutot que perte de la modalite.
    expect(en.get('GEO')?.get('2025-DEP-01')).toBe('Ain');
  });

  it("ne laisse pas un code court ecraser l'id d'une autre modalite", () => {
    const piege: InseeRange = {
      range: [
        {
          concept: { code: 'GEO' },
          type: 'geo',
          values: [
            { code: 'X', id: '2025-DEP-01', label: { fr: 'Premier' } },
            { code: '2025-DEP-01', id: '2025-DEP-99', label: { fr: 'Second' } },
          ],
        },
      ],
    };
    expect(buildInseeLabelIndex(piege).get('GEO')?.get('2025-DEP-01')).toBe('Premier');
  });

  it('tolere une reponse vide ou malformee', () => {
    expect(buildInseeLabelIndex({} as InseeRange).size).toBe(0);
    expect(buildInseeLabelIndex({ range: [{}] } as InseeRange).size).toBe(0);
  });
});

describe('applyInseeLabels', () => {
  it('remplace les codes par les libelles et conserve le code', () => {
    const [row] = applyInseeLabels([OBS], buildInseeLabelIndex(RANGE));

    expect(row.GEO).toBe('Ain');
    expect(row.SEX).toBe('Homme');
    expect(row.AGE).toBe('De 65 à 74 ans');
    expect(row[`GEO${INSEE_CODE_SUFFIX}`]).toBe('2025-DEP-01');
    expect(row[`AGE${INSEE_CODE_SUFFIX}`]).toBe('Y65T74');
  });

  it('laisse intactes les colonnes sans libelle connu', () => {
    const [row] = applyInseeLabels([OBS], buildInseeLabelIndex(RANGE));

    // FREQ n'est pas dans cette reponse, TIME_PERIOD n'a pas de modalites,
    // OBS_VALUE est une mesure : aucune ne doit ouvrir de colonne _CODE.
    expect(row.FREQ).toBe('D');
    expect(row.TIME_PERIOD).toBe('2026-06-21');
    expect(row.OBS_VALUE).toBe(5);
    expect(row).not.toHaveProperty(`FREQ${INSEE_CODE_SUFFIX}`);
    expect(row).not.toHaveProperty(`OBS_VALUE${INSEE_CODE_SUFFIX}`);
  });

  it('renvoie le tableau d origine quand il n y a rien a traduire', () => {
    const records = [OBS];
    expect(applyInseeLabels(records, new Map())).toBe(records);
  });

  it('ne mute pas les enregistrements fournis', () => {
    applyInseeLabels([OBS], buildInseeLabelIndex(RANGE));
    expect(OBS.GEO).toBe('2025-DEP-01');
  });
});

describe('fetchInseeLabelIndex', () => {
  beforeEach(() => clearInseeLabelCache());

  it('appelle /range et indexe la reponse', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(RANGE), { status: 200 })
    );
    const index = await fetchInseeLabelIndex('DS_EC_DECES', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      'https://api.insee.fr/melodi/range/DS_EC_DECES'
    );
    expect(index.get('SEX')?.get('M')).toBe('Homme');
  });

  it('mutualise deux chargements simultanes du meme jeu', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(RANGE), { status: 200 })
    );
    const opts = { fetchImpl: fetchImpl as unknown as typeof fetch };

    const [a, b] = await Promise.all([
      fetchInseeLabelIndex('DS_EC_DECES', opts),
      fetchInseeLabelIndex('DS_EC_DECES', opts),
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('passe par le proxy quand il est fourni', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(RANGE), { status: 200 })
    );
    await fetchInseeLabelIndex('DS_EC_DECES', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      toProxiedUrl: (u) => `https://proxy.test/?url=${encodeURIComponent(u)}`,
    });

    expect(String(fetchImpl.mock.calls[0][0])).toContain('proxy.test');
  });

  it('rend un index vide sur erreur reseau, sans rejeter', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    const index = await fetchInseeLabelIndex('DS_EC_DECES', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(index.size).toBe(0);
  });

  it('rend un index vide sur reponse HTTP en erreur', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }));
    const index = await fetchInseeLabelIndex('DS_EC_DECES', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(index.size).toBe(0);
  });

  it('ne met pas un echec en cache', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(JSON.stringify(RANGE), { status: 200 }));
    const opts = { fetchImpl: fetchImpl as unknown as typeof fetch };

    expect((await fetchInseeLabelIndex('DS_EC_DECES', opts)).size).toBe(0);
    expect((await fetchInseeLabelIndex('DS_EC_DECES', opts)).get('SEX')?.get('M')).toBe('Homme');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('sans identifiant de jeu, ne fait aucun appel', async () => {
    const fetchImpl = vi.fn();
    const index = await fetchInseeLabelIndex('', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(index.size).toBe(0);
  });
});

describe('parite des deux chemins d import (#586)', () => {
  it('aplatissement puis traduction donnent les memes colonnes des deux cotes', async () => {
    const { flattenInseeObservation, flattenProviderRecords } =
      await import('../../packages/shared/src/providers/flatten.js');
    const { INSEE_CONFIG } = await import('../../packages/shared/src/providers/insee.js');

    const observation = {
      dimensions: { GEO: '2025-DEP-01', SEX: 'M', AGE: 'Y65T74' },
      measures: { OBS_VALUE_NIVEAU: { value: 5 } },
      attributes: { OBS_STATUS_FR: 'PROV' },
    };
    const index = buildInseeLabelIndex(RANGE);

    // Chemin composant : l'adapter mappe flattenInseeObservation puis traduit.
    const composant = applyInseeLabels([flattenInseeObservation(observation)], index);

    // Chemin connexion : flattenProviderRecords via la config du provider,
    // puis la meme traduction.
    const connexion = applyInseeLabels(
      flattenProviderRecords([observation], INSEE_CONFIG.response) as Record<string, unknown>[],
      index
    );

    expect(Object.keys(composant[0]).sort()).toEqual(Object.keys(connexion[0]).sort());
    expect(composant[0]).toEqual(connexion[0]);
    expect(composant[0]).toMatchObject({
      GEO: 'Ain',
      GEO_CODE: '2025-DEP-01',
      SEX: 'Homme',
      AGE: 'De 65 à 74 ans',
      OBS_VALUE: 5,
      OBS_STATUS_FR: 'PROV',
    });
  });
});

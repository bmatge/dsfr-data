import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #792 — une jointure qui perd des lignes à la graphie près.
 *
 * Mesuré par le banc d'essai : `data-es` publie ses départements en `1`…`9`,
 * l'INSEE en `01`…`09`. Une jointure `inner` apparie 98 lignes sur 101, neuf
 * départements tombent, et le ratio de sommes calculé en aval est faux de
 * 1,5 % — plausible. Le taux d'appariement était déjà publié (#660), mais
 * l'alerte ne partait que sous 50 %, sans exemple de clé ni cause nommée.
 */

import { performJoinWithStats } from '@dsfr-data/shared';
import { DataflowRecorder, formatTrace, summarizeTrace } from '@dsfr-data/shared';
import { DsfrDataJoin } from '@/components/dsfr-data-join.js';
import { clearDataCache, clearDataMeta, dispatchDataLoaded } from '@/utils/data-bridge.js';

type Row = Record<string, unknown>;

/** 101 départements côté équipements, `1`…`9` sans zéro de tête. */
function equipements(): Row[] {
  return Array.from({ length: 101 }, (_, i) => ({
    dep_code: String(i + 1),
    surf: 100,
  }));
}
/** 101 départements côté INSEE, zéro-padés. */
function population(): Row[] {
  return Array.from({ length: 101 }, (_, i) => ({
    codedepartement: String(i + 1).padStart(2, '0'),
    pop: 1000,
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('#792 — statistiques : orphelins et écart de graphie', () => {
  it('le cas du banc : 92 / 101 appariées, écart de graphie détecté, orphelins cités', () => {
    const { stats } = performJoinWithStats(equipements(), population(), {
      on: 'dep_code=codedepartement',
      type: 'inner',
    });
    expect(stats.leftMatched).toBe(92);
    expect(stats.keyFormatMismatch).toBe(true);
    expect(stats.leftOrphans).toEqual(['1', '2', '3', '4', '5']);
    expect(stats.rightOrphans).toEqual(['01', '02', '03', '04', '05']);
  });

  it('les espaces autour d’une clé sont aussi un écart de graphie', () => {
    const { stats } = performJoinWithStats([{ c: ' 75' }], [{ c: '75' }], { on: 'c' });
    expect(stats.keyFormatMismatch).toBe(true);
  });

  it('des orphelins sans rapport de graphie ne sont pas un écart', () => {
    const { stats } = performJoinWithStats([{ c: 'A' }, { c: 'B' }], [{ c: 'A' }, { c: 'Z' }], {
      on: 'c',
    });
    expect(stats.leftOrphans).toEqual(['B']);
    expect(stats.rightOrphans).toEqual(['Z']);
    expect(stats.keyFormatMismatch).toBeUndefined();
  });

  it('multi-clés : la graphie est comparée segment par segment', () => {
    const { stats } = performJoinWithStats(
      [{ annee: '2024', dep: '1' }],
      [{ annee: '2024', dep: '01' }],
      { on: 'annee,dep' }
    );
    expect(stats.leftOrphans).toEqual(['2024|1']);
    expect(stats.keyFormatMismatch).toBe(true);
  });

  it('la jointure elle-même ne normalise rien : "1" et "01" ne s’apparient toujours pas', () => {
    const { rows } = performJoinWithStats([{ c: '1' }], [{ c: '01', v: 1 }], {
      on: 'c',
      type: 'inner',
    });
    expect(rows).toHaveLength(0);
  });

  it('tout apparié : aucun champ d’orphelin', () => {
    const { stats } = performJoinWithStats([{ c: 'A' }], [{ c: 'A' }], { on: 'c' });
    expect(stats).toEqual({ leftMatched: 1, leftTotal: 1, rightMatched: 1, rightTotal: 1 });
  });
});

describe('#792 — avertissement console du composant', () => {
  const IDS = ['es', 'popdep', 'jointe'];
  let el: DsfrDataJoin | undefined;

  afterEach(() => {
    el?.remove();
    el = undefined;
    for (const id of IDS) {
      clearDataCache(id);
      clearDataMeta(id);
    }
  });

  function mount(type: 'inner' | 'left', on = 'dep_code=codedepartement'): DsfrDataJoin {
    el = new DsfrDataJoin();
    el.id = 'jointe';
    el.left = 'es';
    el.right = 'popdep';
    el.on = on;
    el.type = type;
    document.body.appendChild(el);
    return el;
  }

  const joinWarns = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.filter((c: unknown[]) => String(c[0]).startsWith('dsfr-data-join'));

  it('inner qui perd des lignes : un warn qui cite les orphelins et nomme la graphie', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount('inner');
    dispatchDataLoaded('es', equipements());
    dispatchDataLoaded('popdep', population());
    // Seconde émission identique : pas de répétition
    dispatchDataLoaded('popdep', population());

    const warns = joinWarns(spy);
    expect(warns).toHaveLength(1);
    const message = String(warns[0][0]);
    expect(message).toContain('9 ligne(s) gauche sur 101');
    expect(message).toContain('type="inner" les retire');
    expect(message).toContain('"1", "2", "3", "4", "5"…');
    expect(message).toContain('zéro de tête');
  });

  it('inner qui perd des lignes sans écart de graphie : warn, sans la phrase de cause', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount('inner', 'c');
    dispatchDataLoaded('es', [{ c: 'A' }, { c: 'B' }]);
    dispatchDataLoaded('popdep', [{ c: 'A' }]);

    const warns = joinWarns(spy);
    expect(warns).toHaveLength(1);
    expect(String(warns[0][0])).not.toContain('zéro de tête');
  });

  it('left sans écart de graphie : silencieux (enrichissement partiel légitime)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount('left', 'c');
    dispatchDataLoaded('es', [{ c: 'A' }, { c: 'B' }]);
    dispatchDataLoaded('popdep', [{ c: 'A' }]);
    expect(joinWarns(spy)).toHaveLength(0);
  });

  it('left avec écart de graphie : warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount('left');
    dispatchDataLoaded('es', equipements());
    dispatchDataLoaded('popdep', population());
    const warns = joinWarns(spy);
    expect(warns).toHaveLength(1);
    expect(String(warns[0][0])).toContain('restent vides');
  });

  it('jointure complète : aucun warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount('inner', 'c');
    dispatchDataLoaded('es', [{ c: 'A' }]);
    dispatchDataLoaded('popdep', [{ c: 'A' }]);
    expect(joinWarns(spy)).toHaveLength(0);
  });
});

describe('#792 — trace du volet Diagnostic', () => {
  let host: HTMLElement | undefined;
  let recorder: DataflowRecorder | undefined;

  afterEach(() => {
    recorder?.stop();
    host?.remove();
    for (const id of ['es', 'popdep', 'jointe']) {
      clearDataCache(id);
      clearDataMeta(id);
    }
  });

  it('91 % d’appariement mais écart de graphie : alerte, orphelins des deux côtés, cause', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    host = document.createElement('div');
    host.innerHTML = `
      <dsfr-data-source id="es" api-type="opendatasoft" dataset-id="a"></dsfr-data-source>
      <dsfr-data-source id="popdep" api-type="opendatasoft" dataset-id="b"></dsfr-data-source>
      <dsfr-data-join id="jointe" left="es" right="popdep" on="dep_code=codedepartement" type="inner"></dsfr-data-join>
    `;
    document.body.appendChild(host);
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    dispatchDataLoaded('es', equipements());
    dispatchDataLoaded('popdep', population());

    const trace = recorder.snapshot();
    const text = formatTrace(trace);
    expect(text).toContain('⚠ 92 / 101 lignes gauche appariées (91 %)');
    expect(text).toContain('clés gauche sans correspondance : "1", "2", "3", "4", "5"');
    expect(text).toContain('clés droite sans correspondance : "01", "02"');
    expect(text).toContain('à la graphie près');
    expect(summarizeTrace(trace).alerts).toBeGreaterThanOrEqual(1);
  });
});

import { describe, it, expect, afterEach } from 'vitest';

/**
 * #660 — taux d'appariement d'une jointure, dans la meta et la trace.
 *
 * `performJoin` ne comptait rien ; en `left`, 1 065 lignes entraient et
 * 1 065 sortaient : l'etape paraissait saine alors que 237 seulement
 * etaient appariees (22 %). C'est le seul signal contre une jointure sur
 * des cles homonymes. Clot aussi AM-025 (« types differents ») : les cles
 * sont comparees en chaine, `201` = `"201"`, `"0201"` != `"201"`, pas de
 * trim — verifie et documente ici.
 */

import { performJoin, performJoinWithStats } from '@dsfr-data/shared';
import { DataflowRecorder, formatTrace, summarizeTrace } from '@dsfr-data/shared';
import { DsfrDataJoin } from '@/components/dsfr-data-join.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  getDataMeta,
  setDataMeta,
} from '@/utils/data-bridge.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Row = Record<string, unknown>;

/** 1 065 lignes gauche dont 237 portent une cle presente a droite. */
function benchLeft(): Row[] {
  return Array.from({ length: 1065 }, (_, i) => ({
    code: i < 237 ? `C${i}` : `X${i}`,
    nom: `ligne ${i}`,
  }));
}
/** 300 lignes droite : 237 codes attendus + 63 orphelins. */
function benchRight(): Row[] {
  return Array.from({ length: 300 }, (_, i) => ({
    code: i < 237 ? `C${i}` : `Y${i}`,
    montant: i,
  }));
}

describe('#660 — performJoinWithStats compte l’appariement des deux côtés', () => {
  it('237 / 1 065 gauche, 237 / 300 droite, quel que soit le type', () => {
    for (const type of ['left', 'inner', 'right', 'full'] as const) {
      const { stats } = performJoinWithStats(benchLeft(), benchRight(), { on: 'code', type });
      expect(stats, type).toEqual({
        leftMatched: 237,
        leftTotal: 1065,
        rightMatched: 237,
        rightTotal: 300,
      });
    }
  });

  it('les lignes rendues restent celles de performJoin', () => {
    const opts = { on: 'code', type: 'left' as const };
    expect(performJoinWithStats(benchLeft(), benchRight(), opts).rows).toEqual(
      performJoin(benchLeft(), benchRight(), opts)
    );
    expect(performJoinWithStats(benchLeft(), benchRight(), opts).rows).toHaveLength(1065);
  });

  it('relation 1-N : une clé gauche appariée compte toutes les lignes droite de cette clé', () => {
    const left = [{ code: 'A' }, { code: 'B' }];
    const right = [
      { code: 'A', v: 1 },
      { code: 'A', v: 2 },
      { code: 'Z', v: 3 },
    ];
    const { stats } = performJoinWithStats(left, right, { on: 'code', type: 'left' });
    expect(stats).toEqual({ leftMatched: 1, leftTotal: 2, rightMatched: 2, rightTotal: 3 });
  });

  it('entrées vides : zéro partout, sans division', () => {
    expect(performJoinWithStats([], [{ code: 'A' }], { on: 'code' }).stats).toEqual({
      leftMatched: 0,
      leftTotal: 0,
      rightMatched: 0,
      rightTotal: 1,
    });
  });

  describe('AM-025 (infondé) : les clés sont comparées en chaîne', () => {
    it('201 (nombre) et "201" (chaîne) s’apparient', () => {
      const { stats } = performJoinWithStats([{ code: 201 }], [{ code: '201', v: 1 }], {
        on: 'code',
      });
      expect(stats.leftMatched).toBe(1);
    });

    it('"0201" et "201" ne s’apparient pas (zéro initial), " 201" non plus (pas de trim)', () => {
      const right = [{ code: '201', v: 1 }];
      expect(
        performJoinWithStats([{ code: '0201' }], right, { on: 'code' }).stats.leftMatched
      ).toBe(0);
      expect(
        performJoinWithStats([{ code: ' 201' }], right, { on: 'code' }).stats.leftMatched
      ).toBe(0);
    });
  });
});

describe('#660 — dsfr-data-join pose le taux d’appariement dans sa meta', () => {
  const IDS = ['pop', 'budget', 'enriched'];
  let joinEl: DsfrDataJoin | undefined;

  afterEach(() => {
    joinEl?.remove();
    joinEl = undefined;
    for (const id of IDS) {
      clearDataCache(id);
      clearDataMeta(id);
    }
  });

  function mountJoin(type: 'left' | 'inner' = 'left'): DsfrDataJoin {
    joinEl = new DsfrDataJoin();
    joinEl.id = 'enriched';
    joinEl.left = 'pop';
    joinEl.right = 'budget';
    joinEl.on = 'code';
    joinEl.type = type;
    document.body.appendChild(joinEl);
    return joinEl;
  }

  it('sans meta amont : meta propre avec join = stats, total inconnu', () => {
    const el = mountJoin();
    dispatchDataLoaded('pop', benchLeft());
    dispatchDataLoaded('budget', benchRight());

    expect(el.getData()).toHaveLength(1065);
    expect(getDataMeta('enriched')).toEqual({
      page: 1,
      pageSize: 0,
      serverSide: false,
      join: { leftMatched: 237, leftTotal: 1065, rightMatched: 237, rightTotal: 300 },
    });
    expect(el.getJoinStats()).toEqual({
      leftMatched: 237,
      leftTotal: 1065,
      rightMatched: 237,
      rightTotal: 300,
    });
  });

  it('avec meta amont (gauche) : conservée, total invalidé, join ajouté, troncature amont retirée', () => {
    mountJoin('inner');
    setDataMeta('pop', {
      page: 1,
      pageSize: 0,
      total: 3080,
      serverSide: false,
      needsClientProcessing: true,
      truncated: true,
    });
    dispatchDataLoaded('pop', benchLeft());
    dispatchDataLoaded('budget', benchRight());

    expect(getDataMeta('enriched')).toEqual({
      page: 1,
      pageSize: 0,
      serverSide: false,
      needsClientProcessing: true,
      total: undefined,
      join: { leftMatched: 237, leftTotal: 1065, rightMatched: 237, rightTotal: 300 },
    });
  });

  it('avant la première jointure : getJoinStats() rend null, aucune meta posée', () => {
    const el = mountJoin();
    dispatchDataLoaded('pop', benchLeft());
    expect(el.getJoinStats()).toBeNull();
    expect(getDataMeta('enriched')).toBeUndefined();
  });
});

describe('#660 — la trace rend le taux d’appariement, alerte sous 50 %', () => {
  let host: HTMLElement | undefined;
  let recorder: DataflowRecorder | undefined;

  afterEach(() => {
    recorder?.stop();
    host?.remove();
    for (const id of ['pop', 'budget', 'enriched']) {
      clearDataCache(id);
      clearDataMeta(id);
    }
  });

  function mount() {
    host = document.createElement('div');
    host.innerHTML = `
      <dsfr-data-source id="pop" api-type="opendatasoft" dataset-id="a"></dsfr-data-source>
      <dsfr-data-source id="budget" api-type="opendatasoft" dataset-id="b"></dsfr-data-source>
      <dsfr-data-join id="enriched" left="pop" right="budget" on="code" type="left"></dsfr-data-join>
    `;
    document.body.appendChild(host);
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
  }

  it('AC : jointure à 22 % → « ⚠ 237 / 1 065 lignes gauche appariées (22 %) », comptée comme alerte', () => {
    mount();
    dispatchDataLoaded('pop', benchLeft());
    dispatchDataLoaded('budget', benchRight());
    setDataMeta('enriched', {
      page: 1,
      pageSize: 0,
      serverSide: false,
      join: { leftMatched: 237, leftTotal: 1065, rightMatched: 237, rightTotal: 300 },
    });
    dispatchDataLoaded('enriched', benchLeft());

    const trace = recorder!.snapshot();
    const text = formatTrace(trace);

    expect(text).toContain('⚠ 237 / 1 065 lignes gauche appariées (22 %), 237 / 300 lignes droite');
    expect(text).toContain('Clés comparées en chaîne');
    expect(summarizeTrace(trace).alerts).toBe(1);
  });

  it('jointure à 90 % : ligne informative, pas d’alerte', () => {
    mount();
    dispatchDataLoaded('pop', [{ code: 'A' }]);
    dispatchDataLoaded('budget', [{ code: 'A', v: 1 }]);
    setDataMeta('enriched', {
      page: 1,
      pageSize: 0,
      serverSide: false,
      join: { leftMatched: 9, leftTotal: 10, rightMatched: 9, rightTotal: 9 },
    });
    dispatchDataLoaded('enriched', [{ code: 'A', v: 1 }]);

    const trace = recorder!.snapshot();
    const text = formatTrace(trace);

    expect(text).toContain(
      'appariement : 9 / 10 lignes gauche appariées (90 %), 9 / 9 lignes droite'
    );
    expect(text).not.toContain('⚠ 9 / 10');
    expect(summarizeTrace(trace).alerts).toBe(0);
  });
});

describe('#660 — le guide skills documente la comparaison en chaîne (clôture AM-025)', () => {
  it('la skill dsfr-data-join nomme 201 = "201", "0201" ≠ "201" et le taux d’appariement', () => {
    const src = readFileSync(join(__dirname, '../apps/builder-ia/src/skills.ts'), 'utf-8');
    const start = src.indexOf("name: 'dsfr-data-join'");
    const end = src.indexOf("reference('dsfr-data-join')", start);
    expect(start).toBeGreaterThan(-1);
    const skill = src.slice(start, end);

    expect(skill).toContain('en chaîne, sans trim ni complétion');
    expect(skill).toMatch(/201.*se joignent/);
    expect(skill).toMatch(/"0201".*"201".*ne se joignent pas/);
    expect(skill).toContain("Taux d'appariement");
    expect(skill).toContain('getJoinStats()');
  });
});

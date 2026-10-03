import { describe, it, expect, vi, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * BUG-038 du banc d'essai (#1228) — un tableau de DONNÉES n'est jamais étalé
 * en arguments d'appel.
 *
 * `Math.min(...values)`, `Math.max(...values)` et `cible.push(...lignes)`
 * passent chaque élément en argument : entre 120 000 et 125 000 sous V8,
 * l'appel lève « RangeError: Maximum call stack size exceeded ». Sibil
 * (204 628 lignes) : le minimum d'une colonne plantait la query, et la page
 * gardait l'ancien résultat sans un mot.
 *
 * Chaque surface corrigée est éprouvée ici sur UN MILLION de valeurs. Le
 * seuil dépend de la pile du moteur : 125 000 dans un onglet Chromium et dans
 * un `node` nu, mais entre 400 000 et 800 000 dans un worker Vitest (mesuré,
 * pile de 4 Mo). La première suite est le TÉMOIN : elle exige que l'étalement
 * lève bien à cette taille, ici même — sans quoi tout le fichier passerait au
 * vert sur l'ancien code et ne garderait rien. La dernière est un garde
 * STATIQUE : le motif ne revient pas dans la bibliothèque sans être déclaré.
 * Le seuil du navigateur, lui, est tenu par le canari `canari-volume-min-max`
 * (150 150 valeurs, `tests/verif-donnees/canari.ts`).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { appendAll, maxOf, minOf, performPivot, aggregateBy, inspectData } from '@dsfr-data/shared';
import { computeAggregation, computeExtremum } from '@/utils/aggregations.js';
import { DsfrDataConcat } from '@/components/dsfr-data-concat.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataChart } from '@/components/dsfr-data-chart.js';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  getDataCache,
} from '@/utils/data-bridge.js';

/** Au-delà du plafond d'arguments d'un worker Vitest (le témoin le vérifie). */
const N = 1_000_000;

/** Le minimum (−7) et le maximum (N + 5) sont posés LOIN des bords du tableau. */
function grandeColonne(): number[] {
  const values = Array.from({ length: N }, (_, i) => (i * 7919) % 1000);
  values[423_456] = -7;
  values[750_001] = N + 5;
  return values;
}
const VALEURS = grandeColonne();
const LIGNES = VALEURS.map((x, i) => ({ id: i, groupe: 'tous', x }));

describe('BUG-038 — le témoin : l’étalement dépasse bien la pile à cette taille', () => {
  it('Math.min(...values) et push(...values) lèvent une RangeError sur un million de valeurs', () => {
    expect(() => Math.min(...VALEURS)).toThrow(RangeError);
    expect(() => [].push(...(VALEURS as never[]))).toThrow(RangeError);
  });
});

describe('BUG-038 — minOf, maxOf, appendAll (@dsfr-data/shared)', () => {
  it('rendent la bonne valeur sur un million de valeurs', () => {
    expect(minOf(VALEURS)).toBe(-7);
    expect(maxOf(VALEURS)).toBe(N + 5);
    const cible: number[] = [1];
    appendAll(cible, VALEURS);
    expect(cible).toHaveLength(N + 1);
    expect(cible[N]).toBe(VALEURS[N - 1]);
  });

  it('gardent les résultats de Math.min / Math.max, cas limites compris', () => {
    for (const values of [
      [3, 1, 2],
      [-1],
      [1.5, 1.25],
      [],
      [1, NaN, 3],
      [Infinity],
      [-Infinity, 2],
    ]) {
      expect(minOf(values)).toBe(Math.min(...values));
      expect(maxOf(values)).toBe(Math.max(...values));
    }
  });
});

describe('BUG-038 — agrégats du KPI et de la query (utils/aggregations)', () => {
  it('computeExtremum : min et max numériques sur un million de lignes', () => {
    expect(computeExtremum(LIGNES, 'x', 'min')).toBe(-7);
    expect(computeExtremum(LIGNES, 'x', 'max')).toBe(N + 5);
  });

  it('computeAggregation : l’expression d’un KPI', () => {
    expect(computeAggregation(LIGNES, 'x:min')).toBe(-7);
    expect(computeAggregation(LIGNES, 'x:max')).toBe(N + 5);
  });
});

describe('BUG-038 — pivot et outils de données (packages/shared)', () => {
  it('performPivot : une cellule qui agrège un million de valeurs', () => {
    const lignes = LIGNES.map((r) => ({ ...r, col: 'c' }));
    const mini = performPivot(lignes, {
      rowFields: ['groupe'],
      columnField: 'col',
      valueField: 'x',
      aggregate: 'min',
    });
    const maxi = performPivot(lignes, {
      rowFields: ['groupe'],
      columnField: 'col',
      valueField: 'x',
      aggregate: 'max',
    });
    expect(mini.rows[0].c).toBe(-7);
    expect(maxi.rows[0].c).toBe(N + 5);
  });

  it('aggregateBy : min et max d’un groupe d’un million de lignes', () => {
    expect(aggregateBy(LIGNES, 'groupe', 'x', 'min')[0].value).toBe(-7);
    expect(aggregateBy(LIGNES, 'groupe', 'x', 'max')[0].value).toBe(N + 5);
  });

  it('inspectData : les bornes d’une colonne numérique', () => {
    const texte = inspectData(LIGNES, [{ name: 'x', type: 'numérique', sample: 0 }]);
    expect(texte).toContain(`min -7, max ${N + 5}`);
  });
});

// ---------------------------------------------------------------------------
// Les composants
// ---------------------------------------------------------------------------

const mounted: Element[] = [];
const ids: string[] = [];

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
  for (const id of ids.splice(0)) {
    clearDataCache(id);
    clearDataMeta(id);
  }
  vi.restoreAllMocks();
});

describe('BUG-038 — dsfr-data-query : aggregate min / max sur un million de lignes', () => {
  it('rend la bonne valeur, en agrégat global comme groupé', async () => {
    ids.push('gt-src', 'gt-q-global', 'gt-q-groupe');
    const global = new DsfrDataQuery();
    global.id = 'gt-q-global';
    global.source = 'gt-src';
    global.aggregate = 'x:min:mini, x:max:maxi';
    const groupe = new DsfrDataQuery();
    groupe.id = 'gt-q-groupe';
    groupe.source = 'gt-src';
    groupe.groupBy = 'groupe';
    groupe.aggregate = 'x:min:mini, x:max:maxi';
    document.body.append(global, groupe);
    mounted.push(global, groupe);
    dispatchDataLoaded('gt-src', LIGNES);
    await global.updateComplete;
    await groupe.updateComplete;

    expect(getDataCache('gt-q-global')).toEqual([{ mini: -7, maxi: N + 5 }]);
    expect(getDataCache('gt-q-groupe')).toEqual([{ groupe: 'tous', mini: -7, maxi: N + 5 }]);
  });
});

describe('BUG-038 — dsfr-data-concat : une source d’un million de lignes', () => {
  it('empile sans étaler les lignes en arguments', async () => {
    ids.push('gt-a', 'gt-b', 'gt-pile');
    const concat = new DsfrDataConcat();
    concat.id = 'gt-pile';
    concat.sources = 'gt-a, gt-b';
    document.body.appendChild(concat);
    mounted.push(concat);
    dispatchDataLoaded('gt-a', LIGNES);
    dispatchDataLoaded('gt-b', [{ id: -1, groupe: 'tous', x: 0 }]);
    await concat.updateComplete;

    const rows = getDataCache('gt-pile') as unknown[];
    expect(rows).toHaveLength(N + 1);
    expect(concat.hasAttribute('data-dsfr-config-error')).toBe(false);
  });
});

describe('BUG-038 — dsfr-data-chart : bornes élargies pour une cible', () => {
  interface ChartInternals {
    _applyTargetBounds(
      attrs: Record<string, string>,
      allSeries: Array<Array<number | null>>,
      activeTargets: Array<{ x: string | number; value: number }>
    ): void;
  }

  it('compare la cible au maximum d’une série d’un million de points', () => {
    const chart = new DsfrDataChart();
    chart.type = 'line';
    const internals = chart as unknown as ChartInternals;
    const attrs: Record<string, string> = {};
    internals._applyTargetBounds(attrs, [VALEURS], [{ x: '2030', value: N + 100 }]);
    expect(attrs['y-max']).toBe(String(N + 100));
    expect(attrs['y-min']).toBeUndefined();

    const sous: Record<string, string> = {};
    internals._applyTargetBounds(sous, [VALEURS], [{ x: '2030', value: -50 }]);
    expect(sous['y-min']).toBe('-50');
    expect(sous['y-max']).toBeUndefined();
  });
});

describe('BUG-038 — dsfr-data-map-layer : cumul des pas de temps', () => {
  interface LayerInternals {
    timeMode: 'snapshot' | 'cumulative';
    _timeFrames: Map<string, Record<string, unknown>[]>;
    _timeSteps: string[];
    _getFrameData(frameIndex: number): Record<string, unknown>[];
  }

  it('cumule un pas d’un million de lignes sans l’étaler en arguments', () => {
    const layer = new DsfrDataMapLayer() as unknown as LayerInternals;
    layer.timeMode = 'cumulative';
    layer._timeFrames = new Map<string, Record<string, unknown>[]>([
      ['2023', [{ id: 'a' }]],
      ['2024', LIGNES],
    ]);
    layer._timeSteps = ['2023', '2024'];
    expect(layer._getFrameData(1)).toHaveLength(N + 1);
  });
});

// ---------------------------------------------------------------------------
// Garde statique
// ---------------------------------------------------------------------------

/**
 * Étalements d'arguments DÉCLARÉS : un tableau petit et borné par construction,
 * jamais une colonne ou des lignes de données. Clé : fichier, valeur : le
 * fragment de la ligne et la raison.
 */
const ETALEMENTS_DECLARES: Record<string, Array<{ fragment: string; raison: string }>> = {
  'packages/core/src/components/dsfr-data-map.ts': [
    { fragment: 'Math.min(...insets.map(', raison: 'les encarts d’une carte (une poignée)' },
    { fragment: 'Math.max(...insets.map(', raison: 'les encarts d’une carte (une poignée)' },
  ],
};

const RACINE = resolve(__dirname, '..');
const DOSSIERS = ['packages/core/src', 'packages/shared/src'];
const MOTIF = /Math\.(?:min|max)\(\s*(?:[^()]*,\s*)?\.\.\./;

function fichiersTs(dossier: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) out.push(...fichiersTs(chemin));
    else if (nom.endsWith('.ts') && !nom.endsWith('.d.ts')) out.push(chemin);
  }
  return out;
}

describe('BUG-038 — garde : plus de Math.min(...) / Math.max(...) sur des données', () => {
  it('aucun étalement d’arguments non déclaré dans packages/core/src et packages/shared/src', () => {
    const trouves: string[] = [];
    for (const dossier of DOSSIERS) {
      for (const fichier of fichiersTs(resolve(RACINE, dossier))) {
        const rel = relative(RACINE, fichier).split('\\').join('/');
        const declares = ETALEMENTS_DECLARES[rel] ?? [];
        readFileSync(fichier, 'utf-8')
          .split('\n')
          .forEach((ligne, i) => {
            const code = ligne.trim();
            if (code.startsWith('*') || code.startsWith('//') || code.startsWith('/*')) return;
            if (!MOTIF.test(ligne)) return;
            if (declares.some((d) => ligne.includes(d.fragment))) return;
            trouves.push(`${rel}:${i + 1} ${code}`);
          });
      }
    }
    expect(trouves).toEqual([]);
  });

  it('chaque étalement déclaré existe encore (la liste ne garde pas de fantôme)', () => {
    for (const [rel, declares] of Object.entries(ETALEMENTS_DECLARES)) {
      const source = readFileSync(resolve(RACINE, rel), 'utf-8');
      for (const d of declares) expect(source, `${rel} : ${d.fragment}`).toContain(d.fragment);
    }
  });
});

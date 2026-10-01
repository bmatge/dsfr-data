import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@dsfr-data/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dsfr-data/shared')>();
  return { ...actual, confirmDialog: vi.fn(async () => true) };
});

import { confirmDialog, createEmptyDashboard } from '@dsfr-data/shared';
import {
  generateDashboardBodyHTML,
  scopeFavoriteIds,
} from '../../../packages/shared/src/dashboard/export-html';
import { freeCell } from '../../../apps/dashboard/src/widgets';
import { state, createWidget } from '../../../apps/dashboard/src/state';
import type { Widget } from '../../../apps/dashboard/src/state';

/**
 * Lot D de la revue des tickets — tableau de bord.
 *   #1161 : deux favoris du Builder dans un même tableau de bord.
 *   #1162 : un dépôt sur une cellule occupée par un widget de modèle.
 */

/** Code d'un favori du Builder, tel qu'il est enregistré (ids fixes). */
const FAVORI = `<dsfr-data-source id="chart-src" api-type="opendatasoft" base-url="https://x.example" dataset-id="j" group-by="r" select="r, sum(v) as v__sum"></dsfr-data-source>
<dsfr-data-query id="query-data" source="chart-src" order-by="v__sum:desc"></dsfr-data-query>
<dsfr-data-chart id="chart" source="query-data" type="bar" label-field="r" value-field="v__sum"></dsfr-data-chart>
<dsfr-data-a11y for="chart" source="query-data" table download></dsfr-data-a11y>`;

function favori(id: string, title: string): Widget {
  return {
    id,
    type: 'chart',
    title,
    position: { row: 0, col: id === 'aaaaaaaa-1' ? 0 : 1 },
    config: { fromFavorite: true, favoriteId: id, code: FAVORI },
  } as unknown as Widget;
}

const idsOf = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

describe('#1161 — scopeFavoriteIds', () => {
  it('suffixe chaque id déclaré et chaque référence vers lui', () => {
    const out = scopeFavoriteIds(FAVORI, 'w1');
    expect(idsOf(out)).toEqual(['chart-src--w1', 'query-data--w1', 'chart--w1']);
    expect(out).toContain('source="chart-src--w1"');
    expect(out).toContain('<dsfr-data-chart id="chart--w1" source="query-data--w1"');
    expect(out).toContain('for="chart--w1" source="query-data--w1"');
  });

  it('ne touche ni un id que le favori ne déclare pas, ni les autres attributs', () => {
    const out = scopeFavoriteIds(
      '<dsfr-data-query id="q" source="src-dashboard" group-by="chart"></dsfr-data-query>',
      'w1'
    );
    expect(out).toContain('source="src-dashboard"');
    expect(out).toContain('group-by="chart"');
    expect(out).toContain('id="q--w1"');
  });

  it('listes d’ids, ancres et sélecteurs de script', () => {
    const out = scopeFavoriteIds(
      `<dsfr-data-source id="a"></dsfr-data-source><dsfr-data-source id="b"></dsfr-data-source>
<dsfr-data-concat id="c" sources="a, b"></dsfr-data-concat><a href="#c">lien</a>
<script>document.getElementById('c'); document.querySelector('#a');</script>`,
      'w1'
    );
    expect(out).toContain('sources="a--w1, b--w1"');
    expect(out).toContain('href="#c--w1"');
    expect(out).toContain("getElementById('c--w1')");
    expect(out).toContain("querySelector('#a--w1')");
  });
});

describe('#1161 — deux favoris du Builder dans un même tableau de bord', () => {
  it('les ids exportés sont uniques, et chaque graphique lit SA requête', () => {
    const dashboard = createEmptyDashboard();
    dashboard.widgets = [favori('aaaaaaaa-1', 'Camembert'), favori('bbbbbbbb-2', 'Barres')];
    const html = generateDashboardBodyHTML(dashboard);

    const ids = idsOf(html);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).toContain('<dsfr-data-chart id="chart--aaaaaaaa" source="query-data--aaaaaaaa"');
    expect(html).toContain('<dsfr-data-chart id="chart--bbbbbbbb" source="query-data--bbbbbbbb"');
  });
});

describe('#1162 — dépôt sur une cellule occupée', () => {
  beforeEach(() => {
    vi.mocked(confirmDialog).mockClear();
    state.dashboard = createEmptyDashboard();
  });

  it('cellule vide : rien à confirmer', async () => {
    expect(await freeCell(0, 0)).toBe(true);
    expect(confirmDialog).not.toHaveBeenCalled();
  });

  it('cellule d’un widget de modèle : il est remplacé après confirmation', async () => {
    const kpi = createWidget('kpi', 0, 0);
    const voisin = createWidget('kpi', 0, 1);
    state.dashboard.widgets = [kpi, voisin];

    expect(await freeCell(0, 0)).toBe(true);
    expect(confirmDialog).toHaveBeenCalledOnce();
    expect(state.dashboard.widgets).toEqual([voisin]);
  });

  it('confirmation refusée : le widget reste, rien ne s’empile', async () => {
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    const kpi = createWidget('kpi', 0, 0);
    state.dashboard.widgets = [kpi];

    expect(await freeCell(0, 0)).toBe(false);
    expect(state.dashboard.widgets).toEqual([kpi]);
  });
});

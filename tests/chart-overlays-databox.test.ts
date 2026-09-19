import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #903 (constat BUG-019 du banc d'essai) — avec `databox`, `reference-lines` et
 * `targets` etaient peints SOUS la carte de la DataBox, donc invisibles.
 *
 * Meme famille que #813 (`color-map` recolorait le graphique mais pas sa
 * legende) : sous `databox`, DSFR Chart teleporte le canvas DANS la carte
 * (`div.fr-card.databox`, `position: relative`, `z-index: 500`, fond blanc
 * opaque), tandis que les overlays etaient ajoutes a cote de `data-box`, dans
 * `.dsfr-data-chart__databox-wrapper`. Deux positionnes dans le meme contexte
 * d'empilement : celui a `z-index: 500` gagne, les SVG a `z-index: auto` sont
 * peints dessous. `elementFromPoint` au milieu de la ligne de reference
 * renvoyait le canvas. Aucun message : `_paintChartOverlays` trouvait
 * l'instance Chart.js et « reussissait ».
 *
 * La regle posee : les overlays vont dans le MEME contexte d'empilement que le
 * canvas — l'ancetre positionne du canvas, c'est-a-dire la carte quand il y a
 * une DataBox, le wrapper sinon. Pas de course au `z-index` : un overlay a
 * `z-index: 501` passerait aussi au-dessus de la modale et du plein ecran de la
 * DataBox, qui vivent DANS la carte.
 *
 * La preuve de peinture (`elementFromPoint`) est dans
 * `e2e/chart-overlays-databox.spec.ts` : happy-dom n'a pas de moteur de rendu.
 */

import { DsfrDataChart } from '@/components/dsfr-data-chart.js';

interface ChartInternals {
  _paintChartOverlays(overlays: {
    lines: { axis: 'x' | 'y'; value: string | number; label?: string }[];
    targets: { x: string | number; value: number; label?: string }[];
  }): boolean;
}

afterEach(() => {
  document.body.innerHTML = '';
  delete (window as { Chart?: unknown }).Chart;
  vi.restoreAllMocks();
});

/**
 * Le DOM que produit DSFR Chart. Avec `databox` : le canvas est teleporte dans
 * `data-box > div.fr-card.databox`, et l'element `line-chart` reste une coquille
 * vide. Sans : canvas et overlays sont freres dans le wrapper.
 */
function monterGraphique(avecDatabox: boolean) {
  const chart = new DsfrDataChart();
  chart.id = avecDatabox ? 'avec' : 'sans';
  chart.type = 'line';
  document.body.appendChild(chart);

  const wrapper = document.createElement('div');
  wrapper.className = avecDatabox ? 'dsfr-data-chart__databox-wrapper' : 'dsfr-data-chart__wrapper';
  const lineChart = document.createElement('line-chart');
  const canvas = document.createElement('canvas');
  let carte: HTMLElement | null = null;

  if (avecDatabox) {
    const dataBox = document.createElement('data-box');
    carte = document.createElement('div');
    carte.className = 'fr-card databox';
    carte.style.position = 'relative';
    carte.style.zIndex = '500';
    const conteneurChart = document.createElement('div');
    conteneurChart.className = 'chart';
    conteneurChart.appendChild(canvas);
    carte.appendChild(conteneurChart);
    dataBox.appendChild(carte);
    wrapper.append(dataBox, lineChart);
  } else {
    lineChart.appendChild(canvas);
    wrapper.appendChild(lineChart);
  }
  chart.appendChild(wrapper);

  // Instance Chart.js minimale : de quoi calculer des geometries.
  const echelle = { getPixelForValue: () => 100 };
  const instance = {
    canvas,
    chartArea: { left: 40, right: 400, top: 10, bottom: 300, width: 360, height: 290 },
    scales: { x: echelle, y: echelle },
    data: { labels: ['2024-01', '2024-02'], datasets: [{ label: 'Cumul', data: [1, 2] }] },
  };
  (window as { Chart?: unknown }).Chart = { getChart: () => instance };

  return { chart, canvas, carte, wrapper };
}

const LIGNES = [{ axis: 'y' as const, value: 2000, label: 'Objectif intermédiaire' }];
const CIBLES = [{ x: '2024-09', value: 4000, label: 'Cible septembre' }];

describe('#903 — overlays et DataBox', () => {
  it('AC : avec databox, les overlays sont dans la carte, pas a cote', () => {
    const { chart, carte } = monterGraphique(true);
    expect(
      (chart as unknown as ChartInternals)._paintChartOverlays({
        lines: LIGNES,
        targets: CIBLES,
      })
    ).toBe(true);

    const reflines = chart.querySelector('.dsfr-data-chart__reflines');
    const cibles = chart.querySelector('.dsfr-data-chart__targets');
    expect(reflines).not.toBeNull();
    expect(cibles).not.toBeNull();
    // Le point du correctif : meme contexte d'empilement que le canvas.
    expect(carte!.contains(reflines!)).toBe(true);
    expect(carte!.contains(cibles!)).toBe(true);
  });

  it('aucun contexte d empilement ne s interpose entre l overlay et le canvas', () => {
    const { chart, canvas } = monterGraphique(true);
    (chart as unknown as ChartInternals)._paintChartOverlays({ lines: LIGNES, targets: [] });
    const refs = chart.querySelector('.dsfr-data-chart__reflines') as SVGElement;
    const hote = refs.parentElement!;

    expect(hote.contains(canvas)).toBe(true);
    expect(getComputedStyle(hote).position).not.toBe('static');

    // Le coeur de #903 : un positionne a `z-index` entre l'hote et le canvas
    // (la carte, a 500) remonte le canvas au-dessus d'un overlay a `z-index:
    // auto`, quoi qu'on fasse par ailleurs.
    const intercales: string[] = [];
    for (let el = canvas.parentElement; el && el !== hote; el = el.parentElement) {
      const style = getComputedStyle(el);
      const positionne = style.position !== 'static' && style.position !== '';
      const empile = style.zIndex !== 'auto' && style.zIndex !== '';
      if (positionne && empile) {
        intercales.push(`${el.className || el.tagName} (z-index ${style.zIndex})`);
      }
    }
    expect(intercales).toEqual([]);
  });

  it('sans databox, rien ne change : les overlays restent dans le wrapper', () => {
    const { chart, wrapper } = monterGraphique(false);
    (chart as unknown as ChartInternals)._paintChartOverlays({ lines: LIGNES, targets: CIBLES });
    expect(wrapper.querySelector(':scope > .dsfr-data-chart__reflines')).not.toBeNull();
    expect(wrapper.querySelector(':scope > .dsfr-data-chart__targets')).not.toBeNull();
  });
});

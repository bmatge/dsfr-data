import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';

/**
 * Cadre officiel de `dsfr-data-chart` (#1289) — ce que le composant DECIDE
 * avant de relayer un attribut au `<data-box>` de DSFR Chart :
 *   1. `databox-modal-content` et l'unite des infobulles sont nettoyes (DSFR
 *      Chart les pose par `innerHTML`) ;
 *   2. `databox-actions` est valide (mal forme, il emportait le cadre) ;
 *   3. les attributs sans effet sont dits ;
 *   4. l'absence du JavaScript du DSFR est dite.
 *
 * Ce fichier teste la decision. Que la charge ne s'execute pas sur le VRAI
 * DSFR Chart se mesure dans `e2e/chart-cadre-html.spec.ts`.
 */

import { DsfrDataChart } from '@/components/dsfr-data-chart.js';
import {
  parseDataboxActions,
  databoxInertAttributes,
  nettoyerHtmlRelaye,
  dsfrJsCharge,
  surveillerJsDsfr,
  reinitialiserSurveillanceJsDsfr,
  DELAI_VERIFICATION_JS_DSFR_MS,
} from '@/utils/chart-databox.js';

/** Vue interne du composant : membres privés inspectés par ces tests. */
interface ChartInternals {
  _data: unknown[];
  _createDataboxElement(tagName: string, attributes: Record<string, string>): HTMLElement;
  _getCommonAttributes(): Record<string, string>;
  _getTypeSpecificAttributes(): { attrs: Record<string, string> };
  _refreshChartOverlays(): void;
}

/** `window.dsfr` tel que le pose (ou non) la page. */
interface FenetreDsfr {
  dsfr?: unknown;
}

const CHARGE = '<img src="x" onerror="alert(1)">';

function cadre(internals: ChartInternals): Element {
  const wrapper = internals._createDataboxElement('bar-chart', { x: '[[]]', y: '[[]]' });
  const box = wrapper.querySelector('data-box');
  if (!box) throw new Error('data-box absent');
  return box;
}

describe('dsfr-data-chart — cadre officiel (#1289)', () => {
  let chart: DsfrDataChart;
  let internals: ChartInternals;
  let warn: MockInstance<typeof console.warn>;
  let error: MockInstance<typeof console.error>;

  beforeEach(() => {
    reinitialiserSurveillanceJsDsfr();
    chart = new DsfrDataChart();
    internals = chart as unknown as ChartInternals;
    chart.id = 'c';
    chart.type = 'bar';
    chart.labelField = 'cat';
    chart.valueField = 'val';
    chart.databox = true;
    chart.databoxTitle = 'Titre';
    internals._data = [{ cat: 'A', val: 1 }];
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as FenetreDsfr).dsfr;
  });

  // -------------------------------------------------------------------------
  describe('1. contenu de la fenêtre : nettoyé, HTML simple gardé', () => {
    beforeEach(() => {
      chart.databoxFullscreen = true;
      chart.databoxModalTitle = 'Méthode';
    });

    it('un HTML simple est relayé à l’identique (rétrocompatibilité)', () => {
      const simple =
        '<p>Texte <strong>gras</strong>, <em>italique</em>, ' +
        '<a href="https://exemple.fr" target="_blank" rel="noopener">un lien</a>.</p>' +
        '<ul><li>un</li><li>deux</li></ul>';
      chart.databoxModalContent = simple;
      expect(cadre(internals).getAttribute('modal-content')).toBe(simple);
      expect(warn).not.toHaveBeenCalled();
    });

    it.each([
      ['gestionnaire on*', `<p>a</p>${CHARGE}`, '<p>a</p><img src="x">'],
      ['script', '<p>a</p><script>alert(1)</script>', '<p>a</p>'],
      ['lien javascript:', '<a href="javascript:alert(1)">clic</a>', '<a>clic</a>'],
      ['iframe', '<iframe src="https://tiers.example"></iframe><p>a</p>', '<p>a</p>'],
      ['style', '<style>body{display:none}</style><p>a</p>', '<p>a</p>'],
      [
        'élément à texte brut',
        '<textarea><a title="</textarea><img src=x onerror=alert(1)>">',
        '<img src=x>">',
      ],
      [
        'nom d’attribut en « = »',
        '<a ="><img src=x onerror=alert(1)>">x</a>',
        '<a ="><img src=x>">x</a>',
      ],
    ])('%s : retiré avant d’être relayé', (_nom, brut, attendu) => {
      chart.databoxModalContent = brut;
      expect(cadre(internals).getAttribute('modal-content')).toBe(attendu);
    });

    it('le retrait est dit dans la console, une fois par valeur', () => {
      chart.databoxModalContent = CHARGE;
      cadre(internals);
      cadre(internals);
      const dits = warn.mock.calls.filter((c) => String(c[0]).includes('databox-modal-content'));
      expect(dits).toHaveLength(1);
      expect(String(dits[0][0])).toContain('dsfr-data-chart[c]');
      expect(String(dits[0][0])).toContain('contenu actif retiré');
    });

    it('un contenu entièrement retiré n’est pas relayé du tout', () => {
      chart.databoxModalContent = '<script>alert(1)</script>';
      expect(cadre(internals).hasAttribute('modal-content')).toBe(false);
    });

    it('les attributs rendus comme du texte ne sont pas touchés', () => {
      chart.databoxTooltipTitle = 'A < B & C';
      chart.databoxTooltipContent = '<b>x</b>';
      chart.databoxSource = 'INSEE <2024>';
      chart.databoxTrend = '+5 %';
      const box = cadre(internals);
      expect(box.getAttribute('tooltip-title')).toBe('A < B & C');
      expect(box.getAttribute('tooltip-content')).toBe('<b>x</b>');
      expect(box.getAttribute('source')).toBe('INSEE <2024>');
      expect(box.getAttribute('trend')).toBe('+5 %');
    });
  });

  // -------------------------------------------------------------------------
  describe('1 bis. unité des infobulles : même puits, même nettoyage', () => {
    it('une unité ordinaire est relayée telle quelle', () => {
      chart.unitTooltip = '%';
      expect(internals._getCommonAttributes()['unit-tooltip']).toBe('%');
      chart.unitTooltip = 'm<sup>2</sup>';
      expect(internals._getCommonAttributes()['unit-tooltip']).toBe('m<sup>2</sup>');
      chart.unitTooltip = '< 5 ans & plus';
      expect(internals._getCommonAttributes()['unit-tooltip']).toBe('< 5 ans & plus');
      expect(warn).not.toHaveBeenCalled();
    });

    it('unit-tooltip : la charge est retirée et dite', () => {
      chart.unitTooltip = `€${CHARGE}`;
      expect(internals._getCommonAttributes()['unit-tooltip']).toBe('€<img src="x">');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('unit-tooltip : contenu actif retiré');
    });

    it('bar-line : les deux unités sont nettoyées', () => {
      chart.type = 'bar-line';
      chart.valueField2 = 'val2';
      chart.unitTooltip = `%${CHARGE}`;
      chart.unitTooltipBar = `kg${CHARGE}`;
      const { attrs } = internals._getTypeSpecificAttributes();
      expect(attrs['unit-tooltip-line']).toBe('%<img src="x">');
      expect(attrs['unit-tooltip-bar']).toBe('kg<img src="x">');
    });
  });

  // -------------------------------------------------------------------------
  describe('2. databox-actions validé avant d’être relayé', () => {
    it('forme attendue : relayée, sans erreur', () => {
      chart.databoxActions = '["Source officielle","Méthode"]';
      expect(cadre(internals).getAttribute('actions')).toBe('["Source officielle","Méthode"]');
      internals._refreshChartOverlays();
      expect(chart.hasAttribute('data-dsfr-config-error')).toBe(false);
      expect(error).not.toHaveBeenCalled();
    });

    it.each([
      ['JSON tronqué', '["a",', 'JSON invalide'],
      ['texte nu', 'Exporter', 'JSON invalide'],
      ['objet', '{"a":1}', 'reçu : un objet'],
      ['chaîne JSON', '"abc"', 'reçu : une chaîne'],
      ['nombre', '5', 'reçu : un nombre'],
    ])('%s : aucune action relayée, le cadre reste, erreur lisible', (_nom, valeur, extrait) => {
      chart.databoxActions = valeur;
      const box = cadre(internals);
      // Rien de ce que DSFR Chart ferait lever ne lui parvient.
      expect(box.hasAttribute('actions')).toBe(false);
      expect(box.getAttribute('name')).toBe('Titre');
      internals._refreshChartOverlays();
      const message = chart.getAttribute('data-dsfr-config-error') ?? '';
      expect(message).toContain('databox-actions');
      expect(message).toContain(extrait);
      expect(message).toContain('["Source officielle","Méthode"]');
      expect(error).toHaveBeenCalledTimes(1);
    });

    it('entrées fautives écartées, les autres gardées', () => {
      chart.databoxActions = '[1,"Méthode",null,"",{"a":1},"Source"]';
      expect(cadre(internals).getAttribute('actions')).toBe('["Méthode","Source"]');
      internals._refreshChartOverlays();
      const message = chart.getAttribute('data-dsfr-config-error') ?? '';
      expect(message).toContain(
        'entrées 1 (un nombre), 3 (null), 4 (une chaîne vide), 5 (un objet)'
      );
    });

    it('une seule console.error par message, et l’erreur s’efface une fois corrigée', () => {
      chart.databoxActions = 'Exporter';
      internals._refreshChartOverlays();
      internals._refreshChartOverlays();
      expect(error).toHaveBeenCalledTimes(1);
      chart.databoxActions = '["Exporter"]';
      internals._refreshChartOverlays();
      expect(chart.hasAttribute('data-dsfr-config-error')).toBe(false);
    });

    it('sans databox, l’attribut n’est pas une erreur du graphique', () => {
      chart.databox = false;
      chart.databoxActions = 'Exporter';
      internals._refreshChartOverlays();
      expect(chart.hasAttribute('data-dsfr-config-error')).toBe(false);
    });

    it('l’erreur se joint à celle des repères, sans l’écraser', () => {
      chart.databoxActions = 'Exporter';
      chart.referenceLines = 'pas du json';
      internals._refreshChartOverlays();
      const message = chart.getAttribute('data-dsfr-config-error') ?? '';
      expect(message).toContain('databox-actions');
      expect(message).toContain('reference-lines');
    });

    it('parseDataboxActions : vide = aucune action, aucune erreur', () => {
      expect(parseDataboxActions('')).toEqual({ actions: [], error: null });
      expect(parseDataboxActions('  ')).toEqual({ actions: [], error: null });
      expect(parseDataboxActions('[]')).toEqual({ actions: [], error: null });
    });
  });

  // -------------------------------------------------------------------------
  describe('3. attributs sans effet : dits, jamais ignorés en silence', () => {
    const dits = (): string[] => warn.mock.calls.map((c) => String(c[0]));

    it('databox-default-source', () => {
      chart.databoxDefaultSource = 'insee';
      cadre(internals);
      expect(dits()).toHaveLength(1);
      expect(dits()[0]).toContain('dsfr-data-chart[c]: databox-default-source est sans effet');
      expect(dits()[0]).toContain("qu'une source");
    });

    it('databox-fullscreen seul : nomme l’attribut et ce qui manque', () => {
      chart.databoxFullscreen = true;
      cadre(internals);
      expect(dits()).toHaveLength(1);
      expect(dits()[0]).toContain('databox-fullscreen est sans effet sans databox-modal-title');
    });

    it('titre de fenêtre sans databox-fullscreen', () => {
      chart.databoxModalTitle = 'Méthode';
      chart.databoxModalContent = '<p>a</p>';
      cadre(internals);
      expect(dits()).toHaveLength(1);
      expect(dits()[0]).toContain('databox-modal-title est sans effet sans databox-fullscreen');
    });

    it('contenu de fenêtre sans titre', () => {
      chart.databoxFullscreen = true;
      chart.databoxModalContent = '<p>a</p>';
      cadre(internals);
      expect(dits().some((m) => m.includes('databox-modal-content est sans effet'))).toBe(true);
    });

    it('un seul avertissement par attribut, quel que soit le nombre de rendus', () => {
      chart.databoxDefaultSource = 'insee';
      cadre(internals);
      cadre(internals);
      cadre(internals);
      expect(dits()).toHaveLength(1);
    });

    it('fenêtre complète (titre + plein écran) : rien à dire', () => {
      chart.databoxFullscreen = true;
      chart.databoxModalTitle = 'Méthode';
      chart.databoxModalContent = '<p>a</p>';
      cadre(internals);
      expect(dits()).toEqual([]);
      expect(
        databoxInertAttributes({
          fullscreen: false,
          modalTitle: '',
          modalContent: '',
          defaultSource: '',
        })
      ).toEqual([]);
    });

    it('l’attribut reste relayé : rien n’est retiré du manifeste ni du cadre', () => {
      chart.databoxDefaultSource = 'insee';
      chart.databoxFullscreen = true;
      const box = cadre(internals);
      expect(box.getAttribute('default-source')).toBe('insee');
      expect(box.hasAttribute('fullscreen')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('4. JavaScript du DSFR absent', () => {
    const dits = (): string[] =>
      warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('JavaScript du DSFR'));

    beforeEach(() => {
      vi.useFakeTimers();
      document.body.appendChild(chart);
    });

    afterEach(() => {
      chart.remove();
    });

    it('critère : window.dsfr est une FONCTION une fois le script chargé', () => {
      expect(dsfrJsCharge()).toBe(false);
      // Objet de configuration posé AVANT le script : ce n'est pas le script.
      (window as FenetreDsfr).dsfr = { mode: 'manual' };
      expect(dsfrJsCharge()).toBe(false);
      (window as FenetreDsfr).dsfr = () => undefined;
      expect(dsfrJsCharge()).toBe(true);
    });

    it('cadre avec menu, script absent : un avertissement, qui dit quoi charger', () => {
      chart.databoxDownload = true;
      cadre(internals);
      expect(dits()).toEqual([]); // jamais à chaud
      vi.advanceTimersByTime(DELAI_VERIFICATION_JS_DSFR_MS + 10);
      expect(dits()).toHaveLength(1);
      expect(dits()[0]).toContain('dsfr-data-chart[c]');
      expect(dits()[0]).toContain('dsfr.module.min.js');
    });

    it('script arrivé APRÈS le composant (module différé) : aucun faux positif', () => {
      chart.databoxDownload = true;
      cadre(internals);
      (window as FenetreDsfr).dsfr = () => undefined;
      vi.advanceTimersByTime(DELAI_VERIFICATION_JS_DSFR_MS + 10);
      expect(dits()).toEqual([]);
    });

    it('document encore en chargement : la vérification attend l’événement load', () => {
      const etat = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
      chart.databoxDownload = true;
      cadre(internals);
      vi.advanceTimersByTime(60_000);
      expect(dits()).toEqual([]);
      etat.mockReturnValue('complete');
      (window as FenetreDsfr).dsfr = () => undefined; // le module s'exécute avant load
      window.dispatchEvent(new Event('load'));
      vi.advanceTimersByTime(DELAI_VERIFICATION_JS_DSFR_MS + 10);
      expect(dits()).toEqual([]);
    });

    it('une seule fois par page, même avec plusieurs cadres', () => {
      chart.databoxDownload = true;
      cadre(internals);
      const autre = new DsfrDataChart();
      autre.id = 'autre';
      autre.type = 'bar';
      autre.databox = true;
      autre.databoxScreenshot = true;
      document.body.appendChild(autre);
      (autre as unknown as ChartInternals)._createDataboxElement('bar-chart', {});
      vi.advanceTimersByTime(DELAI_VERIFICATION_JS_DSFR_MS + 10);
      cadre(internals);
      vi.advanceTimersByTime(DELAI_VERIFICATION_JS_DSFR_MS + 10);
      expect(dits()).toHaveLength(1);
      autre.remove();
    });

    it('cadre sans menu, ni infobulle, ni fenêtre : le script n’est pas requis', () => {
      cadre(internals);
      vi.advanceTimersByTime(DELAI_VERIFICATION_JS_DSFR_MS + 10);
      expect(dits()).toEqual([]);
    });

    it.each([
      ['capture', (c: DsfrDataChart) => (c.databoxScreenshot = true)],
      ['actions', (c: DsfrDataChart) => (c.databoxActions = '["Méthode"]')],
      ['infobulle', (c: DsfrDataChart) => (c.databoxTooltipContent = 'Info')],
      [
        'fenêtre',
        (c: DsfrDataChart) => {
          c.databoxFullscreen = true;
          c.databoxModalTitle = 'Méthode';
        },
      ],
    ])('%s : le script est requis', (_nom, poser) => {
      poser(chart);
      cadre(internals);
      vi.advanceTimersByTime(DELAI_VERIFICATION_JS_DSFR_MS + 10);
      expect(dits()).toHaveLength(1);
    });

    it('composant retiré avant la vérification : silence, et le suivant la relance', () => {
      chart.databoxDownload = true;
      cadre(internals);
      chart.remove();
      vi.advanceTimersByTime(DELAI_VERIFICATION_JS_DSFR_MS + 10);
      expect(dits()).toEqual([]);
      document.body.appendChild(chart);
      surveillerJsDsfr(chart, 'dsfr-data-chart[c]');
      vi.advanceTimersByTime(DELAI_VERIFICATION_JS_DSFR_MS + 10);
      expect(dits()).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  it('nettoyerHtmlRelaye : dit si quelque chose a été retiré', () => {
    expect(nettoyerHtmlRelaye('<p>a</p>')).toEqual({ html: '<p>a</p>', retire: false });
    expect(nettoyerHtmlRelaye(CHARGE)).toEqual({ html: '<img src="x">', retire: true });
  });
});

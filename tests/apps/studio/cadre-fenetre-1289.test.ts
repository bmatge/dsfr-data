/**
 * Chemin du Studio IA vers les puits HTML de DSFR Chart (#1289).
 *
 * Le bloc « composant libre » ecrit tout attribut du manifeste : le modele —
 * qui lit les DONNEES, donc ce qu'un tiers y a glisse — peut ecrire
 * `databox-modal-content` et `unit-tooltip` sur un `dsfr-data-chart`. DSFR
 * Chart pose ces deux valeurs par `innerHTML`.
 *
 * Trois barrieres, testees ici de bout en bout :
 *   1. le Studio REFUSE une valeur qui porte du contenu actif (validation) ;
 *   2. l'export ne fait confiance a rien : un document relu d'un stockage
 *      partage est filtre a l'ecriture de la page ;
 *   3. la bibliotheque nettoie ce qu'elle relaie, d'ou que vienne la page.
 * La page exportee est relue par un analyseur HTML, et ses attributs poses sur
 * un vrai `dsfr-data-chart` : ce qui est verifie est ce que DSFR Chart recoit.
 * Que cela ne s'execute pas dans un navigateur : `e2e/chart-cadre-html.spec.ts`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createEmptyDashboard,
  generateDashboardHTML,
  type DashboardData,
  type Widget,
} from '@dsfr-data/shared';
import { addBlocks, type BlockSpec, type DocumentContext } from '../../../apps/studio/src/document';
import { DsfrDataChart } from '@/components/dsfr-data-chart.js';

const ctx: DocumentContext = { data: [], fields: [], sourceId: 'src' };

type Attr = { name: string; value: string };
const a = (name: string, value: string): Attr => ({ name, value });

/** Vue interne du composant : membres privés inspectés par ces tests. */
interface ChartInternals {
  _data: unknown[];
  _createDataboxElement(tagName: string, attributes: Record<string, string>): HTMLElement;
  _getCommonAttributes(): Record<string, string>;
}

function graphique(extra: Attr[]): BlockSpec {
  return {
    kind: 'component',
    title: 'Effectifs',
    components: [
      {
        tag: 'dsfr-data-chart',
        attributes: [
          a('source', 'src'),
          a('type', 'bar'),
          a('label-field', 'a'),
          a('value-field', 'a'),
          a('databox', ''),
          a('databox-title', 'Effectifs'),
          a('databox-fullscreen', ''),
          a('databox-modal-title', 'Méthode'),
          ...extra,
        ],
      },
    ],
  };
}

function ecrire(spec: BlockSpec): { doc: DashboardData; ok: boolean; summary: string } {
  const doc = createEmptyDashboard();
  doc.sources = [{ id: 'src', name: 'Établissements', type: 'manual', data: [{ a: 1 }] }];
  const { ok, summary } = addBlocks(doc, [spec], ctx);
  return { doc, ok, summary };
}

/** Ce que DSFR Chart recoit quand la page exportee est chargee. */
function relaye(html: string): { fenetre: string | null; unite: string | undefined } {
  // Un <template> : contenu inerte, aucune ressource de la page n'est chargee.
  const page = document.createElement('template');
  page.innerHTML = html;
  const ecrit = page.content.querySelector('dsfr-data-chart');
  if (!ecrit) throw new Error('aucun dsfr-data-chart dans la page exportée');
  const chart = new DsfrDataChart();
  for (const attr of Array.from(ecrit.attributes)) chart.setAttribute(attr.name, attr.value);
  const internals = chart as unknown as ChartInternals;
  internals._data = [{ a: 1 }];
  const box = internals._createDataboxElement('bar-chart', {}).querySelector('data-box');
  return {
    fenetre: box?.getAttribute('modal-content') ?? null,
    unite: internals._getCommonAttributes()['unit-tooltip'],
  };
}

/** Charges qui s'executaient apres l'ancien filtre (mesure Chromium, #1289) et classiques. */
const CHARGES: [string, string][] = [
  ['gestionnaire on*', '<img src=x onerror=alert(1)>'],
  ['script', '<p>a</p><script>alert(1)</script>'],
  ['lien javascript:', '<a href="javascript:alert(1)">clic</a>'],
  ['texte brut', '<textarea><a title="</textarea><img src=x onerror=alert(1)>">'],
  ['noscript', '<noscript><a title="</noscript><img src=x onerror=alert(1)>">'],
  ['nom d’attribut en « = »', '<a ="><img src=x onerror=alert(1)>">x</a>'],
  ['référence sans point-virgule', '<a href="&#106avascript:alert(1)">clic</a>'],
  [
    'animation SVG',
    '<svg><a><animate attributeName="href" values="javascript:alert(1)"/></a></svg>',
  ],
  ['recollement', '<<script></script>img src=x onerror=alert(1)>'],
  ['recollement d’attributs', '<img src=x o onx="1"nerror=alert(1)>'],
];

/**
 * Le fragment, une fois analyse, porte-t-il quelque chose d'actif ? On lit des
 * ELEMENTS et des attributs, pas des sous-chaines : « onerror » ecrit dans un
 * texte (`&lt;img onerror=…>`) n'execute rien.
 */
function actif(html: string): string[] {
  const gabarit = document.createElement('template');
  gabarit.innerHTML = html;
  const corps = gabarit.content;
  const vus: string[] = [];
  for (const el of Array.from(corps.querySelectorAll('*'))) {
    const nom = el.tagName.toLowerCase();
    if (['script', 'iframe', 'animate', 'set', 'textarea', 'noscript', 'style'].includes(nom)) {
      vus.push(`<${nom}>`);
    }
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith('on')) vus.push(`${nom}[${attr.name}]`);
      if (/^\s*javascript:/i.test(attr.value)) vus.push(`${nom}[${attr.name}=javascript:]`);
    }
  }
  return vus;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('#1289 — Studio IA : fenêtre du cadre et unité écrites par le modèle', () => {
  it('témoin : le détecteur voit les charges brutes', () => {
    expect(actif('<img src=x onerror=alert(1)>')).toEqual(['img[onerror]']);
    expect(actif('<a href="javascript:alert(1)">x</a>')).toEqual(['a[href=javascript:]']);
    expect(actif('&lt;img src=x onerror=alert(1)>')).toEqual([]);
  });

  it('le bloc libre peut écrire databox-modal-content : un HTML simple arrive intact', () => {
    const simple =
      '<p>Source : <strong>DEPP</strong>, <a href="https://exemple.fr">méthode</a>.</p>';
    const { doc, ok, summary } = ecrire(
      graphique([a('databox-modal-content', simple), a('unit-tooltip', 'm<sup>2</sup>')])
    );
    expect(summary).not.toContain('refusé');
    expect(ok).toBe(true);
    const recu = relaye(generateDashboardHTML(doc));
    expect(recu.fenetre).toBe(simple);
    expect(recu.unite).toBe('m<sup>2</sup>');
  });

  it.each(CHARGES)('validation — %s : la valeur est refusée au modèle', (_nom, charge) => {
    for (const attribut of ['databox-modal-content', 'unit-tooltip']) {
      const { ok, summary, doc } = ecrire(graphique([a(attribut, charge)]));
      expect(ok).toBe(false);
      expect(summary).toContain(`valeur de "${attribut}" refusée`);
      expect(doc.widgets).toHaveLength(0);
    }
  });

  it.each(CHARGES)(
    'document relu d’un stockage partagé — %s : rien d’actif ne parvient à DSFR Chart',
    (_nom, charge) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Pas de validation Studio ici : un tableau de bord altéré en base.
      const doc = createEmptyDashboard();
      doc.sources = [{ id: 'src', name: 'x', type: 'manual', data: [{ a: 1 }] }];
      const spec = graphique([a('databox-modal-content', charge), a('unit-tooltip', charge)]);
      const widget: Widget = {
        id: 'b1',
        type: 'component',
        title: 'x',
        position: { row: 0, col: 0 },
        config: { components: spec.kind === 'component' ? (spec.components ?? []) : [] },
      } as Widget;
      doc.widgets = [widget];
      const recu = relaye(generateDashboardHTML(doc));
      expect(actif(recu.fenetre ?? '')).toEqual([]);
      expect(actif(recu.unite ?? '')).toEqual([]);
    }
  );

  it.each(CHARGES)(
    'page écrite à la main, sans le Studio — %s : la bibliothèque nettoie seule',
    (_nom, charge) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const chart = new DsfrDataChart();
      chart.databox = true;
      chart.databoxFullscreen = true;
      chart.databoxModalTitle = 'Méthode';
      chart.databoxModalContent = charge;
      chart.unitTooltip = charge;
      const internals = chart as unknown as ChartInternals;
      internals._data = [{ a: 1 }];
      const box = internals._createDataboxElement('bar-chart', {}).querySelector('data-box');
      expect(actif(box?.getAttribute('modal-content') ?? '')).toEqual([]);
      expect(actif(internals._getCommonAttributes()['unit-tooltip'] ?? '')).toEqual([]);
    }
  );
});

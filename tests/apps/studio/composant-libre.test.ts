/**
 * Bloc « composant libre » du Studio (#1111) : validation des appels contre le
 * manifeste (meme moteur que le lint de balisage), export HTML, conservation
 * par le Tableau de bord, vocabulaire engendre depuis le contrat.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  createEmptyDashboard,
  generateDashboardHTML,
  normalizeDashboard,
  type DashboardData,
  type Widget,
} from '@dsfr-data/shared';
import {
  addBlocks,
  updateBlock,
  BLOCK_SPEC_SCHEMA,
  type BlockSpec,
  type DocumentContext,
} from '../../../apps/studio/src/document';
import {
  BALISES_A_GABARIT,
  BALISES_LIBRES,
  CONTRAT_COMPOSANTS,
} from '../../../apps/studio/src/composant-libre';
import { describeBlockVocabulary } from '../../../apps/studio/src/ia/vocabulaire';

const ctx: DocumentContext = { data: [], fields: [], sourceId: 'src' };

function docAvec(specs: BlockSpec[]): { doc: DashboardData; summary: string; ok: boolean } {
  const doc = createEmptyDashboard();
  doc.sources = [{ id: 'src', name: 'Établissements', type: 'manual', data: [{ a: 1 }] }];
  const { ok, summary } = addBlocks(doc, specs, ctx);
  return { doc, ok, summary };
}

type Attr = { name: string; value: string };
const a = (name: string, value: string): Attr => ({ name, value });

/** Tableau croise : pivot sur la source, puis liste. */
const PIVOT: BlockSpec = {
  kind: 'component',
  title: 'Élèves par commune et type',
  components: [
    {
      tag: 'dsfr-data-pivot',
      attributes: [
        a('id', 'croise'),
        a('source', 'src'),
        a('row', 'Commune'),
        a('column', 'Type'),
        a('value', 'Nombre d’élèves'),
      ],
    },
    { tag: 'dsfr-data-list', attributes: [a('source', 'croise')] },
  ],
};

/** Le cas « Aides nationales » (#1108) : un marqueur par ville, volet a droite. */
const AIDES: BlockSpec = {
  kind: 'component',
  components: [
    { tag: 'dsfr-data-map', attributes: [a('id', 'carte'), a('fit-bounds', '')] },
    {
      tag: 'dsfr-data-map-layer',
      attributes: [
        a('id', 'villes'),
        a('source', 'src'),
        a('lat-field', 'Latitude'),
        a('lon-field', 'Longitude'),
        a('group-field', 'Ville'),
      ],
      inside: 'carte',
    },
    {
      tag: 'dsfr-data-map-popup',
      attributes: [a('mode', 'panel-right'), a('for', 'villes'), a('title-field', 'Ville')],
      inside: 'carte',
      template: '<p>{{Action / aide nationale}}</p>',
    },
  ],
};

function refus(spec: BlockSpec): string {
  const { ok, summary } = docAvec([spec]);
  expect(ok).toBe(false);
  return summary;
}

describe('#1111 — validation contre le manifeste', () => {
  it('accepte une petite chaine pivot → liste', () => {
    const { ok, doc } = docAvec([PIVOT]);
    expect(ok).toBe(true);
    expect(doc.widgets[0].type).toBe('component');
  });

  it('refuse un attribut inconnu, en le nommant et en proposant le plus proche', () => {
    const s = refus({
      kind: 'component',
      components: [
        { tag: 'dsfr-data-pivot', attributes: [a('id', 'p'), a('source', 'src'), a('rows', 'x')] },
      ],
    });
    expect(s).toContain('attribut "rows" inconnu');
    expect(s).toContain('Vouliez-vous row');
  });

  it('refuse une valeur hors enumeration, avec les valeurs permises', () => {
    const s = refus({
      kind: 'component',
      components: [
        {
          tag: 'dsfr-data-search',
          attributes: [a('id', 'r'), a('source', 'src'), a('operator', 'fuzzy')],
        },
      ],
    });
    expect(s).toContain('"fuzzy"');
    expect(s).toContain('contains, starts, words');
  });

  it('refuse une source inexistante, en listant les ids disponibles', () => {
    const s = refus({
      kind: 'component',
      components: [{ tag: 'dsfr-data-list', attributes: [a('source', 'inconnue')] }],
    });
    expect(s).toContain('"inconnue"');
    expect(s).toContain('Ids disponibles : src');
  });

  it('refuse une balise hors dsfr-data-*, et la source (posee par le Studio)', () => {
    for (const tag of ['div', 'script', 'iframe']) {
      expect(refus({ kind: 'component', components: [{ tag, attributes: [] }] })).toContain(
        'inconnue. Balises permises'
      );
    }
    expect(
      refus({
        kind: 'component',
        components: [
          { tag: 'dsfr-data-source', attributes: [a('id', 'x'), a('url', 'https://e.fr')] },
        ],
      })
    ).toContain("n'est pas permis ici");
  });

  it('refuse un gestionnaire on*, un schema javascript: et du contenu actif dans une valeur', () => {
    const avec = (attr: Attr): string =>
      refus({
        kind: 'component',
        components: [{ tag: 'dsfr-data-list', attributes: [a('source', 'src'), attr] }],
      });
    expect(avec(a('onclick', 'alert(1)'))).toContain('attribut "onclick" inconnu');
    expect(avec(a('style', 'color:red'))).toContain('attribut "style" inconnu');
    expect(avec(a('caption', 'javascript:alert(1)'))).toContain('javascript:');
    expect(avec(a('caption', '<img src=x onerror=alert(1)>'))).toContain('contenu actif');
  });

  it('refuse un attribut retire, en renvoyant a la forme courante', () => {
    const s = refus({
      kind: 'component',
      components: [{ tag: 'dsfr-data-list', attributes: [a('source', 'src'), a('colonnes', 'x')] }],
    });
    expect(s).toContain('"colonnes"');
    expect(s).toContain('retire');
  });

  it('refuse un reemetteur sans id (rien ne parviendrait a l’aval)', () => {
    const s = refus({
      kind: 'component',
      components: [{ tag: 'dsfr-data-pivot', attributes: [a('source', 'src'), a('row', 'x')] }],
    });
    expect(s).toContain('"id" manquant');
  });

  it('inside doit viser un composant PRECEDENT du bloc', () => {
    const s = refus({
      kind: 'component',
      components: [
        {
          tag: 'dsfr-data-map-layer',
          attributes: [a('source', 'src'), a('lat-field', 'y'), a('lon-field', 'x')],
          inside: 'carte',
        },
        { tag: 'dsfr-data-map', attributes: [a('id', 'carte')] },
      ],
    });
    expect(s).toContain('inside="carte"');
  });

  it('une couche hors de sa carte est refusee (elle ne dessinerait rien)', () => {
    const s = refus({
      kind: 'component',
      components: [
        { tag: 'dsfr-data-map', attributes: [a('id', 'carte')] },
        {
          tag: 'dsfr-data-map-layer',
          attributes: [a('source', 'src'), a('lat-field', 'y'), a('lon-field', 'x')],
        },
      ],
    });
    expect(s).toContain('hors de toute <dsfr-data-map>');
  });

  it('un id deja pris par la source du document est refuse', () => {
    const s = refus({
      kind: 'component',
      components: [
        { tag: 'dsfr-data-pivot', attributes: [a('id', 'src'), a('source', 'src'), a('row', 'x')] },
      ],
    });
    expect(s).toContain('declare plusieurs fois');
  });

  it('gabarit : seulement pour les composants qui en lisent un, et filtre', () => {
    expect(
      refus({
        kind: 'component',
        components: [
          { tag: 'dsfr-data-list', attributes: [a('source', 'src')], template: '<p>x</p>' },
        ],
      })
    ).toContain('ne lit pas de <template>');
    const gabarit = (template: string): string =>
      refus({
        kind: 'component',
        components: [{ tag: 'dsfr-data-display', attributes: [a('source', 'src')], template }],
      });
    expect(gabarit('<p>{{a}}</p><script>alert(1)</script>')).toContain('contenu actif');
    expect(gabarit('<p>{{a}}</p></template><script>alert(1)</script>')).toContain('contenu actif');
    expect(gabarit('<textarea>{{a}}')).toContain('<textarea>');
  });

  it('un bloc libre peut viser un composant declare par un AUTRE bloc libre', () => {
    const { doc, ok } = docAvec([
      {
        kind: 'component',
        components: [
          { tag: 'dsfr-data-search', attributes: [a('id', 'recherche'), a('source', 'src')] },
        ],
      },
      {
        kind: 'component',
        components: [{ tag: 'dsfr-data-list', attributes: [a('source', 'recherche')] }],
      },
    ]);
    expect(ok).toBe(true);
    expect(doc.widgets).toHaveLength(2);
  });

  it('update_block remplace les composants, sans compter ses propres ids comme doublons', () => {
    const { doc } = docAvec([PIVOT]);
    const id = doc.widgets[0].id;
    const r = updateBlock(
      doc,
      id,
      {
        kind: 'component',
        components: [
          {
            tag: 'dsfr-data-pivot',
            attributes: [
              a('id', 'croise'),
              a('source', 'src'),
              a('row', 'Commune'),
              a('column', 'Type'),
              a('value', 'Nombre d’élèves'),
              a('aggregate', 'avg'),
            ],
          },
          { tag: 'dsfr-data-list', attributes: [a('source', 'croise')] },
        ],
      },
      ctx
    );
    expect(r.ok).toBe(true);
    const w = doc.widgets[0];
    expect(w.type === 'component' && w.config.components[0].attributes.at(-1)).toEqual(
      a('aggregate', 'avg')
    );
  });

  it('le cas « Aides nationales » (#1108) est realisable : groupe par ville, volet a droite', () => {
    const { ok, doc, summary } = docAvec([AIDES]);
    expect(summary).not.toContain('refusé');
    expect(ok).toBe(true);
    const html = generateDashboardHTML(doc);
    expect(html).toContain('group-field="Ville"');
    expect(html).toContain(
      '<dsfr-data-map-popup mode="panel-right" for="villes" title-field="Ville">'
    );
    // Composants de carte : le bundle complet.
    expect(html).toContain('dsfr-data.esm.js');
  });
});

describe('#1111 — export HTML', () => {
  it('emet la chaine dans l’ordre, echappee, et la source qu’elle lit', () => {
    const { doc } = docAvec([PIVOT]);
    const html = generateDashboardHTML(doc);
    expect(html).toContain('<dsfr-data-source id="src"');
    expect(html).toContain(
      '<dsfr-data-pivot id="croise" source="src" row="Commune" column="Type" value="Nombre d’élèves"></dsfr-data-pivot>\n' +
        '        <dsfr-data-list source="croise"></dsfr-data-list>'
    );
    expect(html).toContain('<h3 class="fr-h6">Élèves par commune et type</h3>');
    // Pas de composant de carte : le bundle core suffit.
    expect(html).toContain('dsfr-data.core.esm.js');
  });

  it('imbrique selon inside, avec le gabarit enfant', () => {
    const { doc } = docAvec([AIDES]);
    const html = generateDashboardHTML(doc);
    const debut = html.indexOf('<dsfr-data-map ');
    const fin = html.indexOf('</dsfr-data-map>') + '</dsfr-data-map>'.length;
    const hote = document.createElement('div');
    hote.innerHTML = html.slice(debut, fin);
    const carte = hote.querySelector('dsfr-data-map');
    expect(carte?.hasAttribute('fit-bounds')).toBe(true);
    expect(carte?.querySelector(':scope > dsfr-data-map-layer#villes')).not.toBeNull();
    const popup = carte?.querySelector(':scope > dsfr-data-map-popup');
    expect(popup?.querySelector('template')?.innerHTML).toBe('<p>{{Action / aide nationale}}</p>');
  });

  it('un document relu d’un stockage partage n’emet qu’une forme sure', () => {
    // Pas de validation Studio ici : un tableau de bord altere en base.
    const doc = createEmptyDashboard();
    const widget: Widget = {
      id: 'b1',
      type: 'component',
      title: 'x',
      position: { row: 0, col: 0 },
      config: {
        components: [
          { tag: 'script', attributes: [a('src', 'https://e.fr/x.js')] },
          {
            tag: 'dsfr-data-list',
            attributes: [
              a('onclick', 'alert(1)'),
              a('caption', 'javascript:alert(1)'),
              a('x" onmouseover="alert(1)', 'y'),
              a('label', '"><script>alert(1)</script>'),
              a('on', 'code'),
            ],
            template: '<p>ok</p><script>alert(1)</script>',
          },
        ],
      },
    };
    doc.widgets = [widget];
    const html = generateDashboardHTML(doc);
    expect(html).not.toContain('<script src="https://e.fr');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('onmouseover');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('alert(1)</script>');
    // `on` est un attribut legitime (cle de dsfr-data-join), pas un gestionnaire.
    expect(html).toContain(' on="code"');
    expect(html).toContain('<template><p>ok</p></template>');
  });
});

describe('#1111 — Tableau de bord : le bloc se conserve a la relecture', () => {
  it('normalizeDashboard garde le bloc tel quel, et l’export est identique', () => {
    const { doc } = docAvec([PIVOT, AIDES]);
    const relu = normalizeDashboard(JSON.parse(JSON.stringify(doc)) as DashboardData);
    expect(relu.widgets).toEqual(doc.widgets);
    expect(generateDashboardHTML(relu)).toBe(generateDashboardHTML(doc));
  });

  it('une forme inattendue est ecartee a la lecture, sans perdre le reste', () => {
    const relu = normalizeDashboard({
      ...createEmptyDashboard(),
      widgets: [
        {
          id: 'b1',
          type: 'component',
          title: 'x',
          position: { row: 0, col: 0 },
          config: {
            components: [
              { tag: 'div', attributes: [] },
              { tag: 'dsfr-data-list', attributes: [a('source', 's'), { name: 'n', value: 3 }] },
            ],
          },
        },
      ],
    } as unknown as DashboardData);
    const w = relu.widgets[0];
    expect(w.type).toBe('component');
    expect(w.type === 'component' && w.config.components).toEqual([
      { tag: 'dsfr-data-list', attributes: [a('source', 's')] },
    ]);
  });
});

describe('#1111 — vocabulaire engendre depuis le manifeste', () => {
  it('la liste des balises du schema est le contrat, moins la source et la balise de suivi', () => {
    const attendu = Object.keys(CONTRAT_COMPOSANTS)
      .filter((t) => t !== 'dsfr-data-source' && t !== 'dsfr-data-beacon')
      .sort();
    expect([...BALISES_LIBRES]).toEqual(attendu);
    const items = BLOCK_SPEC_SCHEMA.properties.components.items;
    expect([...items.properties.tag.enum]).toEqual(attendu);
    expect(describeBlockVocabulary()).toContain(`- tag = ${attendu.join(' | ')}`);
    expect(describeBlockVocabulary()).not.toContain('dsfr-data-source |');
  });

  it('test-garde : les composants a gabarit sont ceux qui lisent un <template> enfant', () => {
    const dir = join(__dirname, '../../../packages/core/src/components');
    const lisent = readdirSync(dir)
      .filter((f) => f.startsWith('dsfr-data-') && f.endsWith('.ts'))
      .filter((f) => {
        const src = readFileSync(join(dir, f), 'utf-8');
        return src.includes('child-template') || src.includes('HTMLTemplateElement');
      })
      .map((f) => f.replace(/\.ts$/, ''))
      .sort();
    expect([...BALISES_A_GABARIT].sort()).toEqual(lisent);
  });
});

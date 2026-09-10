import { describe, it, expect, afterEach } from 'vitest';
import {
  DataflowRecorder,
  FIELD_ATTRS,
  SHAPE_ATTRS,
  checkNodeFields,
  fieldIssuesByNode,
  fieldsInAttr,
  formatTrace,
  snapshotGraph,
  summarizeTrace,
} from '@dsfr-data/shared';
import { dispatchDataLoaded, clearDataCache, clearDataMeta } from '@/utils/data-bridge.js';

/**
 * Le champ inexistant se voit (#727, volet 1).
 *
 * La panne la plus frequente du banc d'essai, et la plus muette : une faute
 * de frappe dans `label-field` rend un graphique vide, sans un mot. Ce qui se
 * verifie ici, c'est autant le signalement que son ABSENCE — un diagnostic qui
 * crie au loup sur un champ imbrique parfaitement valide serait pire que rien.
 */

function mount(html: string): () => void {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return () => host.remove();
}

function purge(...ids: string[]) {
  for (const id of ids) {
    clearDataCache(id);
    clearDataMeta(id);
  }
}

describe('croisement attributs / schema recu', () => {
  let recorder: DataflowRecorder | undefined;
  let unmount: (() => void) | undefined;

  afterEach(() => {
    recorder?.stop();
    recorder = undefined;
    unmount?.();
    unmount = undefined;
    purge('src', 'q1', 'c1', 'k1', 'm1');
  });

  function trace(html: string, emissions: Array<[string, unknown]>) {
    unmount = mount(html);
    recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    for (const [id, data] of emissions) dispatchDataLoaded(id, data);
    return recorder.snapshot();
  }

  it('nomme le champ absent ET les champs qui existent', () => {
    const t = trace(
      `<dsfr-data-source id="src"></dsfr-data-source>
       <dsfr-data-chart id="c1" source="src" type="bar"
         label-field="nom_communne" value-field="population"></dsfr-data-chart>`,
      [['src', [{ nom_commune: 'Lyon', population: 500000 }]]]
    );

    const issues = fieldIssuesByNode(t.graph, t.states).c1;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      attr: 'label-field',
      field: 'nom_communne',
      reason: 'absent',
    });
    expect(issues[0].message).toBe(
      'Le champ label-field "nom_communne" n\'existe pas. Champs : nom_commune, population.'
    );
  });

  it('rend le champ absent dans la trace, et le compte comme une alerte', () => {
    const t = trace(
      `<dsfr-data-source id="src"></dsfr-data-source>
       <dsfr-data-chart id="c1" source="src" type="bar" label-field="nom_communne"></dsfr-data-chart>`,
      [['src', [{ nom_commune: 'Lyon', population: 500000 }]]]
    );

    const texte = formatTrace(t);
    expect(texte).toContain('✗ CHAMP');
    expect(texte).toContain('Le champ label-field "nom_communne" n\'existe pas');
    expect(texte).toContain('Champs : nom_commune, population.');
    expect(summarizeTrace(t).alerts).toBeGreaterThan(0);
  });

  it('ne crie pas au loup sur un champ imbrique resolu par getByPath', () => {
    const t = trace(
      `<dsfr-data-source id="src"></dsfr-data-source>
       <dsfr-data-chart id="c1" source="src" type="bar"
         label-field="fields.nom" value-field="fields.pop"></dsfr-data-chart>`,
      [['src', [{ fields: { nom: 'Lyon', pop: 500000 }, id: 1 }]]]
    );

    expect(fieldIssuesByNode(t.graph, t.states).c1).toBeUndefined();
    expect(formatTrace(t)).not.toContain("n'existe pas");
  });

  it('signale quand meme la RACINE inexistante d’un chemin imbrique', () => {
    const t = trace(
      `<dsfr-data-source id="src"></dsfr-data-source>
       <dsfr-data-chart id="c1" source="src" type="bar" label-field="record.nom"></dsfr-data-chart>`,
      [['src', [{ fields: { nom: 'Lyon' }, id: 1 }]]]
    );

    const issues = fieldIssuesByNode(t.graph, t.states).c1;
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe('record.nom');
  });

  it('distingue « absent du schema » de « present mais vide »', () => {
    const t = trace(
      `<dsfr-data-source id="src"></dsfr-data-source>
       <dsfr-data-chart id="c1" source="src" type="bar"
         label-field="nom" value-field="population"></dsfr-data-chart>`,
      [
        [
          'src',
          [
            { nom: 'Lyon', population: null },
            { nom: 'Nice', population: null },
          ],
        ],
      ]
    );

    const issues = fieldIssuesByNode(t.graph, t.states).c1;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ attr: 'value-field', field: 'population', reason: 'vide' });
    expect(issues[0].message).toContain("aucune valeur n'a été observée");
  });

  it('ne contredit jamais une source : ses attributs nomment un jeu distant', () => {
    const t = trace(
      `<dsfr-data-source id="src" where="departement:eq:69" group-by="inexistant"></dsfr-data-source>`,
      [['src', [{ nom_commune: 'Lyon' }]]]
    );

    expect(fieldIssuesByNode(t.graph, t.states)).toEqual({});
  });

  it('se tait tant qu’aucun schema n’a ete observe en amont', () => {
    const t = trace(
      `<dsfr-data-source id="src"></dsfr-data-source>
       <dsfr-data-chart id="c1" source="src" type="bar" label-field="nimporte"></dsfr-data-chart>`,
      []
    );

    expect(fieldIssuesByNode(t.graph, t.states)).toEqual({});
  });

  it('lit les attributs que SHAPE_ATTRS ignorait : geo-field, fill-field, value du KPI', () => {
    const t = trace(
      `<dsfr-data-source id="src"></dsfr-data-source>
       <dsfr-data-map-layer id="m1" source="src" type="geoshape"
         geo-field="geo_shpe" fill-field="densite"></dsfr-data-map-layer>
       <dsfr-data-kpi id="k1" source="src" value="populatio:sum"></dsfr-data-kpi>`,
      [['src', [{ geo_shape: {}, densite: 12, population: 3 }]]]
    );

    const parNoeud = fieldIssuesByNode(t.graph, t.states);
    expect(parNoeud.m1.map((i) => i.field)).toEqual(['geo_shpe']);
    expect(parNoeud.k1.map((i) => i.field)).toEqual(['populatio']);
  });

  it('lit le group-by et le where d’un query, pas son aggregate ni son order-by', () => {
    const t = trace(
      `<dsfr-data-source id="src"></dsfr-data-source>
       <dsfr-data-query id="q1" source="src" group-by="departemnt" where="pop:gte:1000"
         aggregate="pop:sum" order-by="pop__sum:desc"></dsfr-data-query>`,
      [['src', [{ departement: '69', pop: 500 }]]]
    );

    const issues = fieldIssuesByNode(t.graph, t.states).q1;
    expect(issues.map((i) => i.field)).toEqual(['departemnt']);
  });

  it('SHAPE_ATTRS collecte tout attribut declare dans FIELD_ATTRS', () => {
    unmount = mount(
      `<dsfr-data-map-layer id="m1" source="src" heat-field="poids" time-field="annee"></dsfr-data-map-layer>`
    );
    const node = snapshotGraph(document.body).nodes.find((n) => n.id === 'm1');
    expect(node?.attrs['heat-field']).toBe('poids');
    expect(node?.attrs['time-field']).toBe('annee');
    // Les deux tables restent disjointes : SHAPE_ATTRS ne porte que le
    // cadrage, l'union est faite a la collecte.
    expect(SHAPE_ATTRS['dsfr-data-map-layer']).not.toContain('heat-field');
    expect(Object.keys(FIELD_ATTRS['dsfr-data-map-layer'])).toContain('heat-field');
  });
});

describe('lecture des grammaires d’attributs', () => {
  it('lit une liste, un alias, une clause et une paire de jointure', () => {
    expect(fieldsInAttr('region, dept', 'liste')).toEqual(['region', 'dept']);
    expect(fieldsInAttr('cle:Libellé, autre:Autre', 'liste-alias')).toEqual(['cle', 'autre']);
    expect(fieldsInAttr('ancien:nouveau | a:b', 'pipe-alias')).toEqual(['ancien', 'a']);
    expect(fieldsInAttr('pop:gte:1000, statut:eq:Actif', 'clauses')).toEqual(['pop', 'statut']);
    expect(fieldsInAttr('code_dep=dep, annee', 'paires')).toEqual(['code_dep', 'dep', 'annee']);
  });

  it('ignore une clause dont l’operateur est inconnu — c’est au query de le dire', () => {
    expect(fieldsInAttr('pop:supegal:1000', 'clauses')).toEqual([]);
  });

  it('lit la grammaire d’agregat du KPI sans inventer de champ', () => {
    expect(fieldsInAttr('population:sum', 'expression')).toEqual(['population']);
    expect(fieldsInAttr('count', 'expression')).toEqual([]);
    expect(fieldsInAttr('meta:total', 'expression')).toEqual([]);
    expect(fieldsInAttr('count:statut:ouvert / count', 'expression')).toEqual(['statut']);
    expect(fieldsInAttr('sum:population', 'expression')).toEqual(['population']);
    expect(fieldsInAttr('recettes:evolution', 'expression')).toEqual(['recettes']);
    // Fonction hors liste : le KPI signale lui-meme, la trace n'ajoute rien.
    expect(fieldsInAttr('population:mediane', 'expression')).toEqual([]);
  });
});

describe('checkNodeFields', () => {
  it('ne rend rien quand aucun champ n’est connu', () => {
    const node = {
      id: 'c1',
      tag: 'dsfr-data-chart',
      role: 'display' as const,
      synthetic: false,
      ambiguous: false,
      upstream: ['src'],
      attrs: { 'label-field': 'nimporte' },
    };
    expect(checkNodeFields(node, [])).toEqual([]);
  });
});

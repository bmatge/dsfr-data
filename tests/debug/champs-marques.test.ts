/**
 * Attributs qui désignent un champ des données (#1141) : marqués `@champ` dans
 * le JSDoc des composants, relus dans le manifeste, propagés au contrat des
 * composants et à `FIELD_ATTRS`. Ces tests-gardes empêchent qu'un attribut de
 * champ ajouté à la lib échappe au contrôle en silence.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  ATTRIBUTS_CHAMP_NON_MARQUES,
  FIELD_ATTRS,
  FIELD_ATTR_KINDS,
} from '../../packages/shared/src/debug/field-check';
import { COMPONENT_CONTRACT } from '../../mcp-server/src/component-contract.generated.js';

const ROOT = join(__dirname, '../..');

interface CemAttr {
  name: string;
  champ?: string;
}
interface CemDecl {
  tagName?: string;
  attributes?: CemAttr[];
}
const cem = JSON.parse(readFileSync(join(ROOT, 'packages/core/custom-elements.json'), 'utf-8')) as {
  modules: { declarations?: CemDecl[] }[];
};

/** Attributs du manifeste, par balise, avec leur grammaire de champ éventuelle. */
const attributsCem: { tag: string; name: string; champ?: string }[] = cem.modules.flatMap((m) =>
  (m.declarations ?? []).flatMap((d) =>
    d.tagName
      ? (d.attributes ?? []).map((a) => ({
          tag: d.tagName as string,
          name: a.name,
          champ: a.champ,
        }))
      : []
  )
);

/**
 * Noms qui ont l'air de désigner un champ : `…-field`, `…-fields`, `field`,
 * `fields`, et l'inventaire des noms nus relevés dans la lib (#1141).
 */
function ressembleAUnChamp(nom: string): boolean {
  const base = nom.replace(/-\d+$/, ''); // value-field-2
  return ['field', 'fields'].includes(base) || base.endsWith('-field') || base.endsWith('-fields');
}
const NOMS_DE_CHAMP = new Set([
  'group-by',
  'sort',
  'tri',
  'columns',
  'colonnes',
  'filters',
  'filtres',
  'row',
  'column',
  'value',
  'valeur',
  'on',
  'where',
  'filter',
  'select',
  'aggregate',
  'order-by',
  'id-cols',
  'value-cols',
  'value-cols-pattern',
  'numeric',
  'round',
  'split',
  'rename',
  'flatten',
  'fold',
  'disjunctive',
  'searchable',
  'labels',
  'trend',
  'tendance',
  'var-name',
  'value-name',
  'display',
]);

describe('attributs-champs marqués @champ (#1141)', () => {
  it('tout attribut qui ressemble à un champ est marqué, ou exclu avec sa raison', () => {
    const oublies = attributsCem
      .filter((a) => ressembleAUnChamp(a.name) || NOMS_DE_CHAMP.has(a.name))
      .filter((a) => !a.champ && !(`${a.tag} ${a.name}` in ATTRIBUTS_CHAMP_NON_MARQUES))
      .map((a) => `${a.tag} ${a.name}`);
    // Si ce test casse : ajouter `@champ <grammaire>` au JSDoc de l'attribut
    // (puis npm run build:skills), ou l'exclure dans ATTRIBUTS_CHAMP_NON_MARQUES.
    expect(oublies).toEqual([]);
  });

  it('une exclusion vise un attribut qui existe et qui n’est pas marqué', () => {
    const connus = new Map(attributsCem.map((a) => [`${a.tag} ${a.name}`, a.champ]));
    for (const cle of Object.keys(ATTRIBUTS_CHAMP_NON_MARQUES)) {
      expect(connus.has(cle), `${cle} absent du manifeste`).toBe(true);
      expect(connus.get(cle), `${cle} est marqué ET exclu`).toBeUndefined();
      expect(ATTRIBUTS_CHAMP_NON_MARQUES[cle].length).toBeGreaterThan(10);
    }
  });

  it('FIELD_ATTRS est exactement le marquage du manifeste', () => {
    const duManifeste: Record<string, Record<string, string>> = {};
    for (const a of attributsCem) {
      if (a.champ) (duManifeste[a.tag] ??= {})[a.name] = a.champ;
    }
    expect(FIELD_ATTRS).toEqual(duManifeste);
  });

  it('le contrat des composants porte le même marquage', () => {
    const contrat = COMPONENT_CONTRACT as unknown as Record<
      string,
      { fields?: Record<string, string> }
    >;
    for (const [tag, c] of Object.entries(contrat)) {
      expect(c.fields ?? {}, tag).toEqual(FIELD_ATTRS[tag] ?? {});
    }
  });

  it('les grammaires du plugin CEM sont celles de FieldAttrKind', () => {
    const config = readFileSync(join(ROOT, 'custom-elements-manifest.config.mjs'), 'utf-8');
    const bloc = /GRAMMAIRES_CHAMP = \[([^\]]*)\]/.exec(config)?.[1] ?? '';
    const grammaires = [...bloc.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(grammaires).toEqual([...FIELD_ATTR_KINDS]);
  });

  it('les attributs-champs connus sont marqués (échantillon de l’issue)', () => {
    expect(FIELD_ATTRS['dsfr-data-chart']['label-field']).toBe('nom');
    expect(FIELD_ATTRS['dsfr-data-chart']['value-field']).toBe('liste-alias');
    expect(FIELD_ATTRS['dsfr-data-query']['group-by']).toBe('liste');
    expect(FIELD_ATTRS['dsfr-data-list']['sort']).toBe('liste-alias');
    expect(FIELD_ATTRS['dsfr-data-facets']['fields']).toBe('liste');
    expect(FIELD_ATTRS['dsfr-data-map-layer']['group-field']).toBe('nom');
    expect(FIELD_ATTRS['dsfr-data-source']).toBeUndefined();
  });
});

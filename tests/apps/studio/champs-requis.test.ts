/**
 * Champs requis par type de bloc (#1123) — schema des outils, validation de
 * `document.ts` et vocabulaire engendre disent la MEME chose.
 *
 * Constat du banc (`tableau-pagine`, 0/2) : `valueField` etait requis pour
 * tous les types, datalist compris. Le modele l'omettait a juste titre pour un
 * tableau, l'appel etait refuse, et il payait un tour pour en inventer un.
 */
import { describe, it, expect } from 'vitest';
import {
  CHART_CONFIG_TYPES,
  createEmptyDashboard,
  generateDashboardHTML,
  normalizeDashboard,
  type ChartConfig,
} from '@dsfr-data/shared';
import {
  BLOCK_SPEC_SCHEMA,
  DOCUMENT_TOOLS,
  TYPES_SANS_VALUE_FIELD,
  addBlocks,
  champsRequisManquants,
  updateBlock,
  type DocumentContext,
} from '../../../apps/studio/src/document';
import { describeBlockVocabulary } from '../../../apps/studio/src/ia/vocabulaire';
import { ecartsDeLAppel, type OutilDeclare } from '../../../tools/banc-studio/schema';

const ctx: DocumentContext = { data: [], fields: [], sourceId: 'src' };

/** Champs requis attendus, type par type : la table de verite de #1123. */
const REQUIS_ATTENDUS: Record<(typeof CHART_CONFIG_TYPES)[number], readonly string[]> = {
  bar: ['type', 'valueField'],
  line: ['type', 'valueField'],
  pie: ['type', 'valueField'],
  doughnut: ['type', 'valueField'],
  radar: ['type', 'valueField'],
  horizontalBar: ['type', 'valueField'],
  scatter: ['type', 'valueField'],
  gauge: ['type', 'valueField'],
  kpi: ['type', 'valueField'],
  map: ['type', 'valueField'],
  'bar-line': ['type', 'valueField'],
  'map-reg': ['type', 'valueField'],
  'map-aca': ['type', 'valueField'],
  'map-monde': ['type', 'valueField'],
  datalist: ['type'],
  podium: ['type', 'valueField'],
};

function accepte(config: Partial<ChartConfig>): boolean {
  return addBlocks(createEmptyDashboard(), [{ kind: 'chart', config }], ctx).ok;
}

describe('studio/document — champs requis par type de bloc chart', () => {
  it('la table couvre chaque type connu', () => {
    expect(Object.keys(REQUIS_ATTENDUS).sort()).toEqual([...CHART_CONFIG_TYPES].sort());
  });

  for (const type of CHART_CONFIG_TYPES) {
    const requis = REQUIS_ATTENDUS[type];
    it(`${type} : accepte avec ${requis.join(' + ')}, refuse sans un seul d’eux`, () => {
      const complet: Partial<ChartConfig> = { type, valueField: 'v' };
      const minimal = Object.fromEntries(
        requis.map((k) => [k, complet[k as keyof ChartConfig]])
      ) as Partial<ChartConfig>;
      expect(accepte(minimal)).toBe(true);
      expect(champsRequisManquants(minimal)).toEqual([]);
      for (const k of requis) {
        const sans = { ...minimal };
        delete sans[k as keyof ChartConfig];
        expect(accepte(sans)).toBe(false);
      }
    });
  }

  it('datalist : valueField ne devient requis que pour trier ou agreger', () => {
    expect(accepte({ type: 'datalist', pagination: 10 })).toBe(true);
    const outcome = addBlocks(
      createEmptyDashboard(),
      [{ kind: 'chart', config: { type: 'datalist', sortOrder: 'desc' } }],
      ctx
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.summary).toContain('sortOrder');
    expect(outcome.summary).toContain('valueField');
    expect(accepte({ type: 'datalist', aggregation: 'sum' })).toBe(false);
    expect(accepte({ type: 'datalist', sortOrder: 'desc', valueField: 'v' })).toBe(true);
  });

  it('un bar sans valueField est refuse avec un message actionnable', () => {
    const outcome = addBlocks(
      createEmptyDashboard(),
      [{ kind: 'chart', config: { type: 'bar', labelField: 'l' } }],
      ctx
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.summary).toContain('"valueField" est obligatoire pour le type bar');
  });

  it('un datalist sans valueField survit a la normalisation du dashboard et s’exporte', () => {
    const doc = createEmptyDashboard();
    doc.sources = [
      {
        id: 'src',
        name: 'S',
        type: 'manual',
        data: [{ a: 1 }],
      } as unknown as (typeof doc.sources)[number],
    ];
    addBlocks(doc, [{ kind: 'chart', config: { type: 'datalist', pagination: 10 } }], ctx);
    const relu = normalizeDashboard(JSON.parse(JSON.stringify(doc)));
    expect(relu.widgets).toHaveLength(1);
    const html = generateDashboardHTML(relu);
    expect(html).toContain('<dsfr-data-list');
    expect(html).toContain('pagination="10"');
    expect(html).not.toContain('undefined');
  });

  it('update_block d’un datalist sans valueField reste accepte', () => {
    const doc = createEmptyDashboard();
    addBlocks(doc, [{ kind: 'chart', config: { type: 'datalist' } }], ctx);
    const outcome = updateBlock(
      doc,
      doc.widgets[0].id,
      { kind: 'chart', config: { pagination: 20 } },
      ctx
    );
    expect(outcome.ok).toBe(true);
  });
});

describe('studio — schema, validation et vocabulaire alignes', () => {
  const config = BLOCK_SPEC_SCHEMA.properties.config;

  it('le schema du bloc chart n’exige que type ; valueField dit ses exceptions', () => {
    expect(config.required).toEqual(['type']);
    for (const type of TYPES_SANS_VALUE_FIELD) {
      expect(config.properties.valueField.description).toContain(type);
    }
  });

  it('le vocabulaire engendre le dit au modele', () => {
    const vocabulaire = describeBlockVocabulary();
    expect(vocabulaire).toContain('- type = ');
    expect(vocabulaire).toContain('Obligatoire pour tous les types SAUF datalist');
  });

  it('un add_blocks de datalist sans valueField est CONFORME au schema envoye au modele', () => {
    const outils = DOCUMENT_TOOLS as unknown as OutilDeclare[];
    const appel = {
      nom: 'add_blocks',
      brut: JSON.stringify({
        blocks: [{ kind: 'chart', config: { type: 'datalist', pagination: 10 } }],
      }),
    };
    expect(ecartsDeLAppel(appel, outils)).toEqual([]);
  });
});

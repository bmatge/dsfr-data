/**
 * Garde-fou de la reference GENEREE des skills (#512).
 *
 * L'ancien garde-fou verifiait que le nom de chaque attribut apparaissait
 * quelque part dans le texte redige a la main d'une skill — un `includes()` qui
 * ne garantissait ni la semantique, ni les evenements, ni les slots, ni les
 * variables CSS. Il est remplace ici par un controle de la CHAINE de generation,
 * maillon par maillon :
 *
 *   composants Lit reels  --(1)-->  custom-elements.json  --(2)-->  module genere  --(3)-->  SKILLS
 *
 *   (1) le manifeste commite decrit exactement les attributs qui existent au
 *       runtime (introspection de `elementProperties`) ;
 *   (2) le module genere commite est bien ce que le rendu produit a partir du
 *       manifeste (personne ne l'a edite a la main, personne n'a oublie de
 *       relancer `npm run build:skills`) ;
 *   (3) chaque skill de composant embarque sa section generee, ET garde un
 *       guide redige a la main (la generation ne remplace pas la pedagogie).
 *
 * Consequence : ajouter un attribut a un composant sans regenerer fait echouer
 * (2) ; le renommer sans toucher au JSDoc fait echouer (1).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SKILLS } from '../../../apps/builder-ia/src/skills';
import {
  COMPONENT_REFERENCES,
  reference,
} from '../../../apps/builder-ia/src/skills-reference.generated';
import {
  buildReferences,
  renderReference,
  type CemManifest,
} from '../../../scripts/lib/cem-reference';

import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { DsfrDataKpiGroup } from '@/components/dsfr-data-kpi-group.js';
import { DsfrDataList } from '@/components/dsfr-data-list.js';
import { DsfrDataChart } from '@/components/dsfr-data-chart.js';
import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { DsfrDataDisplay } from '@/components/dsfr-data-display.js';
import { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import { DsfrDataA11y } from '@/components/dsfr-data-a11y.js';
import { DsfrDataJoin } from '@/components/dsfr-data-join.js';
import { DsfrDataContext } from '@/components/dsfr-data-context.js';
import { DsfrDataContextFilter } from '@/components/dsfr-data-context-filter.js';
import { DsfrDataContextTags } from '@/components/dsfr-data-context-tags.js';
import { DsfrDataUnpivot } from '@/components/dsfr-data-unpivot.js';
import { DsfrDataMap } from '@/components/dsfr-data-map.js';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';
import { DsfrDataMapPopup } from '@/components/dsfr-data-map-popup.js';
import { DsfrDataMapInset } from '@/components/dsfr-data-map-inset.js';
import { DsfrDataMapTimeline } from '@/components/dsfr-data-map-timeline.js';
import { DsfrDataPodium } from '@/components/dsfr-data-podium.js';
import { DsfrDataBeacon } from '@/components/dsfr-data-beacon.js';

/** `id` est un attribut HTML standard : Lit ne le declare pas, le manifeste non plus. */
const IGNORED_ATTRS = new Set(['id']);

/** Les 23 composants `dsfr-data-*` et leur classe Lit. */
const COMPONENTS: Array<[string, typeof DsfrDataSource]> = (
  [
    ['dsfr-data-a11y', DsfrDataA11y],
    ['dsfr-data-beacon', DsfrDataBeacon],
    ['dsfr-data-chart', DsfrDataChart],
    ['dsfr-data-context', DsfrDataContext],
    ['dsfr-data-context-filter', DsfrDataContextFilter],
    ['dsfr-data-context-tags', DsfrDataContextTags],
    ['dsfr-data-display', DsfrDataDisplay],
    ['dsfr-data-facets', DsfrDataFacets],
    ['dsfr-data-join', DsfrDataJoin],
    ['dsfr-data-kpi', DsfrDataKpi],
    ['dsfr-data-kpi-group', DsfrDataKpiGroup],
    ['dsfr-data-list', DsfrDataList],
    ['dsfr-data-map', DsfrDataMap],
    ['dsfr-data-map-inset', DsfrDataMapInset],
    ['dsfr-data-map-layer', DsfrDataMapLayer],
    ['dsfr-data-map-popup', DsfrDataMapPopup],
    ['dsfr-data-map-timeline', DsfrDataMapTimeline],
    ['dsfr-data-normalize', DsfrDataNormalize],
    ['dsfr-data-podium', DsfrDataPodium],
    ['dsfr-data-query', DsfrDataQuery],
    ['dsfr-data-search', DsfrDataSearch],
    ['dsfr-data-source', DsfrDataSource],
    ['dsfr-data-unpivot', DsfrDataUnpivot],
  ] as Array<[string, unknown]>
).map(([tag, cls]) => [tag, cls as typeof DsfrDataSource]);

/**
 * Attributs HTML reels d'un composant Lit, lus dans `elementProperties`.
 * - `attribute: false` -> propriete interne (@state), pas d'attribut ;
 * - `attribute: 'x'`   -> mapping explicite ;
 * - sinon              -> Lit minuscule le nom de la propriete.
 */
function runtimeAttributes(ComponentClass: typeof DsfrDataSource): Set<string> {
  const attrs = new Set<string>();
  const props = (
    ComponentClass as unknown as { elementProperties?: Map<string, { attribute?: string | false }> }
  ).elementProperties;
  if (!props) return attrs;
  for (const [propName, options] of props) {
    if (options?.attribute === false) continue;
    attrs.add(typeof options?.attribute === 'string' ? options.attribute : propName.toLowerCase());
  }
  return attrs;
}

/** Attributs listes dans le tableau « Attributs » d'une reference generee. */
function documentedAttributes(markdown: string): Set<string> {
  const section = markdown.slice(
    markdown.indexOf('**Attributs**'),
    markdown.indexOf('**Événements**') === -1 ? undefined : markdown.indexOf('**Événements**')
  );
  const found = new Set<string>();
  for (const line of section.split('\n')) {
    const m = /^\| `([a-z0-9-]+)` \|/.exec(line);
    if (m) found.add(m[1]);
  }
  return found;
}

/** Skills de composant -> tags dont elles embarquent la reference. */
const SKILL_TAGS: Record<string, string[]> = {
  dsfrDataSource: ['dsfr-data-source'],
  dsfrDataQuery: ['dsfr-data-query'],
  dsfrDataNormalize: ['dsfr-data-normalize'],
  dsfrDataFacets: ['dsfr-data-facets'],
  dsfrDataSearch: ['dsfr-data-search'],
  dsfrDataKpi: ['dsfr-data-kpi'],
  dsfrDataKpiGroup: ['dsfr-data-kpi-group'],
  dsfrDataChart: ['dsfr-data-chart'],
  dsfrDataList: ['dsfr-data-list'],
  dsfrDataDisplay: ['dsfr-data-display'],
  dsfrDataA11y: ['dsfr-data-a11y'],
  dsfrDataMap: [
    'dsfr-data-map',
    'dsfr-data-map-layer',
    'dsfr-data-map-popup',
    'dsfr-data-map-inset',
    'dsfr-data-map-timeline',
  ],
  dsfrDataContext: ['dsfr-data-context'],
  dsfrDataContextFilter: ['dsfr-data-context-filter'],
  dsfrDataContextTags: ['dsfr-data-context-tags'],
  dsfrDataJoin: ['dsfr-data-join'],
  dsfrDataUnpivot: ['dsfr-data-unpivot'],
  dsfrDataPodium: ['dsfr-data-podium'],
  dsfrDataBeacon: ['dsfr-data-beacon'],
};

describe('reference generee des skills (#512)', () => {
  describe('(1) manifeste aligne sur les composants reels', () => {
    it.each(COMPONENTS)('<%s> : tous les attributs runtime sont dans la reference', (tag, cls) => {
      const runtime = [...runtimeAttributes(cls)].filter((a) => !IGNORED_ATTRS.has(a)).sort();
      const documented = documentedAttributes(COMPONENT_REFERENCES[tag]);
      const missing = runtime.filter((a) => !documented.has(a));
      expect(
        missing,
        `<${tag}> : attributs absents de la reference generee — relancer "npm run build:skills"`
      ).toEqual([]);
    });

    it.each(COMPONENTS)('<%s> : la reference ne documente aucun attribut fantome', (tag, cls) => {
      const runtime = runtimeAttributes(cls);
      const ghosts = [...documentedAttributes(COMPONENT_REFERENCES[tag])].filter(
        (a) => !runtime.has(a)
      );
      expect(
        ghosts,
        `<${tag}> : la reference documente des attributs qui n'existent plus — relancer "npm run build:skills"`
      ).toEqual([]);
    });
  });

  describe('(2) module genere aligne sur le manifeste commite', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(__dirname, '../../../packages/core/custom-elements.json'), 'utf-8')
    ) as CemManifest;
    const expected = buildReferences(manifest);

    it('couvre exactement les 23 composants dsfr-data-*', () => {
      expect(Object.keys(COMPONENT_REFERENCES).sort()).toEqual(COMPONENTS.map(([t]) => t).sort());
    });

    it('le fichier commite est le rendu exact du manifeste', () => {
      // Echec typique : un JSDoc modifie sans "npm run build:skills", ou une
      // edition a la main du fichier .generated.ts.
      expect(COMPONENT_REFERENCES).toEqual(expected);
    });
  });

  describe('(3) skills de composants', () => {
    it.each(Object.entries(SKILL_TAGS))(
      '%s embarque sa (ses) section(s) generee(s)',
      (id, tags) => {
        const content = SKILLS[id].content;
        for (const tag of tags) {
          expect(content, `${id} devrait embarquer la reference de <${tag}>`).toContain(
            `### Référence \`<${tag}>\` (générée depuis le code)`
          );
        }
      }
    );

    it.each(Object.entries(SKILL_TAGS))('%s garde un guide redige a la main', (id, tags) => {
      const content = SKILLS[id].content;
      const guide = content.slice(0, content.indexOf('### Référence `<'));
      // La generation ne remplace pas la pedagogie : exemples, pieges, patterns.
      expect(guide.length, `${id} ne doit pas se reduire a sa reference generee`).toBeGreaterThan(
        500
      );
      expect(tags.length).toBeGreaterThan(0);
    });

    it('documente les evenements du pipeline, absents de l’ancienne connaissance', () => {
      // Le manque constate dans #511 : « quel evenement ecouter quand la source
      // change » n'avait aucune reponse dans les skills.
      expect(SKILLS.dsfrDataChart.content).toContain('dsfr-data-loaded');
      expect(SKILLS.dsfrDataSource.content).toContain('cache-fallback');
      expect(SKILLS.dsfrDataQuery.content).toContain('dsfr-data-source-command');
      expect(SKILLS.dsfrDataKpiGroup.content).toContain('--dsfr-data-kpi-group-gap');
    });

    it.each(Object.entries(SKILL_TAGS))(
      '%s : le titre de la reference demarre bien en debut de ligne',
      (id) => {
        // Plusieurs guides se terminent par une cloture de code SANS saut de
        // ligne final : sans separateur, le titre se retrouvait colle a la
        // ligne ``` et le markdown etait casse (titre avale par le bloc code).
        for (const line of SKILLS[id].content.split('\n')) {
          if (!line.includes('### Référence `<')) continue;
          expect(line.startsWith('### Référence `<'), `ligne collee : ${line.slice(0, 60)}`).toBe(
            true
          );
        }
      }
    );

    it('signale les attributs deprecies plutot que de les presenter comme normaux', () => {
      expect(SKILLS.dsfrDataKpi.content).toContain('**DEPRECIE**');
    });
  });

  describe('rendu des cellules de tableau', () => {
    const render = (attr: Record<string, unknown>) =>
      renderReference({
        kind: 'class',
        name: 'X',
        tagName: 'dsfr-data-x',
        attributes: [{ name: 'a', type: { text: 'string' }, ...attr }],
      } as never);

    it('echappe le backslash AVANT le pipe', () => {
      // Echapper le pipe seul est incomplet : `a\|b` produirait `a\|b`, ou le
      // backslash d'origine passe pour l'echappement et la cellule se scinde.
      const md = render({ description: 'a\\|b' });
      expect(md).toContain('a\\\\\\|b');
      // Une seule barre non echappee = une colonne de plus dans la ligne.
      const row = md.split('\n').find((l) => l.startsWith('| `a`')) as string;
      expect(row.split(/(?<!\\)\|/).length).toBe(6);
    });

    it('echappe les pipes des types union sans casser la ligne', () => {
      const md = render({ type: { text: 'number | undefined' } });
      const row = md.split('\n').find((l) => l.startsWith('| `a`')) as string;
      expect(row).toContain('number \\| undefined');
      expect(row.split(/(?<!\\)\|/).length).toBe(6);
    });

    it('decode les echappements de source des valeurs par defaut', () => {
      // Le manifeste porte le TEXTE SOURCE de l'initialiseur.
      expect(render({ default: "'Rechercher\\u2026'" })).toContain("`'Rechercher…'`");
    });

    it('replie les descriptions multi-lignes sur une seule cellule', () => {
      const md = render({ description: 'ligne un\n   ligne deux' });
      expect(md).toContain('ligne un ligne deux');
    });
  });

  describe('reference()', () => {
    it('concatene plusieurs composants', () => {
      const md = reference('dsfr-data-map', 'dsfr-data-map-layer');
      expect(md).toContain('<dsfr-data-map>');
      expect(md).toContain('<dsfr-data-map-layer>');
    });

    it('echoue bruyamment sur un tag inconnu', () => {
      expect(() => reference('dsfr-data-inexistant')).toThrow(/npm run build:skills/);
    });
  });
});

/**
 * #1073 — le nœud Facettes émettait `type=`, que `dsfr-data-facets` ne
 * déclare pas : le composant lit `display` (« champ:mode | champ2:mode »).
 * La valeur choisie dans le pipeline était ignorée sans un mot.
 *
 * Ces tests tiennent trois choses : le code généré porte `display`, jamais
 * `type` ; chaque attribut émis par un nœud existe dans le custom-elements
 * manifest du composant qu'il pilote ; un code produit avant le correctif est
 * relu avec le mode voulu reporté sur `display`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';

// Mock PARTIEL : `escapeHtml` reste le vrai (#615), seul le stockage est simulé.
vi.mock('@dsfr-data/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dsfr-data/shared')>()),
  loadFromStorage: vi.fn(() => []),
  STORAGE_KEYS: { SOURCES: 'dsfr-data-sources' },
}));

import { generateCode } from '../../../apps/pipeline-helper/src/code-generator';
import { NODE_FACTORIES } from '../../../apps/pipeline-helper/src/nodes/pipeline-nodes';
import { NODE_CONFIGS } from '../../../apps/pipeline-helper/src/nodes/node-configs';
import {
  AttributeControl,
  type PipelineNodeConfig,
} from '../../../apps/pipeline-helper/src/nodes/base-node';
import { migrerAttributsFacettes, parseHtml } from '../../../apps/pipeline-helper/src/html-parser';

interface CemAttribut {
  name: string;
}
interface CemDeclaration {
  tagName?: string;
  attributes?: CemAttribut[];
}
interface CemModule {
  declarations?: CemDeclaration[];
}

const RACINE = resolve(import.meta.dirname, '../../..');
const CEM = JSON.parse(
  readFileSync(resolve(RACINE, 'packages/core/custom-elements.json'), 'utf8')
) as { modules: CemModule[] };

/** Attributs déclarés au manifeste, par balise. */
const ATTRIBUTS_CEM = new Map<string, Set<string>>();
for (const mod of CEM.modules) {
  for (const decl of mod.declarations ?? []) {
    if (!decl.tagName) continue;
    ATTRIBUTS_CEM.set(decl.tagName, new Set((decl.attributes ?? []).map((a) => a.name)));
  }
}

/** Attributs qu'un nœud émet et que son composant ne déclare pas. */
function horsManifeste(configs: readonly PipelineNodeConfig[]): string[] {
  const ecarts: string[] = [];
  for (const config of configs) {
    if (!config.component.startsWith('dsfr-data-')) continue;
    const declares = ATTRIBUTS_CEM.get(config.component);
    for (const def of config.attributes) {
      if (!declares?.has(def.name)) ecarts.push(`${config.component}:${def.name}`);
    }
  }
  return ecarts;
}

describe('pipeline-helper : le nœud Facettes émet display (#1073)', () => {
  it('le code généré porte display="…", jamais type=', () => {
    const facettes = NODE_FACTORIES.facets();
    (facettes.controls['fields'] as AttributeControl).value = 'categorie,region';
    (facettes.controls['display'] as AttributeControl).value =
      'categorie:select | region:multiselect';

    const code = generateCode([facettes], []);
    expect(code).toContain('<dsfr-data-facets');
    expect(code).toContain('display="categorie:select | region:multiselect"');
    expect(code).not.toMatch(/\stype="/);
  });

  it('un nœud Facettes laissé par défaut n’émet ni type ni display', () => {
    const code = generateCode([NODE_FACTORIES.facets()], []);
    expect(code).not.toMatch(/\stype="/);
    expect(code).not.toContain('display=');
  });

  it('le nœud Facettes n’a plus de contrôle type', () => {
    const noms = NODE_CONFIGS.facets.attributes.map((a) => a.name);
    expect(noms).toContain('display');
    expect(noms).not.toContain('type');
  });

  it('chaque attribut émis par un nœud est déclaré au manifeste de son composant', () => {
    expect(ATTRIBUTS_CEM.get('dsfr-data-facets')?.has('display')).toBe(true);
    expect(horsManifeste(Object.values(NODE_CONFIGS))).toEqual([]);
  });

  it('preuve de mutation : un attribut absent du manifeste est vu', () => {
    const mute: PipelineNodeConfig = {
      ...NODE_CONFIGS.facets,
      attributes: [{ name: 'type', label: 'Type', type: 'text' }],
    };
    expect(horsManifeste([mute])).toEqual(['dsfr-data-facets:type']);
  });
});

describe('pipeline-helper : relecture d’un code d’avant #1073', () => {
  it('reporte le mode de type= sur chaque champ de fields', () => {
    expect(migrerAttributsFacettes({ fields: 'categorie, region', type: 'select' })).toEqual({
      fields: 'categorie, region',
      display: 'categorie:select | region:select',
    });
    expect(migrerAttributsFacettes({ fields: 'annee', type: 'radio' })).toEqual({
      fields: 'annee',
      display: 'annee:radio',
    });
  });

  it('checkbox (défaut du composant) ou fields vide : type est seulement retiré', () => {
    expect(migrerAttributsFacettes({ fields: 'a,b', type: 'checkbox' })).toEqual({
      fields: 'a,b',
    });
    expect(migrerAttributsFacettes({ type: 'select' })).toEqual({});
  });

  it('un display déjà présent l’emporte', () => {
    expect(
      migrerAttributsFacettes({ fields: 'a', type: 'select', display: 'a:multiselect' })
    ).toEqual({ fields: 'a', display: 'a:multiselect' });
  });

  it('sans type, les attributs sont rendus tels quels', () => {
    const attrs = { fields: 'a', display: 'a:select' };
    expect(migrerAttributsFacettes(attrs)).toBe(attrs);
  });

  it('parseHtml relit un ancien code : le mode passe sur display, type disparaît', () => {
    const [facettes] = parseHtml(
      '<dsfr-data-facets id="facets-1" source="src" fields="categorie,region" type="select"></dsfr-data-facets>'
    );
    expect(facettes.type).toBe('facets');
    expect(facettes.attributes).toEqual({
      fields: 'categorie,region',
      display: 'categorie:select | region:select',
    });
  });

  it('parseHtml ne touche pas au type= d’un autre composant', () => {
    const [source] = parseHtml(
      '<dsfr-data-source id="src" api-type="generic" type="x"></dsfr-data-source>'
    );
    expect(source.attributes.type).toBe('x');
  });
});

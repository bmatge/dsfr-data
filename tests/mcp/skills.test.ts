/**
 * Tests du serveur MCP : matching des skills, selection des skills widget,
 * routage HTTP, parsing CLI et adressage par section (#513).
 *
 * Les fonctions sont importees DIRECTEMENT depuis `mcp-server/src/` : elles y
 * sont pures et sans dependance au SDK MCP. Elles etaient auparavant recopiees
 * dans ce fichier, ce qui testait la copie et non le code livre — une divergence
 * silencieuse etait possible (et c'est exactement le probleme que l'epic #511
 * cherche a supprimer).
 */
import { describe, it, expect } from 'vitest';
import {
  matchSkills,
  getWidgetSkillIds,
  routeMcpRequest,
  selectSection,
  sectionsOf,
  SKILL_SECTION_IDS,
} from '../../mcp-server/src/skills';
import type { Skill } from '../../mcp-server/src/skills';
import { getArg, hasFlag } from '../../mcp-server/src/cli';
import { SKILL_SECTION_IDS as BUILDER_SECTION_IDS } from '../../apps/builder-ia/src/skills-sections';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SAMPLE_SKILLS: Skill[] = [
  {
    id: 'dsfrDataSource',
    name: 'dsfr-data-source',
    description: 'Source component',
    trigger: ['source', 'fetch', 'api'],
    content: '## dsfr-data-source\nFetch data from APIs.',
  },
  {
    id: 'dsfrDataChart',
    name: 'dsfr-data-chart',
    description: 'Chart component',
    trigger: ['chart', 'graphique', 'bar', 'pie', 'line'],
    content: '## dsfr-data-chart\nRender charts.',
  },
  {
    id: 'dsfrDataKpi',
    name: 'dsfr-data-kpi',
    description: 'KPI component',
    trigger: ['kpi', 'indicateur'],
    content: '## dsfr-data-kpi\nDisplay KPIs.',
  },
  {
    id: 'dsfrDataMap',
    name: 'dsfr-data-map',
    description: 'Map component',
    trigger: ['map', 'carte', 'leaflet'],
    content: '## dsfr-data-map\nInteractive maps.',
  },
  {
    id: 'dsfrDataQuery',
    name: 'dsfr-data-query',
    description: 'Query transformer',
    trigger: ['query', 'filter', 'aggregate', 'group'],
    content: '## dsfr-data-query\nTransform data.',
  },
];

// ---------------------------------------------------------------------------
// Tests: matchSkills
// ---------------------------------------------------------------------------

describe('matchSkills', () => {
  it('matches skills by trigger keyword', () => {
    const result = matchSkills(SAMPLE_SKILLS, 'Je veux un graphique bar');
    expect(result.map((s) => s.id)).toContain('dsfrDataChart');
  });

  it('is case-insensitive', () => {
    const result = matchSkills(SAMPLE_SKILLS, 'CHART type PIE');
    expect(result.map((s) => s.id)).toContain('dsfrDataChart');
  });

  it('returns empty array when no triggers match', () => {
    const result = matchSkills(SAMPLE_SKILLS, 'hello world');
    expect(result).toHaveLength(0);
  });

  it('matches multiple skills', () => {
    const result = matchSkills(SAMPLE_SKILLS, 'source api chart bar');
    const ids = result.map((s) => s.id);
    expect(ids).toContain('dsfrDataSource');
    expect(ids).toContain('dsfrDataChart');
  });

  it('matches partial trigger in message', () => {
    const result = matchSkills(SAMPLE_SKILLS, 'filtre et aggregate les données');
    const ids = result.map((s) => s.id);
    expect(ids).toContain('dsfrDataQuery');
  });

  it('handles empty skills array', () => {
    const result = matchSkills([], 'graphique bar');
    expect(result).toHaveLength(0);
  });

  it('handles empty message', () => {
    const result = matchSkills(SAMPLE_SKILLS, '');
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: getWidgetSkillIds
// ---------------------------------------------------------------------------

describe('getWidgetSkillIds', () => {
  it('returns base skills + all extras when no chart type', () => {
    const ids = getWidgetSkillIds();
    expect(ids).toContain('compositionPatterns');
    expect(ids).toContain('dsfrDataSource');
    expect(ids).toContain('dsfrDataChart');
    expect(ids).toContain('dsfrDataKpi');
    expect(ids).toContain('dsfrDataPodium');
    expect(ids).toContain('dsfrDataList');
    expect(ids).toContain('dsfrDataQuery');
    expect(ids).toContain('chartTypes');
    expect(ids).toContain('dsfrColors');
  });

  it('adds KPI skill for kpi type', () => {
    const ids = getWidgetSkillIds('kpi');
    expect(ids).toContain('dsfrDataKpi');
    expect(ids).not.toContain('dsfrDataPodium');
  });

  it('adds podium skill for podium type', () => {
    const ids = getWidgetSkillIds('podium');
    expect(ids).toContain('dsfrDataPodium');
  });

  it('adds podium skill for classement type', () => {
    const ids = getWidgetSkillIds('classement');
    expect(ids).toContain('dsfrDataPodium');
  });

  it('adds datalist skill for datalist type', () => {
    const ids = getWidgetSkillIds('datalist');
    expect(ids).toContain('dsfrDataList');
  });

  it('adds colors for map type', () => {
    const ids = getWidgetSkillIds('map');
    expect(ids).toContain('dsfrColors');
  });

  it('routes every DSFR Chart map type (map, map-reg, map-aca, map-monde) to colors + chartTypes', () => {
    for (const type of ['map', 'map-reg', 'map-aca', 'map-monde']) {
      const ids = getWidgetSkillIds(type);
      expect(ids, `type=${type}`).toContain('dsfrColors');
      expect(ids, `type=${type}`).toContain('chartTypes');
      // Ce sont les cartes DSFR Chart : pas de skill Leaflet ici
      expect(ids, `type=${type}`).not.toContain('dsfrDataMap');
    }
  });

  it('routes Leaflet map types (carte, leaflet, map-layer) to dsfrDataMap + colors', () => {
    for (const type of ['carte', 'leaflet', 'map-layer']) {
      const ids = getWidgetSkillIds(type);
      expect(ids, `type=${type}`).toContain('dsfrDataMap');
      expect(ids, `type=${type}`).toContain('dsfrColors');
    }
  });

  it('keeps unknown chart types on the base set only', () => {
    const base = getWidgetSkillIds('inconnu');
    expect(base).not.toContain('dsfrDataKpi');
    expect(base).not.toContain('dsfrDataPodium');
    expect(base).not.toContain('dsfrDataList');
    expect(base).not.toContain('dsfrDataMap');
    expect(base).not.toContain('dsfrColors');
    expect(base).not.toContain('chartTypes');
    expect(base).toContain('dsfrDataQuery');
  });

  it('adds chartTypes for bar chart', () => {
    const ids = getWidgetSkillIds('bar');
    expect(ids).toContain('chartTypes');
  });

  it('adds chartTypes for pie chart', () => {
    const ids = getWidgetSkillIds('pie');
    expect(ids).toContain('chartTypes');
  });

  it('always includes dsfrDataQuery', () => {
    const ids = getWidgetSkillIds('kpi');
    expect(ids).toContain('dsfrDataQuery');
  });

  it('has no duplicates', () => {
    const ids = getWidgetSkillIds();
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('inclut toujours les skills de preparation des donnees (normalize + unpivot)', () => {
    // Pipeline complet : la generation doit connaitre le nettoyage et la bascule
    // des tableurs "wide", quel que soit le type de graphique.
    for (const type of [undefined, 'bar', 'kpi', 'map', 'datalist']) {
      const ids = getWidgetSkillIds(type);
      expect(ids, `type=${type}`).toContain('dsfrDataNormalize');
      expect(ids, `type=${type}`).toContain('dsfrDataUnpivot');
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: CLI argument parsing
// ---------------------------------------------------------------------------

describe('routeMcpRequest', () => {
  it('route une session connue vers le transport existant', () => {
    expect(routeMcpRequest({ sessionId: 'abc', hasSession: true, method: 'POST' })).toBe(
      'existing'
    );
  });

  it('initialise une nouvelle session sur POST sans session id', () => {
    expect(routeMcpRequest({ sessionId: undefined, hasSession: false, method: 'POST' })).toBe(
      'init'
    );
  });

  it('renvoie not-found (→ 404) pour une session id inconnue/perimee', () => {
    // Cas du serveur redemarre : la session en memoire a disparu. Doit aboutir
    // a un 404 pour que le client MCP re-initialise au lieu de rester bloque.
    expect(routeMcpRequest({ sessionId: 'stale', hasSession: false, method: 'POST' })).toBe(
      'not-found'
    );
    expect(routeMcpRequest({ sessionId: 'stale', hasSession: false, method: 'GET' })).toBe(
      'not-found'
    );
  });

  it('renvoie bad-request quand ni session ni POST d-initialisation', () => {
    expect(routeMcpRequest({ sessionId: undefined, hasSession: false, method: 'GET' })).toBe(
      'bad-request'
    );
    expect(routeMcpRequest({ sessionId: undefined, hasSession: false, method: 'DELETE' })).toBe(
      'bad-request'
    );
  });
});

describe('getArg', () => {
  it('returns value after flag', () => {
    expect(getArg(['--url', 'https://example.com'], '--url')).toBe('https://example.com');
  });

  it('returns undefined for missing flag', () => {
    expect(getArg(['--port', '3000'], '--url')).toBeUndefined();
  });

  it('returns undefined when flag has no value', () => {
    expect(getArg(['--url'], '--url')).toBeUndefined();
  });

  it('returns undefined when next arg is another flag', () => {
    expect(getArg(['--url', '--http'], '--url')).toBeUndefined();
  });

  it('handles multiple flags', () => {
    const argv = ['--url', 'https://example.com', '--port', '8080', '--http'];
    expect(getArg(argv, '--url')).toBe('https://example.com');
    expect(getArg(argv, '--port')).toBe('8080');
  });
});

describe('hasFlag', () => {
  it('returns true when flag is present', () => {
    expect(hasFlag(['--http', '--port', '3000'], '--http')).toBe(true);
  });

  it('returns false when flag is absent', () => {
    expect(hasFlag(['--port', '3000'], '--http')).toBe(false);
  });

  it('returns false for empty argv', () => {
    expect(hasFlag([], '--http')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: adressage par section (#513)
// ---------------------------------------------------------------------------

/** Skill telle que la publie une instance a jour : `sections` renseignees. */
const SECTIONED_SKILL: Skill = {
  id: 'dsfrDataChart',
  name: 'dsfr-data-chart',
  description: 'Chart component',
  trigger: ['chart'],
  content:
    '## Guide\nRôle du composant.\n\n### Exemples\nsnippet\n\n### Référence `<dsfr-data-chart>`\nattributs',
  sections: {
    guide: '## Guide\nRôle du composant.',
    reference: '### Référence `<dsfr-data-chart>`\nattributs',
    exemples: '### Exemples\nsnippet',
    pieges: '',
  },
  availableSections: ['guide', 'reference', 'exemples'],
};

/** Skill servie par une instance anterieure a #513 : pas de `sections`. */
const LEGACY_SKILL: Skill = {
  id: 'dsfrDataKpi',
  name: 'dsfr-data-kpi',
  description: 'KPI component',
  trigger: ['kpi'],
  content: '## dsfr-data-kpi\nDisplay KPIs.',
};

describe('sectionsOf', () => {
  it('renvoie les sections annoncees par skills.json', () => {
    expect(sectionsOf(SECTIONED_SKILL)).toEqual(['guide', 'reference', 'exemples']);
  });

  it('deduit les sections non vides quand availableSections manque', () => {
    const { availableSections: _omit, ...withoutList } = SECTIONED_SKILL;
    expect(sectionsOf(withoutList as Skill)).toEqual(['guide', 'reference', 'exemples']);
  });

  it('renvoie une liste vide pour une skill sans sections', () => {
    expect(sectionsOf(LEGACY_SKILL)).toEqual([]);
  });
});

describe('selectSection', () => {
  it('renvoie le contenu integral sans section (retrocompatible)', () => {
    expect(selectSection(SECTIONED_SKILL)).toBe(SECTIONED_SKILL.content);
  });

  it('renvoie le contenu integral pour "tout"', () => {
    expect(selectSection(SECTIONED_SKILL, 'tout')).toBe(SECTIONED_SKILL.content);
  });

  it('renvoie la section demandee, bien plus courte que la fiche', () => {
    const ref = selectSection(SECTIONED_SKILL, 'reference');
    expect(ref).toBe('### Référence `<dsfr-data-chart>`\nattributs');
    expect(ref.length).toBeLessThan(SECTIONED_SKILL.content.length);
  });

  it('explique quand la section est vide pour cette skill', () => {
    const out = selectSection(SECTIONED_SKILL, 'pieges');
    expect(out).toContain("n'a pas de section");
    expect(out).toContain('guide, reference, exemples');
  });

  it('explique quand la section est inconnue', () => {
    expect(selectSection(SECTIONED_SKILL, 'nawak')).toContain('inconnue');
  });

  it('retombe sur la fiche entiere face a une instance sans sections', () => {
    // Le MCP est distribue separement de l'instance dont il telecharge
    // skills.json : les deux versions coexistent en production. Une section
    // demandee a une ancienne instance doit degrader, pas echouer.
    const out = selectSection(LEGACY_SKILL, 'reference');
    expect(out).toContain('ne publie pas encore de sections');
    expect(out).toContain(LEGACY_SKILL.content);
  });

  it('expose exactement le meme vocabulaire de sections que le builder-IA', () => {
    // Miroir strict MCP <-> builder-IA : memes noms, memes semantiques. Une
    // divergence ferait qu'un meme `section` ne designe pas la meme chose des
    // deux cotes.
    expect([...SKILL_SECTION_IDS]).toEqual([...BUILDER_SECTION_IDS]);
  });
});

/**
 * Tests for MCP server skills matching and widget skill selection.
 */
import { describe, it, expect } from 'vitest';

// Import source files directly (mcp-server is outside workspace)
// We re-implement the pure functions here to test the logic
// without needing the MCP SDK dependency.

interface Skill {
  id: string;
  name: string;
  description: string;
  trigger: string[];
  content: string;
}

function matchSkills(skills: Skill[], message: string): Skill[] {
  const lower = message.toLowerCase();
  return skills.filter((s) => s.trigger.some((t) => lower.includes(t.toLowerCase())));
}

function getWidgetSkillIds(chartType?: string): string[] {
  const ids = [
    'compositionPatterns',
    'dsfrDataSource',
    // Préparation des données : nettoyage/typage et bascule des tableurs "wide".
    'dsfrDataNormalize',
    'dsfrDataUnpivot',
    'dsfrDataChart',
    'apiProviders',
    'troubleshooting',
  ];

  if (chartType) {
    const lower = chartType.toLowerCase();
    if (lower === 'kpi') ids.push('dsfrDataKpi');
    if (lower === 'podium' || lower === 'classement' || lower === 'ranking')
      ids.push('dsfrDataPodium');
    if (lower === 'datalist' || lower === 'tableau') ids.push('dsfrDataList');
    if (lower === 'map' || lower === 'map-reg') ids.push('dsfrColors');
    if (lower.includes('bar') || lower.includes('pie') || lower.includes('line'))
      ids.push('chartTypes');
  } else {
    ids.push(
      'dsfrDataKpi',
      'dsfrDataPodium',
      'dsfrDataList',
      'dsfrDataQuery',
      'chartTypes',
      'dsfrColors'
    );
  }

  if (!ids.includes('dsfrDataQuery')) ids.push('dsfrDataQuery');

  return [...new Set(ids)];
}

type McpRequestRoute = 'existing' | 'init' | 'not-found' | 'bad-request';

function routeMcpRequest(opts: {
  sessionId?: string;
  hasSession: boolean;
  method?: string;
}): McpRequestRoute {
  const { sessionId, hasSession, method } = opts;
  if (sessionId && hasSession) return 'existing';
  if (!sessionId && method === 'POST') return 'init';
  if (sessionId && !hasSession) return 'not-found';
  return 'bad-request';
}

function getArg(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) {
    return argv[idx + 1];
  }
  return undefined;
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

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

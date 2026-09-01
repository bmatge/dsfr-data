/**
 * Client skills du studio (#515) : consomme le skills.json publie (celui du
 * MCP), matche via le moteur partage (#514), degrade proprement sans reseau.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadSkills,
  resetSkillsCache,
  relevantSkillsText,
  skillText,
  type PublishedSkill,
} from '../../../apps/studio/src/ia/skills-client';

const SKILLS: PublishedSkill[] = [
  {
    id: 'dsfrDataChart',
    name: 'dsfr-data-chart',
    description: 'Graphiques DSFR',
    trigger: ['graphique', 'chart'],
    content: '## Chart — contenu complet',
    sections: { guide: '## Chart — guide', reference: '## Chart — reference' },
  },
  {
    id: 'dsfrDataKpi',
    name: 'dsfr-data-kpi',
    description: 'Indicateur chiffre',
    trigger: ['kpi', 'indicateur'],
    content: '## KPI — contenu complet',
    sections: { guide: '## KPI — guide' },
  },
];

function okFetch(payload: unknown): typeof fetch {
  return vi.fn(async () => ({ ok: true, json: async () => payload })) as unknown as typeof fetch;
}

beforeEach(() => resetSkillsCache());

describe('studio/skills-client', () => {
  it('charge et met en cache le skills.json', async () => {
    const fetcher = okFetch(SKILLS);
    const first = await loadSkills(fetcher);
    const second = await loadSkills(fetcher);
    expect(first).toHaveLength(2);
    expect(second).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('essaie le candidat suivant puis rend null si rien ne repond', async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    expect(await loadSkills(fetcher)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2); // les deux candidats d'URL
  });

  it('relevantSkillsText matche via le moteur partage et prefere la section guide', () => {
    const text = relevantSkillsText(SKILLS, 'un graphique en barres');
    expect(text).toContain('Chart — guide');
    expect(text).not.toContain('contenu complet');
  });

  it('relevantSkillsText explique quand rien ne matche', () => {
    expect(relevantSkillsText(SKILLS, 'zzz introuvable')).toContain('Aucune skill');
  });

  it('skillText sert une section, liste les sections sinon, liste les ids si id inconnu', () => {
    expect(skillText(SKILLS, 'dsfrDataChart', 'reference')).toBe('## Chart — reference');
    expect(skillText(SKILLS, 'dsfrDataChart', 'tout')).toBe('## Chart — contenu complet');
    expect(skillText(SKILLS, 'dsfrDataChart', 'pieges')).toContain('Sections disponibles');
    expect(skillText(SKILLS, 'inconnu')).toContain('dsfrDataChart, dsfrDataKpi');
  });
});

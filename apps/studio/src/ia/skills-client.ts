/**
 * Acces aux skills pour le studio, via le skills.json PUBLIE (le meme que
 * consomme le serveur MCP) : pas de duplication du monolithe skills.ts du
 * builder-IA. Le matching reutilise le moteur partage (#514).
 *
 * Degrade proprement : sans skills.json accessible, la boucle agentique
 * fonctionne quand meme (le schema d'action porte deja les contraintes).
 */

import { searchSkills } from '@dsfr-data/shared';
import type { MatchableSkill } from '@dsfr-data/shared';

export interface PublishedSkill extends MatchableSkill {
  sections?: Record<string, string>;
}

/** Candidats d'URL : deploiement (nginx sert /dist) puis dev (racine monorepo). */
const SKILLS_URL_CANDIDATES = ['/dist/skills.json', '/packages/core/dist/skills.json'];

let cache: PublishedSkill[] | null | undefined;

/** Charge (une fois) la liste des skills publiees. `null` = indisponible. */
export async function loadSkills(fetcher: typeof fetch = fetch): Promise<PublishedSkill[] | null> {
  if (cache !== undefined) return cache;
  for (const url of SKILLS_URL_CANDIDATES) {
    try {
      const res = await fetcher(url);
      if (!res.ok) continue;
      const parsed = (await res.json()) as PublishedSkill[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        cache = parsed;
        return cache;
      }
    } catch {
      // candidat suivant
    }
  }
  cache = null;
  return cache;
}

/** Pour les tests : vide le cache. */
export function resetSkillsCache(): void {
  cache = undefined;
}

/** Skills pertinentes pour un message — contenu concatene, borne. */
export function relevantSkillsText(skills: PublishedSkill[], message: string): string {
  const matches = searchSkills(skills, message, { limit: 3 });
  if (matches.length === 0) {
    return 'Aucune skill ne correspond. Essaie des mots-clés plus larges ou get_skill par id.';
  }
  return matches.map(({ skill }) => skill.sections?.guide ?? skill.content).join('\n\n---\n\n');
}

/** Une skill par id, section optionnelle (guide | reference | exemples | pieges | tout). */
export function skillText(skills: PublishedSkill[], id: string, section?: string): string {
  const skill = skills.find((s) => s.id === id);
  if (!skill) {
    return `Skill "${id}" introuvable. Ids disponibles : ${skills.map((s) => s.id).join(', ')}`;
  }
  if (!section || section === 'tout' || !skill.sections) return skill.content;
  const text = skill.sections[section];
  if (text) return text;
  const available = Object.keys(skill.sections).filter((k) => skill.sections?.[k]);
  return `Section "${section}" absente de « ${id} ». Sections disponibles : ${available.join(', ')}, tout.`;
}

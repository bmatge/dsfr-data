/**
 * Client des skills publiees, pour les assistants du socle IA commun
 * (ADR-143). Ne dans le studio (#515), promu ici par #1014 : l'assistant
 * contextuel en a besoin pour expliquer un reglage avec la fiche deja
 * maintenue.
 *
 * Source : le skills.json PUBLIE (le meme que consomme le serveur MCP) — pas
 * de duplication du monolithe skills.ts du builder-IA. Le matching reutilise
 * le moteur partage (#514).
 *
 * Degrade proprement : sans skills.json accessible, la boucle agentique
 * fonctionne quand meme (le schema des outils porte deja les contraintes).
 *
 * App-side (fetch) : exporte par `index.ts`, jamais par `lib.ts` (#319).
 */

import { searchSkills, type MatchableSkill } from './skill-matching.js';

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

// ---------------------------------------------------------------------------
// Outils de consultation, pour une boucle agentique (studio, assistant)
// ---------------------------------------------------------------------------

/**
 * `get_relevant_skills` / `get_skill`, schemas plats (decodage guide vLLM).
 * Le builder-IA garde les siens (`action-schema.ts`) : il lit le monolithe
 * `skills.ts`, pas le skills.json publie.
 */
export const OUTILS_SKILLS = [
  {
    type: 'function',
    function: {
      name: 'get_relevant_skills',
      description: 'Documentation des composants dsfr-data pertinente pour une intention donnée.',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string', description: "L'intention, en français" } },
        required: ['message'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_skill',
      description: 'Une fiche de documentation par id, section optionnelle.',
      parameters: {
        type: 'object',
        properties: {
          skill_id: { type: 'string' },
          section: { type: 'string', enum: ['guide', 'reference', 'exemples', 'pieges', 'tout'] },
        },
        required: ['skill_id'],
        additionalProperties: false,
      },
    },
  },
] as const;

export const OUTILS_SKILLS_NOMS: ReadonlySet<string> = new Set([
  'get_relevant_skills',
  'get_skill',
]);

/** Rendu d'un outil de consultation quand le skills.json est introuvable. */
export const SKILLS_INDISPONIBLES =
  'Documentation indisponible ici — appuie-toi sur le schéma des outils.';

/**
 * Execute `get_relevant_skills` ou `get_skill`. Rend toujours du texte : une
 * documentation absente est elle-meme une information pour le modele.
 */
export async function executerOutilSkill(
  name: string,
  args: Record<string, unknown>,
  charger: () => Promise<PublishedSkill[] | null> = () => loadSkills()
): Promise<string> {
  const skills = await charger();
  if (!skills) return SKILLS_INDISPONIBLES;
  if (name === 'get_relevant_skills') {
    return relevantSkillsText(skills, typeof args.message === 'string' ? args.message : '');
  }
  if (name === 'get_skill') {
    return skillText(
      skills,
      typeof args.skill_id === 'string' ? args.skill_id : '',
      typeof args.section === 'string' ? args.section : undefined
    );
  }
  return `Outil inconnu : ${name}`;
}

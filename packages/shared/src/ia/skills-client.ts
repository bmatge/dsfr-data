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

import { searchSkills, type MatchableSkill, type SkillMatch } from './skill-matching.js';

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

/** Nombre de fiches rendues au modele par `get_relevant_skills`. */
const RELEVANT_LIMIT = 3;
/** Candidates soumises au reclassement, avant de garder les premieres. */
const RERANK_POOL = 10;

/**
 * Reclassement optionnel des candidates (#514) : rend les MEMES candidates,
 * dans un autre ordre. Injecte par l'appelant, qui seul connait le gateway et
 * son jeton (`rerankSkills` de `skill-rerank.ts`).
 */
export type ReclasserSkills = (
  message: string,
  candidates: Array<SkillMatch<PublishedSkill>>
) => Promise<Array<SkillMatch<PublishedSkill>>>;

function joindre(matches: Array<SkillMatch<PublishedSkill>>): string {
  if (matches.length === 0) {
    return 'Aucune skill ne correspond. Essaie des mots-clés plus larges ou get_skill par id.';
  }
  return matches.map(({ skill }) => skill.sections?.guide ?? skill.content).join('\n\n---\n\n');
}

/** Skills pertinentes pour un message — contenu concatene, borne. */
export function relevantSkillsText(skills: PublishedSkill[], message: string): string {
  return joindre(searchSkills(skills, message, { limit: RELEVANT_LIMIT }));
}

/**
 * Variante reclassee : le scoring local retient un vivier, le reclasseur
 * l'ordonne, on garde les premieres. Le reclasseur ne peut qu'ORDONNER ce
 * que le moteur local a retenu ; sur une anomalie il rend l'ordre local.
 */
export async function relevantSkillsTextReclasse(
  skills: PublishedSkill[],
  message: string,
  reclasser: ReclasserSkills
): Promise<string> {
  const vivier = searchSkills(skills, message, { limit: RERANK_POOL });
  let ordre = vivier;
  try {
    ordre = await reclasser(message, vivier);
  } catch {
    // l'ordre local fait foi
  }
  return joindre(ordre.slice(0, RELEVANT_LIMIT));
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
  charger: () => Promise<PublishedSkill[] | null> = () => loadSkills(),
  reclasser?: ReclasserSkills
): Promise<string> {
  const skills = await charger();
  if (!skills) return SKILLS_INDISPONIBLES;
  if (name === 'get_relevant_skills') {
    const message = typeof args.message === 'string' ? args.message : '';
    return reclasser
      ? relevantSkillsTextReclasse(skills, message, reclasser)
      : relevantSkillsText(skills, message);
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

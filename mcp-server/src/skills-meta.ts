/**
 * Tampon de fraicheur des fiches servies (#733).
 *
 * POURQUOI. Rien ne deploie le VPS automatiquement : la mise en production est
 * un `ssh vps "spawn up"` manuel. Une instance peut donc servir des fiches en
 * retard de plusieurs versions sur le depot, sans que rien ne le dise. Un
 * lecteur ne peut alors pas distinguer « le code ne documente pas X » de
 * « l'instance servie est ancienne » — trois agents s'y sont trompes le meme
 * jour, dont un jusqu'a rediger un faux manque.
 *
 * OU. `dist/skills-meta.json`, ecrit a cote de `skills.json` par
 * `scripts/build-skills-json.ts`. Un fichier a part parce que `skills.json` est
 * un TABLEAU au premier niveau et que des consommateurs deployes le lisent tel
 * quel (ce serveur lui-meme, distribue separement de l'instance dont il
 * telecharge les fiches ; le client skills du studio, qui teste
 * `Array.isArray`). Le sidecar est purement additif.
 *
 * Ces fonctions sont pures et sans dependance au SDK MCP : elles sont testees
 * directement depuis `tests/mcp/`.
 */

export interface SkillsMeta {
  /** Date ISO 8601 de generation des fiches. */
  generatedAt: string;
  /** Version de la bibliotheque `dsfr-data` au moment de la generation. */
  libVersion: string;
  /** Commit court, ou « inconnu » si le build n'avait pas acces au depot. */
  commit: string;
  /** Nombre de fiches generees. Indicatif. */
  skills?: number;
}

/** Nom du sidecar, a cote de skills.json. */
export const SKILLS_META_FILENAME = 'skills-meta.json';

/**
 * Chemin du sidecar pour un `--skills-file` donne. Le fichier local n'est pas
 * toujours nomme `skills.json` : on remplace le nom, quel qu'il soit.
 */
export function metaPathFor(skillsFile: string): string {
  return skillsFile.replace(/[^/\\]+$/, SKILLS_META_FILENAME);
}

/**
 * Valide la forme lue. Une instance anterieure a #733 ne sert pas le sidecar,
 * et un document mal forme ne doit pas etre plus grave qu'un document absent :
 * dans les deux cas, `null` — le serveur dit « fraicheur inconnue » et continue.
 */
export function parseMeta(raw: unknown): SkillsMeta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.generatedAt !== 'string' || typeof o.libVersion !== 'string') return null;
  return {
    generatedAt: o.generatedAt,
    libVersion: o.libVersion,
    commit: typeof o.commit === 'string' ? o.commit : 'inconnu',
    ...(typeof o.skills === 'number' ? { skills: o.skills } : {}),
  };
}

/**
 * Une ligne lisible par un agent :
 * « lib 0.26.0, generee le 2026-09-10 (commit a4de3f9) ».
 */
export function describeMeta(meta: SkillsMeta | null): string {
  if (!meta) return 'fraicheur inconnue (instance sans tampon)';
  return `lib ${meta.libVersion}, generee le ${meta.generatedAt.slice(0, 10)} (commit ${meta.commit})`;
}

/** Champs de fraicheur rendus par `/health`. Toujours presents, `null` si inconnus. */
export function healthFields(meta: SkillsMeta | null): {
  libVersion: string | null;
  generatedAt: string | null;
  commit: string | null;
} {
  return {
    libVersion: meta?.libVersion ?? null,
    generatedAt: meta?.generatedAt ?? null,
    commit: meta?.commit ?? null,
  };
}

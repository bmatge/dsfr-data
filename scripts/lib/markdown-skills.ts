/**
 * Skills écrites à la main dans `skills/<nom>/` (SKILL.md + references/*.md),
 * à côté de la skill GÉNÉRÉE `skills/dsfr-data/` (ADR-136).
 *
 * La skill technique est générée depuis le code (`build-skills-claude.ts`) ;
 * une skill « métier » (regard éditorial, cas du banc d'essai) n'a pas de
 * source dans le code : son markdown EST la source. Pour qu'elle voyage par le
 * même canal que la skill technique — `skills.json`, donc le serveur MCP et le
 * client skills du studio —, ce module la lit et la rend sous la forme
 * `SkillLike` que `build-skills-json.ts` consomme.
 *
 * Pur (aucun accès disque dans `parseMarkdownSkill`) : le build lit les
 * fichiers, le test vérifie la forme.
 */

export interface MarkdownSkillFiles {
  /** Nom du dossier (`skills/<dir>/`), sert de repli pour `name`. */
  dir: string;
  /** Contenu de SKILL.md. */
  skillMd: string;
  /** Références, chemin relatif (`references/x.md`) → contenu, dans l'ordre du SKILL.md. */
  references: Map<string, string>;
}

export interface MarkdownSkill {
  id: string;
  name: string;
  description: string;
  trigger: string[];
  content: string;
}

/** Dossier de la skill générée, exclu de la découverte. */
export const GENERATED_SKILL_DIR = 'dsfr-data';

/** `dataviz-metier` → `datavizMetier`, même convention d'id que les skills du builder-IA. */
export function skillIdFromDir(dir: string): string {
  return dir.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Frontmatter YAML minimal : `clé: valeur` sur une ligne, sans imbrication. */
export function parseFrontmatter(md: string): { fields: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
  if (!m) return { fields: {}, body: md };
  const fields: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1');
  }
  return { fields, body: md.slice(m[0].length) };
}

/**
 * Déclencheurs : la ligne `Déclencheurs : a, b, c` du SKILL.md (même forme que
 * l'en-tête des références générées). Absente → aucun trigger, la skill ne
 * remonte que par ses signaux faibles (description, titres).
 */
export function parseTriggers(body: string): string[] {
  const m = /^>?\s*D[ée]clencheurs\s*:\s*(.+)$/m.exec(body);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((t) => t.trim().replace(/[`*]/g, ''))
    .filter(Boolean);
}

/**
 * Contenu servi par `skills.json` : le corps du SKILL.md puis chaque référence,
 * chacune sous son propre titre `## ` — un consommateur MCP n'a pas de système
 * de fichiers, la skill doit être autoportante. Les liens `references/x.md` du
 * corps sont laissés tels quels : ils restent justes pour Claude Code.
 */
export function parseMarkdownSkill(files: MarkdownSkillFiles): MarkdownSkill {
  const { fields, body } = parseFrontmatter(files.skillMd);
  const name = fields.name || files.dir;
  if (!fields.description) {
    throw new Error(`skills/${files.dir}/SKILL.md : frontmatter sans \`description\``);
  }
  const parts = [body.trim()];
  for (const [rel, content] of files.references) {
    parts.push(`\n\n---\n\n<!-- ${rel} -->\n\n${content.trim()}`);
  }
  return {
    id: skillIdFromDir(files.dir),
    name,
    description: fields.description,
    trigger: parseTriggers(body),
    content: parts.join('\n'),
  };
}

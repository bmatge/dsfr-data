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

import {
  SKILL_LEVEL_IDS,
  type SkillLevelId,
  type SkillReferencePart,
} from '../../packages/shared/src/ia/skill-levels.js';

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
  /** Corps du SKILL.md seul : l'index, lu d'emblée (#1035). */
  index: string;
  /** Références, dans l'ordre du SKILL.md, adressables une à une (#1035). */
  references: SkillReferencePart[];
  /**
   * Niveau → ids de références, lus dans la table « Choisir le niveau » du
   * SKILL.md. Absent quand le SKILL.md n'a pas de table de niveaux.
   */
  levels?: Partial<Record<SkillLevelId, string[]>>;
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
  const references = [...files.references].map(([rel, content]) => ({
    id: referenceIdFromPath(rel),
    title: firstHeading(content) || referenceIdFromPath(rel),
    content: content.trim(),
  }));
  const levels = parseLevels(
    body,
    references.map((r) => r.id)
  );
  if (levels && levels.missing.length > 0) {
    throw new Error(
      `skills/${files.dir}/SKILL.md : la table des niveaux cite des références absentes : ${levels.missing.join(', ')}`
    );
  }
  return {
    id: skillIdFromDir(files.dir),
    name,
    description: fields.description,
    trigger: parseTriggers(body),
    content: parts.join('\n'),
    index: body.trim(),
    references,
    ...(levels ? { levels: levels.levels } : {}),
  };
}

/** `references/choisir-la-forme.md` → `choisir-la-forme`. */
export function referenceIdFromPath(rel: string): string {
  const file = rel.startsWith('references/') ? rel.slice('references/'.length) : rel;
  return file.endsWith('.md') ? file.slice(0, -'.md'.length) : file;
}

/** Premier titre `# ` d'un fichier markdown, sans le `# `. */
export function firstHeading(md: string): string {
  for (const line of md.split('\n')) {
    if (line.startsWith('# ')) return line.slice(2).trim();
  }
  return '';
}

/** `**Intermédiaire**` → `intermediaire` ; `null` si ce n'est pas un niveau. */
function levelOfCell(cell: string): SkillLevelId | null {
  const word = cell
    .split('*')
    .join('')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (SKILL_LEVEL_IDS as readonly string[]).includes(word) ? (word as SkillLevelId) : null;
}

/**
 * Correspondance niveau → références, lue dans la table « Choisir le niveau »
 * du SKILL.md (#1035) : une ligne par niveau, `| **Base** | pour quoi |
 * références | ce qu'on livre |`. La table est la SEULE source : ce que Claude
 * Code lit pour choisir ses références est exactement ce que le MCP sert.
 *
 * - les références d'un niveau sont les liens `references/x.md` de la
 *   troisième cellule, dans l'ordre ;
 * - « les précédentes » dans cette cellule ajoute, en tête, les références des
 *   niveaux précédents (l'avancé reprend la base et l'intermédiaire) ;
 * - pas de table → `null` : la skill n'est pas multiniveau.
 *
 * Analyse ligne à ligne par `split` : aucune expression à retour arrière sur
 * le texte de la skill.
 */
export function parseLevels(
  body: string,
  knownRefs: readonly string[]
): { levels: Partial<Record<SkillLevelId, string[]>>; missing: string[] } | null {
  const levels: Partial<Record<SkillLevelId, string[]>> = {};
  const missing: string[] = [];
  const previous: string[] = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    // cells[0] est vide (la ligne commence par `|`).
    const level = levelOfCell(cells[1] ?? '');
    if (!level || levels[level]) continue;
    const cell = cells[3] ?? '';
    const own: string[] = [];
    for (const m of cell.matchAll(/references\/([a-z0-9-]+)\.md/g)) {
      if (!own.includes(m[1])) own.push(m[1]);
      if (!knownRefs.includes(m[1]) && !missing.includes(m[1])) missing.push(m[1]);
    }
    const inherited = cell.toLowerCase().includes('précédentes') ? previous : [];
    const refs = [...inherited, ...own.filter((r) => !inherited.includes(r))];
    levels[level] = refs;
    for (const r of refs) if (!previous.includes(r)) previous.push(r);
  }
  return Object.keys(levels).length > 0 ? { levels, missing } : null;
}

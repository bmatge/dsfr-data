/**
 * Adressage par NIVEAU et par REFERENCE d'une skill ecrite a la main (#1035).
 *
 * La skill metier `dataviz-metier` est multiniveau (base / intermediaire /
 * avance, #1034) : dans Claude Code, seul son `SKILL.md` est lu d'emblee, puis
 * une a trois references selon le niveau. Ce module rend ce decoupage
 * utilisable par les consommateurs de `skills.json` qui n'ont pas de systeme
 * de fichiers : le serveur MCP (`get_skill`, `get_relevant_skills`,
 * `list_skills`) et le client skills du socle IA (Studio, assistant).
 *
 * Arbitrage du 2026-09-24 (#1035) :
 *  - la designation passe par un SECOND parametre — `niveau` ou `reference` —,
 *    jamais par de nouvelles valeurs de `section` : le vocabulaire des sections
 *    reste ferme et petit (#513), et les quatre sections restent une partition ;
 *  - sans niveau demande, la ou la question ne peut pas etre posee (appel sans
 *    dialogue), on sert l'INTERMEDIAIRE, et on le DIT dans la reponse.
 *
 * Les donnees (`index`, `levels`, `references`) sont calculees au build depuis
 * le dossier de la skill (`scripts/lib/markdown-skills.ts`) : la table « Choisir
 * le niveau » du SKILL.md est la seule source de la correspondance niveau ->
 * references. Ce module ne relit pas le markdown, il lit une donnee deja
 * calculee.
 *
 * Securite : une `reference` n'est JAMAIS un chemin. Elle est cherchee dans la
 * liste connue (`skill.references`), par egalite de chaine ; rien n'est lu sur
 * un disque ni concatene a une URL.
 *
 * CONTRAINTE : ce fichier ne doit avoir AUCUN import. Il est copie tel quel
 * dans `mcp-server/src/skill-levels.generated.ts` par
 * `npm run build:skill-matching` (le serveur MCP est hors workspace npm).
 */

/** Niveaux adressables, du plus leger au plus complet. */
export const SKILL_LEVEL_IDS = ['base', 'intermediaire', 'avance'] as const;

export type SkillLevelId = (typeof SKILL_LEVEL_IDS)[number];

/** Niveau servi quand aucun n'est demande et que la question ne peut pas etre posee. */
export const DEFAULT_SKILL_LEVEL: SkillLevelId = 'intermediaire';

/** Libelles lisibles, pour les messages rendus au modele. */
export const SKILL_LEVEL_LABELS: Readonly<Record<SkillLevelId, string>> = {
  base: 'base',
  intermediaire: 'intermédiaire',
  avance: 'avancé',
};

/** Ce que chaque niveau livre — repris de la table du SKILL.md, en une ligne. */
const LEVEL_PURPOSE: Readonly<Record<SkillLevelId, string>> = {
  base: 'une seule dataviz (un graphique, une carte, un KPI)',
  intermediaire: 'un bloc ou une petite page de trois à six visualisations',
  avance: 'une page ou un récit complet',
};

/** Une reference de la skill (`references/<id>.md`), deja lue au build. */
export interface SkillReferencePart {
  /** Nom du fichier sans `references/` ni `.md` (ex. `choisir-la-forme`). */
  id: string;
  /** Premier titre `# ` du fichier. */
  title: string;
  content: string;
}

/** Forme minimale exploitee ici (compatible skills.json, MCP et client du socle IA). */
export interface LeveledSkill {
  id: string;
  content: string;
  /** Corps du SKILL.md : l'index, lu d'emblee. */
  index?: string;
  /** Niveau -> ids de references, dans l'ordre du SKILL.md. */
  levels?: Partial<Record<SkillLevelId, string[]>>;
  references?: SkillReferencePart[];
}

/** Ce que l'appelant demande, en plus (ou a la place) d'une section. */
export interface SkillAddress {
  section?: string;
  niveau?: string;
  reference?: string;
}

export interface SkillSelection {
  text: string;
  /** Vrai quand la demande ne peut pas etre servie (niveau/reference inconnus…). */
  error: boolean;
}

/** Vrai quand la skill publie des niveaux ET des references (instance posterieure a #1035). */
export function isLeveledSkill(skill: LeveledSkill): boolean {
  return (
    typeof skill.index === 'string' &&
    Array.isArray(skill.references) &&
    skill.references.length > 0 &&
    levelsOf(skill).length > 0
  );
}

/** Niveaux reellement publies par la skill, dans l'ordre canonique. */
export function levelsOf(skill: LeveledSkill): SkillLevelId[] {
  return SKILL_LEVEL_IDS.filter((l) => (skill.levels?.[l]?.length ?? 0) > 0);
}

/** Ids des references publiees, dans l'ordre du SKILL.md. */
export function referenceIdsOf(skill: LeveledSkill): string[] {
  return (skill.references ?? []).map((r) => r.id);
}

/**
 * Tolere `references/x.md`, `x.md`, espaces et majuscules : c'est ce qu'un
 * modele recopie d'un lien du SKILL.md. Aucune expression reguliere : que des
 * operations de chaine bornees.
 */
export function normalizeReferenceId(raw: string): string {
  let id = raw.trim().toLowerCase();
  if (id.startsWith('references/')) id = id.slice('references/'.length);
  if (id.endsWith('.md')) id = id.slice(0, -'.md'.length);
  return id;
}

function isLevelId(value: string): value is SkillLevelId {
  return (SKILL_LEVEL_IDS as readonly string[]).includes(value);
}

function refsOfLevel(skill: LeveledSkill, level: SkillLevelId): SkillReferencePart[] {
  const byId = new Map((skill.references ?? []).map((r) => [r.id, r]));
  const out: SkillReferencePart[] = [];
  for (const id of skill.levels?.[level] ?? []) {
    const ref = byId.get(id);
    if (ref) out.push(ref);
  }
  return out;
}

function renderReference(ref: SkillReferencePart): string {
  return `<!-- references/${ref.id}.md -->\n\n${ref.content.trim()}`;
}

/** La phrase qui dit comment demander autre chose — commune aux en-tetes. */
function howToAsk(skill: LeveledSkill): string {
  const levels = levelsOf(skill)
    .map((l) => `\`niveau: "${l}"\` (${LEVEL_PURPOSE[l]})`)
    .join(' ; ');
  return (
    `Autres formes : ${levels} ; une seule référence : \`reference: "<id>"\` parmi ` +
    `${referenceIdsOf(skill).join(', ')}.`
  );
}

/**
 * Le texte d'un niveau : en-tete, index (SKILL.md), puis les references du
 * niveau. `parDefaut` ajoute l'annonce exigee par l'arbitrage : le modele doit
 * dire qu'il travaille en intermediaire, et comment monter ou descendre.
 */
function renderLevel(skill: LeveledSkill, level: SkillLevelId, parDefaut: boolean): string {
  const refs = refsOfLevel(skill, level);
  const label = SKILL_LEVEL_LABELS[level];
  const head = parDefaut
    ? `[Niveau ${label} servi PAR DÉFAUT : aucun niveau n'a été demandé et la question ne peut ` +
      `pas être posée ici. Annonce-le en tête de ta réponse (« Niveau ${label} par défaut ») et ` +
      `dis comment en changer : get_skill("${skill.id}", niveau: "base") pour un seul graphique ` +
      `juste et titré, get_skill("${skill.id}", niveau: "avance") pour une page qui raconte. ` +
      `${howToAsk(skill)}]`
    : `[Niveau ${label} — ${LEVEL_PURPOSE[level]}. ${howToAsk(skill)}]`;
  const parts = [
    `<!-- ${skill.id} · niveau ${label} · références : ${refs.map((r) => r.id).join(', ')} -->`,
    head,
    (skill.index ?? '').trim(),
    ...refs.map(renderReference),
  ];
  return parts.join('\n\n---\n\n');
}

/**
 * Selection par niveau ou par reference. Rend `null` quand cette logique ne
 * s'applique pas — skill sans niveaux interrogee sans `niveau`/`reference`, ou
 * `section` explicite — : l'appelant retombe alors sur l'adressage par section
 * (#513), inchange.
 *
 * - `niveau` et `reference` ensemble, ou avec une `section` : erreur (exclusifs) ;
 * - `niveau`/`reference` sur une skill sans niveaux : erreur qui le dit ;
 * - rien de demande sur une skill a niveaux : niveau par defaut, ANNONCE.
 */
export function selectLevelOrReference(
  skill: LeveledSkill,
  address: SkillAddress = {}
): SkillSelection | null {
  const niveau = address.niveau?.trim() || undefined;
  const reference = address.reference?.trim() || undefined;
  const section = address.section?.trim() || undefined;

  if (!niveau && !reference) {
    if (section || !isLeveledSkill(skill)) return null;
    return { text: renderLevel(skill, DEFAULT_SKILL_LEVEL, true), error: false };
  }
  if (niveau && reference) {
    return {
      text: "`niveau` et `reference` sont exclusifs : demander l'un ou l'autre.",
      error: true,
    };
  }
  if (section) {
    return {
      text: "`section` ne se combine pas avec `niveau` ou `reference` : demander l'un ou l'autre.",
      error: true,
    };
  }
  if (!isLeveledSkill(skill)) {
    return {
      text:
        `La skill "${skill.id}" ne publie ni niveaux ni références (ou l'instance servie est ` +
        `antérieure à #1035). Demander la fiche sans \`niveau\` ni \`reference\`, ou une \`section\`.`,
      error: true,
    };
  }
  if (niveau) {
    if (!isLevelId(niveau) || !levelsOf(skill).includes(niveau)) {
      return {
        text: `Niveau "${niveau}" inconnu pour "${skill.id}". Niveaux valides : ${levelsOf(skill).join(', ')}.`,
        error: true,
      };
    }
    return { text: renderLevel(skill, niveau, false), error: false };
  }
  const wanted = normalizeReferenceId(reference ?? '');
  const ref = (skill.references ?? []).find((r) => r.id === wanted);
  if (!ref) {
    return {
      text:
        `Référence "${reference}" inconnue pour "${skill.id}". Références valides : ` +
        `${referenceIdsOf(skill).join(', ')}.`,
      error: true,
    };
  }
  return { text: renderReference(ref), error: false };
}

/**
 * Suffixe de `list_skills` : les niveaux (defaut signale) et les references.
 * Vide pour une skill sans niveaux.
 */
export function describeLevels(skill: LeveledSkill): string {
  if (!isLeveledSkill(skill)) return '';
  const levels = levelsOf(skill)
    .map((l) => (l === DEFAULT_SKILL_LEVEL ? `${l} (défaut)` : l))
    .join(', ');
  return `niveaux: ${levels} — références: ${referenceIdsOf(skill).join(', ')}`;
}

/**
 * Ce que `get_relevant_skills` rend pour une skill a niveaux : l'index (le
 * SKILL.md, comme Claude Code le lit d'emblee) et la liste de ce qui est
 * adressable, plutot que ~1 500 lignes de references concatenees.
 */
export function levelIndexText(skill: LeveledSkill): string {
  const levels = levelsOf(skill)
    .map((l) => {
      const refs = skill.levels?.[l] ?? [];
      const def = l === DEFAULT_SKILL_LEVEL ? ', servi par défaut' : '';
      return `- \`niveau: "${l}"\` — ${LEVEL_PURPOSE[l]}${def} : ${refs.join(', ')}`;
    })
    .join('\n');
  const refs = (skill.references ?? []).map((r) => `- \`${r.id}\` — ${r.title}`).join('\n');
  return [
    (skill.index ?? '').trim(),
    `### Adresser la skill \`${skill.id}\` (index seul ci-dessus)\n\n` +
      `get_skill("${skill.id}", niveau: "…") sert l'index puis les références du niveau ; ` +
      `get_skill("${skill.id}", reference: "…") une seule référence. Sans niveau, ` +
      `l'intermédiaire est servi et annoncé.\n\n${levels}\n\nRéférences :\n\n${refs}`,
  ].join('\n\n---\n\n');
}

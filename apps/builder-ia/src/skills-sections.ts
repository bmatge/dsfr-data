/**
 * Decoupage des skills en sections adressables (#513).
 *
 * Une skill de composant fait jusqu'a 16 Ko : le mode tools du builder-IA et le
 * `get_skill` du serveur MCP renvoyaient ce blob entier, ce qui brule des tokens
 * et des rounds (`MAX_ROUNDS = 6`) pour peu de signal. Un agent qui cherche
 * « quel evenement ecouter » n'a pas besoin des exemples de snippet.
 *
 * Le vocabulaire est volontairement PETIT et ferme (quatre sections + `tout`) :
 * c'est une enumeration que le modele choisit de maniere fiable, la ou une
 * section libre par titre de markdown (133 titres distincts sur l'ensemble des
 * skills) rendrait la selection hasardeuse.
 *
 * Invariant : le decoupage est une PARTITION du contenu. Chaque bloc de la skill
 * atterrit dans exactement une section, et `tout` renvoie le contenu d'origine
 * verbatim — les consommateurs existants ne voient aucune difference.
 */

/** Sections adressables, hors `tout`. */
export const SKILL_SECTION_IDS = ['guide', 'reference', 'exemples', 'pieges'] as const;

export type SkillSectionId = (typeof SKILL_SECTION_IDS)[number];

/** Valeur acceptee par `get_skill(section)` — `tout` = comportement historique. */
export type SkillSectionArg = SkillSectionId | 'tout';

export const SKILL_SECTION_LABELS: Record<SkillSectionId, string> = {
  guide: "Rôle du composant, position dans le pipeline, format des données, modes d'emploi",
  reference: 'Référence générée depuis le code : attributs, types, défauts, événements, slots, CSS',
  exemples: 'Exemples de code, snippets et patterns de composition',
  pieges: 'Regles imperatives, pieges connus et erreurs frequentes',
};

/**
 * Debut de la partie generee (#512). Marqueur stable : il est produit par
 * `scripts/lib/cem-reference.ts`, pas ecrit a la main.
 */
const REFERENCE_MARKER = '### Référence `<';

/** Titre de bloc -> section. L'ordre compte : `exemples` avant `pieges`. */
const CLASSIFIERS: Array<[SkillSectionId, RegExp]> = [
  ['exemples', /exemple|pattern|snippet|cas d'usage/i],
  ['pieges', /piege|erreur|important|attention|regle|limite|troubleshoot|note|contrainte/i],
];

/**
 * Decoupe un contenu markdown en blocs `[titre, texte]` sur les titres `##` et
 * `###` de premier niveau. Les titres situes DANS une cloture de code (```) sont
 * ignores : plusieurs skills montrent du markdown a l'interieur d'un exemple.
 */
function splitIntoBlocks(markdown: string): Array<{ heading: string; text: string }> {
  const lines = markdown.split('\n');
  const blocks: Array<{ heading: string; text: string }> = [];
  let heading = '';
  let buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    if (buffer.length > 0 || heading) blocks.push({ heading, text: buffer.join('\n') });
  };

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) inFence = !inFence;

    const isHeading = !inFence && /^#{2,3} /.test(line);
    if (isHeading) {
      flush();
      heading = line.replace(/^#{2,3} /, '').trim();
      buffer = [line];
    } else {
      buffer.push(line);
    }
  }
  flush();
  return blocks;
}

function classify(heading: string): SkillSectionId {
  for (const [section, re] of CLASSIFIERS) {
    if (re.test(heading)) return section;
  }
  return 'guide';
}

/**
 * Partitionne le contenu d'une skill. Les sections vides sont conservees comme
 * chaines vides — c'est l'appelant qui decide de les annoncer ou non.
 */
export function splitSkillContent(content: string): Record<SkillSectionId, string> {
  const refAt = content.indexOf(REFERENCE_MARKER);
  const reference = refAt === -1 ? '' : content.slice(refAt).trim();
  const handwritten = refAt === -1 ? content : content.slice(0, refAt);

  const buckets: Record<SkillSectionId, string[]> = {
    guide: [],
    reference: reference ? [reference] : [],
    exemples: [],
    pieges: [],
  };

  for (const block of splitIntoBlocks(handwritten)) {
    // Le preambule (avant le premier titre) presente la skill : toujours guide.
    const section = block.heading ? classify(block.heading) : 'guide';
    const text = block.text.trim();
    if (text) buckets[section].push(text);
  }

  return {
    guide: buckets.guide.join('\n\n'),
    reference: buckets.reference.join('\n\n'),
    exemples: buckets.exemples.join('\n\n'),
    pieges: buckets.pieges.join('\n\n'),
  };
}

/** Sections non vides d'un contenu, dans l'ordre de lecture. */
export function availableSections(content: string): SkillSectionId[] {
  const sections = splitSkillContent(content);
  return SKILL_SECTION_IDS.filter((id) => sections[id].length > 0);
}

/**
 * Contenu a renvoyer pour un `get_skill(section)`.
 *
 * - `tout` (ou absent) : le contenu d'origine, verbatim — retrocompatible ;
 * - section vide pour cette skill : message explicite listant ce qui existe,
 *   plutot qu'une reponse vide que l'agent interpreterait comme « rien a dire ».
 */
export function selectSkillSection(
  content: string,
  section?: string,
  sections?: Record<SkillSectionId, string>
): string {
  if (!section || section === 'tout') return content;

  const parts = sections ?? splitSkillContent(content);
  const id = section as SkillSectionId;
  if (!SKILL_SECTION_IDS.includes(id)) {
    return `Section "${section}" inconnue. Sections valides : ${[...SKILL_SECTION_IDS, 'tout'].join(', ')}.`;
  }

  const text = parts[id];
  if (!text) {
    const present = SKILL_SECTION_IDS.filter((s) => parts[s].length > 0);
    return `Cette skill n'a pas de section "${id}". Sections disponibles : ${present.join(', ')}, tout.`;
  }
  return text;
}

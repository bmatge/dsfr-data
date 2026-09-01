/* eslint-disable */
/**
 * FICHIER GENERE — NE PAS EDITER A LA MAIN.
 *
 * Copie conforme de apps/builder-ia/src/skill-matching.ts.
 * Regenerer : npm run build:skill-matching
 *
 * Le serveur MCP est hors workspace npm et publie separement : il ne peut pas
 * importer le module d'origine. Toute correction se fait dans la source, jamais
 * ici — tests/mcp/skill-matching.test.ts echoue si les deux divergent.
 */

/**
 * Moteur de matching des skills — SOURCE UNIQUE partagee (#514).
 *
 * Avant : deux moteurs divergents.
 *  - builder-IA : boucle sur les triggers + enrichissements contextuels ;
 *  - serveur MCP : `matchSkills()`, un simple `includes` sur les triggers.
 * Le MCP etait structurellement moins pertinent, et toute amelioration devait
 * etre faite deux fois.
 *
 * Ce module est la seule implementation. Il est copie tel quel dans
 * `mcp-server/src/skill-matching.generated.ts` par `npm run build:skill-matching`
 * — le serveur MCP est hors workspace npm et publie separement, il ne peut pas
 * importer d'ici. Un test verifie que la copie est a jour.
 *
 * CONTRAINTE : ce fichier ne doit avoir AUCUN import. C'est ce qui rend la
 * copie possible, et c'est verifie par le test de garde.
 *
 * Choix de conception :
 *  - le trigger reste le signal fort (10 points), teste sur une frontiere de
 *    mot : un `includes` nu declenchait `ign` au milieu de « lignes » ;
 *  - la description et les titres de sections apportent un signal FAIBLE qui
 *    ne peut faire remonter une skill que par accumulation. C'est ce qui donne
 *    au MCP le rappel qui lui manquait, sans noyer le builder-IA ;
 *  - le score est expose (`reasons`) pour que le comportement soit debuggable
 *    et testable autrement que par « la bonne skill sort en premier ».
 */

/** Forme minimale exploitee par le moteur (compatible builder-IA et MCP). */
export interface MatchableSkill {
  id: string;
  name: string;
  description: string;
  trigger: string[];
  content: string;
}

export interface SkillMatch<T extends MatchableSkill = MatchableSkill> {
  skill: T;
  score: number;
  /** Signaux ayant contribue, pour le debug et les tests. */
  reasons: string[];
}

/** Poids des signaux. Un trigger seul suffit a franchir le seuil. */
const WEIGHT_TRIGGER = 10;
/**
 * Trigger multi-mots dont tous les mots signifiants sont presents, mais
 * disperses : « colonnes en lignes » face a « colonnes ANNUELLES en lignes ».
 * L'ancien `includes` exigeait la contiguite et ratait ce cas — c'est la
 * principale source de silence du matching.
 */
const WEIGHT_TRIGGER_TOKENS = 6;
const WEIGHT_NAME = 8;
const WEIGHT_DESCRIPTION_TOKEN = 2;
const WEIGHT_HEADING_TOKEN = 1;

/**
 * Plafonds des signaux faibles. Leur somme (7) reste STRICTEMENT inferieure au
 * poids d'un trigger (10) : une skill riche en mots-cles ne peut jamais passer
 * devant une skill reellement declenchee. Ils restent au-dessus du seuil de
 * retenue (6), donc une accumulation suffit a faire remonter une skill.
 */
const CAP_DESCRIPTION = 4;
const CAP_HEADING = 3;

/**
 * Seuil de retenue. Fixe a 6 : un trigger, exact ou disperse, le franchit
 * seul. Les signaux faibles (description, titres) ne peuvent y arriver qu'en
 * s'accumulant — ils servent surtout a CLASSER. Un message hors sujet ne
 * remonte rien.
 */
export const MIN_SCORE = 6;

/**
 * Mots trop frequents pour porter du sens. Sans cette liste, « je veux un
 * graphique de données » ferait matcher toute skill dont la description
 * contient « données ».
 */
const STOPWORDS = new Set([
  'avec',
  'brut',
  'cette',
  'comme',
  'dans',
  'donne',
  'donnees',
  'elle',
  'este',
  'faire',
  'fait',
  'leur',
  'mais',
  'meme',
  'mettre',
  'mon',
  'nous',
  'plus',
  'pour',
  'quand',
  'que',
  'quel',
  'quelle',
  'sans',
  'ses',
  'son',
  'sont',
  'sur',
  'tout',
  'toute',
  'une',
  'vers',
  'veux',
  'voir',
  'vous',
]);

/**
 * Normalisation : minuscules et accents retires. Indispensable en francais —
 * « données », « donnees » et « DONNÉES » doivent matcher le meme trigger.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Neutralise les metacaracteres regex d'un trigger (`v2.1`, `data.gouv`). */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Cache des motifs compiles. Un match complet parcourt 287 triggers sur 29
 * skills : recompiler a chaque appel serait du gaspillage pur.
 */
const TRIGGER_PATTERNS = new Map<string, RegExp>();

/**
 * Un trigger doit demarrer sur une FRONTIERE DE MOT ; son suffixe reste libre.
 *
 * L'ancien test etait un `includes` nu, qui matchait au milieu des mots : le
 * trigger `ign` (les tuiles IGN) se declenchait sur « l·ign·es », et
 * `dsfr-data-map` passait devant `dsfr-data-unpivot` sur une question qui
 * parlait de deplier des colonnes. Idem `top` dans « stop ».
 *
 * Le suffixe reste libre a dessein : `carte` doit continuer de matcher
 * « cartes », et `graphique` « graphiques ». Ancrer aussi la fin (`\bx\b`)
 * casserait tous les pluriels et les formes flechies — inacceptable en
 * francais. Mesure sur un banc de 12 prompts : 5 matches supprimes, tous des
 * faux positifs ; 30 matches legitimes conserves.
 */
function triggerMatches(normalizedMessage: string, trigger: string): boolean {
  const normalized = normalize(trigger);
  if (!normalized) return false;
  let pattern = TRIGGER_PATTERNS.get(normalized);
  if (!pattern) {
    // eslint-disable-next-line security/detect-non-literal-regexp -- motif construit depuis un trigger echappe, pas depuis une entree utilisateur
    pattern = new RegExp(`\\b${escapeRegExp(normalized)}`);
    TRIGGER_PATTERNS.set(normalized, pattern);
  }
  return pattern.test(normalizedMessage);
}

/** Tokens signifiants d'un texte : >= 4 caracteres, hors mots vides. */
export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

/** Titres de sections markdown (`##` / `###`) d'un contenu de skill. */
export function headingsOf(content: string): string[] {
  const out: string[] = [];
  for (const line of content.split('\n')) {
    const m = /^#{2,3} (.+)$/.exec(line);
    if (m) out.push(m[1].trim());
  }
  return out;
}

/**
 * Score d'une skill pour un message. Retourne aussi les raisons, pour que le
 * classement soit explicable (et testable) plutot que magique.
 */
export function scoreSkill(skill: MatchableSkill, message: string): SkillMatch {
  const normalizedMessage = normalize(message);
  const messageTokens = new Set(tokenize(message));
  const reasons: string[] = [];
  let score = 0;

  // Signal fort : trigger present, ancre sur un debut de mot.
  const hits = skill.trigger.filter((t) => t && triggerMatches(normalizedMessage, t));
  if (hits.length > 0) {
    score += WEIGHT_TRIGGER * hits.length;
    reasons.push(`trigger: ${hits.join(', ')}`);
  }

  // Signal moyen : trigger multi-mots dont tous les mots signifiants sont la,
  // mais disperses. Ne s'applique qu'aux triggers non deja comptes, et
  // seulement s'ils ont au moins deux mots signifiants (un trigger d'un seul
  // mot serait deja capture par le test de sous-chaine ci-dessus).
  const scattered = skill.trigger.filter((t) => {
    if (!t || hits.includes(t)) return false;
    const parts = tokenize(t);
    return parts.length >= 2 && parts.every((w) => messageTokens.has(w));
  });
  if (scattered.length > 0) {
    score += WEIGHT_TRIGGER_TOKENS * scattered.length;
    reasons.push(`trigger disperse: ${scattered.join(', ')}`);
  }

  // Le nom du composant cite explicitement (« dsfr-data-facets »).
  if (skill.name && normalizedMessage.includes(normalize(skill.name))) {
    score += WEIGHT_NAME;
    reasons.push(`nom: ${skill.name}`);
  }

  // Signaux faibles : recouvrement lexical avec la description et les titres.
  const descHits = [...new Set(tokenize(skill.description))].filter((t) => messageTokens.has(t));
  if (descHits.length > 0) {
    const points = Math.min(descHits.length * WEIGHT_DESCRIPTION_TOKEN, CAP_DESCRIPTION);
    score += points;
    reasons.push(`description: ${descHits.join(', ')}`);
  }

  const headingTokens = new Set(headingsOf(skill.content).flatMap((h) => tokenize(h)));
  const headHits = [...headingTokens].filter((t) => messageTokens.has(t));
  if (headHits.length > 0) {
    const points = Math.min(headHits.length * WEIGHT_HEADING_TOKEN, CAP_HEADING);
    score += points;
    reasons.push(`sections: ${headHits.join(', ')}`);
  }

  return { skill, score, reasons };
}

export interface SearchOptions {
  /** Nombre maximum de resultats (defaut : illimite). */
  limit?: number;
  /** Score minimal retenu (defaut : MIN_SCORE). */
  minScore?: number;
}

/**
 * Skills pertinentes pour un message, triees par score decroissant.
 * A score egal, l'ordre de declaration est conserve (resultat deterministe).
 */
export function searchSkills<T extends MatchableSkill>(
  skills: T[],
  message: string,
  options: SearchOptions = {}
): Array<SkillMatch<T>> {
  const minScore = options.minScore ?? MIN_SCORE;
  const scored = skills
    .map((skill, index) => ({ ...(scoreSkill(skill, message) as SkillMatch<T>), index }))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ index: _index, ...m }) => m);

  return options.limit ? scored.slice(0, options.limit) : scored;
}

/** Raccourci : les skills elles-memes, sans les scores. */
export function matchSkills<T extends MatchableSkill>(
  skills: T[],
  message: string,
  options: SearchOptions = {}
): T[] {
  return searchSkills(skills, message, options).map((m) => m.skill);
}

/**
 * Correspondance sans modèle : phrase de l'usager → repère d'interface
 * (#1012, epic #993, ADR-143 §6).
 *
 * « Afficher les POI dans une fiche » doit mener au contrôle « Comportement au
 * clic » du builder carto sans appel à Albert : le guidage simple fonctionne
 * donc sans clé. Albert n'intervient qu'en secours, quand rien ne correspond
 * clairement (#1014).
 *
 * Le moteur est celui des fiches skills (`skill-matching.ts`), réutilisé tel
 * quel : ce module PROJETTE le registre généré en `MatchableSkill[]`, puis
 * appelle `searchSkills()`. `skill-matching.ts` n'est pas modifié. Il est copié
 * dans le serveur MCP et ne doit contenir aucun import.
 *
 * Projection d'un repère :
 *  - `name` : le libellé que l'usager lit (« Comportement au clic »). Cité en
 *    entier dans la phrase, il rapporte 8 points ;
 *  - `trigger` (signal fort, 10 points) : les synonymes de `reperes.config.ts`,
 *    le nom composé de chaque attribut piloté (`popup-fields` ; un nom d'un
 *    seul mot comme `mode` reste un signal faible), et les titres des fiches
 *    skills liées par `data-attribut` quand ils sont de la forme
 *    « <tag> — <titre> » (« dsfr-data-map-popup — Affichage au clic ») ;
 *  - `description` (signal faible) : la description de l'attribut tirée du
 *    manifeste, et les libellés des zones englobantes ;
 *  - `content` (signal faible) : les autres titres de fiche qui citent le tag.
 *
 * Les fiches sont INJECTÉES (`options.fiches`) : le module ne connaît pas les
 * skills du builder IA, qui sont côté app.
 *
 * Sécurité : la phrase de l'usager est une entrée externe. Ce module ne lui
 * applique aucune regex ; il la passe telle quelle à `searchSkills()`, dont les
 * seules regex sont littérales et testées caractère par caractère.
 *
 * Côté app : exporté par `@dsfr-data/shared`, jamais par
 * `@dsfr-data/shared/lib` (frontière #319).
 */

import type { GenreRepere, RegistreReperes, Repere } from '../ui/reperes-types.js';
import { chemin, SEPARATEUR_CHEMIN } from '../ui/reperage.js';
import {
  headingsOf,
  MIN_SCORE,
  normalize,
  searchSkills,
  type MatchableSkill,
} from './skill-matching.js';

/** Score minimal retenu : celui des fiches, un trigger seul le franchit. */
export const SEUIL_REPERE = MIN_SCORE;

/**
 * Écart sous lequel deux repères sont jugés aussi plausibles l'un que l'autre.
 * Fixé à 3 : un trigger de plus (10) ou le libellé cité (8) départage toujours ;
 * un seul mot commun de description (2) ne départage pas, deux mots ou un mot
 * et un titre de section (3 et plus) départagent. Mesuré sur le registre carto :
 * « changer le fond de carte » donne 13 à « Fond de carte » et 10 au bouton
 * « Carte », qu'un écart de 4 déclarait à tort ambigus.
 */
export const ECART_AMBIGUITE = 3;

/** Nombre maximal de repères proposés en cas d'ambiguïté. */
export const MAX_CANDIDATS = 3;

export interface OptionsCorrespondance {
  /** Fiches skills, liées aux repères par `data-attribut` (ex. `SKILLS` du builder IA). */
  readonly fiches?: readonly MatchableSkill[];
  /** Score minimal (défaut : `SEUIL_REPERE`). */
  readonly seuil?: number;
  /** Écart d'ambiguïté (défaut : `ECART_AMBIGUITE`). */
  readonly ecart?: number;
  /** Candidats proposés au plus en cas d'ambiguïté (défaut : `MAX_CANDIDATS`). */
  readonly max?: number;
  /** Genres de repères candidats (défaut : contrôles et zones). */
  readonly genres?: readonly GenreRepere[];
}

/** Un repère projeté pour le moteur de correspondance. */
export interface RepereMatchable extends MatchableSkill {
  readonly repere: Repere;
}

/** Un repère retenu, avec son score et les raisons qui l'expliquent. */
export interface CorrespondanceRepere {
  readonly repere: Repere;
  readonly score: number;
  /** Signaux ayant contribué (`trigger: fiche`, `nom: …`), pour le débogage et les tests. */
  readonly raisons: readonly string[];
  /** Libellés zone → contrôle (« Éléments », « Au clic sur un élément », …). */
  readonly chemin: readonly string[];
}

export type ResultatCorrespondance =
  | { readonly statut: 'aucun'; readonly candidats: readonly [] }
  | {
      readonly statut: 'trouve';
      readonly repere: CorrespondanceRepere;
      readonly candidats: readonly CorrespondanceRepere[];
    }
  | { readonly statut: 'ambigu'; readonly candidats: readonly CorrespondanceRepere[] };

/** Caractère qui prolonge un nom de balise : `dsfr-data-map` n'est pas cité par `dsfr-data-map-popup`. */
function prolongeTag(c: string | undefined): boolean {
  if (c === undefined) return false;
  const code = c.charCodeAt(0);
  return (
    c === '-' ||
    c === '_' ||
    (code >= 48 && code <= 57) ||
    (code >= 97 && code <= 122) ||
    (code >= 65 && code <= 90)
  );
}

/** Position de `tag` cité en entier dans `texte` (minuscules), ou -1. */
function positionTag(texte: string, tag: string): number {
  let from = 0;
  for (;;) {
    const at = texte.indexOf(tag, from);
    if (at === -1) return -1;
    if (!prolongeTag(texte[at - 1]) && !prolongeTag(texte[at + tag.length])) return at;
    from = at + 1;
  }
}

/**
 * Titres de fiche liés à un tag : le titre d'une section « <tag> — <titre> »
 * devient un trigger, tout autre titre citant le tag reste un signal faible.
 */
function titresLies(
  fiches: readonly MatchableSkill[],
  tag: string
): { triggers: string[]; autres: string[] } {
  const triggers: string[] = [];
  const autres: string[] = [];
  const cible = tag.toLowerCase();
  for (const fiche of fiches) {
    for (const titre of headingsOf(fiche.content)) {
      const at = positionTag(titre.toLowerCase(), cible);
      if (at === -1) continue;
      let reste = titre.slice(at + cible.length).trim();
      const premier = reste.charAt(0);
      if (at === 0 && (premier === '—' || premier === '–' || premier === '-' || premier === ':')) {
        reste = reste.slice(1).trim();
        if (reste) {
          triggers.push(reste);
          continue;
        }
      }
      autres.push(titre);
    }
  }
  return { triggers, autres };
}

function unique(valeurs: readonly string[]): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const v of valeurs) {
    const cle = normalize(v).trim();
    if (!cle || vus.has(cle)) continue;
    vus.add(cle);
    out.push(v);
  }
  return out;
}

/**
 * Projette le registre en `MatchableSkill[]`, dans l'ordre du registre (qui
 * départage les égalités de score : le résultat est déterministe).
 */
export function projeterReperes(
  registre: RegistreReperes,
  options: Pick<OptionsCorrespondance, 'fiches' | 'genres'> = {}
): RepereMatchable[] {
  const fiches = options.fiches ?? [];
  const genres = options.genres ?? ['controle', 'zone'];
  const libelleParId = new Map(registre.reperes.map((r) => [r.id, r.libelle]));

  return registre.reperes
    .filter((r) => genres.includes(r.genre))
    .map((repere) => {
      const triggers: string[] = [...repere.synonymes];
      const description: string[] = [];
      const titres: string[] = [];
      for (const attribut of repere.attributs) {
        // Un nom composé (`popup-fields`, `max-items`) est distinctif : trigger.
        // Un nom d'un seul mot (`mode`, `type`, `color`, `name`) est un mot
        // courant : en trigger, « mode sombre » mènerait au mode de la popup.
        // Il reste un signal faible.
        if (attribut.nom.includes('-')) triggers.push(attribut.nom);
        else description.push(attribut.nom);
        description.push(attribut.description);
        const lies = titresLies(fiches, attribut.tag);
        triggers.push(...lies.triggers);
        titres.push(...lies.autres);
      }
      // Libellés des zones englobantes (hors le repère lui-même).
      const segments = repere.id.split('.');
      for (let n = 2; n < segments.length; n++) {
        const libelle = libelleParId.get(segments.slice(0, n).join('.'));
        if (libelle) description.push(libelle);
      }
      return {
        id: repere.id,
        name: repere.libelle,
        description: description.join(' '),
        trigger: unique(triggers),
        content: unique(titres)
          .map((t) => `### ${t}`)
          .join('\n'),
        repere,
      };
    });
}

/**
 * Repère(s) correspondant à la phrase de l'usager.
 *
 *  - `aucun` : rien ne franchit le seuil (phrase hors sujet) ;
 *  - `trouve` : un repère devance les autres d'au moins `ecart` points ;
 *  - `ambigu` : 2 à `max` repères à moins de `ecart` points du premier.
 */
export function trouverRepere(
  registre: RegistreReperes,
  phrase: string,
  options: OptionsCorrespondance = {}
): ResultatCorrespondance {
  const seuil = options.seuil ?? SEUIL_REPERE;
  const ecart = options.ecart ?? ECART_AMBIGUITE;
  const max = Math.max(2, options.max ?? MAX_CANDIDATS);

  const matches = searchSkills(projeterReperes(registre, options), phrase, { minScore: seuil });
  if (matches.length === 0) return { statut: 'aucun', candidats: [] };

  const retenus: CorrespondanceRepere[] = matches.map((m) => ({
    repere: m.skill.repere,
    score: m.score,
    raisons: m.reasons,
    chemin: chemin(registre, m.skill.repere.id),
  }));

  const premier = retenus[0];
  const proches = retenus.filter((c) => premier.score - c.score < ecart).slice(0, max);
  if (proches.length === 1) return { statut: 'trouve', repere: premier, candidats: [premier] };
  return { statut: 'ambigu', candidats: proches };
}

/**
 * Réponse déterministe, sans modèle : le chemin à suivre
 * (« Éléments › Au clic sur un élément › Comportement au clic »), ou les
 * repères entre lesquels choisir.
 */
export function formulerCorrespondance(resultat: ResultatCorrespondance): string {
  const cheminDe = (c: CorrespondanceRepere): string =>
    (c.chemin.length > 0 ? c.chemin : [c.repere.libelle]).join(SEPARATEUR_CHEMIN);
  switch (resultat.statut) {
    case 'aucun':
      return 'Aucun réglage de cette interface ne correspond clairement à votre demande.';
    case 'trouve':
      return `C'est ici : ${cheminDe(resultat.repere)}.`;
    case 'ambigu':
      return `Plusieurs réglages peuvent correspondre : ${resultat.candidats
        .map(cheminDe)
        .join(' ; ')}.`;
  }
}

/**
 * Construction du system prompt selon le mode d'exploitation des skills.
 *
 * - legacy    : prompt actuel verbatim (tout empile). Comportement identique
 *               quand le gateway ne supporte ni json_schema ni tools.
 * - structured: prompt court + note "reponds par un seul objet action" +
 *               dataContext + skill createChart (central, petit). Le contrat de
 *               sortie est garanti par response_format json_schema, donc on
 *               supprime la liste complete des skills, buildSkillsContext et le
 *               gros actionReminder en MAJUSCULES.
 * - tools     : prompt court + consigne d'aller chercher les skills a la demande
 *               (get_relevant_skills / get_skill) + dataContext + skill
 *               createChart. C'est le mode incremental/agentique (mirroir MCP).
 *
 * Sortir les chaines de prompt de chat.ts permet de les tester et de les faire
 * evoluer sans toucher a la logique d'appel.
 */

import { SKILLS } from '../skills.js';

export type PromptMode = 'legacy' | 'structured' | 'tools';

export interface BuildSystemPromptOptions {
  mode: PromptMode;
  /** Preambule de role — le textarea utilisateur (config.systemPrompt). */
  basePrompt: string;
  /** Contexte de données (noms de champs, exemple d'enregistrement). Non fetchable. */
  dataContext: string;
  /** Liste des skills disponibles — utilise uniquement en mode legacy. */
  skillsList?: string;
  /** Skills injectees integralement — utilise uniquement en mode legacy. */
  skillsContext?: string;
  /** Rappel de format — utilise uniquement en mode legacy. */
  actionReminder?: string;
}

/** Skill createChart : centrale et petite, gardee dans tous les modes avances. */
const CREATE_CHART_SKILL = SKILLS.createChartAction?.content ?? '';

const STRUCTURED_NOTE = `

---
FORMAT DE REPONSE : reponds par UN SEUL objet action conforme au schema impose.
Champs : "action" ("createChart" | "reloadData" | "resetChart"), "message" (phrase
courte en francais affichee a l'utilisateur), et selon l'action "config" (createChart)
ou "query" (reloadData). N'invente jamais de nom de champ : utilise EXACTEMENT ceux du
contexte de données. Pour changer la couleur/palette d'un graphique existant, regenere
un createChart avec la palette voulue.`;

const TOOLS_NOTE = `

---
TU ES UN AGENT. Ne devine pas : OBSERVE la donnee reelle, puis agis, puis verifie.
Methode a suivre a chaque demande de visualisation :

1. COMPRENDRE L'INTENTION. Reformule mentalement ce que veut l'utilisateur (quelle
   mesure, quelle dimension, quel angle). Si la demande est vraiment ambigue ou
   qu'aucun champ ne convient, REPONDS EN TEXTE par UNE question de clarification
   (n'appelle aucun outil) plutot que d'inventer.
2. OBSERVER LES DONNEES. Appelle inspect_data pour voir les colonnes, leurs types
   et leurs valeurs. Utilise distinct_values(field) avant d'ecrire un filtre, et
   count_where(where) pour verifier qu'un filtre ne renvoie pas 0 ligne. N'invente
   JAMAIS un nom de champ ni une valeur : prends-les dans la donnee observee.
3. SE DOCUMENTER. Si tu as besoin du detail d'un composant, d'un type de graphique
   ou d'une syntaxe, appelle get_relevant_skills (mots-clés) ou get_skill (par id).
   Sur get_skill, precise "section" pour ne charger que l'utile : "reference" pour
   les attributs / evenements / slots / variables CSS, "exemples" pour du code,
   "guide" pour le role et le pipeline, "pieges" pour les regles a respecter.
   Sans "section", tu recois la fiche entiere — parfois 16 Ko pour une question
   qui tient en une section.
   Le potentiel va bien au-dela du bar chart : KPI, carte, tableau (datalist),
   podium, filtres… choisis le type le PLUS pertinent pour l'intention.
   MULTI-SERIES : pour tracer plusieurs colonnes numeriques sur le meme graphique
   (ex. "les 3 séries du jeu"), mets la 1re dans "valueField" et les suivantes dans
   "valueFields" (liste). Ex. 3 séries : valueField="serieA", valueFields=["serieB","serieC"].
4. VERIFIER. Appelle render_preview(config) pour obtenir un diagnostic AVANT de
   finaliser. S'il signale un probleme (champ absent, 0 ligne, valueField non
   numerique), CORRIGE et re-teste. Ne finalise jamais un graphique vide ou faux.
5. FINALISER. Quand le diagnostic est bon, appelle create_chart (ou reload_data /
   reset_chart). Chaque outil final prend un champ "message" (phrase courte en
   francais expliquant ce que tu as fait et pourquoi).

Tu as droit a plusieurs tours d'outils : prends-les. Un create_chart casse te sera
renvoye avec son diagnostic pour que tu te corriges.

REGLES DE SORTIE (importantes) :
- Pour AGIR, appelle l'OUTIL (create_chart / reload_data / reset_chart). N'ECRIS
  JAMAIS l'action en JSON dans ta reponse texte — le JSON ecrit n'est pas execute,
  il s'affiche tel quel et casse l'experience. Le JSON passe par l'appel d'outil.
- Ta reponse texte est COURTE et destinee a l'humain : une phrase qui explique ce
  que tu fais. Ne recopie pas la config, ne mets pas de gros tableaux sauf si on te
  demande explicitement des idees/explications.`;

/**
 * Assemble le system prompt pour le mode demande.
 *
 * En mode legacy l'ordre de concatenation reproduit exactement l'assemblage
 * historique de chat.ts (basePrompt + skillsList + dataContext + skillsContext
 * + actionReminder) pour garantir l'absence de regression.
 */
export function buildSystemPrompt(opts: BuildSystemPromptOptions): string {
  const { mode, basePrompt, dataContext } = opts;

  if (mode === 'legacy') {
    return (
      basePrompt +
      `\n\nSKILLS DISPONIBLES (seront injectes si pertinents):\n${opts.skillsList ?? ''}` +
      dataContext +
      (opts.skillsContext ?? '') +
      (opts.actionReminder ?? '')
    );
  }

  const note = mode === 'tools' ? TOOLS_NOTE : STRUCTURED_NOTE;
  return (
    basePrompt +
    note +
    dataContext +
    '\n\n---\nReference (action createChart) :\n' +
    CREATE_CHART_SKILL
  );
}

export interface FewShotMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Exemples few-shot (tours user/assistant prefixes a la conversation).
 *
 * Fournis uniquement pour le mode `structured` : l'assistant y demontre la
 * sortie attendue (objet action JSON avec message). En mode `tools`, demontrer
 * un appel d'outil necessiterait une sequence assistant(tool_calls)+tool(result)
 * fragile a injecter — la consigne textuelle de TOOLS_NOTE est preferee.
 */
export function buildFewShot(mode: PromptMode): FewShotMessage[] {
  if (mode !== 'structured') return [];
  return [
    {
      role: 'user',
      content: 'Un diagramme en barres de la population par region, top 5.',
    },
    {
      role: 'assistant',
      content: JSON.stringify({
        action: 'createChart',
        message: 'Voici le top 5 des regions par population.',
        config: {
          type: 'bar',
          labelField: 'region',
          valueField: 'population',
          aggregation: 'sum',
          limit: 5,
          sortOrder: 'desc',
          title: 'Top 5 regions par population',
        },
      }),
    },
  ];
}

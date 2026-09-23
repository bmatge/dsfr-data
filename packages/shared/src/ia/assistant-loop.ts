/**
 * Tour Albert de l'assistant contextuel (#1014, epic #993, ADR-143 §6).
 *
 * `creerRepondreIA()` rend la fonction `repondre` que `mountAssistant()`
 * (ui/mount-assistant.ts) appelle en SECOURS, quand la correspondance locale
 * (`trouverRepere`, #1012) n'a rien trouvé de clair. L'assistant MONTRE
 * l'interface, il n'écrit rien : le studio écrit (ADR-143).
 *
 * Composition de `runAgentLoop` (#1004) :
 *   - `montrer(id)` et `planifier(etapes)`, TERMINAUX, à enum FERMÉ sur les
 *     identifiants du registre (décodage guidé vLLM, schéma plat) : le modèle
 *     ne produit jamais de sélecteur, et un id hors enum est refusé ici, sans
 *     nouvel appel au modèle ;
 *   - les outils de diagnostic (`DIAGNOSTIC_TOOLS`), si l'app en fournit le
 *     contexte ;
 *   - `get_relevant_skills` / `get_skill` sur le skills.json publié
 *     (`skills-client.ts`), pour expliquer un réglage avec la fiche maintenue ;
 *   - `MAX_ROUNDS_ASSISTANT` = 4 (sobriété : le jeton Albert est partagé), le
 *     dernier tour sans outils.
 *
 * Sans `capacites.toolCalling`, un seul appel en mode texte : le modèle cite
 * l'identifiant du réglage, et la correspondance locale relit sa réponse.
 *
 * Masquage : les constats partent vers un service externe. Leur preuve est
 * masquée selon `redactValues` (formaterConstats), et tout jeton en paramètre
 * d'URL devient `***` (masquerUrl) — dans le prompt comme dans le rendu des
 * outils de diagnostic.
 *
 * Plan pas à pas : `planifier` rend une suite de repères ; `suivrePlan()`
 * montre la première étape et avance sur `onEtatChange` de l'adaptateur (le
 * « etat-change » de l'app), sans bouton « suivant ».
 *
 * Transport : `transport.ts` uniquement (`resolveTransport`, injectable).
 *
 * App-side (DOM, fetch) : exporté par `index.ts`, jamais par `lib.ts` (#319).
 */

import type { Constat } from '../debug/constats.js';
import { masquerUrl } from '../debug/journal.js';
import type {
  ContexteAssistant,
  MessageAssistant,
  MountedAssistant,
  Reponse,
} from '../ui/mount-assistant.js';
import {
  chemin,
  indexerReperes,
  montrer as montrerRepere,
  prerequisManquants,
  SEPARATEUR_CHEMIN,
  type AdaptateurReperage,
  type ModeReperage,
  type OptionsMontrer,
  type ResultatMontrer,
} from '../ui/reperage.js';
import type { PrerequisParId, RegistreReperes } from '../ui/reperes-types.js';
import { runAgentLoop } from './agent-loop.js';
import type { AlbertCapabilities } from './albert-capabilities.js';
import type { ChatMessage, PostChat } from './chat-types.js';
import {
  DIAGNOSTIC_TOOLS,
  DIAGNOSTIC_TOOL_NAMES,
  REPEATABLE_TOOLS,
  formaterConstats,
  humanizeDiagnosticStep,
  runDiagnosticTool,
  type DiagnosticContext,
} from './diagnostic-tools.js';
import { formulerCorrespondance, trouverRepere } from './reperes-matching.js';
import type { MatchableSkill } from './skill-matching.js';
import {
  OUTILS_SKILLS,
  OUTILS_SKILLS_NOMS,
  executerOutilSkill,
  loadSkills,
  type PublishedSkill,
} from './skills-client.js';
import { resolveTransport } from './transport.js';

// ─── Constantes ────────────────────────────────────────────────────────

/** Appels au modèle par question, dernier tour sans outils compris. */
export const MAX_ROUNDS_ASSISTANT = 4;
/** Étapes d'un plan, au plus. */
export const MAX_ETAPES_PLAN = 6;
/** Messages antérieurs gardés dans la conversation envoyée. */
export const HISTORIQUE_ASSISTANT = 8;

const OUTILS_TERMINAUX: ReadonlySet<string> = new Set(['montrer', 'planifier']);

/** Ajouté à la réponse quand le modèle désigne un réglage absent du registre. */
export const REPERE_REFUSE = "Le réglage proposé n'existe pas dans cette interface.";

// ─── Contrat ───────────────────────────────────────────────────────────

/** Transport tel que `resolveTransport()` le rend (injectable pour les tests). */
export interface TransportAssistant {
  mode: 'server' | 'user' | 'none';
  model: string;
  post: PostChat;
  capacites: Pick<AlbertCapabilities, 'toolCalling'>;
}

/** Ce qui paramètre le prompt système, propre à chaque app. */
export interface ProfilAssistant<Etat = unknown> {
  /** Nom lisible de l'app : « le builder carto ». */
  nom: string;
  /** Ce que fait l'app, en une phrase. */
  description?: string;
  /** Chemin des panneaux, dans l'ordre où l'usager les parcourt. */
  panneaux?: readonly string[];
  /** Le `PREREQUIS` de l'app : message et repère qui lève chaque préalable. */
  prerequis?: PrerequisParId<Etat>;
  /** Consignes propres à l'app, ajoutées telles quelles. */
  consignes?: string;
}

export interface OptionsRepondreIA<Etat = unknown> {
  registre: RegistreReperes;
  profil: ProfilAssistant<Etat>;
  /**
   * Adaptateur de l'app : présent, un plan avance seul sur ses changements
   * d'état (`onEtatChange`). Absent, les étapes sont proposées en boutons.
   */
  adaptateur?: AdaptateurReperage<Etat>;
  /** Défaut : `resolveTransport()`. */
  transport?: () => Promise<TransportAssistant>;
  /** Accès à l'aperçu : présent, les outils de diagnostic sont proposés. */
  diagnostic?: DiagnosticContext;
  /**
   * Masquer les valeurs de données (preuves des constats). Défaut :
   * `diagnostic.redactValues()`, sinon `true` — sans avis de l'app, rien ne
   * sort.
   */
  masquer?: () => boolean;
  /** Skills publiées ; `false` : pas d'outils de consultation. Défaut : `loadSkills`. */
  skills?: false | (() => Promise<PublishedSkill[] | null>);
  /** Fiches passées à la correspondance locale qui relit une réponse en texte. */
  fiches?: readonly MatchableSkill[];
  /** Défaut : `MAX_ROUNDS_ASSISTANT`. */
  maxRounds?: number;
  /** Étapes franchies, humanisées. */
  onProgress?: (steps: string[]) => void;
  /** Suivi du plan pas à pas (une étape montrée, le plan fini). */
  onEtape?: OptionsPlan<Etat>['onEtape'];
  onFinPlan?: OptionsPlan<Etat>['onFin'];
  /** Remplace `montrer()` (tests). */
  montrer?: OptionsPlan<Etat>['montrer'];
}

// ─── Outils ────────────────────────────────────────────────────────────

/** Identifiants proposés au modèle : tout le registre, dans son ordre. */
export function idsDuRegistre(registre: RegistreReperes): string[] {
  return registre.reperes.map((r) => r.id);
}

/** `montrer(id, message)` : `id` à enum FERMÉ sur le registre. */
export function outilMontrer(ids: readonly string[]) {
  return {
    type: 'function',
    function: {
      name: 'montrer',
      description:
        "Met en évidence UN réglage de l'interface, désigné par son identifiant de repère, et termine la réponse.",
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: [...ids], description: 'Identifiant du repère' },
          message: {
            type: 'string',
            description: "Réponse à l'usager : texte brut, deux ou trois phrases.",
          },
        },
        required: ['id', 'message'],
        additionalProperties: false,
      },
    },
  } as const;
}

/** `planifier(etapes, message)` : suite de repères, chacun dans l'enum du registre. */
export function outilPlanifier(ids: readonly string[]) {
  return {
    type: 'function',
    function: {
      name: 'planifier',
      description:
        "Guide l'usager pas à pas : une suite de réglages à faire dans l'ordre. L'interface avance seule quand l'usager a fait chaque étape. Termine la réponse.",
      parameters: {
        type: 'object',
        properties: {
          etapes: {
            type: 'array',
            items: { type: 'string', enum: [...ids] },
            minItems: 2,
            maxItems: MAX_ETAPES_PLAN,
            description: 'Identifiants des repères, dans l’ordre',
          },
          message: {
            type: 'string',
            description: "Réponse à l'usager : texte brut, deux ou trois phrases.",
          },
        },
        required: ['etapes', 'message'],
        additionalProperties: false,
      },
    },
  } as const;
}

function decrireEtape(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'montrer':
      return 'Je vous montre le réglage…';
    case 'planifier':
      return 'Je prépare les étapes…';
    case 'get_relevant_skills':
      return 'Je consulte la documentation…';
    case 'get_skill':
      return `Je consulte la fiche « ${String(args.skill_id ?? '')} »…`;
    default:
      return humanizeDiagnosticStep(name, args) ?? `Outil : ${name}`;
  }
}

// ─── Masquage ──────────────────────────────────────────────────────────

/**
 * Constats prêts à partir vers le modèle : preuve masquée sous
 * `redactValues`, jetons d'URL remplacés dans tous les cas.
 */
export function constatsPourModele(constats: readonly Constat[], redactValues: boolean): string {
  return masquerUrl(formaterConstats(constats, { redactValues }));
}

// ─── Prompt ────────────────────────────────────────────────────────────

export interface OptionsPrompt {
  /** Mode outils (`montrer`, `planifier`) ou mode texte. */
  outils: boolean;
  diagnostic: boolean;
  skills: boolean;
  /** Constats déjà masqués (`constatsPourModele`), ou vide. */
  constats: string;
}

/** Prompt système de l'assistant, paramétré par le profil de l'app. */
export function construirePromptAssistant<Etat>(
  registre: RegistreReperes,
  profil: ProfilAssistant<Etat>,
  options: OptionsPrompt
): string {
  const lignes: string[] = [
    `Tu es l'assistant de ${profil.nom}, une interface de l'État conforme au DSFR.`,
  ];
  if (profil.description) lignes.push(profil.description);
  lignes.push(
    '',
    "Ton rôle : MONTRER à l'usager où se trouve le réglage qui répond à sa question. Tu ne modifies rien toi-même."
  );
  if (profil.panneaux && profil.panneaux.length > 0) {
    lignes.push('', `Panneaux, dans l'ordre : ${profil.panneaux.join(SEPARATEUR_CHEMIN)}.`);
  }

  lignes.push('', 'Réglages de l’interface (identifiant — chemin) :');
  for (const r of registre.reperes) {
    lignes.push(`- ${r.id} — ${chemin(registre, r.id).join(SEPARATEUR_CHEMIN) || r.libelle}`);
  }

  const prerequis = Object.entries(profil.prerequis ?? {});
  if (prerequis.length > 0) {
    lignes.push('', 'Préalables : si un préalable manque, commence par le réglage qui le lève.');
    for (const [nom, regle] of prerequis) {
      lignes.push(`- ${nom} : ${regle.message} Réglage qui le lève : ${regle.repereQuiLeve}.`);
    }
  }

  if (options.constats) {
    lignes.push('', 'Constats relevés sur l’aperçu :', options.constats);
  }

  lignes.push('', 'Règles :');
  lignes.push('- Réponds en français, en texte brut, en deux ou trois phrases, sans Markdown.');
  lignes.push("- N'invente aucun identifiant : utilise seulement ceux de la liste.");
  if (options.outils) {
    lignes.push("- Pour désigner un réglage, appelle l'outil montrer.");
    lignes.push(
      "- Pour une suite de gestes, appelle l'outil planifier : l'interface avance seule à chaque étape faite."
    );
    if (options.diagnostic) {
      lignes.push(
        "- Si quelque chose ne s'affiche pas, lis d'abord les constats (lister_constats), puis montre le réglage qui corrige."
      );
    }
    if (options.skills) {
      lignes.push(
        '- Pour expliquer un réglage, consulte la documentation (get_relevant_skills, get_skill).'
      );
    }
  } else {
    lignes.push(
      "- Cite l'identifiant du réglage entre accents graves, par exemple `" +
        (registre.reperes[0]?.id ?? 'app.zone.reglage') +
        '`.'
    );
  }
  if (profil.consignes) lignes.push('', profil.consignes);
  return lignes.join('\n');
}

// ─── Lecture d'une réponse en texte ────────────────────────────────────

/**
 * Identifiants du registre cités tels quels dans un texte, dans l'ordre du
 * registre. Recherche littérale, sans expression régulière ; un id qui en
 * prolonge un autre (`a.b` dans `a.b-c`) n'est pas compté.
 */
export function idsCites(registre: RegistreReperes, texte: string): string[] {
  const prolonge = (c: string | undefined): boolean =>
    c !== undefined && (c === '-' || c === '.' || c === '_' || /[a-z0-9]/i.test(c));
  const cites: string[] = [];
  for (const { id } of registre.reperes) {
    let from = 0;
    for (;;) {
      const at = texte.indexOf(id, from);
      if (at === -1) break;
      const apres = texte[at + id.length];
      // Un point final de phrase n'est pas un prolongement.
      const finDePhrase = apres === '.' && !/[a-z0-9]/i.test(texte[at + id.length + 1] ?? '');
      if (!prolonge(texte[at - 1]) && (finDePhrase || !prolonge(apres))) {
        cites.push(id);
        break;
      }
      from = at + 1;
    }
  }
  return cites;
}

/** Remplace les ids cités par leur libellé, pour l'usager. */
function remplacerIds(registre: RegistreReperes, texte: string, ids: readonly string[]): string {
  const index = indexerReperes(registre);
  let out = texte;
  // Du plus long au plus court : un id n'est jamais remplacé dans un autre.
  for (const id of [...ids].sort((a, b) => b.length - a.length)) {
    const libelle = `« ${index.get(id)?.libelle ?? id} »`;
    out = out.split('`' + id + '`').join(libelle);
    out = out.split(id).join(libelle);
  }
  return out;
}

/**
 * Réglages désignés par une réponse en texte : les ids cités, sinon la
 * correspondance locale sur le texte.
 */
export function reperesDeLaReponse(
  registre: RegistreReperes,
  texte: string,
  fiches?: readonly MatchableSkill[]
): { texte: string; montrer?: string; reperes?: string[] } {
  const cites = idsCites(registre, texte);
  if (cites.length > 0) {
    const propre = remplacerIds(registre, texte, cites);
    return cites.length === 1
      ? { texte: propre, montrer: cites[0] }
      : { texte: propre, reperes: cites.slice(0, MAX_ETAPES_PLAN) };
  }
  const local = trouverRepere(registre, texte, { fiches });
  if (local.statut === 'trouve') return { texte, montrer: local.repere.repere.id };
  if (local.statut === 'ambigu') return { texte, reperes: local.candidats.map((c) => c.repere.id) };
  return { texte };
}

// ─── Plan pas à pas ────────────────────────────────────────────────────

export interface EtapeMontree {
  index: number;
  id: string;
  total: number;
  resultat: ResultatMontrer;
}

export interface OptionsPlan<Etat = unknown> {
  registre: RegistreReperes;
  adaptateur: AdaptateurReperage<Etat>;
  etapes: readonly string[];
  mode?: ModeReperage;
  /** Abandon (nouvelle question, assistant démonté) : le plan s'arrête. */
  signal?: AbortSignal;
  /**
   * L'étape est-elle faite ? Défaut : tout changement d'état après que
   * l'étape a été montrée (l'usager a agi sur l'interface).
   */
  etapeFaite?: (id: string, etat: Etat) => boolean;
  onEtape?: (etape: EtapeMontree) => void;
  onFin?: (raison: 'terminee' | 'arretee') => void;
  /** Remplace `montrer()` de reperage.ts (tests). */
  montrer?: (id: string, options: OptionsMontrer<Etat>) => Promise<ResultatMontrer>;
}

export interface PlanPasAPas {
  readonly etapes: readonly string[];
  /** Index de l'étape montrée, -1 avant le départ. */
  courante(): number;
  /** Montre la première étape et écoute les changements d'état. */
  demarrer(): Promise<void>;
  arreter(): void;
}

const pause = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * Suit un plan : montre chaque étape, avance quand l'app signale un
 * changement d'état et que l'étape est faite. Une étape bloquée par un
 * prérequis (montrer() a révélé le réglage qui le lève) est montrée de
 * nouveau dès que le prérequis est levé.
 *
 * Les changements d'état émis PENDANT que le plan révèle une étape (ouvrir un
 * panneau change l'état de l'app) sont ignorés : seul un geste de l'usager
 * fait avancer.
 */
export function suivrePlan<Etat>(opts: OptionsPlan<Etat>): PlanPasAPas {
  const { registre, adaptateur, etapes, signal } = opts;
  const montrerFn = opts.montrer ?? montrerRepere;
  let index = -1;
  let bloquee = false;
  let occupe = false;
  let fini = false;
  let desabonner: (() => void) | null = null;

  const terminer = (raison: 'terminee' | 'arretee'): void => {
    if (fini) return;
    fini = true;
    desabonner?.();
    desabonner = null;
    signal?.removeEventListener('abort', arreter);
    opts.onFin?.(raison);
  };
  function arreter(): void {
    terminer('arretee');
  }

  const afficher = async (i: number): Promise<void> => {
    occupe = true;
    try {
      const resultat = await montrerFn(etapes[i], { registre, adaptateur, mode: opts.mode });
      if (fini) return;
      bloquee = resultat.raison === 'prerequis';
      opts.onEtape?.({ index: i, id: etapes[i], total: etapes.length, resultat });
    } finally {
      // Laisse passer les re-rendus déclenchés par la révélation elle-même.
      await pause();
      occupe = false;
    }
  };

  const leve = (id: string): boolean => {
    try {
      return prerequisManquants(registre, adaptateur, id).length === 0;
    } catch {
      return true;
    }
  };

  const surChangement = (): void => {
    if (fini || occupe || index < 0) return;
    const id = etapes[index];
    if (bloquee) {
      if (leve(id)) void afficher(index);
      return;
    }
    const faite = opts.etapeFaite ? opts.etapeFaite(id, adaptateur.etat()) : true;
    if (!faite) return;
    if (index + 1 >= etapes.length) {
      terminer('terminee');
      return;
    }
    index += 1;
    void afficher(index);
  };

  return {
    etapes,
    courante: () => index,
    demarrer: async () => {
      if (index >= 0 || fini || etapes.length === 0) return;
      if (signal?.aborted) {
        terminer('arretee');
        return;
      }
      signal?.addEventListener('abort', arreter, { once: true });
      desabonner = adaptateur.onEtatChange?.(surChangement) ?? null;
      index = 0;
      await afficher(0);
      // Sans abonnement, rien ne fera avancer : le plan s'arrête là.
      if (!desabonner) terminer('arretee');
    },
    arreter,
  };
}

// ─── repondre ──────────────────────────────────────────────────────────

function conversationDe(
  historique: readonly MessageAssistant[],
  question: string
): { role: 'user' | 'assistant'; content: string }[] {
  const echanges = historique
    .filter((m) => (m.role === 'usager' || m.role === 'assistant') && !m.erreur && m.texte)
    .slice(-HISTORIQUE_ASSISTANT)
    .map((m) => ({
      role: m.role === 'usager' ? ('user' as const) : ('assistant' as const),
      content: m.texte,
    }));
  return [...echanges, { role: 'user', content: question }];
}

/** Réponse de la correspondance locale, sans modèle. */
function reponseLocale(contexte: ContexteAssistant): Reponse | null {
  const c = contexte.correspondance;
  if (c.statut === 'trouve') {
    return {
      texte: formulerCorrespondance(c),
      montrer: c.repere.repere.id,
      source: 'correspondance',
    };
  }
  if (c.statut === 'ambigu') {
    return {
      texte: formulerCorrespondance(c),
      reperes: c.candidats.map((x) => x.repere.id),
      source: 'correspondance',
    };
  }
  return null;
}

/**
 * La fonction `repondre` de `mountAssistant()` (#1011), branchée sur le
 * transport et la boucle communs.
 *
 * ```ts
 * mountAssistant({
 *   app: 'builder-carto', registre: REGISTRE, adaptateur, constats,
 *   repondre: creerRepondreIA({
 *     registre: REGISTRE,
 *     adaptateur,
 *     profil: { nom: 'le builder carto', panneaux: ['Source', 'Couches', 'Éléments'], prerequis: PREREQUIS },
 *     diagnostic, // optionnel : outils run_and_trace, lister_constats…
 *   }),
 * });
 * ```
 */
export function creerRepondreIA<Etat>(
  opts: OptionsRepondreIA<Etat>
): (contexte: ContexteAssistant) => Promise<Reponse> {
  const { registre, profil } = opts;
  const ids = idsDuRegistre(registre);
  const connus = new Set(ids);
  const maxRounds = opts.maxRounds ?? MAX_ROUNDS_ASSISTANT;
  const chargerSkills = opts.skills === false ? null : (opts.skills ?? (() => loadSkills()));
  const masquer = (): boolean => opts.masquer?.() ?? opts.diagnostic?.redactValues() ?? true;

  return async (contexte) => {
    // Le modèle n'est appelé que si la correspondance locale ne trouve rien.
    const locale = reponseLocale(contexte);
    if (locale) return locale;

    const { signal } = contexte;
    const transport = await (opts.transport ?? resolveTransport)();
    const post: PostChat = (body) => {
      if (signal.aborted) return Promise.reject(new Error('Question abandonnée.'));
      return transport.post(body);
    };

    const outils = transport.capacites.toolCalling === true;
    const constats =
      contexte.constats.length > 0 ? constatsPourModele(contexte.constats, masquer()) : '';
    const systemPrompt = construirePromptAssistant(registre, profil, {
      outils,
      diagnostic: outils && !!opts.diagnostic,
      skills: outils && !!chargerSkills,
      constats,
    });
    const conversation = conversationDe(contexte.historique, contexte.question);

    // ── Sans tool-calling : un appel en texte, relu par la correspondance locale ──
    if (!outils) {
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...conversation.map((m) => ({ role: m.role, content: m.content })),
      ];
      const data = await post({ model: transport.model, messages, temperature: 0.1 });
      const texte = data.choices?.[0]?.message?.content?.trim() ?? '';
      if (!texte) throw new Error('Réponse vide du modèle.');
      return { ...reperesDeLaReponse(registre, texte, opts.fiches), source: 'modele' };
    }

    // ── Tool-calling : la boucle commune ──
    const diagnostic = opts.diagnostic;
    const tools = [
      outilMontrer(ids),
      outilPlanifier(ids),
      ...(diagnostic ? DIAGNOSTIC_TOOLS : []),
      ...(chargerSkills ? OUTILS_SKILLS : []),
    ];
    const executer = async (name: string, args: Record<string, unknown>): Promise<string> => {
      if (DIAGNOSTIC_TOOL_NAMES.has(name)) {
        if (!diagnostic) return "Le diagnostic n'est pas disponible ici.";
        // Même masquage que les constats du prompt : aucun jeton ne sort.
        return masquerUrl(
          await runDiagnosticTool(name, args, {
            ...diagnostic,
            redactValues: masquer,
          })
        );
      }
      if (OUTILS_SKILLS_NOMS.has(name) && chargerSkills) {
        return executerOutilSkill(name, args, chargerSkills);
      }
      return `Outil inconnu : ${name}`;
    };

    const result = await runAgentLoop({
      post,
      model: transport.model,
      systemPrompt,
      conversation,
      tools,
      executer,
      terminaux: OUTILS_TERMINAUX,
      repetables: REPEATABLE_TOOLS,
      maxRounds,
      onProgress: opts.onProgress,
      decrireEtape,
      temperature: 0.1,
    });

    const texteModele = result.text.trim();
    if (result.fin !== 'terminal' || !result.terminal) {
      if (!texteModele) throw new Error('Réponse vide du modèle.');
      return { ...reperesDeLaReponse(registre, texteModele, opts.fiches), source: 'modele' };
    }

    const { name, args } = result.terminal;
    const candidats =
      name === 'montrer'
        ? [args.id]
        : Array.isArray(args.etapes)
          ? args.etapes.slice(0, MAX_ETAPES_PLAN)
          : [];
    const valides = [
      ...new Set(candidats.filter((id): id is string => typeof id === 'string' && connus.has(id))),
    ];

    // Hors enum : refusé ici, sans nouvel appel au modèle.
    if (valides.length === 0 || (name === 'montrer' && valides.length !== candidats.length)) {
      return {
        texte: texteModele ? `${texteModele}\n\n${REPERE_REFUSE}` : REPERE_REFUSE,
        source: 'modele',
      };
    }

    if (name === 'montrer' || valides.length === 1) {
      return { texte: texteModele || formulerCheminDe(registre, valides[0]), montrer: valides[0] };
    }

    // Plan : l'adaptateur le fait avancer ; sans lui, des boutons.
    if (opts.adaptateur?.onEtatChange) {
      const plan = suivrePlan({
        registre,
        adaptateur: opts.adaptateur,
        etapes: valides,
        mode: contexte.mode,
        signal,
        onEtape: opts.onEtape,
        onFin: opts.onFinPlan,
        montrer: opts.montrer,
      });
      // Après que mountAssistant a ajouté la réponse au fil.
      setTimeout(() => void plan.demarrer(), 0);
      return { texte: texteModele || formulerPlan(registre, valides), reperes: valides };
    }
    return {
      texte: texteModele || formulerPlan(registre, valides),
      montrer: valides[0],
      reperes: valides,
    };
  };
}

function formulerCheminDe(registre: RegistreReperes, id: string): string {
  return `C'est ici : ${chemin(registre, id).join(SEPARATEUR_CHEMIN)}.`;
}

function formulerPlan(registre: RegistreReperes, etapes: readonly string[]): string {
  return `En ${etapes.length} étapes : ${etapes
    .map((id) => chemin(registre, id).join(SEPARATEUR_CHEMIN))
    .join(' ; ')}.`;
}

/**
 * Branche Albert sur un assistant déjà monté (#1018) : le transport est résolu
 * UNE fois, au montage, et le modèle n'est branché que s'il est utilisable ici.
 *
 * - sans clé ni jeton serveur (`mode: 'none'`), ou sans tool-calling (le seul
 *   mode où l'id de repère est contraint par une enum fermée), rien n'est
 *   branché : l'assistant reste en correspondance locale, sous-titre
 *   « Guidage dans l'interface » ;
 * - une erreur de résolution (réseau, config illisible) vaut « pas de modèle ».
 *
 * Rend `true` si le modèle est branché. Le `transport` passé dans `opts` sert
 * aussi aux appels (tests : `post` mocké, aucun réseau).
 */
export async function brancherAlbert<Etat>(
  assistant: Pick<MountedAssistant, 'brancherModele'>,
  opts: OptionsRepondreIA<Etat>
): Promise<boolean> {
  let transport: TransportAssistant;
  try {
    transport = await (opts.transport ?? resolveTransport)();
  } catch {
    return false;
  }
  if (transport.mode === 'none' || transport.capacites.toolCalling !== true) return false;
  assistant.brancherModele(creerRepondreIA(opts));
  return true;
}

/**
 * Montage de l'assistant contextuel dans une app (#1011, epic #993, ADR-143).
 *
 * Le panneau `<app-assistant>` (packages/app-ui) n'a AUCUNE logique : il rend
 * des messages, un résumé des constats, la bascule « Dire » / « Guider » et un
 * champ de saisie, et il émet des événements. Tout le « cerveau » est ici :
 *
 *   1. `trouverRepere()` d'abord, TOUJOURS (ADR-143 §6, sobriété Albert) ;
 *      - `trouve` : `formulerCorrespondance()` puis `montrer()` immédiat ;
 *      - `ambigu` : des boutons candidats, aucun appel au modèle ;
 *      - `aucun` (ou seulement un repère « englobant », l'éditeur de code) :
 *        la correspondance HORS REGISTRE de l'app, s'il y en a une (#1105 :
 *        les lignes du code du Playground), toujours sans modèle ;
 *   2. `repondre()` (injecté par l'app, #1014) SEULEMENT si rien ne correspond ;
 *      sans `repondre`, un message local : le guidage fonctionne sans clé.
 *
 * Le panneau ne connaît ni Albert, ni le transport, ni la correspondance :
 * `packages/app-ui/src` n'importe ni `ia/transport`, ni `agent-loop`, ni
 * `reperes-matching` (test-garde).
 *
 * Comme `mountDiagnosticPanel` (ARCHITECTURE §3.8), ce helper vit dans
 * `shared` et crée l'élément PAR SON NOM DE BALISE : les apps chargent le
 * chrome par `<script>`, jamais par `import`.
 *
 * Accessibilité (ADR-143 §7) : jamais d'ouverture spontanée — un nouveau
 * constat ne change que la pastille du bouton. Les messages sont annoncés par
 * le `role=log` du fil (format des protos) ; le chemin d'un repère montré,
 * par la région unique de `reperage.ts` (`montrer()`). Aucune annonce n'est
 * doublée ici. Le mode de révélation est mémorisé dans `TourState`
 * (`setReperageMode`).
 *
 * Sécurité : la question et les réponses sont du texte externe. Aucune regex
 * ne leur est appliquée ; elles sont rendues en `textContent` ; un id de
 * repère venu du modèle n'atteint `montrer()` qu'après `estIdRepere()` et sa
 * présence dans le registre — ou, hors registre, après que l'app a déclaré
 * savoir le montrer (`libelleHorsRegistre`, #1105).
 *
 * Côté app : exporté par `@dsfr-data/shared`, jamais par
 * `@dsfr-data/shared/lib` (frontière #319).
 */

import type { Constat } from '../debug/constats.js';
import type { MatchableSkill } from '../ia/skill-matching.js';
import {
  formulerCorrespondance,
  trouverRepere,
  type ResultatCorrespondance,
} from '../ia/reperes-matching.js';
import type { RegistreReperes } from './reperes-types.js';
import {
  chemin,
  estIdRepere,
  getReperageMode,
  indexerReperes,
  montrer,
  setReperageMode,
  type AdaptateurReperage,
  type ModeReperage,
  type ResultatMontrer,
} from './reperage.js';

// ─── Contrat ───────────────────────────────────────────────────────────

/** D'où vient une réponse : la correspondance locale, ou le modèle. */
export type SourceReponse = 'correspondance' | 'modele';

/** Un repère proposé en bouton, avec ce que l'usager lit. */
export interface CandidatAssistant {
  readonly id: string;
  readonly libelle: string;
  /** Libellés zone → contrôle. */
  readonly chemin: readonly string[];
}

/** Suggestion de l'état vide : remplit le champ sans l'envoyer. */
export interface SuggestionAssistant {
  readonly texte: string;
  /** Partie du texte sélectionnée après remplissage, à compléter par l'usager. */
  readonly aCompleter?: string;
}

/** Un message de la conversation, tel que le panneau le rend. */
export interface MessageAssistant {
  readonly role: 'usager' | 'assistant' | 'systeme';
  /** Texte brut ; paragraphes séparés par `\n\n`. Jamais de HTML. */
  readonly texte: string;
  /** Bulle d'erreur (modèle injoignable, repère inconnu…). */
  readonly erreur?: boolean;
  readonly source?: SourceReponse;
  /** Ids des repères cités par le message (métadonnée, déjà validés). */
  readonly reperes?: readonly string[];
  /** Repères proposés en boutons : un clic émet `assistant-montrer`. */
  readonly candidats?: readonly CandidatAssistant[];
  /** Prérequis levé : repère à montrer de nouveau (bouton « Continuer »). */
  readonly continuer?: string;
}

/**
 * Ce que rend la correspondance locale d'une app sur ses repères hors registre
 * (#1105) : les candidats, du plus plausible au moins plausible, et la phrase
 * de réponse (« Ligne 12 : limit="15" (dsfr-data-source) »).
 */
export interface CorrespondanceHorsRegistre {
  readonly candidats: readonly CandidatAssistant[];
  /** Texte brut. Absent : formulé à partir des libellés des candidats. */
  readonly texte?: string;
}

/** Réponse d'un modèle (#1014). */
export interface Reponse {
  /** Texte brut, paragraphes séparés par `\n\n`. Jamais de HTML ni de Markdown. */
  readonly texte: string;
  /** Repère révélé dès la réponse (outil `montrer(id)` du tour Albert). */
  readonly montrer?: string;
  /** Repères proposés en boutons (plan pas à pas, choix). */
  readonly reperes?: readonly string[];
  /** Défaut : `modele`. */
  readonly source?: SourceReponse;
}

/** Ce que reçoit `repondre()` : de quoi écrire un prompt. */
export interface ContexteAssistant {
  readonly question: string;
  /** Toujours `statut: 'aucun'` aujourd'hui : le modèle n'est appelé qu'en secours. */
  readonly correspondance: ResultatCorrespondance;
  readonly constats: readonly Constat[];
  readonly mode: ModeReperage;
  /** Messages antérieurs à la question. */
  readonly historique: readonly MessageAssistant[];
  /** Abandonné quand une autre question est posée ou que l'assistant est démonté. */
  readonly signal: AbortSignal;
}

/** Surface publique de `<app-assistant>`, sans dépendre de sa classe. */
export interface AssistantPanelElement extends HTMLElement {
  app: string;
  messages: readonly MessageAssistant[];
  /** Constats (le panneau n'en rend qu'un résumé : les non-info). */
  constats: readonly Constat[];
  suggestions: readonly SuggestionAssistant[];
  aide: string;
  sousTitre: string;
  pied: string;
  statut: string;
  mode: ModeReperage;
  busy: boolean;
  open: boolean;
  /** Id du `role=dialog` : cible d'`aria-controls`. */
  readonly panneauId: string;
  /** Affiche « Voir le détail dans le Diagnostic ». */
  diagnostic: boolean;
  /** Affiche « Construire pour moi dans le Studio ». */
  construire: boolean;
  /** Loge le volet Diagnostic dans l'onglet « Diagnostic » du panneau. */
  integrerDiagnostic?(el: HTMLElement): void;
  toggle(open?: boolean, options?: { focus?: boolean; lanceur?: boolean }): void;
  /** Rend le focus à la languette flottante du panneau (après son rendu). */
  focusLanceur(): void;
}

export interface OptionsAssistant<Etat = unknown> {
  /** Dossier de l'app sous `apps/` : `builder-carto`. */
  app: string;
  registre: RegistreReperes;
  adaptateur: AdaptateurReperage<Etat>;
  /** Constats courants ; en pratique `MountedDiagnostic.constats`. Défaut : aucun. */
  constats?: () => readonly Constat[];
  /**
   * Secours par un modèle, appelé seulement si la correspondance ne trouve rien.
   * Peut être branché après le montage (`brancherModele`), une fois le
   * transport résolu : c'est ce que fait `brancherAlbert()` (#1018).
   */
  repondre?: (contexte: ContexteAssistant) => Promise<Reponse>;
  /**
   * Repères hors registre que l'app sait montrer elle-même (ex. les repères de
   * code du Playground, `playground.ligne.<n>.<balise>`, qui changent à chaque
   * frappe). Rend `true` si l'id a été pris en charge ; sinon l'id est refusé
   * comme tout id absent du registre.
   */
  montrerHorsRegistre?: (id: string) => boolean | Promise<boolean>;
  /**
   * Libellé d'un repère hors registre que l'app sait montrer MAINTENANT
   * (Playground : « Ligne 12 — dsfr-data-source » si la ligne existe dans le
   * code courant et y porte cette balise), sinon `null`. C'est le filtre qui
   * laisse passer un id hors registre venu du modèle (#1105) : sans cette
   * option, ou si elle rend `null`, l'id est refusé comme tout id absent du
   * registre. La grammaire (`estIdRepere`) est vérifiée avant.
   */
  libelleHorsRegistre?: (id: string) => string | null;
  /**
   * Correspondance locale sur ce que l'app montre hors registre (#1105) :
   * Playground, les lignes du code courant dont une balise, un attribut ou une
   * valeur correspond à la question. Consultée AVANT le modèle (ADR-143 §6)
   * quand `trouverRepere` ne trouve rien, ou ne trouve que des repères de
   * `reperesEnglobants` (l'éditeur de code, trop vague quand une ligne répond).
   * Les ids rendus passent le même filtre que ceux du modèle
   * (`estIdRepere` + `libelleHorsRegistre`).
   */
  correspondanceHorsRegistre?: (question: string) => CorrespondanceHorsRegistre | null;
  /**
   * Repères du registre qui ENGLOBENT les repères hors registre (Playground :
   * `playground.editeur.code`). Quand la correspondance du registre ne trouve
   * qu'eux, `correspondanceHorsRegistre` est consultée et, si elle trouve, sa
   * réponse, plus précise, l'emporte.
   */
  reperesEnglobants?: readonly string[];
  /** Fiches skills passées à `trouverRepere`. */
  fiches?: readonly MatchableSkill[];
  /** Suggestions de l'état vide, lues à chaque nouvelle conversation (au plus 3 affichées). */
  suggestions?: () => readonly SuggestionAssistant[];
  /** Phrase d'aide de l'état vide, propre à l'app. */
  aide?: string;
  /**
   * Bouton qui ouvre le panneau. Défaut `assistant-btn` : réutilisé s'il est
   * dans le document, sinon ajouté à `app-action-bar` (tertiaire). `false` : aucun.
   */
  boutonId?: string | false;
  /** « Voir le détail dans le Diagnostic » ; absent = pas de lien. */
  ouvrirDiagnostic?: (onglet?: 'constats') => void;
  /**
   * Volet Diagnostic à loger dans l'onglet « Diagnostic » du panneau
   * (`MountedDiagnostic.panel`). Il perd alors son rail en bas d'écran, et la
   * languette de l'assistant porte le seul compteur de constats. Absent : le
   * volet reste un tiroir (Studio, ancien Assistant IA).
   */
  diagnostic?: HTMLElement | null;
  /** « Construire pour moi dans le Studio » ; absent = pas de bouton. */
  construire?: () => void;
  /** Hôte du panneau (défaut : `document.body`). */
  host?: HTMLElement;
}

export interface MountedAssistant {
  panel: AssistantPanelElement;
  ouvrir(): void;
  fermer(): void;
  basculer(open?: boolean): void;
  /** Relit `constats()` : pastille du bouton et résumé du panneau. */
  rafraichirConstats(): void;
  /** Pose une question comme si l'usager l'avait tapée. */
  poser(question: string): Promise<void>;
  /**
   * Branche (ou débranche, `null`) le secours par un modèle après le montage.
   * Le sous-titre et le pied du panneau suivent : sans modèle, le panneau ne
   * se présente jamais comme Albert.
   */
  brancherModele(repondre: ((contexte: ContexteAssistant) => Promise<Reponse>) | null): void;
  /** Un modèle est-il branché ? */
  readonly avecModele: boolean;
  destroy(): void;
}

// ─── Textes ────────────────────────────────────────────────────────────

/** Réponse locale quand rien ne correspond et qu'aucun modèle n'est branché. */
export function messageAucunReglage(question: string): string {
  return `Je n'ai pas trouvé de réglage correspondant à « ${question} ». Nommez le panneau ou le réglage (par exemple « au clic », « champ géographique »).`;
}

/** Pied du panneau quand aucun modèle n'est branché. */
export const PIED_SANS_MODELE = 'Réponses tirées de l’interface, sans IA';
/** Sous-titre quand aucun modèle n'est branché : ne pas annoncer Albert à tort. */
export const SOUS_TITRE_SANS_MODELE = 'Guidage dans l’interface';
/** Sous-titre avec un modèle branché (défaut de `<app-assistant>`). */
export const SOUS_TITRE_AVEC_MODELE = 'Albert, IA de l’État';
/** Pied avec un modèle branché (défaut de `<app-assistant>`). */
export const PIED_AVEC_MODELE = 'IA de l’État : réponses à vérifier';

/** Id par défaut du bouton qui ouvre le panneau. */
export const ID_BOUTON_ASSISTANT = 'assistant-btn';

/** Variable CSS du bas de la barre d'actions : le volet s'ouvre en dessous. */
const VAR_BAS_BARRE = '--app-action-bar-bas';

/**
 * Page sans `app-action-bar` (Sources) : le bouton « Assistant » vit dans une
 * rangée d'actions maison. On en publie le bas dans `--app-action-bar-bas`,
 * comme le fait `app-action-bar`, pour que le volet ne recouvre pas sa
 * primaire (« Nouvelle connexion »). Rend la fonction d'arrêt.
 */
function suivreBasDe(zone: HTMLElement): () => void {
  const racine = document.documentElement.style;
  let precedent: number | null = null;
  let image = 0;
  const publier = (): void => {
    image = 0;
    const bas = Math.max(0, Math.round(zone.getBoundingClientRect().bottom));
    if (bas === precedent) return;
    precedent = bas;
    racine.setProperty(VAR_BAS_BARRE, `${bas}px`);
  };
  const planifier = (): void => {
    if (image) return;
    if (typeof requestAnimationFrame !== 'function') return publier();
    image = requestAnimationFrame(publier);
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(planifier) : null;
  ro?.observe(zone);
  window.addEventListener('scroll', planifier, { capture: true, passive: true });
  window.addEventListener('resize', planifier, { passive: true });
  publier();
  return () => {
    ro?.disconnect();
    window.removeEventListener('scroll', planifier, true);
    window.removeEventListener('resize', planifier);
    if (image && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(image);
    racine.removeProperty(VAR_BAS_BARRE);
  };
}

/** Surface de `app-action-bar` utilisée ici, sans dépendre de sa classe. */
interface BarreAvecAssistant extends HTMLElement {
  ajouterBoutonAssistant?(): HTMLButtonElement;
}

// ─── Montage ───────────────────────────────────────────────────────────

export function mountAssistant<Etat>(opts: OptionsAssistant<Etat>): MountedAssistant {
  const { registre, adaptateur } = opts;
  const host = opts.host ?? document.body;
  const index = indexerReperes(registre);
  const lireConstats = (): readonly Constat[] => opts.constats?.() ?? [];

  const panel = document.createElement('app-assistant') as AssistantPanelElement;
  panel.app = opts.app;
  if (opts.aide) panel.aide = opts.aide;
  panel.suggestions = opts.suggestions?.() ?? [];
  let repondre = opts.repondre ?? null;
  const presenter = (): void => {
    panel.pied = repondre ? PIED_AVEC_MODELE : PIED_SANS_MODELE;
    panel.sousTitre = repondre ? SOUS_TITRE_AVEC_MODELE : SOUS_TITRE_SANS_MODELE;
  };
  presenter();
  panel.diagnostic = !!opts.ouvrirDiagnostic;
  panel.construire = !!opts.construire;
  panel.mode = getReperageMode();
  panel.messages = [];
  panel.constats = lireConstats();
  panel.busy = false;
  host.appendChild(panel);
  // Un vrai élément seulement : les doublures de test des apps n'en sont pas.
  const diagnostic = opts.diagnostic instanceof HTMLElement ? opts.diagnostic : null;
  if (diagnostic) panel.integrerDiagnostic?.(diagnostic);

  // ── Bouton d'ouverture ──
  let bouton: HTMLElement | null = null;
  if (opts.boutonId !== false) {
    const id = opts.boutonId ?? ID_BOUTON_ASSISTANT;
    bouton = document.getElementById(id);
    if (!bouton && id === ID_BOUTON_ASSISTANT) {
      const barre = document.querySelector('app-action-bar') as BarreAvecAssistant | null;
      bouton = barre?.ajouterBoutonAssistant?.() ?? null;
    }
  }
  const onBoutonClick = (): void => panel.toggle();
  // Hors `app-action-bar` (qui publie elle-même son bas), la rangée d'actions
  // du bouton, repérée par sa zone de repères (`data-zone`).
  const zoneActions =
    bouton && !bouton.closest('app-action-bar') ? bouton.closest<HTMLElement>('[data-zone]') : null;
  const arreterSuivi = zoneActions ? suivreBasDe(zoneActions) : null;
  if (bouton) {
    bouton.setAttribute('aria-expanded', panel.open ? 'true' : 'false');
    if (panel.panneauId) bouton.setAttribute('aria-controls', panel.panneauId);
    bouton.addEventListener('click', onBoutonClick);
  }

  // ── Constats : pastille du bouton et résumé ──
  const rafraichirConstats = (): void => {
    const constats = lireConstats();
    panel.constats = constats;
    if (!bouton) return;
    const n = constats.filter((c) => c.gravite !== 'info').length;
    if (n > 0) {
      bouton.dataset.count = String(n);
      bouton.setAttribute('aria-label', `Assistant, ${n} constat${n > 1 ? 's' : ''} à corriger`);
    } else {
      delete bouton.dataset.count;
      bouton.removeAttribute('aria-label');
    }
  };
  rafraichirConstats();

  // ── Conversation ──
  const ajouter = (...messages: MessageAssistant[]): void => {
    panel.messages = [...panel.messages, ...messages];
  };

  /** Libellé d'un id hors registre que l'app sait montrer, sinon `null`. */
  const libelleHors = (id: string): string | null => {
    if (!opts.libelleHorsRegistre || index.has(id)) return null;
    const libelle = opts.libelleHorsRegistre(id);
    return typeof libelle === 'string' && libelle ? libelle : null;
  };

  const candidat = (id: string): CandidatAssistant => ({
    id,
    libelle: index.get(id)?.libelle ?? libelleHors(id) ?? id,
    chemin: chemin(registre, id),
  });

  /**
   * Ids cités par le modèle : grammaire valide, et présents dans le registre
   * OU déclarés montrables par l'app (`libelleHorsRegistre`, #1105).
   */
  const valides = (ids: readonly string[] | undefined): string[] =>
    (ids ?? []).filter(
      (id) =>
        typeof id === 'string' && estIdRepere(id) && (index.has(id) || libelleHors(id) !== null)
    );

  /**
   * Correspondance locale hors registre (#1105), filtrée comme les ids du
   * modèle. `null` si elle ne trouve rien de montrable.
   */
  const correspondanceHors = (question: string): CorrespondanceHorsRegistre | null => {
    if (!opts.correspondanceHorsRegistre) return null;
    const r = opts.correspondanceHorsRegistre(question);
    if (!r) return null;
    const vus = new Set<string>();
    const candidats = r.candidats.filter((c) => {
      if (vus.has(c.id) || valides([c.id]).length === 0) return false;
      vus.add(c.id);
      return true;
    });
    return candidats.length > 0 ? { candidats, texte: r.texte } : null;
  };

  /** Montre un repère et dit dans la conversation ce qui a empêché de le montrer. */
  const montrerEtDire = async (id: string): Promise<ResultatMontrer | null> => {
    if (typeof id === 'string' && estIdRepere(id) && !index.has(id) && opts.montrerHorsRegistre) {
      if (await opts.montrerHorsRegistre(id)) return null;
    }
    if (!estIdRepere(id) || !index.has(id)) {
      ajouter({
        role: 'systeme',
        erreur: true,
        texte: "Ce réglage n'existe pas dans cette interface.",
      });
      return null;
    }
    const r = await montrer(id, { registre, adaptateur, mode: panel.mode });
    if (r.raison === 'prerequis' && r.prerequis) {
      const regle = adaptateur.prerequis[r.prerequis];
      ajouter({
        role: 'systeme',
        texte: regle
          ? `${regle.message} Quand c'est fait, choisissez « Continuer ».`
          : "Un préalable manque avant ce réglage. Quand c'est fait, choisissez « Continuer ».",
        continuer: id,
      });
    } else if (r.raison === 'introuvable') {
      ajouter({
        role: 'systeme',
        erreur: true,
        texte: `Ce réglage n'est pas affiché pour l'instant : ${r.chemin.join(' › ') || id}.`,
      });
    }
    return r;
  };

  let controleur: AbortController | null = null;

  const poser = async (brute: string): Promise<void> => {
    const question = brute.trim();
    if (!question) return;
    controleur?.abort();
    const ctrl = new AbortController();
    controleur = ctrl;

    const historique = panel.messages;
    ajouter({ role: 'usager', texte: question });

    const correspondance = trouverRepere(registre, question, { fiches: opts.fiches });

    // Hors registre (#1105) : rien au registre, ou seulement un repère qui
    // englobe les repères hors registre (l'éditeur de code) — une ligne
    // précise vaut mieux que « Code HTML ». Toujours avant le modèle.
    const englobants = opts.reperesEnglobants ?? [];
    const seulementEnglobants =
      correspondance.statut !== 'aucun' &&
      correspondance.candidats.every((c) => englobants.includes(c.repere.id));
    if (correspondance.statut === 'aucun' || seulementEnglobants) {
      const hors = correspondanceHors(question);
      if (hors) {
        const ids = hors.candidats.map((c) => c.id);
        const texte =
          hors.texte ??
          (hors.candidats.length === 1
            ? `C'est ici : ${hors.candidats[0].libelle}.`
            : `Plusieurs endroits peuvent correspondre : ${hors.candidats
                .map((c) => c.libelle)
                .join(' ; ')}.`);
        ajouter({
          role: 'assistant',
          source: 'correspondance',
          texte,
          reperes: ids,
          candidats: hors.candidats,
        });
        if (ids.length === 1) await montrerEtDire(ids[0]);
        return;
      }
    }

    if (correspondance.statut === 'trouve') {
      const id = correspondance.repere.repere.id;
      ajouter({
        role: 'assistant',
        source: 'correspondance',
        texte: formulerCorrespondance(correspondance),
        reperes: [id],
        candidats: [candidat(id)],
      });
      await montrerEtDire(id);
      return;
    }

    if (correspondance.statut === 'ambigu') {
      const ids = correspondance.candidats.map((c) => c.repere.id);
      const texte = formulerCorrespondance(correspondance);
      ajouter({
        role: 'assistant',
        source: 'correspondance',
        texte,
        reperes: ids,
        candidats: ids.map(candidat),
      });
      return;
    }

    // Rien ne correspond : le modèle en secours, s'il est branché.
    if (!repondre) {
      const texte = messageAucunReglage(question);
      ajouter({ role: 'assistant', source: 'correspondance', texte });
      return;
    }

    panel.busy = true;
    panel.statut = 'L’assistant prépare une réponse…';
    let reponse: Reponse;
    try {
      reponse = await repondre({
        question,
        correspondance,
        constats: lireConstats(),
        mode: panel.mode,
        historique,
        signal: ctrl.signal,
      });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const detail = e instanceof Error && e.message ? ` (${e.message})` : '';
      const texte = messageAucunReglage(question);
      ajouter(
        { role: 'systeme', erreur: true, texte: `L'assistant n'a pas pu répondre${detail}.` },
        { role: 'assistant', source: 'correspondance', texte }
      );
      return;
    } finally {
      if (controleur === ctrl) {
        panel.busy = false;
        panel.statut = '';
        controleur = null;
      }
    }
    if (ctrl.signal.aborted) return;
    if (!reponse || typeof reponse.texte !== 'string') {
      ajouter(
        { role: 'systeme', erreur: true, texte: "L'assistant n'a pas pu répondre." },
        { role: 'assistant', source: 'correspondance', texte: messageAucunReglage(question) }
      );
      return;
    }

    const [aMontrer] = valides(reponse.montrer !== undefined ? [reponse.montrer] : []);
    const proposes = valides(reponse.reperes).filter((id) => id !== aMontrer);
    const cites = [...(aMontrer ? [aMontrer] : []), ...proposes];
    ajouter({
      role: 'assistant',
      source: reponse.source ?? 'modele',
      texte: reponse.texte,
      reperes: cites,
      candidats: cites.length > 0 ? cites.map(candidat) : undefined,
    });
    if (reponse.montrer !== undefined && !aMontrer) {
      ajouter({
        role: 'systeme',
        erreur: true,
        texte: "Le réglage cité n'existe pas dans cette interface.",
      });
    }
    if (aMontrer) await montrerEtDire(aMontrer);
  };

  // ── Événements du panneau ──
  const onEnvoyer = (e: Event): void => {
    void poser((e as CustomEvent<{ question: string }>).detail.question);
  };
  const onMontrer = (e: Event): void => {
    void montrerEtDire((e as CustomEvent<{ repere: string }>).detail.repere);
  };
  const onMode = (e: Event): void => {
    const mode =
      (e as CustomEvent<{ mode: ModeReperage }>).detail.mode === 'guider' ? 'guider' : 'dire';
    panel.mode = mode;
    setReperageMode(mode);
  };
  const onNouvelle = (): void => {
    controleur?.abort();
    controleur = null;
    panel.busy = false;
    panel.messages = [];
    panel.suggestions = opts.suggestions?.() ?? [];
    panel.statut = 'Nouvelle conversation.';
    panel.toggle(true);
  };
  const onDiagnostic = (): void => opts.ouvrirDiagnostic?.('constats');
  const onConstruire = (): void => opts.construire?.();
  /**
   * Focus rendu au déclencheur effectif quand le bouton a ouvert : le bouton
   * s'il est affiché ; replié dans « Plus d'actions » (menu refermé), le
   * déclencheur du menu ; sinon la languette du panneau.
   */
  const rendreFocus = (): void => {
    if (!bouton || !bouton.isConnected) {
      panel.focusLanceur();
      return;
    }
    if (!bouton.closest('[hidden]')) {
      bouton.focus();
      return;
    }
    const menu = bouton.closest('app-menu');
    const declencheur = menu?.querySelector<HTMLElement>('.app-menu__trigger');
    if (declencheur) declencheur.focus();
    else panel.focusLanceur();
  };
  const onToggle = (e: Event): void => {
    const { open, focusDedans, parLanceur } = (
      e as CustomEvent<{ open: boolean; focusDedans?: boolean; parLanceur?: boolean }>
    ).detail;
    bouton?.setAttribute('aria-expanded', open ? 'true' : 'false');
    // Fermé alors que le focus était dans le panneau : il revient au
    // déclencheur. La languette, le panneau s'en charge lui-même.
    if (!open && focusDedans && !parLanceur) rendreFocus();
  };
  panel.addEventListener('assistant-envoyer', onEnvoyer);
  panel.addEventListener('assistant-montrer', onMontrer);
  panel.addEventListener('assistant-mode', onMode);
  panel.addEventListener('assistant-nouvelle', onNouvelle);
  panel.addEventListener('assistant-diagnostic', onDiagnostic);
  panel.addEventListener('assistant-construire', onConstruire);
  panel.addEventListener('assistant-toggle', onToggle);

  return {
    panel,
    ouvrir: () => panel.toggle(true),
    fermer: () => panel.toggle(false),
    basculer: (open?: boolean) => panel.toggle(open),
    rafraichirConstats,
    poser,
    brancherModele: (r) => {
      repondre = r;
      presenter();
    },
    get avecModele() {
      return repondre !== null;
    },
    destroy: () => {
      controleur?.abort();
      controleur = null;
      bouton?.removeEventListener('click', onBoutonClick);
      arreterSuivi?.();
      panel.removeEventListener('assistant-envoyer', onEnvoyer);
      panel.removeEventListener('assistant-montrer', onMontrer);
      panel.removeEventListener('assistant-mode', onMode);
      panel.removeEventListener('assistant-nouvelle', onNouvelle);
      panel.removeEventListener('assistant-diagnostic', onDiagnostic);
      panel.removeEventListener('assistant-construire', onConstruire);
      panel.removeEventListener('assistant-toggle', onToggle);
      // Le volet intégré survit à l'assistant : il redevient un tiroir.
      if (diagnostic && panel.contains(diagnostic)) {
        diagnostic.removeAttribute('integre');
        document.body.appendChild(diagnostic);
      }
      panel.remove();
    },
  };
}

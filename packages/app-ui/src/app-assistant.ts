import { LitElement, html, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  CandidatAssistant,
  Constat,
  GraviteConstat,
  MessageAssistant,
  ModeReperage,
  RemedeConstat,
  SuggestionAssistant,
} from '@dsfr-data/shared';
import { PINNED } from './chrome-breakpoints.js';

/**
 * <app-assistant> — le panneau de l'assistant contextuel (#1011, ADR-143)
 *
 * Un panneau d'AFFICHAGE, sans logique : en-tête, fil de messages, résumé des
 * constats avec « Me montrer », bascule « Dire » / « Guider », saisie. Il
 * émet, `mountAssistant()` (packages/shared/src/ui/mount-assistant.ts)
 * résout : correspondance sans modèle, secours par un modèle injecté par
 * l'app, `montrer()`, persistance du mode. Ce fichier n'importe que des TYPES
 * de `@dsfr-data/shared` : jamais `ia/transport`, `agent-loop` ni
 * `reperes-matching` (test-garde `tests/apps/app-ui/app-assistant.test.ts`).
 *
 * **Anatomie** : celle des assistants de `proto-ecosysteme-sircom` et
 * `proto-catalogue-donnees` (`public/assistant.{css,js}`), classes et valeurs
 * comprises — avatar, bulles, état vide à suggestions, trois points, saisie en
 * pilule, pied. Seuls les variables de couleur, `fr-icon-*`, `fr-sr-only` et
 * `fr-link` viennent du DSFR : aucun composant de formulaire, par choix.
 *
 * **Placement** (arbitré le 2026-09-23, écart assumé aux protos) : volet
 * latéral droit en surimpression au-dessus de l'aperçu, du bas de la barre
 * d'actions (`--app-action-bar-bas`, publiée par `app-action-bar` ; à défaut
 * le bas de l'en-tête) au mobilier bas (rail du Diagnostic, barre d'actions
 * fixe) : la barre et sa primaire (« Exécuter »…) restent cliquables volet
 * ouvert. SOUS le volet Diagnostic (770 < 780) ; il se réduit quand le
 * Diagnostic s'ouvre, jamais l'inverse. Sous 35.98em : feuille plein écran.
 *
 * **Lanceur** : une languette collée au bord droit, à mi-hauteur de la zone
 * libre (pas en bas à droite : tiroir Diagnostic, barre fixe en mobile),
 * masquée volet ouvert, porteuse de la pastille des constats. Sous 35.98em,
 * pastille ronde en bas à droite, au-dessus du mobilier bas. Le bouton
 * `#assistant-btn` de la barre reste (repère `<app>.actions.assistant`). À la
 * réduction, le focus revient au déclencheur effectif : la languette si elle a
 * ouvert le volet, sinon le bouton (voir `mountAssistant`).
 *
 * **Accessibilité** : `role=dialog` non modal, sans piège à focus ; jamais
 * d'ouverture spontanée (seule la réouverture après navigation, mémorisée,
 * et alors SANS prendre le focus) ; ouvrir par le bouton place le focus dans
 * le champ ; Échap réduit et `mountAssistant` rend le focus au bouton. Le fil
 * est un `role=log` ; le résumé des constats est HORS du log (le volet
 * Diagnostic annonce déjà les nouvelles erreurs : pas de double annonce).
 *
 * **Onglet Diagnostic** : dans les apps qui ont les deux, le volet Diagnostic
 * n'est plus un tiroir en bas d'écran — `integrerDiagnostic()` le loge dans un
 * second onglet du panneau, et la languette porte le seul compteur de
 * constats. Le bouton « Diagnostic » de la barre d'actions et « Voir le
 * détail » ouvrent le panneau sur cet onglet (via `diagnostic-toggle`).
 *
 * Light DOM pour hériter des styles DSFR. Textes rendus par templates Lit
 * (échappés), jamais par `innerHTML`.
 *
 * @fires assistant-envoyer - { question } l'usager envoie une question.
 * @fires assistant-montrer - { repere } voir un repère (constat, candidat, « Continuer »).
 * @fires assistant-mode - { mode } bascule « Dire » / « Guider ».
 * @fires assistant-nouvelle - « Nouvelle conversation ».
 * @fires assistant-diagnostic - « Voir le détail dans le Diagnostic ».
 * @fires assistant-construire - « Construire pour moi dans le Studio ».
 * @fires assistant-toggle - { open, focusDedans } ouverture / réduction.
 */

/** Surface du volet Diagnostic utilisée ici, sans dépendre de sa classe. */
interface DiagnosticIntegre extends HTMLElement {
  readonly isOpen: boolean;
  toggle(open?: boolean): void;
}

const LIBELLES_GRAVITE: Record<GraviteConstat, string> = {
  erreur: 'Erreur',
  avertissement: 'Avertissement',
  info: 'Information',
};

const ICONES_GRAVITE: Record<GraviteConstat, string> = {
  erreur: 'fr-icon-error-warning-line',
  avertissement: 'fr-icon-warning-line',
  info: 'fr-icon-information-line',
};

/** Mémoire ouvert / réduit, comme les protos (`ecosysteme-assistant-ouvert`). */
export const CLE_ASSISTANT_OUVERT = 'dsfr-data-assistant-ouvert';

/** Au-delà, la zone de saisie défile (protos : `HAUTEUR_MAX_SAISIE`). */
const HAUTEUR_MAX_SAISIE = 128;

/** Seuil de la feuille plein écran (protos). */
export const PLEIN_ECRAN_QUERY = '(max-width: 35.98em)';

/** Au plus trois suggestions dans l'état vide. */
const MAX_SUGGESTIONS = 3;

const PHRASE_SUGGESTION = 'Une suggestion remplit le champ, sans l’envoyer.';

let assistantSeq = 0;

/**
 * Texte brut vers lignes : paragraphes sur `\n\n`, sauts de ligne sur `\n`,
 * `**` retiré (aucun Markdown). Aucune regex : c'est du texte externe.
 */
export function paragraphesDe(texte: string): string[][] {
  return String(texte)
    .split('**')
    .join('')
    .split('\n\n')
    .filter((p) => p.trim() !== '')
    .map((p) => p.split('\n'));
}

export function injectAppAssistantStyles(): void {
  if (document.getElementById('app-assistant-style')) return;
  const style = document.createElement('style');
  style.id = 'app-assistant-style';
  style.textContent = `
app-assistant{display:contents}
/* \`hidden\` doit l'emporter sur les \`display\` declares ci-dessous : sans cette
   regle, « Reduire » et Echap semblent sans effet (protos). */
.assistant-panneau[hidden],.assistant-lanceur[hidden],.assistant-accueil[hidden],.assistant-saisie-en-cours[hidden],.assistant-conversation[hidden],.assistant-detail[hidden]{display:none !important}
/* Onglets Conversation / Diagnostic (volet Diagnostic integre). */
.assistant-onglets{display:flex;gap:.25rem}
.assistant-onglet{padding:.5rem .625rem;margin-bottom:-1px;border:0;border-bottom:2px solid transparent;background:none;color:var(--text-mention-grey);font:inherit;font-size:.875rem;line-height:1.25rem;cursor:pointer}
.assistant-onglet[aria-selected="true"]{color:var(--text-active-blue-france);border-bottom-color:var(--border-active-blue-france);font-weight:500}
/* Survol et appui : TOUJOURS par les teintes DSFR \`--hover\` / \`--active\`
   posees sur la classe, jamais par un \`:hover{background-color}\` (#1080). La
   regle DSFR \`button:not(:disabled):hover{background-color:var(--hover-tint)}\`
   (0,2,1) l'emporte sur \`.classe:hover\` (0,2,0) ; elle lit \`--hover-tint\`,
   qui vaut \`var(--hover)\` sur tout bouton. Garde : app-assistant.test.ts. */
.assistant-onglet{--hover:var(--background-default-grey-hover);--active:var(--background-default-grey-active)}
.assistant-onglet:focus-visible{outline:2px solid var(--border-active-blue-france);outline-offset:-2px}
.assistant-conversation{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
.assistant-detail{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:.75rem;font-size:.875rem}
/* Volet lateral en surimpression a droite. z-index 770 : sous le volet
   Diagnostic (780). Le haut commence SOUS la barre d'actions
   (--app-action-bar-bas, position mesuree, donc valable a toute largeur) :
   la barre et sa primaire restent cliquables volet ouvert. Le bas s'arrete au
   mobilier bas : rail du Diagnostic, barre d'actions fixe (0 hors mobile) —
   jamais recouverts. */
.assistant-panneau{--assistant-rayon:.75rem;position:fixed;right:0;top:var(--app-action-bar-bas,0px);bottom:calc(var(--app-action-bar-fixed-h,0px) + var(--app-diagnostic-h,0px));z-index:770;display:flex;flex-direction:column;width:max(24rem,min(34rem,40vw));max-width:100vw;overflow:hidden;color:var(--text-default-grey);background-color:var(--background-default-grey);border-left:1px solid var(--border-default-grey);box-shadow:var(--lifted-shadow,0 3px 9px rgba(0,0,18,.16))}
/* Decalage derive de l'en-tete : seulement la ou il est epingle (chrome-breakpoints).
   Sans barre d'actions (Sources), le volet commence sous l'en-tete. */
@media ${PINNED}{
  .assistant-panneau{top:max(var(--app-header-h,0px),var(--app-action-bar-bas,0px))}
}
/* Lanceur : languette collee au bord droit, centree dans la zone libre entre
   la barre d'actions et le mobilier bas. Meme couche que le volet (770) : sous
   le volet Diagnostic (780), la barre fixe (800), les menus (900) et les
   modales (1000+). Cible >= 44 px dans les deux sens. */
.assistant-lanceur{position:fixed;right:0;top:calc((var(--app-action-bar-bas,0px) + 100vh - var(--app-action-bar-fixed-h,0px) - var(--app-diagnostic-h,0px)) / 2);z-index:770;display:inline-flex;flex-direction:column;align-items:center;gap:.5rem;min-width:2.75rem;min-height:2.75rem;margin:0;padding:.75rem .5rem;border:0;border-radius:.5rem 0 0 .5rem;font:inherit;font-size:.875rem;font-weight:500;line-height:1.25rem;color:var(--text-inverted-blue-france);background-color:var(--background-action-high-blue-france);box-shadow:var(--lifted-shadow,0 3px 9px rgba(0,0,18,.16));cursor:pointer;transform:translateY(-50%);transition:background-color .2s}
.assistant-lanceur{--hover:var(--background-action-high-blue-france-hover);--active:var(--background-action-high-blue-france-active)}
.assistant-lanceur::before{--icon-size:1.25rem}
.assistant-lanceur-texte{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap}
.assistant-lanceur-pastille{display:inline-flex;align-items:center;justify-content:center;min-width:1.25rem;height:1.25rem;padding:0 .35rem;border-radius:.625rem;font-size:.75rem;font-weight:700;line-height:1;background:var(--background-flat-warning);color:var(--text-inverted-warning)}
.assistant-entete{flex:0 0 auto;display:flex;align-items:center;gap:.5rem;padding:.25rem .25rem .25rem .75rem;border-bottom:1px solid var(--border-default-grey)}
.assistant-identite{display:flex;align-items:center;gap:.625rem;flex:1 1 auto;min-width:0}
.assistant-avatar{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:50%;color:var(--text-action-high-blue-france);background-color:var(--background-action-low-blue-france)}
.assistant-titre{margin:0;font-size:1rem;line-height:1.5rem;font-weight:700}
.assistant-sous-titre{margin:0;font-size:.75rem;line-height:1rem;color:var(--text-mention-grey)}
/* Une seule ligne d'en-tete : titre, onglets, actions. Le sous-titre (IA ou
   non) reste lu par les lecteurs d'ecran ; le pied le dit aux voyants. */
.assistant-identite{flex:0 1 auto}
.assistant-entete .assistant-onglets{flex:1 1 auto;align-self:stretch;align-items:stretch;justify-content:center;padding:0;border-bottom:0}
.assistant-entete-actions{flex:0 0 auto;display:flex}
.assistant-icone{display:inline-flex;align-items:center;justify-content:center;width:2.75rem;height:2.75rem;margin:0;padding:0;border:0;border-radius:.375rem;color:var(--text-action-high-blue-france);background-color:transparent;cursor:pointer}
.assistant-icone{--hover:var(--background-default-grey-hover);--active:var(--background-default-grey-active)}
.assistant-mode{display:flex;align-items:center;gap:.5rem;margin:0;font-size:.75rem;line-height:1.25rem;color:var(--text-mention-grey)}
.assistant-mode-choix{display:inline-flex;align-items:center;gap:.125rem}
.assistant-mode-choix button{min-height:1.5rem;margin:0;padding:0 .25rem;border:0;border-radius:.25rem;font:inherit;font-size:.75rem;color:var(--text-action-high-blue-france);background:none;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.assistant-mode-choix button,.assistant-mode-bouton{--hover:var(--background-default-grey-hover);--active:var(--background-default-grey-active)}
.assistant-mode-choix button[aria-pressed="true"]{color:var(--text-title-grey);font-weight:700;text-decoration:none;cursor:default}
.assistant-mode-choix button+button::before{content:"·";display:inline-block;text-decoration:none;margin-right:.375rem;color:var(--text-mention-grey);font-weight:400}
.assistant-fil{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:1rem .75rem .5rem;background-color:var(--background-default-grey)}
.assistant-messages{display:flex;flex-direction:column;gap:.75rem;list-style:none;margin:0;padding:0}
.assistant-messages>li{padding:0}
.assistant-message{display:flex;flex-direction:column;align-items:flex-start;max-width:100%}
.assistant-message--utilisateur{align-items:flex-end}
.assistant-bulle{max-width:88%;padding:.5rem .875rem;border-radius:var(--assistant-rayon);font-size:.875rem;line-height:1.5rem;overflow-wrap:anywhere}
.assistant-message--assistant .assistant-bulle,.assistant-message--erreur .assistant-bulle{border-bottom-left-radius:.25rem;color:var(--text-default-grey);background-color:var(--background-alt-grey)}
.assistant-bulle--large{width:100%;max-width:100%}
.assistant-message--utilisateur .assistant-bulle{border-bottom-right-radius:.25rem;color:var(--text-inverted-blue-france);background-color:var(--background-action-high-blue-france)}
.assistant-message--erreur .assistant-bulle{display:flex;gap:.5rem;color:var(--text-default-warning);background-color:var(--background-contrast-warning);box-shadow:inset 3px 0 0 var(--border-plain-warning)}
.assistant-message--erreur .assistant-bulle::before{--icon-size:1rem;flex:0 0 auto;margin-top:.25rem}
.assistant-texte{margin:0;font-size:inherit;line-height:inherit}
.assistant-texte+.assistant-texte{margin-top:.5rem}
.assistant-mention{margin:.375rem 0 0;font-size:.75rem;line-height:1.25rem;color:var(--text-mention-grey)}
.assistant-saisie-en-cours{display:inline-flex;align-items:center;gap:.25rem;margin-top:.75rem;padding:.75rem 1rem;border-radius:var(--assistant-rayon);border-bottom-left-radius:.25rem;background-color:var(--background-alt-grey)}
.assistant-saisie-en-cours span{width:.4375rem;height:.4375rem;border-radius:50%;background-color:var(--text-mention-grey);animation:assistant-points 1.2s infinite ease-in-out}
.assistant-saisie-en-cours span:nth-child(2){animation-delay:.15s}
.assistant-saisie-en-cours span:nth-child(3){animation-delay:.3s}
@keyframes assistant-points{0%,60%,100%{opacity:.35;transform:translateY(0)}30%{opacity:1;transform:translateY(-.1875rem)}}
.assistant-accueil{display:flex;flex-direction:column;align-items:flex-start;gap:.25rem;padding:.5rem .25rem .75rem}
.assistant-accueil .assistant-avatar{width:2.5rem;height:2.5rem;margin-bottom:.5rem}
.assistant-accueil-titre{margin:0;font-size:1.125rem;line-height:1.75rem;font-weight:700}
.assistant-accueil-texte{margin:0 0 .75rem;font-size:.875rem;line-height:1.5rem;color:var(--text-mention-grey)}
.assistant-suggestions{display:flex;flex-direction:column;align-items:flex-start;gap:.5rem;list-style:none;margin:0;padding:0}
.assistant-suggestions>li{padding:0;max-width:100%}
.assistant-suggestion{display:inline-flex;align-items:center;min-height:2.75rem;margin:0;padding:.5rem 1rem;border:1px solid var(--border-default-blue-france);border-radius:1.375rem;font:inherit;font-size:.875rem;line-height:1.25rem;text-align:left;color:var(--text-action-high-blue-france);background-color:var(--background-default-grey);cursor:pointer}
.assistant-suggestion{--hover:var(--background-default-grey-hover);--active:var(--background-default-grey-active)}
.assistant-constats{margin:0 0 .75rem}
.assistant-recap{margin:.75rem 0 0;padding:.75rem;border:1px solid var(--border-default-grey);border-radius:.5rem;background-color:var(--background-default-grey)}
.assistant-recap-titre{display:flex;align-items:center;gap:.375rem;margin:0 0 .5rem;font-size:.875rem;font-weight:700;line-height:1.5rem}
.assistant-recap ul{display:flex;flex-direction:column;gap:.5rem;list-style:none;margin:0;padding:0}
.assistant-recap li{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;padding:0;font-size:.8125rem;line-height:1.25rem}
.assistant-recap-constat{flex:1 1 12rem;min-width:0;display:flex;gap:.375rem}
.assistant-recap-constat::before{--icon-size:1rem;flex:0 0 auto;margin-top:.125rem}
.assistant-recap li[data-gravite="erreur"] .assistant-recap-constat::before{color:var(--text-default-error)}
.assistant-recap li[data-gravite="avertissement"] .assistant-recap-constat::before{color:var(--text-default-warning)}
.assistant-recap .fr-link{margin-top:.75rem;font-size:.8125rem}
.assistant-recap .assistant-remedes{flex:1 1 100%;flex-direction:row;flex-wrap:wrap}
.assistant-actions{display:flex;flex-wrap:wrap;gap:.5rem;margin:.75rem 0 0}
.assistant-bouton{display:inline-flex;align-items:center;gap:.375rem;min-height:2.75rem;margin:0;padding:.5rem 1rem;border:1px solid var(--background-action-high-blue-france);border-radius:.375rem;font:inherit;font-size:.875rem;font-weight:500;line-height:1.25rem;text-decoration:none;color:var(--text-inverted-blue-france);background-color:var(--background-action-high-blue-france);background-image:none;cursor:pointer}
.assistant-bouton{--hover:var(--background-action-high-blue-france-hover);--active:var(--background-action-high-blue-france-active)}
.assistant-bouton::before{--icon-size:1rem}
.assistant-bouton--secondaire{color:var(--text-action-high-blue-france);background-color:var(--background-default-grey);border-color:var(--border-action-high-blue-france)}
.assistant-bouton--secondaire{--hover:var(--background-default-grey-hover);--active:var(--background-default-grey-active)}
.assistant-bouton[aria-disabled="true"]{opacity:.6;cursor:progress}
.assistant-bouton:disabled{opacity:.6;cursor:not-allowed}
.assistant-form{flex:0 0 auto;margin:0;padding:.5rem .75rem 0;background-color:var(--background-default-grey)}
.assistant-composeur{display:flex;align-items:flex-end;gap:.25rem;padding:.25rem .25rem .25rem .875rem;border:1px solid var(--border-plain-grey);border-radius:1.5rem;background-color:var(--background-contrast-grey)}
.assistant-composeur:focus-within{border-color:var(--border-active-blue-france);box-shadow:0 0 0 1px var(--border-active-blue-france)}
.assistant-saisie{flex:1 1 auto;min-width:0;height:2.75rem;max-height:8rem;margin:0;padding:.625rem 0;border:0;font:inherit;font-size:.875rem;line-height:1.5rem;color:var(--text-default-grey);background:transparent;resize:none;overflow-y:auto}
.assistant-saisie:focus,.assistant-saisie:focus-visible{outline:none}
.assistant-saisie::placeholder{color:var(--text-mention-grey);opacity:1}
.assistant-envoi{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:2.75rem;height:2.75rem;margin:0;padding:0;border:0;border-radius:50%;color:var(--text-inverted-blue-france);background-color:var(--background-action-high-blue-france);cursor:pointer}
.assistant-envoi{--hover:var(--background-action-high-blue-france-hover);--active:var(--background-action-high-blue-france-active)}
.assistant-envoi::before{--icon-size:1.25rem}
.assistant-envoi[aria-disabled="true"]{color:var(--text-disabled-grey);background-color:var(--background-disabled-grey);cursor:not-allowed;--hover:var(--background-disabled-grey);--active:var(--background-disabled-grey)}
.assistant-pied{flex:0 0 auto;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.25rem .75rem;margin:0;padding:.375rem .75rem .5rem;font-size:.75rem;line-height:1.25rem;color:var(--text-mention-grey)}
.assistant-pied .fr-link{font-size:inherit}
/* Pastille du bouton « Assistant » (posee par mountAssistant) : visible en
   barre comme dans « Plus d'actions ». */
#assistant-btn[data-count]::after{content:attr(data-count);display:inline-flex;align-items:center;justify-content:center;min-width:1.25rem;height:1.25rem;margin-left:.4rem;padding:0 .35rem;border-radius:.625rem;font-size:.75rem;font-weight:700;line-height:1;background:var(--background-flat-warning);color:var(--text-inverted-warning)}
@media (max-width:47.99em){
  /* La raison de desactivation de la primaire est fixe au-dessus du rail, a
     800 : elle recouvrirait la zone de saisie. Masquee a l'ecran tant que le
     panneau est ouvert ; le lien aria-describedby de la primaire reste. */
  body:has(.assistant-panneau:not([hidden])) .app-action-bar__reason{display:none}
}
@media (max-width:35.98em){
  /* Feuille plein ecran (protos), mais AU-DESSUS du mobilier bas : le rail du
     Diagnostic et la barre d'actions fixe restent visibles et atteignables. */
  .assistant-panneau{top:0;left:0;right:0;width:100%;border:0;border-radius:0;box-shadow:none}
  .assistant-entete{padding-top:calc(.25rem + env(safe-area-inset-top,0px))}
  /* Lanceur : pastille ronde en bas a droite, AU-DESSUS de la barre d'actions
     fixe et du rail du Diagnostic. Le texte reste pour les lecteurs d'ecran. */
  .assistant-lanceur{top:auto;right:1rem;bottom:calc(var(--app-action-bar-fixed-h,0px) + var(--app-diagnostic-h,0px) + 1rem);justify-content:center;width:3.5rem;height:3.5rem;padding:0;border-radius:50%;transform:none}
  .assistant-lanceur-texte{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);border:0;writing-mode:horizontal-tb;transform:none}
  .assistant-lanceur-pastille{position:absolute;top:-.25rem;right:-.25rem}
}
@media (prefers-reduced-motion:reduce){
  .assistant-lanceur{transition:none}
  .assistant-saisie-en-cours span{animation:none;opacity:.6}
  .assistant-fil{scroll-behavior:auto}
}
`;
  document.head.appendChild(style);
}

@customElement('app-assistant')
export class AppAssistant extends LitElement {
  /** App hôte (`builder-carto`), reflétée en `data-app`. */
  @property({ type: String, reflect: true, attribute: 'data-app' })
  app = '';

  @property({ attribute: false })
  messages: readonly MessageAssistant[] = [];

  /** Constats courants : le panneau n'en montre qu'un RÉSUMÉ (les non-info). */
  @property({ attribute: false })
  constats: readonly Constat[] = [];

  /** Au plus trois ; une suggestion remplit le champ sans l'envoyer. */
  @property({ attribute: false })
  suggestions: readonly SuggestionAssistant[] = [];

  /** Phrase d'aide de l'état vide, propre à l'app. */
  @property({ type: String })
  aide = 'Demandez où se trouve un réglage, ou pourquoi l’aperçu reste vide.';

  @property({ type: String, attribute: 'sous-titre' })
  sousTitre = 'Albert, IA de l’État';

  @property({ type: String })
  pied = 'IA de l’État : réponses à vérifier';

  /** Mode de révélation ; la bascule émet `assistant-mode`, le montage persiste. */
  @property({ type: String, reflect: true })
  mode: ModeReperage = 'guider';

  /** Une réponse est attendue : trois points, envoi en `aria-disabled`. */
  @property({ type: Boolean, reflect: true })
  busy = false;

  @property({ type: Boolean, reflect: true })
  open = false;

  /** Affiche « Voir le détail dans le Diagnostic ». */
  @property({ type: Boolean })
  diagnostic = false;

  /** Affiche « Construire pour moi dans le Studio ». */
  @property({ type: Boolean })
  construire = false;

  /** Onglet affiché quand le volet Diagnostic est intégré. */
  @state() private _onglet: 'conversation' | 'diagnostic' = 'conversation';
  /** Volet Diagnostic logé dans l'onglet, ou null (tiroir, ou pas de volet). */
  @state() private _diagnostic: DiagnosticIntegre | null = null;
  /** Erreurs nouvelles relayées par le volet intégré (`diagnostic-annonce`). */
  @state() private _annonceDiagnostic = '';
  /** Vrai pendant que le panneau pilote lui-même le volet : ignore l'écho. */
  private _synchro = false;

  /** Texte de la région `role=status` (attente, nouvelle conversation). */
  @property({ type: String })
  statut = '';

  private readonly _uid = `app-assistant-${++assistantSeq}`;

  /** Id du `section role=dialog` : cible d'`aria-controls` du bouton. */
  readonly panneauId = `${this._uid}-panneau`;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    injectAppAssistantStyles();
    document.addEventListener('diagnostic-toggle', this._onDiagnosticToggle);
    this.addEventListener('diagnostic-annonce', this._onDiagnosticAnnonce);
    // Réouverture après navigation : l'état mémorisé, SANS prendre le focus.
    try {
      if (localStorage.getItem(CLE_ASSISTANT_OUVERT) === '1') this.open = true;
    } catch {
      // Stockage indisponible : le panneau reste réduit.
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('diagnostic-toggle', this._onDiagnosticToggle);
    this.removeEventListener('diagnostic-annonce', this._onDiagnosticAnnonce);
  }

  /**
   * Volet intégré : son ouverture (bouton « Diagnostic » de la barre, « Voir le
   * détail ») ouvre le panneau sur l'onglet Diagnostic ; sa fermeture le
   * referme s'il était affiché. Tiroir : le Diagnostic qui s'ouvre passe
   * devant, l'assistant se réduit. Jamais l'inverse.
   */
  private _onDiagnosticToggle = (e: Event): void => {
    const open = (e as CustomEvent<{ open: boolean }>).detail?.open;
    if (this._diagnostic && e.target === this._diagnostic) {
      if (this._synchro) return;
      if (open) {
        this._onglet = 'diagnostic';
        this.toggle(true, { focus: false });
        this._focusOnglet('diagnostic');
      } else if (this.open && this._onglet === 'diagnostic') {
        this.toggle(false);
      }
      return;
    }
    if (open && this.open) this.toggle(false);
  };

  private _onDiagnosticAnnonce = (e: Event): void => {
    this._annonceDiagnostic = (e as CustomEvent<{ texte: string }>).detail?.texte ?? '';
  };

  /**
   * Loge le volet Diagnostic dans l'onglet du même nom. Le volet passe en mode
   * `integre` AVANT d'être déplacé : son `connectedCallback` le lit.
   */
  integrerDiagnostic(el: HTMLElement): void {
    const volet = el as DiagnosticIntegre;
    volet.setAttribute('integre', '');
    this._diagnostic = volet;
    void this.updateComplete.then(() => {
      this.querySelector('.assistant-detail')?.appendChild(volet);
    });
  }

  /** Le panneau pilote le volet (onglet, réduction) sans provoquer d'écho. */
  private _synchroniserDiagnostic(open: boolean): void {
    const volet = this._diagnostic;
    if (!volet || volet.isOpen === open) return;
    this._synchro = true;
    try {
      volet.toggle(open);
    } finally {
      this._synchro = false;
    }
  }

  private _choisirOnglet(onglet: 'conversation' | 'diagnostic', focus = false): void {
    this._onglet = onglet;
    this._synchroniserDiagnostic(onglet === 'diagnostic');
    if (focus) this._focusOnglet(onglet);
  }

  private _focusOnglet(onglet: 'conversation' | 'diagnostic'): void {
    void this.updateComplete.then(() => {
      this.querySelector<HTMLButtonElement>(`#${this._uid}-onglet-${onglet}`)?.focus();
    });
  }

  /** Motif WAI-ARIA « Tabs » à deux onglets : flèches, Début et Fin. */
  private _onOngletKeydown(e: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const suivant =
      e.key === 'Home'
        ? 'conversation'
        : e.key === 'End'
          ? 'diagnostic'
          : this._onglet === 'conversation'
            ? 'diagnostic'
            : 'conversation';
    this._choisirOnglet(suivant, true);
  }

  /**
   * Ouvre, réduit, ou bascule. Ouvrir place le focus dans le champ (sauf
   * `{ focus: false }`) ; `{ lanceur: true }` note que la languette a ouvert.
   * Réduire émet `focusDedans` et `parLanceur` : si la languette a ouvert, le
   * panneau lui rend le focus lui-même ; sinon `mountAssistant` le rend au
   * bouton de la barre.
   */
  toggle(open?: boolean, options: { focus?: boolean; lanceur?: boolean } = {}): void {
    const suivant = open ?? !this.open;
    if (suivant === this.open) {
      if (suivant && options.focus !== false) this.champ?.focus();
      return;
    }
    const focusDedans =
      this.contains(document.activeElement) && document.activeElement !== this.lanceur;
    if (suivant) this._parLanceur = options.lanceur === true;
    const parLanceur = this._parLanceur;
    this.open = suivant;
    // Réduit, le panneau rouvrira sur la conversation ; le volet intégré suit.
    if (!suivant) {
      this._onglet = 'conversation';
      this._synchroniserDiagnostic(false);
    }
    try {
      localStorage.setItem(CLE_ASSISTANT_OUVERT, suivant ? '1' : '0');
    } catch {
      // Stockage indisponible : l'état reste en mémoire.
    }
    this.dispatchEvent(
      new CustomEvent('assistant-toggle', {
        detail: { open: suivant, focusDedans, parLanceur },
        bubbles: true,
        composed: true,
      })
    );
    if (suivant && options.focus !== false && this._onglet === 'conversation') {
      void this.updateComplete.then(() => {
        this.champ?.focus();
        this._defilerEnBas();
      });
    }
    if (!suivant && focusDedans && parLanceur) this.focusLanceur();
  }

  /** La languette a-t-elle ouvert le volet (déclencheur effectif) ? */
  private _parLanceur = false;

  /** La languette flottante. */
  get lanceur(): HTMLButtonElement | null {
    return this.querySelector<HTMLButtonElement>('.assistant-lanceur');
  }

  /** Focus sur la languette, une fois démasquée (après le rendu). */
  focusLanceur(): void {
    void this.updateComplete.then(() => this.lanceur?.focus());
  }

  /** Le champ de saisie. */
  get champ(): HTMLTextAreaElement | null {
    return this.querySelector<HTMLTextAreaElement>('.assistant-saisie');
  }

  /** Constats non-info : ceux que compte la pastille du rail. */
  get constatsResumes(): readonly Constat[] {
    return this.constats.filter((c) => c.gravite !== 'info');
  }

  /** Remplit le champ SANS envoyer, et sélectionne la partie à compléter. */
  remplir(s: SuggestionAssistant): void {
    const champ = this.champ;
    if (!champ) return;
    champ.value = s.texte;
    this._ajusterSaisie();
    champ.focus();
    const i = s.aCompleter ? s.texte.indexOf(s.aCompleter) : -1;
    if (i >= 0 && s.aCompleter) champ.setSelectionRange(i, i + s.aCompleter.length);
    else champ.setSelectionRange(champ.value.length, champ.value.length);
  }

  private _emettre(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  /**
   * « Me montrer » : en plein écran, le panneau masquerait le contrôle — il se
   * réduit d'abord (sans rendre le focus au bouton : `montrer()` s'en charge
   * selon le mode). Sur un écran large, il reste ouvert.
   */
  private _montrer(repere: string | undefined): void {
    if (!repere || this.busy) return;
    if (this.open && this._pleinEcran()) {
      (document.activeElement as HTMLElement | null)?.blur?.();
      this.toggle(false);
    }
    this._emettre('assistant-montrer', { repere });
  }

  private _pleinEcran(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia(PLEIN_ECRAN_QUERY).matches;
  }

  private _choisirMode(mode: ModeReperage): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this._emettre('assistant-mode', { mode });
  }

  private _envoyer(e: Event): void {
    e.preventDefault();
    const champ = this.champ;
    if (!champ || this.busy) return;
    const question = champ.value.trim();
    if (!question) return;
    champ.value = '';
    this._ajusterSaisie();
    this._emettre('assistant-envoyer', { question });
  }

  /** Entrée envoie, Maj+Entrée va à la ligne, rien pendant une composition IME. */
  private _onChampKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    this._envoyer(e);
  }

  /** Échap réduit le panneau (il n'est pas modal). */
  private _onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || !this.open) return;
    e.stopPropagation();
    this.toggle(false);
  }

  /** Une ligne, qui grandit avec le texte jusqu'à `HAUTEUR_MAX_SAISIE`. */
  private _ajusterSaisie(): void {
    const champ = this.champ;
    if (!champ) return;
    champ.style.height = 'auto';
    champ.style.height = `${Math.min(champ.scrollHeight, HAUTEUR_MAX_SAISIE)}px`;
  }

  private _defilerEnBas(): void {
    const fil = this.querySelector<HTMLElement>('.assistant-fil');
    if (fil) fil.scrollTop = fil.scrollHeight;
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('messages') || changed.has('busy')) this._defilerEnBas();
  }

  // --- Rendu ---

  private _renderAccueil(): TemplateResult {
    const suggestions = this.suggestions.slice(0, MAX_SUGGESTIONS);
    return html`<div class="assistant-accueil" ?hidden=${this.messages.length > 0}>
      <span class="assistant-avatar fr-icon-sparkling-2-line" aria-hidden="true"></span>
      <p class="assistant-accueil-titre">Bonjour, que puis-je faire pour vous ?</p>
      <p class="assistant-accueil-texte">
        ${this.aide.includes(PHRASE_SUGGESTION) ? this.aide : `${this.aide} ${PHRASE_SUGGESTION}`}
      </p>
      ${
        suggestions.length > 0
          ? html`<ul class="assistant-suggestions" aria-label="Suggestions">
              ${suggestions.map(
                (s) =>
                  html`<li>
                    <button
                      type="button"
                      class="assistant-suggestion"
                      @click=${() => this.remplir(s)}
                    >
                      ${s.texte}
                    </button>
                  </li>`
              )}
            </ul>`
          : nothing
      }
    </div>`;
  }

  /** Résumé des constats : une bulle de l'assistant, HORS du `role=log`. */
  private _renderConstats(): TemplateResult | typeof nothing {
    const resumes = this.constatsResumes;
    if (resumes.length === 0) return nothing;
    const titreId = `${this._uid}-constats`;
    const n = resumes.length;
    return html`<section class="assistant-constats" aria-labelledby=${titreId}>
      <div class="assistant-message assistant-message--assistant">
        <div class="assistant-bulle assistant-bulle--large">
          <div class="assistant-recap">
            <h3 class="assistant-recap-titre fr-icon-warning-line" id=${titreId}>
              ${n} constat${n > 1 ? 's' : ''} à corriger
            </h3>
            <ul>
              ${resumes.map((c, i) => {
                const id = `${titreId}-${i}`;
                const remedes = c.remedes ?? [];
                return html`<li data-gravite=${c.gravite}>
                  <span class="assistant-recap-constat ${ICONES_GRAVITE[c.gravite]}" id=${id}
                    ><span class="fr-sr-only">${LIBELLES_GRAVITE[c.gravite]} : </span
                    >${c.titre}</span
                  >
                  ${
                    remedes.length > 0
                      ? this._renderRemedes(remedes, id)
                      : html`<button
                          type="button"
                          class="assistant-bouton assistant-bouton--secondaire fr-icon-eye-line"
                          aria-describedby=${id}
                          ?disabled=${c.reperes.length === 0}
                          @click=${() => this._montrer(c.reperes[0])}
                        >
                          Me montrer
                        </button>`
                  }
                </li>`;
              })}
            </ul>
            ${
              this.diagnostic || this._diagnostic
                ? html`<button
                    type="button"
                    class="fr-link fr-icon-arrow-right-line fr-link--icon-right"
                    @click=${() =>
                      this._diagnostic
                        ? this._choisirOnglet('diagnostic', true)
                        : this._emettre('assistant-diagnostic')}
                  >
                    Voir le détail dans le Diagnostic
                  </button>`
                : nothing
            }
          </div>
        </div>
      </div>
    </section>`;
  }

  /**
   * Remèdes au choix d'un constat (#1021) : un bouton par remède, qui montre
   * son repère — le même `assistant-montrer` que « Me montrer ». Chaque
   * bouton est décrit par le titre du constat.
   */
  private _renderRemedes(remedes: readonly RemedeConstat[], constatId: string): TemplateResult {
    return html`<ul class="assistant-remedes" aria-label="Remèdes au choix">
      ${remedes.map(
        (r) =>
          html`<li>
            <button
              type="button"
              class="assistant-bouton assistant-bouton--secondaire fr-icon-eye-line"
              aria-describedby=${constatId}
              data-remede=${r.repere}
              @click=${() => this._montrer(r.repere)}
            >
              ${r.libelle}
            </button>
          </li>`
      )}
    </ul>`;
  }

  private _renderCandidat(c: CandidatAssistant): TemplateResult {
    const chemin = c.chemin.join(' › ');
    return html`<button
      type="button"
      class="assistant-bouton assistant-bouton--secondaire fr-icon-eye-line"
      title=${chemin || nothing}
      aria-disabled=${this.busy ? 'true' : 'false'}
      @click=${() => this._montrer(c.id)}
    >
      ${c.libelle}
    </button>`;
  }

  private _renderMessage(m: MessageAssistant): TemplateResult {
    const usager = m.role === 'usager';
    const classe = m.erreur ? 'erreur' : usager ? 'utilisateur' : 'assistant';
    const candidats = m.candidats ?? [];
    const actions = candidats.length > 0 || !!m.continuer;
    return html`<li class="assistant-message assistant-message--${classe}">
      <h3 class="fr-sr-only">${usager ? 'Votre message' : 'Réponse de l’assistant'}</h3>
      <div class="assistant-bulle ${m.erreur ? 'fr-icon-warning-line' : ''}">
        <div>
          ${paragraphesDe(m.texte).map(
            (lignes) =>
              html`<p class="assistant-texte">
                ${lignes.map((l, i) => (i > 0 ? html`<br />${l}` : l))}
              </p>`
          )}
          ${
            actions
              ? html`<div class="assistant-actions">
                  ${candidats.map((c) => this._renderCandidat(c))}
                  ${
                    m.continuer
                      ? html`<button
                          type="button"
                          class="assistant-bouton fr-icon-arrow-right-line"
                          aria-disabled=${this.busy ? 'true' : 'false'}
                          @click=${() => this._montrer(m.continuer)}
                        >
                          Continuer
                        </button>`
                      : nothing
                  }
                </div>`
              : nothing
          }
          ${
            m.role === 'assistant' && m.source === 'modele'
              ? html`<p class="assistant-mention">Réponse rédigée par Albert, à vérifier.</p>`
              : nothing
          }
        </div>
      </div>
    </li>`;
  }

  /**
   * Préférence « Dire » / « Guider », sous le champ de saisie : elle prenait
   * une bande entière au-dessus du fil. `assistant-mode-bouton` nomme ces
   * boutons pour la recette des boutons (`e2e/buttons.spec.ts`, #1118) ; le
   * style reste porté par `.assistant-mode-choix button`.
   */
  private _renderMode(): TemplateResult {
    return html`
      <div class="assistant-mode">
        <span id=${`${this._uid}-mode`}>Me montrer un réglage :</span>
        <div class="assistant-mode-choix" role="group" aria-labelledby=${`${this._uid}-mode`}>
          <button
            type="button"
            class="assistant-mode-bouton"
            aria-pressed=${this.mode === 'dire' ? 'true' : 'false'}
            title="Le surligner et annoncer son chemin, sans déplacer le focus"
            @click=${() => this._choisirMode('dire')}
          >
            Dire
          </button>
          <button
            type="button"
            class="assistant-mode-bouton"
            aria-pressed=${this.mode === 'guider' ? 'true' : 'false'}
            title="Y amener l’écran et le focus"
            @click=${() => this._choisirMode('guider')}
          >
            Guider
          </button>
        </div>
      </div>
    `;
  }

  /** Onglets Conversation / Diagnostic, seulement avec un volet intégré. */
  private _renderOnglets(): TemplateResult | typeof nothing {
    if (!this._diagnostic) return nothing;
    const onglet = (id: 'conversation' | 'diagnostic', libelle: string) =>
      html`<button
        type="button"
        role="tab"
        class="assistant-onglet"
        id=${`${this._uid}-onglet-${id}`}
        aria-selected=${this._onglet === id ? 'true' : 'false'}
        aria-controls=${`${this._uid}-panneau-${id}`}
        tabindex=${this._onglet === id ? '0' : '-1'}
        @click=${() => this._choisirOnglet(id)}
      >
        ${libelle}
      </button>`;
    return html`<div
      class="assistant-onglets"
      role="tablist"
      aria-label="Vues de l’assistant"
      @keydown=${this._onOngletKeydown}
    >
      ${onglet('conversation', 'Conversation')} ${onglet('diagnostic', 'Diagnostic')}
    </div>`;
  }

  render() {
    const titreId = `${this._uid}-titre`;
    const champId = `${this._uid}-saisie`;
    const n = this.constatsResumes.length;
    return html`
      <button
        type="button"
        class="assistant-lanceur fr-icon-sparkling-2-line"
        title="Ouvrir l’assistant"
        aria-expanded=${this.open ? 'true' : 'false'}
        aria-controls=${this.panneauId}
        ?hidden=${this.open}
        @click=${() => this.toggle(true, { lanceur: true })}
      >
        <span class="assistant-lanceur-texte">Assistant</span>
        ${
          n > 0
            ? html`<span class="assistant-lanceur-pastille" aria-hidden="true">${n}</span
                ><span class="fr-sr-only">, ${n} constat${n > 1 ? 's' : ''} à corriger</span>`
            : nothing
        }
      </button>
      ${
        this._diagnostic
          ? html`<p class="fr-sr-only" aria-live="polite" data-annonce-constats>
              ${this._annonceDiagnostic}
            </p>`
          : nothing
      }
      <section
        class="assistant-panneau"
        id=${this.panneauId}
        role="dialog"
        aria-modal="false"
        aria-labelledby=${titreId}
        ?hidden=${!this.open}
        @keydown=${this._onKeydown}
      >
        <div class="assistant-entete">
          <div class="assistant-identite">
            <span
              class="assistant-avatar fr-icon-sparkling-2-line fr-icon--sm"
              aria-hidden="true"
            ></span>
            <div>
              <h2 class="assistant-titre" id=${titreId}>Assistant</h2>
              <p class="assistant-sous-titre fr-sr-only">${this.sousTitre}</p>
            </div>
          </div>
          ${this._renderOnglets()}
          <div class="assistant-entete-actions">
            <button
              type="button"
              class="assistant-icone"
              title="Nouvelle conversation"
              @click=${() => {
                if (!this.busy) this._emettre('assistant-nouvelle');
              }}
            >
              <span class="fr-icon-refresh-line fr-icon--sm" aria-hidden="true"></span>
              <span class="fr-sr-only">Nouvelle conversation</span>
            </button>
            <button
              type="button"
              class="assistant-icone"
              title="Réduire l’assistant"
              @click=${() => this.toggle(false)}
            >
              <span class="fr-icon-subtract-line fr-icon--sm" aria-hidden="true"></span>
              <span class="fr-sr-only">Réduire l’assistant</span>
            </button>
          </div>
        </div>
        <div
          class="assistant-conversation"
          id=${`${this._uid}-panneau-conversation`}
          role=${this._diagnostic ? 'tabpanel' : nothing}
          aria-labelledby=${this._diagnostic ? `${this._uid}-onglet-conversation` : nothing}
          ?hidden=${this._onglet !== 'conversation'}
        >
          <div class="assistant-fil" tabindex="0" role="region" aria-label="Fil de l’assistant">
            ${this._renderAccueil()} ${this._renderConstats()}
            <ol
              class="assistant-messages"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label="Conversation avec l’assistant"
            >
              ${this.messages.map((m) => this._renderMessage(m))}
            </ol>
            <div class="assistant-saisie-en-cours" aria-hidden="true" ?hidden=${!this.busy}>
              <span></span><span></span><span></span>
            </div>
          </div>
          <p class="fr-sr-only" role="status">${this.statut}</p>
          <form class="assistant-form" @submit=${this._envoyer}>
            <label class="fr-sr-only" for=${champId}
              >Votre message pour l’assistant (Entrée pour envoyer, Maj+Entrée pour aller à la
              ligne)</label
            >
            <div class="assistant-composeur">
              <textarea
                class="assistant-saisie"
                id=${champId}
                rows="1"
                maxlength="2000"
                placeholder="Posez votre question…"
                aria-keyshortcuts="Enter"
                @input=${this._ajusterSaisie}
                @keydown=${this._onChampKeydown}
              ></textarea>
              <button
                type="submit"
                class="assistant-envoi fr-icon-send-plane-fill"
                title="Envoyer"
                aria-disabled=${this.busy ? 'true' : 'false'}
              >
                <span class="fr-sr-only">Envoyer</span>
              </button>
            </div>
          </form>
          <div class="assistant-pied">
            ${this._renderMode()}
            <span class="fr-sr-only">${this.pied}</span>
            ${
              this.construire
                ? html`<button
                    type="button"
                    class="fr-link"
                    @click=${() => this._emettre('assistant-construire')}
                  >
                    Construire pour moi dans le Studio
                  </button>`
                : nothing
            }
          </div>
        </div>
        ${
          this._diagnostic
            ? html`<div
                class="assistant-detail"
                id=${`${this._uid}-panneau-diagnostic`}
                role="tabpanel"
                tabindex="-1"
                aria-labelledby=${`${this._uid}-onglet-diagnostic`}
                ?hidden=${this._onglet !== 'diagnostic'}
              ></div>`
            : nothing
        }
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-assistant': AppAssistant;
  }
}

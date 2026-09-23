import { LitElement, html, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  compterAlertes,
  fieldMatrix,
  formatTrace,
  plural,
  summarizeTrace,
  topoOrder,
  type Constat,
  type GraviteConstat,
  type StageNode,
  type StageState,
  type Trace,
} from '@dsfr-data/shared';

/**
 * <app-diagnostic-panel> — le volet **Diagnostic** (#605)
 *
 * Un tiroir en bas de page qui montre ce qui transite entre les composants
 * d'un pipeline : combien de lignes à chaque étape, quels champs
 * apparaissent et disparaissent, et où ça casse.
 *
 * **Pourquoi un tiroir et pas un onglet.** `app-preview-panel` n'existe que
 * dans trois apps, `app-action-bar` dans sept. Et `docs/ux/actions.md` §1
 * tranche : « un onglet n'est pas une action ». Le diagnostic n'agit sur
 * rien, c'est une loupe transversale — même place dans toutes les apps.
 *
 * **Le rail replié porte déjà l'information** (`3 étapes · 100 → 8 lignes ·
 * 1 alerte`). Si l'état fermé n'était qu'un bouton, personne ne l'ouvrirait.
 *
 * **Deux modes.** `live` : le volet observe un pipeline via `setTrace()`.
 * `rapporte` : il affiche une trace qu'on lui a donnée (collée, transmise
 * par une autre app, reçue dans une conversation). Le second rend le volet
 * utile là où il n'y a rien à observer — l'Assistant IA rend son aperçu sans
 * aucun composant dsfr-data, donc sans trafic sur le bus.
 *
 * **Intégré à l'assistant.** Dans les apps qui ont l'assistant contextuel,
 * `mountAssistant({ diagnostic })` loge le volet dans l'onglet « Diagnostic »
 * du panneau et pose l'attribut `integre` : plus de rail en bas d'écran, le
 * corps est toujours rendu, et l'assistant porte l'unique compteur de
 * constats. `toggle()` garde son sens — l'assistant écoute
 * `diagnostic-toggle` et ouvre, ou referme, son onglet. Le Studio et l'ancien
 * Assistant IA, sans assistant contextuel, gardent le tiroir.
 *
 * Light DOM pour hériter des styles DSFR.
 *
 * @fires diagnostic-copy - Le diagnostic textuel a été copié.
 * @fires diagnostic-send - { text } « Demander à l'assistant » (geste selon `sendAction`).
 * @fires diagnostic-toggle - { open } ouverture/fermeture du tiroir (ou de l'onglet, intégré).
 * @fires diagnostic-annonce - { texte } intégré seulement : erreurs nouvelles à
 *   annoncer. Le panneau de l'assistant peut être masqué, une région `aria-live`
 *   à l'intérieur se tairait : l'assistant la rend hors du panneau.
 * @fires constat-montrer - { repere, constat } l'usager demande à voir le
 *   contrôle qui corrige un constat (#1001). Le volet ne résout rien lui-même :
 *   l'app branche `montrer()` (#1005).
 *
 * **Une seule source de pannes (#1001).** Les marqueurs des cartes d'étape,
 * la pastille du rail, le compte d'alertes et l'onglet Constats lisent tous
 * `constats` — la sortie de `evaluerConstats` (#996). Le volet ne calcule
 * plus lui-même ce qui est une panne.
 */

const STORAGE_KEY = 'dsfr-data-diagnostic-open';
const REDACT_KEY = 'dsfr-data-diagnostic-redact';
const TABS = ['constats', 'flux', 'champs', 'journal'] as const;
type DiagnosticTab = (typeof TABS)[number];

const TAB_LABELS: Record<DiagnosticTab, string> = {
  constats: 'Constats',
  flux: 'Flux',
  champs: 'Champs',
  journal: 'Journal',
};

const ICONES_GRAVITE: Record<GraviteConstat, string> = {
  erreur: 'fr-icon-error-warning-line',
  avertissement: 'fr-icon-warning-line',
  info: 'fr-icon-information-line',
};

/** Gravité dite au lecteur d'écran : l'icône et la couleur ne la portent pas seules. */
const LIBELLES_GRAVITE: Record<GraviteConstat, string> = {
  erreur: 'Erreur',
  avertissement: 'Avertissement',
  info: 'Information',
};

/** Marque d'une note d'étape, selon la gravité du constat qu'elle rend. */
const MARQUES_GRAVITE: Record<GraviteConstat, string> = {
  erreur: '✗',
  avertissement: '⚠',
  info: 'ℹ',
};

let panelSeq = 0;

export function injectAppDiagnosticStyles(): void {
  if (document.getElementById('app-diagnostic-panel-style')) return;
  const style = document.createElement('style');
  style.id = 'app-diagnostic-panel-style';
  // z-index 780 : au-dessus du contenu et de la barre d'actions collante
  // (700), mais SOUS la barre d'actions fixe du mobile (800) — sinon le
  // tiroir masquerait le geste primaire de l'app.
  style.textContent = `
app-diagnostic-panel{position:fixed;left:0;right:0;bottom:0;z-index:780;display:block;font-size:.875rem}
app-diagnostic-panel[hidden]{display:none}
app-diagnostic-panel[integre]{position:static;z-index:auto}
.app-diag--integre{background:none;border-top:0;box-shadow:none}
.app-diag--integre .app-diag__body{max-height:none;overflow:visible;border-top:0;padding:0}
.app-diag--integre .app-diag__toolbar{justify-content:flex-start;padding-top:0}
.app-diag__resume{margin:0 0 .5rem;color:var(--text-mention-grey);font-size:.8125rem;font-variant-numeric:tabular-nums}
.app-diag{background:var(--background-default-grey);border-top:1px solid var(--border-default-grey);box-shadow:0 -4px 12px rgba(0,0,0,.08)}
.app-diag__rail{display:flex;align-items:center;gap:.75rem;width:100%;padding:.4rem 1rem;margin:0;border:0;background:none;color:var(--text-title-grey);font:inherit;font-weight:500;text-align:left;cursor:pointer;min-height:2.25rem}
.app-diag__rail:hover{background:var(--background-alt-grey)}
.app-diag__rail:focus-visible{outline:2px solid var(--border-active-blue-france);outline-offset:-2px}
.app-diag__rail-title{display:flex;align-items:center;gap:.4rem;flex:0 0 auto}
.app-diag__rail-summary{flex:1 1 auto;min-width:0;color:var(--text-mention-grey);font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.app-diag__rail-chevron{flex:0 0 auto;color:var(--text-mention-grey)}
.app-diag__alert{color:var(--text-default-warning);font-weight:500}
.app-diag__ok{color:var(--text-default-success)}
.app-diag__body{max-height:min(48vh,26rem);overflow:auto;border-top:1px solid var(--border-default-grey);padding:.5rem 1rem 1rem}
.app-diag__toolbar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;justify-content:flex-end;padding:.5rem 0}
.app-diag__tabs{display:flex;gap:.25rem;flex:1 1 auto}
.app-diag__redact{display:flex;align-items:center;gap:.35rem;font-size:.8125rem;color:var(--text-mention-grey)}
.app-diag__redact label{cursor:pointer}
.app-diag__tab{padding:.35rem .85rem;border:0;border-bottom:2px solid transparent;background:none;color:var(--text-mention-grey);font:inherit;font-size:.875rem;cursor:pointer}
.app-diag__tab[aria-selected="true"]{color:var(--text-active-blue-france);border-bottom-color:var(--border-active-blue-france);font-weight:500}
.app-diag__tab:focus-visible{outline:2px solid var(--border-active-blue-france);outline-offset:-2px}
.app-diag__empty{padding:1.5rem 0;color:var(--text-mention-grey)}
.app-diag__partial{margin:.5rem 0 0;padding:.5rem .75rem;background:var(--background-contrast-warning);color:var(--text-default-warning);font-size:.8125rem}
.app-diag__chain{display:flex;flex-wrap:wrap;gap:.5rem;align-items:stretch}
.app-diag__stage{flex:1 1 12rem;min-width:11rem;border:1px solid var(--border-default-grey);padding:.6rem .7rem;background:var(--background-alt-grey)}
.app-diag__stage[data-status="error"]{border-left:3px solid var(--border-plain-error)}
.app-diag__stage[data-status="loaded"]{border-left:3px solid var(--border-plain-success)}
.app-diag__stage[data-warn="true"]{border-left:3px solid var(--border-plain-warning)}
.app-diag__stage-id{font-weight:700;color:var(--text-title-grey)}
.app-diag__stage-tag{color:var(--text-mention-grey);font-size:.75rem;word-break:break-all}
.app-diag__stage-rows{margin-top:.35rem;font-variant-numeric:tabular-nums}
.app-diag__stage-note{margin-top:.25rem;font-size:.8125rem;color:var(--text-mention-grey)}
.app-diag__stage-note--warn{color:var(--text-default-warning)}
.app-diag__stage-note--error{color:var(--text-default-error);word-break:break-word}
.app-diag__table-wrap{overflow-x:auto}
.app-diag table{width:100%;border-collapse:collapse;font-size:.8125rem}
.app-diag th,.app-diag td{padding:.3rem .5rem;text-align:left;border-bottom:1px solid var(--border-default-grey);white-space:nowrap}
.app-diag th{color:var(--text-mention-grey);font-weight:500}
.app-diag td[data-absent="true"]{color:var(--text-disabled-grey)}
.app-diag__journal{margin:0;padding:0;list-style:none;font-variant-numeric:tabular-nums}
.app-diag__journal li{display:flex;gap:.6rem;padding:.25rem 0;border-bottom:1px solid var(--border-default-grey)}
.app-diag__journal-kind{flex:0 0 5.5rem;color:var(--text-mention-grey);font-size:.75rem;text-transform:uppercase;letter-spacing:.04em}
.app-diag__journal-body{flex:1 1 auto;min-width:0;word-break:break-word}
.app-diag__badge{display:inline-flex;align-items:center;justify-content:center;min-width:1.25rem;height:1.25rem;padding:0 .35rem;border-radius:.625rem;font-size:.75rem;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;background:var(--background-flat-warning);color:var(--text-inverted-warning)}
.app-diag__badge[data-gravite="erreur"]{background:var(--background-flat-error);color:var(--text-inverted-error)}
.app-diag__constats{margin:0;padding:0;list-style:none}
.app-diag__constat{padding:.6rem .75rem;margin-bottom:.5rem;border:1px solid var(--border-default-grey);border-left:3px solid var(--border-plain-info);background:var(--background-alt-grey)}
.app-diag__constat[data-gravite="erreur"]{border-left-color:var(--border-plain-error)}
.app-diag__constat[data-gravite="avertissement"]{border-left-color:var(--border-plain-warning)}
.app-diag__constat p{margin:0 0 .35rem;font-size:.8125rem}
.app-diag__constat-titre{display:flex;gap:.4rem;align-items:baseline;font-weight:700;color:var(--text-title-grey)}
.app-diag__constat[data-gravite="erreur"] .app-diag__constat-icone{color:var(--text-default-error)}
.app-diag__constat[data-gravite="avertissement"] .app-diag__constat-icone{color:var(--text-default-warning)}
.app-diag__constat[data-gravite="info"] .app-diag__constat-icone{color:var(--text-default-info)}
.app-diag__constat-preuve{color:var(--text-mention-grey);word-break:break-word}
.app-diag__constat .fr-btn{margin-top:.15rem}
/* Le rail masquerait le bas du contenu : on lui reserve sa hauteur.
   La double :has monte la specificite au-dessus de la regle mobile de
   app-action-bar, qui pose deja un padding-bottom sur body — sinon le
   gagnant dependrait de l'ordre d'injection des feuilles. */
body:has(app-diagnostic-panel:not([integre])){padding-bottom:var(--app-diagnostic-h,2.25rem)}
/* Le padding reserve la place, l'ancrage du defilement est un reglage a part
   (WCAG 2.2 SC 2.4.11, #627) : sans lui, un element amene au focus se range
   sous le rail. Le rail est fixe a TOUTES les largeurs, la regle l'est donc
   aussi — c'est le cumul avec la barre d'actions qui, lui, est mobile. */
html:has(app-diagnostic-panel:not([integre])){scroll-padding-bottom:var(--app-diagnostic-h,2.25rem)}
@media (max-width:47.99em){
  app-diagnostic-panel{bottom:var(--app-action-bar-fixed-h,0px)}
  /* La raison de desactivation de l'action primaire est FIXE dans la meme
     bande que le rail (bottom: --app-action-bar-fixed-h) et peint a 800.
     Tant que app-action-bar etait un contexte d'empilement a 700, elle
     restait enfermee SOUS le rail ; depuis qu'elle ne l'est plus en mobile
     (l'epinglage a recu sa garde), elle le RECOUVRE et rend son bouton
     inatteignable au pointeur comme au clavier (WCAG 2.2 SC 2.4.11). On
     l'empile au-dessus du rail plutot que de la laisser le masquer.
     Le Builder y echappait par reason-host ; les six autres apps a barre
     d'actions, non. Meme double :has, meme raison, que le padding ci-dessous :
     gagner quel que soit l'ordre d'injection des feuilles. */
  body:has(app-diagnostic-panel:not([integre])) .app-action-bar__reason{bottom:calc(var(--app-action-bar-fixed-h,3.5rem) + var(--app-diagnostic-h,2.25rem))}
  .app-diag__body{max-height:60vh}
  .app-diag__rail-summary{display:none}
  body:has(app-diagnostic-panel:not([integre])):has(app-action-bar){padding-bottom:calc(var(--app-action-bar-fixed-h,3.5rem) + var(--app-diagnostic-h,2.25rem))}
  html:has(app-diagnostic-panel:not([integre])):has(app-action-bar){scroll-padding-bottom:calc(var(--app-action-bar-fixed-h,3.5rem) + var(--app-diagnostic-h,2.25rem))}
}
`;
  document.head.appendChild(style);
}

@customElement('app-diagnostic-panel')
export class AppDiagnosticPanel extends LitElement {
  /** Trace affichée. `null` = rien observé pour l'instant. */
  @property({ attribute: false })
  trace: Trace | null = null;

  /**
   * `live` : le volet observe un pipeline. `rapporte` : il rend une trace
   * qu'on lui a transmise — le seul mode possible là où aucun composant
   * dsfr-data ne tourne.
   */
  @property({ type: String })
  mode: 'live' | 'rapporte' = 'live';

  /** Affiche le bouton vers l'assistant (voir `sendAction`). */
  @property({ type: Boolean, attribute: 'can-send' })
  canSend = false;

  /**
   * Geste du bouton « Demander à l'assistant » (#1016). Un seul libellé
   * depuis #1081, deux gestes :
   * - `envoyer` (défaut) : le texte du diagnostic est posé, NON envoyé, dans
   *   le chat de l'app (Studio IA, ancien Assistant IA) ; désactivé sans
   *   trace, puisqu'il n'y a alors rien à poser ;
   * - `demander` : l'app ouvre son assistant contextuel sans quitter l'écran
   *   (Carto, Builder…) ; actif même sans trace.
   * Dans les deux cas le volet émet `diagnostic-send` : l'app décide.
   */
  @property({ type: String, attribute: 'send-action' })
  sendAction: 'envoyer' | 'demander' = 'envoyer';

  /** Explique l'absence de trace quand l'app sait pourquoi. */
  @property({ type: String, attribute: 'empty-hint' })
  emptyHint = '';

  /**
   * La trace a ete RECONSTITUEE depuis le cache, faute de tampon precoce.
   *
   * Il manque alors la chronologie et — surtout — les erreurs, qui ne
   * laissent aucune trace en cache. Un echec rapide y devient invisible. Le
   * volet doit le dire : une trace partielle presentee comme complete est
   * exactement le faux calme que ce module existe pour empecher.
   */
  @property({ type: Boolean, attribute: 'partial-trace' })
  partialTrace = false;

  /**
   * Constats de la trace, posés par `mountDiagnosticPanel` à chaque changement
   * de trace (#1001), avec le contexte et les règles de l'app.
   *
   * C'est `evaluerConstats` qui décide de ce qu'est une panne, jamais le
   * volet : il ne fait que rendre cette liste (marqueurs d'étape, pastille,
   * compte d'alertes, onglet Constats).
   */
  @property({ attribute: false })
  constats: readonly Constat[] = [];

  /**
   * Logé dans l'onglet « Diagnostic » de l'assistant (posé par
   * `integrerDiagnostic`). Ni rail, ni position fixe, ni mémoire d'ouverture :
   * c'est l'assistant qui s'ouvre et se referme.
   */
  @property({ type: Boolean, reflect: true })
  integre = false;

  @state() private _open = false;
  /**
   * Masque les VALEURS dans le diagnostic copié ou envoyé.
   *
   * Copier le diagnostic le sort du navigateur ; l'envoyer à l'assistant
   * l'envoie à un service externe. Pour une source ministérielle, on veut le
   * diagnostic sans les données — comptes et noms de champs suffisent à
   * expliquer une chaîne cassée. Réglage unique : ce que voit l'utilisateur
   * et ce que reçoit l'assistant restent le même texte.
   */
  @state() private _redact = false;
  /** Onglet affiché ; choisi à chaque ouverture par `_ongletAOuvrir()`. */
  @state() private _tab: DiagnosticTab = 'flux';
  @state() private _copied = false;
  /** Dernière annonce `aria-live` : l'arrivée d'un constat d'erreur. */
  @state() private _annonce = '';

  /** Constats effectivement rendus, recalculés quand la trace ou `constats` change. */
  private _constats: readonly Constat[] = [];
  /** Ids des constats d'erreur déjà annoncés, pour n'annoncer que les nouveaux. */
  private _erreursAnnoncees = new Set<string>();

  private readonly _uid = `app-diag-${++panelSeq}`;
  private _copyTimer: ReturnType<typeof setTimeout> | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    injectAppDiagnosticStyles();
    // Fermé au premier lancement : le volet ne doit pas s'imposer.
    try {
      this._open = !this.integre && localStorage.getItem(STORAGE_KEY) === '1';
      this._redact = localStorage.getItem(REDACT_KEY) === '1';
    } catch {
      this._open = false;
    }
    // Sans rail, rien à réserver en bas. Publié à 0 et non retiré : des
    // feuilles d'app lisent la variable avec un repli de 2.25rem.
    if (this.integre) document.documentElement.style.setProperty('--app-diagnostic-h', '0px');
    document.addEventListener('keydown', this._onKeydown);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeydown);
    if (this._copyTimer) clearTimeout(this._copyTimer);
  }

  /** Échap referme le tiroir — le volet n'est pas modal, rien d'autre à faire. */
  private _onKeydown = (e: KeyboardEvent): void => {
    // Intégré, Échap appartient au panneau de l'assistant.
    if (e.key === 'Escape' && this._open && !this.integre) this.toggle(false);
  };

  /**
   * Publie la hauteur du rail dans `--app-diagnostic-h`, comme app-header
   * publie `--app-header-h`. Le rail est en position fixe : sans cette
   * reserve il masque la fin du contenu, et sur une page courte le dernier
   * bouton devient inatteignable.
   */
  private _railHeight = 0;

  private _publishRailHeight(): void {
    if (this.integre) return;
    const rail = this.querySelector('.app-diag__rail');
    if (!rail) return;
    const height = (rail as HTMLElement).offsetHeight;
    if (height > 0) {
      this._railHeight = height;
      document.documentElement.style.setProperty('--app-diagnostic-h', `${height}px`);
    }
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (!changed.has('trace') && !changed.has('constats')) return;
    // Une trace vide ne porte aucun constat : en garder d'anciens ferait
    // compter des pannes d'une exécution qui n'est plus affichée.
    this._constats = this._isBlank ? [] : this.constats;
    this._annoncerNouvellesErreurs();
  }

  /**
   * Annonce polie de l'arrivée d'un constat d'erreur (ADR-143 §7) : jamais
   * d'ouverture spontanée du tiroir, jamais de déplacement du focus. Seules
   * les erreurs NOUVELLES sont dites : une trace republiée à l'identique ne
   * doit pas répéter l'annonce.
   */
  private _annoncerNouvellesErreurs(): void {
    const erreurs = this._constats.filter((c) => c.gravite === 'erreur');
    const nouvelles = erreurs.filter((c) => !this._erreursAnnoncees.has(c.id));
    this._erreursAnnoncees = new Set(erreurs.map((c) => c.id));
    // Texte = titres (contrat #1001) ; aucun nombre ajouté à ce que dit la trace.
    if (nouvelles.length === 0) return;
    this._annonce = nouvelles.map((c) => c.titre).join(' ; ');
    if (this.integre) {
      this.dispatchEvent(
        new CustomEvent('diagnostic-annonce', { detail: { texte: this._annonce }, bubbles: true })
      );
    }
  }

  /** Constats de la trace courante, tels que le volet les rend. */
  get constatsAffiches(): readonly Constat[] {
    return this._constats;
  }

  protected updated(): void {
    // `offsetHeight` force un reflow : inutile de le payer a chaque rendu,
    // la hauteur du rail ne bouge qu'au premier ou sur changement de theme.
    if (this._railHeight === 0) this._publishRailHeight();
  }

  private _selectTab(tab: DiagnosticTab, focus = false): void {
    this._tab = tab;
    if (!focus) return;
    // Roving tabindex : le focus SUIT la selection, sinon la navigation aux
    // fleches laisse le focus sur l'onglet precedent et le lecteur d'ecran
    // annonce le mauvais.
    void this.updateComplete.then(() => {
      this.querySelector<HTMLButtonElement>(`#${CSS.escape(`${this._uid}-tab-${tab}`)}`)?.focus();
    });
  }

  /**
   * Motif WAI-ARIA « Tabs » : fleches, Home et Fin.
   *
   * `app-preview-panel` s'appuie sur le JS du DSFR pour ce comportement ;
   * ce volet n'utilise pas `fr-tabs` (il vit dans un tiroir, pas dans un
   * panneau d'apercu), il doit donc l'implementer lui-meme — sans quoi le
   * tablist n'en est un que de nom (RGAA 7.3).
   */
  private _onTabKeydown = (e: KeyboardEvent): void => {
    const index = TABS.indexOf(this._tab);
    let next: number;
    switch (e.key) {
      case 'ArrowRight':
        next = (index + 1) % TABS.length;
        break;
      case 'ArrowLeft':
        next = (index - 1 + TABS.length) % TABS.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = TABS.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    // Echap doit rester au tiroir : on ne l'intercepte pas ici.
    e.stopPropagation();
    this._selectTab(TABS[next], true);
  };

  /**
   * Constats s'il y a quelque chose à corriger, Flux sinon : ouvrir sur un
   * onglet vide renverrait l'usager à une page blanche, et quand tout va bien
   * le volet garde son comportement historique.
   *
   * Lit `constats` et non `_constats` : `toggle()` peut suivre la pose d'une
   * trace dans le même tour, avant que `willUpdate` ait recalculé.
   */
  private _ongletAOuvrir(): DiagnosticTab {
    const constats = this._isBlank ? [] : this.constats;
    return compterAlertes(constats) > 0 ? 'constats' : 'flux';
  }

  /** Ouvre, ferme, ou bascule. Point d'entrée public pour la barre d'actions. */
  toggle(open?: boolean): void {
    const etaitOuvert = this._open;
    this._open = open ?? !this._open;
    // À l'ouverture seulement : l'usager garde ensuite l'onglet qu'il choisit.
    if (this._open && !etaitOuvert) this._tab = this._ongletAOuvrir();
    try {
      if (!this.integre) localStorage.setItem(STORAGE_KEY, this._open ? '1' : '0');
    } catch {
      // Stockage indisponible (navigation privée) : l'état reste en mémoire.
    }
    this.dispatchEvent(
      new CustomEvent('diagnostic-toggle', { detail: { open: this._open }, bubbles: true })
    );
  }

  get isOpen(): boolean {
    return this._open;
  }

  /** Les valeurs sont-elles masquées dans le diagnostic sortant ? */
  get redactValues(): boolean {
    return this._redact;
  }

  private _toggleRedact(e: Event): void {
    this._redact = (e.target as HTMLInputElement).checked;
    try {
      localStorage.setItem(REDACT_KEY, this._redact ? '1' : '0');
    } catch {
      // Stockage indisponible : le réglage reste en mémoire.
    }
  }

  /** Le texte que copient et envoient les deux boutons — un seul format. */
  get diagnosticText(): string {
    if (this._isBlank || !this.trace) {
      return 'Aucune trace : le pipeline n’a pas encore été exécuté.';
    }
    return formatTrace(this.trace, { sampleRows: 2, redactValues: this._redact });
  }

  private _summaryText(): TemplateResult | string {
    if (this._isBlank || !this.trace) return 'aucune exécution observée';
    const s = summarizeTrace(this.trace, this._constats);
    if (s.stages === 0) return 'aucun composant dsfr-data';

    const flow =
      s.firstRows === null
        ? 'aucune donnée'
        : s.firstRows === s.lastRows
          ? plural(s.firstRows, 'ligne')
          : `${s.firstRows} → ${s.lastRows} lignes`;

    return html`${s.stages} étape${s.stages > 1 ? 's' : ''} · ${flow} ·
    ${
      s.alerts > 0
        ? html`<span class="app-diag__alert">${s.alerts} alerte${s.alerts > 1 ? 's' : ''}</span>`
        : html`<span class="app-diag__ok">aucune alerte</span>`
    }`;
  }

  private async _copy(): Promise<void> {
    // `aria-disabled` garde le bouton focusable et annonce sa raison, mais
    // n'empeche pas le clic : c'est au gestionnaire de se garder.
    if (this._isBlank) return;
    try {
      await navigator.clipboard.writeText(this.diagnosticText);
      this._copied = true;
      if (this._copyTimer) clearTimeout(this._copyTimer);
      this._copyTimer = setTimeout(() => (this._copied = false), 2000);
      this.dispatchEvent(new CustomEvent('diagnostic-copy', { bubbles: true }));
    } catch {
      // Presse-papier refusé : l'utilisateur peut toujours lire le volet.
    }
  }

  private _send(): void {
    // « Demander » ouvre l'assistant de l'app : il sert aussi avant toute trace.
    if (this._isBlank && this.sendAction !== 'demander') return;
    this.dispatchEvent(
      new CustomEvent('diagnostic-send', {
        detail: { text: this.diagnosticText },
        bubbles: true,
      })
    );
  }

  /**
   * « Me montrer » : le volet ÉMET, l'app résout (#1005). Il ne connaît ni le
   * registre de repères ni `montrer()` — app-ui reste hors du socle IA.
   * Premier repère cité : les règles les rangent du plus direct au moins direct.
   */
  private _montrer(constat: Constat): void {
    const repere = constat.reperes[0];
    if (!repere) return;
    this.dispatchEvent(
      new CustomEvent('constat-montrer', {
        detail: { repere, constat },
        bubbles: true,
        composed: true,
      })
    );
  }

  /** Pastille du rail : les constats non-info, colorée par la pire gravité. */
  private _renderPastille(): TemplateResult | typeof nothing {
    const n = compterAlertes(this._constats);
    if (n === 0) return nothing;
    const gravite: GraviteConstat = this._constats.some((c) => c.gravite === 'erreur')
      ? 'erreur'
      : 'avertissement';
    return html`<span class="app-diag__badge" data-gravite=${gravite}
      >${n}<span class="fr-sr-only"> constat${n > 1 ? 's' : ''} à corriger</span></span
    >`;
  }

  // --- Onglets ---

  private _renderConstats(): TemplateResult {
    if (this._constats.length === 0) {
      return html`<p class="app-diag__empty">
        Aucun constat : rien à corriger dans ce qui a été observé.
      </p>`;
    }
    return html`
      <ul class="app-diag__constats">
        ${this._constats.map((c, i) => {
          const titreId = `${this._uid}-constat-${i}`;
          const montrable = c.reperes.length > 0;
          return html`<li class="app-diag__constat" data-gravite=${c.gravite}>
            <p class="app-diag__constat-titre" id=${titreId}>
              <span
                class="app-diag__constat-icone ${ICONES_GRAVITE[c.gravite]} fr-icon--sm"
                aria-hidden="true"
              ></span>
              <span
                ><span class="fr-sr-only">${LIBELLES_GRAVITE[c.gravite]} : </span>${c.titre}</span
              >
            </p>
            <p>${c.explication}</p>
            ${c.action ? html`<p><strong>À faire :</strong> ${c.action}</p>` : nothing}
            <p class="app-diag__constat-preuve">Observé : ${c.preuve}</p>
            <button
              type="button"
              class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-eye-line fr-btn--icon-left"
              aria-describedby=${titreId}
              ?disabled=${!montrable}
              @click=${() => this._montrer(c)}
            >
              Me montrer
            </button>
          </li>`;
        })}
      </ul>
    `;
  }

  private _renderFlux(trace: Trace): TemplateResult {
    const nodes = topoOrder(trace.graph);
    if (nodes.length === 0) {
      return html`<p class="app-diag__empty">
        Aucun composant dsfr-data dans cette page — rien à diagnostiquer.
      </p>`;
    }
    // Les marqueurs d'étape SONT les constats (#1001) : aucune seconde liste
    // de pannes calculée ici, qu'il faudrait tenir d'accord avec la première.
    const parEtape = new Map<string, Constat[]>();
    const horsEtape: Constat[] = [];
    for (const c of this._constats) {
      if (c.etape === undefined) {
        horsEtape.push(c);
        continue;
      }
      const liste = parEtape.get(c.etape);
      if (liste) liste.push(c);
      else parEtape.set(c.etape, [c]);
    }
    return html`
      <div class="app-diag__chain">
        ${nodes.map((node) => this._renderStage(node, trace, parEtape.get(node.id) ?? []))}
      </div>
      ${horsEtape.map((c) => this._renderNote(c))}
    `;
  }

  /** Une note d'étape : la marque de gravité et le titre du constat. */
  private _renderNote(c: Constat, etape?: string): TemplateResult {
    // Le titre répète l'étape (« q1 : aucune ligne ») : sur la carte de q1,
    // l'id est déjà en tête.
    const prefixe = etape !== undefined ? `${etape} : ` : '';
    const titre = prefixe && c.titre.startsWith(prefixe) ? c.titre.slice(prefixe.length) : c.titre;
    const classe =
      c.gravite === 'erreur'
        ? 'app-diag__stage-note--error'
        : c.gravite === 'avertissement'
          ? 'app-diag__stage-note--warn'
          : '';
    return html`<div class="app-diag__stage-note ${classe}" data-constat=${c.id}>
      ${MARQUES_GRAVITE[c.gravite]} ${titre}
    </div>`;
  }

  private _renderStage(node: StageNode, trace: Trace, constats: Constat[]): TemplateResult {
    const state: StageState = trace.states[node.id] ?? { status: 'idle', emissions: 0 };
    const upstreamRows = node.upstream
      .map((up) => trace.states[up]?.rows)
      .filter((n): n is number => n !== undefined);
    // Un afficheur sous une etape en attente d'un filtre n'est pas une
    // alerte : la page fait exactement ce qu'on lui a demande (#690).
    const upstreamWaiting = node.upstream.some((up) => trace.states[up]?.status === 'waiting');
    const warn = constats.some((c) => c.gravite !== 'info');

    return html`
      <div class="app-diag__stage" data-status=${state.status} data-warn=${warn ? 'true' : 'false'}>
        <div class="app-diag__stage-id">${node.id}</div>
        <div class="app-diag__stage-tag">${node.tag}</div>
        ${
          upstreamRows.length > 0
            ? html`<div class="app-diag__stage-note">
                reçoit
                ${upstreamRows.length > 1 ? upstreamRows.join(' + ') + ' lignes' : plural(upstreamRows[0], 'ligne')}
                ← ${node.upstream.join(', ')}
              </div>`
            : nothing
        }
        <div class="app-diag__stage-rows">
          ${
            state.status === 'loaded'
              ? html`→ <strong>${state.rows}</strong> ${(state.rows ?? 0) > 1 ? 'lignes' : 'ligne'},
                  ${plural(state.fields?.length ?? 0, 'champ')}`
              : state.status === 'error'
                ? html`<span class="app-diag__stage-note--error">✗ échec</span>`
                : state.status === 'loading'
                  ? html`… chargement`
                  : state.status === 'waiting'
                    ? html`en attente d’un filtre`
                    : node.role === 'display'
                      ? html`${
                          upstreamWaiting
                            ? 'en attente d’un filtre'
                            : upstreamRows.some((n) => n > 0)
                              ? '✓ alimenté'
                              : 'rien reçu'
                        }`
                      : html`inerte`
          }
        </div>
        ${constats.map((c) => this._renderNote(c, node.id))}
        ${
          // Le message brut et l'URL COMPLETE : le constat n'en garde que
          // l'hote et le chemin (jetons et donnees logent dans la requete).
          state.status === 'error'
            ? html`<div class="app-diag__stage-note app-diag__stage-note--error">
                ${state.message}${
                  state.attemptedUrl ? html`<br />URL appelée : ${state.attemptedUrl}` : nothing
                }
              </div>`
            : nothing
        }
      </div>
    `;
  }

  /**
   * Matrice champ × étape.
   *
   * L'onglet le plus rentable : un champ renommé en amont — panne qui ne lève
   * aucune erreur et vide la dataviz — s'y voit d'un coup d'œil.
   */
  private _renderChamps(trace: Trace): TemplateResult {
    const stages = topoOrder(trace.graph)
      .map((node) => ({ id: node.id, fields: trace.states[node.id]?.fields ?? [] }))
      .filter((s) => s.fields.length > 0);

    if (stages.length === 0) {
      return html`<p class="app-diag__empty">
        Aucun champ observé : le pipeline n’a encore rien produit.
      </p>`;
    }

    const matrix = fieldMatrix(stages);
    return html`
      <div class="app-diag__table-wrap">
        <table>
          <caption class="fr-sr-only">
            Présence et type de chaque champ à chaque étape du pipeline
          </caption>
          <thead>
            <tr>
              <th scope="col">Champ</th>
              ${stages.map((s) => html`<th scope="col">${s.id}</th>`)}
            </tr>
          </thead>
          <tbody>
            ${matrix.map(
              (row) => html`
                <tr>
                  <th scope="row">${row.field}</th>
                  ${row.byStage.map(
                    (type) =>
                      html`<td data-absent=${type === null ? 'true' : 'false'}>${type ?? '—'}</td>`
                  )}
                </tr>
              `
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  private _renderJournal(trace: Trace): TemplateResult {
    if (trace.events.length === 0) {
      return html`<p class="app-diag__empty">Aucun événement enregistré.</p>`;
    }
    const first = trace.events[0].t;
    return html`
      <ul class="app-diag__journal">
        ${[...trace.events].reverse().map((e) => {
          const at = `+${((e.t - first) / 1000).toFixed(2)} s`;
          let body: TemplateResult | string;
          switch (e.kind) {
            case 'loaded':
              body = html`<strong>${e.node}</strong> → ${e.rows} lignes, ${e.fields.length} champs`;
              break;
            case 'error':
              body = html`<strong>${e.node}</strong> ✗
                ${e.message}${e.attemptedUrl ? html`<br />${e.attemptedUrl}` : nothing}`;
              break;
            case 'loading':
              body = html`<strong>${e.node}</strong> chargement…`;
              break;
            case 'waiting':
              body = html`<strong>${e.node}</strong> en attente d’un filtre (${e.reason})`;
              break;
            default:
              body = html`${e.from ? html`<strong>${e.from}</strong> → ` : nothing}
                <strong>${e.node}</strong> ${JSON.stringify(e.cmd)}`;
          }
          return html`<li>
            <span class="app-diag__journal-kind">${e.kind} ${at}</span>
            <span class="app-diag__journal-body">${body}</span>
          </li>`;
        })}
      </ul>
    `;
  }

  /**
   * Vrai quand la trace existe mais ne decrit rien : aucune etape, aucun
   * evenement. C'est le cas « pas encore execute », qu'il ne faut pas
   * confondre avec « page sans composant dsfr-data » — le second est un
   * diagnostic, le premier une invitation a lancer le pipeline.
   */
  private get _isBlank(): boolean {
    const trace = this.trace;
    if (!trace) return true;
    return trace.graph.nodes.length === 0 && trace.events.length === 0;
  }

  private _renderBody(): TemplateResult {
    if (this._isBlank) {
      return html`<p class="app-diag__empty">
        ${
          this.emptyHint ||
          (this.mode === 'rapporte'
            ? 'Aucun diagnostic chargé. Collez-en un, ou ouvrez-en un produit par une autre app.'
            : 'Exécutez le pipeline pour observer ce qui transite entre les composants.')
        }
      </p>`;
    }
    // `_isBlank` couvre déjà `trace === null`, mais le compilateur ne peut pas
    // le déduire d'un getter : on l'affirme ici plutôt que d'affaiblir les
    // signatures des trois rendus.
    const trace = this.trace;
    if (!trace) return html`<p class="app-diag__empty">Aucune trace disponible.</p>`;
    switch (this._tab) {
      case 'constats':
        return this._renderConstats();
      case 'champs':
        return this._renderChamps(trace);
      case 'journal':
        return this._renderJournal(trace);
      default:
        return this._renderFlux(trace);
    }
  }

  /** Barre d'outils et vue courante : communs au tiroir et à l'onglet intégré. */
  private _renderContenu(): TemplateResult {
    return html`
      ${
        this.partialTrace && !this._isBlank
          ? html`<p class="app-diag__partial">
              ⚠ Trace reconstituée depuis le cache : le collecteur n’a pas pu observer le
              chargement. La chronologie et les erreurs déjà survenues manquent.
            </p>`
          : nothing
      }
      <div class="app-diag__toolbar">
        <div
          class="app-diag__tabs"
          role="tablist"
          aria-label="Vues du diagnostic"
          @keydown=${this._onTabKeydown}
        >
          ${TABS.map(
            (tab) => html`
              <button
                type="button"
                role="tab"
                id=${`${this._uid}-tab-${tab}`}
                class="app-diag__tab"
                aria-selected=${this._tab === tab ? 'true' : 'false'}
                aria-controls=${`${this._uid}-panel`}
                tabindex=${this._tab === tab ? '0' : '-1'}
                @click=${() => this._selectTab(tab)}
              >
                ${TAB_LABELS[tab]}
              </button>
            `
          )}
        </div>
        <div class="app-diag__redact">
          <input
            type="checkbox"
            id=${`${this._uid}-redact`}
            .checked=${this._redact}
            @change=${this._toggleRedact}
          />
          <label
            for=${`${this._uid}-redact`}
            title="Ne sortir que les comptes et les noms de champs — utile pour une source sensible"
            >Masquer les valeurs</label
          >
        </div>
        ${
          this.canSend && !this.integre
            ? this.sendAction === 'demander'
              ? html`<button
                  type="button"
                  class="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-question-answer-line fr-btn--icon-left"
                  @click=${this._send}
                >
                  Demander à l’assistant
                </button>`
              : html`<button
                  type="button"
                  class="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-question-answer-line fr-btn--icon-left"
                  aria-disabled=${this._isBlank ? 'true' : 'false'}
                  title=${
                    this._isBlank
                      ? 'Aucun diagnostic à transmettre : exécutez d’abord le pipeline'
                      : 'Pose le diagnostic dans la conversation, sans l’envoyer : relisez-le et complétez votre question'
                  }
                  @click=${this._send}
                >
                  Demander à l’assistant
                </button>`
            : nothing
        }
        <button
          type="button"
          class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-clipboard-line fr-btn--icon-left"
          aria-disabled=${this._isBlank ? 'true' : 'false'}
          title=${this._isBlank ? 'Aucun diagnostic à copier : exécutez d’abord le pipeline' : ''}
          @click=${this._copy}
        >
          ${this._copied ? 'Diagnostic copié' : 'Copier le diagnostic'}
        </button>
      </div>
      <div
        id=${`${this._uid}-panel`}
        role="tabpanel"
        tabindex="0"
        aria-labelledby=${`${this._uid}-tab-${this._tab}`}
      >
        ${this._renderBody()}
      </div>
    `;
  }

  render() {
    if (this.integre) {
      return html`<div class="app-diag app-diag--integre">
        <p class="app-diag__resume">${this._summaryText()}</p>
        <div class="app-diag__body" role="region" aria-label="Diagnostic du pipeline">
          ${this._renderContenu()}
        </div>
      </div>`;
    }
    const bodyId = `${this._uid}-body`;
    return html`
      <div class="app-diag">
        <button
          type="button"
          class="app-diag__rail"
          aria-expanded=${this._open ? 'true' : 'false'}
          aria-controls=${bodyId}
          @click=${() => this.toggle()}
        >
          <span class="app-diag__rail-title">
            <span class="fr-icon-tools-line fr-icon--sm" aria-hidden="true"></span>
            Diagnostic ${this._renderPastille()}
          </span>
          <span class="app-diag__rail-summary">${this._summaryText()}</span>
          <span
            class="app-diag__rail-chevron ${
              this._open ? 'fr-icon-arrow-down-s-line' : 'fr-icon-arrow-up-s-line'
            } fr-icon--sm"
            aria-hidden="true"
          ></span>
        </button>
        <p class="fr-sr-only" aria-live="polite" data-annonce-constats>${this._annonce}</p>

        <div
          id=${bodyId}
          class="app-diag__body"
          role="region"
          aria-label="Diagnostic du pipeline"
          ?hidden=${!this._open}
        >
          ${this._renderContenu()}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-diagnostic-panel': AppDiagnosticPanel;
  }
}

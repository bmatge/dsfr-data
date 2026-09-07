import { attachRecorderToFrame, type FrameAttachment } from './frame.js';
import { DataflowRecorder, type Trace } from './recorder.js';

/**
 * Montage du volet Diagnostic dans une app, en un appel (#605).
 *
 * Ce helper vit dans `shared` et NON dans `app-ui`, pour une raison précise :
 * les apps chargent le chrome applicatif par une balise
 * `<script src=".../app-ui.esm.js">`, jamais par un `import`. Importer
 * `@dsfr-data/app-ui` depuis le code d'une app embarquerait une seconde copie
 * du bundle et enregistrerait les composants deux fois. On crée donc
 * l'élément par son nom de balise — il est déjà défini par le bundle chargé.
 *
 * Toutes les apps qui rendent un aperçu le font dans une `<iframe srcdoc>` :
 * le câblage est rigoureusement le même partout, et le factoriser évite six
 * copies de la même boucle observer → rendre.
 *
 * Trois formes d'usage, dictées par la façon dont chaque app rend son aperçu :
 *
 *   - **live / iframe** : on passe la `frame` — Playground, Builder, Studio,
 *     Dashboard rendent tous dans une `<iframe srcdoc>` ;
 *   - **live / même document** : on passe `liveRoot` — la Carto instancie de
 *     vrais composants directement dans `#map-canvas`, et le Pipeline dans son
 *     conteneur d'exécution. Il n'y a pas d'iframe à écouter, juste une racine ;
 *   - **rapporté** : ni l'un ni l'autre, l'app appelle `setTrace()` avec une
 *     trace reçue d'ailleurs. C'est le seul mode possible dans l'Assistant IA,
 *     dont l'aperçu ne passe par aucun composant dsfr-data (voir #609).
 */

/** Surface publique du composant, sans dépendre de sa classe. */
export interface DiagnosticPanelElement extends HTMLElement {
  trace: Trace | null;
  mode: 'live' | 'rapporte';
  canSend: boolean;
  emptyHint: string;
  readonly isOpen: boolean;
  /** Les valeurs sont-elles masquées dans le diagnostic sortant ? */
  readonly redactValues: boolean;
  /** La trace a ete reconstituee faute de tampon precoce. */
  partialTrace: boolean;
  readonly diagnosticText: string;
  toggle(open?: boolean): void;
}

export interface MountDiagnosticOptions {
  /** Iframe d'aperçu à observer. */
  frame?: HTMLIFrameElement | null;
  /**
   * Racine à observer DANS le document courant, quand l'app ne rend pas dans
   * une iframe (Carto, Pipeline). Ignorée si `frame` est fournie.
   */
  liveRoot?: ParentNode | null;
  /** Id d'un bouton de la barre d'actions qui ouvre/ferme le volet. */
  toggleButtonId?: string;
  /** Affiche « Envoyer à l'assistant » (apps conversationnelles). */
  canSend?: boolean;
  /** Reçoit le texte du diagnostic quand l'utilisateur l'envoie. */
  onSend?: (text: string) => void;
  /** Message affiché quand aucune trace n'est disponible. */
  emptyHint?: string;
  /** Hôte du volet (défaut : `document.body`). */
  host?: HTMLElement;
}

export interface MountedDiagnostic {
  panel: DiagnosticPanelElement;
  /** Rattachement à l'iframe, ou null hors mode live/iframe. */
  attachment: FrameAttachment | null;
  /** Collecteur du mode live/même document, ou null. */
  recorder: DataflowRecorder | null;
  /** Alimente le volet en mode rapporté. */
  setTrace(trace: Trace | null): void;
  /** Le texte que copient et envoient les boutons. */
  text(): string;
  destroy(): void;
}

/**
 * Clé de passation d'un diagnostic entre apps (ARCHITECTURE.md §10.1).
 *
 * Le mode rapporté n'a d'intérêt que si quelque chose peut y arriver : une
 * app sans pipeline observable doit pouvoir recevoir le diagnostic produit
 * par une autre. Même mécanisme que `playground-code` / `pipeline-helper-code`.
 */
export const DIAGNOSTIC_HANDOFF_KEY = 'dsfr-data-diagnostic-handoff';

/** Dépose un diagnostic à destination de l'app suivante. */
export function transmettreDiagnostic(texte: string): void {
  try {
    sessionStorage.setItem(DIAGNOSTIC_HANDOFF_KEY, texte);
  } catch {
    // Stockage indisponible : l'utilisateur garde « Copier le diagnostic ».
  }
}

/** Récupère et consomme un diagnostic transmis, ou null. */
export function recupererDiagnostic(): string | null {
  try {
    const texte = sessionStorage.getItem(DIAGNOSTIC_HANDOFF_KEY);
    if (texte) sessionStorage.removeItem(DIAGNOSTIC_HANDOFF_KEY);
    return texte;
  } catch {
    return null;
  }
}

export function mountDiagnosticPanel(options: MountDiagnosticOptions = {}): MountedDiagnostic {
  const host = options.host ?? document.body;

  const panel = document.createElement('app-diagnostic-panel') as DiagnosticPanelElement;
  panel.mode = options.frame || options.liveRoot ? 'live' : 'rapporte';
  panel.canSend = !!options.canSend;
  if (options.emptyHint) panel.emptyHint = options.emptyHint;
  host.appendChild(panel);

  if (options.onSend) {
    panel.addEventListener('diagnostic-send', (e) => {
      options.onSend?.((e as CustomEvent<{ text: string }>).detail.text);
    });
  }

  const toggle = options.toggleButtonId
    ? (document.getElementById(options.toggleButtonId) as HTMLButtonElement | null)
    : null;
  const onToggleClick = () => panel.toggle();
  toggle?.addEventListener('click', onToggleClick);

  // L'état du volet vit dans le composant : le bouton n'en est qu'un
  // déclencheur, et doit refléter cet état plutôt que tenir le sien.
  const onPanelToggle = (e: Event) => {
    const open = (e as CustomEvent<{ open: boolean }>).detail.open;
    toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  panel.addEventListener('diagnostic-toggle', onPanelToggle);

  let attachment: FrameAttachment | null = null;
  let recorder: DataflowRecorder | null = null;
  let offRecorder: (() => void) | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;

  if (options.frame) {
    attachment = attachRecorderToFrame(options.frame, {
      onChange: (trace) => {
        panel.trace = trace;
        // Avouer une trace RECONSTITUEE plutot que de la presenter comme
        // complete : sans tampon precoce, la chronologie et les erreurs deja
        // passees manquent. Se taire ici reproduirait le faux calme que tout
        // ce module existe pour empecher.
        panel.partialTrace = attachment ? !attachment.sawEarlyBuffer() : false;
      },
      onReset: () => {
        // Une iframe rechargée repart de zéro : garder l'ancienne trace
        // afficherait des chiffres qui ne correspondent plus au rendu.
        panel.trace = null;
      },
    });
  } else if (options.liveRoot) {
    // Même document : pas de cycle de rechargement à suivre, mais la même
    // règle de cadence — un instantané par événement de bus ferait deux
    // parcours DOM complets pour rien.
    recorder = new DataflowRecorder({ root: options.liveRoot });
    recorder.start();
    const active = recorder;
    let pending = false;
    const publish = () => {
      panel.trace = active.snapshot();
    };
    // MEME cloture de quiescence que le mode iframe (`frame.ts`), et pour la
    // meme raison : un instantane pris en pleine rafale porte
    // `quiescent: false`. Sans republication apres le silence, le volet
    // afficherait « le pipeline tourne encore » a jamais — un avertissement
    // permanent, donc invisible. L'oubli ici touchait la Carto et le Pipeline.
    const settle = () => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(publish, 350);
    };
    offRecorder = active.onChange(() => {
      settle();
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        publish();
      });
    });
    publish();
    settle();
  }

  return {
    panel,
    attachment,
    recorder,
    setTrace: (trace) => {
      panel.trace = trace;
    },
    text: () => panel.diagnosticText,
    destroy: () => {
      attachment?.detach();
      if (settleTimer) clearTimeout(settleTimer);
      offRecorder?.();
      recorder?.stop();
      toggle?.removeEventListener('click', onToggleClick);
      panel.removeEventListener('diagnostic-toggle', onPanelToggle);
      panel.remove();
    },
  };
}

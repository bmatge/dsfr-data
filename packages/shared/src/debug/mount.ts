import { attachRecorderToFrame, type FrameAttachment } from './frame.js';
import type { Trace } from './recorder.js';

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
 * Deux formes d'usage :
 *   - **live** : on passe la `frame`, le volet suit le pipeline qui y tourne ;
 *   - **rapporté** : pas de `frame`, l'app appelle `setTrace()` avec une trace
 *     reçue d'ailleurs. C'est le seul mode possible dans l'Assistant IA, dont
 *     l'aperçu ne passe par aucun composant dsfr-data.
 */

/** Surface publique du composant, sans dépendre de sa classe. */
export interface DiagnosticPanelElement extends HTMLElement {
  trace: Trace | null;
  mode: 'live' | 'rapporte';
  canSend: boolean;
  emptyHint: string;
  readonly isOpen: boolean;
  readonly diagnosticText: string;
  toggle(open?: boolean): void;
}

export interface MountDiagnosticOptions {
  /** Iframe d'aperçu à observer. Absente = mode rapporté. */
  frame?: HTMLIFrameElement | null;
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
  /** Rattachement à l'iframe, ou null en mode rapporté. */
  attachment: FrameAttachment | null;
  /** Alimente le volet en mode rapporté. */
  setTrace(trace: Trace | null): void;
  /** Le texte que copient et envoient les boutons. */
  text(): string;
  destroy(): void;
}

export function mountDiagnosticPanel(options: MountDiagnosticOptions = {}): MountedDiagnostic {
  const host = options.host ?? document.body;

  const panel = document.createElement('app-diagnostic-panel') as DiagnosticPanelElement;
  panel.mode = options.frame ? 'live' : 'rapporte';
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
  if (options.frame) {
    attachment = attachRecorderToFrame(options.frame, {
      onChange: (trace) => {
        panel.trace = trace;
      },
      onReset: () => {
        // Une iframe rechargée repart de zéro : garder l'ancienne trace
        // afficherait des chiffres qui ne correspondent plus au rendu.
        panel.trace = null;
      },
    });
  }

  return {
    panel,
    attachment,
    setTrace: (trace) => {
      panel.trace = trace;
    },
    text: () => panel.diagnosticText,
    destroy: () => {
      attachment?.detach();
      toggle?.removeEventListener('click', onToggleClick);
      panel.removeEventListener('diagnostic-toggle', onPanelToggle);
      panel.remove();
    },
  };
}

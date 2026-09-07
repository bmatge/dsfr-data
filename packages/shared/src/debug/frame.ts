/**
 * Observation d'un pipeline qui tourne dans une iframe d'aperçu (#605).
 *
 * Toutes les apps qui rendent un aperçu le font dans une `<iframe srcdoc>` —
 * playground, builder, studio. Le collecteur doit donc écouter le `document`
 * de l'iframe, pas celui de la page hôte.
 *
 * **Compromis assumé** : ce module lit `iframe.contentDocument`, ce qui exige
 * `allow-same-origin` dans le sandbox. Les trois apps l'ont déjà — l'aperçu
 * charge la bibliothèque depuis l'origine de l'app. La voie plus propre
 * (injecter le collecteur dans la page générée et remonter la trace par
 * `postMessage`, sans dépendre du sandbox) demande une entrée de build
 * dédiée : c'est le lot #608, qui la construit pour le bundle autonome.
 * `DataflowRecorder` prenant déjà `{ doc, root }`, le basculement ne touchera
 * que ce fichier.
 *
 * Le vrai piège traité ici est ailleurs : **réaffecter `srcdoc` détruit le
 * document précédent**. Un collecteur branché une fois observe le premier
 * rendu puis devient sourd, sans la moindre erreur. D'où le réattachement à
 * chaque `load`.
 */

import { DataflowRecorder, type RecorderOptions, type Trace } from './recorder.js';

export interface FrameAttachment {
  /** Trace courante, ou null tant que l'iframe n'a rien rendu. */
  snapshot(): Trace | null;
  /** Attend que le pipeline de l'iframe se stabilise. */
  waitForQuiescence(): Promise<boolean>;
  /** Recorder courant — null entre deux chargements. */
  current(): DataflowRecorder | null;
  detach(): void;
}

export interface FrameAttachOptions extends Omit<RecorderOptions, 'doc' | 'root'> {
  /** Appelé à chaque changement de trace (rendu vivant). */
  onChange?: (trace: Trace) => void;
  /** Appelé quand l'iframe recharge — le volet doit repartir de zéro. */
  onReset?: () => void;
}

/**
 * Branche un collecteur sur une iframe et le rebranche à chaque rechargement.
 *
 * Rend un objet stable : l'appelant garde la même référence même si le
 * recorder sous-jacent est remplacé à chaque `load`.
 */
export function attachRecorderToFrame(
  iframe: HTMLIFrameElement,
  options: FrameAttachOptions = {}
): FrameAttachment {
  const { onChange, onReset, ...recorderOptions } = options;
  let recorder: DataflowRecorder | null = null;
  let offChange: (() => void) | null = null;
  let detached = false;

  const teardown = () => {
    offChange?.();
    offChange = null;
    recorder?.stop();
    recorder = null;
  };

  const attach = () => {
    if (detached) return;
    teardown();

    const doc = iframe.contentDocument;
    // `about:blank` ou sandbox sans allow-same-origin : on ne casse rien, le
    // volet affichera simplement qu'il n'observe pas cette iframe.
    if (!doc || !doc.body) return;

    recorder = new DataflowRecorder({ ...recorderOptions, doc, root: doc.body });
    recorder.start();
    if (onChange) {
      const active = recorder;
      offChange = active.onChange(() => onChange(active.snapshot()));
    }
    onReset?.();
    // Le pipeline peut avoir déjà émis entre `load` et ce branchement : on
    // publie un premier état pour ne pas laisser le volet vide à tort.
    if (onChange && recorder) onChange(recorder.snapshot());
  };

  iframe.addEventListener('load', attach);
  // L'iframe peut déjà porter un document au moment du branchement.
  attach();

  return {
    snapshot: () => recorder?.snapshot() ?? null,
    waitForQuiescence: async () => (recorder ? recorder.waitForQuiescence() : false),
    current: () => recorder,
    detach: () => {
      detached = true;
      iframe.removeEventListener('load', attach);
      teardown();
    },
  };
}

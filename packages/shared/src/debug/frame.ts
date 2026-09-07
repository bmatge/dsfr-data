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
 * Deux pièges sont traités ici, et le second a coûté un lot entier :
 *
 * 1. **Réaffecter `srcdoc` détruit le document précédent.** Un collecteur
 *    branché une fois observe le premier rendu puis devient sourd, sans la
 *    moindre erreur. D'où le réattachement à chaque `load`.
 * 2. **`load` arrive APRÈS que tout a émis.** Mesuré dans une iframe réelle :
 *    `dsfr-data-loading` à 52 ms, `dsfr-data-loaded` à 56 ms, `load` à 87 ms.
 *    Se brancher au `load` produisait « inerte / rien reçu » sous un
 *    graphique parfaitement rendu — et le MÊME écran sur un pipeline en
 *    échec. Un diagnostic confiant et faux dans les deux sens.
 *
 * Le second ne se resout pas en courant plus vite : la page d'aperçu porte
 * un tampon (`earlyBufferScript`) qui empile les événements dès le premier
 * octet, et le collecteur le vide au branchement. Pour une page qui n'en a
 * pas, `backfillFromCache` reconstitue au moins l'état de chaque étape.
 */

import { DataflowRecorder, type RecorderOptions, type Trace } from './recorder.js';

export interface FrameAttachment {
  /** Trace courante, ou null tant que l'iframe n'a rien rendu. */
  snapshot(): Trace | null;
  /** Attend que le pipeline de l'iframe se stabilise. */
  waitForQuiescence(): Promise<boolean>;
  /** Recorder courant — null entre deux chargements. */
  current(): DataflowRecorder | null;
  /**
   * True si le tampon précoce a livré des événements au dernier branchement.
   *
   * False signale une page d'aperçu generee sans `debug: true` : la trace est
   * alors reconstituee depuis le cache, sans chronologie ni erreurs.
   */
  sawEarlyBuffer(): boolean;
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
  let observedEarly = false;
  let settleTimers: Array<() => void> = [];
  let scheduleSettle: (() => void) | null = null;

  const teardown = () => {
    for (const cancel of settleTimers) cancel();
    settleTimers = [];
    scheduleSettle = null;
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

    // L'ORDRE compte : on rejoue d'abord ce qui s'est passé avant nous, puis
    // on complète les étapes encore inconnues depuis le cache. L'inverse
    // ferait écraser une chronologie exacte par un instantané muet.
    const replayed = recorder.ingestEarlyBuffer(doc.defaultView);
    recorder.backfillFromCache(doc.defaultView);
    observedEarly = replayed > 0;

    if (onChange) {
      const active = recorder;
      // `snapshot()` fait deux parcours complets du DOM, et le volet force un
      // reflow a chaque rendu. Sur une source paginee, un instantane par
      // evenement de bus coute cher pour rien : l'oeil ne suit pas, et l'etat
      // final est le seul qui compte. On regroupe donc les rafales dans une
      // micro-tache, en publiant toujours le DERNIER etat.
      let pending = false;
      let settleTimer: ReturnType<typeof setTimeout> | null = null;
      const publish = () => {
        if (recorder === active) onChange(active.snapshot());
      };
      /**
       * Un instantané est daté : celui pris pendant la rafale porte
       * `quiescent: false`. Sans publication de clôture, le volet afficherait
       * « le pipeline tourne encore » pour toujours — un avertissement
       * permanent, donc invisible.
       */
      const settle = () => {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(publish, (recorderOptions.quiescenceMs ?? 300) + 50);
      };
      scheduleSettle = settle;
      offChange = active.onChange(() => {
        settle();
        if (pending) return;
        pending = true;
        queueMicrotask(() => {
          pending = false;
          publish();
        });
      });
      settleTimers.push(() => {
        if (settleTimer) clearTimeout(settleTimer);
      });
    }
    onReset?.();
    if (onChange && recorder) {
      onChange(recorder.snapshot());
      // Le tampon rejoué ne déclenche AUCUN `onChange` (les abonnés n'étaient
      // pas encore branchés) : sans cette clôture, un pipeline entièrement
      // observé par le tampon resterait marqué « en cours » indéfiniment.
      scheduleSettle?.();
    }
  };

  iframe.addEventListener('load', attach);
  // L'iframe peut déjà porter un document au moment du branchement.
  attach();

  return {
    snapshot: () => recorder?.snapshot() ?? null,
    waitForQuiescence: async () => (recorder ? recorder.waitForQuiescence() : false),
    current: () => recorder,
    sawEarlyBuffer: () => observedEarly,
    detach: () => {
      detached = true;
      iframe.removeEventListener('load', attach);
      teardown();
    },
  };
}

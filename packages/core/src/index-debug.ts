/**
 * Bundle autonome de diagnostic — `dsfr-data.debug.js` (#608).
 *
 * Ce que ce fichier exploite, et qui rend l'ensemble possible : le bus de
 * données est **plat, global et public**. Les événements sont dispatchés sur
 * `document`, le cache vit sur `window.__dsfrDataCache`. Un observateur n'a
 * donc besoin de RIEN de la bibliothèque — pas même d'être chargé en même
 * temps qu'elle.
 *
 * Conséquence pratique : **une balise `<script>` suffit à diagnostiquer
 * n'importe quelle page utilisant dsfr-data, y compris en production, sans
 * rebuild ni modification de la page.**
 *
 * ```html
 * <script src="https://.../dsfr-data.debug.js"></script>
 * ```
 *
 * Ou, sans toucher au HTML du tout, par marque-page :
 * `javascript:(function(){var s=document.createElement('script');s.src='…/dsfr-data.debug.js';document.body.appendChild(s)})()`
 *
 * Entrée SÉPARÉE, jamais fusionnée aux bundles publiés : un outil d'atelier
 * n'a rien à faire dans le poids d'une page gouvernementale. Un test-garde
 * (`tests/debug/standalone-bundle.test.ts`) verifie cette separation, dans
 * l'esprit de `no-cdn-in-core`.
 *
 * Le collecteur arrive forcement APRES le pipeline sur une page tierce
 * (aucun tampon precoce n'y est injecte) : `backfillFromCache` reconstitue
 * alors l'etat de chaque etape depuis le cache global. On perd la
 * chronologie et les erreurs deja passees — d'ou le rechargement propose
 * dans l'overlay, qui rend la trace complete.
 */

import { DataflowRecorder, formatTrace, summarizeTrace, type Trace } from '@dsfr-data/shared/lib';

interface DebugApi {
  /** Trace courante. */
  trace(): Trace;
  /** Le diagnostic en texte français — celui du volet et de l'assistant. */
  text(options?: { redactValues?: boolean }): string;
  /** Ouvre/ferme l'incrustation. */
  toggle(open?: boolean): void;
  /** Détache tout et retire l'incrustation. */
  stop(): void;
}

declare global {
  interface Window {
    dsfrDataDebug?: DebugApi;
  }
}

const OVERLAY_ID = 'dsfr-data-debug-overlay';

function styleOverlay(el: HTMLElement): void {
  // Styles en ligne : la page hôte est inconnue, on ne peut ni supposer le
  // DSFR chargé ni risquer de polluer sa feuille.
  Object.assign(el.style, {
    position: 'fixed',
    left: '0',
    right: '0',
    bottom: '0',
    zIndex: '2147483000',
    maxHeight: '45vh',
    overflow: 'auto',
    margin: '0',
    padding: '12px 16px',
    background: '#161b2e',
    color: '#dce2f2',
    font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
    whiteSpace: 'pre-wrap',
    borderTop: '2px solid #6b7bd6',
    boxShadow: '0 -6px 20px rgba(0,0,0,.35)',
  } satisfies Partial<CSSStyleDeclaration>);
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  Object.assign(b.style, {
    marginRight: '8px',
    padding: '3px 10px',
    font: 'inherit',
    color: '#161b2e',
    background: '#c7d0f0',
    border: '0',
    borderRadius: '2px',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
  b.addEventListener('click', onClick);
  return b;
}

function install(precoce?: DataflowRecorder): DebugApi {
  const recorder = new DataflowRecorder({ root: document.body });
  recorder.start();

  // L'ORDRE compte, et c'est le meme invariant que `frame.ts` : on adopte
  // d'abord ce qui a ete OBSERVE, on complete ensuite depuis le cache.
  // L'inverse ecraserait une erreur reellement vue par un instantane muet —
  // le cache ne garde aucune trace d'un echec.
  if (precoce) recorder.adoptFrom(precoce);
  const complete = recorder.backfillFromCache(window);
  // « Reconstitue » ne vaut que si RIEN n'a ete observe en direct : un
  // collecteur precoce qui a tout vu rend la trace complete, meme si le
  // cache a par ailleurs comble une etape.
  const reconstitue = complete > 0 && recorder.snapshot().events.length === 0;

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  styleOverlay(overlay);

  const bar = document.createElement('div');
  bar.style.marginBottom = '8px';
  const body = document.createElement('div');

  let redact = false;
  const render = () => {
    body.textContent = formatTrace(recorder.snapshot(), {
      redactValues: redact,
      sampleRows: redact ? 0 : 2,
    });
  };

  bar.append(
    button('Actualiser', render),
    button('Masquer les valeurs', () => {
      redact = !redact;
      render();
    }),
    button('Copier', () => {
      void navigator.clipboard?.writeText(body.textContent ?? '');
    }),
    button('Recharger', () => location.reload()),
    button('Fermer', () => overlay.remove())
  );

  const summary = document.createElement('div');
  summary.style.cssText = 'margin-bottom:6px;color:#9fb1ff';

  // Honnetete du diagnostic : dire quand la trace est PARTIELLE vaut mieux
  // que la presenter comme complete. Une page tierce n'a pas de tampon
  // precoce — le collecteur arrive apres coup et ne reconstitue que l'etat
  // final, sans la chronologie ni les erreurs deja passees.
  if (reconstitue) {
    const avis = document.createElement('div');
    avis.style.cssText = 'margin-bottom:6px;color:#e7b26a';
    avis.textContent =
      'Trace reconstituee depuis le cache : le collecteur est arrive apres le chargement. ' +
      'Chronologie et erreurs deja passees manquent. Chargez ce script AVANT la bibliotheque ' +
      '(balise <script> en tete de page) pour une trace complete.';
    overlay.appendChild(avis);
  }
  const refreshSummary = () => {
    const s = summarizeTrace(recorder.snapshot());
    summary.textContent = `${s.stages} étape(s) · ${s.firstRows ?? '—'} → ${s.lastRows ?? '—'} lignes · ${s.alerts} alerte(s)`;
  };

  overlay.append(bar, summary, body);
  document.body.appendChild(overlay);

  let pending = false;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  const publier = () => {
    render();
    refreshSummary();
  };
  // MEME cloture qu'en mode iframe et qu'en mode meme-document : un rendu
  // pris en pleine rafale porte `quiescent: false`, et sans republication
  // apres le silence l'incrustation afficherait « le pipeline tourne
  // encore » a jamais — un avertissement permanent, donc invisible.
  const settle = () => {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(publier, 350);
  };
  recorder.onChange(() => {
    settle();
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      publier();
    });
  });
  publier();
  settle();

  return {
    trace: () => recorder.snapshot(),
    text: (options) =>
      formatTrace(recorder.snapshot(), {
        redactValues: options?.redactValues ?? redact,
        sampleRows: (options?.redactValues ?? redact) ? 0 : 2,
      }),
    toggle: (open) => {
      const shown = document.getElementById(OVERLAY_ID) !== null;
      const next = open ?? !shown;
      if (next && !shown) document.body.appendChild(overlay);
      if (!next && shown) overlay.remove();
    },
    stop: () => {
      if (settleTimer) clearTimeout(settleTimer);
      recorder.stop();
      overlay.remove();
      delete window.dsfrDataDebug;
    },
  };
}

/**
 * S'installe au chargement du script.
 *
 * Idempotent : recharger le marque-page sur une page déjà instrumentée ne
 * doit pas empiler deux collecteurs.
 *
 * **Le collecteur démarre AVANT le montage de l'incrustation**, et cette
 * separation est tout l'interet du fichier. Ce script conseille d'etre place
 * en tete de page, AVANT la bibliotheque — mais a ce moment `document.body`
 * n'existe pas encore. Tout differer a `DOMContentLoaded` reviendrait a rater
 * precisement les evenements qu'on est venu observer, et a afficher ensuite
 * « chargez ce script avant la bibliotheque » a quelqu'un qui vient de le
 * faire. `addEventListener` sur `document` n'exige pas de `body` : on ecoute
 * tout de suite, on affiche quand on peut.
 */
function boot(precoce?: DataflowRecorder): void {
  if (window.dsfrDataDebug) {
    window.dsfrDataDebug.toggle(true);
    return;
  }
  window.dsfrDataDebug = install(precoce);
}

if (typeof document !== 'undefined') {
  // 1. Ecouter TOUT DE SUITE — c'est ce qui ne peut pas attendre.
  const collecteurPrecoce = new DataflowRecorder({ root: document });
  collecteurPrecoce.start();

  const monter = () => {
    collecteurPrecoce.stop();
    // Le collecteur precoce est passe A la construction : `install` peut
    // ainsi adopter AVANT de completer depuis le cache, ordre sans lequel un
    // instantane muet ecraserait une erreur observee.
    boot(collecteurPrecoce);
  };

  if (document.body) {
    monter();
  } else {
    document.addEventListener('DOMContentLoaded', monter, { once: true });
  }
}

export { install as installDsfrDataDebug };

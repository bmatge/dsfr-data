/**
 * Tampon d'événements du bus, posé AVANT que le pipeline ne démarre (#605).
 *
 * Le piège que ce module résout, mesuré dans une iframe d'aperçu réelle :
 *
 * ```
 * dsfr-data-loading   t = 52 ms
 * DOMContentLoaded    t = 53 ms
 * dsfr-data-loaded    t = 56 ms
 * window 'load'       t = 87 ms   <- trop tard : tout est déjà passé
 * ```
 *
 * S'abonner au `load` de l'iframe, c'est arriver après la bataille : le volet
 * affichait « inerte / rien reçu » sous un graphique parfaitement rendu, et —
 * pire — le MÊME écran sur un pipeline en échec. Un diagnostic confiant et
 * faux dans les deux sens.
 *
 * On ne court donc pas après l'événement : un script minuscule, injecté en
 * TÊTE du document d'aperçu, s'abonne aux événements du bus avant que quoi
 * que ce soit d'autre ne soit analysé, et empile ce qui passe. Le collecteur
 * du parent vide ce tampon au branchement, puis prend le relais en direct.
 *
 * Déterministe, sans course, et c'est exactement le mécanisme que le bundle
 * autonome de #608 généralisera.
 */

import { journalScript } from './journal.js';

/** Nom de la variable globale portant le tampon, côté page observée. */
export const EARLY_BUFFER_KEY = '__dsfrDataTrace';

/** Un événement empilé par le tampon, avant tout traitement. */
export interface BufferedBusEvent {
  name: string;
  detail: unknown;
  t: number;
}

interface WindowWithBuffer extends Window {
  __dsfrDataTrace?: BufferedBusEvent[];
}

/**
 * Script à injecter en tête du `<head>` d'une page d'aperçu.
 *
 * Volontairement écrit en ES5 sans dépendance : il s'exécute avant tout, y
 * compris avant la bibliothèque, et ne doit jamais faire échouer la page
 * qu'il observe. Le plafond de 500 événements évite qu'une page en boucle
 * de rechargement ne mange la mémoire de l'onglet.
 *
 * Porte aussi le journal réseau et console (#994, `journal.ts`) : enveloppe
 * de `fetch` et de `console.warn/error`, `onerror`, `unhandledrejection`,
 * vidés par le collecteur avec le reste.
 */
export function earlyBufferScript(): string {
  return (
    `<script>(function(){try{var b=[];window.${EARLY_BUFFER_KEY}=b;` +
    `var n=['dsfr-data-loaded','dsfr-data-error','dsfr-data-loading','dsfr-data-idle',` +
    `'dsfr-data-source-command'];` +
    `for(var i=0;i<n.length;i++){(function(k){document.addEventListener(k,function(e){` +
    `if(b.length<500){b.push({name:k,detail:e.detail,t:Date.now()});}});})(n[i]);}` +
    `}catch(e){}})();` +
    // Journal réseau et console (#994) : même balise, même moment — avant la
    // bibliothèque, donc avant sa première requête.
    journalScript() +
    `</script>`
  );
}

/**
 * Le tampon est-il PRESENT dans la page observée ?
 *
 * A ne pas confondre avec « le tampon a livré des événements ». Un tampon
 * VIDE est le meilleur des cas : il signifie « rien ne s'est produit avant
 * que j'arrive ». Mesurer la présence par le nombre d'événements rejoués
 * ferait crier à la trace reconstituée précisément quand tout va bien — et
 * `dsfr-data-source` diffère son premier `loading` dans un `setTimeout`,
 * donc la course avec le `load` de l'iframe rend ce faux signal
 * intermittent. C'est la présence de la variable qui fait foi.
 */
export function hasEarlyBuffer(win: Window | null | undefined): boolean {
  return Array.isArray((win as WindowWithBuffer | null | undefined)?.__dsfrDataTrace);
}

/**
 * Vide le tampon d'une fenêtre observée et rend les événements empilés.
 *
 * Vider plutôt que copier : au second branchement (iframe rechargée), le
 * collecteur ne doit pas rejouer les événements du rendu précédent.
 */
export function drainEarlyBuffer(win: Window | null | undefined): BufferedBusEvent[] {
  const buffered = (win as WindowWithBuffer | null | undefined)?.__dsfrDataTrace;
  if (!Array.isArray(buffered)) return [];
  return buffered.splice(0, buffered.length);
}

/**
 * Sortie de chaque étape, relevée sur le cache global de la page observée.
 *
 * Filet de sécurité pour les pages qui n'ont PAS le tampon (code d'un tiers,
 * aperçu généré par une version antérieure) : `window.__dsfrDataCache` tient
 * la derniere valeur de chaque étape, on peut donc reconstituer l'essentiel
 * même en ayant tout manqué. Ne rattrape pas la chronologie — d'où le tampon,
 * qui reste la voie principale.
 *
 * Une étape en panne n'y figure PAS (#1272) : la bibliothèque sort ses lignes
 * du cache courant à l'erreur. Avant, ce relevé la déclarait « chargée » sur
 * les lignes d'avant la panne. Son état se relève par `readErrorSnapshot`.
 */
export function readCacheSnapshot(
  win: Window | null | undefined
): Array<{ sourceId: string; data: unknown }> {
  const cache = (win as (Window & { __dsfrDataCache?: Map<string, unknown> }) | null | undefined)
    ?.__dsfrDataCache;
  if (!cache || typeof cache.forEach !== 'function') return [];
  const out: Array<{ sourceId: string; data: unknown }> = [];
  cache.forEach((data, sourceId) => out.push({ sourceId, data }));
  return out;
}

/**
 * Étapes EN PANNE, relevées sur le registre d'erreur de la page observée
 * (`window.__dsfrDataErrors`, #1203), avec la date du dernier chargement
 * réussi quand des lignes périmées restent en mémoire (#1272).
 *
 * Le pendant de `readCacheSnapshot` : sur une page sans tampon, le collecteur
 * arrive après la panne et son événement est passé. Une bibliothèque
 * antérieure à ce registre n'en expose pas : rien n'est rendu.
 */
export function readErrorSnapshot(
  win: Window | null | undefined
): Array<{ sourceId: string; error: unknown; attemptedUrl?: string; lastLoadedAt?: number }> {
  const errors = (
    win as
      | (Window & {
          __dsfrDataErrors?: Map<
            string,
            { error?: unknown; attemptedUrl?: string; lastLoadedAt?: number }
          >;
        })
      | null
      | undefined
  )?.__dsfrDataErrors;
  if (!errors || typeof errors.forEach !== 'function') return [];
  const out: Array<{
    sourceId: string;
    error: unknown;
    attemptedUrl?: string;
    lastLoadedAt?: number;
  }> = [];
  errors.forEach((state, sourceId) => {
    out.push({
      sourceId,
      error: state?.error,
      ...(state?.attemptedUrl ? { attemptedUrl: state.attemptedUrl } : {}),
      ...(typeof state?.lastLoadedAt === 'number' ? { lastLoadedAt: state.lastLoadedAt } : {}),
    });
  });
  return out;
}

/**
 * Adaptateur de révélation de l'interface carto (#1005, epic #992, ADR-143 §6).
 *
 * Ce que seule la carto sait faire pour montrer un repère :
 *
 * 1. remettre les panneaux d'accord avec l'état. Les panneaux Couches et
 *    Éléments sont réécrits par `innerHTML` depuis `state.activeLayerId` ;
 *    si le DOM montre une autre couche que la couche active (état changé sans
 *    rendu), on relance le rendu (`rendre`, le `renderAll()` de `main.ts`) et on
 *    attend une image ;
 * 2. ouvrir le volet qui porte le repère (rail + volet unique, #1088) — les
 *    deux autres se masquent ;
 * 3. déplier les `<details>` englobants (« Options avancées », « Contenu de la
 *    fiche »…) ; un repère qui EST un `<details>` (zone) est déplié lui-même ;
 * 4. sélectionner l'onglet Code pour un repère de `carto.code` ;
 * 5. résoudre `[data-repere="<id>"]` (ou `[data-zone]`).
 *
 * Ce qu'il ne fait JAMAIS : changer l'état de la carte. Il ne choisit pas la
 * couche active à la place de l'usager — c'est le rôle du prérequis
 * `couche-active`, qui montre d'abord la liste des couches. Il ne change
 * aucun réglage : un contrôle que la couche courante n'affiche pas (champ
 * infobulle d'une couche en mode fiche, couleur d'une heatmap…) n'est pas
 * « révélé » de force, `reveler` rend `null` et `montrer()` répond
 * `introuvable`.
 */
import { estIdRepere, selecteurRepere } from '@dsfr-data/shared';
import type { AdaptateurReperage } from '@dsfr-data/shared';
import { state, type CartoState } from '../state.js';
import { PREREQUIS } from './prerequis.js';
import { CLASSE_VOLET_MASQUE, estVolet, ouvrirVolet } from '../volets.js';

/**
 * Zone de premier niveau → volet de `index.html`. Table littérale :
 * le panneau se déduit du préfixe de l'identifiant, jamais du DOM.
 * `carto.actions` (barre d'actions) et `carto.code` (onglet) ne sont pas des
 * panneaux.
 */
export const PANNEAU_DE_ZONE: Readonly<Record<string, string>> = {
  'carto.carte': 'panel-carte',
  'carto.couches': 'panel-couches',
  'carto.elements': 'panel-elements',
};

/** Classe d'un volet masqué (`volets.ts`). */
export const CLASSE_PANNEAU_REPLIE = CLASSE_VOLET_MASQUE;

/** Panneau `#panel-*` qui contient le repère `id`, ou `undefined`. */
export function panneauDuRepere(id: string): string | undefined {
  const [app, zone] = id.split('.');
  return PANNEAU_DE_ZONE[`${app}.${zone}`];
}

/** Le repère vit-il dans l'onglet Code (hors le bouton de l'onglet lui-même) ? */
export function estDansOngletCode(id: string): boolean {
  return id.startsWith('carto.code.') && id !== 'carto.code.onglet';
}

/**
 * L'élément est-il affiché ? Masqué si lui ou un ancêtre porte `hidden`, un
 * `display: none` en ligne, un volet masqué (en-tête compris), ou un
 * `<details>` fermé (hors `summary`). Lecture des attributs, classes et style
 * EN LIGNE : c'est ainsi que la carto masque ses contrôles, et ce qu'un DOM de
 * test sait reproduire.
 */
export function estAffiche(el: HTMLElement): boolean {
  let enfant: Element | null = null;
  for (let n: Element | null = el; n; enfant = n, n = n.parentElement) {
    if (!(n instanceof HTMLElement)) continue;
    if (n.hidden || n.style.display === 'none') return false;
    if (n.classList.contains(CLASSE_PANNEAU_REPLIE)) return false;
    if (
      n instanceof HTMLDetailsElement &&
      !n.open &&
      !(enfant instanceof HTMLElement && enfant.tagName === 'SUMMARY')
    ) {
      return false;
    }
  }
  return true;
}

function imageSuivante(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/**
 * Élément qui porte le repère `id` : `data-repere` (contrôle) par
 * `selecteurRepere`, sinon `data-zone` (zone) par comparaison d'attribut —
 * aucun sélecteur n'est construit à la main.
 */
function trouver(racine: Document, id: string): HTMLElement | null {
  const controle = racine.querySelector<HTMLElement>(selecteurRepere(id));
  if (controle) return controle;
  for (const el of racine.querySelectorAll<HTMLElement>('[data-zone]')) {
    if (el.getAttribute('data-zone') === id) return el;
  }
  return null;
}

/**
 * Ouvre le volet qui porte le repère, comme son bouton du rail — sans
 * mémoriser ce choix : c'est une révélation, pas un geste de l'usager.
 */
function deplierPanneau(racine: Document, id: string): void {
  const panneau = racine.getElementById(id);
  if (!panneau || !panneau.classList.contains(CLASSE_PANNEAU_REPLIE) || !estVolet(id)) return;
  ouvrirVolet(racine, id);
}

/** Sélectionne l'onglet Code s'il ne l'est pas (le bouton porte le comportement DSFR). */
function selectionnerOngletCode(racine: Document): void {
  const panneau = racine.getElementById('carto-tab-code');
  if (!panneau || panneau.classList.contains('fr-tabs__panel--selected')) return;
  racine.getElementById('carto-tab-code-btn')?.click();
}

/**
 * Le DOM des panneaux montre-t-il une autre couche que la couche active ?
 * La ligne `--active` de la liste est le témoin du dernier rendu.
 */
function panneauxEnRetard(racine: Document, etat: CartoState): boolean {
  const liste = racine.getElementById('layers-list');
  if (!liste) return false;
  const active = etat.layers.some((l) => l.id === etat.activeLayerId) ? etat.activeLayerId : null;
  const rendue =
    liste.querySelector('.carto-layers__item--active')?.getAttribute('data-layer-id') ?? null;
  const lignes = liste.querySelectorAll('[data-layer-id]').length;
  return rendue !== active || lignes !== etat.layers.length;
}

/** Événements qui signalent un changement d'état de la carto. */
const EVENEMENTS_ETAT = ['change', 'input', 'click'] as const;

export interface OptionsAdaptateurCarto {
  /** Rendu complet des panneaux : `renderAll()` de `main.ts`. */
  rendre: () => void;
  /** Document cible ; par défaut `document`. */
  racine?: Document;
  /** État lu par les prérequis ; par défaut le singleton de `state.ts`. */
  etat?: () => CartoState;
}

/** L'adaptateur de révélation de la carto. */
export function creerAdaptateurCarto(opts: OptionsAdaptateurCarto): AdaptateurReperage<CartoState> {
  const racine = opts.racine ?? document;
  const lireEtat = opts.etat ?? (() => state);

  return {
    async reveler(id: string): Promise<HTMLElement | null> {
      if (!estIdRepere(id)) return null;

      // 1. Panneaux réécrits par innerHTML : les remettre d'accord avec l'état.
      if (panneauxEnRetard(racine, lireEtat())) {
        opts.rendre();
        await imageSuivante();
      }

      // 2. Panneau flottant, 4. onglet Code.
      const panneau = panneauDuRepere(id);
      if (panneau) deplierPanneau(racine, panneau);
      if (estDansOngletCode(id)) selectionnerOngletCode(racine);
      await imageSuivante();

      const element = trouver(racine, id);
      if (!element) return null;

      // 3. `<details>` englobants, et le repère lui-même s'il en est un.
      if (element instanceof HTMLDetailsElement && !element.open) element.open = true;
      for (
        let details = element.parentElement?.closest('details') ?? null;
        details;
        details = details.parentElement?.closest('details') ?? null
      ) {
        if (!details.open) details.open = true;
      }

      return estAffiche(element) ? element : null;
    },

    etat: lireEtat,

    prerequis: PREREQUIS,

    onEtatChange(cb: () => void): () => void {
      // Délégation : les gestionnaires de l'app, posés sur les contrôles, ont
      // déjà mis l'état à jour quand l'événement atteint le document ; le
      // rappel part en microtâche, après eux.
      let enAttente = false;
      const signaler = () => {
        if (enAttente) return;
        enAttente = true;
        queueMicrotask(() => {
          enAttente = false;
          cb();
        });
      };
      for (const type of EVENEMENTS_ETAT) racine.addEventListener(type, signaler);
      return () => {
        for (const type of EVENEMENTS_ETAT) racine.removeEventListener(type, signaler);
      };
    },
  };
}

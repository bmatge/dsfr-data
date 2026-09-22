/**
 * Adaptateur de révélation du builder graphique (#1006, epic #992, ADR-143 §6).
 *
 * Ce que seule l'app sait faire pour montrer un repère : ouvrir la section
 * repliée qui le contient (`openSection`, la même que la visite guidée), déplier
 * le `<details>` englobant, ouvrir la modale de configuration qui le porte, puis
 * attendre une image avant de résoudre `[data-repere="<id>"]`.
 *
 * Ce qu'il ne fait JAMAIS : modifier l'état du builder. Aucune valeur de
 * réglage n'est changée, aucun type choisi ; ouvrir une modale se fait par
 * `openModal` (une classe CSS), pas par son bouton, qui réinitialiserait les
 * lignes depuis l'état. Un contrôle masqué par le type courant (séries d'un
 * camembert, sections du mode dynamique…) n'est pas « révélé » de force :
 * `reveler` rend `null`, et `montrer()` répond `introuvable` — c'est le rôle
 * des prérequis de dire comment le faire apparaître.
 */
import { closeModal, estIdRepere, openModal, selecteurRepere } from '@dsfr-data/shared';
import type { AdaptateurReperage } from '@dsfr-data/shared';
import { state, type BuilderState } from '../state.js';
import { openSection } from '../ui/ui-helpers.js';
import { PREREQUIS } from './prerequis.js';

/**
 * Zone de premier niveau → section repliable de `index.html`. Table littérale :
 * la section se déduit du préfixe de l'identifiant, jamais du DOM.
 * `builder.actions` et `builder.code` ne sont pas des sections (barre d'actions,
 * onglet de l'aperçu) : rien à ouvrir.
 */
export const SECTION_DE_ZONE: Readonly<Record<string, string>> = {
  'builder.source': 'section-source',
  'builder.type': 'section-type',
  'builder.donnees': 'section-data',
  'builder.apparence': 'section-appearance',
  'builder.generation': 'section-generation-mode',
  'builder.nettoyage': 'section-normalize',
  'builder.cadre': 'section-databox',
  'builder.facettes': 'section-facets',
  'builder.partage': 'section-url-sync',
  'builder.accessibilite': 'section-a11y',
};

/** Sous-zone portée par une modale → id de la modale (overlay). */
export const MODALE_DE_ZONE: Readonly<Record<string, string>> = {
  'builder.donnees.tableau.colonnes': 'datalist-columns-modal',
  'builder.facettes.champs': 'facets-fields-modal',
};

/** Section `#section-*` qui contient le repère `id`, ou `undefined`. */
export function sectionDuRepere(id: string): string | undefined {
  const [app, zone] = id.split('.');
  return SECTION_DE_ZONE[`${app}.${zone}`];
}

/** Modale qui porte le repère `id` (lui-même ou une de ses zones), ou `undefined`. */
export function modaleDuRepere(id: string): string | undefined {
  const segments = id.split('.');
  for (let n = segments.length; n >= 2; n--) {
    const modale = MODALE_DE_ZONE[segments.slice(0, n).join('.')];
    if (modale) return modale;
  }
  return undefined;
}

/**
 * L'élément est-il affiché ? Masqué si lui ou un ancêtre porte `hidden`, un
 * `display: none` en ligne, une section repliée (`.collapsed`, hors en-tête),
 * un `<details>` fermé (hors `summary`) ou une modale inactive. Lecture du
 * style EN LIGNE et des classes : c'est ainsi que le builder masque ses
 * contrôles, et c'est ce qu'un DOM de test sait reproduire.
 */
export function estAffiche(el: HTMLElement): boolean {
  let enfant: Element | null = null;
  for (let n: Element | null = el; n; enfant = n, n = n.parentElement) {
    if (!(n instanceof HTMLElement)) continue;
    if (n.hidden || n.style.display === 'none') return false;
    if (n.classList.contains('modal-overlay') && !n.classList.contains('active')) return false;
    if (
      n.classList.contains('config-section') &&
      n.classList.contains('collapsed') &&
      !(enfant instanceof HTMLElement && enfant.classList.contains('config-section-header'))
    ) {
      return false;
    }
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

/** Événements qui signalent un changement d'état du builder. */
const EVENEMENTS_ETAT = ['change', 'input', 'click'] as const;

/** L'adaptateur de révélation du builder, branché sur l'état singleton. */
export function creerAdaptateurBuilder(
  racine: Document = document
): AdaptateurReperage<BuilderState> {
  return {
    async reveler(id: string): Promise<HTMLElement | null> {
      if (!estIdRepere(id)) return null;
      const section = sectionDuRepere(id);
      if (section) openSection(section);
      const modale = modaleDuRepere(id);
      const modaleEtaitFermee =
        modale !== undefined && !racine.getElementById(modale)?.classList.contains('active');
      if (modale) openModal(modale);
      await imageSuivante();

      const element = trouver(racine, id);
      if (element) {
        // `<details>` englobant (Requête avancée) : le déplier ne règle rien.
        const details =
          element instanceof HTMLDetailsElement ? element : element.closest('details');
        if (details && !details.open) details.open = true;
        if (estAffiche(element)) return element;
      }
      // Modale ouverte pour rien (ses lignes ne sont rendues que par son
      // bouton, qui lit l'état) : on la referme, l'interface reste telle quelle.
      if (modale && modaleEtaitFermee) closeModal(modale);
      return null;
    },

    etat: () => state,

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
      racine.addEventListener('builder:fields-updated', signaler);
      return () => {
        for (const type of EVENEMENTS_ETAT) racine.removeEventListener(type, signaler);
        racine.removeEventListener('builder:fields-updated', signaler);
      };
    },
  };
}

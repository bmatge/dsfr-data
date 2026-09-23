/**
 * Adaptateur de révélation de l'app Sources (#1007, epic #992, ADR-143 §6).
 *
 * Ce que seule l'app sait faire pour montrer un repère : ouvrir la modale qui
 * le porte, passer la modale de connexion à la bonne étape (détection par URL
 * ou configuration), déplier « Paramètres avancés », afficher les champs du
 * bon type de connexion (Grist ou API REST), afficher le bon mode de saisie
 * d'une source manuelle (tableau, JSON, CSV), puis attendre une image avant de
 * résoudre `[data-repere="<id>"]`.
 *
 * Ce qu'il ne fait JAMAIS : enregistrer ou modifier une connexion, une source.
 * Une modale n'est préparée (type de connexion, mode d'éditeur) que si elle
 * était FERMÉE — c'est alors exactement ce que ferait son bouton. Une modale
 * déjà ouverte n'est jamais basculée vers un autre type ou un autre mode : la
 * saisie en cours changerait de sens, `reveler` rend `null`. Seules l'étape et
 * le `<details>`, qui n'affichent ou ne masquent que des champs, sont réglés
 * dans une modale ouverte. Sans le prérequis d'une modale (aperçu ouvert, deux
 * jeux locaux, document Grist choisi), `reveler` rend `null` : c'est le rôle
 * du prérequis de montrer ce qui le lève.
 *
 * Pas de volet Diagnostic dans cette app : l'adaptateur sert le guidage.
 */
import { closeModal, estIdRepere, openModal, selecteurRepere } from '@dsfr-data/shared';
import type { AdaptateurReperage } from '@dsfr-data/shared';
import { state } from '../state.js';
import {
  getConnType,
  isPreviewPanelOpen,
  openExportGristModal,
  openJoinModal,
  resetConnectionForm,
  setConnectionModalStep,
  setConnType,
  switchSourceMode,
} from '../connections/connection-manager.js';
import { PREREQUIS, type EtatSources } from './prerequis.js';

/** Zone de premier niveau → modale (overlay) qui la porte. */
export const MODALE_DE_ZONE: Readonly<Record<string, string>> = {
  'sources.connexion': 'connection-modal',
  'sources.table-grist': 'create-table-modal',
  'sources.export-grist': 'export-grist-modal',
  'sources.jointure': 'join-source-modal',
  'sources.manuelle': 'manual-source-modal',
};

/** Sous-zone de la configuration d'une connexion → type de connexion affiché. */
const TYPE_DE_ZONE: Readonly<Record<string, 'grist' | 'api'>> = {
  'sources.connexion.configuration.grist': 'grist',
  'sources.connexion.configuration.api': 'api',
};

/** Sous-zone de la source manuelle → mode de saisie (`switchSourceMode`). */
const MODE_DE_ZONE: Readonly<Record<string, string>> = {
  'sources.manuelle.tableau': 'table',
  'sources.manuelle.json': 'json',
  'sources.manuelle.csv': 'csv',
};

/** Préfixe d'identifiant : `id` est-il `zone` ou l'un de ses descendants ? */
function sous(id: string, zone: string): boolean {
  return id === zone || id.startsWith(`${zone}.`);
}

/** Valeur de `table` pour la zone la plus longue qui contient `id`. */
function parZone<T>(table: Readonly<Record<string, T>>, id: string): T | undefined {
  const segments = id.split('.');
  for (let n = segments.length; n >= 2; n--) {
    const v = table[segments.slice(0, n).join('.')];
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Modale qui porte le repère `id`, ou `undefined`. */
export function modaleDuRepere(id: string): string | undefined {
  return parZone(MODALE_DE_ZONE, id);
}

/** Type de connexion requis par le repère `id`, ou `undefined`. */
export function typeConnexionDuRepere(id: string): 'grist' | 'api' | undefined {
  return parZone(TYPE_DE_ZONE, id);
}

/** Mode de saisie requis par le repère `id`, ou `undefined`. */
export function modeSaisieDuRepere(id: string): string | undefined {
  return parZone(MODE_DE_ZONE, id);
}

/** L'état lu par les prérequis. */
export function etatSources(): EtatSources {
  return { app: state, apercuOuvert: isPreviewPanelOpen() };
}

/**
 * L'élément est-il affiché ? Masqué si lui ou un ancêtre porte `hidden`, un
 * `display: none` en ligne, une modale inactive ou un `<details>` fermé (hors
 * `summary`).
 */
export function estAffiche(el: HTMLElement): boolean {
  let enfant: Element | null = null;
  for (let n: Element | null = el; n; enfant = n, n = n.parentElement) {
    if (!(n instanceof HTMLElement)) continue;
    if (n.hidden || n.style.display === 'none') return false;
    if (n.classList.contains('modal-overlay') && !n.classList.contains('active')) return false;
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

/** Élément qui porte le repère `id` : `data-repere`, sinon `data-zone`. */
function trouver(racine: Document, id: string): HTMLElement | null {
  const controle = racine.querySelector<HTMLElement>(selecteurRepere(id));
  if (controle) return controle;
  for (const el of racine.querySelectorAll<HTMLElement>('[data-zone]')) {
    if (el.getAttribute('data-zone') === id) return el;
  }
  return null;
}

/**
 * Un champ fichier masqué dans un `<label>` stylé en bouton (« Importer ») :
 * c'est le libellé que l'usager voit et actionne.
 */
function cibleVisible(el: HTMLElement): HTMLElement {
  if (el instanceof HTMLInputElement && el.type === 'file' && el.style.display === 'none') {
    const label = el.closest('label');
    if (label instanceof HTMLElement) return label;
  }
  return el;
}

/**
 * Ouvre la modale fermée qui porte `id`, préparée comme par son bouton. Rend
 * `false` si elle ne peut pas l'être (prérequis absent) ; sinon la fonction
 * qui la referme.
 */
function ouvrirModale(racine: Document, modale: string, id: string): (() => void) | false {
  const etat = etatSources();
  switch (modale) {
    case 'connection-modal': {
      resetConnectionForm();
      openModal(modale);
      const type = typeConnexionDuRepere(id);
      if (type) setConnType(type);
      break;
    }
    case 'manual-source-modal': {
      openModal(modale);
      const mode = modeSaisieDuRepere(id);
      if (mode) basculerMode(racine, mode);
      // Refermée pour rien : on la rend dans son mode d'ouverture.
      return () => {
        if (mode) basculerMode(racine, 'table');
        closeModal(modale);
      };
    }
    case 'join-source-modal':
      if (!PREREQUIS['deux-sources-locales'].verifier(etat)) return false;
      openJoinModal();
      break;
    case 'export-grist-modal':
      if (!PREREQUIS['apercu-ouvert'].verifier(etat)) return false;
      openExportGristModal();
      break;
    case 'create-table-modal':
      if (!PREREQUIS['document-grist-choisi'].verifier(etat)) return false;
      openModal(modale);
      break;
    default:
      return false;
  }
  return () => closeModal(modale);
}

/** Mode de saisie affiché : le bouton bascule actif. */
function modeAffiche(racine: Document): string | undefined {
  return racine.querySelector<HTMLElement>('[data-source-mode].active')?.dataset.sourceMode;
}

/** Bascule le mode de saisie comme le fait son bouton (panneau et `aria-pressed`). */
function basculerMode(racine: Document, mode: string): void {
  switchSourceMode(mode);
  for (const t of racine.querySelectorAll<HTMLElement>('[data-source-mode]')) {
    t.setAttribute('aria-pressed', t.dataset.sourceMode === mode ? 'true' : 'false');
  }
}

/** Étape et `<details>` de la modale de connexion : affichage seulement. */
function preparerConnexion(racine: Document, id: string): void {
  if (sous(id, 'sources.connexion.detection') || id === 'sources.connexion.continuer') {
    setConnectionModalStep('detect');
  } else if (
    sous(id, 'sources.connexion.configuration') ||
    id === 'sources.connexion.enregistrer'
  ) {
    setConnectionModalStep('manual');
    if (typeConnexionDuRepere(id)) {
      const details = racine.getElementById('advanced-settings');
      if (details instanceof HTMLDetailsElement && !details.open) details.open = true;
    }
  }
}

/** Événements qui signalent un changement d'état de l'app. */
const EVENEMENTS_ETAT = ['change', 'input', 'click'] as const;

/** L'adaptateur de révélation de l'app Sources, branché sur l'état singleton. */
export function creerAdaptateurSources(
  racine: Document = document
): AdaptateurReperage<EtatSources> {
  return {
    async reveler(id: string): Promise<HTMLElement | null> {
      if (!estIdRepere(id)) return null;
      let annuler: (() => void) | null = null;
      const modale = modaleDuRepere(id);
      if (modale) {
        const ouverte = racine.getElementById(modale)?.classList.contains('active') === true;
        if (!ouverte) {
          const r = ouvrirModale(racine, modale, id);
          if (r === false) return null;
          annuler = r;
        } else {
          // Modale ouverte : jamais basculée vers un autre type ou mode.
          const type = typeConnexionDuRepere(id);
          if (type && modale === 'connection-modal' && getConnType() !== type) return null;
          const mode = modeSaisieDuRepere(id);
          if (mode && modale === 'manual-source-modal' && modeAffiche(racine) !== mode) {
            return null;
          }
        }
        if (modale === 'connection-modal') preparerConnexion(racine, id);
      }
      await imageSuivante();

      const element = trouver(racine, id);
      if (element) {
        const cible = cibleVisible(element);
        if (estAffiche(cible)) return cible;
      }
      annuler?.();
      return null;
    },

    etat: etatSources,

    prerequis: PREREQUIS,

    onEtatChange(cb: () => void): () => void {
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

/**
 * Adaptateur de révélation du dashboard (#1007, epic #992, ADR-143 §6).
 *
 * Ce que seule l'app sait faire pour montrer un repère : ouvrir la modale de
 * configuration du widget qui porte le réglage (celui qui est sélectionné,
 * sinon le premier widget du type demandé), ouvrir la modale d'enregistrement,
 * revenir sur l'onglet « Aperçu » pour la grille, puis attendre une image avant
 * de résoudre `[data-repere="<id>"]`.
 *
 * Ce qu'il ne fait JAMAIS : modifier le tableau de bord. Aucun widget n'est
 * ajouté, aucune valeur n'est appliquée ; ouvrir la modale d'un widget ne
 * touche que `state.selectedWidget` (l'état de l'interface, pas le document).
 * Une modale déjà ouverte sur un AUTRE widget n'est jamais remplacée : les
 * saisies en cours y seraient perdues, `reveler` rend `null`. Sans widget du
 * type demandé, `reveler` rend `null` : c'est le rôle du prérequis
 * (`widget-kpi`…) de montrer l'item de bibliothèque à glisser.
 */
import { estIdRepere, selecteurRepere } from '@dsfr-data/shared';
import type { AdaptateurReperage } from '@dsfr-data/shared';
import {
  isBuilderChart,
  isFavoriteChart,
  state,
  type AppState,
  type Widget,
  type WidgetType,
} from '../state.js';
import { closeConfigModal, openConfigModal } from '../widget-config.js';
import { closeSaveModal, openSaveModal } from '../dashboards.js';
import { PREREQUIS } from './prerequis.js';

/** Sous-zone de la modale de configuration → type de widget qu'elle règle. */
export const TYPE_DE_ZONE: Readonly<Record<string, WidgetType>> = {
  'dashboard.widget.kpi': 'kpi',
  'dashboard.widget.graphique': 'chart',
  'dashboard.widget.tableau': 'table',
  'dashboard.widget.texte': 'text',
};

/** Zones portées par l'onglet « Aperçu » (panneau `#tab-design`). */
const ZONES_APERCU = ['dashboard.canevas.grille', 'dashboard.canevas.ajouter-ligne'];

const MODALE_WIDGET = 'config-modal';
const MODALE_ENREGISTREMENT = 'save-modal';

/** Préfixe d'identifiant : `id` est-il `zone` ou l'un de ses descendants ? */
function sous(id: string, zone: string): boolean {
  return id === zone || id.startsWith(`${zone}.`);
}

/** Type de widget requis par le repère `id`, `undefined` s'il n'en exige pas. */
export function typeDuRepere(id: string): WidgetType | undefined {
  const [app, zone, sousZone] = id.split('.');
  return TYPE_DE_ZONE[`${app}.${zone}.${sousZone}`];
}

/** Le widget règle-t-il le type demandé (un graphique : seulement manuel) ? */
function convient(w: Widget, type: WidgetType | undefined): boolean {
  if (!type) return true;
  if (w.type !== type) return false;
  if (w.type === 'chart') return !isFavoriteChart(w.config) && !isBuilderChart(w.config);
  return true;
}

/** Widget dont ouvrir la modale : le sélectionné s'il convient, sinon le premier du type. */
export function widgetPour(etat: AppState, id: string): Widget | null {
  const type = typeDuRepere(id);
  if (etat.selectedWidget && convient(etat.selectedWidget, type)) return etat.selectedWidget;
  return etat.dashboard.widgets.find((w) => convient(w, type)) ?? null;
}

/**
 * L'élément est-il affiché ? Masqué si lui ou un ancêtre porte `hidden`, un
 * `display: none` en ligne, une modale inactive (`.config-modal` sans
 * `.active`) ou un panneau d'onglet non sélectionné.
 */
export function estAffiche(el: HTMLElement): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (!(n instanceof HTMLElement)) continue;
    if (n.hidden || n.style.display === 'none') return false;
    if (n.classList.contains('config-modal') && !n.classList.contains('active')) return false;
    if (n.classList.contains('fr-tabs__panel') && !n.classList.contains('fr-tabs__panel--selected'))
      return false;
  }
  return true;
}

/** API du JS DSFR, quand il est chargé (onglets). */
type Dsfr = (el: Element) => { tabPanel?: { disclose(): void } } | undefined;

/** Sélectionne l'onglet « Aperçu » (par le JS DSFR, sinon en posant ses classes). */
function ouvrirApercu(racine: Document): void {
  const panneau = racine.getElementById('tab-design');
  if (!panneau || panneau.classList.contains('fr-tabs__panel--selected')) return;
  const dsfr = (racine.defaultView as (Window & { dsfr?: Dsfr }) | null)?.dsfr;
  const api = dsfr?.(panneau)?.tabPanel;
  if (api) {
    api.disclose();
    return;
  }
  for (const p of racine.querySelectorAll('.vde-tabs .fr-tabs__panel')) {
    p.classList.toggle('fr-tabs__panel--selected', p === panneau);
  }
  for (const b of racine.querySelectorAll('.vde-tabs [role="tab"]')) {
    b.setAttribute('aria-selected', b.id === 'tab-design-btn' ? 'true' : 'false');
  }
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
 * Ouvre la modale de configuration qui porte `id`. Rend la fonction qui
 * l'annule, `null` si elle était déjà ouverte sur un widget qui convient
 * (rien à annuler), `false` si aucun widget ne convient ou si elle est ouverte
 * sur un autre widget.
 */
function ouvrirModaleWidget(racine: Document, id: string): (() => void) | null | false {
  const modale = racine.getElementById(MODALE_WIDGET);
  if (!modale) return false;
  const ouverte = modale.classList.contains('active');
  const type = typeDuRepere(id);
  if (ouverte) {
    // Jamais remplacer une modale ouverte : ses saisies seraient perdues.
    const courant = state.selectedWidget;
    return courant && convient(courant, type) ? null : false;
  }
  const widget = widgetPour(state, id);
  if (!widget) return false;
  const avant = state.selectedWidget;
  openConfigModal(widget);
  return () => {
    closeConfigModal();
    state.selectedWidget = avant;
  };
}

/** Événements qui signalent un changement d'état du dashboard. */
const EVENEMENTS_ETAT = ['change', 'input', 'click', 'drop'] as const;

/** L'adaptateur de révélation du dashboard, branché sur l'état singleton. */
export function creerAdaptateurDashboard(
  racine: Document = document
): AdaptateurReperage<AppState> {
  return {
    async reveler(id: string): Promise<HTMLElement | null> {
      if (!estIdRepere(id)) return null;
      let annuler: (() => void) | null = null;
      if (sous(id, 'dashboard.widget')) {
        const r = ouvrirModaleWidget(racine, id);
        if (r === false) return null;
        annuler = r;
      }
      if (sous(id, 'dashboard.enregistrement')) {
        const modale = racine.getElementById(MODALE_ENREGISTREMENT);
        if (modale && !modale.classList.contains('active')) {
          openSaveModal();
          annuler = closeSaveModal;
        }
      }
      if (ZONES_APERCU.some((z) => sous(id, z))) ouvrirApercu(racine);
      await imageSuivante();

      const element = trouver(racine, id);
      if (element && estAffiche(element)) return element;
      annuler?.();
      return null;
    },

    etat: () => state,

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

/**
 * Adaptateur de révélation du pipeline (#1008, epic #992, ADR-143 §6).
 *
 * Ce que seule l'app sait faire pour montrer un repère :
 *
 * - contrôle ou zone d'une ÉTAPE (`pipeline.<type>[.<attribut>]`) : choisir un
 *   nœud de ce type (le nœud sélectionné s'il en est un, sinon le premier du
 *   canevas), le sélectionner, centrer la vue dessus, attendre le rendu, puis
 *   chercher `[data-repere]` EN TRAVERSANT les shadow roots — `rete-node` rend
 *   ses contrôles dans son shadow DOM. Une zone d'étape rend l'élément du nœud ;
 * - bouton du menu « Ajouter une étape » : ouvrir le menu (`app-menu`) ;
 * - repère statique (barre, onglets, éditeur) : le résoudre dans le document.
 *
 * Ce qu'il ne fait JAMAIS : modifier le pipeline. Aucun nœud ajouté ou
 * retiré, aucune valeur changée ; sélectionner et centrer ne touchent qu'à la
 * vue. Sans nœud du type demandé, `reveler` rend `null` et `montrer()` passe
 * par le prérequis `noeud-<type>` (le bouton qui ajoute l'étape).
 */
import { estIdRepere } from '@dsfr-data/shared';
import type { AdaptateurReperage } from '@dsfr-data/shared';
import type { PipelineNode } from '../nodes/base-node.js';
import { NODE_CONFIGS } from '../nodes/node-configs.js';
import { PREREQUIS, type EtatPipeline } from './prerequis.js';
import { typeDuRepere, zoneNoeud } from './reperes-ids.js';

/** Ce que l'adaptateur demande à l'éditeur Rete (`PipelineEditor` le fournit). */
export interface EditeurPourReperes {
  getNodes(): PipelineNode[];
  selectionner(nodeId: string): Promise<void>;
  centrerSur(nodeId: string): Promise<void>;
  elementDuNoeud(nodeId: string): HTMLElement | null;
}

/** Types de nœud connus, clés de `NODE_CONFIGS`. */
const TYPES = Object.values(NODE_CONFIGS).map((c) => c.type);

/**
 * Premier élément sous `racine` (document, élément ou shadow root, en
 * profondeur, shadow roots ouverts compris) dont l'attribut `attribut` vaut
 * `valeur`. Comparaison d'attribut : aucun sélecteur construit depuis l'id.
 */
export function chercherEnProfondeur(
  racine: ParentNode,
  attribut: string,
  valeur: string
): HTMLElement | null {
  const pile: ParentNode[] = [racine];
  if (racine instanceof Element && racine.shadowRoot) pile.push(racine.shadowRoot);
  while (pile.length) {
    const courant = pile.shift()!;
    for (const el of courant.querySelectorAll<HTMLElement>('*')) {
      if (el.getAttribute(attribut) === valeur) return el;
      if (el.shadowRoot) pile.push(el.shadowRoot);
    }
  }
  return null;
}

/** Nœud à montrer pour `type` : le sélectionné s'il est de ce type, sinon le premier. */
export function noeudPour(nodes: readonly PipelineNode[], type: string): PipelineNode | undefined {
  const duType = nodes.filter((n) => n.config.type === type);
  return duType.find((n) => (n as { selected?: boolean }).selected) ?? duType[0];
}

function imageSuivante(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/** Menu déroulant du chrome (`app-menu`), vu par son API publique. */
interface MenuDeroulant extends HTMLElement {
  open: boolean;
  openMenu(focus?: 'first' | 'last' | 'none'): void;
}

/** Élément statique d'un repère : `data-repere`, sinon `data-zone`. */
function trouverStatique(racine: Document, id: string): HTMLElement | null {
  return (
    chercherEnProfondeur(racine, 'data-repere', id) ?? chercherEnProfondeur(racine, 'data-zone', id)
  );
}

/** Événements qui signalent un changement du pipeline (ajout/retrait de nœud, saisie). */
const EVENEMENTS_ETAT = ['click', 'change', 'input', 'keyup'] as const;

/** L'adaptateur de révélation du pipeline, branché sur l'éditeur Rete. */
export function creerAdaptateurPipeline(
  editeur: EditeurPourReperes,
  racine: Document = document
): AdaptateurReperage<EtatPipeline> {
  return {
    async reveler(id: string): Promise<HTMLElement | null> {
      if (!estIdRepere(id)) return null;
      const type = typeDuRepere(id, TYPES);
      if (type) {
        const noeud = noeudPour(editeur.getNodes(), type);
        if (!noeud) return null;
        await editeur.selectionner(noeud.id);
        await editeur.centrerSur(noeud.id);
        await imageSuivante();
        const hote = editeur.elementDuNoeud(noeud.id);
        if (!hote) return null;
        if (id === zoneNoeud(type)) return hote;
        return chercherEnProfondeur(hote, 'data-repere', id);
      }
      const element = trouverStatique(racine, id);
      if (!element) return null;
      const menu = element.closest('app-menu') as MenuDeroulant | null;
      if (menu && !menu.open) {
        menu.openMenu('none');
        await imageSuivante();
      }
      return element;
    },

    etat: (): EtatPipeline => ({ types: editeur.getNodes().map((n) => n.config.type) }),

    prerequis: PREREQUIS,

    onEtatChange(cb: () => void): () => void {
      // Délégation : l'ajout ou le retrait d'un nœud passe par un bouton de la
      // barre (clic) ou la touche Suppr ; le rappel part en microtâche, après
      // les gestionnaires de l'app.
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

/**
 * Adaptateur de révélation du pipeline (#1008, ADR-143 §6) : il sélectionne un
 * nœud du bon type, résout le repère À TRAVERS le shadow DOM de Rete, rend
 * `null` sans nœud de ce type, et ne modifie jamais le pipeline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { montrer } from '@dsfr-data/shared';
import { PipelineEditor } from '../../../apps/pipeline-helper/src/editor';
import {
  chercherEnProfondeur,
  creerAdaptateurPipeline,
  noeudPour,
} from '../../../apps/pipeline-helper/src/assistant/adaptateur';
import { REGISTRE } from '../../../apps/pipeline-helper/src/assistant/reperes.generated';
import { PREREQUIS } from '../../../apps/pipeline-helper/src/assistant/prerequis';
import type { PipelineNode } from '../../../apps/pipeline-helper/src/nodes/base-node';

/** Valeurs de tous les contrôles d'attribut du pipeline (pour « rien n'a changé »). */
function valeurs(editeur: PipelineEditor): string {
  return JSON.stringify(editeur.getNodes().map((n) => n.getAttributes()));
}

describe('adaptateur de révélation du pipeline (#1008)', () => {
  let conteneur: HTMLElement;
  let editeur: PipelineEditor;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <app-action-bar data-zone="pipeline.actions">
        <button id="btn-execute" data-repere="pipeline.actions.executer">Exécuter</button>
      </app-action-bar>
      <div id="rete-container" data-zone="pipeline.editeur"></div>`;
    conteneur = document.getElementById('rete-container')!;
    editeur = new PipelineEditor(conteneur);
  });

  afterEach(() => {
    editeur.destroy();
    document.body.innerHTML = '';
  });

  it('chercherEnProfondeur traverse les shadow roots', () => {
    const hote = document.createElement('div');
    const ombre = hote.attachShadow({ mode: 'open' });
    ombre.innerHTML = '<div><input data-repere="pipeline.join.on"></div>';
    expect(hote.querySelector('[data-repere]')).toBeNull();
    expect(chercherEnProfondeur(hote, 'data-repere', 'pipeline.join.on')?.tagName).toBe('INPUT');
  });

  it('révèle un contrôle d’étape à travers le shadow DOM de Rete, sans rien modifier', async () => {
    await editeur.addNode('source');
    const requete = await editeur.addNode('query');
    await vi.waitFor(() => expect(editeur.elementDuNoeud(requete!.id)).not.toBeNull());
    const avant = valeurs(editeur);
    const nombre = editeur.getNodes().length;
    const adaptateur = creerAdaptateurPipeline(editeur);
    let el: HTMLElement | null = null;
    await vi.waitFor(async () => {
      el = await adaptateur.reveler('pipeline.query.group-by');
      expect(el).not.toBeNull();
    });
    expect(el!.getAttribute('data-repere')).toBe('pipeline.query.group-by');
    expect(document.querySelector('[data-repere="pipeline.query.group-by"]')).toBeNull();
    expect((requete as PipelineNode & { selected?: boolean }).selected).toBe(true);
    expect(valeurs(editeur)).toBe(avant);
    expect(editeur.getNodes()).toHaveLength(nombre);
  });

  it('la zone d’une étape rend l’élément du nœud', async () => {
    const jointure = await editeur.addNode('join');
    await vi.waitFor(() => expect(editeur.elementDuNoeud(jointure!.id)).not.toBeNull());
    const adaptateur = creerAdaptateurPipeline(editeur);
    expect(await adaptateur.reveler('pipeline.join')).toBe(editeur.elementDuNoeud(jointure!.id));
  });

  it('sans nœud du type demandé : null, et le prérequis montre le bouton qui l’ajoute', async () => {
    await editeur.addNode('source');
    const adaptateur = creerAdaptateurPipeline(editeur);
    expect(await adaptateur.reveler('pipeline.join.on')).toBeNull();
    expect(adaptateur.etat()).toEqual({ types: ['source'] });
    expect(PREREQUIS['noeud-join'].verifier(adaptateur.etat())).toBe(false);
    expect(PREREQUIS['noeud-source'].verifier(adaptateur.etat())).toBe(true);
  });

  it('montrer() sur un contrôle sans étape : raison prérequis, repère qui lève', async () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<button data-repere="pipeline.actions.ajouter-jointure">Joindre</button>'
    );
    const adaptateur = creerAdaptateurPipeline(editeur);
    const res = await montrer('pipeline.join.on', { registre: REGISTRE, adaptateur, mode: 'dire' });
    expect(res.raison).toBe('prerequis');
    expect(res.prerequis).toBe('noeud-join');
    expect(res.element?.getAttribute('data-repere')).toBe('pipeline.actions.ajouter-jointure');
    expect(editeur.getNodes()).toHaveLength(0);
  });

  it('repère statique : résolu dans le document ; id hors grammaire : null', async () => {
    const adaptateur = creerAdaptateurPipeline(editeur);
    expect((await adaptateur.reveler('pipeline.actions.executer'))?.id).toBe('btn-execute');
    expect(await adaptateur.reveler('pipeline.editeur')).toBe(conteneur);
    expect(await adaptateur.reveler('pipeline.actions"]')).toBeNull();
  });

  it('bouton du menu « Ajouter une étape » : le menu est ouvert', async () => {
    const menu = document.createElement('app-menu') as HTMLElement & {
      open: boolean;
      openMenu: (f?: string) => void;
    };
    menu.open = false;
    menu.openMenu = vi.fn(() => {
      menu.open = true;
    });
    menu.innerHTML = '<button data-repere="pipeline.actions.ajouter-source">Source</button>';
    document.body.appendChild(menu);
    const adaptateur = creerAdaptateurPipeline(editeur);
    const el = await adaptateur.reveler('pipeline.actions.ajouter-source');
    expect(el?.textContent).toBe('Source');
    expect(menu.openMenu).toHaveBeenCalledWith('none');
  });

  it('noeudPour préfère le nœud sélectionné du bon type', () => {
    const a = { id: 'a', config: { type: 'query' } } as unknown as PipelineNode;
    const b = { id: 'b', config: { type: 'query' }, selected: true } as unknown as PipelineNode;
    const c = { id: 'c', config: { type: 'source' }, selected: true } as unknown as PipelineNode;
    expect(noeudPour([a, b, c], 'query')?.id).toBe('b');
    expect(noeudPour([a, c], 'query')?.id).toBe('a');
    expect(noeudPour([c], 'join')).toBeUndefined();
  });

  it('onEtatChange signale un clic, et se désabonne', async () => {
    const adaptateur = creerAdaptateurPipeline(editeur);
    const cb = vi.fn();
    const off = adaptateur.onEtatChange!(cb);
    document.body.click();
    await Promise.resolve();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    document.body.click();
    await Promise.resolve();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

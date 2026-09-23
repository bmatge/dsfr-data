/**
 * Complétude des repères du pipeline PAR LE RENDU (#1008, epic #992, ADR-143).
 *
 * Les contrôles d'une étape sont rendus par des éléments Lit, dans le shadow
 * DOM de `rete-node`, et leur repère est CALCULÉ depuis `node-configs.ts` :
 * `check:reperes` ne les voit que par la projection `reperes-donnees.ts`. Ce
 * test instancie le vrai `PipelineEditor` (Rete + LitPlugin), ajoute chaque
 * type de nœud de `NODE_FACTORIES`, attend son rendu et vérifie :
 *
 *   1. chaque `AttributeControl` de chaque nœud est rendu avec `data-repere`
 *      = `pipeline.<type>.<attribut>`, présent au registre, même balise ;
 *   2. tout contrôle rendu dans un nœud (input, select, textarea, button, en
 *      traversant les shadow roots) porte un repère — les contrôles Rete
 *      non-formulaire n'en rendent aucun (liste déclarée ci-dessous) ;
 *   3. l'union des repères rendus (nœuds + balisage statique de `index.html`)
 *      est EXACTEMENT l'ensemble des contrôles du registre.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { PipelineEditor } from '../../../apps/pipeline-helper/src/editor';
import {
  AggregateControl,
  AttributeControl,
  type PipelineNode,
} from '../../../apps/pipeline-helper/src/nodes/base-node';
import { NODE_FACTORIES } from '../../../apps/pipeline-helper/src/nodes/pipeline-nodes';
import { NODE_CONFIGS } from '../../../apps/pipeline-helper/src/nodes/node-configs';
import { REPERES } from '../../../apps/pipeline-helper/src/assistant/reperes.generated';
import {
  REPERES_DONNEES,
  ATTRIBUTS_HORS_MANIFESTE,
} from '../../../apps/pipeline-helper/src/assistant/reperes-donnees';
import { repereAttribut } from '../../../apps/pipeline-helper/src/assistant/reperes-ids';
import { chercherEnProfondeur } from '../../../apps/pipeline-helper/src/assistant/adaptateur';

const RACINE = resolve(import.meta.dirname, '../../..');
const PAR_ID = new Map<string, (typeof REPERES)[number]>(REPERES.map((r) => [r.id, r]));
const CONTROLES = new Set(['input', 'select', 'textarea', 'button']);

/**
 * Contrôles Rete non-formulaire, sans repère, et pourquoi. Aucun ne rend
 * d'input, de select ni de bouton : la règle 2 ne les voit pas, la liste
 * existe pour que l'absence de repère soit une décision écrite.
 */
const CONTROLES_REte_SANS_REPERE: Record<string, string> = {
  __status__:
    "StatusControl : statut d'exécution et champs disponibles, en lecture seule — rien à régler.",
};

/** Tous les éléments sous `racine`, shadow roots ouverts compris. */
function tousEnProfondeur(racine: ParentNode): HTMLElement[] {
  const out: HTMLElement[] = [];
  const pile: ParentNode[] = [racine];
  while (pile.length) {
    const courant = pile.shift()!;
    for (const el of courant.querySelectorAll<HTMLElement>('*')) {
      out.push(el);
      if (el.shadowRoot) pile.push(el.shadowRoot);
    }
  }
  return out;
}

/** Contrôles rendus sans repère sous `racine`. */
function controlesSansRepere(racine: ParentNode): string[] {
  return tousEnProfondeur(racine)
    .filter((el) => CONTROLES.has(el.tagName.toLowerCase()))
    .filter((el) => !(el instanceof HTMLInputElement && el.type === 'hidden'))
    .filter((el) => !el.hasAttribute('data-repere'))
    .map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`);
}

/** Écarts entre les repères rendus sous `racine` et le registre. */
function ecartsAuRegistre(racine: ParentNode): string[] {
  const ecarts: string[] = [];
  for (const el of tousEnProfondeur(racine)) {
    const id = el.getAttribute('data-repere');
    if (!id) continue;
    const r = PAR_ID.get(id);
    if (!r || r.genre !== 'controle') {
      ecarts.push(`repère rendu absent du registre : ${id}`);
      continue;
    }
    if (r.element !== el.tagName.toLowerCase()) {
      ecarts.push(`${id} : rendu sur <${el.tagName.toLowerCase()}>, registre <${r.element}>`);
    }
  }
  return ecarts;
}

/** Vue interne de `saved-source-control` : l'explorateur Grist n'apparaît qu'après un appel réseau. */
interface VueSourceEnregistree extends HTMLElement {
  _selectedConnection: { type: string } | null;
  _gristDocs: { id: string; name: string }[];
  _gristTables: { id: string }[];
  requestUpdate(): void;
  updateComplete: Promise<boolean>;
}

function reperesRendus(racine: ParentNode): string[] {
  return tousEnProfondeur(racine)
    .map((el) => el.getAttribute('data-repere'))
    .filter((id): id is string => id !== null);
}

describe('repères du pipeline : complétude par le rendu (#1008)', () => {
  let editeur: PipelineEditor;
  let conteneur: HTMLElement;
  const rendus = new Set<string>();
  const noeuds = new Map<string, PipelineNode>();

  beforeAll(async () => {
    localStorage.clear();
    conteneur = document.createElement('div');
    document.body.appendChild(conteneur);
    editeur = new PipelineEditor(conteneur);
    for (const type of Object.keys(NODE_FACTORIES)) {
      const noeud = await editeur.addNode(type);
      expect(noeud, type).not.toBeNull();
      noeuds.set(type, noeud!);
    }
    // a11y n'a pas de bouton d'ajout mais une factory : couvert aussi.
    expect([...noeuds.keys()].sort()).toEqual(Object.keys(NODE_CONFIGS).sort());
    await vi.waitFor(() => {
      for (const n of noeuds.values()) expect(editeur.elementDuNoeud(n.id)).not.toBeNull();
      const source = editeur.elementDuNoeud(noeuds.get('source')!.id)!;
      expect(
        chercherEnProfondeur(source, 'data-repere', 'pipeline.source.api-type')
      ).not.toBeNull();
    });
  });

  afterAll(() => {
    editeur.destroy();
    conteneur.remove();
  });

  for (const [type, config] of Object.entries(NODE_CONFIGS)) {
    it(`étape ${type} : chaque AttributeControl porte son repère, au registre`, async () => {
      const noeud = noeuds.get(type)!;
      const hote = editeur.elementDuNoeud(noeud.id)!;
      await vi.waitFor(() => {
        for (const def of config.attributes) {
          expect(
            chercherEnProfondeur(hote, 'data-repere', repereAttribut(type, def.name)),
            `${type}.${def.name}`
          ).not.toBeNull();
        }
      });
      for (const [nom, ctrl] of Object.entries(noeud.controls)) {
        if (ctrl instanceof AttributeControl) {
          expect(ctrl.repere).toBe(repereAttribut(type, nom));
          expect(PAR_ID.get(ctrl.repere)?.genre, ctrl.repere).toBe('controle');
        } else if (!(ctrl instanceof AggregateControl) && nom !== '__saved-source__') {
          expect(CONTROLES_REte_SANS_REPERE[nom], `contrôle ${nom} non déclaré`).toBeDefined();
        }
      }
      expect(controlesSansRepere(hote)).toEqual([]);
      expect(ecartsAuRegistre(hote)).toEqual([]);
      reperesRendus(hote).forEach((id) => rendus.add(id));
    });
  }

  it('Requêter : agrégations avec champs connus et plusieurs lignes', async () => {
    const noeud = noeuds.get('query')!;
    const agregat = noeud.controls['aggregate'] as AggregateControl;
    agregat.setAvailableFields(['region', 'population']);
    agregat.addRow();
    const hote = editeur.elementDuNoeud(noeud.id)!;
    await vi.waitFor(() => {
      expect(
        chercherEnProfondeur(hote, 'data-repere', 'pipeline.query.agregat-retirer')
      ).not.toBeNull();
      expect(
        chercherEnProfondeur(hote, 'data-repere', 'pipeline.query.agregat-champ')
      ).not.toBeNull();
    });
    expect(controlesSansRepere(hote)).toEqual([]);
    expect(ecartsAuRegistre(hote)).toEqual([]);
    reperesRendus(hote).forEach((id) => rendus.add(id));
  });

  it('Source : explorateur Grist (document, table)', async () => {
    const hote = editeur.elementDuNoeud(noeuds.get('source')!.id)!;
    const el = tousEnProfondeur(hote).find(
      (e) => e.tagName.toLowerCase() === 'saved-source-control'
    ) as VueSourceEnregistree | undefined;
    expect(el).toBeDefined();
    el!._selectedConnection = { type: 'grist' };
    el!._gristDocs = [{ id: 'doc1', name: 'Budget' }];
    el!._gristTables = [{ id: 'Table1' }];
    el!.requestUpdate();
    await el!.updateComplete;
    expect(chercherEnProfondeur(hote, 'data-repere', 'pipeline.source.table-grist')).not.toBeNull();
    expect(controlesSansRepere(hote)).toEqual([]);
    expect(ecartsAuRegistre(hote)).toEqual([]);
    reperesRendus(hote).forEach((id) => rendus.add(id));
  });

  it("l'union des repères rendus (nœuds + index.html) est exactement le registre", () => {
    const html = readFileSync(join(RACINE, 'apps/pipeline-helper/index.html'), 'utf-8');
    const hote = document.createElement('div');
    hote.innerHTML = html.slice(html.indexOf('<body'), html.indexOf('</body>'));
    reperesRendus(hote).forEach((id) => rendus.add(id));
    const attendus = REPERES.filter((r) => r.genre === 'controle')
      .map((r) => r.id)
      .sort();
    expect([...rendus].sort()).toEqual(attendus);
  });

  it('les entrées « données » couvrent chaque attribut de chaque nœud', () => {
    const ids = new Set(REPERES_DONNEES.map((r) => r.id));
    for (const config of Object.values(NODE_CONFIGS)) {
      for (const def of config.attributes) {
        expect(ids.has(repereAttribut(config.type, def.name)), def.name).toBe(true);
      }
    }
    // Chaque écart déclaré au manifeste désigne un attribut qui existe.
    for (const cle of Object.keys(ATTRIBUTS_HORS_MANIFESTE)) {
      const [type, nom] = cle.split('.');
      expect(
        NODE_CONFIGS[type]?.attributes.some((a) => a.name === nom),
        cle
      ).toBe(true);
    }
  });

  it('preuve de mutation : un contrôle de nœud rendu sans repère est vu', () => {
    const hote = editeur.elementDuNoeud(noeuds.get('join')!.id)!;
    const cible = chercherEnProfondeur(hote, 'data-repere', 'pipeline.join.on')!;
    cible.removeAttribute('data-repere');
    try {
      expect(controlesSansRepere(hote)).toHaveLength(1);
    } finally {
      cible.setAttribute('data-repere', 'pipeline.join.on');
    }
    cible.setAttribute('data-repere', 'pipeline.join.inconnu');
    try {
      expect(ecartsAuRegistre(hote)).toEqual([
        'repère rendu absent du registre : pipeline.join.inconnu',
      ]);
    } finally {
      cible.setAttribute('data-repere', 'pipeline.join.on');
    }
  });
});

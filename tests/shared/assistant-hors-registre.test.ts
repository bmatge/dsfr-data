/**
 * Repères hors registre dans `mountAssistant` et `creerRepondreIA` (#1105) :
 * contrat générique, sur le registre carto (une app qui n'en déclare pas).
 *
 * - `correspondanceHorsRegistre` n'est consultée que si le registre ne trouve
 *   rien, ou seulement des `reperesEnglobants` ; ses ids passent le filtre ;
 * - un id hors registre venu du modèle n'est accepté que si l'app le déclare
 *   montrable (`libelleHorsRegistre`) ; sans l'option, il reste refusé ;
 * - `ProfilAssistant.contexte` ajoute un bloc au prompt et ses ids à l'enum
 *   de `montrer` seulement.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../packages/app-ui/src/app-assistant';
import { REGISTRE as REGISTRE_CARTO } from '../../apps/builder-carto/src/assistant/reperes.generated';
import {
  creerRepondreIA,
  messageAucunReglage,
  mountAssistant,
  selecteurRepere,
  type AdaptateurReperage,
  type CorrespondanceHorsRegistre,
  type MountedAssistant,
  type OpenAIResponse,
  type OptionsAssistant,
  type TransportAssistant,
} from '@dsfr-data/shared';

const HORS = 'carto.ligne.3.dsfr-data-map';
const QUESTION = 'bonjour, que sais-tu faire ?';

function adaptateur(): AdaptateurReperage<{ n: number }> & { reveles: string[] } {
  const reveles: string[] = [];
  return {
    reveles,
    // Prérequis du registre carto, tous remplis : seul le repère compte ici.
    prerequis: Object.fromEntries(
      ['couche-active', 'couche-source', 'couche-interactive'].map((nom) => [
        nom,
        { message: nom, repereQuiLeve: 'carto.carte.fond', verifier: () => true },
      ])
    ),
    etat: () => ({ n: 3 }),
    async reveler(id: string) {
      reveles.push(id);
      let el = document.querySelector<HTMLElement>(selecteurRepere(id));
      if (!el) {
        el = document.createElement('button');
        el.setAttribute('data-repere', id);
        document.body.appendChild(el);
      }
      return el;
    },
  };
}

let monte: MountedAssistant | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

afterEach(() => {
  monte?.destroy();
  monte = null;
});

function monter(options: Partial<OptionsAssistant<{ n: number }>> = {}) {
  const adapt = adaptateur();
  const montres: string[] = [];
  monte = mountAssistant<{ n: number }>({
    app: 'builder-carto',
    registre: REGISTRE_CARTO,
    adaptateur: adapt,
    montrerHorsRegistre: (id) => {
      if (!id.startsWith('carto.ligne.')) return false;
      montres.push(id);
      return true;
    },
    ...options,
  });
  return { a: monte, adapt, montres };
}

const trouve = (): CorrespondanceHorsRegistre => ({
  candidats: [{ id: HORS, libelle: 'Ligne 3', chemin: [] }],
  texte: 'Ligne 3 : la carte.',
});

describe('correspondanceHorsRegistre', () => {
  it('rien au registre : consultée, sa réponse est montrée sans modèle', async () => {
    const repondre = vi.fn(async () => ({ texte: 'modèle' }));
    const hors = vi.fn(trouve);
    const { a, montres } = monter({
      correspondanceHorsRegistre: hors,
      libelleHorsRegistre: (id) => (id === HORS ? 'Ligne 3' : null),
      repondre,
    });
    await a.poser(QUESTION);
    expect(hors).toHaveBeenCalledWith(QUESTION);
    expect(repondre).not.toHaveBeenCalled();
    expect(a.panel.messages.at(-1)).toMatchObject({
      source: 'correspondance',
      texte: 'Ligne 3 : la carte.',
    });
    expect(montres).toEqual([HORS]);
  });

  it('un repère du registre trouvé : jamais consultée', async () => {
    const hors = vi.fn(trouve);
    const { a, montres } = monter({
      correspondanceHorsRegistre: hors,
      libelleHorsRegistre: () => 'Ligne 3',
    });
    await a.poser('comportement au clic');
    expect(hors).not.toHaveBeenCalled();
    expect(montres).toEqual([]);
    expect(a.panel.messages.at(-1)?.candidats?.map((c) => c.id)).toEqual([
      'carto.elements.clic.popup-mode',
    ]);
  });

  it('le repère trouvé est « englobant » : consultée, et sa réponse l’emporte', async () => {
    const { a, adapt, montres } = monter({
      correspondanceHorsRegistre: trouve,
      libelleHorsRegistre: () => 'Ligne 3',
      reperesEnglobants: ['carto.elements.clic.popup-mode'],
    });
    await a.poser('comportement au clic');
    expect(montres).toEqual([HORS]);
    expect(adapt.reveles).toEqual([]);
  });

  it('ses ids passent le filtre : non montrables, la réponse retombe sur le message local', async () => {
    const { a, montres } = monter({
      correspondanceHorsRegistre: () => ({
        candidats: [
          { id: HORS, libelle: 'x', chemin: [] },
          { id: 'carto.ligne.<b>', libelle: 'y', chemin: [] },
        ],
      }),
      libelleHorsRegistre: () => null,
    });
    await a.poser(QUESTION);
    expect(montres).toEqual([]);
    expect(a.panel.messages.at(-1)?.texte).toBe(messageAucunReglage(QUESTION));
  });
});

describe('id hors registre venu du modèle', () => {
  it('déclaré montrable : accepté, libellé par l’app, montré', async () => {
    const { a, montres } = monter({
      repondre: async () => ({ texte: 'Ici.', montrer: HORS }),
      libelleHorsRegistre: (id) => (id === HORS ? 'Ligne 3 — dsfr-data-map' : null),
    });
    await a.poser(QUESTION);
    expect(montres).toEqual([HORS]);
    expect(a.panel.messages.at(-1)?.candidats).toEqual([
      { id: HORS, libelle: 'Ligne 3 — dsfr-data-map', chemin: [] },
    ]);
  });

  it('sans libelleHorsRegistre (les autres apps) : refusé, rien de montré', async () => {
    const { a, montres } = monter({ repondre: async () => ({ texte: 'Ici.', montrer: HORS }) });
    await a.poser(QUESTION);
    expect(montres).toEqual([]);
    expect(a.panel.messages.at(-1)?.texte).toBe(
      "Le réglage cité n'existe pas dans cette interface."
    );
  });

  it('grammaire invalide : refusé même si l’app répond oui', async () => {
    const { a, montres } = monter({
      repondre: async () => ({ texte: 'Ici.', montrer: 'carto.ligne.<script>' }),
      libelleHorsRegistre: () => 'oui',
    });
    await a.poser(QUESTION);
    expect(montres).toEqual([]);
    expect(a.panel.messages.at(-1)?.erreur).toBe(true);
  });
});

describe('ProfilAssistant.contexte', () => {
  interface Corps {
    messages: { content: string }[];
    tools: { function: { name: string; parameters: { properties: Record<string, unknown> } } }[];
  }
  const enumDe = (corps: Corps, outil: string, champ: 'id' | 'etapes'): string[] => {
    const p = corps.tools.find((t) => t.function.name === outil)!.function.parameters.properties[
      champ
    ] as { enum?: string[]; items?: { enum: string[] } };
    return p.enum ?? p.items?.enum ?? [];
  };

  it('bloc ajouté au prompt (jetons d’URL masqués), ids ajoutés à montrer seulement', async () => {
    const post = vi.fn(async (_corps: unknown): Promise<OpenAIResponse> => ({
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'c',
                type: 'function',
                function: {
                  name: 'montrer',
                  arguments: JSON.stringify({ id: HORS, message: 'Là.' }),
                },
              },
            ],
          },
        },
      ],
    }));
    const transport = async (): Promise<TransportAssistant> => ({
      mode: 'server',
      model: 'm',
      post,
      capacites: { toolCalling: true },
    });
    const repondre = creerRepondreIA<{ n: number }>({
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur(),
      transport,
      skills: false,
      profil: {
        nom: 'test',
        contexte: (etat) => ({
          texte: `Plan (${etat.n}) : https://x.fr/?apikey=SECRET`,
          reperes: [HORS, 'pas un id !'],
        }),
      },
    });
    const reponse = await repondre({
      question: QUESTION,
      correspondance: { statut: 'aucun', candidats: [] },
      constats: [],
      mode: 'dire',
      historique: [],
      signal: new AbortController().signal,
    });
    expect(reponse.montrer).toBe(HORS);
    const corps = post.mock.calls[0][0] as Corps;
    expect(corps.messages[0].content).toContain('Plan (3) : https://x.fr/?apikey=***');
    expect(corps.messages[0].content).not.toContain('SECRET');
    expect(enumDe(corps, 'montrer', 'id')).toContain(HORS);
    expect(enumDe(corps, 'montrer', 'id')).not.toContain('pas un id !');
    expect(enumDe(corps, 'planifier', 'etapes')).not.toContain(HORS);
  });
});

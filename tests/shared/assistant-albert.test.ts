/**
 * Albert branché après le montage (#1018, ADR-143 §6) : `brancherAlbert()`
 * résout le transport UNE fois et ne branche le modèle que s'il est
 * utilisable. Sans clé ni proxy (`mode: 'none'`), ou sans tool-calling, le
 * guidage reste local et le panneau ne se présente pas comme Albert.
 *
 * Et `montrerHorsRegistre` : un repère que l'app sait montrer sans qu'il soit
 * au registre (repères de code du Playground).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../packages/app-ui/src/app-assistant';
import { REGISTRE as REGISTRE_CARTO } from '../../apps/builder-carto/src/assistant/reperes.generated';
import {
  brancherAlbert,
  messageAucunReglage,
  mountAssistant,
  PIED_AVEC_MODELE,
  PIED_SANS_MODELE,
  selecteurRepere,
  SOUS_TITRE_AVEC_MODELE,
  SOUS_TITRE_SANS_MODELE,
  type AdaptateurReperage,
  type MountedAssistant,
  type OpenAIResponse,
  type TransportAssistant,
} from '@dsfr-data/shared';

const QUESTION_HORS_REGISTRE = 'bonjour, que sais-tu faire ?';

function adaptateur(): AdaptateurReperage<null> & { reveles: string[] } {
  const reveles: string[] = [];
  return {
    reveles,
    prerequis: {},
    etat: () => null,
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

function appelMontrer(id: string): OpenAIResponse {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: 'C’est ici.',
          tool_calls: [
            {
              id: 'call_montrer',
              type: 'function',
              function: { name: 'montrer', arguments: JSON.stringify({ id, message: 'Ici.' }) },
            },
          ],
        },
      },
    ],
  };
}

function transport(
  post: TransportAssistant['post'],
  mode: TransportAssistant['mode'] = 'server',
  toolCalling = true
): () => Promise<TransportAssistant> {
  return async () => ({ mode, model: 'albert-large', post, capacites: { toolCalling } });
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

function monter(adapt = adaptateur()): MountedAssistant {
  monte = mountAssistant({ app: 'builder-carto', registre: REGISTRE_CARTO, adaptateur: adapt });
  return monte;
}

describe('brancherModele()', () => {
  it('sans modèle au montage : sous-titre et pied « sans IA »', () => {
    const a = monter();
    expect(a.avecModele).toBe(false);
    expect(a.panel.sousTitre).toBe(SOUS_TITRE_SANS_MODELE);
    expect(a.panel.pied).toBe(PIED_SANS_MODELE);
  });

  it('brancher puis débrancher : la présentation suit', () => {
    const a = monter();
    a.brancherModele(async () => ({ texte: 'ok' }));
    expect(a.avecModele).toBe(true);
    expect(a.panel.sousTitre).toBe(SOUS_TITRE_AVEC_MODELE);
    expect(a.panel.pied).toBe(PIED_AVEC_MODELE);
    a.brancherModele(null);
    expect(a.panel.sousTitre).toBe(SOUS_TITRE_SANS_MODELE);
  });

  it('les libellés « avec modèle » sont ceux du panneau par défaut', () => {
    const panneau = document.createElement('app-assistant') as HTMLElement & {
      sousTitre: string;
      pied: string;
    };
    expect(panneau.sousTitre).toBe(SOUS_TITRE_AVEC_MODELE);
    expect(panneau.pied).toBe(PIED_AVEC_MODELE);
  });
});

describe('brancherAlbert()', () => {
  it('mode serveur avec tool-calling : branché, la question hors registre part au modèle', async () => {
    const post = vi.fn(async () => appelMontrer('carto.carte.fond'));
    const adapt = adaptateur();
    const a = monter(adapt);
    const branche = await brancherAlbert(a, {
      registre: REGISTRE_CARTO,
      profil: { nom: 'test' },
      transport: transport(post),
      skills: false,
    });
    expect(branche).toBe(true);
    expect(a.panel.sousTitre).toBe(SOUS_TITRE_AVEC_MODELE);

    await a.poser(QUESTION_HORS_REGISTRE);
    expect(post).toHaveBeenCalledTimes(1);
    expect(adapt.reveles).toEqual(['carto.carte.fond']);
    const reponse = a.panel.messages.find((m) => m.role === 'assistant');
    expect(reponse?.source).toBe('modele');
  });

  it('une phrase qui correspond ne part jamais au modèle', async () => {
    const post = vi.fn(async () => appelMontrer('carto.carte.fond'));
    const a = monter();
    await brancherAlbert(a, {
      registre: REGISTRE_CARTO,
      profil: { nom: 'test' },
      transport: transport(post),
      skills: false,
    });
    await a.poser('mode sombre');
    expect(post).not.toHaveBeenCalled();
    expect(a.panel.messages.find((m) => m.role === 'assistant')?.source).toBe('correspondance');
  });

  it('sans clé ni proxy : rien n’est branché, réponse locale, aucun appel', async () => {
    const post = vi.fn(async () => appelMontrer('carto.carte.fond'));
    const a = monter();
    expect(
      await brancherAlbert(a, {
        registre: REGISTRE_CARTO,
        profil: { nom: 'test' },
        transport: transport(post, 'none'),
      })
    ).toBe(false);
    expect(a.panel.sousTitre).toBe(SOUS_TITRE_SANS_MODELE);
    await a.poser(QUESTION_HORS_REGISTRE);
    expect(post).not.toHaveBeenCalled();
    expect(a.panel.messages.at(-1)?.texte).toBe(messageAucunReglage(QUESTION_HORS_REGISTRE));
  });

  it('sans tool-calling : rien n’est branché', async () => {
    const post = vi.fn(async () => appelMontrer('carto.carte.fond'));
    const a = monter();
    expect(
      await brancherAlbert(a, {
        registre: REGISTRE_CARTO,
        profil: { nom: 'test' },
        transport: transport(post, 'user', false),
      })
    ).toBe(false);
    expect(a.avecModele).toBe(false);
    expect(a.panel.pied).toBe(PIED_SANS_MODELE);
  });

  it('une résolution qui échoue vaut « pas de modèle »', async () => {
    const a = monter();
    expect(
      await brancherAlbert(a, {
        registre: REGISTRE_CARTO,
        profil: { nom: 'test' },
        transport: async () => {
          throw new Error('réseau');
        },
      })
    ).toBe(false);
    expect(a.avecModele).toBe(false);
  });
});

describe('montrerHorsRegistre', () => {
  it('un repère hors registre pris en charge par l’app n’est pas refusé', async () => {
    const vus: string[] = [];
    monte = mountAssistant({
      app: 'playground',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur(),
      montrerHorsRegistre: (id) => {
        if (!id.startsWith('playground.ligne.')) return false;
        vus.push(id);
        return true;
      },
    });
    monte.panel.dispatchEvent(
      new CustomEvent('assistant-montrer', {
        detail: { repere: 'playground.ligne.3.dsfr-data-query.source' },
      })
    );
    await vi.waitFor(() => expect(vus).toEqual(['playground.ligne.3.dsfr-data-query.source']));
    expect(monte.panel.messages.some((m) => m.erreur)).toBe(false);
  });

  it('un repère que l’app ne prend pas en charge reste refusé', async () => {
    monte = mountAssistant({
      app: 'playground',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur(),
      montrerHorsRegistre: () => false,
    });
    monte.panel.dispatchEvent(
      new CustomEvent('assistant-montrer', { detail: { repere: 'playground.inconnu' } })
    );
    await vi.waitFor(() =>
      expect(monte!.panel.messages.at(-1)?.texte).toBe(
        "Ce réglage n'existe pas dans cette interface."
      )
    );
  });
});

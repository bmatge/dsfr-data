/**
 * Total repete par entite (#1123) : la note que la boucle du Studio ajoute
 * quand le tour a pose des blocs et que la reponse du modele tait le fait.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  analyzeDataFields,
  createEmptyDashboard,
  type OpenAIResponse,
  type PostChat,
} from '@dsfr-data/shared';
import { runStudioLoop } from '../../../apps/studio/src/ia/agent-loop';
import { AIDES_NATIONALES, POPULATION_REGIONS } from '../../../tools/banc-studio/fixtures';

let n = 0;
function outil(name: string, args: Record<string, unknown>): OpenAIResponse {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: `c${++n}`,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  };
}

function script(reponses: OpenAIResponse[]): PostChat {
  let i = 0;
  return vi.fn(async () => reponses[Math.min(i++, reponses.length - 1)]);
}

const CARTE = {
  kind: 'map',
  layers: [{ type: 'marker', latField: 'Latitude', lonField: 'Longitude', groupField: 'Ville' }],
};

function lancer(
  data: Record<string, unknown>[],
  reponses: OpenAIResponse[],
  conversation: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: 'une carte' },
  ]
) {
  return runStudioLoop({
    conversation,
    systemPrompt: 'system',
    document: createEmptyDashboard(),
    data,
    fields: analyzeDataFields(data),
    sourceId: 'src',
    post: script(reponses),
    model: 'm',
  });
}

describe('studio — note sur le total repete', () => {
  it('ajoutee quand le modele la tait, coordonnees de la carte exceptees', async () => {
    const r = await lancer(AIDES_NATIONALES, [
      outil('add_blocks', { blocks: [CARTE] }),
      outil('finish', { message: 'Carte ajoutée.' }),
    ]);
    expect(r.text.startsWith('Carte ajoutée.')).toBe(true);
    expect(r.text).toContain("« Nombre total d'actions » est constant pour chaque « Ville »");
    expect(r.text).toContain('ne la sommez pas');
    expect(r.text).not.toContain('Latitude');
  });

  it('pas de doublon quand le modele l’a deja dit', async () => {
    const r = await lancer(AIDES_NATIONALES, [
      outil('add_blocks', { blocks: [CARTE] }),
      outil('finish', {
        message: "Carte ajoutée. Le nombre total d'actions est un total par ville.",
      }),
    ]);
    expect(r.text).not.toContain('À noter');
  });

  it('pas de doublon quand un message precedent de l’assistant l’a dit', async () => {
    const r = await lancer(
      AIDES_NATIONALES,
      [outil('add_blocks', { blocks: [CARTE] }), outil('finish', { message: 'Fait.' })],
      [
        { role: 'user', content: 'une carte' },
        { role: 'assistant', content: "Nombre total d'actions : total par ville." },
        { role: 'user', content: 'encore une' },
      ]
    );
    expect(r.text).toBe('Fait.');
  });

  it('rien quand le tour n’a pose aucun bloc', async () => {
    const r = await lancer(AIDES_NATIONALES, [outil('finish', { message: 'Quelle carte ?' })]);
    expect(r.text).toBe('Quelle carte ?');
  });

  it('rien sur un jeu sans valeur repetee', async () => {
    const r = await lancer(POPULATION_REGIONS, [
      outil('add_blocks', {
        blocks: [
          {
            kind: 'chart',
            config: { type: 'bar', labelField: 'Région', valueField: 'Population' },
          },
        ],
      }),
      outil('finish', { message: 'Graphique ajouté.' }),
    ]);
    expect(r.text).toBe('Graphique ajouté.');
  });
});

/**
 * Reponse finale ecrite en JSON brut (#1123) : l'argument de `finish` ecrit
 * en texte est traite comme un finish ; tout autre texte reste inchange.
 */
import { describe, it, expect, vi } from 'vitest';
import { createEmptyDashboard, type OpenAIResponse, type PostChat } from '@dsfr-data/shared';
import {
  messageDeFinishEnTexte,
  texteAffichable,
} from '../../../apps/studio/src/ia/reponse-finale';
import { runStudioLoop } from '../../../apps/studio/src/ia/agent-loop';

describe('messageDeFinishEnTexte — formes reconnues', () => {
  it('{"message": …}', () => {
    expect(messageDeFinishEnTexte('{"message": "Carte ajoutée."}')).toBe('Carte ajoutée.');
  });

  it('avec espaces et retours autour', () => {
    expect(messageDeFinishEnTexte('\n  {\n "message": "Fait." \n}\n')).toBe('Fait.');
  });

  it('dans une cloture ```json', () => {
    expect(messageDeFinishEnTexte('```json\n{"message": "Tableau ajouté."}\n```')).toBe(
      'Tableau ajouté.'
    );
  });

  it('l’appel entier, arguments en objet ou en chaine JSON', () => {
    expect(messageDeFinishEnTexte('{"name":"finish","arguments":{"message":"Ok."}}')).toBe('Ok.');
    expect(
      messageDeFinishEnTexte(
        JSON.stringify({ name: 'finish', arguments: JSON.stringify({ message: 'Ok.' }) })
      )
    ).toBe('Ok.');
  });
});

describe('messageDeFinishEnTexte — tout le reste est inchange', () => {
  const INCHANGES = [
    'Carte ajoutée : un marqueur par ville.',
    'Voici la config : {"message": "x"} — à toi de voir.',
    '{"message": "x", "blocks": []}',
    '{"message": 42}',
    '{"message": ""}',
    '{"name": "add_blocks", "arguments": {"message": "x"}}',
    '{"message": "x"',
    '[{"message": "x"}]',
    '{not json}',
    '',
  ];
  for (const texte of INCHANGES) {
    it(`inchange : ${JSON.stringify(texte).slice(0, 60)}`, () => {
      expect(messageDeFinishEnTexte(texte)).toBeNull();
      expect(texteAffichable(texte)).toBe(texte);
    });
  }

  it('lineaire sur une entree hostile (aucune expression reguliere)', () => {
    const hostile = `{"message": "${'{'.repeat(200000)}`;
    const debut = Date.now();
    expect(texteAffichable(hostile)).toBe(hostile);
    expect(Date.now() - debut).toBeLessThan(500);
  });
});

function textMsg(content: string): OpenAIResponse {
  return { choices: [{ message: { role: 'assistant', content } }] };
}

describe('runStudioLoop — finish ecrit en texte', () => {
  const base = (post: PostChat) => ({
    conversation: [{ role: 'user' as const, content: 'un graphique' }],
    systemPrompt: 'system',
    document: createEmptyDashboard(),
    data: [{ a: 1 }],
    fields: [{ name: 'a', type: 'numérique', sample: 1 }],
    sourceId: 'src',
    post,
    model: 'm',
  });

  it('n’affiche que le message quand le modele ecrit {"message": …} en texte', async () => {
    const post = vi.fn(async () => textMsg('{"message": "Graphique ajouté."}'));
    const r = await runStudioLoop(base(post));
    expect(r.text).toBe('Graphique ajouté.');
  });

  it('laisse une reponse en prose telle quelle', async () => {
    const post = vi.fn(async () => textMsg('Quel champ veux-tu mesurer ?'));
    const r = await runStudioLoop(base(post));
    expect(r.text).toBe('Quel champ veux-tu mesurer ?');
  });
});

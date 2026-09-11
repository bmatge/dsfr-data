/**
 * #787 — l'assistant du Studio LIT le code qu'il a produit au lieu de le
 * décrire de mémoire.
 *
 * Le cas d'origine : trois affirmations fausses d'affilée (« aucune donnée en
 * dur », « un extrait de 20 lignes », « data ignoré en présence de base-url »)
 * sur un code qui embarquait tout le jeu paginé. L'outil rend le résumé des
 * sources lu dans le code, et jamais les lignes embarquées elles-mêmes.
 */
import { describe, it, expect, vi } from 'vitest';
import { createEmptyDashboard, jsonAttr } from '@dsfr-data/shared';
import { describeGeneratedCode } from '../../../apps/studio/src/ia/code-tools';
import { runStudioLoop } from '../../../apps/studio/src/ia/agent-loop';
import { buildSystemPrompt } from '../../../apps/studio/src/ia/system-prompt';
import type { PostChat, OpenAIResponse } from '../../../apps/studio/src/ia/transport';

const ROWS = Array.from({ length: 4812 }, (_, i) => ({
  region: `R${i}`,
  secret: `valeur-sensible-${i}`,
  note: "l'apostrophe",
}));

const EMBEDDED = `<dsfr-data-source id="src-embarquee" data='${jsonAttr(ROWS)}'></dsfr-data-source>
<dsfr-data-chart source="src-embarquee" type="bar"></dsfr-data-chart>`;

const DECLARATIVE = `<dsfr-data-source id="src-ods" api-type="opendatasoft"
  base-url="https://data.economie.gouv.fr" dataset-id="prix-carburants"></dsfr-data-source>`;

describe('#787 — describeGeneratedCode', () => {
  it('dit que les données sont embarquées, et combien, lu dans le code', () => {
    const text = describeGeneratedCode(EMBEDDED);
    expect(text).toContain('source « src-embarquee » : données EMBARQUÉES');
    expect(text).toContain('4812 ligne(s)');
    expect(text).toContain('aucune requête');
  });

  it('n’envoie jamais les lignes embarquées au modèle', () => {
    const text = describeGeneratedCode(EMBEDDED);
    expect(text).not.toContain('valeur-sensible');
    expect(text).toContain("data='[… 4812 ligne(s) embarquée(s), omises ici …]'");
    // Le reste du code est bien là
    expect(text).toContain('<dsfr-data-chart source="src-embarquee"');
  });

  it('dit qu’une source Opendatasoft est déclarative', () => {
    const text = describeGeneratedCode(DECLARATIVE);
    expect(text).toContain("source « src-ods » : requête opendatasoft à l'API (prix-carburants)");
    expect(text).toContain("rien n'est figé dans la page");
  });

  it('borne la taille du code rendu', () => {
    const long = DECLARATIVE + '\n' + '<p>texte</p>\n'.repeat(3000);
    const text = describeGeneratedCode(long);
    expect(text.length).toBeLessThan(13_000);
    expect(text).toContain('code tronqué');
  });

  it('document vide : le dit, sans planter', () => {
    expect(describeGeneratedCode('')).toContain('document est vide');
  });
});

function toolCallMsg(name: string, args: Record<string, unknown> = {}): OpenAIResponse {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: `call-${Math.random().toString(36).slice(2)}`,
              type: 'function' as const,
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  };
}

describe('#787 — câblage dans la boucle', () => {
  function opts(post: PostChat, generatedCode?: () => string) {
    return {
      conversation: [{ role: 'user' as const, content: 'les données sont en dur ?' }],
      systemPrompt: 'system',
      document: createEmptyDashboard(),
      data: [],
      fields: [],
      sourceId: 'src-1',
      post,
      model: 'test-model',
      generatedCode,
    };
  }

  it('l’outil est proposé au modèle et rend le code, même relu deux fois', async () => {
    const seen: string[] = [];
    let call = 0;
    const post: PostChat = vi.fn(
      async (body: {
        tools?: Array<{ function: { name: string } }>;
        messages: Array<{ role: string; content?: string }>;
      }) => {
        if (call === 0) seen.push(...(body.tools ?? []).map((t) => t.function.name));
        call += 1;
        if (call <= 2) return toolCallMsg('read_generated_code');
        const toolReplies = body.messages
          .filter((m) => m.role === 'tool')
          .map((m) => m.content ?? '');
        expect(toolReplies).toHaveLength(2);
        expect(toolReplies.every((r) => r.includes('données EMBARQUÉES'))).toBe(true);
        return toolCallMsg('finish', { message: 'Oui : 4812 lignes sont embarquées.' });
      }
    ) as unknown as PostChat;

    const result = await runStudioLoop(opts(post, () => EMBEDDED));
    expect(seen).toContain('read_generated_code');
    expect(result.text).toContain('4812');
    expect(result.steps).toContain('Je relis le code généré…');
  });

  it('sans accès au code, l’outil n’est pas proposé', async () => {
    const seen: string[] = [];
    const post: PostChat = vi.fn(
      async (body: { tools?: Array<{ function: { name: string } }> }) => {
        seen.push(...(body.tools ?? []).map((t) => t.function.name));
        return toolCallMsg('finish', { message: 'ok' });
      }
    ) as unknown as PostChat;
    await runStudioLoop(opts(post));
    expect(seen).not.toContain('read_generated_code');
  });
});

describe('#787 — prompt système', () => {
  it('pose la règle : lire le code avant d’en parler, le relire si contesté', () => {
    const prompt = buildSystemPrompt({
      source: null,
      fields: [],
      sampleRecord: null,
      document: createEmptyDashboard(),
    });
    expect(prompt).toContain('read_generated_code');
    expect(prompt).toContain('Tu ne décides');
    expect(prompt).toContain('relis-le');
  });
});

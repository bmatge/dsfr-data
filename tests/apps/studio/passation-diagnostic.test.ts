/**
 * Le Studio reçoit la passation « Construire pour moi » de l'assistant
 * contextuel (#1016) : le diagnostic déposé par `transmettreDiagnostic` est
 * posé dans le champ du chat, JAMAIS envoyé, et consommé une seule fois.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIAGNOSTIC_HANDOFF_KEY,
  PASSATION_STUDIO_KEY,
  transmettreDiagnostic,
  transmettrePassationStudio,
} from '@dsfr-data/shared';

vi.mock('@dsfr-data/shared', async (importOriginal) => {
  const reel = await importOriginal<Record<string, unknown>>();
  return {
    ...reel,
    mountDiagnosticPanel: vi.fn(),
    injectTourStyles: vi.fn(),
    startTour: vi.fn(),
    startTourIfFirstVisit: vi.fn(),
  };
});

type ModuleStudio = typeof import('../../../apps/studio/src/main');

describe('Studio : passation d’un diagnostic transmis (#1016)', () => {
  let studio: ModuleStudio;

  beforeAll(async () => {
    document.body.innerHTML = '<textarea id="chat-input"></textarea>';
    studio = await import('../../../apps/studio/src/main');
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  beforeEach(() => {
    sessionStorage.clear();
    (document.getElementById('chat-input') as HTMLTextAreaElement).value = '';
  });

  it('pose le diagnostic dans le champ avec la demande de construction, sans l’envoyer', () => {
    transmettreDiagnostic('Carte en cours\n\ncouche-1 → 12 lignes');
    const champ = document.getElementById('chat-input') as HTMLTextAreaElement;
    const saisies = vi.fn();
    champ.addEventListener('input', saisies);

    expect(studio.recupererDiagnosticTransmis()).toBe(true);
    expect(champ.value).toBe(
      `${studio.QUESTION_CONSTRUIRE}\n\nCarte en cours\n\ncouche-1 → 12 lignes`
    );
    expect(saisies).toHaveBeenCalledTimes(1);
    // Consommé : un rechargement ne le repose pas.
    expect(sessionStorage.getItem(DIAGNOSTIC_HANDOFF_KEY)).toBeNull();
    expect(studio.recupererDiagnosticTransmis()).toBe(false);
  });

  it('code du Playground (#1132) : source chargée par charger_source_url, consigne posée sans envoi', async () => {
    const url =
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/industrie-du-futur/records';
    const appels: string[] = [];
    const fetchReel = globalThis.fetch;
    globalThis.fetch = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
      const cible =
        (init?.headers as Record<string, string> | undefined)?.['X-Target-URL'] ?? String(entree);
      appels.push(cible);
      return new Response(
        JSON.stringify({
          total_count: 2,
          results: [
            { region: 'Bretagne', nombre: 3 },
            { region: 'Corse', nombre: 1 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;
    try {
      transmettreDiagnostic('Code en cours dans le Playground\n\ndata → 2 lignes');
      transmettrePassationStudio({
        origine: 'playground',
        code: '<dsfr-data-source id="data"></dsfr-data-source>',
        sources: 1,
        source: { url },
      });
      expect(studio.recupererDiagnosticTransmis()).toBe(true);
      await studio.repriseEnCours;

      expect(appels.some((a) => a.includes('/datasets/industrie-du-futur/records'))).toBe(true);
      const { state } = await import('../../../apps/studio/src/state');
      expect(state.source?.id).toBe('url_opendatasoft_industrie-du-futur');
      expect(state.document.sources[0]?.id).toBe('url_opendatasoft_industrie-du-futur');
      const champ = (document.getElementById('chat-input') as HTMLTextAreaElement).value;
      expect(champ).toContain('Reconstruisez fidèlement');
      expect(champ).toContain('data → 2 lignes');
      // Rien n'est parti : aucun message usager dans la conversation.
      expect(state.messages.filter((m) => m.role === 'user')).toEqual([]);
      expect(sessionStorage.getItem(PASSATION_STUDIO_KEY)).toBeNull();
    } finally {
      globalThis.fetch = fetchReel;
    }
  });

  it('rien de transmis : le champ reste vide', () => {
    expect(studio.recupererDiagnosticTransmis()).toBe(false);
    expect((document.getElementById('chat-input') as HTMLTextAreaElement).value).toBe('');
  });
});

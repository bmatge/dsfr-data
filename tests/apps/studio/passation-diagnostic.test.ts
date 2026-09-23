/**
 * Le Studio reçoit la passation « Construire pour moi » de l'assistant
 * contextuel (#1016) : le diagnostic déposé par `transmettreDiagnostic` est
 * posé dans le champ du chat, JAMAIS envoyé, et consommé une seule fois.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIAGNOSTIC_HANDOFF_KEY, transmettreDiagnostic } from '@dsfr-data/shared';

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

  it('rien de transmis : le champ reste vide', () => {
    expect(studio.recupererDiagnosticTransmis()).toBe(false);
    expect((document.getElementById('chat-input') as HTMLTextAreaElement).value).toBe('');
  });
});

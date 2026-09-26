/**
 * Retours d'usage du Studio : le kit ne se charge que sur les déploiements déclarés
 * (chartsbeta), la production reste intacte, et l'utilisateur n'est transmis qu'haché.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const auth = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  ecouteurs: [] as ((u: unknown) => void)[],
}));

vi.mock('@dsfr-data/shared', () => ({
  getUser: () => auth.user,
  onAuthChange: (f: (u: unknown) => void) => auth.ecouteurs.push(f),
}));

async function charger() {
  vi.resetModules();
  return import('../../../apps/studio/src/retours');
}

// Les <script> ajoutés sont interceptés : aucun téléchargement réel pendant les tests.
let ajoutes: HTMLScriptElement[] = [];
const scriptsDuKit = () =>
  ajoutes.filter((s) => s.src.startsWith('https://feedback-collector.lab.miweb.run/'));

describe('retours d’usage du Studio', () => {
  beforeEach(() => {
    auth.user = null;
    auth.ecouteurs = [];
    delete window.fc;
    ajoutes = [];
    vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(n: T): T => {
      ajoutes.push(n as unknown as HTMLScriptElement);
      return n;
    });
  });
  afterEach(() => {
    delete window.fc;
    vi.restoreAllMocks();
  });

  it('ne charge rien en production ni sur un hôte inconnu', async () => {
    const { initRetours, configRetours } = await charger();
    expect(configRetours('chartsbuilder.miweb.run')).toBeNull();
    expect(initRetours('chartsbuilder.miweb.run')).toBe(false);
    expect(initRetours('localhost')).toBe(false);
    expect(scriptsDuKit()).toHaveLength(0);
  });

  it('les appels sont sans effet quand le kit n’est pas chargé', async () => {
    const { retours } = await charger();
    expect(() => {
      retours.track('code-copie');
      retours.moment('succes-probable');
      retours.tour({ question: 'x' });
    }).not.toThrow();
  });

  it('charge le kit sur chartsbeta, une seule fois, et l’initialise avec sa clé publique', async () => {
    const { initRetours, COLLECTEUR } = await charger();
    expect(initRetours('chartsbeta.lab.miweb.run')).toBe(true);
    expect(initRetours('chartsbeta.lab.miweb.run')).toBe(false);
    const [script] = scriptsDuKit();
    expect(script.src).toBe(`${COLLECTEUR}/kit.js`);

    const init = vi.fn();
    window.fc = {
      init,
      identify: vi.fn(),
      track: vi.fn(),
      moment: vi.fn(),
      assistant: { turn: vi.fn() },
    };
    script.onload?.(new Event('load'));
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        app: 'chartsbeta',
        endpoint: COLLECTEUR,
        assistant: true,
        taches: expect.arrayContaining([expect.objectContaining({ id: 'tableau-de-bord' })]),
      })
    );
  });

  it('transmet l’utilisateur connecté haché, jamais son id ni son email', async () => {
    auth.user = { id: 'user-42', email: 'marie.curie@exemple.gouv.fr' };
    const { initRetours } = await charger();
    initRetours('chartsbeta.lab.miweb.run');
    const identify = vi.fn();
    window.fc = {
      init: vi.fn(),
      identify,
      track: vi.fn(),
      moment: vi.fn(),
      assistant: { turn: vi.fn() },
    };
    scriptsDuKit()[0].onload?.(new Event('load'));
    await vi.waitFor(() => expect(identify).toHaveBeenCalled());
    const envoye = identify.mock.calls[0][0] as string;
    expect(envoye).toMatch(/^[0-9a-f]{32}$/);
    expect(envoye).not.toContain('user-42');
    expect(envoye).not.toContain('@');
  });

  it('relaie les appels au kit une fois chargé', async () => {
    const { retours } = await charger();
    const track = vi.fn();
    const moment = vi.fn();
    const turn = vi.fn();
    window.fc = { init: vi.fn(), identify: vi.fn(), track, moment, assistant: { turn } };
    retours.track('image-exportee', { format: 'png' });
    retours.moment('succes-probable');
    retours.tour({ question: 'Fais un camembert', dureeMs: 900 });
    expect(track).toHaveBeenCalledWith('image-exportee', { format: 'png' });
    expect(moment).toHaveBeenCalledWith('succes-probable');
    expect(turn).toHaveBeenCalledWith({ question: 'Fais un camembert', dureeMs: 900 });
  });
});

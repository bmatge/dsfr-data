/**
 * Colonne gauche du Studio IA (#1142) : badge de clé, bascule vers la clé
 * serveur, blocs repliés sur une ligne de résumé.
 *
 * En prod, le badge disait « Clé perso » alors que le déploiement a une clé
 * serveur : un jeton personnel mémorisé dans ce navigateur (clé partagée
 * `dsfr-data-ia-config`) remplit le champ au chargement et passe avant. Exact,
 * mais rien ne disait qu'une clé serveur existait, ni comment y revenir.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IA_CONFIG_KEY,
  createEmptyDashboard,
  fetchServerConfig,
  resetServerConfigCache,
  type Source,
} from '@dsfr-data/shared';
import { state } from '../../../apps/studio/src/state';
import {
  chargerConfigIA,
  etatIA,
  majBadgeIA,
  utiliserCleServeur,
} from '../../../apps/studio/src/ia/ia-config';
import {
  RESUME_SANS_SOURCE,
  appliquerSource,
  enregistrerSourceChargee,
  resumeSource,
} from '../../../apps/studio/src/sources';

vi.mock('@dsfr-data/shared', async (importOriginal) => {
  const reel = await importOriginal<Record<string, unknown>>();
  return { ...reel, toastSuccess: vi.fn(), toastWarning: vi.fn(), toastError: vi.fn() };
});

const ROOT = join(__dirname, '../../..');

const FORMULAIRE = `
  <details id="section-ia-config">
    <summary>
      <span id="ia-config-badge"></span><span id="ia-config-resume"></span>
    </summary>
    <div id="ia-use-server" hidden><button id="ia-use-server-btn"></button></div>
    <input id="ia-api-url" value="">
    <select id="ia-model">
      <option value="openweight-large">large</option>
      <option value="openweight-medium">medium</option>
      <option value="__custom__">Personnalisé…</option>
    </select>
    <input id="ia-model-custom" hidden>
    <input id="ia-token" value="">
  </details>
`;

/** Simule /ia-server-config puis attend la réponse, comme au démarrage. */
async function serveur(config: Record<string, unknown>): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(config), { status: 200 }))
  );
  await fetchServerConfig();
}

const badge = () => document.getElementById('ia-config-badge')?.textContent;
const resume = () => document.getElementById('ia-config-resume')?.textContent ?? '';
const bascule = () => document.getElementById('ia-use-server') as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  resetServerConfigCache();
  document.body.innerHTML = FORMULAIRE;
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('badge IA : mode effectif ET clé serveur disponible (#1142)', () => {
  it('jeton perso mémorisé + clé serveur : « Clé perso », résumé « clé serveur disponible », bascule visible', async () => {
    localStorage.setItem(
      IA_CONFIG_KEY,
      JSON.stringify({ apiUrl: 'https://albert.example/v1/chat/completions', token: 'sk-perso' })
    );
    await serveur({ available: true, model: 'openweight-large' });
    chargerConfigIA();
    majBadgeIA();
    expect(badge()).toBe('Clé perso');
    expect(resume()).toContain('clé serveur disponible');
    expect(bascule().hidden).toBe(false);
    expect(etatIA()).toMatchObject({ mode: 'user', serveurDisponible: true });
  });

  it('clé serveur seule : « Clé serveur » avec son modèle, pas de bascule', async () => {
    await serveur({ available: true, model: 'openweight-large' });
    chargerConfigIA();
    majBadgeIA();
    expect(badge()).toBe('Clé serveur');
    expect(resume()).toBe('openweight-large');
    expect(bascule().hidden).toBe(true);
  });

  it('ni jeton ni serveur : « IA non configurée »', async () => {
    await serveur({ available: false });
    chargerConfigIA();
    majBadgeIA();
    expect(badge()).toBe('IA non configurée');
    expect(bascule().hidden).toBe(true);
  });

  it('jeton perso sans serveur : pas de « clé serveur disponible » ni de bascule', async () => {
    localStorage.setItem(IA_CONFIG_KEY, JSON.stringify({ token: 'sk-perso' }));
    await serveur({ available: false });
    chargerConfigIA();
    majBadgeIA();
    expect(badge()).toBe('Clé perso');
    expect(resume()).not.toContain('clé serveur disponible');
    expect(bascule().hidden).toBe(true);
  });

  it('config serveur pas encore connue : « Vérification… », jamais « IA non configurée » provisoire', () => {
    chargerConfigIA();
    majBadgeIA();
    expect(badge()).toBe('Vérification…');
    expect(etatIA().enAttente).toBe(true);
  });

  it('« Utiliser la clé serveur » oublie le jeton perso mais garde les réglages de l’ancien Assistant', async () => {
    localStorage.setItem(
      IA_CONFIG_KEY,
      JSON.stringify({
        apiUrl: 'https://autre.example/v1/chat/completions',
        model: 'gpt-4o',
        token: 'sk-perso',
        systemPrompt: 'mes instructions',
      })
    );
    await serveur({ available: true, model: 'openweight-large' });
    chargerConfigIA();
    majBadgeIA();
    expect(badge()).toBe('Clé perso');

    utiliserCleServeur();

    const saved = JSON.parse(localStorage.getItem(IA_CONFIG_KEY) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(saved.token).toBeUndefined();
    expect(saved.apiUrl).toBeUndefined();
    expect(saved.systemPrompt).toBe('mes instructions');
    expect((document.getElementById('ia-token') as HTMLInputElement).value).toBe('');
    expect(badge()).toBe('Clé serveur');
    expect(bascule().hidden).toBe(true);
    // Un rechargement ne ressuscite pas le jeton.
    chargerConfigIA();
    majBadgeIA();
    expect(badge()).toBe('Clé serveur');
  });
});

describe('colonne gauche compacte (#1142)', () => {
  const html = readFileSync(join(ROOT, 'apps/studio/index.html'), 'utf-8');

  it('source et IA sont des blocs repliables à ligne de résumé ; plus d’en-tête « Assistant » visible', () => {
    // Le <body> seul, sans ses <script> : aucun module ni ressource à charger.
    const page = document.createElement('div');
    page.innerHTML = html
      .slice(html.indexOf('<body'), html.indexOf('</body>'))
      .replace(/<script[\s\S]*?<\/script>/g, '');
    document.body.appendChild(page);
    const source = page.querySelector('#section-source');
    const ia = page.querySelector('#section-ia-config');
    expect(source?.tagName).toBe('DETAILS');
    expect(ia?.tagName).toBe('DETAILS');
    for (const bloc of [source, ia]) {
      const summary = bloc?.querySelector(':scope > summary');
      expect(summary?.querySelector('h2')).not.toBeNull();
      expect(summary?.querySelector('.studio-bloc__resume')).not.toBeNull();
    }
    // Le résumé IA porte le badge : il n'est plus répété au-dessus du chat.
    expect(ia?.querySelector('summary #ia-config-badge')).not.toBeNull();
    expect(page.querySelector('#ia-mode-badge')).toBeNull();
    expect(page.querySelector('.chat-header')).toBeNull();
    // Le titre du chat reste pour les lecteurs d'écran.
    expect(page.querySelector('h2.fr-sr-only')?.textContent).toBe('Assistant du Studio');
    // Aucun bouton dans un <summary> (contenu interactif interdit).
    expect(page.querySelector('summary button, summary a, summary select')).toBeNull();
  });

  it('résumé de source en une ligne : nom, lignes, champs', () => {
    expect(resumeSource('Aides nationales', 1234, 5)).toBe(
      'Aides nationales · 1 234 lignes, 5 champs'
    );
    expect(resumeSource('X', 1, 1)).toBe('X · 1 ligne, 1 champ');
    expect(RESUME_SANS_SOURCE).toBe('aucune source choisie');
  });

  it('source chargée par charger_source_url (#1140) : résumé à jour, bloc replié, source lue gardée', () => {
    document.body.innerHTML = `
      <details id="section-source" open>
        <summary><span id="source-summary">${RESUME_SANS_SOURCE}</span></summary>
        <select id="saved-source"></select>
        <div id="saved-source-info"></div>
        <button id="show-data-btn" hidden></button>
      </details>`;
    state.document = createEmptyDashboard();
    state.document.sources = [
      { id: 'ancienne', name: 'Ancienne', type: 'manual', data: [{ a: 1 }] },
    ] as unknown as typeof state.document.sources;
    state.document.widgets = [
      {
        id: 'b1',
        type: 'chart',
        title: 'x',
        position: { row: 0, col: 0 },
        config: { sourceId: 'ancienne' },
      },
    ] as unknown as typeof state.document.widgets;
    const source: Source = {
      id: 'url-aides',
      name: 'Aides nationales',
      type: 'api',
      data: [
        { region: 'Nord', montant: 10 },
        { region: 'Sud', montant: 20 },
      ],
    };

    // Le chemin de main.ts (sourceParUrl.surChargement).
    appliquerSource(source);
    enregistrerSourceChargee(source);

    const summary = document.getElementById('source-summary');
    expect(summary?.textContent).toBe('Aides nationales · 2 lignes, 2 champs');
    expect(summary?.title).toBe(summary?.textContent);
    expect((document.getElementById('section-source') as HTMLDetailsElement).open).toBe(false);
    expect((document.getElementById('show-data-btn') as HTMLButtonElement).hidden).toBe(false);
    expect((document.getElementById('saved-source') as HTMLSelectElement).value).toBe('url-aides');
    // Règle de #1143 conservée : la source encore lue par un bloc reste.
    expect(state.document.sources.map((s) => s.id)).toEqual(['url-aides', 'ancienne']);
  });
});

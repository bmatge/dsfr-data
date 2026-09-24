/**
 * Parité du Studio IA avec l'ancien Assistant IA (#1081).
 *
 * Le Studio remplace l'Assistant comme entrée usager. Chaque capacité que
 * l'Assistant offrait et que le Studio n'avait pas est reprise ici, et gardée
 * par un test : configuration IA (URL, modèle, jeton, sonde), sources
 * (jeux d'exemple, classement, source ouverte depuis l'app Sources, aperçu des
 * données), chat (Markdown, suggestions, raisonnement), actions (favoris,
 * Playground), reclassement des skills. La navigation (en-tête, accueil,
 * redirection et paramètre d'échappement) est vérifiée sur les sources ; son
 * rendu réel l'est par `tests/builder-e2e/studio-navigation-recette.spec.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IA_CONFIG_KEY,
  STORAGE_KEYS,
  createEmptyDashboard,
  effectiveCapabilities,
  resetServerConfigCache,
  type ProbeReport,
  type Source,
} from '@dsfr-data/shared';
import { state } from '../../../apps/studio/src/state';
import {
  DEFAULT_API_URL,
  appliquerModele,
  enregistrerConfigIA,
  lireConfigFormulaire,
  majBadgeIA,
  modeIA,
  reinitialiserConfigIA,
  rendreRapport,
  transportDeSonde,
} from '../../../apps/studio/src/ia/ia-config';
import {
  handleSourceChange,
  loadSavedSources,
  remplirApercuDonnees,
  suggestionsPourChamps,
} from '../../../apps/studio/src/sources';
import { addMessage, clearChat, definirEnvoiSuggestion } from '../../../apps/studio/src/ui/chat';
import {
  ajouterAuxFavoris,
  CLE_CODE_PLAYGROUND,
  ouvrirDansPlayground,
  typeDeFavori,
} from '../../../apps/studio/src/ui/actions';

vi.mock('@dsfr-data/shared', async (importOriginal) => {
  const reel = await importOriginal<Record<string, unknown>>();
  return {
    ...reel,
    mountDiagnosticPanel: vi.fn(),
    injectTourStyles: vi.fn(),
    startTour: vi.fn(),
    startTourIfFirstVisit: vi.fn(),
    toastSuccess: vi.fn(),
    toastWarning: vi.fn(),
    toastError: vi.fn(),
  };
});

const ROOT = join(__dirname, '../../..');
const lire = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

const FORMULAIRE_IA = `
  <input id="ia-api-url" value="${DEFAULT_API_URL}">
  <select id="ia-model">
    <option value="openweight-large">large</option>
    <option value="openweight-medium">medium</option>
    <option value="__custom__">Personnalisé…</option>
  </select>
  <input id="ia-model-custom" hidden>
  <input id="ia-token" value="">
  <span id="ia-mode-badge"></span><span id="ia-config-badge"></span>
`;

const SOURCES_UI = `
  <select id="saved-source"></select>
  <div id="saved-source-info"></div>
  <span id="source-summary"></span>
  <button id="show-data-btn" hidden></button>
`;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetServerConfigCache();
  state.source = null;
  state.localData = null;
  state.fields = [];
  state.document = createEmptyDashboard();
  state.messages = [];
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Configuration IA dans le Studio', () => {
  beforeEach(() => {
    document.body.innerHTML = FORMULAIRE_IA;
  });

  it('lit le formulaire, modèle personnalisé compris', () => {
    appliquerModele('mistral-large-latest');
    (document.getElementById('ia-token') as HTMLInputElement).value = 'sk-test';
    expect(lireConfigFormulaire()).toEqual({
      apiUrl: DEFAULT_API_URL,
      model: 'mistral-large-latest',
      token: 'sk-test',
    });
    expect((document.getElementById('ia-model-custom') as HTMLInputElement).hidden).toBe(false);
    appliquerModele('openweight-medium');
    expect(lireConfigFormulaire().model).toBe('openweight-medium');
    expect((document.getElementById('ia-model-custom') as HTMLInputElement).hidden).toBe(true);
  });

  it('enregistre sous la clé partagée SANS écraser les réglages de l’ancien Assistant', () => {
    localStorage.setItem(
      IA_CONFIG_KEY,
      JSON.stringify({ systemPrompt: 'mes instructions', extraParams: { temperature: '0.3' } })
    );
    (document.getElementById('ia-token') as HTMLInputElement).value = 'sk-test';
    enregistrerConfigIA();
    const saved = JSON.parse(localStorage.getItem(IA_CONFIG_KEY) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(saved.token).toBe('sk-test');
    expect(saved.systemPrompt).toBe('mes instructions');
    expect(saved.extraParams).toEqual({ temperature: '0.3' });
  });

  it('réinitialiser oublie la configuration personnelle', () => {
    localStorage.setItem(IA_CONFIG_KEY, JSON.stringify({ token: 'sk-test' }));
    (document.getElementById('ia-token') as HTMLInputElement).value = 'sk-test';
    reinitialiserConfigIA();
    expect(localStorage.getItem(IA_CONFIG_KEY)).toBeNull();
    expect(lireConfigFormulaire().token).toBe('');
  });

  it('pastille : clé perso dès qu’un jeton est saisi, sinon non configurée', () => {
    majBadgeIA();
    expect(modeIA()).toBe('none');
    expect(document.getElementById('ia-mode-badge')?.textContent).toBe('IA non configurée');
    (document.getElementById('ia-token') as HTMLInputElement).value = 'sk-test';
    majBadgeIA();
    expect(modeIA()).toBe('user');
    expect(document.getElementById('ia-config-badge')?.textContent).toBe('Clé perso');
  });

  it('sonde : rien à sonder sans jeton ni serveur ; le jeton utilisateur passe par /ia-proxy', () => {
    expect(transportDeSonde()).toBeNull();
    const io = transportDeSonde({ apiUrl: DEFAULT_API_URL, model: 'm', token: 'sk' });
    expect(io?.serverMode).toBe(false);
    expect(io?.apiUrl).toBe(DEFAULT_API_URL);
  });

  it('le rapport de sonde ne passe jamais par innerHTML (détail venu du gateway)', () => {
    const out = document.createElement('div');
    const report: ProbeReport = {
      capabilities: { ...effectiveCapabilities(), probedAt: 1 },
      steps: [{ name: 'tools', ok: false, detail: '<img src=x onerror=alert(1)>' }],
    };
    rendreRapport(out, report);
    expect(out.querySelector('img')).toBeNull();
    expect(out.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('Sources du Studio', () => {
  const avecLignes: Source = {
    id: 'src-1',
    name: 'Population',
    type: 'api',
    data: [
      { region: 'Nord', population: 10, date: '2024-01-01' },
      { region: 'Sud', population: 20, date: '2024-02-01' },
    ],
  };
  const sansLignes: Source = { id: 'src-2', name: 'Vide', type: 'manual' };

  beforeEach(() => {
    document.body.innerHTML = SOURCES_UI;
  });

  it('propose les jeux d’exemple et classe En ligne / Local ; ignore les sources sans lignes', () => {
    localStorage.setItem(STORAGE_KEYS.SOURCES, JSON.stringify([avecLignes, sansLignes]));
    loadSavedSources();
    const select = document.getElementById('saved-source') as HTMLSelectElement;
    const groupes = Array.from(select.querySelectorAll('optgroup')).map((g) => g.label);
    expect(groupes).toEqual(['Préenregistré', 'En ligne']);
    const valeurs = Array.from(select.options).map((o) => o.value);
    expect(valeurs).toContain('src-1');
    expect(valeurs).not.toContain('src-2');
    expect(valeurs.some((v) => v.startsWith('sample-'))).toBe(true);
  });

  it('la source ouverte depuis l’app Sources est présélectionnée (pointeur #592)', () => {
    localStorage.setItem(STORAGE_KEYS.SOURCES, JSON.stringify([avecLignes]));
    localStorage.setItem(
      STORAGE_KEYS.SELECTED_SOURCE,
      JSON.stringify({ id: 'src-1', name: 'Population', type: 'api' })
    );
    const pre = loadSavedSources();
    expect(pre?.id).toBe('src-1');
    expect((document.getElementById('saved-source') as HTMLSelectElement).value).toBe('src-1');
  });

  it('charger une source la lie au document, montre « Voir les données »', () => {
    localStorage.setItem(STORAGE_KEYS.SOURCES, JSON.stringify([avecLignes]));
    loadSavedSources();
    (document.getElementById('saved-source') as HTMLSelectElement).value = 'src-1';
    const charge = vi.fn();
    handleSourceChange(charge);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(state.localData).toHaveLength(2);
    expect(state.document.sources[0]?.id).toBe('src-1');
    expect((document.getElementById('show-data-btn') as HTMLButtonElement).hidden).toBe(false);
  });

  it('aperçu des données : champs typés et lignes, valeurs posées en texte', () => {
    state.localData = [{ nom: '<script>alert(1)</script>', n: 3 }];
    state.fields = [
      { name: 'nom', type: 'texte', sample: 'x' },
      { name: 'n', type: 'numérique', sample: 3 },
    ];
    const box = document.createElement('div');
    remplirApercuDonnees(box);
    expect(box.querySelector('script')).toBeNull();
    expect(box.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(box.textContent).toContain('nom (texte)');
  });

  it('suggestions de première demande tirées des types de champs', () => {
    const s = suggestionsPourChamps([
      { name: 'population', type: 'numérique', sample: 1 },
      { name: 'region', type: 'texte', sample: 'a' },
      { name: 'annee', type: 'date', sample: '2024-01-01' },
    ]);
    expect(s).toEqual([
      'Barres de population par region',
      'Évolution de population',
      'Indicateur clé sur population',
    ]);
  });
});

describe('Chat du Studio', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="chat-messages"></div>';
    clearChat();
  });

  it('rend le Markdown de l’assistant (tableau), en échappant tout HTML', () => {
    addMessage('assistant', '| a | b |\n|---|---|\n| 1 | <b>2</b> |');
    const msg = document.querySelector('.chat-message--assistant');
    expect(msg?.querySelector('table.chat-table')).not.toBeNull();
    expect(msg?.querySelector('b')).toBeNull();
  });

  it('une suggestion cliquée part comme un message', () => {
    const envoi = vi.fn();
    definirEnvoiSuggestion(envoi);
    addMessage('assistant', 'Source chargée.', { suggestions: ['Tableau des données'] });
    (document.querySelector('.chat-suggestion') as HTMLButtonElement).click();
    expect(envoi).toHaveBeenCalledWith('Tableau des données');
  });

  it('le raisonnement de l’assistant reste sous la réponse, replié', () => {
    addMessage('assistant', 'Fait.', { etapes: ['J’examine le jeu de données…', 'Je finalise…'] });
    const details = document.querySelector('details.chat-reasoning') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toContain('2 étapes');
  });
});

describe('Actions reprises de l’Assistant : favoris, Playground', () => {
  function documentAvecUnGraphique(): void {
    state.document.name = 'Mon suivi';
    state.document.sources = [
      { id: 's', name: 's', type: 'manual', data: [{ a: 'x', b: 1 }] } as never,
    ];
    state.document.widgets = [
      {
        id: 'b1',
        type: 'chart',
        title: 't',
        position: { row: 0, col: 0 },
        config: {
          fromBuilder: true,
          sourceId: 's',
          chart: { type: 'pie', labelField: 'a', valueField: 'b' },
        },
      },
    ];
  }

  it('un document vide ne s’ajoute pas aux favoris', async () => {
    const nom = vi.fn(async () => 'x');
    expect(await ajouterAuxFavoris(nom)).toBeNull();
    expect(nom).not.toHaveBeenCalled();
  });

  it('ajoute le code de la page aux favoris, lisible par l’app Favoris', async () => {
    documentAvecUnGraphique();
    const favori = await ajouterAuxFavoris(async (defaut) => `${defaut} (copie)`);
    expect(favori?.name).toBe('Mon suivi (copie)');
    expect(favori?.sourceApp).toBe('studio');
    expect(favori?.chartType).toBe('pie');
    expect(favori?.code).toContain('<dsfr-data-chart');
    const stockes = JSON.parse(localStorage.getItem(STORAGE_KEYS.FAVORITES) ?? '[]') as {
      id: string;
    }[];
    expect(stockes[0]?.id).toBe(favori?.id);
  });

  it('un nom vide annule l’ajout', async () => {
    documentAvecUnGraphique();
    expect(await ajouterAuxFavoris(async () => null)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.FAVORITES)).toBeNull();
  });

  it('plusieurs blocs : la vignette des Favoris est « dashboard »', () => {
    documentAvecUnGraphique();
    state.document.widgets.push({ ...state.document.widgets[0], id: 'b2' });
    expect(typeDeFavori()).toBe('dashboard');
  });

  it('ouvrir dans le Playground confie le code et y navigue depuis le Studio', () => {
    documentAvecUnGraphique();
    const naviguer = vi.fn();
    expect(ouvrirDansPlayground(naviguer)).toBe(true);
    expect(sessionStorage.getItem(CLE_CODE_PLAYGROUND)).toContain('<dsfr-data-chart');
    expect(naviguer).toHaveBeenCalledWith('playground', { from: 'studio' });
  });

  it('le Playground accepte le code du Studio et y renvoie ; l’ancien Assistant par ?ancien=1', async () => {
    // Liste unique des origines (apps/playground/src/origines.ts) : le Studio
    // y est, avec son lien de retour.
    const { estOrigineCode, ORIGINES_CODE } = await import('../../../apps/playground/src/origines');
    expect(estOrigineCode('studio')).toBe(true);
    expect(ORIGINES_CODE.studio).toBe('au Studio IA');
    const src = lire('apps/playground/src/main.ts');
    expect(src).toContain("fromApp === 'builder-ia' ? { ancien: '1' } : {}");
  });
});

describe('Studio : envoi, reclassement, message sans IA', () => {
  it('reclasse seulement avec un jeton utilisateur et un rerank sondé', async () => {
    document.body.innerHTML = '<textarea id="chat-input"></textarea>';
    const { reclasseurPour, MESSAGE_IA_NON_CONFIGUREE } =
      await import('../../../apps/studio/src/main');
    const user = { apiUrl: DEFAULT_API_URL, model: 'm', token: 'sk' };
    const caps = { ...effectiveCapabilities(), rerank: true, rerankModel: 'bge' };
    expect(reclasseurPour({ mode: 'user', capacites: caps }, user)).toBeTypeOf('function');
    expect(reclasseurPour({ mode: 'server', capacites: caps }, user)).toBeUndefined();
    expect(
      reclasseurPour({ mode: 'user', capacites: { ...caps, rerank: false } }, user)
    ).toBeUndefined();
    expect(reclasseurPour({ mode: 'user', capacites: caps }, { ...user, token: '' })).toBe(
      undefined
    );
    // Le réglage est dans le Studio, plus dans l'Assistant IA.
    expect(MESSAGE_IA_NON_CONFIGUREE).toContain('Configuration IA');
    expect(MESSAGE_IA_NON_CONFIGUREE).not.toContain('Assistant IA');
  });

  it('le Studio porte la configuration IA et les actions de l’Assistant', () => {
    const html = lire('apps/studio/index.html');
    for (const id of [
      'section-ia-config',
      'ia-api-url',
      'ia-model',
      'ia-token',
      'probe-capabilities-btn',
      'save-favorite-btn',
      'open-playground-btn',
      'export-png-btn',
      'export-jpg-btn',
      'show-data-btn',
      'studio-data-dialog',
    ]) {
      expect(html, id).toContain(`id="${id}"`);
    }
  });
});

describe('Navigation : le Studio IA remplace l’Assistant IA (#1081)', () => {
  it('en-tête : « Studio IA » à la place de « Assistant IA »', () => {
    const src = lire('packages/app-ui/src/app-header.ts');
    expect(src).toContain("{ id: 'studio', label: 'Studio IA', href: 'apps/studio/index.html' }");
    expect(src).not.toContain("label: 'Assistant IA'");
    expect(src).not.toContain("periode d'essai");
  });

  it('accueil : une seule entrée IA, le Studio', () => {
    const html = lire('index.html');
    expect(html).not.toContain('apps/builder-ia/');
    expect(html.match(/href="apps\/studio\/index\.html"/g)).toHaveLength(2);
  });

  it('apps/builder-ia redirige vers le Studio, sauf ?ancien=1', () => {
    const html = lire('apps/builder-ia/index.html');
    const redirection = html.indexOf("window.location.replace('../studio/index.html'");
    expect(redirection).toBeGreaterThan(-1);
    expect(html).toContain("params.get('ancien') === '1'");
    expect(html).toContain('window.location.search + window.location.hash');
    // Avant toute feuille de style ou script : rien ne se charge pour rien.
    expect(redirection).toBeLessThan(html.indexOf('<link'));
  });

  it('l’ancienne URL builderIA.html mène au Studio', () => {
    expect(lire('scripts/build-app.js')).toContain("'builderIA.html': 'apps/studio/index.html'");
  });

  it('les recettes bloquantes de l’ancien Assistant passent par ?ancien=1', () => {
    expect(lire('tests/builder-e2e/builder-ia-recette.spec.ts')).toContain(
      "apps/builder-ia/?ancien=1'"
    );
    expect(lire('tests/builder-e2e/layout-diagnostic-recette.spec.ts')).toContain(
      "url: '/apps/builder-ia/?ancien=1'"
    );
  });
});

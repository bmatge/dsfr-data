/**
 * Parité des tests : réglages IA, sources et actions du Studio IA (#1081).
 *
 * Complète `parite-assistant.test.ts` sur ce que gardaient quatre suites de
 * l'ancien Assistant IA, parties avec lui (`ia-config`, `ia-model-select`,
 * `sources`, `ui-helpers` sous `tests/apps/builder-ia/`) et que le Studio
 * réalise sans qu'un test le tienne encore :
 *
 *   - la configuration enregistrée se RECHARGE dans le formulaire, même
 *     partielle ou illisible ;
 *   - le modèle personnalisé, et la liste de la page alignée sur celle du code ;
 *   - le type des champs d'une source (il décide des suggestions, et de ce
 *     qu'une carte accepte comme coordonnée) ;
 *   - l'aperçu des données, borné ;
 *   - « Ouvrir dans le Playground » sur un document vide, et « Copier le code ».
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IA_CONFIG_KEY,
  createEmptyDashboard,
  resetServerConfigCache,
  toastSuccess,
  toastWarning,
  type DashboardData,
  type Source,
} from '@dsfr-data/shared';
import { state } from '../../../apps/studio/src/state';
import {
  DEFAULT_API_URL,
  DEFAULT_MODEL,
  MODELE_PERSONNALISE,
  MODELES_PROPOSES,
  appliquerModele,
  chargerConfigIA,
  enregistrerConfigIA,
  lireConfigFormulaire,
  lireModele,
  surChangementModele,
} from '../../../apps/studio/src/ia/ia-config';
import {
  RESUME_SANS_SOURCE,
  appliquerSource,
  handleSourceChange,
  loadSavedSources,
  remplirApercuDonnees,
} from '../../../apps/studio/src/sources';
import { CLE_CODE_PLAYGROUND, ouvrirDansPlayground } from '../../../apps/studio/src/ui/actions';

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
const PAGE = readFileSync(join(ROOT, 'apps/studio/index.html'), 'utf-8');

/** Le `<body>` de la page du Studio, sans ses scripts ni son iframe d'aperçu. */
function monterPage(): void {
  document.body.innerHTML = PAGE.slice(PAGE.indexOf('<body'), PAGE.indexOf('</body>')).replace(
    /<script[\s\S]*?<\/script>/g,
    ''
  );
  // L'iframe chargerait la page générée, donc le DSFR et la bibliothèque,
  // depuis le réseau : l'aperçu est l'affaire des recettes Playwright.
  document.getElementById('preview-frame')?.remove();
}

const champ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetServerConfigCache();
  vi.mocked(toastSuccess).mockClear();
  vi.mocked(toastWarning).mockClear();
  state.source = null;
  state.localData = null;
  state.fields = [];
  state.document = createEmptyDashboard();
  state.messages = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('configuration IA : rechargée dans le formulaire de la page', () => {
  beforeEach(monterPage);

  it('rien d’enregistré : URL et modèle par défaut, jeton vide', () => {
    chargerConfigIA();
    expect(lireConfigFormulaire()).toEqual({
      apiUrl: DEFAULT_API_URL,
      model: DEFAULT_MODEL,
      token: '',
    });
  });

  it('une configuration enregistrée revient dans les trois champs', () => {
    localStorage.setItem(
      IA_CONFIG_KEY,
      JSON.stringify({
        apiUrl: 'https://llm.exemple.fr/v1/chat/completions',
        model: 'openweight-medium',
        token: 'sk-enregistre',
      })
    );
    chargerConfigIA();

    expect(champ<HTMLInputElement>('ia-api-url').value).toBe(
      'https://llm.exemple.fr/v1/chat/completions'
    );
    expect(champ<HTMLSelectElement>('ia-model').value).toBe('openweight-medium');
    expect(champ<HTMLInputElement>('ia-token').value).toBe('sk-enregistre');
  });

  it('un modèle hors liste revient dans le champ « Personnalisé… », visible', () => {
    localStorage.setItem(IA_CONFIG_KEY, JSON.stringify({ model: 'gpt-4o', token: 'sk' }));
    chargerConfigIA();

    expect(champ<HTMLSelectElement>('ia-model').value).toBe(MODELE_PERSONNALISE);
    expect(champ<HTMLInputElement>('ia-model-custom').value).toBe('gpt-4o');
    expect(champ<HTMLInputElement>('ia-model-custom').hidden).toBe(false);
    expect(lireConfigFormulaire().model).toBe('gpt-4o');
  });

  it('une configuration partielle (le jeton seul) garde les valeurs par défaut du reste', () => {
    localStorage.setItem(IA_CONFIG_KEY, JSON.stringify({ token: 'sk-seul' }));
    chargerConfigIA();

    expect(lireConfigFormulaire()).toEqual({
      apiUrl: DEFAULT_API_URL,
      model: DEFAULT_MODEL,
      token: 'sk-seul',
    });
  });

  it('un stockage illisible ne fait pas planter le démarrage', () => {
    localStorage.setItem(IA_CONFIG_KEY, 'pas-du-json');
    expect(() => chargerConfigIA()).not.toThrow();
    expect(lireConfigFormulaire().token).toBe('');
    // Et l'enregistrement suivant repart d'une configuration propre.
    champ<HTMLInputElement>('ia-token').value = 'sk-neuf';
    expect(() => enregistrerConfigIA()).not.toThrow();
    expect(JSON.parse(localStorage.getItem(IA_CONFIG_KEY) ?? '{}')).toEqual({
      apiUrl: DEFAULT_API_URL,
      model: DEFAULT_MODEL,
      token: 'sk-neuf',
    });
  });

  it('lire le formulaire n’enregistre rien ; enregistrer le dit à l’usager', () => {
    champ<HTMLInputElement>('ia-api-url').value = 'https://essai.exemple.fr/v1/chat/completions';
    champ<HTMLInputElement>('ia-token').value = 'sk-essai';

    // On essaie une clé avant de la garder : le prochain message s'en sert.
    expect(lireConfigFormulaire().token).toBe('sk-essai');
    expect(localStorage.getItem(IA_CONFIG_KEY)).toBeNull();

    enregistrerConfigIA();
    const enregistre = JSON.parse(localStorage.getItem(IA_CONFIG_KEY) ?? '{}') as {
      apiUrl?: string;
      token?: string;
    };
    expect(enregistre.apiUrl).toBe('https://essai.exemple.fr/v1/chat/completions');
    expect(enregistre.token).toBe('sk-essai');
    expect(toastSuccess).toHaveBeenCalledWith('Configuration IA enregistrée.');
  });
});

describe('choix du modèle', () => {
  beforeEach(monterPage);

  it('le modèle par défaut est openweight-large', () => {
    expect(DEFAULT_MODEL).toBe('openweight-large');
    expect(lireModele()).toBe('openweight-large');
  });

  it('la liste de la page est celle du code, plus « Personnalisé… »', () => {
    // `appliquerModele` range un modèle dans la liste s'il figure dans
    // MODELES_PROPOSES : une option absente de la page laisserait le select
    // vide, et le modèle par défaut partirait à sa place sans rien dire.
    const options = Array.from(champ<HTMLSelectElement>('ia-model').options).map((o) => o.value);
    expect(options).toEqual([...MODELES_PROPOSES, MODELE_PERSONNALISE]);
    expect(MODELES_PROPOSES).toContain(DEFAULT_MODEL);
  });

  it('chaque modèle proposé se pose et se relit, champ libre masqué', () => {
    for (const modele of MODELES_PROPOSES) {
      appliquerModele(modele);
      expect(champ<HTMLSelectElement>('ia-model').value).toBe(modele);
      expect(champ<HTMLInputElement>('ia-model-custom').hidden).toBe(true);
      expect(lireModele()).toBe(modele);
    }
  });

  it('« Personnalisé… » affiche le champ libre, un autre choix le masque', () => {
    const select = champ<HTMLSelectElement>('ia-model');
    const libre = champ<HTMLInputElement>('ia-model-custom');

    select.value = MODELE_PERSONNALISE;
    surChangementModele();
    expect(libre.hidden).toBe(false);

    select.value = 'openweight-small';
    surChangementModele();
    expect(libre.hidden).toBe(true);
  });

  it('un champ libre vide retombe sur le modèle par défaut', () => {
    champ<HTMLSelectElement>('ia-model').value = MODELE_PERSONNALISE;
    champ<HTMLInputElement>('ia-model-custom').value = '   ';
    expect(lireModele()).toBe(DEFAULT_MODEL);
  });
});

describe('source chargée : le type des champs', () => {
  const source = (data: Record<string, unknown>[]): Source => ({
    id: 'src',
    name: 'Jeu',
    type: 'manual',
    data,
  });
  const typeDe = (nom: string) => state.fields.find((f) => f.name === nom)?.type;

  it('numérique, texte, date : lus sur le premier enregistrement, avec un exemple', () => {
    appliquerSource(source([{ population: 1000, nom: 'Paris', date: '2024-01-15', actif: true }]));

    expect(state.fields.map((f) => f.name)).toEqual(['population', 'nom', 'date', 'actif']);
    expect(typeDe('population')).toBe('numérique');
    expect(typeDe('nom')).toBe('texte');
    expect(typeDe('date')).toBe('date');
    expect(typeDe('actif')).toBe('texte');
    expect(state.fields[0].sample).toBe(1000);
  });

  it('une première valeur nulle : le type vient de la première valeur renseignée', () => {
    appliquerSource(
      source([
        { valeur: null, libelle: 'a' },
        { valeur: 100, libelle: 'b' },
      ])
    );

    expect(typeDe('valeur')).toBe('numérique');
    expect(state.fields.find((f) => f.name === 'valeur')?.sample).toBe(100);
  });

  it('un champ toujours nul est du texte', () => {
    appliquerSource(source([{ rien: null }, { rien: null }]));
    expect(typeDe('rien')).toBe('texte');
  });

  it('une source sans lignes ne laisse aucun champ', () => {
    appliquerSource(source([{ a: 1 }]));
    appliquerSource(source([]));
    expect(state.fields).toEqual([]);
    expect(state.localData).toEqual([]);
  });

  it('revenir à « -- Choisir -- » vide l’état et le résumé de la page', () => {
    monterPage();
    localStorage.setItem('dsfr-data-sources', JSON.stringify([source([{ a: 1 }])]));
    loadSavedSources();
    const select = champ<HTMLSelectElement>('saved-source');
    select.value = 'src';
    handleSourceChange();
    expect(state.fields).toHaveLength(1);
    expect(champ<HTMLButtonElement>('show-data-btn').hidden).toBe(false);

    select.value = '';
    handleSourceChange();
    expect(state.source).toBeNull();
    expect(state.localData).toBeNull();
    expect(state.fields).toEqual([]);
    expect(champ('source-summary').textContent).toBe(RESUME_SANS_SOURCE);
    expect(champ('saved-source-info').textContent).toBe('');
    expect(champ<HTMLButtonElement>('show-data-btn').hidden).toBe(true);
  });
});

describe('« Voir les données » : un aperçu borné', () => {
  it('sans source : le dit, sans tableau', () => {
    const boite = document.createElement('div');
    remplirApercuDonnees(boite);
    expect(boite.textContent).toBe('Aucune donnée chargée : choisissez une source.');
    expect(boite.querySelector('table')).toBeNull();
  });

  it('20 lignes au plus, le total annoncé, une étiquette par champ', () => {
    const lignes = Array.from({ length: 100 }, (_, i) => ({ rang: i, nom: 'Bretagne' }));
    appliquerSource({ id: 'src', name: 'Jeu', type: 'manual', data: lignes });
    const boite = document.createElement('div');
    remplirApercuDonnees(boite);

    expect(boite.querySelectorAll('tbody tr')).toHaveLength(20);
    expect(boite.querySelector('p')?.textContent).toBe(
      '100 enregistrement(s), 2 champs — aperçu des 20 premiers.'
    );
    expect(Array.from(boite.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual([
      'rang',
      'nom',
    ]);
    expect(Array.from(boite.querySelectorAll('li')).map((li) => li.textContent)).toEqual([
      'rang (numérique)',
      'nom (texte)',
    ]);
  });

  it('une valeur absente se lit « — », une valeur longue est tronquée', () => {
    appliquerSource({
      id: 'src',
      name: 'Jeu',
      type: 'manual',
      data: [{ vide: null, long: 'x'.repeat(200) }],
    });
    const boite = document.createElement('div');
    remplirApercuDonnees(boite);

    const cellules = Array.from(boite.querySelectorAll('tbody td')).map((td) => td.textContent);
    expect(cellules[0]).toBe('—');
    expect(cellules[1]).toHaveLength(58);
    expect(cellules[1]?.endsWith('…')).toBe(true);
  });
});

/** Un document d'un seul graphique, sur des données saisies. */
function documentAvecUnGraphique(): DashboardData {
  const doc = createEmptyDashboard();
  doc.name = 'Suivi';
  doc.sources = [{ id: 's', name: 'Saisie', type: 'manual', data: [{ a: 'x', b: 1 }] }];
  doc.widgets = [
    {
      id: 'b1',
      type: 'chart',
      title: 'Répartition',
      position: { row: 0, col: 0 },
      config: {
        fromBuilder: true,
        sourceId: 's',
        chart: { type: 'pie', labelField: 'a', valueField: 'b' },
      },
    },
  ];
  return doc;
}

describe('actions sur le code produit', () => {
  it('« Ouvrir dans le Playground » sur un document vide : averti, rien n’est confié', () => {
    const naviguer = vi.fn();

    expect(ouvrirDansPlayground(naviguer)).toBe(false);
    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CLE_CODE_PLAYGROUND)).toBeNull();
    expect(naviguer).not.toHaveBeenCalled();
  });

  it('« Copier le code » copie la page de l’onglet Code, celle du document repris', async () => {
    // Le chemin d'un rafraîchissement en cours de travail : le document est
    // repris de la session, l'onglet Code est rempli, le bouton le copie.
    monterPage();
    sessionStorage.setItem('studio-document', JSON.stringify(documentAvecUnGraphique()));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 200 }))
    );
    const copie = vi.fn(async (_texte: string) => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: copie } });

    await import('../../../apps/studio/src/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    champ<HTMLButtonElement>('copy-code-btn').click();
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Code copié !'));

    expect(copie).toHaveBeenCalledTimes(1);
    const [code] = copie.mock.calls[0];
    expect(code).toBe(champ('generated-code').textContent);
    expect(code).toContain('<dsfr-data-chart source="s" type="pie"');
    expect(code).toContain('<h1>Suivi</h1>');
    // Le code copié ne porte jamais la sonde du volet Diagnostic.
    expect(code).not.toContain('__dsfrData');
  });
});

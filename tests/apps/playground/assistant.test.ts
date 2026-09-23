/**
 * Assistant contextuel du Playground (#1018, ADR-143), sur le vrai
 * `index.html`, avec le vrai adaptateur et le vrai panneau `<app-assistant>` :
 *
 * - constats STATIQUES (balisage) et DYNAMIQUES (trace) lus ensemble ;
 * - « Me montrer » d'un constat de balisage pose le curseur sur la ligne en
 *   cause (repère de code, hors registre) ;
 * - phrase → repère d'interface ; Albert branché (post mocké) ou absent.
 *
 * CodeMirror 5 est un global chargé par <script> : un faux éditeur enregistre
 * le curseur et les marques.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../../packages/app-ui/src/app-assistant';
import {
  effacerSurbrillance,
  evaluerConstats,
  REGLES_GENERIQUES,
  SOUS_TITRE_AVEC_MODELE,
  SOUS_TITRE_SANS_MODELE,
  trouverRepere,
  type Constat,
  type MountedAssistant,
  type MountedDiagnostic,
  type Trace,
} from '@dsfr-data/shared';
import { creerAdaptateurPlayground } from '../../../apps/playground/src/assistant/adaptateur';
import { REGLE_BALISAGE } from '../../../apps/playground/src/assistant/constats-balisage';
import {
  monterAssistantPlayground,
  suggestionsPlayground,
} from '../../../apps/playground/src/assistant/index';
import { REGISTRE } from '../../../apps/playground/src/assistant/reperes.generated';
import type { CodeMirrorEditor, PositionCode } from '../../../apps/playground/src/editor';
import {
  appelMontrer,
  cliquerMeMontrer,
  corpsIndex,
  poser,
  repereDe,
  surligne,
  transportAlbert,
  transportAucun,
} from '../assistant-commun';

interface FauxEditeur extends CodeMirrorEditor {
  curseur: PositionCode | null;
  marques: string[];
}

function fauxEditeur(code: string): FauxEditeur {
  const lignes = () => code.split('\n');
  const wrapper = document.createElement('div');
  wrapper.className = 'CodeMirror';
  document.body.appendChild(wrapper);
  const ed: FauxEditeur = {
    curseur: null,
    marques: [],
    getValue: () => code,
    setValue: () => undefined,
    on: () => undefined,
    setSize: () => undefined,
    getWrapperElement: () => wrapper,
    getScrollerElement: () => wrapper,
    refresh: () => undefined,
    lineCount: () => lignes().length,
    getLine: (n: number) => lignes()[n] ?? '',
    setCursor(pos: PositionCode) {
      ed.curseur = pos;
    },
    markText(_de: PositionCode, _a: PositionCode, options: { className: string }) {
      ed.marques.push(options.className);
      return { clear: () => undefined };
    },
    scrollIntoView: () => undefined,
  };
  return ed;
}

const CODE = [
  '<dsfr-data-source id="s" url="x"></dsfr-data-source>',
  '',
  '<dsfr-data-query id="q"',
  '  source="absent"></dsfr-data-query>',
].join('\n');

/** Trace de l'aperçu : la source a répondu sans ligne (constat dynamique). */
const TRACE: Trace = {
  graph: {
    nodes: [
      {
        id: 's',
        tag: 'dsfr-data-source',
        role: 'source',
        synthetic: false,
        ambiguous: false,
        upstream: [],
        attrs: {},
      },
    ],
    dangling: [],
  },
  events: [],
  states: { s: { status: 'loaded', rows: 0, emissions: 1 } },
  order: ['s'],
  sinceLastEventMs: null,
  lastEventAt: null,
  quiescent: true,
  delegation: {},
  reseau: [],
  console: [],
};

let assistant: MountedAssistant | null = null;
let constats: Constat[] = [];
let editeur: FauxEditeur;

const diagnostic = {
  panel: { toggle: () => {} },
  constats: () => constats,
  text: () => 'Diagnostic du pipeline',
} as unknown as MountedDiagnostic;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = corpsIndex('playground');
  editeur = fauxEditeur(CODE);
  constats = [];
});

afterEach(() => {
  effacerSurbrillance();
  assistant?.destroy();
  assistant = null;
  document.body.innerHTML = '';
});

function monter(transport = transportAucun): MountedAssistant {
  assistant = monterAssistantPlayground({
    editor: editeur,
    adaptateur: creerAdaptateurPlayground(editeur),
    diagnostic,
    transport,
  });
  return assistant;
}

describe('assistant contextuel du Playground (#1018)', () => {
  it('sans modèle : guidage local, bouton de la barre relié au panneau', () => {
    const a = monter();
    expect(a.panel.sousTitre).toBe(SOUS_TITRE_SANS_MODELE);
    const bouton = document.getElementById('assistant-btn')!;
    expect(bouton.getAttribute('data-repere')).toBe('playground.actions.assistant');
    expect(bouton.getAttribute('aria-controls')).toBe(a.panel.panneauId);
  });

  it('constats statiques et dynamiques ensemble ; « Me montrer » pose le curseur sur la ligne', async () => {
    constats = evaluerConstats(TRACE, { app: 'playground', etat: { code: CODE } }, [
      ...REGLES_GENERIQUES,
      REGLE_BALISAGE,
    ]);
    expect(constats.some((c) => c.reperes[0]?.startsWith('playground.ligne.'))).toBe(true);
    expect(constats.some((c) => c.regle === 'pipeline/zero-ligne')).toBe(true);

    const a = monter();
    a.rafraichirConstats();
    const alertes = constats.filter((c) => c.gravite !== 'info').length;
    expect(document.getElementById('assistant-btn')!.dataset.count).toBe(String(alertes));

    // Le premier constat affiché est l'erreur de balisage (amont absent, ligne 3).
    expect(constats[0].reperes[0]).toBe('playground.ligne.3.dsfr-data-query.source');
    await cliquerMeMontrer(a.panel);
    await vi.waitFor(() => expect(editeur.curseur?.line).toBe(3));
    expect(editeur.marques.length).toBeGreaterThan(0);
    // Un repère de code n'est pas « un réglage qui n'existe pas ».
    expect(a.panel.messages.some((m) => m.erreur)).toBe(false);
  });

  it('« Parcourir les exemples » montre le bouton de la barre', async () => {
    const a = monter();
    await poser(a.panel, 'Parcourir les exemples');
    await vi.waitFor(() => expect(repereDe(surligne())).toBe('playground.actions.exemples'));
  });

  it('Albert branché (post mocké) : une question hors registre montre le repère choisi', async () => {
    const post = vi.fn(async () => appelMontrer('playground.actions.copier'));
    const a = monter(transportAlbert(post));
    await vi.waitFor(() => expect(a.panel.sousTitre).toBe(SOUS_TITRE_AVEC_MODELE));
    await a.poser('bonjour, par où commencer ?');
    expect(post).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(repereDe(surligne())).toBe('playground.actions.copier'));
  });

  it('les suggestions de l’état vide mènent chacune à un repère, sans modèle', () => {
    for (const code of ['', CODE]) {
      const suggestions = suggestionsPlayground({ code });
      expect(suggestions.length).toBeLessThanOrEqual(3);
      for (const s of suggestions) {
        expect(trouverRepere(REGISTRE, s.texte).statut, s.texte).toBe('trouve');
      }
    }
  });
});

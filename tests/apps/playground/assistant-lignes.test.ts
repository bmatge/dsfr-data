/**
 * L'assistant du Playground désigne la ligne de code visée (#1105), sur le
 * vrai `index.html`, avec le vrai adaptateur et le vrai panneau :
 *
 * - « comment changer la limite de 15 ? » → la ligne `limit="15"`, par la
 *   correspondance locale sur le code, SANS appel au modèle ;
 * - plusieurs lignes possibles → des boutons candidats ;
 * - Albert en secours reçoit le plan du code et peut citer un repère de code,
 *   montré seulement s'il désigne le code courant ;
 * - un repère d'interface passe toujours par le registre.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../../packages/app-ui/src/app-assistant';
import {
  effacerSurbrillance,
  type MountedAssistant,
  type MountedDiagnostic,
  type Reponse,
  type TransportAssistant,
} from '@dsfr-data/shared';
import { creerAdaptateurPlayground } from '../../../apps/playground/src/assistant/adaptateur';
import { monterAssistantPlayground } from '../../../apps/playground/src/assistant/index';
import type { CodeMirrorEditor, PositionCode } from '../../../apps/playground/src/editor';
import {
  appelMontrer,
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

/** Code d'exemple : `limit="15"` ligne 2, deux `color` (lignes 4 et 5). */
const CODE = [
  '<dsfr-data-source id="src" api-type="opendatasoft"',
  '  dataset-id="communes" limit="15"></dsfr-data-source>',
  '<dsfr-data-chart source="src" type="bar"',
  '  color="#000091"></dsfr-data-chart>',
  '<dsfr-data-kpi source="src" color="blue"></dsfr-data-kpi>',
].join('\n');

/** Ce que le test lit du corps envoyé à Albert. */
interface CorpsAlbert {
  messages: { role: string; content: string }[];
  tools?: { function: { name: string; parameters: { properties: { id?: { enum: string[] } } } } }[];
}

type PanneauRendu = MountedAssistant['panel'] & { updateComplete: Promise<boolean> };

const diagnostic = {
  panel: { toggle: () => {} },
  constats: () => [],
  text: () => 'Diagnostic du pipeline',
} as unknown as MountedDiagnostic;

let assistant: MountedAssistant | null = null;
let editeur: FauxEditeur;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = corpsIndex('playground');
});

afterEach(() => {
  effacerSurbrillance();
  assistant?.destroy();
  assistant = null;
  document.body.innerHTML = '';
});

function monter(
  options: {
    transport?: () => Promise<TransportAssistant>;
    repondre?: () => Promise<Reponse>;
  } = {}
): MountedAssistant {
  assistant?.destroy();
  editeur = fauxEditeur(CODE);
  assistant = monterAssistantPlayground({
    editor: editeur,
    adaptateur: creerAdaptateurPlayground(editeur),
    diagnostic,
    transport: options.transport ?? transportAucun,
    ...(options.repondre ? { repondre: options.repondre } : {}),
  });
  return assistant;
}

const reponseDe = (a: MountedAssistant) =>
  a.panel.messages.filter((m) => m.role === 'assistant').at(-1);

describe('correspondance locale sur le code (#1105)', () => {
  it('« comment changer la limite de 15 ? » : la ligne est montrée, aucun appel au modèle', async () => {
    const post = vi.fn(async () => appelMontrer('playground.actions.copier'));
    const a = monter({ transport: transportAlbert(post) });
    await vi.waitFor(() => expect(a.avecModele).toBe(true));

    await a.poser('comment changer la limite de 15 ?');
    expect(post).not.toHaveBeenCalled();
    const reponse = reponseDe(a)!;
    expect(reponse.source).toBe('correspondance');
    expect(reponse.texte).toBe('Ligne 2 : limit="15" (dsfr-data-source).');
    expect(reponse.candidats?.map((c) => c.id)).toEqual([
      'playground.ligne.1.dsfr-data-source.limit',
    ]);
    // Curseur au début de `limit="15"`, deuxième ligne (0-based : 1).
    await vi.waitFor(() => expect(editeur.curseur?.line).toBe(1));
    expect(editeur.curseur?.ch).toBe(CODE.split('\n')[1].indexOf('limit'));
    expect(editeur.marques).toEqual(['pg-repere-code']);
    expect(a.panel.messages.some((m) => m.erreur)).toBe(false);
  });

  it('« où est la ligne pour changer la couleur » : deux lignes candidates, deux boutons', async () => {
    const a = monter();
    await a.poser('où est la ligne pour changer la couleur');
    const reponse = reponseDe(a)!;
    expect(reponse.candidats?.map((c) => c.id)).toEqual([
      'playground.ligne.3.dsfr-data-chart.color',
      'playground.ligne.5.dsfr-data-kpi.color',
    ]);
    // Rien n'est montré tant que l'usager n'a pas choisi.
    expect(editeur.curseur).toBeNull();

    a.panel.toggle(true);
    await (a.panel as PanneauRendu).updateComplete;
    const boutons = [...a.panel.querySelectorAll<HTMLButtonElement>('button')].filter((b) =>
      b.textContent?.trim().startsWith('Ligne ')
    );
    expect(boutons.map((b) => b.textContent?.trim())).toEqual([
      'Ligne 4 : color="#000091" (dsfr-data-chart)',
      'Ligne 5 : color="blue" (dsfr-data-kpi)',
    ]);
    boutons[1].click();
    await vi.waitFor(() => expect(editeur.curseur?.line).toBe(4));
  });

  it('« changer la couleur du graphique » : la balise nommée départage', async () => {
    const a = monter();
    await a.poser('changer la couleur du graphique');
    expect(reponseDe(a)?.candidats?.map((c) => c.id)).toEqual([
      'playground.ligne.3.dsfr-data-chart.color',
    ]);
    await vi.waitFor(() => expect(editeur.curseur?.line).toBe(3));
  });

  it('« code html » reste l’éditeur ; « la limite dans le code html » désigne la ligne', async () => {
    const a = monter();
    await poser(a.panel, 'code html');
    expect(reponseDe(a)?.candidats?.map((c) => c.id)).toEqual(['playground.editeur.code']);
    expect(editeur.curseur).toBeNull();
    await poser(a.panel, 'la limite dans le code html');
    expect(reponseDe(a)?.candidats?.map((c) => c.id)).toEqual([
      'playground.ligne.1.dsfr-data-source.limit',
    ]);
  });

  it('un repère d’interface passe toujours par le registre, même avec du code', async () => {
    const a = monter();
    await poser(a.panel, 'Parcourir les exemples');
    await vi.waitFor(() => expect(repereDe(surligne())).toBe('playground.actions.exemples'));
    expect(editeur.curseur).toBeNull();
  });
});

describe('Albert en secours, avec le plan du code (#1105)', () => {
  it('reçoit le plan et montre la ligne dont il cite le repère', async () => {
    const post = vi.fn(async (_corps: unknown) =>
      appelMontrer('playground.ligne.3.dsfr-data-chart.type')
    );
    const a = monter({ transport: transportAlbert(post) });
    await vi.waitFor(() => expect(a.avecModele).toBe(true));
    await a.poser('bonjour, par où commencer ?');
    expect(post).toHaveBeenCalledTimes(1);

    const corps = post.mock.calls[0][0] as CorpsAlbert;
    const systeme = corps.messages[0].content;
    expect(systeme).toContain(
      '- L1 <dsfr-data-source> id="src" api-type="opendatasoft" dataset-id="communes" limit="15" — playground.ligne.1.dsfr-data-source'
    );
    expect(systeme).not.toContain('tu ne peux pas la montrer');
    const enumMontrer = corps.tools?.find((t) => t.function.name === 'montrer')?.function.parameters
      .properties.id?.enum;
    expect(enumMontrer).toContain('playground.ligne.3.dsfr-data-chart.type');
    expect(enumMontrer).toContain('playground.actions.copier');

    await vi.waitFor(() => expect(editeur.curseur?.line).toBe(2));
    expect(reponseDe(a)?.candidats?.[0]).toMatchObject({
      id: 'playground.ligne.3.dsfr-data-chart.type',
      libelle: 'Ligne 3 — dsfr-data-chart (type)',
    });
    expect(a.panel.messages.some((m) => m.erreur)).toBe(false);
  });

  it('un repère de code absent du plan, ou mal formé, est refusé sans rien montrer', async () => {
    for (const id of ['playground.ligne.40.dsfr-data-chart', 'playground.ligne.x']) {
      const post = vi.fn(async () => appelMontrer(id));
      const a = monter({ transport: transportAlbert(post) });
      await vi.waitFor(() => expect(a.avecModele).toBe(true));
      await a.poser('bonjour, par où commencer ?');
      expect(post, id).toHaveBeenCalledTimes(1);
      expect(reponseDe(a)?.texte, id).toContain(
        "Le réglage proposé n'existe pas dans cette interface."
      );
      expect(editeur.curseur, id).toBeNull();
    }
  });

  it('mountAssistant refuse un repère de code qui ne désigne pas le code courant', async () => {
    for (const id of [
      'playground.ligne.40.dsfr-data-chart',
      'playground.ligne.2.dsfr-data-chart',
      'playground.ligne.3.dsfr-data-chart.limit',
    ]) {
      const a = monter({ repondre: async () => ({ texte: 'Ici.', montrer: id }) });
      await a.poser('bonjour, par où commencer ?');
      expect(a.panel.messages.at(-1)?.texte, id).toBe(
        "Le réglage cité n'existe pas dans cette interface."
      );
      expect(editeur.curseur, id).toBeNull();
    }
  });
});

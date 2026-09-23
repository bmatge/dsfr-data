/**
 * Le panneau de l'assistant contextuel (#1011, ADR-143 §7).
 *
 * Un panneau d'AFFICHAGE : il rend et il émet, `mountAssistant()` résout.
 * On vérifie ici la frontière (aucun import du socle IA dans app-ui), le
 * format des protos sircom / catalogue (bulles, état vide, saisie, ARIA) et
 * les comportements d'accessibilité : focus, Échap, `[hidden]`, suggestion qui
 * ne part pas, IME, jamais d'ouverture spontanée. La logique de réponse est
 * couverte par `tests/shared/mount-assistant.test.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AppAssistant,
  CLE_ASSISTANT_OUVERT,
  injectAppAssistantStyles,
  paragraphesDe,
} from '../../../packages/app-ui/src/app-assistant.js';
import { REGISTRE as REGISTRE_CARTO } from '../../../apps/builder-carto/src/assistant/reperes.generated';
import {
  getReperageMode,
  mountAssistant,
  setReperageMode,
  type AdaptateurReperage,
  type Constat,
  type MountedAssistant,
} from '@dsfr-data/shared';

const RACINE = join(__dirname, '../../..');
const SRC_APP_UI = join(RACINE, 'packages/app-ui/src');

async function monterPanneau(): Promise<AppAssistant> {
  const panel = document.createElement('app-assistant') as AppAssistant;
  document.body.appendChild(panel);
  await panel.updateComplete;
  return panel;
}

function panneau(el: AppAssistant): HTMLElement {
  return el.querySelector<HTMLElement>('.assistant-panneau')!;
}

function evenements(el: HTMLElement, type: string): unknown[] {
  const recus: unknown[] = [];
  el.addEventListener(type, (e) => recus.push((e as CustomEvent).detail));
  return recus;
}

function touche(el: HTMLElement, init: KeyboardEventInit & { keyCode?: number }): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  if (init.keyCode !== undefined) Object.defineProperty(e, 'keyCode', { value: init.keyCode });
  el.dispatchEvent(e);
  return e;
}

function constat(partiel: Partial<Constat> & Pick<Constat, 'id' | 'gravite'>): Constat {
  return {
    regle: 'test/regle',
    titre: `Titre ${partiel.id}`,
    explication: 'Explication détaillée qui ne doit pas apparaître.',
    reperes: [],
    preuve: 'preuve brute',
    ...partiel,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Frontière ─────────────────────────────────────────────────────────

describe('frontière : app-ui ne connaît pas le socle IA', () => {
  it('aucun fichier de packages/app-ui/src n’importe ia/transport, agent-loop ni reperes-matching', () => {
    // Mutation : ajouter `import { postChat } from '@dsfr-data/shared/src/ia/transport';`
    // dans app-assistant.ts → rouge.
    const interdits = ['ia/transport', 'agent-loop', 'reperes-matching'];
    const fautes: string[] = [];
    for (const nom of readdirSync(SRC_APP_UI)) {
      if (!nom.endsWith('.ts')) continue;
      const lignes = readFileSync(join(SRC_APP_UI, nom), 'utf-8').split('\n');
      lignes.forEach((ligne, i) => {
        const t = ligne.trim();
        if (!t.startsWith('import') && !t.startsWith('} from') && !t.includes('import(')) return;
        for (const motif of interdits) if (t.includes(motif)) fautes.push(`${nom}:${i + 1} ${t}`);
      });
    }
    expect(fautes).toEqual([]);
  });

  it('app-assistant n’importe de @dsfr-data/shared que des types', () => {
    const src = readFileSync(join(SRC_APP_UI, 'app-assistant.ts'), 'utf-8');
    const bloc = src.indexOf("from '@dsfr-data/shared'");
    const debut = src.lastIndexOf('import', bloc);
    expect(src.slice(debut, bloc)).toContain('import type');
    expect(src).not.toContain('.innerHTML');
    expect(src).not.toContain('lit/directives/unsafe-html');
  });
});

// ─── Anatomie (format des protos) ──────────────────────────────────────

describe('anatomie', () => {
  it('dialog non modal, titre, sous-titre, boutons icônes, fil en role=log, statut', async () => {
    const el = await monterPanneau();
    const p = panneau(el);
    expect(p.getAttribute('role')).toBe('dialog');
    expect(p.getAttribute('aria-modal')).toBe('false');
    expect(p.id).toBe(el.panneauId);
    const titre = el.querySelector('#' + p.getAttribute('aria-labelledby'));
    expect(titre?.textContent?.trim()).toBe('Assistant');
    expect(el.querySelector('.assistant-sous-titre')?.textContent).toBe('Albert, IA de l’État');
    const icones = Array.from(el.querySelectorAll('.assistant-icone')).map((b) =>
      b.getAttribute('title')
    );
    expect(icones).toEqual(['Nouvelle conversation', 'Réduire l’assistant']);
    const log = el.querySelector('[role="log"]')!;
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect(log.getAttribute('aria-relevant')).toBe('additions');
    expect(el.querySelector('[role="status"]')).toBeTruthy();
    const champ = el.querySelector('textarea')!;
    expect(champ.getAttribute('aria-keyshortcuts')).toBe('Enter');
    expect(champ.maxLength).toBe(2000);
    expect(el.querySelector(`label[for="${champ.id}"]`)?.textContent).toContain(
      'Entrée pour envoyer'
    );
  });

  it('messages : h3 sr-only, bulles par rôle, erreur, texte brut sans Markdown', async () => {
    const el = await monterPanneau();
    el.messages = [
      { role: 'usager', texte: 'Où est le fond ?' },
      { role: 'assistant', texte: '**Ici** :\nligne 2\n\nParagraphe 2 <b>x</b>', source: 'modele' },
      { role: 'systeme', erreur: true, texte: 'Injoignable.' },
    ];
    await el.updateComplete;
    const lis = el.querySelectorAll('.assistant-messages > li');
    expect(Array.from(lis).map((li) => li.className)).toEqual([
      'assistant-message assistant-message--utilisateur',
      'assistant-message assistant-message--assistant',
      'assistant-message assistant-message--erreur',
    ]);
    expect(lis[0].querySelector('h3.fr-sr-only')?.textContent).toBe('Votre message');
    expect(lis[1].querySelector('h3.fr-sr-only')?.textContent).toBe('Réponse de l’assistant');
    const reponse = lis[1].querySelectorAll('.assistant-texte');
    expect(reponse).toHaveLength(2);
    expect(reponse[0].textContent).not.toContain('**');
    expect(reponse[0].querySelectorAll('br')).toHaveLength(1);
    // Le HTML d'une réponse reste du texte.
    expect(lis[1].querySelector('b')).toBeNull();
    expect(reponse[1].textContent).toContain('<b>x</b>');
    expect(lis[1].querySelector('.assistant-mention')).toBeTruthy();
    expect(
      lis[2].querySelector('.assistant-bulle')?.classList.contains('fr-icon-warning-line')
    ).toBe(true);
  });

  it('paragraphesDe : paragraphes sur \\n\\n, lignes sur \\n, ** retiré', () => {
    expect(paragraphesDe('**a**\nb\n\n\n\nc')).toEqual([['a', 'b'], ['c']]);
  });

  it('résumé des constats : les non-info, sans explication ni preuve, hors du log', async () => {
    const el = await monterPanneau();
    el.constats = [
      constat({ id: 'e', gravite: 'erreur', reperes: ['carto.couches.liste'] }),
      constat({ id: 'i', gravite: 'info' }),
    ];
    el.diagnostic = true;
    await el.updateComplete;
    const recap = el.querySelector('.assistant-constats')!;
    expect(recap.closest('[role="log"]')).toBeNull();
    expect(recap.querySelectorAll('li')).toHaveLength(1);
    expect(recap.textContent).toContain('1 constat à corriger');
    expect(recap.textContent).not.toContain('Explication');
    expect(recap.textContent).not.toContain('preuve brute');
    const montrer = recap.querySelector<HTMLButtonElement>('li button')!;
    expect(montrer.className).toContain('assistant-bouton--secondaire');
    expect(montrer.className).toContain('fr-icon-eye-line');
    expect(recap.textContent).toContain('Voir le détail dans le Diagnostic');
  });
});

// ─── État vide et saisie ───────────────────────────────────────────────

describe('état vide et saisie', () => {
  it('au plus 3 suggestions ; une suggestion remplit le champ SANS envoyer et sélectionne la partie à compléter', async () => {
    // Mutation : émettre `assistant-envoyer` dans remplir() → rouge.
    const el = await monterPanneau();
    el.suggestions = [
      { texte: 'Afficher les éléments dans une fiche' },
      { texte: 'Changer le fond de carte en …', aCompleter: '…' },
      { texte: 'Trois' },
      { texte: 'Quatre' },
    ];
    await el.updateComplete;
    const envois = evenements(el, 'assistant-envoyer');
    const boutons = el.querySelectorAll<HTMLButtonElement>('.assistant-suggestion');
    expect(boutons).toHaveLength(3);
    boutons[1].click();
    const champ = el.querySelector('textarea')!;
    expect(champ.value).toBe('Changer le fond de carte en …');
    expect(envois).toEqual([]);
    expect(document.activeElement).toBe(champ);
    expect(champ.value.slice(champ.selectionStart, champ.selectionEnd)).toBe('…');
  });

  it('l’accueil est masqué dès qu’un message existe', async () => {
    const el = await monterPanneau();
    expect(el.querySelector('.assistant-accueil')?.hasAttribute('hidden')).toBe(false);
    el.messages = [{ role: 'usager', texte: 'x' }];
    await el.updateComplete;
    expect(el.querySelector('.assistant-accueil')?.hasAttribute('hidden')).toBe(true);
  });

  it('Entrée envoie, Maj+Entrée va à la ligne, rien pendant une composition IME', async () => {
    // Mutation : retirer `e.isComposing || e.keyCode === 229` → rouge.
    const el = await monterPanneau();
    const envois = evenements(el, 'assistant-envoyer');
    const champ = el.querySelector('textarea')!;

    champ.value = 'bonjour';
    touche(champ, { key: 'Enter', shiftKey: true });
    touche(champ, { key: 'Enter', isComposing: true });
    touche(champ, { key: 'Enter', keyCode: 229 });
    expect(envois).toEqual([]);
    expect(champ.value).toBe('bonjour');

    const e = touche(champ, { key: 'Enter' });
    expect(e.defaultPrevented).toBe(true);
    expect(envois).toEqual([{ question: 'bonjour' }]);
    expect(champ.value).toBe('');
  });

  it('rien ne part pendant l’attente ; les trois points s’affichent', async () => {
    const el = await monterPanneau();
    el.busy = true;
    await el.updateComplete;
    const envois = evenements(el, 'assistant-envoyer');
    const champ = el.querySelector('textarea')!;
    champ.value = 'question';
    touche(champ, { key: 'Enter' });
    expect(envois).toEqual([]);
    expect(el.querySelector('.assistant-envoi')?.getAttribute('aria-disabled')).toBe('true');
    const points = el.querySelector('.assistant-saisie-en-cours')!;
    expect(points.hasAttribute('hidden')).toBe(false);
    expect(points.getAttribute('aria-hidden')).toBe('true');
  });
});

// ─── Ouverture, focus, Échap ───────────────────────────────────────────

describe('ouverture, focus et Échap', () => {
  it('réduit par défaut : la section porte hidden, et la règle [hidden] !important existe', async () => {
    // Mutation : retirer `.assistant-panneau[hidden]` de la règle !important → rouge.
    const el = await monterPanneau();
    expect(el.open).toBe(false);
    expect(panneau(el).hasAttribute('hidden')).toBe(true);
    document.getElementById('app-assistant-style')?.remove();
    injectAppAssistantStyles();
    const css = document.getElementById('app-assistant-style')!.textContent ?? '';
    const regle = css.split('\n').find((l) => l.includes('display:none !important')) ?? '';
    for (const sel of [
      '.assistant-panneau[hidden]',
      '.assistant-accueil[hidden]',
      '.assistant-saisie-en-cours[hidden]',
    ]) {
      expect(regle, sel).toContain(sel);
    }
  });

  it('ouvrir place le focus dans le champ ; Échap réduit (stopPropagation)', async () => {
    // Mutation : retirer `this.champ?.focus()` de toggle() → rouge ;
    // retirer `e.stopPropagation()` de _onKeydown → rouge.
    const el = await monterPanneau();
    el.toggle(true);
    await el.updateComplete;
    await el.updateComplete;
    expect(panneau(el).hasAttribute('hidden')).toBe(false);
    expect(document.activeElement).toBe(el.querySelector('textarea'));

    const auDocument = vi.fn();
    document.addEventListener('keydown', auDocument);
    const toggles = evenements(el, 'assistant-toggle');
    touche(el.querySelector('textarea')!, { key: 'Escape' });
    document.removeEventListener('keydown', auDocument);

    expect(el.open).toBe(false);
    expect(auDocument).not.toHaveBeenCalled();
    expect(toggles).toEqual([{ open: false, focusDedans: true }]);
  });

  it('mémorise ouvert / réduit, et la réouverture après navigation ne prend pas le focus', async () => {
    // Mutation : focaliser le champ dans connectedCallback → rouge.
    const el = await monterPanneau();
    el.toggle(true);
    expect(localStorage.getItem(CLE_ASSISTANT_OUVERT)).toBe('1');
    el.remove();

    const bouton = document.createElement('button');
    document.body.appendChild(bouton);
    bouton.focus();
    const rouvert = await monterPanneau();
    await rouvert.updateComplete;
    expect(rouvert.open).toBe(true);
    expect(document.activeElement).toBe(bouton);

    rouvert.toggle(false);
    expect(localStorage.getItem(CLE_ASSISTANT_OUVERT)).toBe('0');
  });

  it('le stockage indisponible ne casse rien', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const el = await monterPanneau();
    expect(el.open).toBe(false);
    el.toggle(true);
    expect(el.open).toBe(true);
  });

  it('l’ouverture du Diagnostic réduit l’assistant, jamais l’inverse', async () => {
    const el = await monterPanneau();
    el.toggle(true, { focus: false });
    document.dispatchEvent(new CustomEvent('diagnostic-toggle', { detail: { open: false } }));
    expect(el.open).toBe(true);
    document.dispatchEvent(new CustomEvent('diagnostic-toggle', { detail: { open: true } }));
    expect(el.open).toBe(false);
  });

  it('« Me montrer » réduit le panneau en plein écran, pas sur un écran large', async () => {
    const el = await monterPanneau();
    el.messages = [
      { role: 'assistant', texte: 'Ici.', candidats: [{ id: 'a.b.c', libelle: 'C', chemin: [] }] },
    ];
    el.toggle(true, { focus: false });
    await el.updateComplete;
    const montres = evenements(el, 'assistant-montrer');
    const bouton = () => el.querySelector<HTMLButtonElement>('.assistant-actions button')!;

    const large = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation((q: string) => ({ matches: false, media: q }) as MediaQueryList);
    bouton().click();
    expect(el.open).toBe(true);

    large.mockImplementation(
      (q: string) => ({ matches: q.includes('35.98em'), media: q }) as MediaQueryList
    );
    bouton().click();
    expect(el.open).toBe(false);
    expect(montres).toEqual([{ repere: 'a.b.c' }, { repere: 'a.b.c' }]);
  });
});

// ─── Branché par mountAssistant ────────────────────────────────────────

describe('branché par mountAssistant', () => {
  let monte: MountedAssistant | null = null;
  afterEach(() => {
    monte?.destroy();
    monte = null;
  });

  function adaptateur(): AdaptateurReperage<null> {
    const prerequis: Record<
      string,
      { message: string; repereQuiLeve: string; verifier: () => boolean }
    > = {};
    for (const r of REGISTRE_CARTO.reperes)
      for (const n of r.prerequis)
        prerequis[n] = { message: n, repereQuiLeve: r.id, verifier: () => true };
    return {
      prerequis,
      etat: () => null,
      reveler: async () => null,
    };
  }

  it('la bascule de mode est persistée (getReperageMode)', async () => {
    // Mutation : retirer `setReperageMode(mode)` de onMode (mount-assistant.ts) → rouge.
    setReperageMode('dire');
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur(),
    });
    const panel = monte.panel as unknown as AppAssistant;
    await panel.updateComplete;
    const [dire, guider] = Array.from(
      panel.querySelectorAll<HTMLButtonElement>('.assistant-mode-choix button')
    );
    guider.click();
    expect(getReperageMode()).toBe('guider');
    dire.click();
    expect(getReperageMode()).toBe('dire');
  });

  it('Échap rend le focus au bouton assistant-btn', async () => {
    const bouton = document.createElement('button');
    bouton.id = 'assistant-btn';
    document.body.appendChild(bouton);
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur(),
    });
    const panel = monte.panel as unknown as AppAssistant;
    bouton.click();
    await panel.updateComplete;
    await panel.updateComplete;
    expect(document.activeElement).toBe(panel.querySelector('textarea'));
    expect(bouton.getAttribute('aria-expanded')).toBe('true');

    touche(panel.querySelector('textarea')!, { key: 'Escape' });
    expect(document.activeElement).toBe(bouton);
    expect(bouton.getAttribute('aria-expanded')).toBe('false');
  });

  it('jamais d’ouverture spontanée : des constats arrivent, le panneau reste réduit', async () => {
    let constats: Constat[] = [];
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur(),
      constats: () => constats,
    });
    constats = [constat({ id: 'e', gravite: 'erreur' })];
    monte.rafraichirConstats();
    await (monte.panel as unknown as AppAssistant).updateComplete;
    expect(monte.panel.open).toBe(false);
  });

  it('sans modèle : pied et sous-titre ne promettent pas d’IA', async () => {
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur(),
    });
    const panel = monte.panel as unknown as AppAssistant;
    await panel.updateComplete;
    expect(panel.querySelector('.assistant-pied')?.textContent).toContain(
      'Réponses tirées de l’interface, sans IA'
    );
    expect(panel.querySelector('.assistant-sous-titre')?.textContent).not.toContain('Albert');
  });

  it('« Nouvelle conversation » vide le fil et l’annonce', async () => {
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur(),
    });
    const panel = monte.panel as unknown as AppAssistant;
    await monte.poser('quelle heure est-il');
    expect(panel.messages.length).toBeGreaterThan(0);
    await panel.updateComplete;
    (panel.querySelector('.assistant-icone') as HTMLButtonElement).click();
    expect(panel.messages).toEqual([]);
    expect(panel.statut).toBe('Nouvelle conversation.');
  });
});

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
      '.assistant-lanceur[hidden]',
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
    expect(toggles).toEqual([{ open: false, focusDedans: true, parLanceur: false }]);
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

// ─── Languette flottante et placement sous la barre ───────────────────

describe('languette flottante (lanceur)', () => {
  function lanceur(el: AppAssistant): HTMLButtonElement {
    return el.querySelector<HTMLButtonElement>('.assistant-lanceur')!;
  }

  it('icône, texte « Assistant », aria-expanded et aria-controls vers le volet', async () => {
    const el = await monterPanneau();
    const l = lanceur(el);
    expect(l.tagName).toBe('BUTTON');
    expect(l.getAttribute('type')).toBe('button');
    expect(l.classList.contains('fr-icon-sparkling-2-line')).toBe(true);
    expect(l.querySelector('.assistant-lanceur-texte')?.textContent?.trim()).toBe('Assistant');
    expect(l.getAttribute('aria-expanded')).toBe('false');
    expect(l.getAttribute('aria-controls')).toBe(panneau(el).id);
    expect(l.hasAttribute('hidden')).toBe(false);
  });

  it('masquée volet ouvert, de retour à la réduction', async () => {
    // Mutation : retirer `?hidden=${this.open}` du lanceur → rouge.
    const el = await monterPanneau();
    lanceur(el).click();
    await el.updateComplete;
    expect(el.open).toBe(true);
    expect(lanceur(el).hasAttribute('hidden')).toBe(true);
    expect(lanceur(el).getAttribute('aria-expanded')).toBe('true');
    el.toggle(false);
    await el.updateComplete;
    expect(lanceur(el).hasAttribute('hidden')).toBe(false);
    expect(lanceur(el).getAttribute('aria-expanded')).toBe('false');
  });

  it('ouverte par la languette, Échap rend le focus à la languette', async () => {
    // Mutation : retirer `this.focusLanceur()` de toggle() → rouge.
    const el = await monterPanneau();
    const toggles = evenements(el, 'assistant-toggle');
    lanceur(el).click();
    await el.updateComplete;
    await el.updateComplete;
    expect(document.activeElement).toBe(el.querySelector('textarea'));
    touche(el.querySelector('textarea')!, { key: 'Escape' });
    await el.updateComplete;
    await el.updateComplete;
    expect(document.activeElement).toBe(lanceur(el));
    expect(toggles).toEqual([
      { open: true, focusDedans: false, parLanceur: true },
      { open: false, focusDedans: true, parLanceur: true },
    ]);
  });

  it('porte la pastille des constats non-info, avec un texte pour les lecteurs d’écran', async () => {
    const el = await monterPanneau();
    expect(el.querySelector('.assistant-lanceur-pastille')).toBeNull();
    el.constats = [
      constat({ id: 'a', gravite: 'erreur' }),
      constat({ id: 'b', gravite: 'avertissement' }),
      constat({ id: 'c', gravite: 'info' }),
    ];
    await el.updateComplete;
    expect(el.querySelector('.assistant-lanceur-pastille')?.textContent).toBe('2');
    expect(el.querySelector('.assistant-lanceur-pastille')?.getAttribute('aria-hidden')).toBe(
      'true'
    );
    expect(lanceur(el).textContent?.replace(/\s+/g, ' ')).toContain('2 constats à corriger');
  });

  it('CSS : languette au bord droit à mi-hauteur, pastille ronde en bas à droite en mobile', () => {
    document.getElementById('app-assistant-style')?.remove();
    injectAppAssistantStyles();
    const css = document.getElementById('app-assistant-style')!.textContent ?? '';
    const racine = css.slice(css.indexOf('.assistant-lanceur{'));
    const regle = racine.slice(0, racine.indexOf('}'));
    expect(regle).toContain('position:fixed');
    expect(regle).toContain('right:0');
    expect(regle).toContain('translateY(-50%)');
    expect(regle).toContain('--app-action-bar-bas');
    // Sous les menus (900) et les modales (1000), comme le volet.
    expect(Number(/z-index:(\d+)/.exec(regle)![1])).toBeLessThan(900);
    // Mobile : au-dessus de la barre d'actions fixe et du rail du Diagnostic.
    const mobile = css.slice(css.indexOf('@media (max-width:35.98em)'));
    const rond = mobile.slice(mobile.indexOf('.assistant-lanceur{'));
    const regleMobile = rond.slice(0, rond.indexOf('}'));
    expect(regleMobile).toContain('border-radius:50%');
    expect(regleMobile).toContain('--app-action-bar-fixed-h');
    expect(regleMobile).toContain('--app-diagnostic-h');
    // Mouvement réduit : pas de transition.
    const reduit = css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
    expect(reduit).toContain('.assistant-lanceur{transition:none}');
  });

  it('le volet commence sous la barre d’actions (--app-action-bar-bas)', () => {
    // Mutation : remettre `top:0` à la racine → rouge. Le volet recouvrirait
    // la partie droite de la barre, dont la primaire « Exécuter ».
    document.getElementById('app-assistant-style')?.remove();
    injectAppAssistantStyles();
    const css = document.getElementById('app-assistant-style')!.textContent ?? '';
    const debut = css.indexOf('.assistant-panneau{');
    const regle = css.slice(debut, css.indexOf('}', debut));
    expect(regle).toContain('top:var(--app-action-bar-bas,0px)');
    expect(css).toContain(
      '.assistant-panneau{top:max(var(--app-header-h,0px),var(--app-action-bar-bas,0px))}'
    );
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

  it('la languette porte la même pastille que #assistant-btn, et bascule le bouton', async () => {
    const bouton = document.createElement('button');
    bouton.id = 'assistant-btn';
    document.body.appendChild(bouton);
    let constats: Constat[] = [];
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur(),
      constats: () => constats,
    });
    const panel = monte.panel as unknown as AppAssistant;
    constats = [constat({ id: 'e', gravite: 'erreur' }), constat({ id: 'i', gravite: 'info' })];
    monte.rafraichirConstats();
    await panel.updateComplete;
    expect(bouton.dataset.count).toBe('1');
    expect(panel.querySelector('.assistant-lanceur-pastille')?.textContent).toBe(
      bouton.dataset.count
    );
    panel.querySelector<HTMLButtonElement>('.assistant-lanceur')!.click();
    expect(bouton.getAttribute('aria-expanded')).toBe('true');
  });

  it('ouvert par le bouton replié dans « Plus d’actions » : le focus revient au menu', async () => {
    // Mutation : `bouton.focus()` sans condition dans rendreFocus → rouge (le
    // bouton d'un menu refermé ne prend pas le focus : il se perdait).
    document.body.innerHTML = `<app-menu><button class="app-menu__trigger">Plus</button>
      <ul class="app-menu__list" hidden><li><button id="assistant-btn">Assistant</button></li></ul></app-menu>`;
    const bouton = document.getElementById('assistant-btn')!;
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
    touche(panel.querySelector('textarea')!, { key: 'Escape' });
    expect(document.activeElement).toBe(document.querySelector('.app-menu__trigger'));
  });

  it('page sans app-action-bar (Sources) : le bas de la rangée d’actions est publié', async () => {
    // Mutation : retirer `suivreBasDe` de mountAssistant → rouge. Sur Sources,
    // le volet recouvrait « Nouvelle connexion ».
    const racine = document.documentElement.style;
    racine.removeProperty('--app-action-bar-bas');
    document.body.innerHTML = `<div data-zone="sources.actions">
      <button id="assistant-btn">Assistant</button><button id="add">Nouvelle connexion</button></div>`;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      return { bottom: this.dataset.zone ? 327.2 : 0 } as DOMRect;
    });
    monte = mountAssistant({
      app: 'sources',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur(),
    });
    expect(racine.getPropertyValue('--app-action-bar-bas')).toBe('327px');
    monte.destroy();
    monte = null;
    expect(racine.getPropertyValue('--app-action-bar-bas')).toBe('');
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

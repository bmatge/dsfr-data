/**
 * Montage de l'assistant contextuel (#1011, ADR-143 §6-7).
 *
 * Le « cerveau » du panneau : correspondance sans modèle d'abord, modèle
 * injecté seulement si rien ne correspond, `montrer()` sur les repères du
 * registre, persistance du mode. Les cas de correspondance portent sur le
 * registre carto GÉNÉRÉ, qui fait foi pour les ids.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import '../../packages/app-ui/src/app-assistant';
import { REGISTRE as REGISTRE_CARTO } from '../../apps/builder-carto/src/assistant/reperes.generated';
import {
  CLASSE_REPERE_MONTRE,
  getReperageMode,
  getToursState,
  messageAucunReglage,
  mountAssistant,
  selecteurRepere,
  setReperageMode,
  STORAGE_KEYS,
  type AdaptateurReperage,
  type Constat,
  type ContexteAssistant,
  type MountedAssistant,
  type PrerequisParId,
  type RegistreReperes,
  type Reponse,
} from '@dsfr-data/shared';

// ─── App factice ───────────────────────────────────────────────────────

interface Etat {
  pret: boolean;
}

/** Une règle par prérequis cité par le registre : toutes remplies quand `pret`. */
function prerequisDe(registre: RegistreReperes): PrerequisParId<Etat> {
  const regles: Record<string, PrerequisParId<Etat>[string]> = {};
  for (const r of registre.reperes) {
    for (const nom of r.prerequis) {
      regles[nom] = {
        message: `Préalable ${nom} manquant.`,
        repereQuiLeve: registre.reperes[0].id,
        verifier: (e) => e.pret,
      };
    }
  }
  return regles;
}

/** Adaptateur qui crée à la demande le contrôle révélé. */
function adaptateur(
  etat: Etat,
  registre: RegistreReperes = REGISTRE_CARTO
): AdaptateurReperage<Etat> & { reveles: string[] } {
  const reveles: string[] = [];
  return {
    reveles,
    prerequis: prerequisDe(registre),
    etat: () => etat,
    async reveler(id: string) {
      reveles.push(id);
      let el = document.querySelector<HTMLElement>(selecteurRepere(id));
      if (!el) {
        el = document.createElement('select');
        el.setAttribute('data-repere', id);
        document.body.appendChild(el);
      }
      return el;
    },
  };
}

function constat(partiel: Partial<Constat> & Pick<Constat, 'id' | 'gravite'>): Constat {
  return {
    regle: 'test/regle',
    titre: `Titre ${partiel.id}`,
    explication: 'Explication détaillée.',
    reperes: [],
    preuve: 'preuve',
    ...partiel,
  };
}

let monte: MountedAssistant | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

afterEach(() => {
  monte?.destroy();
  monte = null;
  vi.restoreAllMocks();
});

async function rendu(): Promise<void> {
  await (monte!.panel as unknown as { updateComplete: Promise<unknown> }).updateComplete;
}

// ─── Enchaînement de poser() ───────────────────────────────────────────

describe('retours d’usage : chaque question est signalée au kit s’il est chargé', () => {
  afterEach(() => {
    delete (globalThis as { fc?: unknown }).fc;
  });

  it('sans kit, rien ne se passe', async () => {
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur({ pret: true }),
    });
    await expect(monte.poser('quelle heure est-il à Tokyo')).resolves.toBeUndefined();
  });

  it('avec kit : question, réponse, source, repères cités et erreur transmis', async () => {
    const turn = vi.fn();
    (globalThis as { fc?: unknown }).fc = { assistant: { turn } };
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur({ pret: true }),
      repondre: async () => ({ texte: 'Voici.', montrer: 'carto.elements.clic.popup-mode' }),
    });

    await monte.poser('  quelle heure est-il à Tokyo  ');

    expect(turn).toHaveBeenCalledTimes(1);
    expect(turn.mock.calls[0][0]).toMatchObject({
      question: 'quelle heure est-il à Tokyo',
      reponse: 'Voici.',
      modele: 'modele',
      outils: [{ nom: 'reperes', resultat: ['carto.elements.clic.popup-mode'] }],
    });
    expect(typeof turn.mock.calls[0][0].dureeMs).toBe('number');
  });

  it('une erreur du modèle est transmise comme erreur du tour', async () => {
    const turn = vi.fn();
    (globalThis as { fc?: unknown }).fc = { assistant: { turn } };
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur({ pret: true }),
      repondre: async () => {
        throw new Error('429 Too Many Requests');
      },
    });

    await monte.poser('quelle heure est-il à Tokyo');

    expect(turn.mock.calls[0][0].erreur).toContain('429 Too Many Requests');
  });
});

describe('poser() : la correspondance sans modèle d’abord', () => {
  it('« afficher les POI dans une fiche » montre le comportement au clic sans appeler le modèle', async () => {
    const repondre = vi.fn<(c: ContexteAssistant) => Promise<Reponse>>();
    const adapt = adaptateur({ pret: true });
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adapt,
      repondre,
    });

    await monte.poser('afficher les POI dans une fiche');

    expect(repondre).not.toHaveBeenCalled();
    expect(adapt.reveles).toEqual(['carto.elements.clic.popup-mode']);
    const el = document.querySelector('[data-repere="carto.elements.clic.popup-mode"]');
    expect(el?.classList.contains(CLASSE_REPERE_MONTRE)).toBe(true);

    const [usager, reponse] = monte.panel.messages;
    expect(usager).toMatchObject({ role: 'usager', texte: 'afficher les POI dans une fiche' });
    expect(reponse.role).toBe('assistant');
    expect(reponse.source).toBe('correspondance');
    expect(reponse.texte).toContain('Comportement au clic');
    expect(reponse.reperes).toEqual(['carto.elements.clic.popup-mode']);
  });

  it('un prérequis manquant ajoute son message et un bouton « Continuer »', async () => {
    const etat = { pret: false };
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur(etat),
    });

    await monte.poser('afficher les POI dans une fiche');

    const note = monte.panel.messages.at(-1)!;
    expect(note.role).toBe('systeme');
    expect(note.texte).toContain('Préalable');
    expect(note.continuer).toBe('carto.elements.clic.popup-mode');

    // « Continuer » rappelle montrer() sur le repère d'origine.
    etat.pret = true;
    await rendu();
    const continuer = Array.from(monte.panel.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Continuer'
    );
    expect(continuer).toBeTruthy();
    continuer!.click();
    await vi.waitFor(() => {
      const el = document.querySelector('[data-repere="carto.elements.clic.popup-mode"]');
      expect(el?.classList.contains(CLASSE_REPERE_MONTRE)).toBe(true);
    });
  });

  it('ambigu : des boutons candidats, aucun appel au modèle, rien de montré d’office', async () => {
    const registre: RegistreReperes = {
      app: 'test',
      prefixe: 't',
      reperes: [
        {
          id: 't.a',
          genre: 'zone',
          libelle: 'Couleur du trait',
          element: 'section',
          attributs: [],
          prerequis: [],
          synonymes: ['couleur'],
          sources: [],
        },
        {
          id: 't.b',
          genre: 'zone',
          libelle: 'Couleur du fond',
          element: 'section',
          attributs: [],
          prerequis: [],
          synonymes: ['couleur'],
          sources: [],
        },
      ],
    };
    const repondre = vi.fn<(c: ContexteAssistant) => Promise<Reponse>>();
    const adapt = adaptateur({ pret: true }, registre);
    monte = mountAssistant({ app: 'test', registre, adaptateur: adapt, repondre });

    await monte.poser('couleur');

    expect(repondre).not.toHaveBeenCalled();
    expect(adapt.reveles).toEqual([]);
    const reponse = monte.panel.messages.at(-1)!;
    expect(reponse.candidats?.map((c) => c.id)).toEqual(['t.a', 't.b']);

    await rendu();
    const boutons = Array.from(monte.panel.querySelectorAll('.assistant-actions button'));
    expect(boutons.map((b) => b.textContent?.trim())).toEqual([
      'Couleur du trait',
      'Couleur du fond',
    ]);
    (boutons[1] as HTMLButtonElement).click();
    await vi.waitFor(() => expect(adapt.reveles).toEqual(['t.b']));
  });

  it('aucun, sans modèle : un message local, utilisable sans clé', async () => {
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur({ pret: true }),
    });

    await monte.poser('quelle heure est-il à Tokyo');

    const reponse = monte.panel.messages.at(-1)!;
    expect(reponse).toMatchObject({
      role: 'assistant',
      source: 'correspondance',
      texte: messageAucunReglage('quelle heure est-il à Tokyo'),
    });
  });

  it('aucun, avec modèle : texte affiché, repère révélé, contexte complet transmis', async () => {
    const constats = [constat({ id: 'c1', gravite: 'erreur' })];
    const repondre = vi.fn(async (_c: ContexteAssistant): Promise<Reponse> => ({
      texte: 'Premier paragraphe.\n\nSecond paragraphe.',
      montrer: 'carto.elements.clic.popup-mode',
      reperes: ['carto.couches.liste', 'carto.invente.de.toutes.pieces', '<script>'],
    }));
    const adapt = adaptateur({ pret: true });
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adapt,
      constats: () => constats,
      repondre,
    });

    await monte.poser('quelle heure est-il à Tokyo');

    expect(repondre).toHaveBeenCalledTimes(1);
    const ctx = repondre.mock.calls[0][0];
    expect(ctx.question).toBe('quelle heure est-il à Tokyo');
    expect(ctx.correspondance.statut).toBe('aucun');
    expect(ctx.constats).toEqual(constats);
    expect(ctx.mode).toBe('guider');
    expect(ctx.historique).toEqual([]);
    expect(ctx.signal).toBeInstanceOf(AbortSignal);

    expect(adapt.reveles).toEqual(['carto.elements.clic.popup-mode']);
    const reponse = monte.panel.messages.at(-1)!;
    expect(reponse.source).toBe('modele');
    // Les ids inventés ou hors grammaire sont écartés avant tout montrer().
    expect(reponse.reperes).toEqual(['carto.elements.clic.popup-mode', 'carto.couches.liste']);

    await rendu();
    const paragraphes = monte.panel.querySelectorAll(
      '.assistant-message--assistant .assistant-texte'
    );
    expect(Array.from(paragraphes).map((p) => p.textContent?.trim())).toEqual([
      'Premier paragraphe.',
      'Second paragraphe.',
    ]);
    expect(monte.panel.busy).toBe(false);
  });

  it('un repère inventé par le modèle donne une note, jamais une exception', async () => {
    const adapt = adaptateur({ pret: true });
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adapt,
      repondre: async () => ({ texte: 'Voici.', montrer: 'carto.nexiste.pas' }),
    });

    await monte.poser('quelle heure est-il à Tokyo');

    expect(adapt.reveles).toEqual([]);
    expect(monte.panel.messages.at(-1)).toMatchObject({ role: 'systeme' });
  });

  it('une erreur du modèle est dite en clair, sans relance automatique', async () => {
    const repondre = vi.fn(async (): Promise<Reponse> => {
      throw new Error('429 Too Many Requests');
    });
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur({ pret: true }),
      repondre,
    });

    await monte.poser('quelle heure est-il à Tokyo');

    expect(repondre).toHaveBeenCalledTimes(1);
    const textes = monte.panel.messages.map((m) => m.texte);
    expect(textes.some((t) => t.includes('429 Too Many Requests'))).toBe(true);
    expect(monte.panel.busy).toBe(false);
  });

  it('busy pendant l’attente : champ et envoi désactivés', async () => {
    let resoudre: (r: Reponse) => void = () => {};
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur({ pret: true }),
      repondre: () => new Promise<Reponse>((r) => (resoudre = r)),
    });

    const attente = monte.poser('quelle heure est-il à Tokyo');
    await rendu();
    expect(monte.panel.busy).toBe(true);
    const envoi = () => monte!.panel.querySelector('.assistant-envoi')!;
    expect(envoi().getAttribute('aria-disabled')).toBe('true');
    expect(monte.panel.statut).toContain('prépare une réponse');
    expect(monte.panel.querySelector('.assistant-saisie-en-cours')?.hasAttribute('hidden')).toBe(
      false
    );

    resoudre({ texte: 'Réponse.' });
    await attente;
    await rendu();
    expect(monte.panel.busy).toBe(false);
    expect(envoi().getAttribute('aria-disabled')).toBe('false');
    expect(monte.panel.querySelector('.assistant-saisie-en-cours')?.hasAttribute('hidden')).toBe(
      true
    );
  });
});

// ─── Mode, constats, bouton ────────────────────────────────────────────

describe('bascule de mode persistée', () => {
  it('la bascule « Guider » écrit reperageMode dans TourState', async () => {
    setReperageMode('dire');
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur({ pret: true }),
    });
    await rendu();

    const guider = Array.from(
      monte.panel.querySelectorAll<HTMLButtonElement>('.assistant-mode-choix button')
    ).find((b) => b.textContent?.trim() === 'Guider')!;
    guider.click();
    await rendu();
    expect(guider.getAttribute('aria-pressed')).toBe('true');

    expect(getReperageMode()).toBe('guider');
    expect(getToursState().reperageMode).toBe('guider');
    expect(localStorage.getItem(STORAGE_KEYS.TOURS)).toContain('guider');
    expect(monte.panel.mode).toBe('guider');
  });

  it('le panneau démarre sur le mode mémorisé', () => {
    setReperageMode('guider');
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur({ pret: true }),
    });
    expect(monte.panel.mode).toBe('guider');
  });
});

describe('résumé des constats et bouton « Assistant »', () => {
  function barre(): HTMLElement {
    const bar = document.createElement('app-action-bar');
    document.body.appendChild(bar);
    return bar;
  }

  it('crée assistant-btn dans app-action-bar et y pose la pastille des non-info', async () => {
    await import('../../packages/app-ui/src/app-action-bar');
    const bar = barre();
    await (bar as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    let constats: Constat[] = [
      constat({ id: 'e', gravite: 'erreur', reperes: ['carto.couches.liste'] }),
      constat({ id: 'i', gravite: 'info' }),
    ];
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur({ pret: true }),
      constats: () => constats,
    });

    const bouton = document.getElementById('assistant-btn')!;
    expect(bouton).toBeTruthy();
    expect(bouton.classList.contains('fr-icon-question-answer-line')).toBe(true);
    expect(bouton.getAttribute('slot')).toBe('tertiary');
    expect(bouton.dataset.count).toBe('1');
    expect(bouton.getAttribute('aria-controls')).toBe(monte.panel.panneauId);
    await rendu();
    expect(document.getElementById(monte.panel.panneauId)?.getAttribute('role')).toBe('dialog');
    expect(bouton.getAttribute('aria-expanded')).toBe('false');

    // Un nouveau constat ne fait bouger que la pastille : jamais d'ouverture.
    constats = [...constats, constat({ id: 'a', gravite: 'avertissement' })];
    monte.rafraichirConstats();
    expect(bouton.dataset.count).toBe('2');
    expect(monte.panel.open).toBe(false);

    constats = [];
    monte.rafraichirConstats();
    expect(bouton.dataset.count).toBeUndefined();

    bouton.click();
    expect(monte.panel.open).toBe(true);
    expect(bouton.getAttribute('aria-expanded')).toBe('true');
  });

  it('« Me montrer » d’un constat montre son premier repère', async () => {
    const adapt = adaptateur({ pret: true });
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adapt,
      constats: () => [
        constat({ id: 'e', gravite: 'erreur', reperes: ['carto.couches.liste'] }),
        constat({ id: 'a', gravite: 'avertissement' }),
      ],
    });
    await rendu();

    const boutons = monte.panel.querySelectorAll<HTMLButtonElement>('.assistant-recap li button');
    expect(boutons).toHaveLength(2);
    expect(boutons[1].disabled).toBe(true);
    boutons[0].click();
    await vi.waitFor(() => expect(adapt.reveles).toEqual(['carto.couches.liste']));
  });

  it('« Voir le détail » et « Construire pour moi » appellent l’app', async () => {
    const ouvrirDiagnostic = vi.fn();
    const construire = vi.fn();
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur({ pret: true }),
      constats: () => [constat({ id: 'e', gravite: 'erreur' })],
      ouvrirDiagnostic,
      construire,
    });
    await rendu();

    const parLibelle = (l: string) =>
      Array.from(monte!.panel.querySelectorAll('button')).find((b) =>
        b.textContent?.trim().startsWith(l)
      )!;
    parLibelle('Voir le détail').click();
    parLibelle('Construire pour moi').click();
    expect(ouvrirDiagnostic).toHaveBeenCalledWith('constats');
    expect(construire).toHaveBeenCalledTimes(1);
  });

  it('boutonId: false : aucun bouton créé', () => {
    monte = mountAssistant({
      app: 'builder-carto',
      registre: REGISTRE_CARTO,
      adaptateur: adaptateur({ pret: true }),
      boutonId: false,
    });
    expect(document.getElementById('assistant-btn')).toBeNull();
  });
});

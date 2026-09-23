/**
 * Révélation d'un repère : montrer(), modes « dire » / « guider » (#1003, ADR-143 §6-7).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  montrer,
  chemin,
  prerequisManquants,
  indexerReperes,
  estIdRepere,
  selecteurRepere,
  getReperageMode,
  setReperageMode,
  getToursState,
  effacerSurbrillance,
  ID_REGION_REPERAGE,
  CLASSE_REPERE_MONTRE,
  CLASSE_REPERE_ANIME,
  DUREE_SURBRILLANCE_MS,
  STORAGE_KEYS,
} from '@dsfr-data/shared';
import type {
  AdaptateurReperage,
  PrerequisParId,
  RegistreReperes,
  Repere,
} from '@dsfr-data/shared';

// ─── Registre et app minimaux ──────────────────────────────────────────

function repere(r: Partial<Repere> & Pick<Repere, 'id' | 'genre' | 'libelle'>): Repere {
  return {
    element: r.genre === 'zone' ? 'section' : 'select',
    attributs: [],
    prerequis: [],
    synonymes: [],
    sources: [],
    ...r,
  };
}

const REGISTRE: RegistreReperes = {
  app: 'test',
  prefixe: 't',
  reperes: [
    repere({ id: 't.couches', genre: 'zone', libelle: 'Couches de données' }),
    repere({
      id: 't.couches.liste',
      genre: 'controle',
      libelle: 'Liste des couches',
      zone: 't.couches',
    }),
    repere({ id: 't.elements', genre: 'zone', libelle: 'Éléments' }),
    repere({
      id: 't.elements.clic',
      genre: 'zone',
      libelle: 'Au clic sur un élément',
      zone: 't.elements',
    }),
    repere({
      id: 't.elements.clic.popup-mode',
      genre: 'controle',
      libelle: 'Comportement au clic',
      zone: 't.elements.clic',
      prerequis: ['couche-active'],
    }),
    repere({
      id: 't.elements.clic.sans-regle',
      genre: 'controle',
      libelle: 'Réglage orphelin',
      zone: 't.elements.clic',
      prerequis: ['inexistant'],
    }),
  ],
};

interface Etat {
  coucheActive: boolean;
}

const PREREQUIS: PrerequisParId<Etat> = {
  'couche-active': {
    message: "Avant de régler l'affichage des éléments, sélectionnez une couche.",
    repereQuiLeve: 't.couches.liste',
    verifier: (e) => e.coucheActive,
  },
};

/** Monte le DOM des repères ; l'onglet « Éléments » est replié tant qu'on ne le révèle pas. */
function monterDom(): void {
  document.body.innerHTML = `
    <input id="saisie-usager" aria-label="Question à l'assistant">
    <section data-zone="t.couches"><h2>Couches de données</h2>
      <select data-repere="t.couches.liste" aria-label="Liste des couches"><option>A</option></select>
    </section>
    <button id="onglet-elements" type="button">Éléments</button>
    <section data-zone="t.elements" hidden><h2>Éléments</h2>
      <div data-zone="t.elements.clic">
        <select data-repere="t.elements.clic.popup-mode" aria-label="Comportement au clic">
          <option>popup</option>
        </select>
      </div>
    </section>
  `;
}

/**
 * Adaptateur de test. La révélation d'un contrôle de « Éléments » clique
 * l'onglet et y met le focus, comme un vrai panneau : « dire » doit le rendre.
 */
function adaptateur(etat: Etat): AdaptateurReperage<Etat> & { reveles: string[] } {
  const reveles: string[] = [];
  return {
    reveles,
    prerequis: PREREQUIS,
    etat: () => etat,
    async reveler(id: string) {
      reveles.push(id);
      if (id.startsWith('t.elements')) {
        const onglet = document.getElementById('onglet-elements') as HTMLButtonElement;
        onglet.focus();
        (document.querySelector('[data-zone="t.elements"]') as HTMLElement).hidden = false;
      }
      await Promise.resolve();
      return document.querySelector<HTMLElement>(selecteurRepere(id));
    },
  };
}

function region(): HTMLElement | null {
  return document.getElementById(ID_REGION_REPERAGE);
}

function simulerMouvementReduit(reduit: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: reduit && query.includes('prefers-reduced-motion: reduce'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList
  );
}

beforeEach(() => {
  localStorage.clear();
  monterDom();
  simulerMouvementReduit(false);
});

afterEach(() => {
  effacerSurbrillance();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
  localStorage.clear();
});

// ─── Fonctions pures ───────────────────────────────────────────────────

describe('chemin, prérequis et grammaire', () => {
  it('chemin : zones englobantes par préfixe d’id, puis le repère lui-même', () => {
    expect(chemin(REGISTRE, 't.elements.clic.popup-mode')).toEqual([
      'Éléments',
      'Au clic sur un élément',
      'Comportement au clic',
    ]);
    expect(chemin(REGISTRE, 't.couches')).toEqual(['Couches de données']);
    expect(chemin(REGISTRE, 't.absent')).toEqual([]);
  });

  it('indexerReperes indexe par id', () => {
    const index = indexerReperes(REGISTRE);
    expect(index.get('t.couches.liste')?.libelle).toBe('Liste des couches');
    expect(index.size).toBe(REGISTRE.reperes.length);
  });

  it('prerequisManquants : manquant puis levé', () => {
    const etat: Etat = { coucheActive: false };
    const a = adaptateur(etat);
    const manquants = prerequisManquants(REGISTRE, a, 't.elements.clic.popup-mode');
    expect(manquants.map((m) => m.id)).toEqual(['couche-active']);
    expect(manquants[0].regle.repereQuiLeve).toBe('t.couches.liste');
    etat.coucheActive = true;
    expect(prerequisManquants(REGISTRE, a, 't.elements.clic.popup-mode')).toEqual([]);
  });

  it('un prérequis cité sans règle est une erreur, jamais ignoré', () => {
    const a = adaptateur({ coucheActive: true });
    expect(() => prerequisManquants(REGISTRE, a, 't.elements.clic.sans-regle')).toThrow(
      /inexistant/
    );
  });

  it('un nom hérité du prototype ne passe pas pour une règle', () => {
    const registre: RegistreReperes = {
      ...REGISTRE,
      reperes: [repere({ id: 't.x.y', genre: 'controle', libelle: 'X', prerequis: ['toString'] })],
    };
    expect(() =>
      prerequisManquants(registre, adaptateur({ coucheActive: true }), 't.x.y')
    ).toThrow();
  });

  it('grammaire des identifiants : aucun id hors grammaire n’entre dans un sélecteur', () => {
    expect(estIdRepere('t.elements.clic.popup-mode')).toBe(true);
    expect(estIdRepere('carto.couches')).toBe(true);
    expect(estIdRepere('carto')).toBe(false);
    expect(estIdRepere('carto..x')).toBe(false);
    expect(estIdRepere('Carto.x')).toBe(false);
    expect(estIdRepere('-x.y')).toBe(false);
    expect(estIdRepere('t.a"],[onclick')).toBe(false);
    expect(selecteurRepere('t.couches.liste')).toBe('[data-repere="t.couches.liste"]');
    expect(() => selecteurRepere('t.a"] *, [x="')).toThrow();
  });
});

// ─── montrer() ─────────────────────────────────────────────────────────

describe('montrer — mode « dire »', () => {
  it('le focus ne bouge pas et la région live contient le chemin', async () => {
    const saisie = document.getElementById('saisie-usager') as HTMLInputElement;
    saisie.focus();
    const a = adaptateur({ coucheActive: true });

    const res = await montrer('t.elements.clic.popup-mode', {
      registre: REGISTRE,
      adaptateur: a,
      mode: 'dire',
    });

    expect(res.ok).toBe(true);
    expect(a.reveles).toEqual(['t.elements.clic.popup-mode']);
    expect(document.activeElement).toBe(saisie);
    expect(region()?.textContent).toBe('Éléments › Au clic sur un élément › Comportement au clic');
    expect(region()?.getAttribute('aria-live')).toBe('polite');
    expect(res.element?.classList.contains(CLASSE_REPERE_MONTRE)).toBe(true);
  });

  it('une seule région live, même après plusieurs appels', async () => {
    const a = adaptateur({ coucheActive: true });
    await montrer('t.couches.liste', { registre: REGISTRE, adaptateur: a, mode: 'dire' });
    await montrer('t.elements.clic.popup-mode', {
      registre: REGISTRE,
      adaptateur: a,
      mode: 'dire',
    });
    expect(document.querySelectorAll('[aria-live]').length).toBe(1);
    expect(region()?.textContent).toContain('Comportement au clic');
  });

  it('la surbrillance est retirée au montrer suivant', async () => {
    const a = adaptateur({ coucheActive: true });
    const r1 = await montrer('t.couches.liste', {
      registre: REGISTRE,
      adaptateur: a,
      mode: 'dire',
    });
    const r2 = await montrer('t.elements.clic.popup-mode', {
      registre: REGISTRE,
      adaptateur: a,
      mode: 'dire',
    });
    expect(r1.element?.classList.contains(CLASSE_REPERE_MONTRE)).toBe(false);
    expect(r2.element?.classList.contains(CLASSE_REPERE_MONTRE)).toBe(true);
    expect(document.querySelectorAll(`.${CLASSE_REPERE_MONTRE}`).length).toBe(1);
  });

  it(`la surbrillance est retirée après ${DUREE_SURBRILLANCE_MS} ms`, async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const a = adaptateur({ coucheActive: true });
    const res = await montrer('t.couches.liste', {
      registre: REGISTRE,
      adaptateur: a,
      mode: 'dire',
    });
    vi.advanceTimersByTime(DUREE_SURBRILLANCE_MS - 1);
    expect(res.element?.classList.contains(CLASSE_REPERE_MONTRE)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(res.element?.classList.contains(CLASSE_REPERE_MONTRE)).toBe(false);
  });
});

describe('montrer — mode « guider »', () => {
  it('le focus est sur le contrôle, après défilement', async () => {
    const saisie = document.getElementById('saisie-usager') as HTMLInputElement;
    saisie.focus();
    const defilement = vi.fn();
    const cible = document.querySelector<HTMLElement>(
      '[data-repere="t.elements.clic.popup-mode"]'
    )!;
    cible.scrollIntoView = defilement;

    const res = await montrer('t.elements.clic.popup-mode', {
      registre: REGISTRE,
      adaptateur: adaptateur({ coucheActive: true }),
      mode: 'guider',
    });

    expect(res.ok).toBe(true);
    expect(document.activeElement).toBe(cible);
    expect(defilement).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    expect(region()?.textContent).toContain('Comportement au clic');
  });

  it('une zone non focalisable reçoit tabindex="-1" pour prendre le focus', async () => {
    const registre: RegistreReperes = {
      ...REGISTRE,
      reperes: [...REGISTRE.reperes],
    };
    const zone = document.querySelector<HTMLElement>('[data-zone="t.couches"]')!;
    const a = adaptateur({ coucheActive: true });
    a.reveler = async () => zone;
    await montrer('t.couches', { registre, adaptateur: a, mode: 'guider' });
    expect(zone.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(zone);
  });
});

describe('montrer — prérequis manquant', () => {
  it('révèle d’abord le repère qui le lève, avec le message du prérequis', async () => {
    const etat: Etat = { coucheActive: false };
    const a = adaptateur(etat);

    const res = await montrer('t.elements.clic.popup-mode', {
      registre: REGISTRE,
      adaptateur: a,
      mode: 'dire',
    });

    expect(a.reveles).toEqual(['t.couches.liste']);
    expect(res).toMatchObject({ ok: false, raison: 'prerequis', prerequis: 'couche-active' });
    expect(res.element).toBe(document.querySelector('[data-repere="t.couches.liste"]'));
    expect(res.chemin).toEqual(['Couches de données', 'Liste des couches']);
    expect(res.element?.classList.contains(CLASSE_REPERE_MONTRE)).toBe(true);
    expect(region()?.textContent).toContain(PREREQUIS['couche-active'].message);

    // Puis on reprend : l'état a changé, l'appelant rappelle montrer.
    etat.coucheActive = true;
    const reprise = await montrer('t.elements.clic.popup-mode', {
      registre: REGISTRE,
      adaptateur: a,
      mode: 'dire',
    });
    expect(reprise.ok).toBe(true);
    expect(a.reveles).toEqual(['t.couches.liste', 't.elements.clic.popup-mode']);
    expect(res.element?.classList.contains(CLASSE_REPERE_MONTRE)).toBe(false);
  });
});

describe('montrer — inconnu et introuvable', () => {
  it('un id absent du registre ne touche pas au DOM', async () => {
    const a = adaptateur({ coucheActive: true });
    const res = await montrer('t.absent.du-registre', { registre: REGISTRE, adaptateur: a });
    expect(res).toEqual({ ok: false, element: null, chemin: [], raison: 'inconnu' });
    expect(a.reveles).toEqual([]);
    expect(region()).toBeNull();
  });

  it('un id hors grammaire est inconnu, même présent dans le registre', async () => {
    const registre: RegistreReperes = {
      ...REGISTRE,
      reperes: [repere({ id: 't.a"]', genre: 'controle', libelle: 'Piège' })],
    };
    const a = adaptateur({ coucheActive: true });
    const res = await montrer('t.a"]', { registre, adaptateur: a });
    expect(res.raison).toBe('inconnu');
    expect(a.reveles).toEqual([]);
  });

  it('registre ok mais DOM absent → introuvable', async () => {
    const a = adaptateur({ coucheActive: true });
    a.reveler = async () => null;
    const res = await montrer('t.couches.liste', { registre: REGISTRE, adaptateur: a });
    expect(res).toMatchObject({ ok: false, element: null, raison: 'introuvable' });
    expect(res.chemin).toEqual(['Couches de données', 'Liste des couches']);
  });
});

describe('montrer — surbrillance rejouée après un re-rendu (innerHTML)', () => {
  /** Réécrit la zone Couches comme une app qui re-rend son panneau. */
  function rerendreCouches(): void {
    const zone = document.querySelector<HTMLElement>('[data-zone="t.couches"]')!;
    zone.innerHTML = `<h2>Couches de données</h2>
      <select data-repere="t.couches.liste" aria-label="Liste des couches"><option>B</option></select>`;
  }
  const liste = () => document.querySelector<HTMLElement>('[data-repere="t.couches.liste"]')!;
  const microtaches = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  it('le nouvel élément du même repère reprend la surbrillance, sans voler le focus', async () => {
    const saisie = document.getElementById('saisie-usager') as HTMLInputElement;
    saisie.focus();
    const res = await montrer('t.couches.liste', {
      registre: REGISTRE,
      adaptateur: adaptateur({ coucheActive: true }),
      mode: 'dire',
    });
    const ancien = res.element!;
    rerendreCouches();
    const nouveau = liste();
    expect(nouveau).not.toBe(ancien);
    await vi.waitFor(() => expect(nouveau.classList.contains(CLASSE_REPERE_MONTRE)).toBe(true));
    expect(document.querySelectorAll(`.${CLASSE_REPERE_MONTRE}`).length).toBe(1);
    expect(document.activeElement).toBe(saisie);

    // Un second re-rendu est rejoué lui aussi, une fois.
    rerendreCouches();
    await vi.waitFor(() => expect(liste().classList.contains(CLASSE_REPERE_MONTRE)).toBe(true));
    expect(document.querySelectorAll(`.${CLASSE_REPERE_MONTRE}`).length).toBe(1);
  });

  it('re-rendu entre la révélation et la surbrillance : le nouvel élément est surligné et rendu', async () => {
    const a = adaptateur({ coucheActive: true });
    a.reveler = async () => {
      const ancien = liste();
      rerendreCouches();
      return ancien;
    };
    const res = await montrer('t.couches.liste', {
      registre: REGISTRE,
      adaptateur: a,
      mode: 'dire',
    });
    expect(res.element).toBe(liste());
    expect(res.element?.isConnected).toBe(true);
    expect(res.element?.classList.contains(CLASSE_REPERE_MONTRE)).toBe(true);
  });

  it('« guider » : le focus suit le contrôle rejoué, sauf si l’usager l’a déplacé', async () => {
    await montrer('t.couches.liste', {
      registre: REGISTRE,
      adaptateur: adaptateur({ coucheActive: true }),
      mode: 'guider',
    });
    rerendreCouches();
    await vi.waitFor(() => expect(document.activeElement).toBe(liste()));

    const saisie = document.getElementById('saisie-usager') as HTMLInputElement;
    saisie.focus();
    rerendreCouches();
    await vi.waitFor(() => expect(liste().classList.contains(CLASSE_REPERE_MONTRE)).toBe(true));
    expect(document.activeElement).toBe(saisie);
  });

  it('aucun rejeu après la fin de la mise en évidence, ni après effacement', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await montrer('t.couches.liste', {
      registre: REGISTRE,
      adaptateur: adaptateur({ coucheActive: true }),
      mode: 'dire',
    });
    vi.advanceTimersByTime(DUREE_SURBRILLANCE_MS);
    rerendreCouches();
    await microtaches();
    expect(document.querySelectorAll(`.${CLASSE_REPERE_MONTRE}`).length).toBe(0);

    vi.useRealTimers();
    await montrer('t.couches.liste', {
      registre: REGISTRE,
      adaptateur: adaptateur({ coucheActive: true }),
      mode: 'dire',
    });
    effacerSurbrillance();
    rerendreCouches();
    await microtaches();
    expect(document.querySelectorAll(`.${CLASSE_REPERE_MONTRE}`).length).toBe(0);
  });

  it('un repère absent du nouveau rendu n’est pas surligné ailleurs ; il l’est s’il revient', async () => {
    await montrer('t.couches.liste', {
      registre: REGISTRE,
      adaptateur: adaptateur({ coucheActive: true }),
      mode: 'dire',
    });
    const zone = document.querySelector<HTMLElement>('[data-zone="t.couches"]')!;
    zone.innerHTML = '<p>Chargement…</p>';
    await microtaches();
    expect(document.querySelectorAll(`.${CLASSE_REPERE_MONTRE}`).length).toBe(0);
    rerendreCouches();
    await vi.waitFor(() => expect(liste().classList.contains(CLASSE_REPERE_MONTRE)).toBe(true));
  });
});

describe('montrer — prefers-reduced-motion', () => {
  it('sans préférence : classe d’animation posée', async () => {
    const res = await montrer('t.couches.liste', {
      registre: REGISTRE,
      adaptateur: adaptateur({ coucheActive: true }),
      mode: 'dire',
    });
    expect(res.element?.classList.contains(CLASSE_REPERE_ANIME)).toBe(true);
  });

  it('reduced-motion : aucune classe d’animation, défilement instantané', async () => {
    simulerMouvementReduit(true);
    const cible = document.querySelector<HTMLElement>('[data-repere="t.couches.liste"]')!;
    const defilement = vi.fn();
    cible.scrollIntoView = defilement;

    for (const mode of ['dire', 'guider'] as const) {
      const res = await montrer('t.couches.liste', {
        registre: REGISTRE,
        adaptateur: adaptateur({ coucheActive: true }),
        mode,
      });
      expect(res.element?.classList.contains(CLASSE_REPERE_MONTRE)).toBe(true);
      expect(res.element?.classList.contains(CLASSE_REPERE_ANIME)).toBe(false);
      expect(document.querySelectorAll(`.${CLASSE_REPERE_ANIME}`).length).toBe(0);
    }
    expect(defilement).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
  });

  it('la feuille de styles coupe animation et transition sous reduce', async () => {
    await montrer('t.couches.liste', {
      registre: REGISTRE,
      adaptateur: adaptateur({ coucheActive: true }),
    });
    const css = [...document.querySelectorAll('style[data-reperage]')]
      .map((s) => s.textContent ?? '')
      .join('');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('animation: none');
  });
});

// ─── Préférence de mode ────────────────────────────────────────────────

describe('préférence de mode dans TourState', () => {
  it('« guider » par défaut', () => {
    expect(getReperageMode()).toBe('guider');
  });

  it('setReperageMode mémorise dans TourState sans toucher au reste', () => {
    setReperageMode('guider');
    expect(getReperageMode()).toBe('guider');
    const state = getToursState();
    expect(state.reperageMode).toBe('guider');
    expect(state.tours).toEqual({});
    const brut = JSON.parse(localStorage.getItem(STORAGE_KEYS.TOURS) ?? '{}');
    expect(brut.reperageMode).toBe('guider');
  });

  it('une valeur hors union est ignorée à la lecture', () => {
    localStorage.setItem(STORAGE_KEYS.TOURS, JSON.stringify({ reperageMode: 'crier', tours: {} }));
    expect(getToursState().reperageMode).toBeUndefined();
    expect(getReperageMode()).toBe('guider');
  });

  it('montrer sans mode applique le mode mémorisé', async () => {
    setReperageMode('guider');
    const cible = document.querySelector<HTMLElement>('[data-repere="t.couches.liste"]')!;
    cible.scrollIntoView = vi.fn();
    await montrer('t.couches.liste', {
      registre: REGISTRE,
      adaptateur: adaptateur({ coucheActive: true }),
    });
    expect(document.activeElement).toBe(cible);
  });
});

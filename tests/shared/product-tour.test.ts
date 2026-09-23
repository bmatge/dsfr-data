/**
 * Visites guidées exprimées en repères (#1013, ADR-143) : une étape par
 * `repere` est RÉVÉLÉE par l'adaptateur de l'app avant d'être affichée ; sans
 * adaptateur, le repère est cherché dans le DOM ; `selector` reste un repli.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resoudreEtape,
  startTour,
  trouverRepere,
  type RevelateurVisite,
  type TourConfig,
} from '../../packages/shared/src/ui/product-tour';
import {
  BUILDER_CARTO_TOUR,
  DASHBOARD_TOUR,
  SOURCES_TOUR,
  PIPELINE_TOUR,
  PLAYGROUND_TOUR,
} from '../../packages/shared/src/tour/tour-configs';
import { BUILDER_TOUR } from '../../apps/builder/src/ui/tour';
import { REPERES as REPERES_BUILDER } from '../../apps/builder/src/assistant/reperes.generated';
import { REPERES as REPERES_CARTO } from '../../apps/builder-carto/src/assistant/reperes.generated';
import { REPERES as REPERES_DASHBOARD } from '../../apps/dashboard/src/assistant/reperes.generated';
import { REPERES as REPERES_SOURCES } from '../../apps/sources/src/assistant/reperes.generated';
import { REPERES as REPERES_PIPELINE } from '../../apps/pipeline-helper/src/assistant/reperes.generated';
import { REPERES as REPERES_PLAYGROUND } from '../../apps/playground/src/assistant/reperes.generated';

function popover(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.tour-popover');
}

function titreAffiche(): string | null | undefined {
  const p = popover();
  return p?.style.display === 'block' ? p.querySelector('.tour-popover-title')?.textContent : null;
}

function fermerVisite(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = `
    <section data-zone="demo.panneau" hidden>
      <button data-repere="demo.panneau.valider">Valider</button>
    </section>
    <div id="repli">Repli</div>`;
});

afterEach(() => {
  fermerVisite();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('trouverRepere', () => {
  it('résout un contrôle par data-repere et une zone par data-zone', () => {
    expect(trouverRepere('demo.panneau.valider')?.textContent).toBe('Valider');
    expect(trouverRepere('demo.panneau')?.tagName).toBe('SECTION');
    expect(trouverRepere('demo.absent')).toBeNull();
  });

  it("n'interprète jamais l'identifiant comme un sélecteur", () => {
    expect(trouverRepere('"], #repli, [x="')).toBeNull();
  });
});

describe('resoudreEtape', () => {
  const etape = { title: 't', description: 'd' };

  it("par repère, avec adaptateur : c'est l'adaptateur qui révèle", async () => {
    const section = document.querySelector<HTMLElement>('[data-zone="demo.panneau"]')!;
    const reveler = vi.fn(async (id: string) => {
      section.hidden = false; // ouvre le panneau, comme openSection
      return trouverRepere(id);
    });
    const cible = await resoudreEtape({ ...etape, repere: 'demo.panneau.valider' }, { reveler });
    expect(reveler).toHaveBeenCalledWith('demo.panneau.valider');
    expect(section.hidden).toBe(false);
    expect(cible?.textContent).toBe('Valider');
  });

  it("l'adaptateur qui ne peut pas montrer (null ou erreur) fait sauter l'étape", async () => {
    const nul: RevelateurVisite = { reveler: async () => null };
    const casse: RevelateurVisite = {
      reveler: async () => {
        throw new Error('panne');
      },
    };
    expect(await resoudreEtape({ ...etape, repere: 'demo.panneau' }, nul)).toBeNull();
    expect(await resoudreEtape({ ...etape, repere: 'demo.panneau' }, casse)).toBeNull();
  });

  it('sans adaptateur, le repère est cherché dans le DOM ; selector en repli', async () => {
    expect((await resoudreEtape({ ...etape, repere: 'demo.panneau' }))?.tagName).toBe('SECTION');
    expect((await resoudreEtape({ ...etape, repere: 'demo.absent', selector: '#repli' }))?.id).toBe(
      'repli'
    );
    expect((await resoudreEtape({ ...etape, selector: '#repli' }))?.id).toBe('repli');
    expect(await resoudreEtape({ ...etape })).toBeNull();
  });
});

describe('startTour : révéler avant d’afficher', () => {
  it("une étape par repère révèle d'abord, puis affiche l'étape sur l'élément révélé", async () => {
    const journal: string[] = [];
    const section = document.querySelector<HTMLElement>('[data-zone="demo.panneau"]')!;
    const tour: TourConfig = {
      id: 'demo',
      steps: [{ repere: 'demo.panneau.valider', title: 'Valider', description: 'd' }],
      adaptateur: {
        reveler: async (id) => {
          journal.push(`reveler ${id} (popover visible : ${popover()?.style.display === 'block'})`);
          section.hidden = false;
          return trouverRepere(id);
        },
      },
    };
    startTour(tour);
    await vi.waitFor(() => expect(titreAffiche()).toBe('Valider'), { timeout: 2000 });
    expect(journal).toEqual(['reveler demo.panneau.valider (popover visible : false)']);
    expect(section.hidden).toBe(false);
  });

  it("une étape que l'adaptateur ne peut pas montrer est sautée", async () => {
    const tour: TourConfig = {
      id: 'demo-saut',
      steps: [
        { repere: 'demo.absent', title: 'Absente', description: 'd' },
        { repere: 'demo.panneau', title: 'Panneau', description: 'd' },
      ],
      adaptateur: { reveler: async (id) => trouverRepere(id) },
    };
    startTour(tour);
    await vi.waitFor(() => expect(titreAffiche()).toBe('Panneau'), { timeout: 2000 });
  });
});

describe('visites des apps à registre (#1013)', () => {
  const cas: [string, TourConfig, readonly { id: string }[]][] = [
    ['builder', BUILDER_TOUR, REPERES_BUILDER],
    ['carto', BUILDER_CARTO_TOUR, REPERES_CARTO],
    ['dashboard', DASHBOARD_TOUR, REPERES_DASHBOARD],
    ['sources', SOURCES_TOUR, REPERES_SOURCES],
    ['pipeline', PIPELINE_TOUR, REPERES_PIPELINE],
    ['playground', PLAYGROUND_TOUR, REPERES_PLAYGROUND],
  ];
  for (const [nom, tour, registre] of cas) {
    it(`${nom} : chaque étape cite un repère du registre, aucun sélecteur`, () => {
      const ids = new Set(registre.map((r) => r.id));
      for (const step of tour.steps) {
        expect(step.selector, step.title).toBeUndefined();
        expect(ids.has(step.repere ?? ''), `${step.title} : ${step.repere}`).toBe(true);
      }
    });
  }

  it("le builder porte son adaptateur : il ouvre la section repliée de l'étape", () => {
    expect(BUILDER_TOUR.adaptateur).toBeDefined();
  });
});

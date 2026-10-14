/**
 * #1305 — pagination serveur : pendant le chargement d'une page, le sablier
 * ne remplace que les lignes. La pagination reste en place, le bouton cliqué
 * reste dans le DOM et garde le focus ; le compte de résultats reste, et la
 * région live de l'afficheur annonce la page demandée.
 *
 * Avant : tout le corps de `dsfr-data-list` et de `dsfr-data-display` cédait
 * la place au sablier, pagination comprise — le bouton cliqué quittait le
 * DOM, et le focus clavier retombait en tête de page à chaque page.
 *
 * La hauteur (aucun saut de mise en page) se mesure dans un navigateur :
 * `e2e/pagination-serveur-chargement.spec.ts`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DsfrDataList } from '@/components/dsfr-data-list.js';
import { DsfrDataDisplay } from '@/components/dsfr-data-display.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataError,
  dispatchDataLoaded,
  dispatchDataLoading,
  setDataMeta,
} from '@/utils/data-bridge.js';

void DsfrDataList;
void DsfrDataDisplay;

const SOURCES: string[] = [];
function source(nom: string): string {
  const id = `p1305-${nom}-${SOURCES.length}`;
  SOURCES.push(id);
  return id;
}

afterEach(() => {
  document.body.replaceChildren();
  for (const id of SOURCES.splice(0)) {
    clearDataCache(id);
    clearDataMeta(id);
  }
  window.history.replaceState(null, '', window.location.pathname);
  vi.useRealTimers();
});

function texte(el: Element | null): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('style').forEach((s) => s.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const PAGE = (n: number) =>
  Array.from({ length: 3 }, (_, i) => ({ nom: `ligne-${(n - 1) * 3 + i + 1}` }));

/** Sert une page comme le ferait la source : meta posée avant l'émission. */
function servir(src: string, page: number): void {
  setDataMeta(src, { page, pageSize: 3, total: 15, serverSide: true });
  dispatchDataLoaded(src, PAGE(page));
}

type Hote = DsfrDataList | DsfrDataDisplay;

async function monterListe(src: string, urlSync = false): Promise<DsfrDataList> {
  const list = document.createElement('dsfr-data-list') as DsfrDataList;
  list.source = src;
  list.colonnes = 'nom:Nom';
  list.urlSync = urlSync;
  document.body.appendChild(list);
  await list.updateComplete;
  return list;
}

async function monterFiches(src: string, urlSync = false): Promise<DsfrDataDisplay> {
  const display = document.createElement('dsfr-data-display') as DsfrDataDisplay;
  display.source = src;
  display.urlSync = urlSync;
  display.innerHTML = '<template><p class="fiche">{{nom}}</p></template>';
  document.body.appendChild(display);
  await display.updateComplete;
  return display;
}

const CAS: Array<{
  nom: string;
  tag: 'dsfr-data-list' | 'dsfr-data-display';
  monter: (src: string, urlSync?: boolean) => Promise<Hote>;
  lignes: (el: Element) => string[];
}> = [
  {
    nom: 'dsfr-data-list',
    tag: 'dsfr-data-list',
    monter: monterListe,
    lignes: (el) => [...el.querySelectorAll('tbody tr')].map((r) => texte(r)),
  },
  {
    nom: 'dsfr-data-display',
    tag: 'dsfr-data-display',
    monter: monterFiches,
    lignes: (el) => [...el.querySelectorAll('.fiche')].map((f) => texte(f)),
  },
];

for (const cas of CAS) {
  describe(`#1305 — ${cas.nom} : changement de page serveur`, () => {
    const suivante = (el: Element) =>
      el.querySelector('.fr-pagination__link--next') as HTMLButtonElement;
    const compte = (el: Element) => el.querySelector('p[role="status"]');

    for (const urlSync of [false, true]) {
      it(`la pagination et le bouton cliqué restent, le focus aussi${
        urlSync ? ' (url-sync)' : ''
      }`, async () => {
        const src = source(`${cas.tag}-${urlSync}`);
        const el = await cas.monter(src, urlSync);
        servir(src, 3);
        await el.updateComplete;

        const bouton = suivante(el);
        bouton.focus();
        expect(document.activeElement).toBe(bouton);
        bouton.click();
        dispatchDataLoading(src);
        await el.updateComplete;

        // Le même bouton, toujours dans le DOM, toujours focalisé
        expect(bouton.isConnected).toBe(true);
        expect(suivante(el)).toBe(bouton);
        expect(document.activeElement).toBe(bouton);
        expect(bouton.disabled).toBe(false);
        // La pagination désigne la page demandée
        expect(texte(el.querySelector('[aria-current="page"]'))).toBe('4');
        // Le compte reste, le sablier n'occupe que la place des lignes
        expect(texte(compte(el))).toBe('15 résultats');
        expect(el.querySelector(`.${cas.tag}__loading`)).toBeNull();
        expect(texte(el.querySelector(`.${cas.tag}__page-loading`))).toBe(
          'Chargement de la page 4…'
        );
        const zone = el.querySelector(`.${cas.tag}__rows`)!;
        expect(zone.classList.contains(`${cas.tag}__rows--loading`)).toBe(true);
        expect(zone.getAttribute('aria-busy')).toBe('true');
        // Le sablier n'est pas une seconde région live
        expect(el.querySelector(`.${cas.tag}__page-loading`)!.hasAttribute('aria-live')).toBe(
          false
        );
        if (urlSync) expect(window.location.search).toContain('page=4');

        // La page arrive : ses lignes, plus de sablier, le focus n'a pas bougé
        servir(src, 4);
        await el.updateComplete;
        expect(cas.lignes(el)).toEqual(['ligne-10', 'ligne-11', 'ligne-12']);
        expect(el.querySelector(`.${cas.tag}__page-loading`)).toBeNull();
        expect(zone.isConnected).toBe(true);
        expect(zone.hasAttribute('aria-busy')).toBe(false);
        expect(document.activeElement).toBe(bouton);

        // Entrée de nouveau : la page d'après
        bouton.click();
        dispatchDataLoading(src);
        await el.updateComplete;
        expect(document.activeElement).toBe(bouton);
        servir(src, 5);
        await el.updateComplete;
        expect(cas.lignes(el)).toEqual(['ligne-13', 'ligne-14', 'ligne-15']);
      });
    }

    it('la région live annonce la page demandée', async () => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
      const src = source(`${cas.tag}-annonce`);
      const el = await cas.monter(src);
      servir(src, 3);
      await el.updateComplete;
      suivante(el).click();
      dispatchDataLoading(src);
      vi.advanceTimersToNextFrame();
      await el.updateComplete;
      expect(texte(el.querySelector('.fr-sr-only[aria-live]'))).toBe('Page 4 sur 5');
    });

    it('un chargement qui n’est pas un changement de page garde le sablier seul', async () => {
      const src = source(`${cas.tag}-rafraichi`);
      const el = await cas.monter(src);
      servir(src, 3);
      await el.updateComplete;
      dispatchDataLoading(src);
      await el.updateComplete;
      expect(el.querySelector(`.${cas.tag}__loading`)).not.toBeNull();
      expect(el.querySelector('.fr-pagination')).toBeNull();
    });

    it('la page demandée refusée : la page précédente revient, dite comme avant (#1288)', async () => {
      const src = source(`${cas.tag}-refus`);
      const el = await cas.monter(src);
      servir(src, 3);
      await el.updateComplete;
      suivante(el).click();
      dispatchDataLoading(src);
      await el.updateComplete;
      dispatchDataError(src, new Error('HTTP 503: Service Unavailable'));
      await el.updateComplete;
      expect(cas.lignes(el)).toEqual(['ligne-7', 'ligne-8', 'ligne-9']);
      expect(el.querySelector(`.${cas.tag}__page-loading`)).toBeNull();
      expect(
        texte(el.querySelector('.dsfr-data-status--page-error .dsfr-data-status__title'))
      ).toBe('La page 4 n’a pas pu être chargée. Vous consultez toujours la page 3.');
    });
  });
}

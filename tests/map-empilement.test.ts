import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Empilement de la carte : QUI passe au-dessus de QUI.
 *
 * CE FICHIER EXISTE A CAUSE D'UN DEFAUT REEL. Sur une carte portant a la fois
 * `tiles-switcher` et un popup en `mode="panel-*"`, le selecteur « Fond de
 * carte » se dessinait PAR-DESSUS le volet lateral, dont il masquait le titre
 * et les premieres lignes.
 *
 * La cause n'est pas une valeur de z-index mal choisie — elles etaient deja
 * dans le bon ordre (volet 1001, selecteur 1000). C'est que les deux ne
 * concouraient pas dans le meme contexte d'empilement :
 *
 *   dsfr-data-map                      (position: relative)
 *   ├── .dsfr-data-map__tiles-switcher (absolute, z-index 1000)
 *   └── .dsfr-data-map__container      (position:relative pose par Leaflet)
 *       └── .dsfr-data-map-popup__panel (absolute, z-index 1001)
 *
 * Un `z-index: 0` sur le conteneur en faisait un contexte d'empilement : tout
 * son sous-arbre s'y trouvait scelle et passait EN BLOC sous le selecteur,
 * quelle que soit la valeur du volet. Aucun z-index de descendant ne pouvait
 * rattraper cela — d'ou un test sur la STRUCTURE et pas seulement sur l'ordre
 * des nombres.
 *
 * Contrepartie MESUREE dans un navigateur (empilement reel lu par
 * `elementFromPoint`) : `e2e/layout-map.spec.ts`. Ici on lit le texte des
 * feuilles injectees — happy-dom ne calcule aucune mise en page.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMap } from '@/components/dsfr-data-map.js';
import { DsfrDataMapPopup } from '@/components/dsfr-data-map-popup.js';

if (!customElements.get('dsfr-data-map')) customElements.define('dsfr-data-map', DsfrDataMap);

/** Vue interne de la carte (membres prives pilotes par les tests). */
interface MapInternals {
  _injectStyles: () => void;
}

/** Corps de la regle dont le selecteur est EXACTEMENT `selecteur`. */
function corpsDeRegle(css: string, selecteur: string): string {
  const echappe = selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bloc = new RegExp(`(?:^|\\n)\\s*${echappe}\\s*\\{([^}]*)\\}`).exec(css);
  expect(bloc, `regle « ${selecteur} » absente de la feuille injectee`).not.toBeNull();
  return bloc![1];
}

/** z-index declare dans un corps de regle (null s'il n'y en a pas). */
function zIndexDe(corps: string): number | null {
  const z = /z-index:\s*(-?\d+)/.exec(corps);
  return z ? Number(z[1]) : null;
}

function feuilleCarte(): string {
  const map = document.createElement('dsfr-data-map') as DsfrDataMap;
  (map as unknown as MapInternals)._injectStyles();
  return document.querySelector('style[data-dsfr-data-map]')?.textContent ?? '';
}

function feuillePopup(): string {
  const popup = new DsfrDataMapPopup();
  const mapEl = document.createElement('dsfr-data-map');
  const container = document.createElement('div');
  container.className = 'dsfr-data-map__container';
  mapEl.appendChild(container);
  document.body.appendChild(mapEl);
  mapEl.appendChild(popup);
  popup.mode = 'panel-right';
  popup.showForRecord({ nom: 'Saint-Pee-sur-Nivelle' });
  return document.querySelector('style[data-dsfr-map-popup]')?.textContent ?? '';
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.head
    .querySelectorAll('style[data-dsfr-data-map], style[data-dsfr-map-popup]')
    .forEach((n) => n.remove());
});

describe('empilement de la carte', () => {
  it('le conteneur Leaflet ne declare AUCUN z-index', () => {
    // LE test de ce fichier. Leaflet pose `position: relative` en style en
    // ligne sur ce conteneur : la moindre valeur de z-index autre que `auto`
    // en ferait un contexte d'empilement, et rescellerait tout le sous-arbre
    // de la carte sous le mobilier flottant.
    const corps = corpsDeRegle(feuilleCarte(), '.dsfr-data-map__container');

    expect(
      zIndexDe(corps),
      'un z-index ici rescelle le volet lateral sous le selecteur'
    ).toBeNull();
  });

  it("l'hote porte la frontiere d'empilement", () => {
    // La frontiere n'a pas disparu, elle a remonte d'un cran : sans elle, le
    // selecteur et le bandeau max-items (1000) sortiraient de la carte et
    // pourraient recouvrir l'en-tete de la page qui l'accueille.
    const corps = corpsDeRegle(feuilleCarte(), 'dsfr-data-map');

    expect(corps).toMatch(/isolation:\s*isolate/);
  });

  it('le volet lateral passe AU-DESSUS du mobilier flottant', () => {
    const carte = feuilleCarte();
    const zVolet = zIndexDe(corpsDeRegle(feuillePopup(), '.dsfr-data-map-popup__panel'));
    const mobilier = [
      '.dsfr-data-map__tiles-switcher',
      '.dsfr-data-map__fullscreen',
      '.dsfr-data-map__max-items-banner',
    ];

    expect(zVolet).not.toBeNull();
    for (const selecteur of mobilier) {
      const z = zIndexDe(corpsDeRegle(carte, selecteur));
      expect(z, `${selecteur} ne declare pas de z-index`).not.toBeNull();
      expect(z!, `${selecteur} doit rester sous le volet (${zVolet})`).toBeLessThan(zVolet!);
    }
  });
});

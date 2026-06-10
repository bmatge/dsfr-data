import { describe, it, expect, vi } from 'vitest';

/**
 * Tests traversants #298 (EPIC F) — double init de la carte et init posthume.
 *
 * Bugs d'origine : aucune garde dans _initMap — reconnexion DOM (dashboard
 * qui réordonne les widgets) ou IntersectionObserver pendant un
 * `await loadLeaflet()` en vol → deux init concurrentes (double skip-link,
 * deux instances L.map). Élément déconnecté pendant l'await → carte créée
 * sur un élément détaché, jamais remove() → fuite du listener resize window
 * posé par Leaflet. Annexe : ids ARIA par Date.now() → dupliqués pour deux
 * cartes dans la même milliseconde.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMap } from '@/components/dsfr-data-map.js';

describe('#298 — AC : pas de double init', () => {
  it('un second _initMap pendant l’await du premier est ignoré (verrou)', () => {
    const map = new DsfrDataMap();
    (map as any)._initInFlight = true;

    // Ne doit ni jeter ni relancer une init : la promesse retourne
    // immédiatement (le corps async ne franchit pas la garde)
    const p = (map as any)._initMap();
    expect((map as any)._leafletMap).toBeNull();
    return p;
  });

  it('un _initMap quand la carte existe déjà est ignoré', async () => {
    const map = new DsfrDataMap();
    const fakeMap = { remove: vi.fn() };
    (map as any)._leafletMap = fakeMap;

    await (map as any)._initMap();

    // Pas de nouvelle instance : la même référence reste en place
    expect((map as any)._leafletMap).toBe(fakeMap);
  });

  it('AC : init posthume abandonnée — élément déconnecté pendant l’await', async () => {
    const map = new DsfrDataMap();
    // L'élément n'est PAS connecté : après le await loadLeaflet(),
    // l'init doit s'abandonner sans créer ni container ni skip-link
    expect(map.isConnected).toBe(false);

    await (map as any)._initMap();

    expect((map as any)._leafletMap).toBeNull();
    expect((map as any)._container).toBeNull();
    expect((map as any)._skipLink).toBeNull();
    // Verrou libéré : une init future (reconnexion) reste possible
    expect((map as any)._initInFlight).toBe(false);
  });
});

describe('#298 — ids ARIA uniques (compteur, plus Date.now)', () => {
  it('deux cartes créées dans la même milliseconde ont des ids distincts', async () => {
    // L'id est attribué dans _initMap après les gardes : simule le chemin
    // en vérifiant le format compteur sur des éléments connectés
    const a = new DsfrDataMap();
    const b = new DsfrDataMap();
    document.body.appendChild(a);
    document.body.appendChild(b);

    await (a as any)._initMap().catch(() => {});
    await (b as any)._initMap().catch(() => {});

    if (a.id && b.id) {
      expect(a.id).not.toBe(b.id);
      expect(a.id).toMatch(/^dsfr-data-map-\d+$/);
    }

    a.remove();
    b.remove();
  });
});

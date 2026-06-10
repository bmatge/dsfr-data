import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Tests traversants #296 (EPIC F) — dsfr-data-map-popup : fuites et contrat.
 *
 * Bugs d'origine :
 * - listener keydown retiré uniquement via Escape → fermeture par bouton ou
 *   overlay = handler empilé sur document pour toujours ;
 * - setTimeout(200) de _removePanel non annulé → réouverture < 200 ms = le
 *   panneau frais supprimé avec son contenu ;
 * - contrat contradictoire : la docstring dit « enfant de la carte, sans
 *   for » et matchesLayer() matche tout si for vide, mais le layer exigeait
 *   popup.for truthy → l'exemple documenté ne fonctionnait pas ;
 * - aria-modal sans focus trap réel, focus non rendu au déclencheur (RGAA).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMapPopup } from '@/components/dsfr-data-map-popup.js';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';

afterEach(() => {
  document.querySelectorAll('.dsfr-data-map-popup__modal-overlay').forEach((el) => el.remove());
  vi.useRealTimers();
});

describe('#296 — AC : pas de listener résiduel après 10 ouvertures/fermetures', () => {
  it('chaque addEventListener keydown sur document a son remove', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const popup = new DsfrDataMapPopup();
    popup.mode = 'modal';

    for (let i = 0; i < 10; i++) {
      popup.showForRecord({ nom: `record-${i}` });
      // Fermeture par le BOUTON (pas Escape) — le chemin qui fuyait
      popup.close();
    }

    const keydownAdds = addSpy.mock.calls.filter(([type]) => type === 'keydown').length;
    const keydownRemoves = removeSpy.mock.calls.filter(([type]) => type === 'keydown').length;
    expect(keydownAdds).toBe(10);
    expect(keydownRemoves).toBe(10);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe('#296 — réouverture < 200 ms : le panneau frais survit', () => {
  it('le timer de _removePanel est annulé par la réouverture', () => {
    vi.useFakeTimers();
    const mapEl = document.createElement('dsfr-data-map');
    const popup = new DsfrDataMapPopup();
    popup.mode = 'panel-right';
    mapEl.appendChild(popup);

    popup.showForRecord({ nom: 'premier' });
    expect((popup as any)._panelEl).not.toBeNull();

    popup.close(); // timer de suppression à 200 ms armé

    // Réouverture immédiate (< 200 ms)
    popup.showForRecord({ nom: 'second' });

    // Le timer de l'ancienne fermeture ne doit PAS supprimer le panneau frais
    vi.advanceTimersByTime(250);

    expect((popup as any)._panelEl).not.toBeNull();
    expect((popup as any)._panelEl.innerHTML).toContain('second');
  });
});

describe('#296 — AC : l’exemple documenté (popup enfant de la carte, sans for) fonctionne', () => {
  it('le layer trouve un popup au niveau carte SANS attribut for', () => {
    const mapEl = document.createElement('dsfr-data-map');
    const layer = new DsfrDataMapLayer();
    layer.id = 'ma-couche';
    const popup = new DsfrDataMapPopup();
    // PAS de for : matchesLayer() matche tout (contrat de la docstring)
    mapEl.appendChild(layer);
    mapEl.appendChild(popup);
    (layer as any)._mapParent = mapEl;

    const companion = (layer as any)._findPopupCompanion();
    expect(companion).toBe(popup);
  });

  it('un popup avec for ne matche que sa couche', () => {
    const mapEl = document.createElement('dsfr-data-map');
    const layer = new DsfrDataMapLayer();
    layer.id = 'couche-a';
    const popup = new DsfrDataMapPopup();
    popup.for = 'couche-b';
    mapEl.appendChild(layer);
    mapEl.appendChild(popup);
    (layer as any)._mapParent = mapEl;

    expect((layer as any)._findPopupCompanion()).toBeNull();
  });
});

describe('#296 — AC : focus trap réel + restitution du focus (RGAA)', () => {
  it('Tab depuis le dernier focusable boucle sur le premier', () => {
    const popup = new DsfrDataMapPopup();
    popup.mode = 'modal';
    popup.showForRecord({ nom: 'test' });

    const modal = (popup as any)._modalEl as HTMLElement;
    expect(modal.getAttribute('aria-modal')).toBe('true');

    const closeBtn = modal.querySelector('.dsfr-data-map-popup__modal-close') as HTMLElement;
    closeBtn.focus();

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    modal.dispatchEvent(tab);

    // Seul focusable : le trap reboucle dessus (l'évènement est consommé)
    expect(tab.defaultPrevented).toBe(true);

    popup.close();
  });

  it('le focus revient au déclencheur à la fermeture', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const popup = new DsfrDataMapPopup();
    popup.mode = 'modal';
    popup.showForRecord({ nom: 'test' });
    popup.close();

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

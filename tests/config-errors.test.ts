import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests traversants #283 (EPIC C) — erreurs de configuration : source et
 * a11y alignés sur reportConfigError.
 *
 * Bugs d'origine :
 * - getAdapter() THROW pour un api-type inconnu, appelé hors try dans
 *   _fetchViaAdapter via setTimeout sans catch → unhandled rejection, aucun
 *   dsfr-data-error, consommateurs gelés en loading. Le check if (!adapter)
 *   était du code mort ;
 * - toutes les erreurs de config de la source étaient des console.warn muets
 *   pour l'aval (id manquant, validate échoué) — seul composant sans
 *   reportConfigError ;
 * - dsfr-data-a11y : cible `for` introuvable → silence total, pas de retry
 *   si la cible apparaît après — la fonctionnalité centrale du composant
 *   pouvait silencieusement ne pas s'appliquer.
 *
 * AC : api-type="typo" → erreur visible aval + attribut
 * data-dsfr-config-error ; a11y posé avant sa cible fonctionne.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataA11y } from '@/components/dsfr-data-a11y.js';
import { getAdapter } from '@/adapters/adapter-registry.js';
import { clearDataCache, clearDataMeta, subscribeToSource } from '@/utils/data-bridge.js';

describe('#283 — registre : api-type inconnu retourne null (plus de throw)', () => {
  it('getAdapter("typo") retourne null', () => {
    expect(getAdapter('typo')).toBeNull();
  });

  it('les types connus restent servis', () => {
    expect(getAdapter('opendatasoft')).not.toBeNull();
    expect(getAdapter('tabular')).not.toBeNull();
    expect(getAdapter('grist')).not.toBeNull();
    expect(getAdapter('insee')).not.toBeNull();
    expect(getAdapter('generic')).not.toBeNull();
  });
});

describe('#283 — AC : api-type="typo" → erreur visible aval + data-dsfr-config-error', () => {
  let source: DsfrDataSource;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearDataCache('c4-src');
    clearDataMeta('c4-src');
    source = new DsfrDataSource();
    source.id = 'c4-src';
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockReset();
  });

  afterEach(() => {
    (source as any)._cleanup();
    errorSpy.mockRestore();
  });

  it('le fetch ne jette plus : reportConfigError + dsfr-data-error émis', async () => {
    source.apiType = 'typo';
    source.datasetId = 'whatever';

    const errors: Error[] = [];
    const unsub = subscribeToSource('c4-src', {
      onError: (e: Error) => errors.push(e),
    });

    // Avant le fix : getAdapter throw hors try → unhandled rejection,
    // aucun événement aval
    await (source as any)._fetchViaAdapter();

    expect(source.getAttribute('data-dsfr-config-error')).toMatch(/typo/);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/typo/);

    unsub();
  });

  it('source.getAdapter() retourne null pour un api-type inconnu (plus de throw)', () => {
    source.apiType = 'typo';
    expect(() => source.getAdapter()).not.toThrow();
    expect(source.getAdapter()).toBeNull();
  });

  it('validation échouée : reportConfigError + dsfr-data-error (plus de warn muet)', async () => {
    source.apiType = 'opendatasoft';
    // dataset-id manquant → validate échoue

    const errors: Error[] = [];
    const unsub = subscribeToSource('c4-src', {
      onError: (e: Error) => errors.push(e),
    });

    await (source as any)._fetchViaAdapter();

    expect(source.hasAttribute('data-dsfr-config-error')).toBe(true);
    expect(errors).toHaveLength(1);

    unsub();
  });

  it("id manquant : reportConfigError posé sur l'élément", async () => {
    source.id = '';
    source.apiType = 'opendatasoft';

    await (source as any)._fetchViaAdapter();

    expect(source.getAttribute('data-dsfr-config-error')).toMatch(/id/);
  });

  it("l'erreur de config est levée quand la config redevient valide", async () => {
    source.apiType = 'typo';
    await (source as any)._fetchViaAdapter();
    expect(source.hasAttribute('data-dsfr-config-error')).toBe(true);

    // generic + base-url est un piege signale depuis #288 : la config
    // valide utilise un vrai adapter
    source.apiType = 'tabular';
    source.resource = 'res-123';
    (source as any)._adapter = null;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ a: 1 }], meta: { total: 1 }, links: {} }),
      headers: { get: () => 'application/json' },
    });
    await (source as any)._fetchViaAdapter();

    expect(source.hasAttribute('data-dsfr-config-error')).toBe(false);
  });
});

describe('#283 — AC : a11y posé avant sa cible fonctionne', () => {
  let a11y: DsfrDataA11y;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    clearDataCache('c4-a11y-data');
  });

  afterEach(() => {
    a11y?.remove();
    errorSpy.mockRestore();
  });

  it('cible introuvable au montage : signalée puis appliquée quand elle apparaît', async () => {
    a11y = new DsfrDataA11y();
    a11y.id = 'c4-a11y';
    a11y.for = 'c4-cible-tardive';
    a11y.source = 'c4-a11y-data';
    document.body.appendChild(a11y);
    await a11y.updateComplete;

    // Signalement immédiat (avant : silence total)
    expect(a11y.getAttribute('data-dsfr-config-error')).toMatch(/c4-cible-tardive/);

    // La cible apparaît APRÈS le a11y (ordre DOM inversé — cas réel :
    // composant chart rendu par un autre script)
    const target = document.createElement('div');
    target.id = 'c4-cible-tardive';
    document.body.appendChild(target);

    // MutationObserver : laisse passer la microtask
    await new Promise((r) => setTimeout(r, 0));

    expect(a11y.hasAttribute('data-dsfr-config-error')).toBe(false);
    expect(target.getAttribute('aria-describedby')).toContain('c4-a11y-desc');
    expect(target.querySelector('[data-dsfr-data-a11y-link]')).not.toBeNull();

    target.remove();
  });

  it('cible présente : application immédiate, aucun signalement', async () => {
    const target = document.createElement('div');
    target.id = 'c4-cible-presente';
    document.body.appendChild(target);

    a11y = new DsfrDataA11y();
    a11y.id = 'c4-a11y-2';
    a11y.for = 'c4-cible-presente';
    a11y.source = 'c4-a11y-data';
    document.body.appendChild(a11y);
    await a11y.updateComplete;

    expect(a11y.hasAttribute('data-dsfr-config-error')).toBe(false);
    expect(target.getAttribute('aria-describedby')).toContain('c4-a11y-2-desc');

    target.remove();
  });

  it("l'observateur est coupé au disconnect (pas de fuite)", async () => {
    a11y = new DsfrDataA11y();
    a11y.id = 'c4-a11y-3';
    a11y.for = 'c4-jamais-la';
    a11y.source = 'c4-a11y-data';
    document.body.appendChild(a11y);
    await a11y.updateComplete;

    expect((a11y as any)._targetObserver).not.toBeNull();
    a11y.remove();
    expect((a11y as any)._targetObserver).toBeNull();
  });
});

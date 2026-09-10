import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * #728 — l'état d'attente (`require-where`, #690) doit être LISIBLE par
 * l'hôte d'un transformateur, pas seulement propagé en aval.
 *
 * `TransformerMixin` n'exposait que `emitTransformerIdle()` : l'événement
 * partait vers l'aval, mais aucun champ ne permettait au composant lui-même
 * de rendre l'attente — là où `SourceSubscriberMixin` porte `_sourceIdle`.
 * Conséquence visible : le compteur de `dsfr-data-search` annonçait
 * « 0 résultats » sur une page qui n'avait rien demandé.
 */

import { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataIdle,
  dispatchDataLoaded,
  dispatchDataError,
  dispatchDataLoading,
} from '@/utils/data-bridge.js';

const SRC = 'idle-state-src';
const OUT = 'idle-state-out';

const ROWS = [
  { region: 'Bretagne', total: 3 },
  { region: 'Normandie', total: 5 },
];

/** Vue interne du mixin — pas de `as any` dispersé dans les assertions. */
interface TransformerInternals {
  _transformerIdle: boolean;
  isIdle(): boolean;
}

function purge() {
  for (const id of [SRC, OUT]) {
    clearDataCache(id);
    clearDataMeta(id);
  }
  // Sort les identifiants du registre d'attente entre deux cas
  dispatchDataLoaded(SRC, []);
  dispatchDataLoaded(OUT, []);
  clearDataCache(SRC);
  clearDataCache(OUT);
}

describe('#728 — TransformerMixin expose l’état d’attente', () => {
  beforeEach(purge);

  afterEach(() => {
    document.body.innerHTML = '';
    purge();
  });

  it('un transformateur peut lire son attente et la voit levée par les données', async () => {
    const normalize = new DsfrDataNormalize();
    normalize.id = OUT;
    normalize.source = SRC;
    document.body.appendChild(normalize);
    await normalize.updateComplete;

    const view = normalize as unknown as TransformerInternals;
    expect(view.isIdle()).toBe(false);

    dispatchDataIdle(SRC);
    await normalize.updateComplete;
    expect(view.isIdle()).toBe(true);
    expect(view._transformerIdle).toBe(true);

    dispatchDataLoaded(SRC, ROWS);
    await normalize.updateComplete;
    expect(view.isIdle()).toBe(false);
  });

  it('chargement et erreur amont lèvent aussi l’attente', async () => {
    const normalize = new DsfrDataNormalize();
    normalize.id = OUT;
    normalize.source = SRC;
    document.body.appendChild(normalize);
    await normalize.updateComplete;
    const view = normalize as unknown as TransformerInternals;

    dispatchDataIdle(SRC);
    await normalize.updateComplete;
    expect(view.isIdle()).toBe(true);

    dispatchDataLoading(SRC);
    await normalize.updateComplete;
    expect(view.isIdle()).toBe(false);

    dispatchDataIdle(SRC);
    await normalize.updateComplete;
    expect(view.isIdle()).toBe(true);

    dispatchDataError(SRC, new Error('boum'));
    await normalize.updateComplete;
    expect(view.isIdle()).toBe(false);
  });

  it('un transformateur monté APRÈS l’entrée en attente la lit au registre', async () => {
    dispatchDataIdle(SRC);

    const normalize = new DsfrDataNormalize();
    normalize.id = OUT;
    normalize.source = SRC;
    document.body.appendChild(normalize);
    await normalize.updateComplete;

    expect((normalize as unknown as TransformerInternals).isIdle()).toBe(true);
  });
});

describe('#728 — dsfr-data-search rend l’attente au lieu d’un compte', () => {
  beforeEach(purge);

  afterEach(() => {
    document.body.innerHTML = '';
    purge();
  });

  async function mountSearch(): Promise<DsfrDataSearch> {
    const search = new DsfrDataSearch();
    search.id = OUT;
    search.source = SRC;
    search.count = true;
    document.body.appendChild(search);
    await search.updateComplete;
    return search;
  }

  it('AC : en attente, aucun compte n’est rendu — mais l’idle-message l’est', async () => {
    const search = await mountSearch();

    dispatchDataIdle(SRC);
    await search.updateComplete;

    expect(search.querySelector('.dsfr-data-search-count')).toBeNull();
    const idle = search.querySelector('.dsfr-data-search__idle');
    expect(idle).not.toBeNull();
    expect(idle!.classList.contains('dsfr-data-status--idle')).toBe(true);
    expect(idle!.textContent).toContain('Choisissez un filtre');
    // Ce n'est ni un chargement ni une alerte : pas de région live (#690)
    expect(idle!.getAttribute('aria-live')).toBeNull();
    expect(idle!.getAttribute('role')).toBeNull();
  });

  it('idle-message personnalisé rendu', async () => {
    const search = await mountSearch();
    search.idleMessage = 'Saisissez une commune';

    dispatchDataIdle(SRC);
    await search.updateComplete;

    expect(search.querySelector('.dsfr-data-search__idle')!.textContent).toContain(
      'Saisissez une commune'
    );
  });

  it('aucun compteur sr-only en attente (rien à annoncer)', async () => {
    const search = new DsfrDataSearch();
    search.id = OUT;
    search.source = SRC;
    document.body.appendChild(search);
    await search.updateComplete;

    dispatchDataIdle(SRC);
    await search.updateComplete;

    expect(search.querySelector('.fr-sr-only[aria-live]')).toBeNull();
  });

  it('les premières données lèvent l’attente et rendent le compte', async () => {
    const search = await mountSearch();

    dispatchDataIdle(SRC);
    await search.updateComplete;
    expect(search.querySelector('.dsfr-data-search__idle')).not.toBeNull();

    dispatchDataLoaded(SRC, ROWS);
    await search.updateComplete;

    expect(search.querySelector('.dsfr-data-search__idle')).toBeNull();
    expect(search.querySelector('.dsfr-data-search-count')!.textContent).toContain('2 résultats');
  });
});

describe('#728 (AM-044) — le compteur porte un séparateur de milliers', () => {
  beforeEach(purge);

  afterEach(() => {
    document.body.innerHTML = '';
    purge();
  });

  it('AC : « 12 345 résultats » et non « 12345 résultats »', async () => {
    const search = new DsfrDataSearch();
    search.id = OUT;
    search.source = SRC;
    search.count = true;
    document.body.appendChild(search);
    await search.updateComplete;

    const rows = Array.from({ length: 12345 }, (_, i) => ({ region: `R${i}` }));
    dispatchDataLoaded(SRC, rows);
    await search.updateComplete;

    const text = search.querySelector('.dsfr-data-search-count')!.textContent ?? '';
    expect(text).not.toContain('12345');
    // Intl fr-FR sépare par une espace insécable étroite (U+202F)
    expect(text.replace(/[\u00A0\u202F\s]/g, ' ')).toContain('12 345 résultats');
  });

  it('un seul résultat reste au singulier', async () => {
    const search = new DsfrDataSearch();
    search.id = OUT;
    search.source = SRC;
    search.count = true;
    document.body.appendChild(search);
    await search.updateComplete;

    dispatchDataLoaded(SRC, [{ region: 'Bretagne' }]);
    await search.updateComplete;

    expect(search.querySelector('.dsfr-data-search-count')!.textContent).toContain('1 résultat');
    expect(search.querySelector('.dsfr-data-search-count')!.textContent).not.toContain(
      '1 résultats'
    );
  });
});

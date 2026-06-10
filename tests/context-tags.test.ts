import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #232 (EPIC #224) — dsfr-data-context-tags : récap des filtres actifs.
 *
 * Tags DSFR supprimables : un tag par filtre actif ; la croix retire le
 * filtre EN VIDANT son UI (même chemin qu'un clic utilisateur → sources,
 * URL et tags se mettent à jour ensemble).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import '@/components/dsfr-data-context.js';
import '@/components/dsfr-data-context-filter.js';
import '@/components/dsfr-data-context-tags.js';
import { subscribeToSourceCommands, clearDataCache } from '@/utils/data-bridge.js';
import type { DsfrDataContextTags } from '@/components/dsfr-data-context-tags.js';

function fakeSource(id: string) {
  const el = document.createElement('div');
  el.id = id;
  (el as unknown as Record<string, unknown>).getAdapter = () => ({
    capabilities: { whereFormat: 'colon' },
  });
  document.body.appendChild(el);
  return el;
}

async function settle() {
  await new Promise((r) => queueMicrotask(() => queueMicrotask(() => r(null))));
}

beforeEach(() => clearDataCache('t-src'));

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', window.location.pathname);
});

async function mountDashboard(): Promise<{
  tags: DsfrDataContextTags;
  cat: HTMLInputElement;
  statut: HTMLInputElement;
}> {
  fakeSource('t-src');
  for (const id of ['ui-t-cat', 'ui-t-statut']) {
    const i = document.createElement('input');
    i.id = id;
    document.body.appendChild(i);
  }
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <dsfr-data-context id="tctx" sources="t-src" url-sync>
      <dsfr-data-context-filter field="categorie" label="Catégorie" operator="eq" ui="ui-t-cat">
      </dsfr-data-context-filter>
      <dsfr-data-context-filter field="statut" operator="eq" ui="ui-t-statut">
      </dsfr-data-context-filter>
    </dsfr-data-context>
    <dsfr-data-context-tags for="tctx"></dsfr-data-context-tags>
  `;
  document.body.appendChild(wrapper);
  await settle();
  const tags = wrapper.querySelector('dsfr-data-context-tags') as DsfrDataContextTags;
  await tags.updateComplete;
  return {
    tags,
    cat: document.getElementById('ui-t-cat') as HTMLInputElement,
    statut: document.getElementById('ui-t-statut') as HTMLInputElement,
  };
}

describe('#232 — AC : 2 filtres actifs → 2 tags rendus', () => {
  it('rend un tag DSFR par filtre actif (libellé naturel + valeur)', async () => {
    const { tags, cat, statut } = await mountDashboard();

    expect(tags.querySelectorAll('.fr-tag')).toHaveLength(0);

    cat.value = 'jouets';
    cat.dispatchEvent(new Event('change', { bubbles: true }));
    statut.value = 'actif';
    statut.dispatchEvent(new Event('change', { bubbles: true }));
    await tags.updateComplete;

    const rendered = Array.from(tags.querySelectorAll('.fr-tag'));
    expect(rendered).toHaveLength(2);
    // label explicite pour l'un, field par défaut pour l'autre
    expect(rendered[0]?.textContent).toContain('Catégorie');
    expect(rendered[0]?.textContent).toContain('jouets');
    expect(rendered[1]?.textContent).toContain('statut');
  });
});

describe('#232 — AC : suppression d’un tag → vue, UI, URL et sources à jour', () => {
  it('la croix vide l’UI, retire le filtre des sources et de l’URL', async () => {
    const commands: Array<{ where?: string; whereKey?: string }> = [];
    const unsub = subscribeToSourceCommands('t-src', (cmd) =>
      commands.push(cmd as Record<string, unknown>)
    );

    const { tags, cat } = await mountDashboard();
    cat.value = 'jouets';
    cat.dispatchEvent(new Event('change', { bubbles: true }));
    await tags.updateComplete;
    expect(new URLSearchParams(window.location.search).get('categorie')).toBe('jouets');

    const dismiss = tags.querySelector('.fr-tag') as HTMLButtonElement;
    dismiss.click();
    await tags.updateComplete;

    // UI vidée (chemin utilisateur), filtre retiré, URL nettoyée, tag disparu
    expect(cat.value).toBe('');
    expect(commands.at(-1)?.where).toBe('');
    expect(new URLSearchParams(window.location.search).get('categorie')).toBeNull();
    expect(tags.querySelectorAll('.fr-tag')).toHaveLength(0);

    unsub();
  });
});

describe('#232 — config', () => {
  it('for introuvable → reportConfigError', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tags = document.createElement('dsfr-data-context-tags') as DsfrDataContextTags;
    tags.setAttribute('for', 'inexistant');
    document.body.appendChild(tags);
    await tags.updateComplete;
    await settle();

    expect(tags.hasAttribute('data-dsfr-config-error')).toBe(true);
    errorSpy.mockRestore();
  });
});

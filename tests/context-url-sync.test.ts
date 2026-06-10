import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #231 (EPIC #224) — sérialisation URL des filtres dsfr-data-context.
 *
 * ADR-031 : opt-in (`url-sync`, défaut OFF), encodage lisible (un paramètre
 * par filtre, nommé d'après le champ, valeurs jointes par virgule),
 * `history.replaceState()`. Sécurité : les valeurs lues dans l'URL ne sont
 * JAMAIS injectées dans un where — elles pré-remplissent les contrôles
 * d'UI, qui repassent par exactement le même chemin qu'un clic utilisateur.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import '@/components/dsfr-data-context.js';
import '@/components/dsfr-data-context-filter.js';
import { subscribeToSourceCommands, clearDataCache } from '@/utils/data-bridge.js';
import type { DsfrDataContext } from '@/components/dsfr-data-context.js';

function fakeSource(id: string) {
  const el = document.createElement('div');
  el.id = id;
  (el as unknown as Record<string, unknown>).getAdapter = () => ({
    capabilities: { whereFormat: 'colon' },
  });
  document.body.appendChild(el);
  return el;
}

function captureCommands(ids: string[]) {
  const commands: Array<{ sourceId: string; where?: string; whereKey?: string }> = [];
  const unsubs = ids.map((id) =>
    subscribeToSourceCommands(id, (cmd) =>
      commands.push({ sourceId: id, ...(cmd as Record<string, unknown>) } as never)
    )
  );
  return { commands, unsub: () => unsubs.forEach((u) => u()) };
}

async function mount(html: string): Promise<DsfrDataContext> {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  const ctx = wrapper.querySelector('dsfr-data-context') as DsfrDataContext;
  await ctx.updateComplete;
  // les binds des enfants sont en microtask
  await new Promise((r) => setTimeout(r, 0));
  return ctx;
}

beforeEach(() => {
  for (const id of ['u-a', 'u-b']) clearDataCache(id);
});

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', window.location.pathname);
});

describe('#231 — AC : URL pré-encodée → état restauré sur toutes les sources', () => {
  it('?categorie=alimentaire,jouets pré-remplit le select multiple et diffuse', async () => {
    window.history.replaceState(null, '', '?categorie=alimentaire,jouets&autre=garde');
    fakeSource('u-a');
    fakeSource('u-b');
    const { commands, unsub } = captureCommands(['u-a', 'u-b']);

    const select = document.createElement('select');
    select.id = 'ui-cat';
    select.multiple = true;
    for (const v of ['alimentaire', 'jouets', 'hygiene']) {
      const o = document.createElement('option');
      o.value = v;
      select.appendChild(o);
    }
    document.body.appendChild(select);

    await mount(`
      <dsfr-data-context id="uctx" sources="u-a u-b" url-sync>
        <dsfr-data-context-filter field="categorie" operator="in" ui="ui-cat">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    // L'UI a été pré-remplie (chemin sécurité ADR-031 : URL → UI → emit)
    const selected = Array.from(select.options)
      .filter((o) => o.selected)
      .map((o) => o.value);
    expect(selected).toEqual(['alimentaire', 'jouets']);

    // ... et les DEUX sources ont reçu le filtre
    for (const src of ['u-a', 'u-b']) {
      const last = commands.filter((c) => c.sourceId === src).at(-1);
      expect(last?.where).toBe('categorie:in:alimentaire|jouets');
    }
    unsub();
  });

  it('between : ?prix=10,20 remplit min et max', async () => {
    window.history.replaceState(null, '', '?prix=10,20');
    fakeSource('u-a');
    const { commands, unsub } = captureCommands(['u-a']);

    for (const id of ['ui-min', 'ui-max']) {
      const i = document.createElement('input');
      i.id = id;
      document.body.appendChild(i);
    }

    await mount(`
      <dsfr-data-context id="uctx2" sources="u-a" url-sync>
        <dsfr-data-context-filter field="prix" operator="between" ui="ui-min ui-max">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect((document.getElementById('ui-min') as HTMLInputElement).value).toBe('10');
    expect((document.getElementById('ui-max') as HTMLInputElement).value).toBe('20');
    expect(commands.at(-1)?.where).toBe('prix:gte:10, prix:lt:20');
    unsub();
  });

  it('sans url-sync (défaut OFF), l’URL est ignorée', async () => {
    window.history.replaceState(null, '', '?categorie=alimentaire');
    fakeSource('u-a');
    const { commands, unsub } = captureCommands(['u-a']);

    const input = document.createElement('input');
    input.id = 'ui-off';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="uctx3" sources="u-a">
        <dsfr-data-context-filter field="categorie" operator="eq" ui="ui-off">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(input.value).toBe('');
    expect(commands.filter((c) => c.where)).toHaveLength(0);
    unsub();
  });
});

describe('#231 — AC : changement de filtre → URL mise à jour (replaceState)', () => {
  it('écrit le paramètre, préserve les params voisins, retire à la valeur vide', async () => {
    window.history.replaceState(null, '', '?routing=page2');
    fakeSource('u-a');

    const input = document.createElement('input');
    input.id = 'ui-w';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="uctx4" sources="u-a" url-sync>
        <dsfr-data-context-filter field="statut" operator="eq" ui="ui-w">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    input.value = 'actif';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    let params = new URLSearchParams(window.location.search);
    expect(params.get('statut')).toBe('actif');
    expect(params.get('routing')).toBe('page2'); // leçon #312 : voisins préservés

    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    params = new URLSearchParams(window.location.search);
    expect(params.get('statut')).toBeNull();
    expect(params.get('routing')).toBe('page2');
  });

  it('url-param-map renomme le paramètre (c:categorie)', async () => {
    window.history.replaceState(null, '', '?c=jouets');
    fakeSource('u-a');
    const { commands, unsub } = captureCommands(['u-a']);

    const input = document.createElement('input');
    input.id = 'ui-map';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="uctx5" sources="u-a" url-sync url-param-map="c:categorie">
        <dsfr-data-context-filter field="categorie" operator="eq" ui="ui-map">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(input.value).toBe('jouets');
    expect(commands.at(-1)?.where).toBe('categorie:eq:jouets');

    input.value = 'hygiene';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(new URLSearchParams(window.location.search).get('c')).toBe('hygiene');

    unsub();
  });
});

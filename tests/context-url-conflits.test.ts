import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #922 (PG-028) — deux `dsfr-data-context url-sync` qui portent un filtre sur
 * le MÊME champ écrivent le même paramètre d'URL : le second écrase le
 * premier, et au rechargement les deux relisent la même valeur. Un
 * comparateur de territoires se compare alors à lui-même.
 *
 * Le comportement ne change pas (désambiguïser les paramètres casserait les
 * liens déjà partagés) : ce qui change, c'est que le piège se dit.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import '@/components/dsfr-data-context.js';
import '@/components/dsfr-data-context-filter.js';
import { clearDataCache } from '@/utils/data-bridge.js';
import { resetContextUrlConflictWarnings } from '@/utils/context-url-conflicts.js';

function fakeSource(id: string) {
  const el = document.createElement('div');
  el.id = id;
  (el as unknown as Record<string, unknown>).getAdapter = () => ({
    capabilities: { whereFormat: 'colon' },
  });
  document.body.appendChild(el);
}

function select(id: string, values: string[]) {
  const el = document.createElement('select');
  el.id = id;
  for (const v of ['', ...values]) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    el.appendChild(o);
  }
  document.body.appendChild(el);
  return el;
}

async function mount(html: string) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return wrapper;
}

/** Les avertissements du conflit de paramètre, à l'exclusion de tout autre */
function conflits(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls
    .map((c: unknown[]) => String(c[0]))

    .filter((m: string) => m.includes("le paramètre d'URL"));
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetContextUrlConflictWarnings();
  for (const id of ['s-a', 's-b']) clearDataCache(id);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', window.location.pathname);
});

describe('#922 — un paramètre d’URL réclamé par deux contextes url-sync', () => {
  it('est signalé une fois, en nommant les deux contextes, le champ et le geste', async () => {
    fakeSource('s-a');
    fakeSource('s-b');
    select('ui-ref', ['Bretagne', 'Normandie']);
    select('ui-cmp', ['Bretagne', 'Normandie']);

    await mount(`
      <dsfr-data-context id="ctx-ref" sources="s-a" url-sync>
        <dsfr-data-context-filter field="reg_nom" operator="eq" ui="ui-ref"></dsfr-data-context-filter>
      </dsfr-data-context>
      <dsfr-data-context id="ctx-cmp" sources="s-b" url-sync>
        <dsfr-data-context-filter field="reg_nom" operator="eq" ui="ui-cmp"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    const messages = conflits(warn);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('"reg_nom"');
    expect(messages[0]).toContain('"ctx-ref"');
    expect(messages[0]).toContain('"ctx-cmp"');
    expect(messages[0]).toContain('url-param-map');
  });

  it('ne se répète pas quand les filtres émettent : un message, pas un par événement', async () => {
    fakeSource('s-a');
    fakeSource('s-b');
    const ref = select('ui-ref', ['Bretagne', 'Normandie']);
    const cmp = select('ui-cmp', ['Bretagne', 'Normandie']);

    await mount(`
      <dsfr-data-context id="ctx-ref" sources="s-a" url-sync>
        <dsfr-data-context-filter field="reg_nom" operator="eq" ui="ui-ref"></dsfr-data-context-filter>
      </dsfr-data-context>
      <dsfr-data-context id="ctx-cmp" sources="s-b" url-sync>
        <dsfr-data-context-filter field="reg_nom" operator="eq" ui="ui-cmp"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    for (let i = 0; i < 10; i++) {
      ref.value = i % 2 ? 'Bretagne' : 'Normandie';
      ref.dispatchEvent(new Event('change'));
      cmp.value = i % 2 ? 'Normandie' : 'Bretagne';
      cmp.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 0));
    }

    expect(conflits(warn)).toHaveLength(1);
  });

  it('se tait quand un seul contexte est synchronisé', async () => {
    fakeSource('s-a');
    fakeSource('s-b');
    select('ui-ref', ['Bretagne']);
    select('ui-cmp', ['Bretagne']);

    await mount(`
      <dsfr-data-context id="ctx-ref" sources="s-a" url-sync>
        <dsfr-data-context-filter field="reg_nom" operator="eq" ui="ui-ref"></dsfr-data-context-filter>
      </dsfr-data-context>
      <dsfr-data-context id="ctx-cmp" sources="s-b">
        <dsfr-data-context-filter field="reg_nom" operator="eq" ui="ui-cmp"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(conflits(warn)).toEqual([]);
  });

  it('se tait quand url-param-map sépare déjà les deux paramètres', async () => {
    fakeSource('s-a');
    fakeSource('s-b');
    select('ui-ref', ['Bretagne']);
    select('ui-cmp', ['Bretagne']);

    await mount(`
      <dsfr-data-context id="ctx-ref" sources="s-a" url-sync>
        <dsfr-data-context-filter field="reg_nom" operator="eq" ui="ui-ref"></dsfr-data-context-filter>
      </dsfr-data-context>
      <dsfr-data-context id="ctx-cmp" sources="s-b" url-sync url-param-map="cmp_reg_nom:reg_nom">
        <dsfr-data-context-filter field="reg_nom" operator="eq" ui="ui-cmp"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(conflits(warn)).toEqual([]);
  });

  it('se tait quand les deux contextes filtrent des champs différents', async () => {
    fakeSource('s-a');
    fakeSource('s-b');
    select('ui-ref', ['Bretagne']);
    select('ui-cmp', ['33']);

    await mount(`
      <dsfr-data-context id="ctx-ref" sources="s-a" url-sync>
        <dsfr-data-context-filter field="reg_nom" operator="eq" ui="ui-ref"></dsfr-data-context-filter>
      </dsfr-data-context>
      <dsfr-data-context id="ctx-cmp" sources="s-b" url-sync>
        <dsfr-data-context-filter field="dep_code" operator="eq" ui="ui-cmp"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(conflits(warn)).toEqual([]);
  });
});

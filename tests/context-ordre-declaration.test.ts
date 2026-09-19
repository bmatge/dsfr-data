import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #923 (PG-029) — deux contextes sur un MÊME `<select>` : leur ordre de
 * déclaration décide si le lien profond s'applique aux deux.
 *
 * Un filtre lit son contrôle À SON MONTAGE ; le pré-remplissage depuis l'URL
 * écrit `el.value` sans émettre d'événement. Le filtre du contexte déclaré
 * avant le contexte synchronisé reste donc sur la valeur initiale — et la
 * page répond deux choses différentes pour un même affichage.
 *
 * Émettre un `change` changerait l'ordre d'application de toutes les pages
 * qui marchent : ici on se contente de rompre le silence.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import '@/components/dsfr-data-context.js';
import '@/components/dsfr-data-context-filter.js';
import { clearDataCache } from '@/utils/data-bridge.js';
import {
  resetStaleSiblingWarnings,
  resetContextUrlConflictWarnings,
} from '@/utils/context-url-conflicts.js';

function fakeSource(id: string) {
  const el = document.createElement('div');
  el.id = id;
  (el as unknown as Record<string, unknown>).getAdapter = () => ({
    capabilities: { whereFormat: 'colon' },
  });
  document.body.appendChild(el);
}

function sharedSelect(defaultValue: string) {
  const el = document.createElement('select');
  el.id = 'sel-reg';
  for (const v of ['Normandie', 'Bretagne']) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    el.appendChild(o);
  }
  el.value = defaultValue;
  document.body.appendChild(el);
  return el;
}

const CTX_SYNC = `
  <dsfr-data-context id="ctx-sync" sources="s-a" url-sync>
    <dsfr-data-context-filter field="reg_nom" operator="eq" ui="sel-reg"></dsfr-data-context-filter>
  </dsfr-data-context>`;

const CTX_PLAIN = `
  <dsfr-data-context id="ctx-plain" sources="s-b">
    <dsfr-data-context-filter field="nom_region" operator="eq" ui="sel-reg"></dsfr-data-context-filter>
  </dsfr-data-context>`;

async function mount(html: string) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return wrapper;
}

function ordres(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls
    .map((c: unknown[]) => String(c[0]))
    .filter((m: string) => m.includes('pré-rempli depuis'));
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetStaleSiblingWarnings();
  resetContextUrlConflictWarnings();
  for (const id of ['s-a', 's-b']) clearDataCache(id);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', window.location.pathname);
});

describe('#923 — pré-remplissage arrivé après la lecture d’un filtre voisin', () => {
  it('signale l’ordre piégeux (contexte non synchronisé déclaré en premier)', async () => {
    window.history.replaceState(null, '', '?reg_nom=Bretagne');
    fakeSource('s-a');
    fakeSource('s-b');
    sharedSelect('Normandie');

    await mount(CTX_PLAIN + CTX_SYNC);

    const messages = ordres(warn);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('#sel-reg');
    expect(messages[0]).toContain('(reg_nom)');
    expect(messages[0]).toContain('"nom_region"');
    expect(messages[0]).toContain('"ctx-plain"');
    expect(messages[0]).toContain('EN PREMIER');
  });

  it('se tait dans l’ordre sain (contexte synchronisé déclaré en premier)', async () => {
    window.history.replaceState(null, '', '?reg_nom=Bretagne');
    fakeSource('s-a');
    fakeSource('s-b');
    sharedSelect('Normandie');

    await mount(CTX_SYNC + CTX_PLAIN);

    expect(ordres(warn)).toEqual([]);
  });

  it('se tait quand le pré-remplissage ne change rien à la valeur du contrôle', async () => {
    window.history.replaceState(null, '', '?reg_nom=Normandie');
    fakeSource('s-a');
    fakeSource('s-b');
    sharedSelect('Normandie');

    await mount(CTX_PLAIN + CTX_SYNC);

    expect(ordres(warn)).toEqual([]);
  });

  it('ne se répète pas à chaque geste sur le contrôle partagé', async () => {
    window.history.replaceState(null, '', '?reg_nom=Bretagne');
    fakeSource('s-a');
    fakeSource('s-b');
    const sel = sharedSelect('Normandie');

    await mount(CTX_PLAIN + CTX_SYNC);

    for (let i = 0; i < 10; i++) {
      sel.value = i % 2 ? 'Bretagne' : 'Normandie';
      sel.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 0));
    }

    expect(ordres(warn)).toHaveLength(1);
  });
});

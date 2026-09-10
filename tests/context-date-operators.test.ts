import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #230 (EPIC #224) — opérateurs de date de dsfr-data-context-filter.
 *
 * Dashboards datés (rappels, sanctions, dépenses…) : month-of, year-of,
 * lt-day-after, last-n-days, current-year. Les bornes dynamiques se
 * recalculent à CHAQUE diffusion (pas de date figée) ; l'URL sérialise
 * l'intention (« 30 »), jamais les dates résolues (ADR-031).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import '@/components/dsfr-data-context.js';
import '@/components/dsfr-data-context-filter.js';
import { subscribeToSourceCommands, clearDataCache } from '@/utils/data-bridge.js';
import type { DsfrDataContext } from '@/components/dsfr-data-context.js';

function fakeSource(id: string, whereFormat: 'colon' | 'odsql' = 'colon') {
  const el = document.createElement('div');
  el.id = id;
  (el as unknown as Record<string, unknown>).getAdapter = () => ({
    capabilities: { whereFormat },
  });
  document.body.appendChild(el);
  return el;
}

function captureLast(id: string) {
  const box: { where?: string } = {};
  const unsub = subscribeToSourceCommands(id, (cmd) => {
    box.where = (cmd as { where?: string }).where;
  });
  return { box, unsub };
}

async function mount(html: string): Promise<DsfrDataContext> {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  const ctx = wrapper.querySelector('dsfr-data-context') as DsfrDataContext;
  await ctx.updateComplete;
  // double microtask (les binds enfants sont en queueMicrotask) —
  // compatible fake timers, contrairement a setTimeout
  await new Promise((r) => queueMicrotask(() => queueMicrotask(() => r(null))));
  return ctx;
}

beforeEach(() => clearDataCache('d-src'));

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('#230 — AC : month-of → plage [1er du mois, 1er du mois suivant)', () => {
  it('input type=month "2026-03" → gte 2026-03-01, lt 2026-04-01', async () => {
    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');

    const input = document.createElement('input');
    input.type = 'month';
    input.id = 'ui-mois';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx1" sources="d-src">
        <dsfr-data-context-filter field="date_rappel" operator="month-of" ui="ui-mois">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    input.value = '2026-03';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(box.where).toBe('date_rappel:gte:2026-03-01, date_rappel:lt:2026-04-01');
    unsub();
  });

  it('décembre bascule d’année : 2025-12 → lt 2026-01-01', async () => {
    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.id = 'ui-dec';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx2" sources="d-src">
        <dsfr-data-context-filter field="d" operator="month-of" ui="ui-dec">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    input.value = '2025-12';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(box.where).toBe('d:gte:2025-12-01, d:lt:2026-01-01');
    unsub();
  });
});

describe('#230 — AC : year-of → plage annuelle', () => {
  it('"2026" → gte 2026-01-01, lt 2027-01-01', async () => {
    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.id = 'ui-an';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx3" sources="d-src">
        <dsfr-data-context-filter field="annee" operator="year-of" ui="ui-an">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    input.value = '2026';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(box.where).toBe('annee:gte:2026-01-01, annee:lt:2027-01-01');
    unsub();
  });
});

describe('#230 — lt-day-after : inclusif jusqu’à la date choisie', () => {
  it('"2026-03-15" → lt 2026-03-16 (borne haute seule)', async () => {
    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.id = 'ui-fin';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx4" sources="d-src">
        <dsfr-data-context-filter field="d" operator="lt-day-after" ui="ui-fin">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    input.value = '2026-03-15';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(box.where).toBe('d:lt:2026-03-16');
    unsub();
  });
});

describe('#230 — AC : last-n-days relatif à une date injectée (déterminisme)', () => {
  it('"30" au 2026-06-10 → gte 2026-05-11, recalculé à chaque diffusion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T12:00:00Z'));

    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.id = 'ui-n';
    document.body.appendChild(input);

    const ctx = await mount(`
      <dsfr-data-context id="dctx5" sources="d-src">
        <dsfr-data-context-filter field="d" operator="last-n-days" ui="ui-n">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    input.value = '30';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(box.where).toBe('d:gte:2026-05-11');

    // Borne DYNAMIQUE : le lendemain, la même UI produit une autre borne
    vi.setSystemTime(new Date('2026-06-11T12:00:00Z'));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(box.where).toBe('d:gte:2026-05-12');

    // L'URL sérialise l'INTENTION (« 30 »), pas les dates résolues (ADR-031)
    const filter = ctx.querySelector('dsfr-data-context-filter') as never as {
      urlValue(): string;
    };
    expect(filter.urlValue()).toBe('30');

    unsub();
  });
});

describe('#230 — current-year : borne dynamique année en cours', () => {
  it('une checkbox cochée active la plage de l’année courante', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T12:00:00Z'));

    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'ui-cy';
    document.body.appendChild(checkbox);

    await mount(`
      <dsfr-data-context id="dctx6" sources="d-src">
        <dsfr-data-context-filter field="d" operator="current-year" ui="ui-cy">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(box.where).toBe('d:gte:2026-01-01, d:lt:2027-01-01');

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(box.where).toBe('');

    unsub();
  });
});

describe('#230 — AC : génération selon whereFormat (ODSQL vs colon)', () => {
  it('month-of vers une source ODS → clause ODSQL', async () => {
    fakeSource('d-src', 'odsql');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.id = 'ui-ods';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx7" sources="d-src">
        <dsfr-data-context-filter field="d" operator="month-of" ui="ui-ods">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    input.value = '2026-03';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(box.where).toContain('>=');
    expect(box.where).toContain('2026-03-01');
    expect(box.where).toContain('<');
    expect(box.where).toContain('2026-04-01');
    expect(box.where).not.toContain(':gte:');
    unsub();
  });

  it('valeur invalide (mois malformé) → filtre inactif, pas de clause cassée', async () => {
    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.id = 'ui-bad';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx8" sources="d-src">
        <dsfr-data-context-filter field="d" operator="month-of" ui="ui-bad">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    input.value = 'pas-un-mois';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(box.where).toBe('');
    unsub();
  });
});

/**
 * #646 — year-of / month-of acceptent une date complete (input type=date)
 * et la tronquent a la precision de l'operateur ; une valeur qui reste
 * inexploitable retire le filtre en le DISANT (warn unique par filtre).
 */
describe('#646 — AC : year-of / month-of tronquent une date complete', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('year-of avec "2026-09-09" (input type=date) → plage 2026', async () => {
    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.type = 'date';
    input.id = 'ui-an-date';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx646a" sources="d-src">
        <dsfr-data-context-filter field="annee" operator="year-of" ui="ui-an-date">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    input.value = '2026-09-09';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(box.where).toBe('annee:gte:2026-01-01, annee:lt:2027-01-01');
    expect(warnSpy).not.toHaveBeenCalled();
    unsub();
  });

  it('year-of avec un mois "2026-09" → plage 2026', async () => {
    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.id = 'ui-an-mois';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx646b" sources="d-src">
        <dsfr-data-context-filter field="annee" operator="year-of" ui="ui-an-mois">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    input.value = '2026-09';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(box.where).toBe('annee:gte:2026-01-01, annee:lt:2027-01-01');
    unsub();
  });

  it('month-of avec "2026-09-09" → plage 2026-09', async () => {
    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.type = 'date';
    input.id = 'ui-mois-date';
    document.body.appendChild(input);

    const ctx = await mount(`
      <dsfr-data-context id="dctx646c" sources="d-src">
        <dsfr-data-context-filter field="d" operator="month-of" ui="ui-mois-date">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    input.value = '2026-09-09';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(box.where).toBe('d:gte:2026-09-01, d:lt:2026-10-01');
    expect(warnSpy).not.toHaveBeenCalled();

    // Le tag (#232) montre la precision reellement filtree, pas la saisie brute
    const filter = ctx.querySelector('dsfr-data-context-filter') as never as {
      displayValue(): string;
      urlValue(): string;
    };
    expect(filter.displayValue()).toBe('2026-09');
    // L'URL serialise l'etat de l'UI (rechargement fidele du type=date)
    expect(filter.urlValue()).toBe('2026-09-09');
    unsub();
  });

  it('month-of avec une annee seule "2026" reste inexploitable → filtre retire + warn', async () => {
    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.id = 'ui-mois-an';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx646d" sources="d-src">
        <dsfr-data-context-filter field="d" operator="month-of" ui="ui-mois-an">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    input.value = '2026';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(box.where).toBe('');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    unsub();
  });
});

describe('#646 — AC : valeur non date → warn unique par filtre, filtre retire', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('year-of : chaque frappe inexploitable ne re-emet pas le warn', async () => {
    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.id = 'ui-an-bad';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx646e" sources="d-src">
        <dsfr-data-context-filter field="annee" operator="year-of" ui="ui-an-bad">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    for (const typed of ['2', '20', '202']) {
      input.value = typed;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(box.where).toBe('');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0][0]);
    expect(message).toContain('annee');
    expect(message).toContain('operator="year-of"');
    expect(message).toContain('"2"');
    expect(message).toContain('filtre retire');

    // La valeur devenue complete applique le filtre normalement
    input.value = '2026';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(box.where).toBe('annee:gte:2026-01-01, annee:lt:2027-01-01');
    unsub();
  });

  it('le warn est par filtre : deux filtres inexploitables → deux warns', async () => {
    fakeSource('d-src');
    const { unsub } = captureLast('d-src');
    for (const id of ['ui-bad-1', 'ui-bad-2']) {
      const input = document.createElement('input');
      input.id = id;
      document.body.appendChild(input);
    }

    await mount(`
      <dsfr-data-context id="dctx646f" sources="d-src">
        <dsfr-data-context-filter field="a" operator="year-of" ui="ui-bad-1">
        </dsfr-data-context-filter>
        <dsfr-data-context-filter field="b" operator="month-of" ui="ui-bad-2">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    for (const id of ['ui-bad-1', 'ui-bad-2']) {
      const input = document.getElementById(id) as HTMLInputElement;
      input.value = 'pas-une-date';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    expect(warnSpy).toHaveBeenCalledTimes(2);
    unsub();
  });

  it('la valeur vide retire le filtre SANS warn (ce n’est pas une erreur)', async () => {
    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.id = 'ui-an-vide';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx646g" sources="d-src">
        <dsfr-data-context-filter field="annee" operator="year-of" ui="ui-an-vide">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    input.value = '2026';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(box.where).toBe('');
    expect(warnSpy).not.toHaveBeenCalled();
    unsub();
  });
});

describe('#646 — pre-remplissage URL : la date complete tient dans le controle', () => {
  afterEach(() => {
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('?annee=2026-09-09 sur un input texte year-of → UI "2026", plage 2026', async () => {
    window.history.replaceState(null, '', '?annee=2026-09-09');
    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.id = 'ui-an-url';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx646h" sources="d-src" url-sync>
        <dsfr-data-context-filter field="annee" operator="year-of" ui="ui-an-url">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(input.value).toBe('2026');
    expect(box.where).toBe('annee:gte:2026-01-01, annee:lt:2027-01-01');
    unsub();
  });

  it('?d=2026-09-09 sur un input type=month month-of → UI "2026-09", plage du mois', async () => {
    window.history.replaceState(null, '', '?d=2026-09-09');
    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.type = 'month';
    input.id = 'ui-mois-url';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx646i" sources="d-src" url-sync>
        <dsfr-data-context-filter field="d" operator="month-of" ui="ui-mois-url">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(input.value).toBe('2026-09');
    expect(box.where).toBe('d:gte:2026-09-01, d:lt:2026-10-01');
    unsub();
  });

  it('?annee=2026 sur un input type=date year-of → UI completee "2026-01-01", plage 2026', async () => {
    window.history.replaceState(null, '', '?annee=2026');
    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.type = 'date';
    input.id = 'ui-an-date-url';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx646j" sources="d-src" url-sync>
        <dsfr-data-context-filter field="annee" operator="year-of" ui="ui-an-date-url">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(input.value).toBe('2026-01-01');
    expect(box.where).toBe('annee:gte:2026-01-01, annee:lt:2027-01-01');
    unsub();
  });
});

/**
 * #682 — `default` dynamique (today, first-of-month, first-of-year, litteral)
 * applique APRES l'URL (l'URL gagne, ADR-031), ecrit dans l'UI puis emis par
 * le chemin normal ; `current-month`, checkbox symetrique de `current-year`.
 */
describe('#682 — AC : default="today" filtre jusqu’a aujourd’hui sans script', () => {
  afterEach(() => {
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('operator="lt-day-after" default="today" → lt lendemain, UI pre-remplie, URL = date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T12:00:00Z'));

    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.type = 'date';
    input.id = 'ui-def-today';
    document.body.appendChild(input);

    const ctx = await mount(`
      <dsfr-data-context id="dctx682a" sources="d-src" url-sync>
        <dsfr-data-context-filter field="d" operator="lt-day-after" ui="ui-def-today" default="today">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(input.value).toBe('2026-06-10');
    expect(box.where).toBe('d:lt:2026-06-11');
    // Emis par le chemin normal : l'URL est synchronisee comme apres un clic
    expect(new URLSearchParams(window.location.search).get('d')).toBe('2026-06-10');
    const filter = ctx.querySelector('dsfr-data-context-filter') as never as {
      urlValue(): string;
    };
    expect(filter.urlValue()).toBe('2026-06-10');
    unsub();
  });

  it('today est la date calendaire LOCALE (a 23h30 locale, l’UTC peut etre demain)', async () => {
    vi.useFakeTimers();
    // 23:30 heure locale du 10 juin, quel que soit le fuseau de la machine
    vi.setSystemTime(new Date(2026, 5, 10, 23, 30));

    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.type = 'date';
    input.id = 'ui-def-local';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx682b" sources="d-src">
        <dsfr-data-context-filter field="d" operator="lt-day-after" ui="ui-def-local" default="today">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(input.value).toBe('2026-06-10');
    expect(box.where).toBe('d:lt:2026-06-11');
    unsub();
  });

  it('un ?d=… dans l’URL prime sur default', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T12:00:00Z'));
    window.history.replaceState(null, '', '?d=2026-03-15');

    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.type = 'date';
    input.id = 'ui-def-url';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx682c" sources="d-src" url-sync>
        <dsfr-data-context-filter field="d" operator="lt-day-after" ui="ui-def-url" default="today">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(input.value).toBe('2026-03-15');
    expect(box.where).toBe('d:lt:2026-03-16');
    unsub();
  });

  it('sans URL ni default, rien n’est emis (non-regression)', async () => {
    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.type = 'date';
    input.id = 'ui-def-none';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx682d" sources="d-src">
        <dsfr-data-context-filter field="d" operator="lt-day-after" ui="ui-def-none">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(input.value).toBe('');
    expect(box.where).toBeUndefined();
    unsub();
  });
});

describe('#682 — default : mots-cles adaptes au controle, litteral, between', () => {
  it('first-of-month sur un input type=date gte → 1er du mois en cours', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 12, 0));

    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.type = 'date';
    input.id = 'ui-def-fom';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx682e" sources="d-src">
        <dsfr-data-context-filter field="d" operator="gte" ui="ui-def-fom" default="first-of-month">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(input.value).toBe('2026-06-01');
    expect(box.where).toBe('d:gte:2026-06-01');
    unsub();
  });

  it('today sur un input type=month month-of → "AAAA-MM", plage du mois', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 12, 0));

    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.type = 'month';
    input.id = 'ui-def-month';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx682f" sources="d-src">
        <dsfr-data-context-filter field="d" operator="month-of" ui="ui-def-month" default="today">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(input.value).toBe('2026-06');
    expect(box.where).toBe('d:gte:2026-06-01, d:lt:2026-07-01');
    unsub();
  });

  it('today sur un input texte year-of → "AAAA", plage annuelle', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 12, 0));

    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.id = 'ui-def-year';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx682g" sources="d-src">
        <dsfr-data-context-filter field="annee" operator="year-of" ui="ui-def-year" default="today">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(input.value).toBe('2026');
    expect(box.where).toBe('annee:gte:2026-01-01, annee:lt:2027-01-01');
    unsub();
  });

  it('first-of-year sur un input texte lt → litteralement le 1er janvier', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 12, 0));

    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const input = document.createElement('input');
    input.id = 'ui-def-foy';
    document.body.appendChild(input);

    await mount(`
      <dsfr-data-context id="dctx682h" sources="d-src">
        <dsfr-data-context-filter field="d" operator="lt" ui="ui-def-foy" default="first-of-year">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(input.value).toBe('2026-01-01');
    expect(box.where).toBe('d:lt:2026-01-01');
    unsub();
  });

  it('un litteral est ecrit tel quel dans un select (eq)', async () => {
    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const select = document.createElement('select');
    select.id = 'ui-def-lit';
    for (const v of ['', 'Bretagne', 'Occitanie']) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v || '—';
      select.appendChild(o);
    }
    document.body.appendChild(select);

    await mount(`
      <dsfr-data-context id="dctx682i" sources="d-src">
        <dsfr-data-context-filter field="region" ui="ui-def-lit" default="Occitanie">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(select.value).toBe('Occitanie');
    expect(box.where).toBe('region:eq:Occitanie');
    unsub();
  });

  it('between default="first-of-year,today" → gte 1er janvier, lt aujourd’hui', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 12, 0));

    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    for (const id of ['ui-def-min', 'ui-def-max']) {
      const input = document.createElement('input');
      input.type = 'date';
      input.id = id;
      document.body.appendChild(input);
    }

    await mount(`
      <dsfr-data-context id="dctx682j" sources="d-src">
        <dsfr-data-context-filter field="d" operator="between" ui="ui-def-min ui-def-max"
          default="first-of-year,today">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect((document.getElementById('ui-def-min') as HTMLInputElement).value).toBe('2026-01-01');
    expect((document.getElementById('ui-def-max') as HTMLInputElement).value).toBe('2026-06-10');
    expect(box.where).toBe('d:gte:2026-01-01, d:lt:2026-06-10');
    unsub();
  });
});

describe('#682 — current-month : borne dynamique mois en cours', () => {
  afterEach(() => {
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('une checkbox cochee active la plage du mois courant, recalculee a chaque diffusion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T12:00:00Z'));

    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'ui-cm';
    document.body.appendChild(checkbox);

    const ctx = await mount(`
      <dsfr-data-context id="dctx682k" sources="d-src" url-sync>
        <dsfr-data-context-filter field="d" operator="current-month" ui="ui-cm">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(box.where).toBe('d:gte:2026-06-01, d:lt:2026-07-01');

    // Decembre bascule d'annee
    vi.setSystemTime(new Date('2026-12-20T12:00:00Z'));
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(box.where).toBe('d:gte:2026-12-01, d:lt:2027-01-01');

    // L'URL serialise l'INTENTION (« on »), jamais les dates resolues (ADR-031)
    const filter = ctx.querySelector('dsfr-data-context-filter') as never as {
      urlValue(): string;
      displayValue(): string;
    };
    expect(filter.urlValue()).toBe('on');
    expect(new URLSearchParams(window.location.search).get('d')).toBe('on');
    expect(filter.displayValue()).toBe('mois en cours');

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(box.where).toBe('');
    unsub();
  });

  it('?d=on dans l’URL recoche la case et emet le mois courant', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T12:00:00Z'));
    window.history.replaceState(null, '', '?d=on');

    fakeSource('d-src');
    const { box, unsub } = captureLast('d-src');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'ui-cm-url';
    document.body.appendChild(checkbox);

    await mount(`
      <dsfr-data-context id="dctx682l" sources="d-src" url-sync>
        <dsfr-data-context-filter field="d" operator="current-month" ui="ui-cm-url">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    expect(checkbox.checked).toBe(true);
    expect(box.where).toBe('d:gte:2026-06-01, d:lt:2026-07-01');
    unsub();
  });
});

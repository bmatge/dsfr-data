import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #678 (épic #697, ADR-104 — amende ADR-031) — facettes et recherche
 * comme filtres de dsfr-data-context : un seul bus de diffusion.
 *
 * Démonstration : la page « Comptabilité générale » du banc d'essai
 * open-data-viz, réécrite sans une seule <option> en dur — deux
 * <dsfr-data-facets context="ctx" server-facets display="…:select">
 * peuplées par l'API facettes, un contexte à deux sources cibles, une
 * sélection de région qui restreint les départements (cascade) et se
 * diffuse aux deux sources, une valeur d'URL conservée après peuplement
 * (#310 côté contexte), et une facette SANS context qui se comporte
 * exactement comme avant.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import '@/components/dsfr-data-context.js';
import '@/components/dsfr-data-context-filter.js';
import '@/components/dsfr-data-context-tags.js';
import '@/components/dsfr-data-facets.js';
import '@/components/dsfr-data-search.js';
import {
  subscribeToSourceCommands,
  dispatchDataLoaded,
  clearDataCache,
} from '@/utils/data-bridge.js';
import type { DsfrDataContext } from '@/components/dsfr-data-context.js';
import type { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import type { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import type { DsfrDataContextTags } from '@/components/dsfr-data-context-tags.js';
import type { DsfrDataContextFilter } from '@/components/dsfr-data-context-filter.js';

type Row = Record<string, string>;

interface Captured {
  where?: string;
  whereKey?: string;
  origin?: string;
}

/** Vue interne d'une facette (sélections courantes) */
interface FacetsInternals {
  _activeSelections: Record<string, Set<string>>;
}

/** Vue interne du contexte (registre des filtres) */
interface ContextInternals {
  _filters: Array<{ field: string }>;
}

/** Jeu « balances des comptes » miniature : région → départements, postes */
const ROWS: Row[] = [
  { region: 'IDF', departement: '75', postes: 'Dette financiere' },
  { region: 'IDF', departement: '92', postes: 'Immobilisations' },
  { region: 'BRE', departement: '29', postes: 'Dette financiere' },
  { region: 'BRE', departement: '35', postes: 'Tresorerie' },
  { region: 'PAC', departement: '13', postes: 'Immobilisations' },
  { region: 'PAC', departement: '83', postes: 'Tresorerie' },
];

/** Évaluateur ODSQL minimal (=, IN, like) pour le faux serveur */
function matchesOdsql(row: Row, where: string): boolean {
  if (!where.trim()) return true;
  return where.split(' AND ').every((clause) => {
    let m = /^(\w+) = "([^"]*)"$/.exec(clause.trim());
    if (m) return row[m[1]] === m[2];
    m = /^(\w+) (?:IN|in) \(([^)]*)\)$/.exec(clause.trim());
    if (m) {
      const vals = m[2].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      return vals.includes(row[m[1]]);
    }
    m = /^(\w+) like "%(.*)%"$/.exec(clause.trim());
    if (m) return (row[m[1]] ?? '').toLowerCase().includes(m[2].toLowerCase());
    return true; // comparaisons non modelisees (annee >= …) : sans effet sur le faux serveur
  });
}

function distinctCounts(rows: Row[], field: string): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r[field], (counts.get(r[field]) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ value, count }));
}

/**
 * Fausse source ODS server-side : adapter facettes (fetchFacets calcule les
 * valeurs sous le where reçu — c'est LA cascade serveur), overlays where par
 * whereKey (merge multi-émetteurs), ré-émission des données à chaque
 * commande, comme une vraie dsfr-data-source.
 */
function fakeOdsSource(id: string) {
  clearDataCache(id);
  const el = document.createElement('div');
  el.id = id;
  const overlays = new Map<string, string>();
  const commands: Captured[] = [];
  const effectiveWhere = (exclude?: string | string[]) => {
    const ex = new Set(Array.isArray(exclude) ? exclude : exclude ? [exclude] : []);
    return [...overlays]
      .filter(([k, v]) => !ex.has(k) && v)
      .map(([, v]) => v)
      .join(' AND ');
  };
  const fetchFacets = vi.fn(
    async (_params: unknown, fields: string[], where: string, _signal?: AbortSignal) => {
      const filtered = ROWS.filter((r) => matchesOdsql(r, where));
      return fields.map((field) => ({ field, values: distinctCounts(filtered, field) }));
    }
  );
  const adapter = {
    capabilities: { serverFacets: true, whereFormat: 'odsql' },
    fetchFacets,
    buildFacetWhere(selections: Record<string, Set<string>>, excludeField?: string): string {
      const parts: string[] = [];
      for (const [field, values] of Object.entries(selections)) {
        if (field === excludeField || values.size === 0) continue;
        parts.push(
          values.size === 1
            ? `${field} = "${[...values][0]}"`
            : `${field} IN (${[...values].map((v) => `"${v}"`).join(', ')})`
        );
      }
      return parts.join(' AND ');
    },
  };
  Object.assign(el, {
    getAdapter: () => adapter,
    getAdapterParams: () => ({ baseUrl: 'https://data.economie.gouv.fr', datasetId: 'balances' }),
    getEffectiveWhere: effectiveWhere,
  });
  const unsub = subscribeToSourceCommands(id, (cmd) => {
    commands.push(cmd as Captured);
    if (cmd.where !== undefined) {
      const key = cmd.whereKey || '__default';
      if (cmd.where) overlays.set(key, cmd.where);
      else overlays.delete(key);
    }
    dispatchDataLoaded(
      id,
      ROWS.filter((r) => matchesOdsql(r, effectiveWhere()))
    );
  });
  document.body.appendChild(el);
  dispatchDataLoaded(id, ROWS);
  return { el, commands, fetchFacets, overlays, effectiveWhere, unsub };
}

/** Laisse passer les microtasks de bind et les fetch de facettes (async) */
async function settle(ms = 20) {
  await new Promise((r) => setTimeout(r, ms));
}

function selectOf(facets: DsfrDataFacets, field: string): HTMLSelectElement {
  const select = facets.querySelector(`[data-field="${field}"] select`) as HTMLSelectElement | null;
  if (!select) throw new Error(`select introuvable pour ${field}`);
  return select;
}

function optionValues(select: HTMLSelectElement): string[] {
  return Array.from(select.options)
    .map((o) => o.value)
    .filter(Boolean);
}

/**
 * Valeur selectionnee lue sur l'option (attribut `selected` pose par Lit) :
 * happy-dom ne repercute pas l'attribut sur `select.value`
 */
function selectedValue(select: HTMLSelectElement): string {
  return Array.from(select.options).find((o) => o.hasAttribute('selected'))?.value ?? '';
}

function choose(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper;
}

const unsubs: Array<() => void> = [];
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const u of unsubs.splice(0)) u();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', window.location.pathname);
  errorSpy.mockRestore();
});

/**
 * La page « Comptabilité générale » : filtres en tête de page, contexte
 * déclaré APRÈS eux (comme dans le HTML réel où le contexte est posé près
 * des sources), deux sources cibles. Aucune <option> écrite à la main.
 */
const PAGE = `
  <div class="fr-grid-row">
    <dsfr-data-facets id="f-region" context="ctx" source="cg-charges" server-facets
      fields="region" labels="region:Région" display="region:select"></dsfr-data-facets>
    <dsfr-data-facets id="f-dep" context="ctx" source="cg-charges" server-facets
      fields="departement" labels="departement:Département" display="departement:select"></dsfr-data-facets>
  </div>
  <dsfr-data-context-tags for="ctx"></dsfr-data-context-tags>
  <dsfr-data-context id="ctx" sources="cg-charges cg-produits" url-sync></dsfr-data-context>
`;

describe('#678 — AC : page « Comptabilité générale » sans <option> en dur', () => {
  it('les selects sont peuplés par l’API facettes, sans une seule option écrite à la main', async () => {
    const charges = fakeOdsSource('cg-charges');
    const produits = fakeOdsSource('cg-produits');
    unsubs.push(charges.unsub, produits.unsub);

    const page = mount(PAGE);
    expect(page.innerHTML).not.toContain('<option');
    await settle();

    const fRegion = document.getElementById('f-region') as DsfrDataFacets;
    const fDep = document.getElementById('f-dep') as DsfrDataFacets;
    await fRegion.updateComplete;
    await fDep.updateComplete;

    expect(optionValues(selectOf(fRegion, 'region')).sort()).toEqual(['BRE', 'IDF', 'PAC']);
    expect(optionValues(selectOf(fDep, 'departement')).sort()).toEqual([
      '13',
      '29',
      '35',
      '75',
      '83',
      '92',
    ]);
    // Aucune erreur de config : le contexte déclaré après a bien été rejoint
    expect(fRegion.hasAttribute('data-dsfr-config-error')).toBe(false);
    expect(fDep.hasAttribute('data-dsfr-config-error')).toBe(false);
  });

  it('choisir une région diffuse aux DEUX sources (ODSQL) et restreint les départements (cascade)', async () => {
    const charges = fakeOdsSource('cg-charges');
    const produits = fakeOdsSource('cg-produits');
    unsubs.push(charges.unsub, produits.unsub);
    mount(PAGE);
    await settle();
    const fRegion = document.getElementById('f-region') as DsfrDataFacets;
    const fDep = document.getElementById('f-dep') as DsfrDataFacets;
    await fRegion.updateComplete;

    choose(selectOf(fRegion, 'region'), 'BRE');
    await settle();
    await fDep.updateComplete;

    // Diffusion par le contexte, traduite au dialecte ODSQL, aux deux cibles
    expect(charges.effectiveWhere()).toBe('region = "BRE"');
    expect(produits.effectiveWhere()).toBe('region = "BRE"');
    // La facette n'a émis AUCUNE commande directe (whereKey = son id)
    expect(charges.commands.some((c) => c.whereKey === 'f-region')).toBe(false);
    expect(charges.commands.some((c) => c.origin === 'f-region')).toBe(false);
    const viaContext = charges.commands.filter((c) => c.where === 'region = "BRE"');
    expect(viaContext.length).toBeGreaterThan(0);
    expect(viaContext[0].origin).toBe('ctx');

    // Cascade : les départements ne proposent plus que ceux de Bretagne…
    expect(optionValues(selectOf(fDep, 'departement')).sort()).toEqual(['29', '35']);
    // …tandis que la région continue de proposer toutes les régions (ses
    // propres whereKeys sont exclus du where de base de sa cascade)
    expect(optionValues(selectOf(fRegion, 'region')).sort()).toEqual(['BRE', 'IDF', 'PAC']);

    // Un seul paramètre d'URL par champ, porté par le contexte
    expect(new URLSearchParams(window.location.search).get('region')).toBe('BRE');
  });

  it('la sélection est reprise par les tags ; la croix vide le select et libère les sources', async () => {
    const charges = fakeOdsSource('cg-charges');
    const produits = fakeOdsSource('cg-produits');
    unsubs.push(charges.unsub, produits.unsub);
    mount(PAGE);
    await settle();
    const fRegion = document.getElementById('f-region') as DsfrDataFacets;
    const tags = document.querySelector('dsfr-data-context-tags') as DsfrDataContextTags;
    await fRegion.updateComplete;

    choose(selectOf(fRegion, 'region'), 'IDF');
    await settle();
    await tags.updateComplete;

    const tag = tags.querySelector('.fr-tag') as HTMLButtonElement | null;
    expect(tag?.textContent?.replace(/\s+/g, ' ')).toContain('Région');
    expect(tag?.textContent).toContain('IDF');

    tag!.click();
    await settle();
    await fRegion.updateComplete;

    expect(charges.effectiveWhere()).toBe('');
    expect(produits.effectiveWhere()).toBe('');
    expect(selectedValue(selectOf(fRegion, 'region'))).toBe('');
    expect(new URLSearchParams(window.location.search).get('region')).toBeNull();
  });

  it('une valeur pré-sélectionnée par l’URL du contexte est conservée après peuplement (#310)', async () => {
    // 75 n'est pas un département breton : il doit rester sélectionné,
    // rendu « indisponible », désactivable — pas un filtre invisible
    window.history.replaceState(null, '', '?region=BRE&departement=75');
    const charges = fakeOdsSource('cg-charges');
    const produits = fakeOdsSource('cg-produits');
    unsubs.push(charges.unsub, produits.unsub);
    mount(PAGE);
    await settle();
    const fRegion = document.getElementById('f-region') as DsfrDataFacets;
    const fDep = document.getElementById('f-dep') as DsfrDataFacets;
    await fRegion.updateComplete;
    await fDep.updateComplete;

    expect(selectedValue(selectOf(fRegion, 'region'))).toBe('BRE');
    const dep = selectOf(fDep, 'departement');
    expect(selectedValue(dep)).toBe('75');
    expect(optionValues(dep)).toContain('75');
    expect(Array.from(dep.options).find((o) => o.value === '75')?.textContent).toContain(
      'indisponible'
    );
    // Les deux sources ont reçu les deux filtres (AND, un whereKey par champ)
    expect(charges.effectiveWhere()).toContain('region = "BRE"');
    expect(charges.effectiveWhere()).toContain('departement = "75"');
    expect(produits.effectiveWhere()).toContain('departement = "75"');
  });

  it('une facette SANS context se comporte exactement comme avant (commande directe, URL propre)', async () => {
    const charges = fakeOdsSource('cg-charges');
    const produits = fakeOdsSource('cg-produits');
    unsubs.push(charges.unsub, produits.unsub);
    mount(`
      ${PAGE}
      <dsfr-data-facets id="f-solo" source="cg-produits" server-facets url-sync
        fields="postes" display="postes:select"></dsfr-data-facets>
    `);
    await settle();
    const solo = document.getElementById('f-solo') as DsfrDataFacets;
    await solo.updateComplete;
    const ctx = document.getElementById('ctx') as unknown as ContextInternals;

    choose(selectOf(solo, 'postes'), 'Tresorerie');
    await settle();

    // Commande directe à SA source, sous SON whereKey, jamais au contexte
    const direct = produits.commands.filter((c) => c.whereKey === 'f-solo');
    expect(direct.at(-1)?.where).toBe('postes = "Tresorerie"');
    expect(direct.at(-1)?.origin).toBe('f-solo');
    expect(charges.commands.some((c) => c.whereKey === 'f-solo')).toBe(false);
    expect(ctx._filters.some((f) => f.field === 'postes')).toBe(false);
    // Son url-sync propre écrit son paramètre
    expect(new URLSearchParams(window.location.search).get('postes')).toBe('Tresorerie');
  });
});

describe('#678 — forme ADR-104 §7 : une facette multi-champs sur une source dédiée aux facettes', () => {
  it('cascade interne région → département, diffusion aux cibles seulement', async () => {
    const facettes = fakeOdsSource('src-facettes');
    const charges = fakeOdsSource('cg-charges');
    const produits = fakeOdsSource('cg-produits');
    unsubs.push(facettes.unsub, charges.unsub, produits.unsub);
    mount(`
      <dsfr-data-context id="ctx" sources="cg-charges cg-produits"></dsfr-data-context>
      <dsfr-data-facets id="f-geo" context="ctx" source="src-facettes" server-facets
        fields="region,departement" display="region:select | departement:select"></dsfr-data-facets>
    `);
    await settle();
    const geo = document.getElementById('f-geo') as DsfrDataFacets;
    await geo.updateComplete;

    choose(selectOf(geo, 'region'), 'PAC');
    await settle();
    await geo.updateComplete;

    expect(optionValues(selectOf(geo, 'departement')).sort()).toEqual(['13', '83']);
    expect(charges.effectiveWhere()).toBe('region = "PAC"');
    expect(produits.effectiveWhere()).toBe('region = "PAC"');
    // La source des facettes n'est pas une cible : elle ne reçoit rien
    expect(facettes.commands.filter((c) => c.where)).toHaveLength(0);
  });
});

describe('#678 — dsfr-data-search context="ctx" : un filtre contains', () => {
  it('la frappe devient une clause contains diffusée par le contexte, sans commande directe', async () => {
    const charges = fakeOdsSource('cg-charges');
    const produits = fakeOdsSource('cg-produits');
    unsubs.push(charges.unsub, produits.unsub);
    mount(`
      <dsfr-data-search id="s-postes" context="ctx" source="cg-charges" fields="postes"
        label="Poste" debounce="0"></dsfr-data-search>
      <dsfr-data-context-tags for="ctx"></dsfr-data-context-tags>
      <dsfr-data-context id="ctx" sources="cg-charges cg-produits" url-sync></dsfr-data-context>
    `);
    await settle();
    const search = document.getElementById('s-postes') as DsfrDataSearch;
    const tags = document.querySelector('dsfr-data-context-tags') as DsfrDataContextTags;
    await search.updateComplete;

    search.search('dette');
    await settle();
    await tags.updateComplete;

    expect(charges.effectiveWhere()).toBe('postes like "%dette%"');
    expect(produits.effectiveWhere()).toBe('postes like "%dette%"');
    expect(charges.commands.some((c) => c.whereKey === 's-postes')).toBe(false);
    expect(new URLSearchParams(window.location.search).get('postes')).toBe('dette');
    expect(tags.querySelector('.fr-tag')?.textContent).toContain('dette');

    search.clear();
    await settle();
    expect(charges.effectiveWhere()).toBe('');
    expect(new URLSearchParams(window.location.search).get('postes')).toBeNull();
  });

  it('le terme initial vient de l’URL du contexte (paramètre nommé d’après le champ)', async () => {
    window.history.replaceState(null, '', '?postes=immo');
    const charges = fakeOdsSource('cg-charges');
    unsubs.push(charges.unsub);
    mount(`
      <dsfr-data-context id="ctx" sources="cg-charges" url-sync></dsfr-data-context>
      <dsfr-data-search id="s-url" context="ctx" source="cg-charges" fields="postes"></dsfr-data-search>
    `);
    await settle();
    const search = document.getElementById('s-url') as DsfrDataSearch;
    await search.updateComplete;

    expect((search.querySelector('input') as HTMLInputElement).value).toBe('immo');
    expect(charges.effectiveWhere()).toBe('postes like "%immo%"');
  });

  it('plusieurs champs en mode context → erreur de config (la clause colon ne sait pas dire « ou »)', async () => {
    const charges = fakeOdsSource('cg-charges');
    unsubs.push(charges.unsub);
    mount(`
      <dsfr-data-context id="ctx" sources="cg-charges"></dsfr-data-context>
      <dsfr-data-search id="s-multi" context="ctx" source="cg-charges" fields="postes, region"></dsfr-data-search>
    `);
    await settle();
    const search = document.getElementById('s-multi') as DsfrDataSearch;
    expect(search.hasAttribute('data-dsfr-config-error')).toBe(true);
  });
});

describe('#678 — dsfr-data-context-filter context="ctx" et opérateur contains', () => {
  it('un filtre hors du contexte, déclaré AVANT lui, s’enregistre à sa connexion', async () => {
    const charges = fakeOdsSource('cg-charges');
    unsubs.push(charges.unsub);
    const input = document.createElement('input');
    input.id = 'ui-poste';
    document.body.appendChild(input);

    mount(`
      <dsfr-data-context-filter context="ctx-late" field="postes" operator="contains" ui="ui-poste">
      </dsfr-data-context-filter>
    `);
    await settle();
    const filter = document.querySelector('dsfr-data-context-filter') as DsfrDataContextFilter;
    // Pas encore de contexte : erreur de config posée…
    expect(filter.hasAttribute('data-dsfr-config-error')).toBe(true);

    mount(`<dsfr-data-context id="ctx-late" sources="cg-charges"></dsfr-data-context>`);
    await settle();
    // …levée à la connexion du contexte
    expect(filter.hasAttribute('data-dsfr-config-error')).toBe(false);

    input.value = 'Dette';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(charges.effectiveWhere()).toBe('postes like "%Dette%"');
  });

  it('sans context, le repli closest() est inchangé', async () => {
    const charges = fakeOdsSource('cg-charges');
    unsubs.push(charges.unsub);
    const input = document.createElement('input');
    input.id = 'ui-r';
    input.value = 'IDF';
    document.body.appendChild(input);
    mount(`
      <dsfr-data-context id="ctx" sources="cg-charges">
        <dsfr-data-context-filter field="region" operator="eq" ui="ui-r"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);
    await settle();
    expect(charges.effectiveWhere()).toBe('region = "IDF"');
  });
});

describe('#678 — whereKey stable indexé sur uid + champ', () => {
  it('un filtre enregistré tard ne décale pas les clés des autres ; deux filtres sur un champ restent distincts', async () => {
    const charges = fakeOdsSource('cg-charges');
    unsubs.push(charges.unsub);
    for (const [id, v] of [
      ['ui-a', 'IDF'],
      ['ui-b', '75'],
      ['ui-c', '2020'],
      ['ui-d', '2026'],
    ]) {
      const i = document.createElement('input');
      i.id = id;
      i.value = v;
      document.body.appendChild(i);
    }
    mount(`
      <dsfr-data-context id="ctx" sources="cg-charges">
        <dsfr-data-context-filter field="region" operator="eq" ui="ui-a"></dsfr-data-context-filter>
        <dsfr-data-context-filter field="annee" operator="gte" ui="ui-c"></dsfr-data-context-filter>
        <dsfr-data-context-filter field="annee" operator="lt" ui="ui-d"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);
    await settle();
    const keysBefore = new Map(charges.commands.map((c) => [c.where, c.whereKey]));

    // Insertion tardive d'un filtre par id, hors du contexte
    mount(`
      <dsfr-data-context-filter context="ctx" field="departement" operator="eq" ui="ui-b">
      </dsfr-data-context-filter>
    `);
    await settle();

    const ctx = document.getElementById('ctx') as DsfrDataContext;
    const filters = (ctx as unknown as ContextInternals)._filters;
    expect(filters.map((f) => f.field)).toEqual(['region', 'annee', 'annee', 'departement']);

    // Les clés des premiers filtres n'ont pas bougé, celle du tardif est propre au champ
    const keysAfter = new Map(charges.commands.map((c) => [c.where, c.whereKey]));
    expect(keysAfter.get('region = "IDF"')).toBe(keysBefore.get('region = "IDF"'));
    expect(keysAfter.get('region = "IDF"')).toMatch(/-region$/);
    expect(keysAfter.get('departement = "75"')).toMatch(/-departement$/);
    // Plage annee : deux émetteurs AND distincts (ADR-031), pas « le dernier gagne »
    expect(keysAfter.get('annee >= 2020')).not.toBe(keysAfter.get('annee < 2026'));
    expect(charges.effectiveWhere()).toContain('annee >= 2020');
    expect(charges.effectiveWhere()).toContain('annee < 2026');
  });

  it('le retrait de la facette libère ses filtres (where vide sur chaque whereKey)', async () => {
    const charges = fakeOdsSource('cg-charges');
    const produits = fakeOdsSource('cg-produits');
    unsubs.push(charges.unsub, produits.unsub);
    mount(PAGE);
    await settle();
    const fRegion = document.getElementById('f-region') as DsfrDataFacets;
    await fRegion.updateComplete;
    choose(selectOf(fRegion, 'region'), 'IDF');
    await settle();
    expect(charges.effectiveWhere()).toBe('region = "IDF"');
    const internals = fRegion as unknown as FacetsInternals;
    expect([...internals._activeSelections.region]).toEqual(['IDF']);

    fRegion.remove();
    expect(charges.effectiveWhere()).toBe('');
    expect(produits.effectiveWhere()).toBe('');
    const ctx = document.getElementById('ctx') as unknown as ContextInternals;
    expect(ctx._filters.some((f) => f.field === 'region')).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  splitColonFields,
  isMultiFieldClause,
  filterToOdsql,
  escapeColonValue,
} from '@/utils/where.js';
import { applyLocalFilter, validateColonFilter } from '@dsfr-data/shared/lib';
import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import { GristAdapter } from '@/adapters/grist-adapter.js';
import { InseeAdapter } from '@/adapters/insee-adapter.js';
import { GenericAdapter } from '@/adapters/generic-adapter.js';
import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import {
  clearDataCache,
  dispatchDataLoaded,
  getDataCache,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';
import type { AdapterParams, ApiAdapter, ServerSideOverlay } from '@/adapters/api-adapter.js';

/**
 * #1026 — la grammaire « champs multiples » `a|b:op:valeur` : le MÊME
 * opérateur et la MÊME valeur sur plusieurs champs, reliés par un OU. Chaque
 * adaptateur la traduit (Tabular `or=(…)`, ODSQL et Grist SQL `(… OR …)`) ou
 * la refuse explicitement (INSEE, generic) pour laisser le filtre au client.
 */

function params(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: 'https://tabular-api.data.gouv.fr',
    datasetId: 'ds',
    resource: 'res',
    select: '',
    where: '',
    filter: '',
    groupBy: '',
    aggregate: '',
    orderBy: '',
    limit: 0,
    transform: '',
    pageSize: 20,
    ...overrides,
  };
}

function overlay(effectiveWhere: string): ServerSideOverlay {
  return { page: 1, effectiveWhere, orderBy: '' };
}

const LIGNES = [
  { nom: 'MARTIN', prenom: 'Jean' },
  { nom: 'DUPONT', prenom: 'Martine' },
  { nom: 'MARTINEZ', prenom: 'Martin' },
  { nom: 'DURAND', prenom: 'Paul' },
  { nom: null, prenom: 'Martin' },
];

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
});

describe('#1026 — grammaire des champs multiples', () => {
  it('splitColonFields découpe sur | et ignore les blancs', () => {
    expect(splitColonFields('nom|prenom')).toEqual(['nom', 'prenom']);
    expect(splitColonFields(' nom | prenom ')).toEqual(['nom', 'prenom']);
    expect(splitColonFields('nom')).toEqual(['nom']);
  });

  it('isMultiFieldClause ne regarde que le champ, jamais la valeur', () => {
    expect(isMultiFieldClause('nom|prenom:contains:x')).toBe(true);
    expect(isMultiFieldClause('nom:in:a|b')).toBe(false);
    expect(isMultiFieldClause('nom:contains:a%7Cb')).toBe(false);
  });

  it('validateColonFilter refuse un champ vide dans la liste', () => {
    expect(validateColonFilter('nom|prenom:contains:x')).toBeNull();
    expect(validateColonFilter('nom|:contains:x')).toMatch(/champ vide/);
    expect(validateColonFilter('|nom:contains:x')).toMatch(/champ vide/);
  });
});

describe('#1026 — filtre client (applyLocalFilter)', () => {
  it('un OU entre les champs, un ET entre les clauses', () => {
    const r = applyLocalFilter(LIGNES, 'nom|prenom:contains:martin');
    // MARTIN, Martine, MARTINEZ/Martin, null/Martin — pas DURAND
    expect(r).toHaveLength(4);
    const et = applyLocalFilter(LIGNES, 'nom|prenom:contains:martin, nom:contains:dur');
    expect(et).toHaveLength(0);
    const et2 = applyLocalFilter(LIGNES, 'nom|prenom:contains:martin, prenom:eq:Jean');
    expect(et2).toEqual([{ nom: 'MARTIN', prenom: 'Jean' }]);
  });

  it('une clause à un champ est inchangée', () => {
    expect(applyLocalFilter(LIGNES, 'nom:contains:martin')).toHaveLength(2);
  });

  it('isnull sur plusieurs champs : l’un OU l’autre absent', () => {
    expect(applyLocalFilter(LIGNES, 'nom|prenom:isnull')).toHaveLength(1);
  });

  it('in sur plusieurs champs : | sépare les champs AVANT le premier :, les valeurs APRÈS', () => {
    const r = applyLocalFilter(LIGNES, 'nom|prenom:in:Paul|Jean');
    expect(r.map((l) => l.nom)).toEqual(['MARTIN', 'DURAND']);
  });
});

describe('#1026 — Opendatasoft : ODSQL `(… OR …)`', () => {
  it('filterToOdsql parenthèse le OU', () => {
    expect(filterToOdsql('nom|prenom:contains:martin')).toBe(
      '(nom like "%martin%" OR prenom like "%martin%")'
    );
    expect(filterToOdsql('nom|prenom:eq:X, dept:eq:75')).toBe(
      '(nom = "X" OR prenom = "X") AND dept = "75"'
    );
  });

  it('isnull et in se traduisent champ par champ', () => {
    expect(filterToOdsql('a|b:isnull')).toBe('(a is null OR b is null)');
    expect(filterToOdsql('a|b:in:x|y')).toBe('(a in ("x", "y") OR b in ("x", "y"))');
  });

  it('l’adaptateur ODS ne refuse rien (supportsServerWhere non implémenté)', () => {
    const ods: ApiAdapter = new OpenDataSoftAdapter();
    expect(ods.supportsServerWhere).toBeUndefined();
  });
});

describe('#1026 — Tabular : `or=(a__op.v,b__op.v)`', () => {
  const adapter = new TabularAdapter();

  it('traduit la clause en un groupe or=, mesuré sur l’API (351 = 189 + 164 − 2)', () => {
    const url = new URL(
      adapter.buildUrl(params({ where: "Nom de l'élu|Prénom de l'élu:contains:MARTIN" }), 1, 1)
    );
    expect(url.searchParams.get('or')).toBe(
      "(Nom de l'élu__contains.MARTIN,Prénom de l'élu__contains.MARTIN)"
    );
    // Aucun paramètre `champ__op` parasite pour la clause multi-champs
    expect([...url.searchParams.keys()].filter((k) => k.includes('|'))).toEqual([]);
  });

  it('compose en ET avec une clause à un champ, et en pagination serveur', () => {
    const where = 'nom|prenom:contains:martin, sexe:eq:F';
    const url = new URL(adapter.buildServerSideUrl(params(), overlay(where)));
    expect(url.searchParams.get('or')).toBe('(nom__contains.martin,prenom__contains.martin)');
    expect(url.searchParams.get('sexe__exact')).toBe('F');
  });

  it('mappe l’opérateur comme une clause simple (eq → exact, isnull sans valeur)', () => {
    const eq = new URL(adapter.buildUrl(params({ where: 'a|b:eq:X' }), 1, 1));
    expect(eq.searchParams.get('or')).toBe('(a__exact.X,b__exact.X)');
    const nul = new URL(adapter.buildUrl(params({ where: 'a|b:isnull' }), 1, 1));
    expect(nul.searchParams.get('or')).toBe('(a__isnull,b__isnull)');
  });

  it('cite une colonne à point, forme prévue par l’API', () => {
    const url = new URL(adapter.buildUrl(params({ where: 'Foo.Bar|nom:contains:x' }), 1, 1));
    expect(url.searchParams.get('or')).toBe('("Foo.Bar"__contains.x,nom__contains.x)');
  });

  it('une valeur à espace ou apostrophe passe (mesuré : DE LA → 33, D’ → 41)', () => {
    expect(adapter.supportsServerWhere('a|b:contains:DE LA')).toBe(true);
    expect(adapter.supportsServerWhere("a|b:contains:D'")).toBe(true);
  });

  it('refuse une valeur que or= ne sait pas transporter (mesuré : , et . → 400, "…" → 0)', () => {
    for (const valeur of ['A,B', 'J.', '"J."', 'a(b', 'x&y']) {
      const where = `a|b:contains:${escapeColonValue(valeur)}`;
      expect(adapter.supportsServerWhere(where), valeur).toBe(false);
      const url = new URL(adapter.buildUrl(params({ where }), 1, 1));
      expect(url.searchParams.has('or'), valeur).toBe(false);
    }
    expect(warnSpy).toHaveBeenCalled();
  });

  it('refuse in / notin (liste à virgules) et plus d’une clause multi-champs', () => {
    expect(adapter.supportsServerWhere('a|b:in:x|y')).toBe(false);
    expect(adapter.supportsServerWhere('a|b:notin:x')).toBe(false);
    expect(adapter.supportsServerWhere('a|b:contains:x, c|d:contains:y')).toBe(false);
    const url = new URL(
      adapter.buildUrl(params({ where: 'a|b:contains:x, c|d:contains:y' }), 1, 1)
    );
    expect(url.searchParams.getAll('or')).toEqual(['(a__contains.x,b__contains.x)']);
  });

  it('une clause à un champ reste toujours délégable', () => {
    expect(adapter.supportsServerWhere('a:contains:J., b:in:x|y')).toBe(true);
  });

  it('gabarit de recherche serveur par défaut : {fields}:contains:{q}', () => {
    expect(adapter.getDefaultSearchTemplate()).toBe('{fields}:contains:{q}');
    expect(adapter.capabilities.serverSearch).toBe(true);
  });
});

describe('#1026 — Grist : SQL `(… OR …)`, filtre Records jamais', () => {
  const adapter = new GristAdapter();

  it('le SQL relie les champs par OR, arguments dans l’ordre des ?', () => {
    const args: (string | number)[] = [];
    const sql = adapter._colonWhereToSql('nom|prenom:contains:martin, dept:eq:75', args);
    expect(sql).toBe('("nom" LIKE ? OR "prenom" LIKE ?) AND "dept" = ?');
    expect(args).toEqual(['%martin%', '%martin%', '75']);
  });

  it('le filtre Records ignore la clause, qui force le mode SQL', () => {
    expect(adapter._colonWhereToGristFilter('nom|prenom:eq:X')).toBeNull();
    expect(adapter._colonWhereToGristFilter('nom|prenom:eq:X, dept:eq:75')).toEqual({
      dept: ['75'],
    });
    const internal = adapter as unknown as {
      _needsSqlMode(p: AdapterParams): boolean;
    };
    expect(internal._needsSqlMode(params({ where: 'nom|prenom:eq:X' }))).toBe(true);
  });
});

describe('#1026 — INSEE et generic : refus explicite, filtre client', () => {
  it('INSEE ne pose jamais de paramètre de dimension `a|b`', () => {
    const insee = new InseeAdapter();
    expect(insee.supportsServerWhere('GEO|TIME_PERIOD:eq:2023')).toBe(false);
    expect(insee.supportsServerWhere('GEO:eq:FRANCE-F')).toBe(true);
    const url = new URL(
      insee.buildUrl(params({ where: 'GEO|TIME_PERIOD:eq:2023, SEXE:eq:F', datasetId: 'D' }))
    );
    expect([...url.searchParams.keys()].some((k) => k.includes('|'))).toBe(false);
    expect(url.searchParams.get('SEXE')).toBe('F');
  });

  it('generic refuse la clause multi-champs', () => {
    const generic = new GenericAdapter();
    expect(generic.supportsServerWhere('a|b:contains:x')).toBe(false);
    expect(generic.supportsServerWhere('a:contains:x')).toBe(true);
  });
});

/** Vue interne de dsfr-data-query limitée à ce que ces tests inspectent. */
interface QueryInternals {
  _applyFilters(data: Record<string, unknown>[], expr: string): Record<string, unknown>[];
  _validateFilterExpr(expr: string): string | null;
  _buildWhereDelegation(
    expr: string,
    format: 'odsql' | 'colon',
    adapter?: ApiAdapter
  ): { ok: boolean; where: string; fields: string[] };
}

describe('#1026 — dsfr-data-query', () => {
  const query = new DsfrDataQuery() as unknown as QueryInternals;

  it('filtre client en OU entre les champs', () => {
    expect(query._applyFilters(LIGNES, 'nom|prenom:contains:martin')).toHaveLength(4);
    expect(query._applyFilters(LIGNES, 'nom|prenom:eq:Martin')).toHaveLength(2);
  });

  it('valide la grammaire (champ vide refusé)', () => {
    expect(query._validateFilterExpr('nom|prenom:contains:x')).toBeNull();
    expect(query._validateFilterExpr('nom|:contains:x')).toMatch(/champ vide/);
  });

  it('délègue à Tabular avec les champs découpés', () => {
    const d = query._buildWhereDelegation('nom|prenom:contains:x', 'colon', new TabularAdapter());
    expect(d).toEqual({ ok: true, where: 'nom|prenom:contains:x', fields: ['nom', 'prenom'] });
  });

  it('traduit en ODSQL pour Opendatasoft', () => {
    const d = query._buildWhereDelegation(
      'nom|prenom:contains:x',
      'odsql',
      new OpenDataSoftAdapter()
    );
    expect(d.where).toBe('(nom like "%x%" OR prenom like "%x%")');
  });

  it('ne délègue rien quand l’adaptateur refuse (INSEE, valeur intransmissible)', () => {
    expect(query._buildWhereDelegation('a|b:eq:x', 'colon', new InseeAdapter()).ok).toBe(false);
    expect(
      query._buildWhereDelegation('a|b:contains:A%2CB', 'colon', new TabularAdapter()).ok
    ).toBe(false);
  });
});

/** Vue interne de dsfr-data-search limitée à ce que ces tests pilotent. */
interface SearchInternals {
  _term: string;
  _applyFilter(): void;
  _cleanup?: () => void;
}

describe('#1026 — dsfr-data-search en server-search sur Tabular', () => {
  const sourceId = 'src-1026';
  let source: HTMLElement;
  let search: DsfrDataSearch;
  let internals: SearchInternals;
  let commandes: Array<{ where?: string }>;
  let unsub: () => void;

  beforeEach(() => {
    source = document.createElement('div');
    source.id = sourceId;
    const tabular = new TabularAdapter();
    Object.assign(source, { getAdapter: () => tabular });
    document.body.appendChild(source);
    commandes = [];
    unsub = subscribeToSourceCommands(sourceId, (cmd) => {
      commandes.push(cmd);
    });
    search = new DsfrDataSearch();
    internals = search as unknown as SearchInternals;
    search.id = 'r-1026';
    search.source = sourceId;
    search.serverSearch = true;
    search.fields = 'nom, prenom';
    search.debounce = 0;
  });

  afterEach(() => {
    unsub();
    internals._cleanup?.();
    source.remove();
    clearDataCache(sourceId);
    clearDataCache('r-1026');
  });

  it('lit le gabarit {fields}:contains:{q} de l’adaptateur et envoie a|b:contains:q', () => {
    search.connectedCallback();
    expect(search.searchTemplate).toBe('{fields}:contains:{q}');
    internals._term = 'martin';
    internals._applyFilter();
    expect(commandes.at(-1)?.where).toBe('nom|prenom:contains:martin');
  });

  it('retombe en recherche locale, signalée, sur un terme que or= ne transporte pas', () => {
    search.connectedCallback();
    dispatchDataLoaded(sourceId, LIGNES);
    internals._term = 'mar.tin';
    internals._applyFilter();
    // La clause serveur de la recherche est levée, jamais envoyée
    expect(commandes.at(-1)?.where).toBe('');
    expect(warnSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('server-search'))).toBe(
      true
    );
    // Filtre local : aucune ligne ne contient « mar.tin »
    expect(getDataCache('r-1026')).toEqual([]);
    // Un terme transmissible repasse au serveur
    internals._term = 'martin';
    internals._applyFilter();
    expect(commandes.at(-1)?.where).toBe('nom|prenom:contains:martin');
  });

  it('{fields} sans fields : repli local, jamais une clause « :contains:q »', () => {
    search.fields = '';
    search.connectedCallback();
    internals._term = 'martin';
    internals._applyFilter();
    expect(commandes.every((c) => !c.where)).toBe(true);
  });
});

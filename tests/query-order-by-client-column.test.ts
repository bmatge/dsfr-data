import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #1244 — `order-by` sur une colonne PRODUITE CÔTÉ CLIENT.
 *
 * `aggregate="n:share_percent" order-by="n__share_percent:desc"`, sans
 * `group-by` : la query déléguait le tri au serveur sur une colonne qu'il ne
 * connaît pas, et sautait le tri client. Mesuré contre les faux serveurs du
 * dépôt (2026-10-04) : Opendatasoft et Grist recevaient `order_by=` / `sort=`
 * sur la colonne de part, Tabular refusait la requête (colonne inconnue, comme
 * l'API) et n'affichait plus rien. Et sur AUCUN adaptateur — générique compris,
 * regroupement compris — les lignes n'étaient triées : le tri client passait
 * avant le calcul de la colonne.
 *
 * Règle : un tri qui nomme une colonne de fenêtre (part, cumul, écart) n'est
 * jamais délégué, et il est appliqué côté client APRÈS son calcul.
 */

import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { subscribeToSourceCommands } from '@/utils/data-bridge.js';
import { getAdapter } from '@/adapters/adapter-registry.js';

/** Vue interne : le traitement client et la négociation sont privés. */
interface QueryInternals {
  _processClientSide(): void;
  _negotiateServerSide(): void;
  _serverDelegated: { groupBy: boolean; aggregate: boolean; orderBy: boolean; where: boolean };
  _rawData: Record<string, unknown>[];
  beforeTransformerSubscribe(): void;
}

/** Six lignes dont l'ordre reçu n'est celui d'aucune colonne. */
const LIGNES: Record<string, unknown>[] = [
  { mois: 'mars', zone: 'B', n: 30 },
  { mois: 'janvier', zone: 'A', n: 10 },
  { mois: 'juin', zone: 'B', n: 60 },
  { mois: 'février', zone: 'A', n: 20 },
  { mois: 'mai', zone: 'A', n: 50 },
  { mois: 'avril', zone: 'B', n: 40 },
];

const SOURCE = 'tri-client-source';

describe('#1244 — order-by sur une colonne produite côté client', () => {
  let query: DsfrDataQuery;
  let internals: QueryInternals;
  let commands: Array<Record<string, unknown>>;
  let unsubscribe: () => void;

  function brancher(apiType: string): void {
    const source = document.createElement('div');
    source.id = SOURCE;
    (source as unknown as { getAdapter: () => unknown }).getAdapter = () => getAdapter(apiType);
    document.body.appendChild(source);
    unsubscribe = subscribeToSourceCommands(SOURCE, (cmd) => commands.push(cmd));
  }

  function resultat(): Record<string, unknown>[] {
    internals._rawData = LIGNES;
    internals._processClientSide();
    return query.getData() as Record<string, unknown>[];
  }

  beforeEach(() => {
    query = new DsfrDataQuery();
    internals = query as unknown as QueryInternals;
    query.id = 'tri-client-query';
    query.source = SOURCE;
    commands = [];
  });

  afterEach(() => {
    unsubscribe?.();
    document.getElementById(SOURCE)?.remove();
    if (query.isConnected) query.disconnectedCallback();
    vi.restoreAllMocks();
  });

  describe.each(['opendatasoft', 'tabular', 'grist', 'generic', 'insee'])(
    'adaptateur %s',
    (apiType) => {
      beforeEach(() => brancher(apiType));

      it('part sans group-by : le tri n’est pas délégué, et il est appliqué', () => {
        query.aggregate = 'n:share_percent';
        query.orderBy = 'n__share_percent:desc';
        internals._negotiateServerSide();

        expect(internals._serverDelegated.orderBy).toBe(false);
        expect(commands.some((c) => 'orderBy' in c && c.orderBy)).toBe(false);
        expect(resultat().map((r) => r.n)).toEqual([60, 50, 40, 30, 20, 10]);
      });

      it('cumul trié sur lui-même : calculé dans l’ordre reçu, puis trié, sans délégation', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        query.aggregate = 'n:running_sum';
        query.orderBy = 'n__running_sum:desc';
        internals._negotiateServerSide();

        expect(internals._serverDelegated.orderBy).toBe(false);
        expect(commands.some((c) => 'orderBy' in c && c.orderBy)).toBe(false);
        // Ordre reçu : 30, 10, 60, 20, 50, 40 → cumuls 30, 40, 100, 120, 170, 210.
        expect(resultat().map((r) => r.n__running_sum)).toEqual([210, 170, 120, 100, 40, 30]);
      });

      it('écart (diff) trié sur lui-même : la première ligne, sans écart, passe en dernier', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        query.aggregate = 'n:diff';
        query.orderBy = 'n__diff:desc';
        internals._negotiateServerSide();

        expect(internals._serverDelegated.orderBy).toBe(false);
        // Écarts dans l'ordre reçu : null, -20, 50, -40, 30, -10.
        expect(resultat().map((r) => r.n__diff)).toEqual([50, 30, -10, -20, -40, null]);
      });

      it('part après un group-by : le tri sur la part des groupes est appliqué', () => {
        query.groupBy = 'zone';
        query.aggregate = 'n:sum, n__sum:share_percent';
        query.orderBy = 'n__sum__share_percent:asc';
        internals._negotiateServerSide();

        expect(internals._serverDelegated).toMatchObject({ groupBy: false, orderBy: false });
        // A = 80 sur 210, B = 130 sur 210 : B est reçu en premier, A doit passer devant.
        expect(resultat().map((r) => r.zone)).toEqual(['A', 'B']);
      });

      it('alias écrit (`n:share_percent:part`) : même règle sous le nom choisi', () => {
        query.aggregate = 'n:share_percent:part';
        query.orderBy = 'part:asc';
        internals._negotiateServerSide();

        expect(internals._serverDelegated.orderBy).toBe(false);
        expect(resultat().map((r) => r.n)).toEqual([10, 20, 30, 40, 50, 60]);
      });

      it('tri à deux clés, dont une de fenêtre : rien n’est délégué, les deux clés jouent', () => {
        query.aggregate = 'n:share_percent';
        query.orderBy = 'zone:desc, n__share_percent:desc';
        internals._negotiateServerSide();

        expect(internals._serverDelegated.orderBy).toBe(false);
        expect(resultat().map((r) => `${String(r.zone)}${String(r.n)}`)).toEqual([
          'B60',
          'B40',
          'B30',
          'A50',
          'A20',
          'A10',
        ]);
      });

      it('cumul trié sur une VRAIE colonne : le cumul suit le tri, comme avant', () => {
        query.aggregate = 'n:running_sum';
        query.orderBy = 'n:asc';
        internals._negotiateServerSide();

        // Seuls les adaptateurs qui savent trier prennent ce tri-là : la colonne existe.
        expect(internals._serverDelegated.orderBy).toBe(
          getAdapter(apiType)?.capabilities.serverOrderBy === true
        );
        // Le serveur a (ou aurait) trié : ici les lignes arrivent dans l'ordre demandé.
        internals._rawData = [...LIGNES].sort((a, b) => Number(a.n) - Number(b.n));
        internals._processClientSide();
        const lignes = query.getData() as Record<string, unknown>[];
        expect(lignes.map((r) => r.n__running_sum)).toEqual([10, 30, 60, 100, 150, 210]);
      });
    }
  );

  describe('cumul dont le tri ne nomme que sa propre colonne', () => {
    beforeEach(() => brancher('generic'));

    it('est signalé : le cumul suit l’ordre des lignes reçues', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      query.aggregate = 'n:running_sum';
      query.orderBy = 'n__running_sum:desc';
      internals.beforeTransformerSubscribe();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain("l'ordre des lignes reçues");
    });

    it('une part triée sur elle-même n’avertit pas : son calcul ne dépend pas de l’ordre', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      query.aggregate = 'n:share_percent';
      query.orderBy = 'n__share_percent:desc';
      internals.beforeTransformerSubscribe();

      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('colonne issue d’un compute (dsfr-data-normalize en amont)', () => {
    it.each(['opendatasoft', 'tabular', 'grist'])(
      '%s : le relais transforme le schéma, le tri reste côté client et il est appliqué',
      (apiType) => {
        // Le relais : un normalize qui fabrique `double`, devant une source qui sait trier.
        const relais = document.createElement('div');
        relais.id = SOURCE;
        Object.assign(relais as unknown as Record<string, unknown>, {
          getAdapter: () => getAdapter(apiType),
          transformsSchema: () => true,
        });
        document.body.appendChild(relais);
        unsubscribe = subscribeToSourceCommands(SOURCE, (cmd) => commands.push(cmd));

        query.orderBy = 'double:desc';
        internals._negotiateServerSide();

        expect(internals._serverDelegated.orderBy).toBe(false);
        expect(commands.some((c) => 'orderBy' in c && c.orderBy)).toBe(false);
        internals._rawData = LIGNES.map((l) => ({ ...l, double: Number(l.n) * 2 }));
        internals._processClientSide();
        const lignes = query.getData() as Record<string, unknown>[];
        expect(lignes.map((r) => r.double)).toEqual([120, 100, 80, 60, 40, 20]);
      }
    );
  });
});

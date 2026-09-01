/**
 * Normalisation des widgets lus depuis le stockage (#521).
 *
 * Ce fichier protege des DONNEES REELLES : les dashboards vivent en
 * localStorage ET en base (MariaDB), et sont partageables entre utilisateurs.
 * Renommer `valeur`/`icone`/`chartType` sans lire l'ancienne forme casserait
 * des dashboards existants, y compris ceux d'autres comptes.
 *
 * Les cas « forme historique » ci-dessous sont donc la vraie raison d'etre du
 * normaliseur, pas un ornement : ils reproduisent ce que contient reellement
 * le stockage avant #521.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeWidget,
  normalizeDashboard,
  createWidget,
  getDefaultConfig,
  isFavoriteChart,
} from '../../../apps/dashboard/src/state';
import type { DashboardData } from '../../../apps/dashboard/src/state';

describe('normalizeWidget (#521)', () => {
  describe('forme historique — dashboards enregistres avant le refactor', () => {
    it('convertit un KPI `valeur`/`icone` vers `value`/`icon`', () => {
      const widget = normalizeWidget({
        id: 'w1',
        type: 'kpi',
        title: 'Population',
        position: { row: 0, col: 0 },
        config: {
          valeur: 'sum:population',
          label: 'Total',
          format: 'nombre',
          icone: 'ri-user-line',
        },
      });

      expect(widget).not.toBeNull();
      expect(widget?.type).toBe('kpi');
      expect(widget?.config).toEqual({
        value: 'sum:population',
        label: 'Total',
        format: 'nombre',
        icon: 'ri-user-line',
      });
    });

    it('convertit un graphique `chartType` vers `type`', () => {
      const widget = normalizeWidget({
        id: 'w2',
        type: 'chart',
        title: 'Evolution',
        position: { row: 1, col: 0 },
        config: {
          chartType: 'line',
          labelField: 'annee',
          valueField: 'budget',
          palette: 'divergent',
        },
      });

      expect(widget?.type).toBe('chart');
      expect(widget?.config).toEqual({
        type: 'line',
        labelField: 'annee',
        valueField: 'budget',
        palette: 'divergent',
      });
    });

    it('preserve un graphique issu d’un favori avec son HTML genere', () => {
      const widget = normalizeWidget({
        id: 'w3',
        type: 'chart',
        title: 'Depuis favori',
        position: { row: 0, col: 1 },
        config: {
          fromFavorite: true,
          favoriteId: 'fav-1',
          code: '<dsfr-data-chart type="bar"></dsfr-data-chart>',
          builderState: { some: 'state' },
        },
      });

      expect(widget?.type).toBe('chart');
      const config = widget?.type === 'chart' ? widget.config : null;
      expect(config && isFavoriteChart(config)).toBe(true);
      expect(config).toMatchObject({
        fromFavorite: true,
        favoriteId: 'fav-1',
        code: '<dsfr-data-chart type="bar"></dsfr-data-chart>',
      });
    });

    it('accepte l’ancien `builderState` comme le recent `builderStateJson`', () => {
      const legacy = normalizeWidget({
        id: 'a',
        type: 'chart',
        position: { row: 0, col: 0 },
        config: { fromFavorite: true, favoriteId: 'f', code: 'x', builderState: { v: 1 } },
      });
      const recent = normalizeWidget({
        id: 'b',
        type: 'chart',
        position: { row: 0, col: 0 },
        config: { fromFavorite: true, favoriteId: 'f', code: 'x', builderStateJson: { v: 1 } },
      });

      const stateOf = (w: ReturnType<typeof normalizeWidget>) =>
        w?.type === 'chart' && isFavoriteChart(w.config) ? w.config.builderState : undefined;
      expect(stateOf(legacy)).toEqual({ v: 1 });
      expect(stateOf(recent)).toEqual({ v: 1 });
    });
  });

  describe('forme courante — idempotence', () => {
    it('laisse un widget deja normalise inchange', () => {
      const widget = createWidget('kpi', 2, 1);
      expect(normalizeWidget(widget)).toEqual(widget);
    });

    it.each(['kpi', 'chart', 'table', 'text'] as const)(
      'normaliser deux fois un widget %s donne le meme resultat',
      (type) => {
        const once = normalizeWidget(createWidget(type, 0, 0));
        expect(normalizeWidget(once)).toEqual(once);
      }
    );
  });

  describe('robustesse — le stockage n’est pas du code', () => {
    it('ecarte un type de widget inconnu', () => {
      expect(normalizeWidget({ id: 'x', type: 'sparkline', config: {} })).toBeNull();
    });

    it.each([null, undefined, 'texte', 42, []])('ecarte une entree non-objet (%s)', (raw) => {
      expect(normalizeWidget(raw)).toBeNull();
    });

    it('complete un widget incomplet plutot que de le rejeter', () => {
      // Perdre un dashboard entier pour un champ manquant serait pire que
      // l'afficher degrade.
      const widget = normalizeWidget({ type: 'kpi' });
      expect(widget?.title).toBe('Indicateur');
      expect(widget?.position).toEqual({ row: 0, col: 0 });
      expect(widget?.id).toBeTruthy();
    });

    it('n’invente pas de contenu absent du stockage', () => {
      // Distinction volontaire avec `getDefaultConfig`, qui sert a POSER un
      // widget neuf et propose donc un libelle d'amorce (« Mon KPI »).
      // Normaliser lit des donnees existantes : un champ absent reste vide,
      // sinon on afficherait a l'utilisateur un libelle qu'il n'a jamais saisi.
      const widget = normalizeWidget({ type: 'kpi', config: {} });
      expect(widget?.config).toEqual({ value: '', label: '', format: 'nombre', icon: '' });
      expect(getDefaultConfig('kpi').label).toBe('Mon KPI');
    });

    it('ramene une enumeration hors bornes a son defaut', () => {
      const widget = normalizeWidget({
        id: 'x',
        type: 'chart',
        position: { row: 0, col: 0 },
        config: { chartType: 'camembert-3d', palette: 'arc-en-ciel' },
      });
      expect(widget?.config).toMatchObject({ type: 'bar', palette: 'categorical' });
    });

    it('filtre les colonnes non textuelles d’un tableau', () => {
      const widget = normalizeWidget({
        id: 'x',
        type: 'table',
        position: { row: 0, col: 0 },
        config: { columns: ['nom', 42, null, 'code'] },
      });
      expect(widget?.config).toMatchObject({ columns: ['nom', 'code'] });
    });

    it('conserve searchable/sortable a true par defaut, false si explicite', () => {
      const parDefaut = normalizeWidget({ id: 'a', type: 'table', config: {} });
      const explicite = normalizeWidget({
        id: 'b',
        type: 'table',
        config: { searchable: false, sortable: false },
      });
      expect(parDefaut?.config).toMatchObject({ searchable: true, sortable: true });
      expect(explicite?.config).toMatchObject({ searchable: false, sortable: false });
    });
  });

  describe('normalizeDashboard', () => {
    it('convertit tous les widgets et ecarte les entrees invalides', () => {
      const stored = {
        id: 'd1',
        name: 'Mon tableau',
        widgets: [
          { id: 'a', type: 'kpi', config: { valeur: '1', icone: 'ri-x' } },
          { id: 'b', type: 'sparkline', config: {} },
          { id: 'c', type: 'chart', config: { chartType: 'pie' } },
        ],
      } as unknown as DashboardData;

      const result = normalizeDashboard(stored);

      expect(result.widgets).toHaveLength(2);
      expect(result.widgets[0].config).toMatchObject({ value: '1', icon: 'ri-x' });
      expect(result.widgets[1].config).toMatchObject({ type: 'pie' });
      // Les metadonnees du dashboard ne sont pas touchees.
      expect(result.name).toBe('Mon tableau');
      expect(result.id).toBe('d1');
    });

    it('supporte un dashboard sans widgets', () => {
      const result = normalizeDashboard({ id: 'd', name: 'vide' } as unknown as DashboardData);
      expect(result.widgets).toEqual([]);
    });
  });
});

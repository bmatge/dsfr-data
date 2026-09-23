/**
 * « Éditer dans le Builder » depuis le tableau de bord (#978) : parcours joué
 * de bout en bout, sans navigateur. Le tableau de bord dépose l'état et navigue ;
 * on reprend l'origine qu'il a réellement passée à `navigateTo`, on la pose dans
 * l'adresse, et le Builder doit relire l'état — pas s'ouvrir vierge en silence.
 *
 * Preuve de mutation : retirer `'dashboard'` de `ORIGINES_ETAT_DEPOSE`
 * (apps/builder/src/etat-depose.ts) rend le premier test rouge.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { navigateTo, toastWarning, toastError } = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@dsfr-data/shared', async (importOriginal) => {
  const reel = await importOriginal<Record<string, unknown>>();
  return { ...reel, navigateTo, toastWarning, toastError };
});
vi.mock('../../../apps/builder/src/ui/chart-type-selector', () => ({
  selectChartType: vi.fn(),
}));
vi.mock('../../../apps/builder/src/sources-fields', () => ({
  populateFieldSelects: vi.fn(),
}));
vi.mock('../../../apps/builder/src/ui/chart-renderer', () => ({
  renderChart: vi.fn(),
}));
vi.mock('../../../apps/builder/src/ui/code-generator', () => ({
  generateCodeForLocalData: vi.fn(),
  getLastGeneratedCode: vi.fn(() => ''),
}));

import { loadFavoriteState } from '../../../apps/builder/src/sources';
import { state as etatBuilder } from '../../../apps/builder/src/state';
import { openInBuilder } from '../../../apps/dashboard/src/widgets';
import { state as etatDashboard } from '../../../apps/dashboard/src/state';
import type { Widget } from '../../../apps/dashboard/src/state';

function widgetFavori(id: string, builderState: unknown): Widget {
  return {
    id,
    type: 'chart',
    title: 'Widget',
    position: { row: 0, col: 0 },
    config: { fromFavorite: true, favoriteId: 'fav-1', code: '<p></p>', builderState },
  };
}

/** Rejoue la navigation demandée par le tableau de bord : pose `?from=` dans l'adresse. */
function suivreLaNavigation(): void {
  expect(navigateTo).toHaveBeenCalledTimes(1);
  const [cible, params] = navigateTo.mock.calls[0] as [string, Record<string, string>];
  expect(cible).toBe('builder');
  window.history.replaceState(null, '', `/?${new URLSearchParams(params).toString()}`);
}

describe('tableau de bord → Builder (#978)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/');
    document.body.innerHTML = `<input id="chart-title"><input id="chart-subtitle">`;
    etatBuilder.title = 'Mon graphique';
    etatBuilder.subtitle = '';
    etatBuilder.chartType = 'bar';
    etatBuilder.fields = [];
    etatBuilder.data = [];
    etatDashboard.dashboard.widgets = [];
  });

  it("relit l'état déposé par le tableau de bord : titre et type restaurés", async () => {
    etatDashboard.dashboard.widgets.push(
      widgetFavori('w1', { chartType: 'pie', title: 'TEMOIN DASHBOARD', subtitle: 'Sous-titre' })
    );

    openInBuilder('w1');
    suivreLaNavigation();
    await loadFavoriteState();

    expect(etatBuilder.title).toBe('TEMOIN DASHBOARD');
    expect(etatBuilder.chartType).toBe('pie');
    expect((document.getElementById('chart-title') as HTMLInputElement).value).toBe(
      'TEMOIN DASHBOARD'
    );
    expect(sessionStorage.getItem('builder-state')).toBeNull();
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it('prévient au lieu de s’ouvrir vierge quand le widget porte une carte à couches', async () => {
    etatDashboard.dashboard.widgets.push(
      widgetFavori('w2', { map: {}, layers: [{ id: 'l1' }], activeLayerId: 'l1' })
    );

    openInBuilder('w2');
    suivreLaNavigation();
    await loadFavoriteState();

    expect(etatBuilder.title).toBe('Mon graphique');
    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(String(toastWarning.mock.calls[0][0])).toContain('depuis le tableau de bord');
    expect(String(toastWarning.mock.calls[0][0])).toContain('carte à couches');
  });

  it('prévient quand l’état déposé est illisible', async () => {
    sessionStorage.setItem('builder-state', '{tronqué');
    window.history.replaceState(null, '', '/?from=dashboard');
    await loadFavoriteState();

    expect(etatBuilder.title).toBe('Mon graphique');
    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(String(toastWarning.mock.calls[0][0])).toContain('illisible');
    expect(sessionStorage.getItem('builder-state')).toBeNull();
  });

  it('prévient quand une origine inconnue a déposé un état', async () => {
    sessionStorage.setItem('builder-state', JSON.stringify({ title: 'X' }));
    window.history.replaceState(null, '', '/?from=app-inconnue');
    await loadFavoriteState();

    expect(etatBuilder.title).toBe('Mon graphique');
    expect(toastWarning).toHaveBeenCalledTimes(1);
  });

  it('ne dit rien quand on ouvre le Builder sans origine', async () => {
    sessionStorage.setItem('builder-state', JSON.stringify({ title: 'X' }));
    await loadFavoriteState();

    expect(etatBuilder.title).toBe('Mon graphique');
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it('dit pourquoi rien ne se passe quand le favori n’a pas de configuration', () => {
    etatDashboard.dashboard.widgets.push(widgetFavori('w3', undefined));

    openInBuilder('w3');

    expect(navigateTo).not.toHaveBeenCalled();
    expect(toastWarning).toHaveBeenCalledTimes(1);
  });
});

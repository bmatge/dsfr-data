/**
 * Aller-retour Builder → Pipeline → Builder (#1095), joué de bout en bout sans
 * navigateur. Le Builder dépose son instantané et ouvre le Pipeline ; le
 * Pipeline propose « Revenir au Builder » ; on rejoue chaque navigation
 * demandée à `navigateTo` en posant ses paramètres dans l'adresse, et le
 * Builder doit rouvrir le graphique — ou avertir si le pipeline a été modifié.
 *
 * Preuve de mutation : retirer `'pipeline-helper'` de `ORIGINES_ETAT_DEPOSE`
 * (apps/builder/src/etat-depose.ts) rend le premier test rouge (le Builder
 * reste vierge et annonce une origine inconnue) ; retirer `'pipeline-helper'`
 * de `APPS_ACCUEIL` (packages/shared/src/ui/passation.ts) rend rouge le cas
 * « pipeline modifié » (reprise en silence, sans avertissement).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { navigateTo, toastWarning, toastError, confirmDialog, dernierCode } = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
  confirmDialog: vi.fn(),
  dernierCode: vi.fn(() => ''),
}));

vi.mock('@dsfr-data/shared', async (importOriginal) => {
  const reel = await importOriginal<Record<string, unknown>>();
  return { ...reel, navigateTo, toastWarning, toastError, confirmDialog };
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
  getLastGeneratedCode: dernierCode,
}));

import { loadFavoriteState } from '../../../apps/builder/src/sources';
import { state as etatBuilder } from '../../../apps/builder/src/state';
import { openInPipeline } from '../../../apps/builder/src/ui/ui-helpers';
import {
  monterRetourBuilder,
  ID_BOUTON_RETOUR_BUILDER,
} from '../../../apps/pipeline-helper/src/retour-builder';
import { AVERTISSEMENT_RETOUR_PIPELINE } from '../../../packages/shared/src/ui/passation';

const CODE_BUILDER = '<dsfr-data-source id="s" url="https://x/records"></dsfr-data-source>';
/** Code que le Pipeline régénère depuis ses nœuds : jamais celui du Builder mot pour mot. */
const CODE_PIPELINE = '<dsfr-data-source id="s" url="https://x/records">\n</dsfr-data-source>';

/** Rejoue la dernière navigation demandée : pose ses paramètres dans l'adresse. */
function suivreLaNavigation(cibleAttendue: string): Record<string, string> {
  expect(navigateTo).toHaveBeenCalled();
  const [cible, params] = navigateTo.mock.calls.at(-1) as [string, Record<string, string>];
  expect(cible).toBe(cibleAttendue);
  window.history.replaceState(null, '', `/?${new URLSearchParams(params).toString()}`);
  return params;
}

describe('Builder → Pipeline → Builder (#1095)', () => {
  let arret: AbortController;
  let codePipeline: string;

  /** Arrivée dans le Pipeline : monte le retour comme `main.ts`. */
  function arriverDansLePipeline(): void {
    const params = suivreLaNavigation('pipeline-helper');
    document.body.insertAdjacentHTML(
      'beforeend',
      `<button id="${ID_BOUTON_RETOUR_BUILDER}" hidden>Revenir au Builder</button>`
    );
    expect(sessionStorage.getItem('pipeline-helper-code')).toBe(CODE_BUILDER);
    monterRetourBuilder({
      from: params.from ?? null,
      codeCourant: () => codePipeline,
      signal: arret.signal,
    });
  }

  /** « Revenir au Builder » : clic, puis départ de la page. */
  function revenirAuBuilder(): void {
    const bouton = document.getElementById(ID_BOUTON_RETOUR_BUILDER) as HTMLButtonElement;
    expect(bouton.hidden).toBe(false);
    navigateTo.mockClear();
    bouton.click();
    window.dispatchEvent(new Event('pagehide'));
    suivreLaNavigation('builder');
    document.getElementById(ID_BOUTON_RETOUR_BUILDER)?.remove();
  }

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    arret = new AbortController();
    codePipeline = CODE_PIPELINE;
    dernierCode.mockReturnValue(CODE_BUILDER);
    window.history.replaceState(null, '', '/');
    document.body.innerHTML = `<input id="chart-title"><input id="chart-subtitle">`;
    etatBuilder.title = 'TEMOIN PIPELINE';
    etatBuilder.subtitle = '';
    etatBuilder.chartType = 'pie';
    etatBuilder.fields = [];
    etatBuilder.data = [];
  });

  afterEach(() => arret.abort());

  /** Départ du Builder, puis l'usager y change tout avant de revenir. */
  function partirDuBuilder(): void {
    openInPipeline();
    etatBuilder.title = 'Autre chose';
    etatBuilder.chartType = 'bar';
  }

  it('rouvre le graphique au retour : titre et type restaurés', async () => {
    partirDuBuilder();
    arriverDansLePipeline();
    revenirAuBuilder();
    await loadFavoriteState();

    expect(etatBuilder.title).toBe('TEMOIN PIPELINE');
    expect(etatBuilder.chartType).toBe('pie');
    expect((document.getElementById('chart-title') as HTMLInputElement).value).toBe(
      'TEMOIN PIPELINE'
    );
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(toastWarning).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('builder-state')).toBeNull();
  });

  it('avertit avant de jeter un pipeline modifié, et y repart sans rien perdre', async () => {
    partirDuBuilder();
    arriverDansLePipeline();
    codePipeline = `${CODE_PIPELINE}\n<dsfr-data-query id="q" source="s"></dsfr-data-query>`;
    revenirAuBuilder();
    confirmDialog.mockResolvedValueOnce(false);
    navigateTo.mockClear();
    await loadFavoriteState();

    expect(confirmDialog).toHaveBeenCalledTimes(1);
    const [message, options] = confirmDialog.mock.calls[0] as [string, { cancelLabel: string }];
    expect(message).toBe(AVERTISSEMENT_RETOUR_PIPELINE.message);
    expect(options.cancelLabel).toBe('Retourner au Pipeline');

    // Refus : on retourne au Pipeline avec le pipeline modifié, l'instantané reste.
    expect(navigateTo).toHaveBeenCalledWith('pipeline-helper', { from: 'builder' });
    expect(sessionStorage.getItem('pipeline-helper-code')).toBe(codePipeline);
    expect(sessionStorage.getItem('builder-state')).not.toBeNull();
    expect(etatBuilder.title).toBe('Autre chose');
  });

  it('reprend la configuration quand on accepte de perdre la modification', async () => {
    partirDuBuilder();
    arriverDansLePipeline();
    codePipeline = `${CODE_PIPELINE}\n<dsfr-data-query id="q" source="s"></dsfr-data-query>`;
    revenirAuBuilder();
    confirmDialog.mockResolvedValueOnce(true);
    await loadFavoriteState();

    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(etatBuilder.title).toBe('TEMOIN PIPELINE');
    expect(etatBuilder.chartType).toBe('pie');
  });
});

/**
 * « Revenir au Builder » dans le Pipeline (#1095) : le bouton n'apparaît que
 * si l'on arrive du Builder, ramène avec `from=pipeline-helper`, et ne rapporte
 * un code au Builder que si le pipeline a changé depuis l'arrivée.
 *
 * Preuve de mutation : faire rendre `codeCourant` à `codeARapporter` sans
 * comparer rend rouge « ne rapporte rien quand le pipeline n'a pas bougé ».
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { navigateTo } = vi.hoisted(() => ({ navigateTo: vi.fn() }));

vi.mock('@dsfr-data/shared', async (importOriginal) => {
  const reel = await importOriginal<Record<string, unknown>>();
  return { ...reel, navigateTo };
});

import {
  arriveDuBuilder,
  codeARapporter,
  monterRetourBuilder,
  ID_BOUTON_RETOUR_BUILDER,
} from '../../../apps/pipeline-helper/src/retour-builder';
import { CLE_CODE_RAPPORTE } from '../../../packages/shared/src/ui/passation';

const CODE = '<dsfr-data-source id="s" url="https://x/records"></dsfr-data-source>';

describe('codeARapporter', () => {
  it('ne rapporte rien quand le pipeline revient identique ou seulement reformaté', () => {
    expect(codeARapporter(CODE, CODE)).toBeNull();
    expect(codeARapporter(`  ${CODE}\r\n\r\n`, `${CODE}\n`)).toBeNull();
  });

  it('rapporte le code courant quand le pipeline a changé', () => {
    const modifie = `${CODE}\n<dsfr-data-query id="q" source="s"></dsfr-data-query>`;
    expect(codeARapporter(CODE, modifie)).toBe(modifie);
  });
});

describe('arriveDuBuilder', () => {
  it('ne reconnaît que le Builder', () => {
    expect(arriveDuBuilder('builder')).toBe(true);
    expect(arriveDuBuilder('playground')).toBe(false);
    expect(arriveDuBuilder(null)).toBe(false);
  });
});

describe('monterRetourBuilder', () => {
  let arret: AbortController;
  let courant: string;

  const bouton = () => document.getElementById(ID_BOUTON_RETOUR_BUILDER) as HTMLButtonElement;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    arret = new AbortController();
    courant = CODE;
    document.body.innerHTML = `<button id="${ID_BOUTON_RETOUR_BUILDER}" hidden>Revenir au Builder</button>`;
  });

  afterEach(() => arret.abort());

  const monter = (from: string | null) =>
    monterRetourBuilder({ from, codeCourant: () => courant, signal: arret.signal });

  it("reste caché quand le Pipeline n'a pas été ouvert depuis le Builder", () => {
    expect(monter(null)).toBe(false);
    expect(monter('playground')).toBe(false);
    expect(bouton().hidden).toBe(true);

    window.dispatchEvent(new Event('pagehide'));
    expect(sessionStorage.getItem(CLE_CODE_RAPPORTE)).toBeNull();
  });

  it('apparaît depuis le Builder et y ramène avec from=pipeline-helper', () => {
    expect(monter('builder')).toBe(true);
    expect(bouton().hidden).toBe(false);

    bouton().click();
    expect(navigateTo).toHaveBeenCalledWith('builder', { from: 'pipeline-helper' });
  });

  it("ne rapporte rien quand le pipeline n'a pas bougé (et efface un rapport ancien)", () => {
    sessionStorage.setItem(CLE_CODE_RAPPORTE, 'rapport perime');
    monter('builder');

    window.dispatchEvent(new Event('pagehide'));
    expect(sessionStorage.getItem(CLE_CODE_RAPPORTE)).toBeNull();
  });

  it('rapporte le code du pipeline modifié au départ', () => {
    monter('builder');
    courant = `${CODE}\n<dsfr-data-query id="q" source="s"></dsfr-data-query>`;

    window.dispatchEvent(new Event('pagehide'));
    expect(sessionStorage.getItem(CLE_CODE_RAPPORTE)).toBe(courant);
  });
});

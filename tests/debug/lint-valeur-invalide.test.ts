import { describe, it, expect } from 'vitest';
import { lintMarkup } from '@dsfr-data/shared';
import type { ComponentContract } from '@dsfr-data/shared';
import { COMPONENT_CONTRACT } from '../../mcp-server/src/component-contract.generated.js';

/**
 * Valeurs d'enumeration dans le lint de balisage (#1111).
 *
 * Le manifeste ne porte que le TEXTE du type d'un attribut (`PopupMode`,
 * `SearchOperator`) ; `build:component-contract` relit ces types dans le code
 * et donne au contrat les valeurs des unions FERMEES. Le lint refuse une valeur
 * hors liste : le composant l'ignorerait ou retomberait sur un defaut, sans
 * rien dire. C'est aussi ce qui refuse une valeur invalide dans le bloc
 * « composant libre » du Studio.
 */

const REEL = COMPONENT_CONTRACT as unknown as ComponentContract;
const valeursInvalides = (html: string) =>
  lintMarkup(html, REEL).filter((f) => f.regle === 'balisage/valeur-invalide');

describe('contrat genere : enumerations relues dans le code', () => {
  it('resout les alias de type que le manifeste laisse en texte', () => {
    expect(REEL['dsfr-data-map-popup'].enums?.mode).toEqual([
      'popup',
      'modal',
      'panel-right',
      'panel-left',
    ]);
    expect(REEL['dsfr-data-map-layer'].enums?.type).toEqual(
      expect.arrayContaining(['marker', 'circle', 'heatmap', 'geoshape'])
    );
    expect(REEL['dsfr-data-search'].enums?.operator).toEqual(['contains', 'starts', 'words']);
  });

  it('une union ouverte (`| string`) ou un nombre ne sont pas des enumerations', () => {
    expect(REEL['dsfr-data-kpi'].enums?.orientation).toBeUndefined();
    expect(REEL['dsfr-data-kpi'].enums?.decimals).toBeUndefined();
  });
});

describe('balisage/valeur-invalide', () => {
  it('refuse une valeur hors liste, en nommant l’attribut et les valeurs acceptees', () => {
    const f = valeursInvalides(
      '<dsfr-data-source id="s"></dsfr-data-source><dsfr-data-search id="r" source="s" operator="fuzzy"></dsfr-data-search>'
    );
    expect(f).toHaveLength(1);
    expect(f[0].attribut).toBe('operator');
    expect(f[0].severity).toBe('erreur');
    expect(f[0].message).toContain('"fuzzy"');
    expect(f[0].message).toContain('contains, starts, words');
  });

  it('accepte une valeur de la liste, et ne juge pas une valeur vide', () => {
    expect(
      valeursInvalides(
        '<dsfr-data-source id="s"></dsfr-data-source>' +
          '<dsfr-data-search id="r" source="s" operator="words"></dsfr-data-search>' +
          '<dsfr-data-search id="t" source="s" operator=""></dsfr-data-search>'
      )
    ).toEqual([]);
  });

  it('laisse le mode d’une popup a sa regle propre (pas de double constat)', () => {
    const html =
      '<dsfr-data-map><dsfr-data-map-layer source="s" geo-field="g"></dsfr-data-map-layer>' +
      '<dsfr-data-map-popup mode="tooltip"></dsfr-data-map-popup></dsfr-data-map>';
    expect(valeursInvalides(html)).toEqual([]);
    expect(lintMarkup(html, REEL).some((f) => f.regle === 'carte/popup-mode-invalide')).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DsfrDataPodium } from '@/components/dsfr-data-podium.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

/**
 * Format de la valeur et du sous-titre du podium (#1230, AM-088 du banc).
 *
 * Le podium arrondissait sa valeur à l'unité (9,98 et 10,41 → « 10 ») et
 * affichait `subtitle-field` brut (« 5164 »). Les attributs reprennent le
 * vocabulaire de `dsfr-data-kpi` : `format`, `decimals`, et leurs pendants
 * `subtitle-format`, `subtitle-decimals`, `subtitle-unit`.
 */

/** Vue interne du composant : membres privés inspectés par ces tests. */
interface PodiumInternals {
  _data: Record<string, unknown>[];
  _processItems(): Array<{ label: string; subtitle: string; value: number }>;
  _formatValue(value: number): string;
}

const SOURCE = 'test-podium-format';

const TAUX = [
  { dep: 'Seine-Saint-Denis', taux: 10.41, nb: 5164, maj: '2026-09-27' },
  { dep: 'Nièvre', taux: 9.98, nb: 812, maj: '2026-09-01' },
  { dep: 'Paris', taux: 7.25, nb: 12030, maj: null },
];

/** Espaces insécables (U+00A0, U+202F) ramenées à l'espace : on compare ce qui se lit. */
const lisible = (texte: string): string => texte.replace(/[\u00a0\u202f]/g, ' ');

describe('dsfr-data-podium — format de la valeur et du sous-titre (#1230, AM-088)', () => {
  let podium: DsfrDataPodium;
  let internals: PodiumInternals;

  beforeEach(() => {
    clearDataCache(SOURCE);
    podium = new DsfrDataPodium();
    internals = podium as unknown as PodiumInternals;
    podium.id = 'p';
    podium.labelField = 'dep';
    podium.valueField = 'taux';
    internals._data = TAUX;
  });

  afterEach(() => {
    podium.remove();
    vi.restoreAllMocks();
  });

  describe('valeur', () => {
    it('sans attribut : le rendu historique, arrondi à l’unité, est inchangé', () => {
      expect(podium.format).toBe('');
      expect(podium.decimals).toBeUndefined();
      expect(internals._formatValue(10.41)).toBe('10');
      expect(internals._formatValue(9.98)).toBe('10');
      expect(lisible(internals._formatValue(12271794))).toBe('12 271 794');
    });

    it('decimals="2" distingue 9,98 de 10,41', () => {
      podium.decimals = 2;
      podium.valueUnit = '%';
      expect(internals._formatValue(10.41)).toBe('10,41 %');
      expect(internals._formatValue(9.98)).toBe('9,98 %');
    });

    it('decimals="0" est un choix écrit, pas l’absence de l’attribut', () => {
      podium.decimals = 0;
      expect(internals._formatValue(9.98)).toBe('10');
    });

    it('format reprend le vocabulaire du KPI', () => {
      podium.format = 'pourcentage';
      podium.decimals = 1;
      expect(lisible(internals._formatValue(10.41))).toBe('10,4 %');
      podium.format = 'euro';
      podium.decimals = undefined;
      expect(lisible(internals._formatValue(5164))).toBe('5 164 €');
      podium.format = 'decimal';
      expect(internals._formatValue(9.98)).toBe('9,98');
      podium.format = 'compact';
      expect(lisible(internals._formatValue(14785684))).toBe('14,8 M');
    });

    it('un decimals hors bornes est ignoré : rendu historique', () => {
      podium.decimals = 42;
      expect(internals._formatValue(9.98)).toBe('10');
      podium.decimals = Number.NaN;
      expect(internals._formatValue(9.98)).toBe('10');
    });
  });

  describe('sous-titre', () => {
    it('sans attribut : la valeur du champ, telle quelle', () => {
      podium.subtitleField = 'nb';
      expect(internals._processItems().map((i) => i.subtitle)).toEqual(['5164', '812', '12030']);
    });

    it('subtitle-format="nombre" rend « 5 164 », subtitle-unit accole « aides »', () => {
      podium.subtitleField = 'nb';
      podium.subtitleFormat = 'nombre';
      expect(internals._processItems().map((i) => lisible(i.subtitle))).toEqual([
        '5 164',
        '812',
        '12 030',
      ]);
      podium.subtitleUnit = 'aides';
      expect(internals._processItems().map((i) => lisible(i.subtitle))).toEqual([
        '5 164 aides',
        '812 aides',
        '12 030 aides',
      ]);
    });

    it('subtitle-unit s’applique aussi sans format, et jamais à un sous-titre vide', () => {
      podium.subtitleField = 'maj';
      podium.subtitleUnit = '(mise à jour)';
      expect(internals._processItems().map((i) => lisible(i.subtitle))).toEqual([
        '2026-09-27 (mise à jour)',
        '2026-09-01 (mise à jour)',
        '',
      ]);
    });

    it('subtitle-decimals seul vaut subtitle-format="nombre"', () => {
      podium.subtitleField = 'taux';
      podium.subtitleDecimals = 1;
      expect(internals._processItems().map((i) => i.subtitle)).toEqual(['10,4', '10,0', '7,3']);
    });

    it('subtitle-format="date" rend JJ/MM/AAAA, une valeur vide reste vide', () => {
      podium.subtitleField = 'maj';
      podium.subtitleFormat = 'date';
      expect(internals._processItems().map((i) => i.subtitle)).toEqual([
        '27/09/2026',
        '01/09/2026',
        '',
      ]);
    });

    it('une valeur non numérique reste affichée telle quelle sous un format numérique', () => {
      podium.subtitleField = 'dep';
      podium.subtitleFormat = 'nombre';
      expect(internals._processItems()[0].subtitle).toBe('Seine-Saint-Denis');
    });

    it('le texte fixe de subtitle n’est ni formaté ni suffixé', () => {
      podium.subtitle = '2024';
      podium.subtitleFormat = 'euro';
      podium.subtitleUnit = 'aides';
      expect(internals._processItems()[0].subtitle).toBe('2024');
    });
  });

  describe('ce que le composant dit', () => {
    async function monter(attrs: Record<string, string> = {}): Promise<void> {
      podium.source = SOURCE;
      for (const [nom, valeur] of Object.entries(attrs)) podium.setAttribute(nom, valeur);
      document.body.appendChild(podium);
      dispatchDataLoaded(SOURCE, TAUX);
      await podium.updateComplete;
    }

    it('rendu par défaut : deux valeurs différentes affichées « 10 » sont signalées, une fois', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await monter();

      const messages = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('« 10 »'));
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('10.41');
      expect(messages[0]).toContain('9.98');
      expect(messages[0]).toContain('decimals=');

      podium.requestUpdate();
      await podium.updateComplete;
      expect(warn.mock.calls.filter((c) => String(c[0]).includes('« 10 »'))).toHaveLength(1);
    });

    it('avec decimals, plus de collision : le composant se tait, et le DOM porte les décimales', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await monter({ decimals: '2', 'subtitle-field': 'nb', 'subtitle-format': 'nombre' });

      expect(warn.mock.calls.filter((c) => String(c[0]).includes('dsfr-data-podium'))).toEqual([]);
      const valeurs = Array.from(podium.querySelectorAll('.dsfr-data-podium__value')).map((e) =>
        lisible(e.textContent ?? '').trim()
      );
      expect(valeurs).toEqual(['10,41', '9,98', '7,25']);
      const sousTitres = Array.from(podium.querySelectorAll('.dsfr-data-podium__subtitle')).map(
        (e) => lisible(e.textContent ?? '').trim()
      );
      expect(sousTitres).toEqual(['5 164', '812', '12 030']);
    });

    it('deux valeurs ÉGALES affichées pareil ne sont pas une collision', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      podium.source = SOURCE;
      document.body.appendChild(podium);
      dispatchDataLoaded(SOURCE, [
        { dep: 'A', taux: 10 },
        { dep: 'B', taux: 10 },
      ]);
      await podium.updateComplete;
      expect(warn.mock.calls.filter((c) => String(c[0]).includes('arrondi'))).toEqual([]);
    });

    it('format inconnu : erreur de configuration nommant les formats acceptés, rendu historique', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await monter({ format: 'euro:2', 'subtitle-format': 'number' });

      const message = podium.getAttribute('data-dsfr-config-error') ?? '';
      expect(message).toContain('format="euro:2" inconnu');
      expect(message).toContain('decimals="N"');
      expect(message).toContain('subtitle-format="number" inconnu');
      expect(message).toContain('nombre, pourcentage, euro, decimal, compact, date');
      expect(error).toHaveBeenCalledTimes(1);
      expect(internals._formatValue(9.98)).toBe('10');

      podium.setAttribute('format', 'decimal');
      podium.removeAttribute('subtitle-format');
      await podium.updateComplete;
      expect(podium.hasAttribute('data-dsfr-config-error')).toBe(false);
    });

    it('format="date" est refusé pour la valeur', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await monter({ format: 'date' });
      expect(podium.getAttribute('data-dsfr-config-error')).toContain('format="date" inconnu');
    });
  });
});

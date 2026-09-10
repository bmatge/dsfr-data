import { describe, it, expect } from 'vitest';
import { parseKpiLines, resolveKpiLine, resolveKpiLines } from '@/utils/kpi-lines.js';

describe('parseKpiLines', () => {
  it('parse un tableau JSON valide', () => {
    const specs = parseKpiLines('[{"value":"evol:avg"},{"text":"note"}]');
    expect(specs).toEqual([{ value: 'evol:avg' }, { text: 'note' }]);
  });

  it('retourne null sur JSON invalide', () => {
    expect(parseKpiLines('[{')).toBeNull();
  });

  it('retourne null si ce n’est pas un tableau', () => {
    expect(parseKpiLines('{"value":"x"}')).toBeNull();
  });

  it('ignore les items non-objets', () => {
    expect(parseKpiLines('[{"text":"ok"}, 42, null, "x"]')).toEqual([{ text: 'ok' }]);
  });
});

describe('resolveKpiLine — data-driven', () => {
  it('reproduit la ligne d’évolution de l’image (+92,5 % vs mai 2025, vert)', () => {
    const line = resolveKpiLine(
      { value: 'evol:avg', sign: true, suffix: 'vs mai 2025', color: 'auto' },
      [{ evol: 92.5 }]
    );
    expect(line).not.toBeNull();
    expect(line!.text.replace(/\s+/g, ' ')).toBe('+92,5 % vs mai 2025');
    expect(line!.color).toBe('var(--text-default-success)');
  });

  it('fonctionne sur une source mono-objet (baromètre)', () => {
    const line = resolveKpiLine({ value: 'evol:avg', sign: true }, { evol: 92.5 });
    expect(line!.text.replace(/\s+/g, ' ')).toBe('+92,5 %');
  });

  it('color auto passe au rouge sur une valeur négative', () => {
    const line = resolveKpiLine({ value: 'evol:avg', color: 'auto' }, [{ evol: -3.1 }]);
    expect(line!.text.replace(/\s+/g, ' ')).toBe('-3,1 %');
    expect(line!.color).toBe('var(--text-default-error)');
  });

  it('respecte le format (nombre) et le préfixe', () => {
    const line = resolveKpiLine({ value: 'n:sum', format: 'nombre', prefix: 'Total' }, [
      { n: 1000 },
      { n: 234 },
    ]);
    expect(line!.text.replace(/\s+/g, ' ')).toBe('Total 1 234');
  });

  it('replie sur `na` quand la valeur est non finie (division par zéro)', () => {
    const line = resolveKpiLine({ value: 'evol:avg', na: 'n.d.', color: 'auto' }, [
      { evol: Infinity },
    ]);
    expect(line!.text).toBe('n.d.');
    expect(line!.color).toBeNull();
  });

  it('masque la ligne (null) quand la valeur manque et qu’il n’y a pas de `na`', () => {
    expect(resolveKpiLine({ value: 'absent:avg' }, [{ evol: 1 }])).toBeNull();
  });
});

describe('resolveKpiLine — decimals, unit, format date (#665, #667)', () => {
  const norm = (s: string) => s.replace(/\s+/g, ' ');

  it('decimals fixe les décimales de la ligne (euro à 3 décimales)', () => {
    const line = resolveKpiLine({ value: 'prix:avg', format: 'euro', decimals: 3 }, [
      { prix: 1.749 },
    ]);
    expect(norm(line!.text)).toBe('1,749 €');
  });

  it('unit accole une unité après la valeur, avant le suffix', () => {
    const line = resolveKpiLine(
      { value: 'm:sum', format: 'compact', unit: '€', suffix: 'de budget' },
      [{ m: 44_900_000_000 }]
    );
    expect(norm(line!.text)).toBe('44,9 Md € de budget');
  });

  it('sign + decimals + unit se combinent', () => {
    const line = resolveKpiLine(
      { value: 'evol:avg', format: 'decimal', decimals: 2, unit: 'pts', sign: true },
      [{ evol: 1.5 }]
    );
    expect(norm(line!.text)).toBe('+1,50 pts');
  });

  it('format "date" rend une chaîne ISO (max) en JJ/MM/AAAA, avec préfixe', () => {
    const line = resolveKpiLine({ value: 'maj:max', format: 'date', prefix: 'Mis à jour le' }, [
      { maj: '2026-09-01' },
      { maj: '2026-09-09' },
    ]);
    expect(norm(line!.text)).toBe('Mis à jour le 09/09/2026');
    expect(line!.color).toBeNull();
  });

  it('format "date" : repli `na` si illisible, masquée sinon ; color auto ignorée', () => {
    expect(resolveKpiLine({ value: 'maj', format: 'date' }, [{ maj: 'hier' }])).toBeNull();
    const line = resolveKpiLine({ value: 'maj', format: 'date', na: 'n.d.', color: 'auto' }, [
      { maj: 'hier' },
    ]);
    expect(line!.text).toBe('n.d.');
    expect(line!.color).toBeNull();
    const ok = resolveKpiLine({ value: 'maj', format: 'date', color: 'auto' }, [
      { maj: '2026-09-09' },
    ]);
    expect(ok!.color).toBeNull();
  });

  it('défauts inchangés sans decimals/unit', () => {
    const line = resolveKpiLine({ value: 'evol:avg', sign: true }, [{ evol: 92.5 }]);
    expect(norm(line!.text)).toBe('+92,5 %');
  });
});

describe('resolveKpiLine — texte statique & couleurs', () => {
  it('rend un texte statique avec couleur token française', () => {
    const line = resolveKpiLine({ text: 'Donnée mai 2026', color: 'gris' }, null);
    expect(line!.text).toBe('Donnée mai 2026');
    expect(line!.color).toBe('var(--text-mention-grey)');
  });

  it('laisse passer une couleur CSS brute (hex)', () => {
    const line = resolveKpiLine({ text: 'x', color: '#c9191e' }, null);
    expect(line!.color).toBe('#c9191e');
  });

  it('couleur absente => null (hérite)', () => {
    const line = resolveKpiLine({ text: 'x' }, null);
    expect(line!.color).toBeNull();
  });

  it('spec vide => null', () => {
    expect(resolveKpiLine({}, null)).toBeNull();
  });
});

describe('resolveKpiLines', () => {
  it('filtre les lignes masquées', () => {
    const lines = resolveKpiLines(
      [{ value: 'evol:avg' }, { value: 'absent:avg' }, { text: 'fixe' }],
      [{ evol: 5 }]
    );
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.text.replace(/\s+/g, ' '))).toEqual(['5 %', 'fixe']);
  });
});

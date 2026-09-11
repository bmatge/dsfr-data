import { describe, it, expect, afterEach } from 'vitest';

/**
 * #779 point 3 (AM-044, réduit) — `count-label` sur dsfr-data-search.
 *
 * Le compteur est accentué, accordé et à séparateur de milliers depuis la
 * 0.26.0 : ne survivait de la demande que le libellé paramétrable. Le mot
 * « résultat » ne dit rien d'un annuaire d'établissements.
 */

import { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

const mounted: Element[] = [];
const ids: string[] = [];

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
  for (const id of ids.splice(0)) clearDataCache(id);
});

let seq = 0;
async function counterText(label: string, rows: number): Promise<string> {
  seq += 1;
  const src = `count-label-src-${seq}`;
  const search = new DsfrDataSearch();
  search.id = `count-label-search-${seq}`;
  search.source = src;
  search.fields = 'nom';
  search.count = true;
  if (label) search.countLabel = label;
  ids.push(src, search.id);
  document.body.appendChild(search);
  mounted.push(search);
  dispatchDataLoaded(
    src,
    Array.from({ length: rows }, (_, i) => ({ nom: `n${i}` }))
  );
  await search.updateComplete;
  return (search.querySelector('.dsfr-data-search-count')?.textContent ?? '')
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('#779 — count-label', () => {
  it('sans l’attribut, « résultat » accordé comme avant', async () => {
    expect(await counterText('', 1)).toBe('1 résultat');
    expect(await counterText('', 3)).toBe('3 résultats');
  });

  it('une forme seule prend un s au pluriel', async () => {
    expect(await counterText('établissement', 1)).toBe('1 établissement');
    expect(await counterText('établissement', 1234)).toBe('1 234 établissements');
  });

  it('deux formes pour un pluriel irrégulier', async () => {
    expect(await counterText('cheval|chevaux', 1)).toBe('1 cheval');
    expect(await counterText('cheval|chevaux', 2)).toBe('2 chevaux');
    expect(await counterText('prix | prix', 5)).toBe('5 prix');
  });
});

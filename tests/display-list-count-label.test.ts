import { describe, it, expect, afterEach } from 'vitest';

/**
 * #925 (AM-077) — `count-label` sur `dsfr-data-display` et `dsfr-data-list`.
 *
 * Les deux afficheurs comptent « résultat », mot qui ne dit rien d'un
 * annuaire d'établissements ni d'un palmarès de communes. `dsfr-data-search`
 * a reçu le libellé paramétrable en 0.29 (#779) ; ses deux voisins non.
 *
 * L'attribut porte aussi le formateur fr-FR : le compteur PAR DÉFAUT reste
 * inchangé (le corriger toucherait toutes les pages, hors périmètre de cette
 * PR), mais qui pose l'attribut obtient un nombre lisible.
 */

import { DsfrDataDisplay } from '@/components/dsfr-data-display.js';
import { DsfrDataList } from '@/components/dsfr-data-list.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

const mounted: Element[] = [];
const ids: string[] = [];

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
  for (const id of ids.splice(0)) clearDataCache(id);
});

const normalise = (text: string): string =>
  text
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

let seq = 0;

async function displayCounter(label: string, rows: number): Promise<string> {
  seq += 1;
  const src = `cl-display-src-${seq}`;
  const display = new DsfrDataDisplay();
  display.source = src;
  const tpl = document.createElement('template');
  tpl.innerHTML = '<p>{{nom}}</p>';
  display.appendChild(tpl);
  if (label) display.countLabel = label;
  ids.push(src);
  document.body.appendChild(display);
  mounted.push(display);
  dispatchDataLoaded(
    src,
    Array.from({ length: rows }, (_, i) => ({ nom: `n${i}` }))
  );
  await display.updateComplete;
  return normalise(display.querySelector('p[role="status"]')?.textContent ?? '');
}

async function listCounter(label: string, rows: number): Promise<string> {
  seq += 1;
  const src = `cl-list-src-${seq}`;
  const list = new DsfrDataList();
  list.source = src;
  list.columns = 'nom';
  if (label) list.countLabel = label;
  ids.push(src);
  document.body.appendChild(list);
  mounted.push(list);
  dispatchDataLoaded(
    src,
    Array.from({ length: rows }, (_, i) => ({ nom: `n${i}` }))
  );
  await list.updateComplete;
  return normalise(list.querySelector('p[role="status"]')?.textContent ?? '');
}

describe('#925 — count-label sur display', () => {
  it('sans l’attribut, le compteur est celui d’avant, au caractère près', async () => {
    expect(await displayCounter('', 1)).toBe('1 resultat');
    expect(await displayCounter('', 3)).toBe('3 resultats');
    expect(await displayCounter('', 1234)).toBe('1234 resultats');
  });

  it('une forme seule prend un s au pluriel, et le nombre son séparateur', async () => {
    expect(await displayCounter('établissement', 1)).toBe('1 établissement');
    expect(await displayCounter('établissement', 1234)).toBe('1 234 établissements');
  });

  it('deux formes pour un pluriel irrégulier', async () => {
    expect(await displayCounter('cheval|chevaux', 1)).toBe('1 cheval');
    expect(await displayCounter('cheval|chevaux', 2)).toBe('2 chevaux');
    expect(await displayCounter('prix | prix', 5)).toBe('5 prix');
  });
});

describe('#925 — count-label sur list', () => {
  it('sans l’attribut, le compteur est celui d’avant, au caractère près', async () => {
    expect(await listCounter('', 1)).toBe('1 résultat');
    expect(await listCounter('', 1234)).toBe('1234 résultats');
  });

  it('une forme seule prend un s au pluriel, et le nombre son séparateur', async () => {
    expect(await listCounter('commune', 1)).toBe('1 commune');
    expect(await listCounter('commune', 1234)).toBe('1 234 communes');
  });

  it('deux formes pour un pluriel irrégulier', async () => {
    expect(await listCounter('cheval|chevaux', 2)).toBe('2 chevaux');
  });
});

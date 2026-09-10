import { describe, it, expect, afterEach } from 'vitest';

/**
 * Tests #740 — colorer une cellule selon un seuil, par une colonne calculée.
 *
 * `threshold-*` n'existe que sur dsfr-data-kpi. Plutôt qu'un second jeu de
 * seuils par colonne, la voie retenue réutilise la mécanique déjà là : le
 * `compute` de dsfr-data-normalize produit une tranche (`when … then 'seuil-bas'
 * else 'seuil-ok'`, #671) et `cell-class` en fait la classe de la cellule.
 *
 * Le critère RGAA 1.4.1 est satisfait par construction : la valeur textuelle
 * existe déjà dans une colonne — et quand cette colonne n'est pas affichée, le
 * tableau la restitue en texte masqué visuellement plutôt que de laisser la
 * couleur seule.
 */

import { DsfrDataList } from '@/components/dsfr-data-list.js';
import { parseCellClassRules, cellClassTokens } from '@/utils/cell-class.js';
import { clearDataCache, clearDataMeta, dispatchDataLoaded } from '@/utils/data-bridge.js';

type Row = Record<string, unknown>;

const ROWS: Row[] = [
  { commune: 'Paris', taux: 82, alerte: 'seuil-ok' },
  { commune: 'Lyon', taux: 34, alerte: 'seuil-bas' },
];

const mounted: Element[] = [];
const sources: string[] = [];
let seq = 0;

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
  for (const id of sources.splice(0)) {
    clearDataCache(id);
    clearDataMeta(id);
  }
});

async function mountList(attrs: Record<string, string>, rows: Row[] = ROWS) {
  seq += 1;
  const sourceId = `src-740-${seq}`;
  sources.push(sourceId);
  const list = new DsfrDataList();
  list.setAttribute('source', sourceId);
  for (const [name, value] of Object.entries(attrs)) list.setAttribute(name, value);
  document.body.appendChild(list);
  mounted.push(list);
  dispatchDataLoaded(sourceId, rows);
  await list.updateComplete;
  return list;
}

const bodyCells = (list: DsfrDataList): HTMLTableCellElement[] =>
  Array.from(list.querySelectorAll<HTMLTableCellElement>('tbody td'));

// ---------------------------------------------------------------------------
// Grammaire
// ---------------------------------------------------------------------------

describe('cell-class — grammaire (#740)', () => {
  it('paires colonne:colonne_classe, séparées par des virgules', () => {
    expect(parseCellClassRules('taux:alerte, delai:retard')).toEqual([
      { column: 'taux', classColumn: 'alerte' },
      { column: 'delai', classColumn: 'retard' },
    ]);
  });

  it('une colonne seule est classée par sa propre valeur', () => {
    expect(parseCellClassRules('statut')).toEqual([{ column: 'statut', classColumn: 'statut' }]);
  });

  it('entrées vides et espaces ignorés', () => {
    expect(parseCellClassRules('  , taux : alerte ,')).toEqual([
      { column: 'taux', classColumn: 'alerte' },
    ]);
    expect(parseCellClassRules('')).toEqual([]);
  });

  it('seuls les identifiants CSS sont retenus', () => {
    expect(cellClassTokens('seuil-bas')).toEqual(['seuil-bas']);
    expect(cellClassTokens('fr-badge fr-badge--error')).toEqual(['fr-badge', 'fr-badge--error']);
    expect(cellClassTokens('Alerte')).toEqual(['Alerte']);
    // Rien qui puisse sortir de l'attribut class, ni valeur numérique
    expect(cellClassTokens('12 %')).toEqual([]);
    expect(cellClassTokens('"><script>')).toEqual([]);
    expect(cellClassTokens(null)).toEqual([]);
    expect(cellClassTokens(undefined)).toEqual([]);
    expect(cellClassTokens({ a: 1 })).toEqual([]);
    expect(cellClassTokens('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

describe('dsfr-data-list cell-class — la colonne calculée pilote la cellule (#740)', () => {
  it('sans cell-class : les cellules restent sans classe', async () => {
    const list = await mountList({ columns: 'commune:Commune, taux:Taux' });
    expect(bodyCells(list).every((td) => td.className === '')).toBe(true);
  });

  it('la valeur de la colonne de classe devient la classe de la cellule', async () => {
    const list = await mountList({
      columns: 'commune:Commune, taux:Taux, alerte:Alerte',
      'cell-class': 'taux:alerte',
    });
    const cells = bodyCells(list);
    // Ligne 1 : commune, taux, alerte
    expect(cells[1].className).toBe('seuil-ok');
    expect(cells[4].className).toBe('seuil-bas');
    // Seule la cellule visée est classée
    expect(cells[0].className).toBe('');
    expect(cells[2].className).toBe('');
  });

  it('la valeur textuelle reste dans la cellule (jamais la couleur seule)', async () => {
    const list = await mountList({
      columns: 'commune:Commune, taux:Taux, alerte:Alerte',
      'cell-class': 'taux:alerte',
    });
    const cells = bodyCells(list);
    expect(cells[1].textContent?.trim()).toBe('82');
    // La colonne de classe étant affichée, aucune mention supplémentaire
    expect(cells[1].querySelector('.fr-sr-only')).toBeNull();
    expect(cells[2].textContent?.trim()).toBe('seuil-ok');
  });

  it('colonne de classe non affichée : sa valeur est restituée en texte masqué', async () => {
    const list = await mountList({
      columns: 'commune:Commune, taux:Taux',
      'cell-class': 'taux:alerte',
    });
    const cells = bodyCells(list);
    expect(cells[1].className).toBe('seuil-ok');
    expect(cells[1].querySelector('.fr-sr-only')?.textContent?.trim()).toBe('(seuil-ok)');
    expect(cells[3].querySelector('.fr-sr-only')?.textContent?.trim()).toBe('(seuil-bas)');
  });

  it('une colonne seule se classe par sa propre valeur, sans mention redondante', async () => {
    const list = await mountList({
      columns: 'commune:Commune, alerte:Alerte',
      'cell-class': 'alerte',
    });
    const cells = bodyCells(list);
    expect(cells[1].className).toBe('seuil-ok');
    expect(cells[1].textContent?.trim()).toBe('seuil-ok');
    expect(cells[1].querySelector('.fr-sr-only')).toBeNull();
  });

  it('plusieurs classes séparées par des espaces, valeur non CSS ignorée', async () => {
    const list = await mountList(
      { columns: 'commune:Commune, taux:Taux', 'cell-class': 'taux:alerte' },
      [
        { commune: 'Paris', taux: 82, alerte: 'fr-badge fr-badge--success' },
        { commune: 'Lyon', taux: 34, alerte: '12 %' },
      ]
    );
    const cells = bodyCells(list);
    expect(cells[1].className).toBe('fr-badge fr-badge--success');
    expect(cells[3].className).toBe('');
    // La valeur non retenue reste annoncée : l'information ne disparaît pas
    expect(cells[3].querySelector('.fr-sr-only')?.textContent?.trim()).toBe('(12 %)');
  });

  it('une colonne de classe absente des données ne casse rien', async () => {
    const list = await mountList({
      columns: 'commune:Commune, taux:Taux',
      'cell-class': 'taux:inconnue',
    });
    const cells = bodyCells(list);
    expect(cells[1].className).toBe('');
    expect(cells[1].textContent).toContain('82');
  });

  it('un changement de cell-class à chaud est répercuté au rendu suivant', async () => {
    const list = await mountList({
      columns: 'commune:Commune, taux:Taux, alerte:Alerte',
      'cell-class': 'taux:alerte',
    });
    expect(bodyCells(list)[1].className).toBe('seuil-ok');

    list.setAttribute('cell-class', 'commune:alerte');
    await list.updateComplete;

    const cells = bodyCells(list);
    expect(cells[0].className).toBe('seuil-ok');
    expect(cells[1].className).toBe('');
  });
});

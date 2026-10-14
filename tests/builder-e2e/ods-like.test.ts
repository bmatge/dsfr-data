import { describe, it, expect } from 'vitest';
import { searchPortail } from './ods-like.js';
import { filtrerOdsqlContexte } from '../verif-donnees/fixtures-contexte.js';

/**
 * ADR-159 lot 3 (#1285) — le faux portail lit `search()` comme le vrai.
 *
 * La bibliothèque confie la recherche du contexte au moteur du portail
 * (`search(champ, "terme")`). Un faux portail qui la lirait comme une
 * sous-chaîne rendrait verts des contrôles que le vrai portail rougirait : les
 * règles ci-dessous sont celles mesurées le 2026-10-13 sur
 * `rappelconso-v2-gtin-trie` (data.economie.gouv.fr), tableau dans `ods-like.ts`.
 */

const LIGNES = [
  { id: 1, libelle: 'Collège Victor Hugo', region: 'Occitanie', population: 2400 },
  { id: 2, libelle: 'Lycée de Toulouse Centre', region: 'Occitanie', population: 2600 },
  { id: 3, libelle: "Lycée d'Antibes", region: "Provence-Alpes-Côte d'Azur", population: 2100 },
  { id: 4, libelle: null, region: 'Bretagne', population: 700 },
];
const ids = (where: string) => filtrerOdsqlContexte(LIGNES, where).map((l) => l.id);

describe('faux portail — search(), tel que mesuré', () => {
  it('début de mot, jamais milieu de mot', () => {
    expect(ids('search(libelle, "to")')).toEqual([2]);
    expect(ids('search(libelle, "ctor")')).toEqual([]);
    expect(ids('search(libelle, "lyc")')).toEqual([2, 3]);
  });

  it('casse et accents ignorés, article élidé retiré', () => {
    expect(ids('search(libelle, "LYCEE")')).toEqual([2, 3]);
    expect(ids('search(libelle, "antib")')).toEqual([3]);
    expect(ids('search(region, "cote")')).toEqual([3]);
  });

  it('borné aux champs nommés ; sans champ, tous les champs texte', () => {
    expect(ids('search(libelle, "occ")')).toEqual([]);
    expect(ids('search(region, "occ")')).toEqual([1, 2]);
    expect(ids('search(libelle, region, "bret")')).toEqual([4]);
    expect(ids('search("occ")')).toEqual([1, 2]);
    // Un nombre ne porte aucun mot : la recherche plein texte ne le trouve pas.
    expect(ids('search("2400")')).toEqual([]);
  });

  it('plusieurs termes : un ET, sans ordre ; terme vide : rien', () => {
    expect(ids('search(libelle, "centre lyc")')).toEqual([2]);
    expect(ids('search(libelle, "lyc hugo")')).toEqual([]);
    expect(ids('search(libelle, "")')).toEqual([]);
  });

  it('se combine avec les autres clauses', () => {
    expect(ids('search(libelle, "lyc") AND region = "Occitanie"')).toEqual([2]);
  });

  it('un champ nommé qui n’est pas du texte est refusé, comme le portail répond 400', () => {
    expect(() => searchPortail(LIGNES[0], ['population'], '24')).toThrow(/type text/);
  });
});

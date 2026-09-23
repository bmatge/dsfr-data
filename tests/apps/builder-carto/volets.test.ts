import { describe, it, expect, beforeEach } from 'vitest';
import {
  CLASSE_VOLET_FERME,
  CLASSE_VOLET_MASQUE,
  CLE_VOLET,
  VOLET_PAR_DEFAUT,
  VOLETS,
  initVolets,
  ouvrirVolet,
  voletOuvert,
} from '../../../apps/builder-carto/src/volets';

/**
 * Rail + volet unique de la carto (#1088) : un seul des trois volets ouvert,
 * le rail et l'espace de travail suivent, le dernier choix est retenu.
 */

function monter(): void {
  document.body.innerHTML = `
    <main class="carto-workspace">
      <nav class="carto-rail">
        ${VOLETS.map((v) => `<button type="button" data-volet="${v}" aria-expanded="false"></button>`).join('')}
      </nav>
      <div class="carto-panels">
        ${VOLETS.map(
          (v) => `<section id="${v}" class="carto-panel ${CLASSE_VOLET_MASQUE}">
            <button type="button" data-volet-replier></button>
          </section>`
        ).join('')}
      </div>
    </main>`;
}

const ouverts = () =>
  VOLETS.filter((v) => !document.getElementById(v)!.classList.contains(CLASSE_VOLET_MASQUE));
const rail = (v: string) => document.querySelector<HTMLButtonElement>(`[data-volet="${v}"]`)!;
const espace = () => document.querySelector('.carto-workspace')!;

beforeEach(() => {
  localStorage.clear();
  monter();
});

describe('volets de la carto (#1088)', () => {
  it('première visite : le volet Couches est ouvert, seul', () => {
    initVolets(document);
    expect(ouverts()).toEqual([VOLET_PAR_DEFAUT]);
    expect(rail(VOLET_PAR_DEFAUT).getAttribute('aria-expanded')).toBe('true');
    expect(espace().classList.contains(CLASSE_VOLET_FERME)).toBe(false);
  });

  it('un seul volet ouvert à la fois', () => {
    // Mutation : ne plus masquer les autres volets dans ouvrirVolet → deux
    // volets visibles, retour aux panneaux empilés.
    initVolets(document);
    rail('panel-elements').click();
    expect(ouverts()).toEqual(['panel-elements']);
    expect(rail('panel-couches').getAttribute('aria-expanded')).toBe('false');
    expect(rail('panel-elements').getAttribute('aria-expanded')).toBe('true');
  });

  it('recliquer le volet ouvert le replie ; la carte prend la largeur', () => {
    initVolets(document);
    rail(VOLET_PAR_DEFAUT).click();
    expect(ouverts()).toEqual([]);
    expect(voletOuvert(document)).toBeNull();
    expect(espace().classList.contains(CLASSE_VOLET_FERME)).toBe(true);
  });

  it('« Replier le volet » replie et rend le focus au bouton du rail', () => {
    initVolets(document);
    rail('panel-carte').click();
    document.querySelector<HTMLButtonElement>('#panel-carte [data-volet-replier]')!.click();
    expect(voletOuvert(document)).toBeNull();
    expect(document.activeElement).toBe(rail('panel-carte'));
  });

  it('le dernier choix de l’usager est retenu, y compris le repli', () => {
    initVolets(document);
    rail('panel-carte').click();
    expect(localStorage.getItem(CLE_VOLET)).toBe('panel-carte');
    monter();
    initVolets(document);
    expect(ouverts()).toEqual(['panel-carte']);

    rail('panel-carte').click();
    monter();
    initVolets(document);
    expect(ouverts()).toEqual([]);
  });

  it('une révélation (assistant, visite) ne réécrit pas le choix mémorisé', () => {
    initVolets(document);
    rail('panel-carte').click();
    ouvrirVolet(document, 'panel-elements');
    expect(ouverts()).toEqual(['panel-elements']);
    expect(localStorage.getItem(CLE_VOLET)).toBe('panel-carte');
  });

  it('une valeur mémorisée inconnue retombe sur le volet par défaut', () => {
    localStorage.setItem(CLE_VOLET, 'panel-inconnu');
    initVolets(document);
    expect(ouverts()).toEqual([VOLET_PAR_DEFAUT]);
  });
});

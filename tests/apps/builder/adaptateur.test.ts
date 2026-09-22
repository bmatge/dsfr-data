/**
 * Adaptateur de révélation du builder graphique (#1006, ADR-143 §6) : ouverture
 * de section, `<details>`, modale ; `null` quand le contrôle est masqué ;
 * abonnement aux changements d'état ; jamais de modification de l'état. Et le
 * chemin complet par `montrer()` : un prérequis manquant montre le repère qui
 * le lève.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { effacerSurbrillance, montrer } from '@dsfr-data/shared';
import {
  creerAdaptateurBuilder,
  modaleDuRepere,
  sectionDuRepere,
  SECTION_DE_ZONE,
} from '../../../apps/builder/src/assistant/adaptateur';
import { REGISTRE, REPERES } from '../../../apps/builder/src/assistant/reperes.generated';
import { state } from '../../../apps/builder/src/state';

const RACINE = resolve(import.meta.dirname, '../../..');

function corpsIndex(): string {
  const html = readFileSync(join(RACINE, 'apps/builder/index.html'), 'utf-8');
  const ouverture = html.indexOf('>', html.indexOf('<body')) + 1;
  let corps = html.slice(ouverture, html.indexOf('</body>'));
  for (let debut = corps.indexOf('<script'); debut !== -1; debut = corps.indexOf('<script')) {
    const fin = corps.indexOf('</script>', debut);
    corps = corps.slice(0, debut) + corps.slice(fin + '</script>'.length);
  }
  return corps;
}

const instantane = () => JSON.stringify(state);
let etatInitial: string;

beforeEach(() => {
  document.body.innerHTML = corpsIndex();
  etatInitial = instantane();
});

afterEach(() => {
  effacerSurbrillance();
  Object.assign(state, JSON.parse(etatInitial));
  document.body.innerHTML = '';
});

describe('tables de l’adaptateur', () => {
  it('chaque zone de premier niveau à section existe dans le registre et le DOM', () => {
    const zones = new Set<string>(REPERES.filter((r) => r.genre === 'zone').map((r) => r.id));
    for (const [zone, section] of Object.entries(SECTION_DE_ZONE)) {
      expect(zones.has(zone), zone).toBe(true);
      expect(document.getElementById(section)?.getAttribute('data-zone'), zone).toBe(zone);
    }
  });

  it('section et modale se déduisent de l’identifiant', () => {
    expect(sectionDuRepere('builder.donnees.series.ajouter')).toBe('section-data');
    expect(sectionDuRepere('builder.actions.generer')).toBeUndefined();
    expect(modaleDuRepere('builder.facettes.champs.libelle')).toBe('facets-fields-modal');
    expect(modaleDuRepere('builder.donnees.tableau.colonnes')).toBe('datalist-columns-modal');
    expect(modaleDuRepere('builder.donnees.tableau.recherche')).toBeUndefined();
  });
});

describe('reveler()', () => {
  const adaptateur = () => creerAdaptateurBuilder();

  it('ouvre la section repliée et rend le contrôle', async () => {
    const section = document.getElementById('section-appearance')!;
    expect(section.classList.contains('collapsed')).toBe(true);
    const el = await adaptateur().reveler('builder.apparence.palette');
    expect(el?.id).toBe('chart-palette');
    expect(section.classList.contains('collapsed')).toBe(false);
  });

  it('rend une zone (data-zone) par son identifiant', async () => {
    const el = await adaptateur().reveler('builder.type');
    expect(el?.id).toBe('section-type');
  });

  it('déplie le <details> de la requête avancée', async () => {
    const details = document.getElementById('query-advanced-details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const el = await adaptateur().reveler('builder.donnees.requete.regroupement');
    expect(el?.id).toBe('query-group-by');
    expect(details.open).toBe(true);
  });

  it('contrôle masqué (section en display:none) : null, jamais révélé de force', async () => {
    expect(document.getElementById('section-facets')!.style.display).toBe('none');
    expect(await adaptateur().reveler('builder.facettes.tri')).toBeNull();
  });

  it('contrôle masqué par hidden : null', async () => {
    // #filters-text est masqué tant que le mode texte n'est pas choisi.
    expect(await adaptateur().reveler('builder.donnees.filtres.texte')).toBeNull();
  });

  it('modale fermée : ouverte pour un contrôle qu’elle porte', async () => {
    const modale = document.getElementById('facets-fields-modal')!;
    expect(modale.classList.contains('active')).toBe(false);
    const el = await adaptateur().reveler('builder.facettes.champs.appliquer');
    expect(el?.id).toBe('facets-fields-save');
    expect(modale.classList.contains('active')).toBe(true);
  });

  it('modale fermée sans ses lignes : null, et la modale est refermée', async () => {
    const modale = document.getElementById('datalist-columns-modal')!;
    expect(await adaptateur().reveler('builder.donnees.tableau.colonnes.libelle')).toBeNull();
    expect(modale.classList.contains('active')).toBe(false);
  });

  it('identifiant hors grammaire ou absent du DOM : null', async () => {
    expect(await adaptateur().reveler('builder.x"] *')).toBeNull();
    expect(await adaptateur().reveler('builder.donnees.inexistant')).toBeNull();
  });

  it("ne modifie jamais l'état du builder", async () => {
    const a = adaptateur();
    for (const r of REPERES) await a.reveler(r.id);
    expect(instantane()).toBe(etatInitial);
  });
});

describe('etat() et onEtatChange()', () => {
  it('etat() est l’état singleton du builder', () => {
    expect(creerAdaptateurBuilder().etat()).toBe(state);
  });

  it('un changement de contrôle rappelle une fois, en microtâche, puis se désabonne', async () => {
    const a = creerAdaptateurBuilder();
    let appels = 0;
    const stop = a.onEtatChange!(() => appels++);
    const select = document.getElementById('chart-palette')!;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));
    expect(appels).toBe(0);
    await Promise.resolve();
    expect(appels).toBe(1);

    document.dispatchEvent(new Event('builder:fields-updated'));
    await Promise.resolve();
    expect(appels).toBe(2);

    stop();
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    expect(appels).toBe(2);
  });
});

describe('montrer() avec l’adaptateur du builder', () => {
  it('type sans séries : montre la zone Type de graphique avec le message', async () => {
    Object.assign(state, {
      chartType: 'pie',
      fields: [{ name: 'region', type: 'string', sample: 'Bretagne' }],
    });
    const r = await montrer('builder.donnees.series.ajouter', {
      registre: REGISTRE,
      adaptateur: creerAdaptateurBuilder(),
      mode: 'dire',
    });
    expect(r.ok).toBe(false);
    expect(r.raison).toBe('prerequis');
    expect(r.prerequis).toBe('type-multi-series');
    expect(r.element?.id).toBe('section-type');
    expect(r.chemin).toEqual(['Type de graphique']);
  });

  it('sans source : montre le choix de la source', async () => {
    Object.assign(state, { chartType: 'bar', fields: [] });
    const r = await montrer('builder.donnees.champ-x', {
      registre: REGISTRE,
      adaptateur: creerAdaptateurBuilder(),
      mode: 'dire',
    });
    expect(r.prerequis).toBe('source-chargee');
    expect(r.element?.id).toBe('saved-source');
  });

  it('prérequis remplis : montre le contrôle et son chemin', async () => {
    Object.assign(state, {
      chartType: 'bar',
      fields: [{ name: 'region', type: 'string', sample: 'Bretagne' }],
    });
    const r = await montrer('builder.donnees.champ-x', {
      registre: REGISTRE,
      adaptateur: creerAdaptateurBuilder(),
      mode: 'dire',
    });
    expect(r.ok).toBe(true);
    expect(r.element?.id).toBe('label-field');
    expect(r.chemin).toEqual(['Configuration des données', 'Étiquettes (axe horizontal)']);
  });
});

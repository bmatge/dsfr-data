/**
 * Adaptateur de révélation du dashboard (#1007, ADR-143 §6) : ouverture de la
 * modale du widget qui porte le réglage (sélectionné d'abord), modale
 * d'enregistrement, onglet Aperçu ; `null` sans widget du type ; jamais de
 * modale ouverte remplacée ; jamais de modification du tableau de bord. Et le
 * chemin par `montrer()` : un prérequis manquant montre l'item de bibliothèque.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { effacerSurbrillance, montrer } from '@dsfr-data/shared';
import {
  creerAdaptateurDashboard,
  typeDuRepere,
  widgetPour,
} from '../../../apps/dashboard/src/assistant/adaptateur';
import { PREREQUIS } from '../../../apps/dashboard/src/assistant/prerequis';
import { REGISTRE, REPERES } from '../../../apps/dashboard/src/assistant/reperes.generated';
import {
  createEmptyDashboard,
  createWidget,
  state,
  type AppState,
  type Widget,
} from '../../../apps/dashboard/src/state';
import { renderWidget } from '../../../apps/dashboard/src/widgets';

const RACINE = resolve(import.meta.dirname, '../../..');

function corpsIndex(): string {
  const html = readFileSync(join(RACINE, 'apps/dashboard/index.html'), 'utf-8');
  const ouverture = html.indexOf('>', html.indexOf('<body')) + 1;
  let corps = html.slice(ouverture, html.indexOf('</body>'));
  for (let debut = corps.indexOf('<script'); debut !== -1; debut = corps.indexOf('<script')) {
    const fin = corps.indexOf('</script>', debut);
    corps = corps.slice(0, debut) + corps.slice(fin + '</script>'.length);
  }
  return corps;
}

function poser(widget: Widget): Widget {
  state.dashboard.widgets.push(widget);
  const cell = document.querySelector<HTMLElement>(
    `.drop-cell[data-row="${widget.position.row}"][data-col="${widget.position.col}"]`
  );
  if (cell) renderWidget(widget, cell);
  return widget;
}

const modale = () => document.getElementById('config-modal')!;
const documentActuel = () => JSON.stringify(state.dashboard);

beforeEach(() => {
  document.body.innerHTML = corpsIndex();
  state.dashboard = createEmptyDashboard();
  state.selectedWidget = null;
});

afterEach(() => {
  effacerSurbrillance();
  document.body.innerHTML = '';
});

describe('tables de l’adaptateur', () => {
  it('type de widget déduit de l’identifiant', () => {
    expect(typeDuRepere('dashboard.widget.kpi.valeur')).toBe('kpi');
    expect(typeDuRepere('dashboard.widget.graphique')).toBe('chart');
    expect(typeDuRepere('dashboard.widget.titre')).toBeUndefined();
    expect(typeDuRepere('dashboard.actions.enregistrer')).toBeUndefined();
  });

  it('widget visé : le sélectionné s’il convient, sinon le premier du type', () => {
    const kpi = createWidget('kpi', 0, 0);
    const texte = createWidget('text', 0, 1);
    const etat: AppState = { ...state, dashboard: { ...state.dashboard, widgets: [kpi, texte] } };
    expect(widgetPour(etat, 'dashboard.widget.texte.style')).toBe(texte);
    expect(widgetPour({ ...etat, selectedWidget: kpi }, 'dashboard.widget.titre')).toBe(kpi);
    expect(widgetPour(etat, 'dashboard.widget.tableau.tri')).toBeNull();
  });

  it('un graphique issu des favoris ne règle pas les champs d’un graphique manuel', () => {
    const favori: Widget = {
      ...createWidget('chart', 0, 0),
      type: 'chart',
      config: { fromFavorite: true, favoriteId: 'f', code: '' },
    };
    const etat: AppState = { ...state, dashboard: { ...state.dashboard, widgets: [favori] } };
    expect(widgetPour(etat, 'dashboard.widget.graphique.type')).toBeNull();
    expect(widgetPour(etat, 'dashboard.widget.titre')).toBe(favori);
  });
});

describe('reveler()', () => {
  const adaptateur = () => creerAdaptateurDashboard();

  it('ouvre la modale du widget du type demandé et rend le contrôle', async () => {
    poser(createWidget('kpi', 0, 0));
    const el = await adaptateur().reveler('dashboard.widget.kpi.format');
    expect(el?.id).toBe('config-format');
    expect(modale().classList.contains('active')).toBe(true);
  });

  it('préfère le widget sélectionné', async () => {
    poser(createWidget('text', 0, 0));
    const second = poser(createWidget('text', 0, 1));
    state.selectedWidget = second;
    await adaptateur().reveler('dashboard.widget.texte.contenu');
    expect(state.selectedWidget).toBe(second);
  });

  it('sans widget du type : null, aucune modale ouverte', async () => {
    poser(createWidget('kpi', 0, 0));
    expect(await adaptateur().reveler('dashboard.widget.tableau.colonnes')).toBeNull();
    expect(modale().classList.contains('active')).toBe(false);
  });

  it('ne remplace jamais une modale ouverte sur un autre widget', async () => {
    const kpi = poser(createWidget('kpi', 0, 0));
    poser(createWidget('text', 0, 1));
    const a = adaptateur();
    await a.reveler('dashboard.widget.kpi.valeur');
    (document.getElementById('config-value') as HTMLInputElement).value = 'saisie en cours';
    expect(await a.reveler('dashboard.widget.texte.style')).toBeNull();
    expect(state.selectedWidget).toBe(kpi);
    expect((document.getElementById('config-value') as HTMLInputElement).value).toBe(
      'saisie en cours'
    );
  });

  it('modale d’enregistrement ouverte pour ses champs', async () => {
    const el = await adaptateur().reveler('dashboard.enregistrement.nom');
    expect(el?.id).toBe('save-dashboard-name');
    expect(document.getElementById('save-modal')!.classList.contains('active')).toBe(true);
  });

  it('grille : revient sur l’onglet Aperçu', async () => {
    const design = document.getElementById('tab-design')!;
    design.classList.remove('fr-tabs__panel--selected');
    document.getElementById('tab-code')!.classList.add('fr-tabs__panel--selected');
    const el = await adaptateur().reveler('dashboard.canevas.grille');
    expect(el?.id).toBe('dashboard-grid');
    expect(design.classList.contains('fr-tabs__panel--selected')).toBe(true);
  });

  it('cibles de la visite guidée : bibliothèque, grille, barre d’actions', async () => {
    const a = adaptateur();
    expect((await a.reveler('dashboard.bibliotheque'))?.id).toBe('widget-library');
    expect((await a.reveler('dashboard.canevas.grille'))?.id).toBe('dashboard-grid');
    expect((await a.reveler('dashboard.actions'))?.tagName.toLowerCase()).toBe('app-action-bar');
  });

  it('identifiant hors grammaire ou absent du DOM : null', async () => {
    expect(await adaptateur().reveler('dashboard.x"] *')).toBeNull();
    expect(await adaptateur().reveler('dashboard.canevas.inexistant')).toBeNull();
  });

  it('ne modifie jamais le tableau de bord', async () => {
    poser(createWidget('kpi', 0, 0));
    poser(createWidget('chart', 0, 1));
    const avant = documentActuel();
    const a = adaptateur();
    for (const r of REPERES) {
      await a.reveler(r.id);
      document.getElementById('config-modal')!.classList.remove('active');
      document.getElementById('save-modal')!.classList.remove('active');
      state.selectedWidget = null;
    }
    expect(documentActuel()).toBe(avant);
  });
});

describe('prérequis', () => {
  it('chaque règle est fausse sans widget, vraie avec, et levée par un repère du registre', () => {
    const ids = new Set(REPERES.map((r) => r.id));
    const types = {
      'widget-kpi': 'kpi',
      'widget-graphique': 'chart',
      'widget-tableau': 'table',
      'widget-texte': 'text',
    } as const;
    for (const [nom, regle] of Object.entries(PREREQUIS)) {
      expect(ids.has(regle.repereQuiLeve), nom).toBe(true);
      const vide: AppState = { ...state, dashboard: createEmptyDashboard() };
      expect(regle.verifier(vide), nom).toBe(false);
      const plein: AppState = {
        ...state,
        dashboard: {
          ...createEmptyDashboard(),
          widgets: [createWidget(types[nom as keyof typeof types], 0, 0)],
        },
      };
      expect(regle.verifier(plein), nom).toBe(true);
    }
  });
});

describe('montrer() avec l’adaptateur du dashboard', () => {
  it('sans widget KPI : montre l’item KPI de la bibliothèque', async () => {
    const r = await montrer('dashboard.widget.kpi.valeur', {
      registre: REGISTRE,
      adaptateur: creerAdaptateurDashboard(),
      mode: 'dire',
    });
    expect(r.ok).toBe(false);
    expect(r.prerequis).toBe('widget-kpi');
    expect(r.element?.getAttribute('data-widget-type')).toBe('kpi');
    expect(r.chemin).toEqual(['Bibliothèque de widgets', 'Widget KPI']);
  });

  it('avec un widget KPI : montre le champ et son chemin', async () => {
    poser(createWidget('kpi', 0, 0));
    const r = await montrer('dashboard.widget.kpi.valeur', {
      registre: REGISTRE,
      adaptateur: creerAdaptateurDashboard(),
      mode: 'dire',
    });
    expect(r.ok).toBe(true);
    expect(r.element?.id).toBe('config-value');
    expect(r.chemin).toEqual(['Configurer le widget', 'Réglages du KPI', 'Valeur']);
  });
});

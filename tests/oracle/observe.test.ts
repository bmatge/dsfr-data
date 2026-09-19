import { describe, it, expect, beforeEach } from 'vitest';
import {
  lireAttribut,
  lireCache,
  lireClasses,
  lireDiagnostics,
  lireFacettes,
  lireGraphique,
  lireKpi,
  lireLegende,
  lireListe,
  lirePastilles,
  lireTexte,
  lireTextes,
} from '../../tools/oracle/observe.js';

/**
 * Les lecteurs d'observation, éprouvés sur un DOM MINIMAL.
 *
 * Ce sont les mêmes fonctions que Playwright sérialise pour les exécuter dans
 * la page : si l'une d'elles capturait un symbole de module, elle marcherait
 * ici et tomberait en `undefined is not a function` dans le navigateur. Ce
 * test fixe leur contrat — ce qu'elles lisent, et ce qu'elles rendent quand
 * il n'y a rien à lire.
 */
describe('vérification des données — lecteurs d’observation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('KPI : le texte affiché et le nombre qu’on y lit, unité comprise', () => {
    document.body.innerHTML = `
      <div id="k1"><span class="dsfr-data-kpi__value">6 971</span></div>
      <div id="k2"><span class="dsfr-data-kpi__value">1 234,5 €</span></div>
      <div id="k3"><span class="dsfr-data-kpi__value">44,9 Md €</span></div>
      <div id="k4"><span class="dsfr-data-kpi__value">—</span></div>
      <div id="k5"></div>`;
    expect(lireKpi('k1')).toEqual({ text: '6 971', value: 6971 });
    expect(lireKpi('k2').value).toBe(1234.5);
    // Le format compact perd de l'information : le lecteur rend ce qu'il voit,
    // la comparaison se fait à la précision affichée.
    expect(lireKpi('k3').value).toBe(44.9);
    expect(lireKpi('k4')).toEqual({ text: '—', value: null });
    expect(lireKpi('k5')).toEqual({ text: '', value: null });
    expect(lireKpi('absent')).toEqual({ text: '', value: null });
  });

  it('cache de données : ce que la page expose, ou null', () => {
    const w = window as unknown as { __verif?: { getDataCache: (i: string) => unknown } };
    w.__verif = { getDataCache: (id) => (id === 'q' ? [{ a: 1 }, { a: 2 }] : undefined) };
    expect(lireCache('q')).toEqual([{ a: 1 }, { a: 2 }]);
    expect(lireCache('autre')).toBeNull();
    delete w.__verif;
    expect(lireCache('q')).toBeNull();
  });

  it('graphique : les attributs x / y / name de l’élément DSFR Chart rendu', () => {
    document.body.innerHTML = `
      <div id="g">
        <div class="dsfr-data-chart__wrapper">
          <bar-chart x='[["sud","est"]]' y='[[80,73]]' name='["Flux"]'></bar-chart>
        </div>
      </div>
      <div id="g2">
        <line-chart x='[["a","b"]]' y='[[1,2],[3,null]]' name="Taux"></line-chart>
      </div>
      <div id="g3"></div>`;
    expect(lireGraphique('g')).toEqual({
      tag: 'bar-chart',
      labels: ['sud', 'est'],
      series: [[80, 73]],
      names: ['Flux'],
    });
    const multi = lireGraphique('g2')!;
    expect(multi.series).toEqual([
      [1, 2],
      [3, null],
    ]);
    expect(multi.names).toEqual(['Taux']);
    expect(lireGraphique('g3')).toBeNull();
    expect(lireGraphique('absent')).toBeNull();
  });

  it('légende de carte : les entrées de getLegendEntries(), bornes comprises', () => {
    document.body.innerHTML = `<div id="couche"></div><div id="muet"></div>`;
    const couche = document.getElementById('couche') as HTMLElement & {
      getLegendEntries?: () => unknown;
    };
    couche.getLegendEntries = () => [
      { color: '#eee', label: 'De 60 à 80', from: 60, to: 80 },
      { color: '#333', label: 'Plus de 120', from: 120 },
    ];
    expect(lireLegende('couche')).toEqual([
      { color: '#eee', label: 'De 60 à 80', from: 60, to: 80 },
      { color: '#333', label: 'Plus de 120', from: 120, to: null },
    ]);
    expect(lireLegende('muet')).toBeNull();
  });

  it('liste : en-têtes et cellules rendus, sans la colonne de sélection', () => {
    document.body.innerHTML = `
      <div id="l">
        <table>
          <thead><tr>
            <th class="dsfr-data-list__select-head">Filtrer</th>
            <th>Académie</th><th>Population</th>
          </tr></thead>
          <tbody>
            <tr><td class="dsfr-data-list__select-cell"><button></button></td>
                <td>PARIS</td><td>12 000</td></tr>
            <tr><td class="dsfr-data-list__select-cell"><button></button></td>
                <td>LYON</td><td>5 000</td></tr>
          </tbody>
        </table>
      </div>
      <div id="vide">
        <table><thead><tr><th>Académie</th></tr></thead>
          <tbody><tr><td class="dsfr-data-list__empty">Aucune donnée</td></tr></tbody></table>
      </div>`;
    expect(lireListe('l')).toEqual({
      headers: ['Académie', 'Population'],
      rows: [
        ['PARIS', '12 000'],
        ['LYON', '5 000'],
      ],
    });
    expect(lireListe('vide')!.rows).toEqual([]);
    expect(lireListe('absent')).toBeNull();
  });

  it('facettes : valeurs et compteurs affichés, cases à cocher et liste déroulante', () => {
    document.body.innerHTML = `
      <div id="f">
        <fieldset>
          <legend>Région</legend>
          <div class="fr-fieldset__element">
            <input type="checkbox" id="a">
            <label for="a">Occitanie<span class="dsfr-data-facets__count">8</span><span class="fr-sr-only">, 8 resultats</span></label>
          </div>
          <div class="fr-fieldset__element">
            <input type="checkbox" id="b">
            <label for="b">Normandie<span class="dsfr-data-facets__count">1 240</span></label>
          </div>
          <div class="fr-fieldset__element">
            <button type="button">Voir plus (3)</button>
          </div>
        </fieldset>
        <div class="fr-select-group" data-field="categorie">
          <label class="fr-label" for="s">Catégorie</label>
          <select id="s">
            <option value="">Tous</option>
            <option value="École">École (10)</option>
            <option value="Lycée">Lycée (8)</option>
          </select>
        </div>
      </div>
      <div id="vide"></div>`;
    expect(lireFacettes('f')).toEqual([
      {
        group: 'Région',
        values: [
          { value: 'Occitanie', count: 8 },
          { value: 'Normandie', count: 1240 },
        ],
      },
      {
        group: 'Catégorie',
        values: [
          { value: 'École', count: 10 },
          { value: 'Lycée', count: 8 },
        ],
      },
    ]);
    // Un fieldset sans légende (panneau déroulant) et l'option « Tous » ne
    // sont pas des valeurs de facette.
    expect(lireFacettes('vide')).toEqual([]);
    expect(lireFacettes('absent')).toBeNull();
  });

  it('texte : le libellé affiché, blancs normalisés, et le nombre qu’on y lit', () => {
    document.body.innerHTML = `
      <div id="v">Résultats pour
        Occitanie</div>
      <div id="t">
        <p class="fr-sr-only">Filtre retiré</p>
        <ul><li><button class="fr-tag">Région\u00a0: Occitanie</button></li></ul>
      </div>
      <div id="r"><p class="dsfr-data-search-count">1 240 résultats</p></div>`;
    expect(lireTexte({ id: 'v' })).toEqual({ text: 'Résultats pour Occitanie', value: null });
    expect(lireTexte({ id: 't', selector: '.fr-tag' })!.text).toBe('Région : Occitanie');
    expect(lireTexte({ id: 'r', selector: '.dsfr-data-search-count' })).toEqual({
      text: '1 240 résultats',
      value: 1240,
    });
    expect(lireTexte({ id: 'r', selector: '.absent' })).toBeNull();
    expect(lireTexte({ id: 'absent' })).toBeNull();
  });

  // --- Lot AFFICHAGES (L5) ------------------------------------------------

  it('textes : un par élément désigné, espaces normalisés', () => {
    document.body.innerHTML = `
      <div id="k">
        <span class="dsfr-data-kpi__line">+40 %
          vs janvier</span>
        <span class="dsfr-data-kpi__line">n.d.</span>
        <span class="dsfr-data-kpi__label">Volume</span>
      </div>`;
    expect(lireTextes({ id: 'k', selecteur: '.dsfr-data-kpi__line' })).toEqual([
      '+40 % vs janvier',
      'n.d.',
    ]);
    expect(lireTextes({ id: 'k', selecteur: '.absente' })).toEqual([]);
    expect(lireTextes({ id: 'ailleurs', selecteur: 'span' })).toBeNull();
  });

  it('classes : celles de l’élément désigné, et rien tant que l’affichage n’est pas prêt', () => {
    document.body.innerHTML = `
      <div id="k1"><div class="dsfr-data-kpi dsfr-data-kpi--success">
        <span class="dsfr-data-kpi__value">41,0</span></div></div>
      <div id="k2"><div class="dsfr-data-kpi dsfr-data-kpi--info">
        <span class="dsfr-data-kpi__loading">Chargement</span></div></div>`;
    expect(lireClasses({ id: 'k1', selecteur: '.dsfr-data-kpi' })).toEqual({
      classes: ['dsfr-data-kpi', 'dsfr-data-kpi--success'],
    });
    expect(
      lireClasses({ id: 'k1', selecteur: '.dsfr-data-kpi', pret: '.dsfr-data-kpi__value' })
    ).not.toBeNull();
    // L'état de chargement porte la classe neutre : le lire serait une erreur.
    expect(
      lireClasses({ id: 'k2', selecteur: '.dsfr-data-kpi', pret: '.dsfr-data-kpi__value' })
    ).toBeNull();
    expect(lireClasses({ id: 'absent', selecteur: '.dsfr-data-kpi' })).toBeNull();
  });

  it('attribut : celui de l’élément DSFR Chart rendu, jamais celui de l’hôte', () => {
    document.body.innerHTML = `
      <div id="g" x-min="0" value="12">
        <line-chart x-min="3" value="43.07"></line-chart>
      </div>
      <div id="sans-chart" x-min="0"></div>`;
    expect(lireAttribut({ id: 'g', attribut: 'x-min' })).toBe('3');
    expect(lireAttribut({ id: 'g', attribut: 'value' })).toBe('43.07');
    expect(lireAttribut({ id: 'g', attribut: 'y-max' })).toBeNull();
    // Sans élément rendu, rien — sinon on relirait l'attribut écrit par la page.
    expect(lireAttribut({ id: 'sans-chart', attribut: 'x-min' })).toBeNull();
    expect(lireAttribut({ id: 'absent', attribut: 'x-min' })).toBeNull();
  });

  it('diagnostics : le marqueur de l’élément, et les seuls messages de la bibliothèque', () => {
    document.body.innerHTML = `
      <div id="ctx" data-dsfr-config-error="attribut &quot;sources&quot; requis"></div>
      <div id="sain"></div>`;
    const w = window as unknown as { __verifConsole?: unknown };
    w.__verifConsole = [
      { level: 'warn', text: 'dsfr-data-context[ctx]: le champ "x" n’existe pas sur "s1"' },
      { level: 'error', text: 'dsfr-data-facets: attribut "id" requis' },
      // Ni l'un ni l'autre ne vient de la bibliothèque : ils ne comptent pas.
      { level: 'warn', text: 'Lit is in dev mode. Not recommended for production!' },
      { level: 'error', text: 'Failed to load resource: 404 (tile.png)' },
      // Un niveau inconnu ou un texte manquant n'est pas un message.
      { level: 'info', text: 'dsfr-data-source: chargé' },
      { level: 'warn' },
    ];
    expect(lireDiagnostics('ctx')).toEqual({
      configError: 'attribut "sources" requis',
      console: [
        { level: 'warn', text: 'dsfr-data-context[ctx]: le champ "x" n’existe pas sur "s1"' },
        { level: 'error', text: 'dsfr-data-facets: attribut "id" requis' },
      ],
    });
    // Le journal est celui de la PAGE : un autre élément lit les mêmes messages.
    expect(lireDiagnostics('sain').configError).toBeNull();
    expect(lireDiagnostics('sain').console).toHaveLength(2);
    // Élément absent : pas de marqueur, le journal seul parle.
    expect(lireDiagnostics('absent').configError).toBeNull();

    delete w.__verifConsole;
    expect(lireDiagnostics('sain')).toEqual({ configError: null, console: [] });
  });

  it('pastilles de légende : la couleur de chacune, dans l’ordre', () => {
    document.body.innerHTML = `
      <div id="g">
        <span class="legend_dot" style="background-color: rgb(0, 0, 145)"></span>
        <span class="legend_dot" style="background-color: rgb(225, 0, 15)"></span>
      </div>
      <div id="nu"></div>`;
    expect(lirePastilles('g')).toEqual(['rgb(0, 0, 145)', 'rgb(225, 0, 15)']);
    expect(lirePastilles('nu')).toEqual([]);
    expect(lirePastilles('absent')).toBeNull();
  });
});

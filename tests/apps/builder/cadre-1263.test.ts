/**
 * Cadre officiel DSFR dans le Builder (#1263, arbitrage du 2026-10-12) : la
 * date lue dans les données, l'infobulle, la fenêtre d'information et les
 * actions du menu reçoivent un contrôle ; les réglages du cadre et les séries
 * supplémentaires entrent dans l'instantané des favoris.
 *
 * Trois étages, comme `lecture-1218.test.ts` :
 *   1. le module pur `cadre.ts` — valeurs par défaut, lecture défensive d'un
 *      état déposé, échappement du contenu, traduction en attributs ;
 *   2. le CODE généré, dans les chemins du générateur : données locales
 *      intégrées (balise `<data-box>` nue), intégrées par la bibliothèque, API
 *      intégrée, Grist dynamique, API dynamique (OpenDataSoft, Tabular,
 *      générique). Les attributs sont RELUS par un parseur HTML : ce qui est
 *      vérifié est ce que le navigateur recevra, pas la forme de l'échappement ;
 *   3. l'instantané des favoris et le formulaire.
 *
 * RÉTROCOMPATIBILITÉ : sans aucun des réglages de ce lot, les attributs du
 * cadre sont ceux d'avant, dans le même ordre ; sans cadre, le code est celui
 * d'avant au caractère près (la suite existante l'épingle et passe sans
 * modification).
 *
 * Preuves de mutation (rejouées le 2026-10-12, défaut retiré ensuite) :
 * - retirer `...CADRE_KEYS` de `getBuilderStateToSave` (ui-helpers.ts) : les
 *   cas « porte tout le cadre » et « aller-retour » rougissent ;
 * - retirer `extraSeries` de `getBuilderStateToSave` : le cas « porte toutes
 *   les séries » rougit ;
 * - ne plus appeler `echapperTexte` dans `modalContentHtml` (cadre.ts) : le cas
 *   « une balise saisie est échappée » et les deux « texte piégé » rougissent ;
 * - écrire la valeur d'un attribut sans l'échapper dans `cadreAttrHtml`
 *   (code-generator.ts) : quatre cas rougissent, dont les deux « texte piégé » ;
 * - retirer `aggregateExpr += dateAgg.expr` de `generateDsfrDataQueryCode` :
 *   les cas Grist, API générique et requête avancée rougissent ;
 * - retirer `|| cadreActive(…)` de `generateCode` : le cas « API intégrée »
 *   rougit (le cadre disparaît du code, comme avant ce lot) ;
 * - faire rendre une chaîne vide à `cadreDep()` : le cas « le cadre charge le
 *   JavaScript du DSFR » rougit, avec deux autres.
 * Réouverture d'un favori par `loadFavoriteState` et statut « modifié » :
 * `retour-playground-champs.test.ts`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  generateChartFromLocalData,
  generateCode,
  generateDynamicCode,
  generateDynamicCodeForApi,
  usesLibEmbedded,
} from '../../../apps/builder/src/ui/code-generator';
import { getBuilderStateToSave } from '../../../apps/builder/src/ui/ui-helpers';
import {
  fieldHasIsoDates,
  populateDateFieldSelect,
  restoreCadre,
  setupCadreListeners,
  syncCadreControls,
  updateCadreVisibility,
} from '../../../apps/builder/src/ui/cadre';
import {
  CADRE_KEYS,
  actionsValue,
  cadreApplies,
  cadreAttrs,
  cadreDateField,
  cadreDefaults,
  dataBoxAttrs,
  latestIsoDate,
  modalContentHtml,
  normalizeCadre,
  uneLigne,
  type CadreSettings,
} from '../../../apps/builder/src/cadre';
import { lectureDefaults } from '../../../apps/builder/src/lecture';
import {
  normalizeExtraSeries,
  state,
  type BuilderState,
  type ChartType,
} from '../../../apps/builder/src/state';

vi.mock('../../../apps/builder/src/ui/accessible-table', () => ({
  updateAccessibleTable: vi.fn(),
}));

const RACINE = resolve(import.meta.dirname, '../../..');

const LIGNES = [
  { region: 'Bretagne', budget: 100, maj: '2024-03-01' },
  { region: 'Bretagne', budget: 50, maj: '2025-06-15T10:00:00' },
  { region: 'Normandie', budget: 80, maj: '2023-01-20' },
  { region: 'Corse', budget: 20, maj: 'inconnue' },
];

const CHAMPS = [
  { name: 'region', type: 'string', sample: 'Bretagne' },
  { name: 'budget', type: 'number', sample: 100 },
  { name: 'maj', type: 'string', sample: '2024-03-01' },
];

function reinitialiser(): void {
  Object.assign(state, {
    chartType: 'bar',
    labelField: 'region',
    labelFieldLabel: '',
    valueField: 'budget',
    valueFieldLabel: '',
    valueField2: '',
    extraSeries: [],
    lineField: '',
    lineFieldLabel: '',
    seriesField: '',
    stacked: false,
    codeField: '',
    aggregation: 'sum',
    sortOrder: 'none',
    sortField: '',
    title: 'Mon graphique',
    subtitle: '',
    palette: 'default',
    data: [],
    localData: LIGNES.map((l) => ({ ...l })),
    fields: CHAMPS,
    savedSource: null,
    sourceType: 'saved',
    generationMode: 'embedded',
    advancedMode: false,
    queryFilter: '',
    queryGroupBy: '',
    queryAggregate: '',
    refreshInterval: 0,
    apiUrl: '',
    isSampleData: false,
    a11yEnabled: true,
    a11yTable: true,
    a11yDownload: true,
    a11yDescription: '',
    urlSync: false,
    normalizeConfig: {
      enabled: false,
      flatten: '',
      trim: false,
      numericAuto: false,
      numeric: '',
      rename: '',
      stripHtml: false,
      replace: '',
      lowercaseKeys: false,
    },
    facetsConfig: { enabled: false, fields: [], maxValues: 6, sort: 'count', hideEmpty: false },
    ...lectureDefaults(),
    ...cadreDefaults(),
  } satisfies Partial<BuilderState>);
  document.body.innerHTML = '<div id="generated-code"></div><div id="raw-data"></div>';
}

const code = (): string => document.getElementById('generated-code')!.textContent!;

/**
 * Le code généré, relu comme le navigateur le lira (entités décodées). Dans un
 * `<template>` : son contenu est inerte, aucune feuille ni aucun script des
 * dépendances n'est chargé.
 */
function page(): DocumentFragment {
  const gabarit = document.createElement('template');
  gabarit.innerHTML = code();
  return gabarit.content;
}

/** Attributs d'une balise du code généré, tels que le navigateur les reçoit. */
function attributs(balise: string): Record<string, string> {
  const el = page().querySelector(balise);
  expect(el, `balise ${balise} introuvable`).not.toBeNull();
  const out: Record<string, string> = {};
  for (const a of el!.attributes) out[a.name] = a.value;
  return out;
}

/** Noms des attributs `databox*` de `dsfr-data-chart`, dans l'ordre d'écriture. */
function nomsDuCadre(): string[] {
  return Object.keys(attributs('dsfr-data-chart')).filter((n) => n.startsWith('databox'));
}

const GRIST = {
  id: 'g1',
  name: 'Budget Grist',
  type: 'grist' as const,
  apiUrl: 'https://docs.getgrist.com/api/docs/doc1/tables/Budget/records',
  documentId: 'doc1',
  tableId: 'Budget',
};
const ODS = {
  id: 'o1',
  name: 'Budget ODS',
  type: 'api' as const,
  apiUrl: 'https://data.exemple.fr/api/explore/v2.1/catalog/datasets/budget/records',
};
const TABULAR = {
  id: 't1',
  name: 'Budget Tabular',
  type: 'api' as const,
  apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc-123/data/',
};
const GENERIQUE = {
  id: 'a1',
  name: 'Budget API',
  type: 'api' as const,
  apiUrl: 'https://api.exemple.fr/budget',
};

/** Les six attributs de `dsfr-data-chart` auxquels ce lot donne un contrôle. */
const ATTRIBUTS = [
  'databox-date-field',
  'databox-tooltip-title',
  'databox-tooltip-content',
  'databox-modal-title',
  'databox-modal-content',
  'databox-actions',
];

/** Un texte piégé : guillemets, apostrophe, chevrons, esperluette, balise active. */
const PIEGE = `Taux "brut" de l'Insee <b>gras</b> & <img src=x onerror="alert(1)">`;

/** Tous les réglages du cadre posés à la fois. */
function toutPoser(): CadreSettings {
  return {
    databoxEnabled: true,
    databoxTitle: 'Budget par région',
    databoxSource: 'INSEE, 2024',
    databoxDate: '',
    databoxDateField: 'maj',
    databoxTrend: '+5.2',
    databoxDownload: true,
    databoxScreenshot: true,
    databoxTooltipTitle: 'Méthode',
    databoxTooltipContent: 'Montants en euros courants.\nHors investissement.',
    databoxModalTitle: 'En savoir plus',
    databoxModalContent: 'Premier paragraphe.\nSuite.\n\nSecond paragraphe.',
    databoxActions: ['Voir la méthode', '  ', 'Signaler une erreur', 'Voir la méthode'],
  };
}

// ---------------------------------------------------------------------------
// 1. Module pur
// ---------------------------------------------------------------------------

describe('cadre.ts : valeurs par défaut et types encadrés', () => {
  it('par défaut : cadre désactivé, téléchargement coché, rien d’autre', () => {
    expect(cadreDefaults()).toEqual({
      databoxEnabled: false,
      databoxTitle: '',
      databoxSource: '',
      databoxDate: '',
      databoxDateField: '',
      databoxTrend: '',
      databoxDownload: true,
      databoxScreenshot: false,
      databoxTooltipTitle: '',
      databoxTooltipContent: '',
      databoxModalTitle: '',
      databoxModalContent: '',
      databoxActions: [],
    });
    expect(CADRE_KEYS).toHaveLength(13);
  });

  it('le cadre ne concerne que les types rendus par dsfr-data-chart', () => {
    for (const type of ['bar', 'horizontalBar', 'line', 'pie', 'doughnut', 'radar', 'scatter']) {
      expect(cadreApplies(type), type).toBe(true);
    }
    for (const type of ['bar-line', 'map', 'map-reg', 'map-aca', 'map-monde']) {
      expect(cadreApplies(type), type).toBe(true);
    }
    for (const type of ['kpi', 'gauge', 'datalist', 'podium']) {
      expect(cadreApplies(type), type).toBe(false);
      expect(cadreAttrs(type, toutPoser(), 'maj__max'), type).toEqual([]);
    }
  });

  it('cadre désactivé : aucun attribut, quoi que porte l’état', () => {
    expect(cadreAttrs('bar', { ...toutPoser(), databoxEnabled: false }, 'maj__max')).toEqual([]);
  });
});

describe('cadre.ts : traduction en attributs de dsfr-data-chart', () => {
  it('sans réglage de ce lot : les attributs d’avant, dans le même ordre', () => {
    const avant: CadreSettings = {
      ...cadreDefaults(),
      databoxEnabled: true,
      databoxTitle: 'Titre',
      databoxSource: 'Source',
      databoxDate: 'Mars 2024',
      databoxTrend: '+1',
      databoxScreenshot: true,
    };
    expect(cadreAttrs('bar', avant)).toEqual([
      { name: 'databox' },
      { name: 'databox-title', value: 'Titre' },
      { name: 'databox-source', value: 'Source' },
      { name: 'databox-date', value: 'Mars 2024' },
      { name: 'databox-download' },
      { name: 'databox-screenshot' },
      { name: 'databox-trend', value: '+1' },
    ]);
    expect(cadreAttrs('bar', { ...cadreDefaults(), databoxEnabled: true })).toEqual([
      { name: 'databox' },
      { name: 'databox-download' },
    ]);
  });

  it('tout posé : les six attributs du lot, et le bouton de la fenêtre', () => {
    const noms = cadreAttrs('bar', toutPoser(), 'maj__max').map((a) => a.name);
    expect(noms).toEqual([
      'databox',
      'databox-title',
      'databox-source',
      'databox-date-field',
      'databox-download',
      'databox-screenshot',
      'databox-fullscreen',
      'databox-trend',
      'databox-tooltip-title',
      'databox-tooltip-content',
      'databox-modal-title',
      'databox-modal-content',
      'databox-actions',
    ]);
    for (const n of ATTRIBUTS) expect(noms, n).toContain(n);
  });

  it('date : la date saisie prime, la colonne n’est alors ni écrite ni chargée', () => {
    const s = { ...toutPoser(), databoxDate: 'Mars 2024' };
    expect(cadreDateField('bar', s)).toBe('');
    const noms = cadreAttrs('bar', s, 'maj__max').map((a) => a.name);
    expect(noms).toContain('databox-date');
    expect(noms).not.toContain('databox-date-field');
    // Sans date saisie, le champ est demandé — seulement si le cadre est actif.
    expect(cadreDateField('bar', toutPoser())).toBe('maj');
    expect(cadreDateField('bar', { ...toutPoser(), databoxEnabled: false })).toBe('');
    expect(cadreDateField('podium', toutPoser())).toBe('');
    // Champ choisi mais colonne non produite en amont : rien n'est écrit.
    expect(cadreAttrs('bar', toutPoser(), '').map((a) => a.name)).not.toContain(
      'databox-date-field'
    );
  });

  it('fenêtre : sans titre, ni fenêtre ni bouton, même avec un contenu', () => {
    const noms = cadreAttrs('bar', { ...toutPoser(), databoxModalTitle: '  ' }).map((a) => a.name);
    expect(noms).not.toContain('databox-modal-title');
    expect(noms).not.toContain('databox-modal-content');
    expect(noms).not.toContain('databox-fullscreen');
  });

  it('fenêtre : un titre seul suffit, le bouton « plein écran » vient avec', () => {
    const s = { ...cadreDefaults(), databoxEnabled: true, databoxModalTitle: 'Méthode' };
    expect(cadreAttrs('bar', s).map((a) => a.name)).toEqual([
      'databox',
      'databox-download',
      'databox-fullscreen',
      'databox-modal-title',
    ]);
  });

  it('infobulle : le titre ou le contenu suffit, sur une seule ligne', () => {
    const attrs = cadreAttrs('bar', { ...toutPoser(), databoxTooltipTitle: '' });
    expect(attrs.find((a) => a.name === 'databox-tooltip-title')).toBeUndefined();
    expect(attrs.find((a) => a.name === 'databox-tooltip-content')?.value).toBe(
      'Montants en euros courants. Hors investissement.'
    );
  });

  it('actions : libellés nettoyés, sans vide ni doublon, en JSON', () => {
    expect(actionsValue(toutPoser().databoxActions)).toEqual([
      'Voir la méthode',
      'Signaler une erreur',
    ]);
    const action = cadreAttrs('bar', toutPoser()).find((a) => a.name === 'databox-actions');
    expect(action?.json).toBe(true);
    expect(JSON.parse(action!.value!)).toEqual(['Voir la méthode', 'Signaler une erreur']);
    // Aucune action valide : pas d'attribut (un tableau vide serait inutile).
    const sans = cadreAttrs('bar', { ...toutPoser(), databoxActions: ['', '   '] });
    expect(sans.find((a) => a.name === 'databox-actions')).toBeUndefined();
  });

  it('balise data-box nue : mêmes réglages, sans préfixe ; la date du jour par défaut', () => {
    const attrs = dataBoxAttrs(
      { ...toutPoser(), databoxDateField: '' },
      'databox-chart',
      '2026-10-12'
    );
    expect(attrs.map((a) => a.name)).toEqual([
      'id',
      'name',
      'source',
      'date',
      'download',
      'screenshot',
      'fullscreen',
      'trend',
      'tooltip-title',
      'tooltip-content',
      'modal-title',
      'modal-content',
      'actions',
      'segmented-control',
    ]);
    expect(attrs.find((a) => a.name === 'date')?.value).toBe('2026-10-12');
    // Sans réglage du lot : la liste d'avant.
    const avant = dataBoxAttrs({ ...cadreDefaults(), databoxEnabled: true }, 'db', '2026-10-12');
    expect(avant.map((a) => a.name)).toEqual([
      'id',
      'name',
      'source',
      'date',
      'download',
      'segmented-control',
    ]);
    expect(avant.find((a) => a.name === 'name')?.value).toBe(' ');
  });
});

describe('cadre.ts : contenu de la fenêtre, échappé', () => {
  it('une ligne vide sépare deux paragraphes, un retour simple devient <br>', () => {
    expect(modalContentHtml('Premier.\nSuite.\n\nSecond.')).toBe(
      '<p>Premier.<br>Suite.</p><p>Second.</p>'
    );
    expect(modalContentHtml('  \n \n')).toBe('');
    expect(modalContentHtml('Windows\r\n\r\nMac\rFin')).toBe('<p>Windows</p><p>Mac<br>Fin</p>');
  });

  it('une balise saisie est échappée : elle s’affichera, elle ne s’exécutera pas', () => {
    const html = modalContentHtml(PIEGE);
    expect(html).toBe(
      `<p>Taux "brut" de l'Insee &lt;b&gt;gras&lt;/b&gt; &amp; &lt;img src=x onerror="alert(1)"&gt;</p>`
    );
    // Injecté par innerHTML (ce que fait DSFR Chart), il ne crée aucun élément actif.
    const hote = document.createElement('div');
    hote.innerHTML = html;
    expect(hote.querySelectorAll('img, b, script')).toHaveLength(0);
    expect(hote.textContent).toBe(PIEGE);
  });

  it('uneLigne ramène retours et blancs répétés à une espace', () => {
    expect(uneLigne('  a\n\n b\t c  ')).toBe('a b c');
  });
});

describe('cadre.ts : la date la plus récente, selon la règle de la bibliothèque', () => {
  it('garde la plus récente des dates ISO, ignore le reste', () => {
    expect(latestIsoDate(['2024-03-01', '2025-06-15T10:00:00', 'inconnue', null, 12])).toBe(
      '2025-06-15T10:00:00'
    );
    expect(latestIsoDate(['2024-03-01 08:00', '2024-03-01'])).toBe('2024-03-01 08:00');
    expect(latestIsoDate(['01/03/2024', '2024', '2024-13-45x', ''])).toBeNull();
    expect(latestIsoDate([])).toBeNull();
  });
});

describe('cadre.ts : lecture défensive d’un état déposé', () => {
  it('un favori d’avant #1263 ne porte aucune clé : tout revient au défaut', () => {
    expect(normalizeCadre({ chartType: 'bar', labelField: 'region' })).toEqual(cadreDefaults());
    expect(normalizeCadre(null)).toEqual(cadreDefaults());
    expect(normalizeCadre('texte')).toEqual(cadreDefaults());
  });

  it('un favori d’après garde tout son cadre', () => {
    const s = { ...toutPoser(), databoxActions: ['Voir la méthode'] };
    expect(normalizeCadre(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('une clé mal formée prend sa valeur par défaut', () => {
    expect(
      normalizeCadre({
        databoxEnabled: 'oui',
        databoxTitle: ['x'],
        databoxDownload: 0,
        databoxActions: 'Voir',
        databoxModalContent: { html: '<b>' },
        databoxTrend: 5.2,
      })
    ).toEqual({ ...cadreDefaults(), databoxTrend: '5.2' });
    expect(normalizeCadre({ databoxActions: ['a', 3, null, { b: 1 }] }).databoxActions).toEqual([
      'a',
      '3',
      '',
      '',
    ]);
  });

  it('séries supplémentaires : même lecture défensive', () => {
    expect(normalizeExtraSeries(undefined)).toEqual([]);
    expect(normalizeExtraSeries('taux')).toEqual([]);
    expect(
      normalizeExtraSeries([
        { field: 'taux', label: 'Taux' },
        { field: 'x' },
        null,
        'y',
        { label: 3 },
      ])
    ).toEqual([
      { field: 'taux', label: 'Taux' },
      { field: 'x', label: '' },
      { field: '', label: '' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. Code généré
// ---------------------------------------------------------------------------

describe('code généré : sans cadre, rien ne change', () => {
  beforeEach(reinitialiser);

  it('cadre décoché : ni attribut, ni dépendance, même si l’état porte des réglages', () => {
    Object.assign(state, toutPoser(), { databoxEnabled: false });
    generateChartFromLocalData();
    expect(code()).toContain('<bar-chart id="chart"');
    expect(code()).not.toContain('data-box');
    expect(code()).not.toContain('dsfr.module.min.js');
    expect(usesLibEmbedded()).toBe(false);

    state.generationMode = 'dynamic';
    state.savedSource = GENERIQUE;
    generateDynamicCodeForApi();
    expect(nomsDuCadre()).toEqual([]);
    expect(code()).not.toContain('dsfr.module.min.js');
    expect(code()).not.toContain('maj');
  });

  it('type sans cadre (podium) : rien n’est écrit, même cadre coché', () => {
    Object.assign(state, toutPoser(), { chartType: 'podium' as ChartType });
    generateChartFromLocalData();
    expect(code()).toContain('<dsfr-data-podium');
    expect(code()).not.toContain('databox');
    expect(code()).not.toContain('dsfr.module.min.js');
  });
});

describe('code généré : données locales intégrées, balise data-box nue', () => {
  beforeEach(reinitialiser);

  it('infobulle, fenêtre et actions sont des attributs de data-box', () => {
    Object.assign(state, toutPoser(), { databoxDateField: '' });
    generateChartFromLocalData();
    // Sans date lue dans les données, le type historique garde sa balise nue.
    expect(usesLibEmbedded()).toBe(false);
    expect(code()).toContain('<bar-chart');
    const box = attributs('data-box');
    expect(box.name).toBe('Budget par région');
    expect(box['tooltip-title']).toBe('Méthode');
    expect(box['tooltip-content']).toBe('Montants en euros courants. Hors investissement.');
    expect(box['modal-title']).toBe('En savoir plus');
    expect(box['modal-content']).toBe(
      '<p>Premier paragraphe.<br>Suite.</p><p>Second paragraphe.</p>'
    );
    expect(box).toHaveProperty('fullscreen');
    expect(JSON.parse(box.actions)).toEqual(['Voir la méthode', 'Signaler une erreur']);
    expect(code()).toContain('<!-- Actions du cadre :');
  });

  it('le cadre charge le JavaScript du DSFR, sans lequel son menu ne s’ouvre pas', () => {
    state.databoxEnabled = true;
    generateChartFromLocalData();
    expect(code()).toContain('dist/dsfr.module.min.js"></script>');
    // La balise n'est pas retirée par l'aperçu, qui n'écarte que les scripts « dsfr-data ».
    const script = [...page().querySelectorAll('script')].find((s) =>
      s.src.includes('dsfr.module.min.js')
    );
    expect(script?.getAttribute('type')).toBe('module');
    expect(script!.src).not.toMatch(/dsfr-data/i);
  });

  it('texte piégé : aucun attribut cassé, aucune balise injectée', () => {
    Object.assign(state, {
      databoxEnabled: true,
      databoxTitle: PIEGE,
      databoxTooltipTitle: PIEGE,
      databoxTooltipContent: `${PIEGE}\n${PIEGE}`,
      databoxModalTitle: PIEGE,
      databoxModalContent: PIEGE,
      databoxActions: [PIEGE, `L'action "deux"`],
    });
    generateChartFromLocalData();
    const doc = page();
    // La page ne contient aucun élément né de la saisie.
    expect(doc.querySelectorAll('img, b')).toHaveLength(0);
    expect(doc.querySelectorAll('data-box')).toHaveLength(1);
    expect(doc.querySelectorAll('bar-chart')).toHaveLength(1);
    const box = attributs('data-box');
    expect(box.name).toBe(PIEGE);
    expect(box['tooltip-title']).toBe(PIEGE);
    expect(box['tooltip-content']).toBe(`${PIEGE} ${PIEGE}`);
    expect(box['modal-title']).toBe(PIEGE);
    expect(JSON.parse(box.actions)).toEqual([PIEGE, `L'action "deux"`]);
    // Le contenu de la fenêtre arrive ÉCHAPPÉ : injecté par innerHTML, c'est du texte.
    const hote = document.createElement('div');
    hote.innerHTML = box['modal-content'];
    expect(hote.querySelectorAll('img, b')).toHaveLength(0);
    expect(hote.textContent).toBe(PIEGE);
  });
});

describe('code généré : données intégrées, date lue dans les données', () => {
  beforeEach(reinitialiser);

  it('le graphique passe par la bibliothèque, et chaque ligne porte la date la plus récente de son groupe', () => {
    Object.assign(state, toutPoser());
    generateChartFromLocalData();
    expect(usesLibEmbedded()).toBe(true);
    expect(code()).not.toContain('<bar-chart');
    expect(state.data).toEqual([
      { value: 150, region: 'Bretagne', maj__max: '2025-06-15T10:00:00' },
      { value: 80, region: 'Normandie', maj__max: '2023-01-20' },
      // Aucune date ISO dans le groupe : pas de colonne.
      { value: 20, region: 'Corse' },
    ]);
    const lignes = JSON.parse(attributs('dsfr-data-source').data) as Record<string, unknown>[];
    expect(lignes[0]).toMatchObject({ region: 'Bretagne', maj__max: '2025-06-15T10:00:00' });
    const chart = attributs('dsfr-data-chart');
    expect(chart['databox-date-field']).toBe('maj__max');
    expect(chart).not.toHaveProperty('databox-date');
    expect(code()).toContain('dist/dsfr.module.min.js"></script>');
  });

  it('une date saisie prime : balise nue, aucune colonne ajoutée', () => {
    Object.assign(state, toutPoser(), { databoxDate: 'Mars 2024' });
    generateChartFromLocalData();
    expect(usesLibEmbedded()).toBe(false);
    expect(attributs('data-box').date).toBe('Mars 2024');
    expect(state.data[0]).not.toHaveProperty('maj__max');
  });

  it('carte : la date du groupe géographique traverse aussi', () => {
    Object.assign(state, toutPoser(), {
      chartType: 'map' as ChartType,
      codeField: 'dep',
      labelField: '',
      localData: [
        { dep: '75', budget: 1, maj: '2024-01-01' },
        { dep: '75', budget: 2, maj: '2024-02-01' },
        { dep: '13', budget: 5, maj: '2023-05-05' },
      ],
    });
    generateChartFromLocalData();
    expect(state.data).toEqual([
      // Les groupes sortent dans l'ordre des clés d'objet : numériques d'abord, croissantes.
      { value: 5, dep: '13', maj__max: '2023-05-05' },
      { value: 3, dep: '75', maj__max: '2024-02-01' },
    ]);
    expect(attributs('dsfr-data-chart')['databox-date-field']).toBe('maj__max');
  });
});

describe('code généré : API intégrée (OpenDataSoft)', () => {
  beforeEach(reinitialiser);

  it('le cadre est écrit : ce chemin l’ignorait, coché ou non', () => {
    // Sans date lue dans les données : seul le cadre fait passer par la bibliothèque.
    Object.assign(state, toutPoser(), {
      databoxDateField: '',
      savedSource: ODS,
      apiUrl: ODS.apiUrl,
      localData: null,
      data: [{ region: 'Bretagne', value: 150 }],
    });
    expect(usesLibEmbedded()).toBe(false);
    generateCode(`${ODS.apiUrl}?select=region`);
    const chart = attributs('dsfr-data-chart');
    expect(chart).toHaveProperty('databox');
    expect(chart['databox-title']).toBe('Budget par région');
    expect(chart['databox-modal-title']).toBe('En savoir plus');
    expect(chart).not.toHaveProperty('databox-date-field');
    expect(code()).not.toContain('fetchAllODS');
  });

  it('date lue dans les données : la colonne chargée pour l’aperçu est lue par le graphique', () => {
    Object.assign(state, toutPoser(), {
      savedSource: ODS,
      apiUrl: ODS.apiUrl,
      localData: null,
      data: [{ region: 'Bretagne', value: 150, maj__max: '2025-06-15T10:00:00+00:00' }],
    });
    generateCode(`${ODS.apiUrl}?select=region`);
    expect(attributs('dsfr-data-chart')['databox-date-field']).toBe('maj__max');
    const lignes = JSON.parse(attributs('dsfr-data-source').data) as Record<string, unknown>[];
    expect(lignes[0].maj__max).toBe('2025-06-15T10:00:00+00:00');
  });

  it('sans cadre : le code d’avant, script de chargement compris', () => {
    Object.assign(state, {
      savedSource: ODS,
      apiUrl: ODS.apiUrl,
      localData: null,
      data: [{ region: 'Bretagne', value: 150 }],
    });
    generateCode(`${ODS.apiUrl}?select=region`);
    expect(code()).toContain('fetchAllODS');
    expect(code()).not.toContain('databox');
    expect(code()).not.toContain('dsfr.module.min.js');
  });
});

describe('code généré : chargement dynamique, la date traverse l’agrégation', () => {
  beforeEach(() => {
    reinitialiser();
    Object.assign(state, toutPoser(), { generationMode: 'dynamic' });
  });

  it('Grist : champ préfixé `fields.`, agrégé par max', () => {
    state.savedSource = GRIST;
    generateDynamicCode();
    expect(attributs('dsfr-data-query').aggregate).toBe('fields.budget:sum, fields.maj:max');
    const chart = attributs('dsfr-data-chart');
    expect(chart['databox-date-field']).toBe('fields.maj__max');
    expect(chart['value-field']).toBe('fields.budget__sum');
    for (const n of ATTRIBUTS) expect(chart, n).toHaveProperty(n);
    expect(code()).toContain('dist/dsfr.module.min.js"></script>');
  });

  it('OpenDataSoft : max(champ) dans le select, sous un alias', () => {
    state.savedSource = ODS;
    generateDynamicCodeForApi();
    expect(attributs('dsfr-data-source').select).toBe(
      'region, sum(budget) as budget__sum, max(maj) as maj__max'
    );
    const chart = attributs('dsfr-data-chart');
    expect(chart['databox-date-field']).toBe('maj__max');
    for (const n of ATTRIBUTS) expect(chart, n).toHaveProperty(n);
  });

  it('Tabular : champ:max dans l’agrégation déléguée', () => {
    state.savedSource = TABULAR;
    generateDynamicCodeForApi();
    expect(attributs('dsfr-data-query').aggregate).toBe('budget:sum, maj:max');
    expect(attributs('dsfr-data-chart')['databox-date-field']).toBe('maj__max');
  });

  it('API générique : champ:max dans l’agrégation', () => {
    state.savedSource = GENERIQUE;
    generateDynamicCodeForApi();
    expect(attributs('dsfr-data-query').aggregate).toBe('budget:sum, maj:max');
    const chart = attributs('dsfr-data-chart');
    expect(chart['databox-date-field']).toBe('maj__max');
    expect(chart['databox-tooltip-content']).toBe(
      'Montants en euros courants. Hors investissement.'
    );
    expect(chart['databox-modal-content']).toBe(
      '<p>Premier paragraphe.<br>Suite.</p><p>Second paragraphe.</p>'
    );
    expect(JSON.parse(chart['databox-actions'])).toEqual([
      'Voir la méthode',
      'Signaler une erreur',
    ]);
    expect(chart).toHaveProperty('databox-fullscreen');
  });

  it('requête avancée : la date s’ajoute aux agrégats saisis, sans être tracée', () => {
    Object.assign(state, {
      savedSource: GENERIQUE,
      advancedMode: true,
      queryAggregate: 'budget:sum, budget:avg',
    });
    generateDynamicCodeForApi();
    expect(attributs('dsfr-data-query').aggregate).toBe('budget:sum, budget:avg, maj:max');
    const chart = attributs('dsfr-data-chart');
    expect(chart['value-fields']).toBe('budget__avg');
    expect(chart['databox-date-field']).toBe('maj__max');
  });

  it('une date saisie prime : la requête n’est pas touchée', () => {
    state.savedSource = GENERIQUE;
    state.databoxDate = 'Mars 2024';
    generateDynamicCodeForApi();
    expect(attributs('dsfr-data-query').aggregate).toBe('budget:sum');
    const chart = attributs('dsfr-data-chart');
    expect(chart['databox-date']).toBe('Mars 2024');
    expect(chart).not.toHaveProperty('databox-date-field');
  });

  it('nettoyage après agrégation (OpenDataSoft) : la colonne suit le renommage', () => {
    state.savedSource = ODS;
    state.normalizeConfig = { ...state.normalizeConfig, enabled: true, lowercaseKeys: true };
    state.databoxDateField = 'maj';
    state.fields = [...CHAMPS];
    generateDynamicCodeForApi();
    expect(attributs('dsfr-data-chart')['databox-date-field']).toBe('maj__max');
    expect(attributs('dsfr-data-chart').source).not.toBe('query-data');
  });

  it('texte piégé : la balise dsfr-data-chart reste entière, dans les quatre chemins', () => {
    Object.assign(state, {
      databoxTitle: PIEGE,
      databoxSource: PIEGE,
      databoxTooltipTitle: PIEGE,
      databoxTooltipContent: PIEGE,
      databoxModalTitle: PIEGE,
      databoxModalContent: `${PIEGE}\n\n${PIEGE}`,
      databoxActions: [PIEGE],
    });
    const chemins: [string, typeof GRIST | typeof ODS, () => void][] = [
      ['Grist', GRIST, generateDynamicCode],
      ['OpenDataSoft', ODS, generateDynamicCodeForApi],
      ['Tabular', TABULAR, generateDynamicCodeForApi],
      ['générique', GENERIQUE, generateDynamicCodeForApi],
    ];
    for (const [nom, source, generer] of chemins) {
      state.savedSource = source;
      generer();
      const doc = page();
      expect(doc.querySelectorAll('img, b'), nom).toHaveLength(0);
      expect(doc.querySelectorAll('dsfr-data-chart'), nom).toHaveLength(1);
      const chart = attributs('dsfr-data-chart');
      expect(chart['databox-title'], nom).toBe(PIEGE);
      expect(chart['databox-source'], nom).toBe(PIEGE);
      expect(chart['databox-tooltip-title'], nom).toBe(PIEGE);
      expect(chart['databox-tooltip-content'], nom).toBe(PIEGE);
      expect(chart['databox-modal-title'], nom).toBe(PIEGE);
      expect(JSON.parse(chart['databox-actions']), nom).toEqual([PIEGE]);
      const hote = document.createElement('div');
      hote.innerHTML = chart['databox-modal-content'];
      expect(hote.querySelectorAll('img, b'), nom).toHaveLength(0);
      expect(hote.querySelectorAll('p'), nom).toHaveLength(2);
      expect(hote.textContent, nom).toBe(PIEGE + PIEGE);
      // Le dernier attribut du graphique est toujours lu : rien n'a été avalé.
      expect(chart.id, nom).toBe('chart');
      expect(chart['selected-palette'], nom).toBe('default');
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Instantané des favoris et formulaire
// ---------------------------------------------------------------------------

describe('instantané des favoris', () => {
  beforeEach(reinitialiser);

  it('porte tout le cadre : un favori rouvert ne le perd plus', () => {
    Object.assign(state, toutPoser());
    const instantane = JSON.parse(JSON.stringify(getBuilderStateToSave())) as Record<
      string,
      unknown
    >;
    for (const cle of CADRE_KEYS) expect(instantane, cle).toHaveProperty(cle);
    expect(normalizeCadre(instantane)).toEqual(toutPoser());
  });

  it('porte toutes les séries supplémentaires, avec leurs libellés', () => {
    state.extraSeries = [
      { field: 'taux', label: 'Taux' },
      { field: 'effectif', label: 'Effectif' },
    ];
    state.valueField2 = 'taux';
    const instantane = JSON.parse(JSON.stringify(getBuilderStateToSave())) as Record<
      string,
      unknown
    >;
    expect(instantane.extraSeries).toEqual(state.extraSeries);
    // `valueField2` reste écrit, pour qui ne lit que lui.
    expect(instantane.valueField2).toBe('taux');
    // L'instantané est une copie : il ne suit pas l'état.
    state.extraSeries[0].label = 'Modifié';
    expect((getBuilderStateToSave().extraSeries as { label: string }[])[0].label).toBe('Modifié');
    expect((instantane.extraSeries as { label: string }[])[0].label).toBe('Taux');
  });

  it('aller-retour : le favori d’après régénère le même code', () => {
    Object.assign(state, toutPoser(), { generationMode: 'dynamic', savedSource: GENERIQUE });
    generateDynamicCodeForApi();
    const avant = code();
    const instantane = JSON.parse(JSON.stringify(getBuilderStateToSave())) as Record<
      string,
      unknown
    >;
    // Une autre session, d'autres réglages…
    Object.assign(state, cadreDefaults(), { databoxEnabled: true, databoxTitle: 'Autre' });
    // … puis le favori est rouvert.
    restoreCadre(instantane);
    generateDynamicCodeForApi();
    expect(code()).toBe(avant);
  });

  it('favori d’avant #1263 : rouvert sans cadre, même après une session qui en portait un', () => {
    state.generationMode = 'dynamic';
    state.savedSource = GENERIQUE;
    generateDynamicCodeForApi();
    const sansCadre = code();
    // Un instantané d'avant ce lot : aucune clé du cadre.
    const ancien = JSON.parse(JSON.stringify(getBuilderStateToSave())) as Record<string, unknown>;
    for (const cle of CADRE_KEYS) delete ancien[cle];
    Object.assign(state, toutPoser());
    restoreCadre(ancien);
    for (const cle of CADRE_KEYS) expect(state[cle], cle).toEqual(cadreDefaults()[cle]);
    generateDynamicCodeForApi();
    expect(code()).toBe(sansCadre);
  });
});

describe('formulaire : la section « Cadre officiel DSFR »', () => {
  function monterLeFormulaire(): void {
    const html = readFileSync(join(RACINE, 'apps/builder/index.html'), 'utf8');
    const corps = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)![1];
    document.body.innerHTML = corps.replace(/<script\b[\s\S]*?<\/script>/g, '');
  }
  const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const visible = (id: string): boolean => el(id).style.display !== 'none';

  beforeEach(() => {
    reinitialiser();
    monterLeFormulaire();
    setupCadreListeners();
  });

  it('chaque attribut du lot a son contrôle, dans la section existante', () => {
    const section = el('section-databox');
    for (const n of ATTRIBUTS) {
      expect(section.querySelector(`[data-attribut~="dsfr-data-chart:${n}"]`), n).not.toBeNull();
    }
    // La case « Plein écran », sans effet, a laissé la place au titre de la fenêtre.
    expect(document.getElementById('databox-fullscreen')).toBeNull();
  });

  it('cadre désactivé : aucun réglage visible ; activé : l’essentiel, le reste replié', () => {
    expect(visible('databox-options')).toBe(false);
    for (const id of ['databox-date-field', 'databox-tooltip-title', 'databox-modal-content']) {
      expect(el('databox-options').contains(el(id)), id).toBe(true);
    }
    const activer = el<HTMLInputElement>('databox-toggle');
    activer.checked = true;
    activer.dispatchEvent(new Event('change'));
    expect(state.databoxEnabled).toBe(true);
    expect(visible('databox-options')).toBe(true);
    expect(el<HTMLDetailsElement>('databox-info-details').open).toBe(false);
    expect(el<HTMLDetailsElement>('databox-actions-details').open).toBe(false);
    // L'essentiel est hors des divulgations.
    for (const id of ['databox-title', 'databox-source', 'databox-date', 'databox-date-field']) {
      expect(el(id).closest('details'), id).toBeNull();
    }
  });

  it('la section suit le type : masquée pour un KPI, un tableau, un podium', () => {
    for (const type of ['kpi', 'gauge', 'datalist', 'podium'] as ChartType[]) {
      updateCadreVisibility(type);
      expect(visible('section-databox'), type).toBe(false);
    }
    for (const type of ['bar', 'line', 'map', 'bar-line'] as ChartType[]) {
      updateCadreVisibility(type);
      expect(visible('section-databox'), type).toBe(true);
    }
  });

  it('la saisie met l’état à jour', () => {
    const saisir = (id: string, valeur: string): void => {
      const input = el<HTMLInputElement>(id);
      input.value = valeur;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    saisir('databox-tooltip-title', 'Méthode');
    saisir('databox-tooltip-content', 'Précision');
    saisir('databox-modal-title', 'En savoir plus');
    saisir('databox-modal-content', 'Un\n\nDeux');
    expect(state).toMatchObject({
      databoxTooltipTitle: 'Méthode',
      databoxTooltipContent: 'Précision',
      databoxModalTitle: 'En savoir plus',
      databoxModalContent: 'Un\n\nDeux',
    });
  });

  it('date lue dans les données : la liste est remplie depuis les champs de la source', () => {
    const select = el<HTMLSelectElement>('databox-date-field');
    expect([...select.options].map((o) => o.value)).toEqual(['', 'region', 'budget', 'maj']);
    select.value = 'maj';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(state.databoxDateField).toBe('maj');
    expect(fieldHasIsoDates('maj')).toBe(true);
    expect(el('databox-date-field-note').hidden).toBe(true);
    // Un champ sans date ISO : la note le dit, au lieu d'un cadre sans date muet.
    select.value = 'region';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(el('databox-date-field-note').hidden).toBe(false);
    expect(el('databox-date-field-note').textContent).toContain('AAAA-MM-JJ');
    // Une date saisie prime : la note le dit aussi.
    select.value = 'maj';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const date = el<HTMLInputElement>('databox-date');
    date.value = 'Mars 2024';
    date.dispatchEvent(new Event('input', { bubbles: true }));
    expect(el('databox-date-field-note').textContent).toContain('date saisie');
  });

  it('changement de source : la liste suit, un champ devenu étranger est oublié', () => {
    state.databoxDateField = 'maj';
    populateDateFieldSelect();
    expect(el<HTMLSelectElement>('databox-date-field').value).toBe('maj');
    state.fields = [{ name: 'annee', type: 'string', sample: '2024' }];
    document.dispatchEvent(new CustomEvent('builder:fields-updated'));
    expect(state.databoxDateField).toBe('');
    expect([...el<HTMLSelectElement>('databox-date-field').options].map((o) => o.value)).toEqual([
      '',
      'annee',
    ]);
  });

  it('actions : ajouter, saisir, supprimer', () => {
    el('add-databox-action-btn').click();
    el('add-databox-action-btn').click();
    expect(state.databoxActions).toEqual(['', '']);
    const champ = el<HTMLInputElement>('databox-action-1');
    champ.value = 'Voir la méthode';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    expect(state.databoxActions).toEqual(['', 'Voir la méthode']);
    document
      .querySelector<HTMLElement>('#databox-actions-container [data-action="remove"]')!
      .click();
    expect(state.databoxActions).toEqual(['Voir la méthode']);
    expect(el<HTMLInputElement>('databox-action-0').value).toBe('Voir la méthode');
  });

  it('un état rouvert remplit les contrôles et déplie ce qui porte un réglage', () => {
    Object.assign(state, toutPoser(), { databoxActions: [`L'action "piégée" <b>`] });
    syncCadreControls();
    expect(el<HTMLInputElement>('databox-toggle').checked).toBe(true);
    expect(visible('databox-options')).toBe(true);
    expect(el<HTMLInputElement>('databox-title').value).toBe('Budget par région');
    expect(el<HTMLSelectElement>('databox-date-field').value).toBe('maj');
    expect(el<HTMLTextAreaElement>('databox-modal-content').value).toBe(
      'Premier paragraphe.\nSuite.\n\nSecond paragraphe.'
    );
    expect(el<HTMLInputElement>('databox-screenshot').checked).toBe(true);
    expect(el<HTMLDetailsElement>('databox-info-details').open).toBe(true);
    expect(el<HTMLDetailsElement>('databox-actions-details').open).toBe(true);
    // Le libellé d'une action est rendu dans un attribut : il y arrive intact.
    expect(el<HTMLInputElement>('databox-action-0').value).toBe(`L'action "piégée" <b>`);
    expect(document.querySelectorAll('#databox-actions-container b')).toHaveLength(0);
  });
});

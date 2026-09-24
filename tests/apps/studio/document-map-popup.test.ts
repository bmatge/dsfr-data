/**
 * Carte du Studio (#1109) : affichage du clic (dsfr-data-map-popup en volet /
 * modale), gabarit de popup, regroupement — validation des appels, export
 * HTML, et conservation par le Tableau de bord (meme modele).
 */
import { describe, it, expect } from 'vitest';
import {
  createEmptyDashboard,
  generateDashboardHTML,
  normalizeDashboard,
  type DashboardData,
} from '@dsfr-data/shared';
import {
  addBlocks,
  updateBlock,
  type BlockSpec,
  type DocumentContext,
} from '../../../apps/studio/src/document';

const ctx: DocumentContext = {
  data: [{ Ville: 'Lille', lat: 50.63, lon: 3.06, Action: 'Aide A', Total: 4 }],
  fields: [
    { name: 'Ville', type: 'texte', sample: 'Lille' },
    { name: 'lat', type: 'numérique', sample: 50.63 },
    { name: 'lon', type: 'numérique', sample: 3.06 },
    { name: 'Action', type: 'texte', sample: 'Aide A' },
    { name: 'Total', type: 'numérique', sample: 4 },
  ],
  sourceId: 'src-1',
};

function docAvec(specs: BlockSpec[]): { doc: DashboardData; summary: string; ok: boolean } {
  const doc = createEmptyDashboard();
  doc.sources = [{ id: 'src-1', name: 'Aides', type: 'manual', data: ctx.data }];
  const { ok, summary } = addBlocks(doc, specs, ctx);
  return { doc, ok, summary };
}

const MARQUEURS = { type: 'marker' as const, latField: 'lat', lonField: 'lon' };

/** La carte exportee, relue comme un DOM. */
function carteExportee(doc: DashboardData): Element {
  // Le fragment de la carte seulement : la page entiere porte des feuilles
  // CDN que l'environnement de test tenterait de charger.
  const html = generateDashboardHTML(doc);
  const debut = html.indexOf('<dsfr-data-map ');
  const fin = html.indexOf('</dsfr-data-map>') + '</dsfr-data-map>'.length;
  const hote = document.createElement('div');
  hote.innerHTML = html.slice(debut, fin);
  const map = hote.querySelector('dsfr-data-map');
  if (!map) throw new Error('dsfr-data-map absent de l’export');
  return map;
}

describe('#1109 — volet de carte (dsfr-data-map-popup)', () => {
  it('popupMode panel-right : un compagnon RELIE a la couche par for, enfant direct de la carte', () => {
    const { doc, ok } = docAvec([
      {
        kind: 'map',
        layers: [
          {
            ...MARQUEURS,
            popupMode: 'panel-right',
            popupTitleField: 'Ville',
            popupFields: 'Action, Total',
          },
        ],
      },
    ]);
    expect(ok).toBe(true);
    const html = generateDashboardHTML(doc);
    expect(html).toContain(
      '<dsfr-data-map-popup mode="panel-right" for="layer-b1-1" title-field="Ville">'
    );

    const map = carteExportee(doc);
    const couche = map.querySelector(':scope > dsfr-data-map-layer');
    const volet = map.querySelector(':scope > dsfr-data-map-popup');
    // La liaison reelle : la couche cherche `:scope > dsfr-data-map-popup`
    // dont `for` vaut son id (DsfrDataMapLayer._findPopupCompanion).
    expect(couche?.id).toBe('layer-b1-1');
    expect(volet?.getAttribute('for')).toBe(couche?.id);
    // Le contenu choisi passe dans le gabarit du compagnon (qui ignore
    // popup-fields) ; la couche ne le porte plus en double.
    const gabarit = volet?.querySelector('template')?.innerHTML ?? '';
    expect(gabarit).toContain('{{Action}}');
    expect(gabarit).toContain('{{Total}}');
    expect(couche?.hasAttribute('popup-fields')).toBe(false);
  });

  it('popupTemplate : grammaire de la couche {champ} traduite en {{champ}} pour le compagnon', () => {
    const { doc } = docAvec([
      {
        kind: 'map',
        layers: [{ ...MARQUEURS, popupMode: 'modal', popupTemplate: '{Action} — {Total} actions' }],
      },
    ]);
    const volet = carteExportee(doc).querySelector('dsfr-data-map-popup');
    expect(volet?.getAttribute('mode')).toBe('modal');
    expect(volet?.querySelector('template')?.innerHTML).toBe('{{Action}} — {{Total}} actions');
  });

  it('mode popup (bulle) ou absent : pas de compagnon, popup-template porte par la couche', () => {
    const { doc } = docAvec([
      {
        kind: 'map',
        layers: [{ ...MARQUEURS, popupMode: 'popup', popupTemplate: '{Ville} : {Action}' }],
      },
    ]);
    const map = carteExportee(doc);
    expect(map.querySelector('dsfr-data-map-popup')).toBeNull();
    const couche = map.querySelector('dsfr-data-map-layer');
    expect(couche?.getAttribute('popup-template')).toBe('{Ville} : {Action}');
    // Sans compagnon, pas d'id ajoute : le code d'avant #1109 est inchange.
    expect(couche?.hasAttribute('id')).toBe(false);
  });

  it('refuse un mode inconnu, sans rien ajouter', () => {
    const { doc, ok, summary } = docAvec([
      { kind: 'map', layers: [{ ...MARQUEURS, popupMode: 'volet' as never }] },
    ]);
    expect(ok).toBe(false);
    expect(summary).toContain('popupMode "volet" inconnu');
    expect(doc.widgets).toHaveLength(0);
  });

  it('refuse un champ inexistant dans popupTitleField, popupFields ou le gabarit', () => {
    for (const couche of [
      { popupTitleField: 'Commune' },
      { popupFields: 'Action, Montant' },
      { popupTemplate: '{Montant} €' },
    ]) {
      const { ok, summary } = docAvec([{ kind: 'map', layers: [{ ...MARQUEURS, ...couche }] }]);
      expect(ok, JSON.stringify(couche)).toBe(false);
      expect(summary).toContain('inexistant');
    }
  });
});

describe('#1109 — un element par entite (groupField, #1108)', () => {
  it('groupField + volet panel-right : group-field emis et compagnon relie par for', () => {
    const { doc, ok } = docAvec([
      {
        kind: 'map',
        layers: [
          {
            ...MARQUEURS,
            groupField: 'Ville',
            popupMode: 'panel-right',
            popupTitleField: 'Ville',
            popupFields: 'Action',
          },
        ],
      },
    ]);
    expect(ok).toBe(true);
    const html = generateDashboardHTML(doc);
    expect(html).toContain('group-field="Ville"');
    expect(html).toContain('<dsfr-data-map-popup mode="panel-right" for="layer-b1-1"');
    const map = carteExportee(doc);
    const couche = map.querySelector(':scope > dsfr-data-map-layer');
    expect(couche?.getAttribute('group-field')).toBe('Ville');
    expect(map.querySelector(':scope > dsfr-data-map-popup')?.getAttribute('for')).toBe(couche?.id);
  });

  it('accepte circle et geoshape, refuse heatmap (la lib l’y ignore)', () => {
    expect(
      docAvec([
        {
          kind: 'map',
          layers: [{ type: 'circle', latField: 'lat', lonField: 'lon', groupField: 'Ville' }],
        },
      ]).ok
    ).toBe(true);
    expect(docAvec([{ kind: 'map', layers: [{ type: 'geoshape', groupField: 'Ville' }] }]).ok).toBe(
      true
    );
    const heat = docAvec([
      {
        kind: 'map',
        layers: [{ type: 'heatmap', latField: 'lat', lonField: 'lon', groupField: 'Ville' }],
      },
    ]);
    expect(heat.ok).toBe(false);
    expect(heat.summary).toContain('heatmap');
  });

  it('refuse un champ de regroupement absent des donnees', () => {
    const { ok, summary } = docAvec([
      { kind: 'map', layers: [{ ...MARQUEURS, groupField: 'Commune' }] },
    ]);
    expect(ok).toBe(false);
    expect(summary).toContain('Commune');
  });

  it('le Tableau de bord conserve groupField a la relecture', () => {
    const { doc } = docAvec([{ kind: 'map', layers: [{ ...MARQUEURS, groupField: 'Ville' }] }]);
    const relu = normalizeDashboard(JSON.parse(JSON.stringify(doc)) as DashboardData);
    expect(relu.widgets[0]).toEqual(doc.widgets[0]);
    expect(generateDashboardHTML(relu)).toContain('group-field="Ville"');
  });
});

describe('#1109 — gabarit filtre a l’export', () => {
  it('le gabarit ecrit par le modele est nettoye dans les deux voies (couche et compagnon)', () => {
    const piege = '<b>{Action}</b><img src=x onerror="alert(1)"><script>alert(2)</script>';
    const bulle = docAvec([{ kind: 'map', layers: [{ ...MARQUEURS, popupTemplate: piege }] }]);
    const couche = carteExportee(bulle.doc).querySelector('dsfr-data-map-layer');
    expect(couche?.getAttribute('popup-template')).toBe('<b>{Action}</b><img src=x>');

    const volet = docAvec([
      { kind: 'map', layers: [{ ...MARQUEURS, popupMode: 'modal', popupTemplate: piege }] },
    ]);
    const html = generateDashboardHTML(volet.doc);
    expect(html).toContain('<template><b>{{Action}}</b><img src=x></template>');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('alert(2)');
  });
});

describe('#1109 — regroupement (cluster)', () => {
  it('marker + cluster + clusterRadius : attributs emis', () => {
    const { doc } = docAvec([
      { kind: 'map', layers: [{ ...MARQUEURS, cluster: true, clusterRadius: 40 }] },
    ]);
    const couche = carteExportee(doc).querySelector('dsfr-data-map-layer');
    expect(couche?.hasAttribute('cluster')).toBe(true);
    expect(couche?.getAttribute('cluster-radius')).toBe('40');
  });

  it('refuse cluster hors couche marker (le regroupement ne vaut que pour les marqueurs)', () => {
    const { ok, summary } = docAvec([
      {
        kind: 'map',
        layers: [{ type: 'circle', latField: 'lat', lonField: 'lon', cluster: true }],
      },
    ]);
    expect(ok).toBe(false);
    expect(summary).toContain('marker');
  });

  it('update_block remplace les couches, avec la meme validation', () => {
    const { doc } = docAvec([{ kind: 'map', layers: [MARQUEURS] }]);
    const refus = updateBlock(
      doc,
      'b1',
      { kind: 'map', layers: [{ ...MARQUEURS, popupMode: 'bulle' as never }] },
      ctx
    );
    expect(refus.ok).toBe(false);
    const ok = updateBlock(
      doc,
      'b1',
      { kind: 'map', layers: [{ ...MARQUEURS, popupMode: 'panel-left', cluster: true }] },
      ctx
    );
    expect(ok.ok).toBe(true);
    expect(generateDashboardHTML(doc)).toContain('mode="panel-left"');
  });
});

describe('#1109 — le Tableau de bord conserve ces blocs', () => {
  it("normalizeDashboard (lecture a l'ouverture, avant enregistrement) ne perd rien", () => {
    const { doc } = docAvec([
      {
        kind: 'map',
        layers: [
          {
            ...MARQUEURS,
            popupMode: 'panel-right',
            popupTitleField: 'Ville',
            popupTemplate: '{Action}',
            cluster: true,
            clusterRadius: 60,
          },
        ],
      },
    ]);
    const relu = normalizeDashboard(JSON.parse(JSON.stringify(doc)) as DashboardData);
    expect(relu.widgets[0]).toEqual(doc.widgets[0]);
    expect(generateDashboardHTML(relu)).toBe(generateDashboardHTML(doc));
  });

  it('une valeur de mode corrompue en stockage est ecartee, le reste garde', () => {
    const { doc } = docAvec([{ kind: 'map', layers: [MARQUEURS] }]);
    const brut = JSON.parse(JSON.stringify(doc)) as DashboardData;
    const w = brut.widgets[0];
    if (w.type !== 'map') throw new Error('map attendu');
    Object.assign(w.config.layers[0], { popupMode: 'volet', cluster: 'oui' });
    const relu = normalizeDashboard(brut).widgets[0];
    if (relu.type !== 'map') throw new Error('map attendu');
    expect(relu.config.layers[0].popupMode).toBeUndefined();
    expect(relu.config.layers[0].cluster).toBeUndefined();
    expect(relu.config.layers[0].latField).toBe('lat');
  });
});

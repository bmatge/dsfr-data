import { describe, it, expect } from 'vitest';
import { CDN_URLS, LIB_URL } from '@dsfr-data/shared';
import {
  aDesDependances,
  ajouterDependances,
  blocDependances,
  retirerDependances,
  utiliseCarte,
  utiliseGraphique,
} from '../../../apps/playground/src/deps';

const CORE = `<script src="${LIB_URL}/dsfr-data.core.umd.js"></script>`;
const MAP = `<script src="${LIB_URL}/dsfr-data.map.umd.js"></script>`;

const GRAPHIQUE = `<dsfr-data-source id="src" url="https://exemple.fr/data.json"></dsfr-data-source>
<dsfr-data-chart source="src" type="bar" label-field="a" value-field="b"></dsfr-data-chart>`;

const CARTE = `<dsfr-data-source id="pts" url="https://exemple.fr/points.json"></dsfr-data-source>
<dsfr-data-map center="46.6,2.5" zoom="6">
  <dsfr-data-map-layer source="pts" type="marker" lat-field="lat" lon-field="lon"></dsfr-data-map-layer>
</dsfr-data-map>`;

/** En-tete du Builder Carto (#1084) : DSFR + utilitaire + core + map, UMD. */
const EN_TETE_CARTO = `<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
${CORE}
${MAP}

`;

describe('playground : bloc de dependances selon le code (#1085)', () => {
  it('cas graphique : DSFR Chart + core, sans bundle carte', () => {
    const bloc = blocDependances(GRAPHIQUE);
    expect(utiliseGraphique(GRAPHIQUE)).toBe(true);
    expect(utiliseCarte(GRAPHIQUE)).toBe(false);
    expect(bloc).toContain(CDN_URLS.dsfrCss);
    expect(bloc).toContain(CDN_URLS.dsfrUtilityCss);
    expect(bloc).toContain(CDN_URLS.dsfrChartCss);
    expect(bloc).toContain(CDN_URLS.dsfrChartJs);
    expect(bloc).toContain(CORE);
    expect(bloc).not.toContain('dsfr-data.map.umd.js');
  });

  it('cas carte : le bundle map est reinjecte, sans DSFR Chart', () => {
    const bloc = blocDependances(CARTE);
    expect(bloc).toContain(CORE);
    expect(bloc).toContain(MAP);
    // core AVANT map : les UMD s'executent dans l'ordre du document.
    expect(bloc.indexOf(CORE)).toBeLessThan(bloc.indexOf(MAP));
    expect(bloc).not.toContain(CDN_URLS.dsfrChartJs);
    expect(bloc).not.toContain(CDN_URLS.dsfrChartCss);
  });

  it('cas mixte : DSFR Chart ET bundle carte', () => {
    const code = `${GRAPHIQUE}\n${CARTE}`;
    const bloc = blocDependances(code);
    expect(bloc).toContain(CDN_URLS.dsfrChartJs);
    expect(bloc).toContain(CORE);
    expect(bloc).toContain(MAP);
  });

  it('une carte du Builder Carto garde map.umd apres Retirer puis Ajouter', () => {
    const exporte = EN_TETE_CARTO + CARTE;
    expect(aDesDependances(exporte)).toBe(true);

    const nu = retirerDependances(exporte);
    expect(nu).not.toContain('dsfr-data.map.umd.js');
    expect(nu).not.toContain('dsfr-data.core.umd.js');
    // La feuille Leaflet n'est pas une dependance du motif : elle reste.
    expect(nu).toContain('leaflet.css');
    expect(aDesDependances(nu)).toBe(false);

    const rajoute = ajouterDependances(nu);
    expect(rajoute).toContain(MAP);
    expect(rajoute).toContain(CORE);
    expect(rajoute).toContain('leaflet.css');
    expect(rajoute).toContain('<dsfr-data-map center');
  });

  it('ajouter sur un code qui porte deja des dependances ne les double pas', () => {
    const code = ajouterDependances(ajouterDependances(CARTE));
    expect(code.split('dsfr-data.map.umd.js').length - 1).toBe(1);
    expect(code.split('dsfr-data.core.umd.js').length - 1).toBe(1);
  });

  it('detection stable sur appels repetes (pas d’etat de regex /g)', () => {
    const code = blocDependances(GRAPHIQUE) + GRAPHIQUE;
    expect(aDesDependances(code)).toBe(true);
    expect(aDesDependances(code)).toBe(true);
  });

  it('retire aussi le Chart.js des snippets anterieurs a #656', () => {
    const ancien = `<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>\n${GRAPHIQUE}`;
    expect(retirerDependances(ancien)).toBe(GRAPHIQUE);
  });
});

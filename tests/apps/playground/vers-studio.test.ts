/**
 * « Envoyer au Studio IA » (#1132), côté Playground :
 *
 * - la source déclarée par le code est réduite à une adresse PUBLIQUE, que
 *   reconnaît `reconnaitreUrlSource` (le chemin de `charger_source_url`) ;
 * - une source à clé n'est jamais transmise, ni son en-tête ni son jeton ;
 * - la passation est LA voie de « Construire pour moi » : code, source et
 *   diagnostic déposés, puis le Studio avec `?from=playground`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIAGNOSTIC_HANDOFF_KEY,
  LONGUEUR_MAX_CODE_PASSATION,
  PASSATION_STUDIO_KEY,
  recupererPassationStudio,
} from '@dsfr-data/shared';
import {
  construirePassation,
  extraireSourceDuCode,
} from '../../../apps/playground/src/vers-studio';
import {
  construireDansLeStudio,
  ENTETE_PASSATION_STUDIO,
  envoyerAuStudio,
} from '../../../apps/playground/src/assistant/index';

const ODS = `<dsfr-data-source id="data" api-type="opendatasoft"
    dataset-id="industrie-du-futur"
    base-url="https://data.economie.gouv.fr"
    where="annee:eq:2023">
  </dsfr-data-source>
  <dsfr-data-query id="q" source="data" group-by="region" aggregate="nombre:sum"></dsfr-data-query>
  <dsfr-data-chart source="q" type="bar" label-field="region" value-field="nombre__sum"></dsfr-data-chart>
  <dsfr-data-pivot source="data" rows="region" columns="annee" values="nombre"></dsfr-data-pivot>`;

function source(code: string) {
  return extraireSourceDuCode(code).source;
}

describe('extraireSourceDuCode : l’adresse publique de la source', () => {
  it('Opendatasoft : l’URL d’API du jeu, sur l’origine de base-url', () => {
    expect(source(ODS)).toEqual({
      transmise: true,
      url: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/industrie-du-futur/records',
    });
  });

  it('Tabular : la ressource sur l’API tabulaire', () => {
    const code = `<dsfr-data-source api-type="tabular" resource="2876a346-d50c-4911-934e-19ee07b0e503"></dsfr-data-source>`;
    expect(source(code)).toEqual({
      transmise: true,
      url: 'https://tabular-api.data.gouv.fr/api/resources/2876a346-d50c-4911-934e-19ee07b0e503/data/',
    });
  });

  it('INSEE Melodi : le jeu sous la base', () => {
    const code = `<dsfr-data-source api-type="insee" base-url="https://api.insee.fr/melodi" dataset-id="DS_POPULATIONS_REFERENCE"></dsfr-data-source>`;
    expect(source(code)).toEqual({
      transmise: true,
      url: 'https://api.insee.fr/melodi/data/DS_POPULATIONS_REFERENCE',
    });
  });

  it('Grist : l’URL des enregistrements portée par base-url', () => {
    const url =
      'https://grist.numerique.gouv.fr/api/docs/jGd2ge4dy2ZM/tables/Plan_Elec_Indic_dyanmiques/records';
    const code = `<dsfr-data-source api-type="grist" base-url="${url}"></dsfr-data-source>`;
    expect(source(code)).toEqual({ transmise: true, url });
  });

  it('mode URL : l’adresse reconnue telle quelle', () => {
    const url =
      'https://tabular-api.data.gouv.fr/api/resources/42a34c0a-7c97-4463-b00e-5913ea5f7077/data/?page_size=101';
    expect(source(`<dsfr-data-source url="${url}"></dsfr-data-source>`)).toEqual({
      transmise: true,
      url,
    });
  });

  it('une clé (en-têtes, api-key-ref, paramètre secret, identifiant) : non transmise', () => {
    const cas = [
      `<dsfr-data-source api-type="opendatasoft" base-url="https://data.economie.gouv.fr" dataset-id="x" headers='{"Authorization":"Apikey SECRET"}'></dsfr-data-source>`,
      `<dsfr-data-source api-type="grist" base-url="https://grist.numerique.gouv.fr/api/docs/abc/tables/T/records" api-key-ref="grist"></dsfr-data-source>`,
      `<dsfr-data-source url="https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/x/records?apikey=SECRET"></dsfr-data-source>`,
      `<dsfr-data-source url="https://moi:mdp@data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/x/records"></dsfr-data-source>`,
    ];
    for (const code of cas) {
      expect(source(code), code).toEqual({ transmise: false, raison: 'cle' });
      expect(JSON.stringify(construirePassation(code))).not.toContain('"url"');
    }
  });

  it('données embarquées, adresse inconnue ou non https, aucune source', () => {
    expect(source(`<dsfr-data-source data='[{"a":1}]'></dsfr-data-source>`)).toEqual({
      transmise: false,
      raison: 'embarquee',
    });
    expect(
      source(`<dsfr-data-source url="https://example.org/data.json"></dsfr-data-source>`)
    ).toEqual({ transmise: false, raison: 'non-reconnue' });
    expect(
      source(
        `<dsfr-data-source url="http://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/x/records"></dsfr-data-source>`
      )
    ).toEqual({ transmise: false, raison: 'non-reconnue' });
    expect(extraireSourceDuCode('<dsfr-data-chart type="bar"></dsfr-data-chart>')).toEqual({
      source: { transmise: false, raison: 'absente' },
      sources: 0,
    });
  });

  it('plusieurs sources : la première transmissible, et le compte', () => {
    const code = `<dsfr-data-source id="a" data='[{"a":1}]'></dsfr-data-source>${ODS}`;
    const { source: s, sources } = extraireSourceDuCode(code);
    expect(sources).toBe(2);
    expect(s.transmise).toBe(true);
  });

  it('le code n’est pas exécuté par l’analyse', () => {
    const espion = vi.fn();
    (globalThis as { __execute?: () => void }).__execute = espion;
    extraireSourceDuCode(
      `<script>globalThis.__execute()</script><img src=x onerror="globalThis.__execute()">${ODS}`
    );
    expect(espion).not.toHaveBeenCalled();
  });
});

describe('construirePassation', () => {
  it('code, source et compte ; rien pour un code vide ou trop long', () => {
    expect(construirePassation(ODS)).toEqual({
      origine: 'playground',
      code: ODS,
      sources: 1,
      source: {
        url: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/industrie-du-futur/records',
      },
    });
    expect(construirePassation('   ')).toBeNull();
    expect(construirePassation('x'.repeat(LONGUEUR_MAX_CODE_PASSATION + 1))).toBeNull();
  });
});

describe('passation vers le Studio : une seule voie', () => {
  beforeEach(() => sessionStorage.clear());

  it('« Envoyer au Studio IA » dépose code + source + diagnostic et ouvre le Studio', () => {
    const cibles: string[] = [];
    expect(envoyerAuStudio(ODS, 'data → 12 lignes', (href) => cibles.push(href))).toBe(true);
    expect(cibles).toHaveLength(1);
    expect(cibles[0]).toMatch(/studio\/index\.html\?from=playground$/);
    expect(sessionStorage.getItem(DIAGNOSTIC_HANDOFF_KEY)).toBe(
      `${ENTETE_PASSATION_STUDIO}\n\ndata → 12 lignes`
    );
    const passation = recupererPassationStudio();
    expect(passation?.code).toBe(ODS);
    expect(passation?.source?.url).toContain('/datasets/industrie-du-futur/records');
  });

  it('code vide : on reste dans le Playground, rien n’est déposé', () => {
    const naviguer = vi.fn();
    expect(envoyerAuStudio('  ', 'diag', naviguer)).toBe(false);
    expect(naviguer).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PASSATION_STUDIO_KEY)).toBeNull();
    expect(sessionStorage.getItem(DIAGNOSTIC_HANDOFF_KEY)).toBeNull();
  });

  it('sans code (appel historique), seul le diagnostic part', () => {
    const naviguer = vi.fn();
    expect(construireDansLeStudio('diag', naviguer)).toBe(true);
    expect(naviguer).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(PASSATION_STUDIO_KEY)).toBeNull();
  });
});

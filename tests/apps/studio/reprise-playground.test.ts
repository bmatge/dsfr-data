/**
 * Reprise d'un code du Playground par le Studio IA (#1132) :
 *
 * - la source transmise est chargée par le chemin de `charger_source_url`,
 *   puis adoptée ; un refus, une clé, une source absente sont DITS à l'usager ;
 * - la consigne de reconstruction (blocs guidés, sinon composant libre), le
 *   code et le diagnostic sont posés dans le champ, jamais envoyés ;
 * - la passation lue dans la session est validée (entrée externe) ;
 * - le lien de retour rend au Playground le code d'origine.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PASSATION_STUDIO_KEY,
  recupererPassationStudio,
  transmettrePassationStudio,
  validerPassationStudio,
  type PassationStudio,
  type Source,
} from '@dsfr-data/shared';
import {
  CLE_RETOUR_PLAYGROUND,
  garderCodePourRetour,
  monterRetourPlayground,
  QUESTION_RECONSTRUIRE,
  reprendreCodePlayground,
  type DependancesReprise,
} from '../../../apps/studio/src/reprise-playground';
import type { ResultatChargement } from '../../../apps/studio/src/source-url';

const CODE = `<dsfr-data-source id="data" api-type="opendatasoft" base-url="https://data.economie.gouv.fr" dataset-id="industrie-du-futur"></dsfr-data-source>
<dsfr-data-pivot source="data" rows="region" columns="annee" values="nombre"></dsfr-data-pivot>`;

const URL_ODS =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/industrie-du-futur/records';

const SOURCE: Source = {
  id: 'url_opendatasoft_industrie-du-futur',
  name: 'industrie-du-futur',
  type: 'api',
  provider: 'opendatasoft',
  apiUrl: URL_ODS,
  data: [{ region: 'Bretagne', annee: '2023', nombre: 3 }],
  recordCount: 1,
};

interface Journal {
  deps: DependancesReprise;
  charger: ReturnType<typeof vi.fn>;
  adoptees: Source[];
  annonces: string[];
  poses: string[];
}

function dependances(resultat: ResultatChargement, courante: string | null = null): Journal {
  const adoptees: Source[] = [];
  const annonces: string[] = [];
  const poses: string[] = [];
  const charger = vi.fn(async () => resultat);
  return {
    charger,
    adoptees,
    annonces,
    poses,
    deps: {
      charger,
      adopter: (s) => adoptees.push(s),
      sourceCourante: () => courante,
      annoncer: (t) => annonces.push(t),
      poser: (t) => poses.push(t),
    },
  };
}

const passation = (extra: Partial<PassationStudio> = {}): PassationStudio => ({
  origine: 'playground',
  code: CODE,
  sources: 1,
  source: { url: URL_ODS },
  ...extra,
});

describe('reprendreCodePlayground', () => {
  it('source chargée par charger_source_url, adoptée, consigne fidèle posée', async () => {
    const j = dependances({
      ok: true,
      source: SOURCE,
      fields: [],
      fournisseur: 'Opendatasoft',
      total: 1,
      autres: [],
    });
    const issue = await reprendreCodePlayground(
      passation(),
      'Code en cours\n\ndata → 1 ligne',
      j.deps
    );

    expect(issue.charge).toBe(true);
    expect(j.charger).toHaveBeenCalledWith(URL_ODS, undefined);
    expect(j.adoptees).toEqual([SOURCE]);
    expect(j.annonces[0]).toContain('Source « industrie-du-futur » chargée');
    expect(j.annonces[0]).toContain('relisez-la, puis envoyez-la');

    expect(j.poses).toHaveLength(1);
    const message = j.poses[0];
    expect(message.startsWith(QUESTION_RECONSTRUIRE)).toBe(true);
    expect(message).toContain('composant libre');
    expect(message).toContain('id « url_opendatasoft_industrie-du-futur »');
    expect(message).toContain('```html\n' + CODE + '\n```');
    expect(message).toContain('data → 1 ligne');
  });

  it('refus du chargement : dit à l’usager, première phrase seulement', async () => {
    const j = dependances(
      {
        ok: false,
        message:
          "Accès refusé par Opendatasoft : ce jeu n'est pas public. Ne demande PAS de clé ni de jeton dans la conversation.",
      },
      'Ma source'
    );
    const issue = await reprendreCodePlayground(passation(), null, j.deps);
    expect(issue.charge).toBe(false);
    expect(j.adoptees).toEqual([]);
    expect(j.annonces[0]).toContain("Accès refusé par Opendatasoft : ce jeu n'est pas public)");
    expect(j.annonces[0]).not.toContain('Ne demande PAS');
    expect(j.annonces[0]).toContain('« Ma source »');
    expect(j.poses[0]).toContain("n'a pas été chargée");
  });

  it('source à clé : rien n’est chargé, l’usager est renvoyé vers Sources', async () => {
    const j = dependances({ ok: false, message: 'inutile' });
    await reprendreCodePlayground(
      passation({ source: undefined, sourceNonTransmise: 'cle' }),
      null,
      j.deps
    );
    expect(j.charger).not.toHaveBeenCalled();
    expect(j.annonces[0]).toContain("demande une clé d'accès");
    expect(j.annonces[0]).toContain("l'app Sources");
    expect(j.poses[0]).toContain(CODE);
  });

  it('plusieurs sources : la consigne le dit', async () => {
    const j = dependances({ ok: false, message: 'x.' });
    await reprendreCodePlayground(
      passation({ sources: 3, source: undefined, sourceNonTransmise: 'embarquee' }),
      null,
      j.deps
    );
    expect(j.poses[0]).toContain('Le code déclare 3 sources');
  });
});

describe('passation lue dans la session : une entrée externe', () => {
  beforeEach(() => sessionStorage.clear());

  it('consommée une fois, forme validée', () => {
    transmettrePassationStudio(passation());
    expect(recupererPassationStudio()).toEqual(passation());
    expect(sessionStorage.getItem(PASSATION_STUDIO_KEY)).toBeNull();
    expect(recupererPassationStudio()).toBeNull();
  });

  it('origine inconnue, code absent, adresse non https : écartés', () => {
    expect(validerPassationStudio({ origine: 'autre', code: 'x', sources: 0 })).toBeNull();
    expect(validerPassationStudio({ origine: 'playground', sources: 0 })).toBeNull();
    expect(validerPassationStudio('texte')).toBeNull();
    const sansSource = validerPassationStudio({
      origine: 'playground',
      code: 'x',
      sources: 1,
      source: { url: 'javascript:alert(1)' },
      sourceNonTransmise: 'inventee',
    });
    expect(sansSource).toEqual({ origine: 'playground', code: 'x', sources: 1 });
  });

  it('JSON illisible : null, sans lever', () => {
    sessionStorage.setItem(PASSATION_STUDIO_KEY, '{');
    expect(recupererPassationStudio()).toBeNull();
  });
});

describe('lien « Retour au Playground »', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML =
      '<p id="retour-playground" hidden><a id="retour-playground-link" href="#">Retour au Playground</a></p>';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('montré depuis le Playground, il rend le code d’origine', () => {
    garderCodePourRetour(CODE);
    expect(monterRetourPlayground('playground')).toBe(true);
    const lien = document.getElementById('retour-playground-link') as HTMLAnchorElement;
    expect(document.getElementById('retour-playground')?.hidden).toBe(false);
    expect(lien.getAttribute('href')).toMatch(/playground\/index\.html\?from=studio$/);
    lien.addEventListener('click', (e) => e.preventDefault());
    lien.click();
    expect(sessionStorage.getItem('playground-code')).toBe(CODE);
  });

  it('caché sans origine Playground ou sans code gardé', () => {
    garderCodePourRetour(CODE);
    expect(monterRetourPlayground(null)).toBe(false);
    sessionStorage.removeItem(CLE_RETOUR_PLAYGROUND);
    expect(monterRetourPlayground('playground')).toBe(false);
    expect(document.getElementById('retour-playground')?.hidden).toBe(true);
  });
});

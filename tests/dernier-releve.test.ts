/**
 * #1288, proposition B — le dernier relevé, daté et marqué, quand l'intégrateur
 * le demande (`stale-if-error="<secondes>"` sur la source).
 *
 * Par défaut une source en panne ne laisse aucun ancien chiffre à l'écran
 * (proposition A, `tests/panne-partout.test.ts`). Avec l'attribut, et pour une
 * panne passagère de la MÊME requête, les afficheurs gardent leurs derniers
 * chiffres sous l'étiquette « Non actualisé » et l'heure de leur relevé —
 * jusqu'à la durée donnée, puis reviennent d'eux-mêmes au message de panne.
 *
 * Ce fichier porte le SOCLE, horloge fixée : la règle (`judgeStaleReading`), les
 * textes, la consigne et l'empreinte de la source jusqu'au registre, le bandeau.
 * Les afficheurs ont chacun leur fichier (`dernier-releve-kpi-graphique`,
 * `-listes-tableau`, `-carte`). Les boîtes, les contrastes et le vrai Leaflet
 * sont dans `e2e/dernier-releve.spec.ts` ; les chiffres, dans
 * `tests/verif-donnees/affichages.ts`.
 */
import { describe, it, expect, vi } from 'vitest';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataJoin } from '@/components/dsfr-data-join.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataSourceStatus } from '@/components/dsfr-data-source-status.js';
import {
  dispatchDataError,
  dispatchDataLoaded,
  dispatchDataLoading,
  getDataCache,
  getDataErrorState,
  getLastKnownData,
  markStaleSuperseded,
  normalizeStaleIfError,
} from '@/utils/data-bridge.js';
import {
  READING_POINTS,
  READING_ZONES,
  formatReadingHour,
  formatReadingMoment,
  formatReadingMomentShort,
  judgeStaleReading,
  readStaleReading,
  readingAccessibleSuffix,
  readingExportSuffix,
  readingFilename,
  readingKpiAccessible,
  readingSentence,
  readingTileLine,
} from '@/utils/stale-reading.js';
import {
  E400,
  E403,
  E404,
  E429,
  E503,
  MINUTE,
  RELEVE,
  charge,
  horlogeDuReleve,
  mountSource,
  panne,
  reponseKo,
  reponseOk,
  source,
  texte,
  tourner,
} from './helpers/dernier-releve.js';

void DsfrDataJoin;
void DsfrDataQuery;
void DsfrDataSource;
void DsfrDataSourceStatus;

horlogeDuReleve(mockFetch);

// ---------------------------------------------------------------------------
// La règle
// ---------------------------------------------------------------------------

describe('#1288 B — la règle : quand un relevé est-il affichable ?', () => {
  const ROWS = [{ n: 42 }];

  it('consigne posée, cause passagère, même requête, dans la durée : oui, daté du chargement', () => {
    const src = source('regle');
    charge(src, ROWS);
    vi.setSystemTime(RELEVE + 5 * MINUTE);
    panne(src);

    const reading = readStaleReading(src);
    expect(reading).toEqual({
      data: ROWS,
      loadedAt: RELEVE,
      cause: 'service-indisponible',
      originId: src,
      expiresAt: RELEVE + 3600_000,
    });
    // ADR-158 inchangée : le chemin par défaut ne rend toujours rien
    expect(getDataCache(src)).toBeUndefined();
  });

  it('sans consigne : jamais', () => {
    const src = source('regle-sans');
    charge(src, ROWS);
    panne(src, { consigne: null });
    expect(readStaleReading(src)).toBeNull();
    expect(judgeStaleReading(getLastKnownData(src), Date.now()).refusal).toBe('sans-consigne');
    // L'état d'erreur d'une source sans consigne est celui d'avant #1288
    expect(getDataErrorState(src)).not.toHaveProperty('staleIfError');
    expect(getDataErrorState(src)).not.toHaveProperty('sameRequest');
  });

  it.each([
    ['0', 0],
    ['négative', -60],
    ['non numérique', Number.NaN],
    ['infinie', Number.POSITIVE_INFINITY],
  ])('consigne %s : pas de consigne — il n’existe pas de relevé sans durée', (_nom, valeur) => {
    expect(normalizeStaleIfError(valeur)).toBeUndefined();
    const src = source('regle-invalide');
    charge(src, ROWS);
    panne(src, { consigne: valeur });
    expect(readStaleReading(src)).toBeNull();
  });

  it.each([
    ['données introuvables (404)', E404],
    ['accès restreint (403)', E403],
    ['page mal réglée (400)', E400],
  ])('%s : jamais — le producteur a retiré ou fermé ces données', (_nom, erreur) => {
    const src = source('regle-cause');
    charge(src, ROWS);
    panne(src, { erreur: erreur() });
    expect(readStaleReading(src)).toBeNull();
    expect(judgeStaleReading(getLastKnownData(src), Date.now()).refusal).toBe('cause-durable');
  });

  it.each([
    ['service indisponible', E503, 'service-indisponible'],
    ['service très sollicité', E429, 'service-sollicite'],
    ['réponse bloquée', () => new TypeError('Failed to fetch'), 'reponse-bloquee'],
  ])('%s : cause passagère, le relevé s’affiche', (_nom, erreur, cause) => {
    const src = source('regle-passagere');
    charge(src, ROWS);
    panne(src, { erreur: erreur() });
    expect(readStaleReading(src)?.cause).toBe(cause);
  });

  it('hors connexion : cause passagère', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const src = source('regle-hors-ligne');
    charge(src, ROWS);
    panne(src, { erreur: new TypeError('Failed to fetch') });
    expect(readStaleReading(src)?.cause).toBe('hors-connexion');
  });

  it('l’appel en échec n’est pas celui qui a produit les lignes : jamais', () => {
    const src = source('regle-requete');
    charge(src, ROWS, 'region=Occitanie');
    panne(src, { key: 'region=Bretagne' });
    expect(readStaleReading(src)).toBeNull();
    expect(judgeStaleReading(getLastKnownData(src), Date.now()).refusal).toBe('autre-requete');
    // Les lignes restent lisibles par la lecture explicite (ADR-158) : c'est
    // l'AFFICHAGE qui est refusé
    expect(getLastKnownData(src)?.data).toEqual(ROWS);
  });

  it('la requête redevient celle des lignes (filtre réinitialisé) : le relevé revient', () => {
    const src = source('regle-retour-requete');
    charge(src, ROWS, 'tout');
    panne(src, { key: 'region=Bretagne' });
    expect(readStaleReading(src)).toBeNull();
    dispatchDataLoading(src);
    panne(src, { key: 'tout' });
    expect(readStaleReading(src)?.data).toEqual(ROWS);
  });

  it('une source qui ne dit pas quelle requête elle a posée : jamais', () => {
    const src = source('regle-sans-empreinte');
    dispatchDataLoaded(src, ROWS);
    dispatchDataError(src, E503(), undefined, { staleIfError: 3600 });
    expect(readStaleReading(src)).toBeNull();
  });

  it('plus vieux que la durée : jamais — comptée depuis le RELEVÉ, pas depuis l’échec', () => {
    const src = source('regle-duree');
    charge(src, ROWS);
    vi.setSystemTime(RELEVE + 50 * MINUTE);
    panne(src);
    expect(readStaleReading(src)).not.toBeNull();
    // À l'instant exact de l'échéance, il vaut encore ; une milliseconde après, non
    expect(readStaleReading(src, RELEVE + 3600_000)).not.toBeNull();
    expect(readStaleReading(src, RELEVE + 3600_001)).toBeNull();
    expect(judgeStaleReading(getLastKnownData(src), RELEVE + 3600_001).refusal).toBe('echu');
  });

  it('rien n’a jamais été reçu : jamais', () => {
    const src = source('regle-rien');
    panne(src);
    expect(readStaleReading(src)).toBeNull();
    expect(judgeStaleReading(getLastKnownData(src), Date.now()).refusal).toBe('rien-recu');
  });

  it('une source qui fonctionne n’a pas de relevé', () => {
    const src = source('regle-ok');
    charge(src, ROWS);
    expect(readStaleReading(src)).toBeNull();
    expect(judgeStaleReading(getLastKnownData(src), Date.now()).refusal).toBe('a-jour');
  });

  it('pendant un nouvel essai le relevé tient ; un échec sans consigne le retire', () => {
    const src = source('regle-essai');
    charge(src, ROWS);
    panne(src);
    dispatchDataLoading(src);
    expect(getDataErrorState(src)).toBeUndefined();
    expect(readStaleReading(src)?.loadedAt).toBe(RELEVE);
    // La consigne est celle du DERNIER échec : elle ne s'hérite pas du précédent
    panne(src, { consigne: null });
    expect(readStaleReading(src)).toBeNull();
  });

  it('la consigne et le jugement suivent la chaîne : un relais ne juge rien lui-même', () => {
    const src = source('regle-chaine');
    const etape = source('regle-chaine-etape');
    charge(src, ROWS);
    dispatchDataLoaded(etape, [{ total: 42 }], { loadedAt: RELEVE });
    const erreur = panne(src);
    dispatchDataError(etape, erreur, undefined, { relayedFrom: src });

    expect(readStaleReading(etape)).toMatchObject({
      data: [{ total: 42 }],
      loadedAt: RELEVE,
      originId: src,
    });

    // Autre requête à l'origine : l'étape en aval ne montre pas son ancien résultat
    dispatchDataLoading(src);
    dispatchDataLoading(etape);
    const autre = panne(src, { key: 'autre' });
    dispatchDataError(etape, autre, undefined, { relayedFrom: src });
    expect(readStaleReading(etape)).toBeNull();
  });

  it('un calcul refusé pendant la panne : ce que l’étape garde répond à la demande d’avant', () => {
    const src = source('regle-supplante');
    charge(src, ROWS);
    panne(src);
    expect(readStaleReading(src)).not.toBeNull();
    markStaleSuperseded(src);
    expect(readStaleReading(src)).toBeNull();
    expect(getLastKnownData(src)?.stale?.sameRequest).toBe(false);
    // Un nouvel échec ne lève pas la marque ; un chargement réussi, si
    dispatchDataLoading(src);
    panne(src);
    expect(readStaleReading(src)).toBeNull();
    charge(src, ROWS);
    panne(src);
    expect(readStaleReading(src)).not.toBeNull();
  });

  it('jointure : le rechargement de l’AUTRE entrée ne change pas la question — le relevé tient', async () => {
    const gauche = source('jointure-gauche');
    const droite = source('jointure-droite');
    const j = source('jointure');
    const join = document.createElement('dsfr-data-join') as DsfrDataJoin;
    join.id = j;
    join.setAttribute('left', gauche);
    join.setAttribute('right', droite);
    join.setAttribute('on', 'code');
    document.body.appendChild(join);
    await join.updateComplete;
    charge(gauche, [{ code: 'A', n: 1 }]);
    charge(droite, [{ code: 'A', libelle: 'Alpha' }]);
    await join.updateComplete;
    expect(join.getData()).toHaveLength(1);

    panne(gauche);
    await join.updateComplete;
    expect(readStaleReading(j)?.data).toHaveLength(1);
    // L'entrée saine se recharge : la jointure refuse de recalculer (#1272),
    // mais on ne lui demande rien de nouveau — son dernier résultat reste le relevé
    vi.setSystemTime(RELEVE + MINUTE);
    charge(droite, [{ code: 'A', libelle: 'Alpha (bis)' }]);
    await join.updateComplete;
    expect(readStaleReading(j)?.data).toEqual([{ code: 'A', n: 1, libelle: 'Alpha' }]);
    expect(readStaleReading(j)?.loadedAt).toBe(RELEVE);
  });

  it('une ré-émission des mêmes lignes ne les rajeunit pas', () => {
    const src = source('regle-reemission');
    charge(src, ROWS);
    vi.setSystemTime(RELEVE + 20 * MINUTE);
    dispatchDataLoaded(src, ROWS, { reemit: true });
    expect(getLastKnownData(src)?.loadedAt).toBe(RELEVE);
    panne(src);
    // L'empreinte aussi est restée : c'est toujours la même requête
    expect(readStaleReading(src)?.loadedAt).toBe(RELEVE);
  });
});

// ---------------------------------------------------------------------------
// Les textes
// ---------------------------------------------------------------------------

describe('#1288 B — les textes : « relevés le », avec l’heure du chargement', () => {
  const maintenant = RELEVE + 3 * MINUTE;
  const veille = new Date(2026, 9, 12, 18, 5, 0).getTime();
  const premier = new Date(2026, 9, 1, 9, 5, 0).getTime();
  const anDernier = new Date(2025, 11, 31, 23, 59, 0).getTime();

  it('le jour même : l’heure ; un autre jour : la date en entier, jamais « hier »', () => {
    expect(formatReadingHour(RELEVE)).toBe('14 h 32');
    expect(formatReadingMoment(RELEVE, maintenant)).toBe('aujourd’hui à 14 h 32');
    expect(formatReadingMoment(veille, maintenant)).toBe('le 12 octobre à 18 h 05');
    expect(formatReadingMoment(premier, maintenant)).toBe('le 1er octobre à 9 h 05');
    expect(formatReadingMoment(anDernier, maintenant)).toBe('le 31 décembre 2025 à 23 h 59');
  });

  it('forme courte, pour une tuile ou un bouton', () => {
    expect(formatReadingMomentShort(RELEVE, maintenant)).toBe('à 14 h 32');
    expect(formatReadingMomentShort(veille, maintenant)).toBe('le 12/10 à 18 h 05');
    expect(formatReadingMomentShort(anDernier, maintenant)).toBe('le 31/12/2025 à 23 h 59');
  });

  it('les phrases de la planche', () => {
    expect(readingSentence(RELEVE, maintenant)).toBe('Chiffres relevés aujourd’hui à 14 h 32.');
    expect(readingSentence(veille, maintenant)).toBe('Chiffres relevés le 12 octobre à 18 h 05.');
    expect(readingSentence(RELEVE, maintenant, READING_POINTS)).toBe(
      'Points relevés aujourd’hui à 14 h 32.'
    );
    expect(readingSentence(RELEVE, maintenant, READING_ZONES)).toBe(
      'Zones relevées aujourd’hui à 14 h 32.'
    );
    expect(readingAccessibleSuffix(RELEVE, maintenant)).toBe(
      'Chiffres relevés aujourd’hui à 14 h 32, non actualisés.'
    );
    expect(readingAccessibleSuffix(RELEVE, maintenant, READING_ZONES)).toBe(
      'Zones relevées aujourd’hui à 14 h 32, non actualisées.'
    );
    expect(readingTileLine(RELEVE, maintenant)).toBe('Relevé à 14 h 32 · non actualisé');
    expect(readingTileLine(veille, maintenant)).toBe('Relevé le 12/10 à 18 h 05 · non actualisé');
    expect(readingKpiAccessible(RELEVE, maintenant)).toBe(
      'chiffre relevé aujourd’hui à 14 h 32, non actualisé'
    );
    expect(readingExportSuffix(RELEVE, maintenant)).toBe('(chiffres relevés à 14 h 32)');
  });

  it('le nom du fichier porte la date COMPLÈTE du relevé, avant l’extension', () => {
    expect(readingFilename('données.csv', RELEVE)).toBe('données_relevé-2026-10-13-14h32.csv');
    expect(readingFilename('export.html', veille)).toBe('export_relevé-2026-10-12-18h05.html');
    expect(readingFilename('sans-extension', RELEVE)).toBe(
      'sans-extension_relevé-2026-10-13-14h32'
    );
  });
});

// ---------------------------------------------------------------------------
// Le bandeau
// ---------------------------------------------------------------------------

describe('#1288 B — bandeau : il ne promet plus que les blocs « s’afficheront »', () => {
  async function mountBandeau(src: string): Promise<DsfrDataSourceStatus> {
    const el = document.createElement('dsfr-data-source-status') as DsfrDataSourceStatus;
    el.setAttribute('source', src);
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  const titre = (el: Element) => texte(el.querySelector('.fr-alert__title'));
  const phrase = (el: Element) => texte(el.querySelector('.dsfr-data-source-status__text'));

  it('sans la consigne : le texte d’avant, mot pour mot', async () => {
    const src = source('bandeau-sans');
    const el = await mountBandeau(src);
    charge(src, [{ n: 1 }]);
    panne(src, { consigne: null });
    await el.updateComplete;
    expect(titre(el)).toBe('Une partie des chiffres de cette page est momentanément indisponible');
    expect(phrase(el)).toBe(
      'Le service qui publie ces chiffres ne répond pas pour l’instant. Les blocs concernés ' +
        's’afficheront dès son retour ; le reste de la page est à jour.'
    );
  });

  it('avec un relevé affiché : « n’a pas pu être actualisée », et où lire l’heure', async () => {
    const src = source('bandeau');
    const el = await mountBandeau(src);
    charge(src, [{ n: 1 }]);
    panne(src);
    await el.updateComplete;
    expect(titre(el)).toBe('Une partie des chiffres de cette page n’a pas pu être actualisée');
    expect(phrase(el)).toBe(
      'Le service qui publie ces chiffres ne répond pas pour l’instant. Les derniers chiffres ' +
        'reçus restent affichés, avec l’heure de leur relevé ; le reste de la page est à jour.'
    );
    // Le bandeau ne dit pas l'heure : chaque bloc dit la sienne
    expect(texte(el)).not.toMatch(/14 h 32/);
  });

  it('passé la durée, il reprend de lui-même son texte ordinaire', async () => {
    const src = source('bandeau-echeance');
    const el = await mountBandeau(src);
    charge(src, [{ n: 1 }]);
    panne(src, { consigne: 60 });
    await el.updateComplete;
    expect(titre(el)).toContain('n’a pas pu être actualisée');
    vi.advanceTimersByTime(2 * MINUTE);
    await el.updateComplete;
    expect(titre(el)).toBe('Une partie des chiffres de cette page est momentanément indisponible');
  });

  it('service très sollicité, hors connexion : la phrase suit la cause', async () => {
    const src = source('bandeau-429');
    const el = await mountBandeau(src);
    charge(src, [{ n: 1 }]);
    panne(src, { erreur: E429() });
    await el.updateComplete;
    expect(phrase(el)).toBe(
      'Le service est très sollicité. Les derniers chiffres reçus restent affichés, avec ' +
        'l’heure de leur relevé. Réessayez dans quelques instants.'
    );

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    dispatchDataLoading(src);
    panne(src, { erreur: new TypeError('Failed to fetch') });
    await el.updateComplete;
    expect(titre(el)).toBe('Vous semblez hors connexion');
    expect(phrase(el)).toBe(
      'Les derniers chiffres reçus restent affichés, avec l’heure de leur relevé ; ils seront ' +
        'actualisés quand la connexion reviendra.'
    );
  });

  it('données retirées : aucun relevé, donc le texte ordinaire', async () => {
    const src = source('bandeau-404');
    const el = await mountBandeau(src);
    charge(src, [{ n: 1 }]);
    panne(src, { erreur: E404() });
    await el.updateComplete;
    expect(titre(el)).toBe('Une partie des chiffres de cette page ne peut pas être affichée');
  });
});

// ---------------------------------------------------------------------------
// La source réelle
// ---------------------------------------------------------------------------

describe('#1288 B — de la source au registre, par une vraie requête', () => {
  it('la source porte la consigne et l’empreinte de l’appel jusqu’au registre', async () => {
    const id = source('src');
    mockFetch.mockReturnValueOnce(reponseOk([{ n: 42 }]));
    const src = await mountSource(id, {
      url: 'https://exemple.test/a.json',
      'stale-if-error': '900',
    });
    expect(getDataCache(id)).toEqual([{ n: 42 }]);

    vi.setSystemTime(RELEVE + 5 * MINUTE);
    mockFetch.mockReturnValueOnce(reponseKo(503));
    src.reload();
    await tourner();

    expect(getDataErrorState(id)).toMatchObject({ staleIfError: 900, sameRequest: true });
    expect(readStaleReading(id)).toMatchObject({ data: [{ n: 42 }], loadedAt: RELEVE });
    // ADR-158 inchangée
    expect(src.getData()).toBeNull();
    expect(getDataCache(id)).toBeUndefined();
  });

  it('sans l’attribut : aucune consigne', async () => {
    const id = source('src-sans');
    mockFetch.mockReturnValueOnce(reponseOk([{ n: 42 }]));
    const src = await mountSource(id, { url: 'https://exemple.test/a.json' });
    mockFetch.mockReturnValueOnce(reponseKo(503));
    src.reload();
    await tourner();
    expect(getDataErrorState(id)).not.toHaveProperty('staleIfError');
    expect(readStaleReading(id)).toBeNull();
  });

  it('valeur inexploitable : ignorée, avec un avertissement', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const id = source('src-invalide');
    mockFetch.mockReturnValueOnce(reponseOk([{ n: 42 }]));
    const src = await mountSource(id, {
      url: 'https://exemple.test/a.json',
      'stale-if-error': 'oui',
    });
    mockFetch.mockReturnValueOnce(reponseKo(503));
    src.reload();
    await tourner();
    expect(readStaleReading(id)).toBeNull();
    expect(warn.mock.calls.flat().join(' ')).toContain('stale-if-error ignoré');
  });

  it('l’adresse change puis échoue : autre requête, pas de relevé', async () => {
    const id = source('src-url');
    mockFetch.mockReturnValueOnce(reponseOk([{ n: 42 }]));
    const src = await mountSource(id, {
      url: 'https://exemple.test/a.json?region=Occitanie',
      'stale-if-error': '900',
    });
    mockFetch.mockReturnValueOnce(reponseKo(503));
    src.setAttribute('url', 'https://exemple.test/a.json?region=Bretagne');
    await tourner();
    expect(getDataErrorState(id)).toMatchObject({ sameRequest: false });
    expect(readStaleReading(id)).toBeNull();
    expect(getLastKnownData(id)?.data).toEqual([{ n: 42 }]);
  });

  it('source → requête : le dernier AGRÉGAT reste le relevé de la requête, daté du chargement de la source', async () => {
    const id = source('chaine');
    const q = source('chaine-q');
    mockFetch.mockReturnValueOnce(
      reponseOk([
        { r: 'A', n: 40 },
        { r: 'A', n: 2 },
        { r: 'B', n: 8 },
      ])
    );
    const src = await mountSource(id, {
      url: 'https://exemple.test/a.json',
      'stale-if-error': '3600',
    });
    const query = document.createElement('dsfr-data-query') as DsfrDataQuery;
    query.id = q;
    query.setAttribute('source', id);
    query.setAttribute('filter', 'r:eq:A');
    query.setAttribute('aggregate', 'n:sum:total');
    document.body.appendChild(query);
    await tourner();
    expect(query.getData()).toEqual([{ total: 42 }]);

    vi.setSystemTime(RELEVE + 9 * MINUTE);
    mockFetch.mockReturnValueOnce(reponseKo(503));
    src.reload();
    await tourner();

    // Aucun recalcul sur des lignes périmées : c'est le dernier RÉSULTAT émis
    expect(readStaleReading(q)).toMatchObject({
      data: [{ total: 42 }],
      loadedAt: RELEVE,
      originId: id,
    });
    // ADR-158 : la requête ne rend toujours rien par le chemin par défaut
    expect(query.getData()).toEqual([]);

    // Un attribut de la requête change PENDANT la panne : ce qu'elle garde
    // répond à l'ancienne demande — plus de relevé, et l'aval est prévenu
    const erreurs: string[] = [];
    const ecoute = (e: Event) => erreurs.push((e as CustomEvent).detail.sourceId);
    document.addEventListener('dsfr-data-error', ecoute);
    query.setAttribute('filter', 'r:eq:B');
    await query.updateComplete;
    await tourner();
    document.removeEventListener('dsfr-data-error', ecoute);
    expect(readStaleReading(q)).toBeNull();
    expect(erreurs).toContain(q);
    expect(getLastKnownData(q)?.data).toEqual([{ total: 42 }]);
  });
});

/**
 * #1222 — forme compacte du KPI en panne, et lien vers la page des données sur un 404.
 *
 * 1. Une tuile de KPI dont la source échoue garde sa place : « — » à la place
 *    du chiffre, son libellé, une phrase courte par cause du barème. Jamais un
 *    nombre — ni 0, ni le chiffre du chargement précédent.
 * 2. `source-page` sur la source : un lien vers la page publique des données,
 *    pour la seule cause « données introuvables », jamais déduit, jamais
 *    l'adresse d'API ni celle du relais, jamais un schéma autre que http(s).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { DsfrDataPodium } from '@/components/dsfr-data-podium.js';
import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataSourceStatus } from '@/components/dsfr-data-source-status.js';
import {
  DATA_EVENTS,
  clearDataCache,
  dispatchDataError,
  dispatchDataIdle,
  dispatchDataLoaded,
  dispatchDataLoading,
  getDataErrorState,
  type SourceCommandEvent,
} from '@/utils/data-bridge.js';
import {
  SOURCE_PAGE_LABEL,
  describeSourceCause,
  safeSourcePage,
  sourcePageFor,
  type SourceErrorCause,
} from '@/utils/source-errors.js';

void DsfrDataKpi;
void DsfrDataPodium;
void DsfrDataSource;
void DsfrDataSourceStatus;

const A = 'kpi1222-a';
const Q = 'kpi1222-q';
const PAGE = 'https://data.economie.gouv.fr/explore/dataset/prix-carburants/';

type Updatable = HTMLElement & { updateComplete: Promise<boolean> };

async function mountKpi(attrs: Record<string, string> = {}): Promise<DsfrDataKpi> {
  const el = document.createElement('dsfr-data-kpi') as DsfrDataKpi;
  for (const [k, v] of Object.entries({
    source: A,
    value: 'n:sum',
    label: 'Bénéficiaires',
    ...attrs,
  }))
    el.setAttribute(k, v);
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

async function mount<T extends Updatable>(el: T, source: string): Promise<T> {
  (el as unknown as { source: string }).source = source;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

/** Tout ce que la tuile donne à LIRE : texte rendu et nom accessible, hors `<style>`. */
function lisible(kpi: DsfrDataKpi): string {
  const clone = kpi.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('style').forEach((s) => s.remove());
  const carte = kpi.querySelector('.dsfr-data-kpi');
  return `${clone.textContent ?? ''} ${carte?.getAttribute('aria-label') ?? ''}`;
}

/** Idem, sans « Détails » : un code HTTP et une heure y sont légitimes. */
function lisibleHorsDetails(kpi: DsfrDataKpi): string {
  const clone = kpi.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('style, details').forEach((s) => s.remove());
  const carte = kpi.querySelector('.dsfr-data-kpi');
  return `${clone.textContent ?? ''} ${carte?.getAttribute('aria-label') ?? ''}`;
}

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
}

beforeEach(() => {
  for (const id of [A, Q]) clearDataCache(id);
});

afterEach(() => {
  document.body.innerHTML = '';
  for (const id of [A, Q]) clearDataCache(id);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('#1222 — barème : une phrase courte par cause', () => {
  const ATTENDU: Record<SourceErrorCause, string> = {
    'service-indisponible': 'Chiffre momentanément indisponible',
    'reponse-bloquee': 'Chiffre momentanément indisponible',
    'hors-connexion': 'Vous semblez hors connexion',
    'service-sollicite': 'Le service est très sollicité',
    'donnees-introuvables': 'Ce chiffre n’est plus publié à cette adresse',
    'acces-restreint': 'Ce chiffre n’est pas accessible publiquement',
    'page-mal-reglee': 'Ce chiffre n’a pas pu être affiché',
  };

  for (const [cause, phrase] of Object.entries(ATTENDU) as Array<[SourceErrorCause, string]>) {
    it(`${cause} → « ${phrase} »`, () => {
      const desc = describeSourceCause(cause);
      expect(desc.compact).toBe(phrase);
      // Une ligne de tuile : ni code HTTP, ni point final, ni phrase longue.
      expect(desc.compact).not.toMatch(/\d{3}|HTTP|\.$/);
      expect(desc.compact.length).toBeLessThanOrEqual(48);
    });
  }
});

describe('#1222 — tuile en panne : forme compacte', () => {
  const CAS: Array<[string, () => Error, boolean, SourceErrorCause, string, boolean]> = [
    [
      '503',
      () => new Error('HTTP 503: Service Unavailable'),
      true,
      'service-indisponible',
      'Chiffre momentanément indisponible',
      true,
    ],
    [
      'réponse bloquée',
      () => new TypeError('Failed to fetch'),
      true,
      'reponse-bloquee',
      'Chiffre momentanément indisponible',
      true,
    ],
    [
      'hors connexion',
      () => new TypeError('Failed to fetch'),
      false,
      'hors-connexion',
      'Vous semblez hors connexion',
      true,
    ],
    [
      '429',
      () => new Error('HTTP 429: Too Many Requests'),
      true,
      'service-sollicite',
      'Le service est très sollicité',
      true,
    ],
    [
      '404',
      () => new Error('HTTP 404: Not Found'),
      true,
      'donnees-introuvables',
      'Ce chiffre n’est plus publié à cette adresse',
      false,
    ],
    [
      '403',
      () => new Error('HTTP 403: Forbidden'),
      true,
      'acces-restreint',
      'Ce chiffre n’est pas accessible publiquement',
      false,
    ],
    [
      '400',
      () => new Error('HTTP 400: Bad Request'),
      true,
      'page-mal-reglee',
      'Ce chiffre n’a pas pu être affiché',
      false,
    ],
  ];

  for (const [nom, erreur, online, cause, phrase, retry] of CAS) {
    it(`${nom} : « — », le libellé, « ${phrase} »${retry ? ', « Réessayer »' : ', sans bouton'}`, async () => {
      setOnline(online);
      const kpi = await mountKpi();
      dispatchDataError(A, erreur());
      await kpi.updateComplete;

      const bloc = kpi.querySelector('.dsfr-data-status--source-error') as HTMLElement;
      expect(bloc.classList.contains('dsfr-data-status--compact')).toBe(true);
      expect(bloc.dataset.cause).toBe(cause);
      expect(bloc.getAttribute('role')).toBe('status');
      // Le tiret tient la place du chiffre, et n'est pas lu.
      const tiret = bloc.querySelector('.dsfr-data-kpi__value') as HTMLElement;
      expect(tiret.textContent!.trim()).toBe('—');
      expect(tiret.getAttribute('aria-hidden')).toBe('true');
      // Le libellé reste : l'usager sait QUEL chiffre manque.
      expect(bloc.querySelector('.dsfr-data-kpi__label')!.textContent).toBe('Bénéficiaires');
      expect(bloc.querySelector('.dsfr-data-status__title')!.textContent).toBe(phrase);
      expect(Boolean(bloc.querySelector('button.dsfr-data-status__retry'))).toBe(retry);
      // Le gabarit haut (icône, titre, phrase de cause) n'est plus rendu dans la tuile.
      expect(kpi.querySelector('.dsfr-data-kpi__error')).toBeNull();
      expect(kpi.querySelector('.dsfr-data-status__detail')).toBeNull();
      // La figure se nomme par le libellé et la phrase.
      expect(kpi.querySelector('.dsfr-data-kpi')!.getAttribute('aria-label')).toBe(
        `Bénéficiaires: ${phrase}`
      );
    });
  }

  it('n’affiche JAMAIS un nombre : ni 0, ni le chiffre du chargement précédent', async () => {
    const kpi = await mountKpi({
      trend: 'evol:avg',
      lines: '[{"value":"n:max","suffix":"au plus"}]',
    });
    dispatchDataLoaded(A, [
      { n: 1234, evol: 5.2 },
      { n: 4321, evol: 3.1 },
    ]);
    await kpi.updateComplete;
    expect(lisible(kpi)).toMatch(/5\s555/);

    dispatchDataError(A, new Error('HTTP 503: Service Unavailable'));
    await kpi.updateComplete;

    expect(kpi.querySelector('.dsfr-data-kpi__value')!.textContent!.trim()).toBe('—');
    // Aucun chiffre lisible hors « Détails » : ni la valeur, ni la tendance, ni la ligne.
    expect(lisibleHorsDetails(kpi)).not.toMatch(/\d/);
    expect(kpi.querySelector('.dsfr-data-kpi__tendance')).toBeNull();
    expect(kpi.querySelector('.dsfr-data-kpi__line')).toBeNull();
  });

  it('monté APRÈS la panne, le KPI ne ressort pas le chiffre resté en cache', async () => {
    dispatchDataLoaded(A, [{ n: 1234 }]);
    dispatchDataError(A, new Error('HTTP 503'));
    const kpi = await mountKpi();

    expect(kpi.querySelector('.dsfr-data-kpi__value')!.textContent!.trim()).toBe('—');
    expect(lisibleHorsDetails(kpi)).not.toMatch(/\d/);
    expect(kpi.querySelector('.dsfr-data-status--compact')).not.toBeNull();
  });

  it('le chiffre revient dès que la source livre de nouveau', async () => {
    const kpi = await mountKpi();
    dispatchDataError(A, new Error('HTTP 503'));
    await kpi.updateComplete;
    dispatchDataLoaded(A, [{ n: 12 }]);
    await kpi.updateComplete;

    expect(kpi.querySelector('.dsfr-data-status--source-error')).toBeNull();
    expect(kpi.querySelector('.dsfr-data-kpi__value')!.textContent!.trim()).toBe('12');
    expect(kpi.querySelector('.dsfr-data-kpi__value')!.hasAttribute('aria-hidden')).toBe(false);
  });

  it('garde le sur-titre (heading) et le nomme dans la figure', async () => {
    const kpi = await mountKpi({ heading: 'France Relance' });
    dispatchDataError(A, new Error('HTTP 503'));
    await kpi.updateComplete;

    expect(kpi.querySelector('.dsfr-data-kpi__heading')!.textContent).toBe('France Relance');
    expect(kpi.querySelector('.dsfr-data-kpi')!.getAttribute('aria-label')).toBe(
      'France Relance — Bénéficiaires: Chiffre momentanément indisponible'
    );
  });

  it('error-message de la source remplace la phrase, comme dans le gabarit complet', async () => {
    const kpi = await mountKpi();
    dispatchDataError(A, new Error('HTTP 503'), undefined, {
      userMessage: 'Les chiffres de la DGFiP sont en cours de mise à jour.',
    });
    await kpi.updateComplete;

    expect(kpi.querySelector('.dsfr-data-status__title')!.textContent).toBe(
      'Les chiffres de la DGFiP sont en cours de mise à jour.'
    );
    expect(lisible(kpi)).not.toContain('Chiffre momentanément indisponible');
    expect(kpi.querySelector('.dsfr-data-kpi__value')!.textContent!.trim()).toBe('—');
  });

  it('sans bandeau : « Réessayer » de 44 px relance la source d’ORIGINE, « Détails » replié', async () => {
    const commands: SourceCommandEvent[] = [];
    const handler = (e: Event) => commands.push((e as CustomEvent<SourceCommandEvent>).detail);
    document.addEventListener(DATA_EVENTS.SOURCE_COMMAND, handler);

    const kpi = await mountKpi({ source: Q });
    dispatchDataError(A, new Error('HTTP 503: Service Unavailable'), 'https://exemple.fr/api');
    dispatchDataError(Q, new Error('HTTP 503: Service Unavailable'), undefined, { relayedFrom: A });
    await kpi.updateComplete;

    const bouton = kpi.querySelector('button.dsfr-data-status__retry') as HTMLButtonElement;
    expect(bouton.type).toBe('button');
    expect(bouton.textContent!.trim()).toBe('Réessayer');
    expect(bouton.getAttribute('style')).toContain('min-height: 2.75rem');
    bouton.click();
    document.removeEventListener(DATA_EVENTS.SOURCE_COMMAND, handler);
    expect(commands).toEqual([{ sourceId: A, reload: true }]);

    const details = kpi.querySelector('details') as HTMLDetailsElement;
    expect(details.hasAttribute('open')).toBe(false);
    expect(details.querySelector('summary')!.textContent).toBe('Détails');
    expect(details.textContent).toContain('Code HTTP : 503');
    expect(details.textContent).toContain('https://exemple.fr/api');
    expect(details.textContent).toContain(`Source : ${A}`);
    expect(details.textContent).toMatch(/Heure : \d{2}:\d{2}:\d{2}/);
  });

  it('avec bandeau : ni bouton, ni détail, ni lien, ni role — la planche', async () => {
    const bandeau = await mount(new DsfrDataSourceStatus(), A);
    const kpi = await mountKpi();
    dispatchDataError(A, new Error('HTTP 404: Not Found'), undefined, { sourcePage: PAGE });
    await Promise.all([bandeau.updateComplete, kpi.updateComplete]);

    const bloc = kpi.querySelector('.dsfr-data-status--source-error') as HTMLElement;
    expect(bloc.hasAttribute('role')).toBe(false);
    expect(bloc.querySelector('button')).toBeNull();
    expect(bloc.querySelector('details')).toBeNull();
    expect(bloc.querySelector('a')).toBeNull();
    expect(bloc.querySelector('.dsfr-data-kpi__value')!.textContent!.trim()).toBe('—');
    expect(bloc.querySelector('.dsfr-data-status__title')!.textContent).toBe(
      'Ce chiffre n’est plus publié à cette adresse'
    );
    // Une seule région d'annonce, et le lien une seule fois : dans le bandeau.
    expect(document.querySelectorAll('[role="status"]').length).toBe(1);
    expect(document.querySelectorAll('a.dsfr-data-status__source-page').length).toBe(1);
    expect(bandeau.querySelector('a.dsfr-data-status__source-page')).not.toBeNull();
  });

  it('le bandeau parti, la tuile reprend son bouton', async () => {
    const bandeau = await mount(new DsfrDataSourceStatus(), A);
    const kpi = await mountKpi();
    dispatchDataError(A, new Error('HTTP 503'));
    await Promise.all([bandeau.updateComplete, kpi.updateComplete]);
    expect(kpi.querySelector('button')).toBeNull();

    bandeau.remove();
    await kpi.updateComplete;
    expect(kpi.querySelector('button.dsfr-data-status__retry')).not.toBeNull();
    expect(kpi.querySelector('.dsfr-data-status--source-error')!.getAttribute('role')).toBe(
      'status'
    );
  });
});

describe('#1222 — états voisins : la forme compacte ne se confond avec aucun', () => {
  it('valeur ABSENTE (null) : « — » et le libellé, sans phrase, sans bouton, sans statut', async () => {
    const kpi = await mountKpi({ value: 'n' });
    dispatchDataLoaded(A, [{ n: null }]);
    await kpi.updateComplete;

    expect(kpi.querySelector('.dsfr-data-kpi__value')!.textContent!.trim()).toBe('—');
    expect(kpi.querySelector('.dsfr-data-kpi__value')!.hasAttribute('aria-hidden')).toBe(false);
    expect(kpi.querySelector('.dsfr-data-status--source-error')).toBeNull();
    expect(kpi.querySelector('.dsfr-data-kpi__cause')).toBeNull();
    expect(kpi.querySelector('[role="status"]')).toBeNull();
    expect(kpi.querySelector('button')).toBeNull();
    expect(kpi.querySelector('.dsfr-data-kpi')!.getAttribute('aria-label')).toBe(
      'Bénéficiaires: —'
    );
  });

  it('chargement : le bloc de chargement, inchangé', async () => {
    const kpi = await mountKpi();
    dispatchDataLoading(A);
    await kpi.updateComplete;
    expect(kpi.querySelector('.dsfr-data-kpi__loading')!.getAttribute('aria-busy')).toBe('true');
    expect(kpi.querySelector('.dsfr-data-status--source-error')).toBeNull();
  });

  it('nouvel essai en cours : la tuile repasse en chargement, pas en panne', async () => {
    const kpi = await mountKpi();
    dispatchDataError(A, new Error('HTTP 503'));
    await kpi.updateComplete;
    dispatchDataLoading(A);
    await kpi.updateComplete;
    expect(kpi.querySelector('.dsfr-data-kpi__loading')).not.toBeNull();
    expect(kpi.querySelector('.dsfr-data-status--source-error')).toBeNull();
  });

  it('attente d’un filtre : le message idle, inchangé', async () => {
    const kpi = await mountKpi({ 'idle-message': 'Choisissez une région' });
    dispatchDataIdle(A);
    await kpi.updateComplete;
    expect(kpi.querySelector('.dsfr-data-kpi__idle')!.textContent).toContain(
      'Choisissez une région'
    );
    expect(kpi.querySelector('.dsfr-data-status--source-error')).toBeNull();
  });

  it('erreur de CONFIGURATION : l’alerte rouge de l’intégrateur, inchangée', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const kpi = await mountKpi({ value: 'n:somme' });
    dispatchDataError(A, new Error('HTTP 503'));
    await kpi.updateComplete;
    const bloc = kpi.querySelector('.dsfr-data-kpi__error') as HTMLElement;
    expect(bloc.getAttribute('role')).toBe('alert');
    expect(bloc.classList.contains('dsfr-data-status--config-error')).toBe(true);
    expect(kpi.querySelector('.dsfr-data-status--compact')).toBeNull();
  });

  it('les autres afficheurs gardent le gabarit complet', async () => {
    const podium = await mount(new DsfrDataPodium(), A);
    dispatchDataError(A, new Error('HTTP 503'));
    await podium.updateComplete;
    const bloc = podium.querySelector('.dsfr-data-podium__error') as HTMLElement;
    expect(bloc.classList.contains('dsfr-data-status--compact')).toBe(false);
    expect(bloc.querySelector('.dsfr-data-status__title')!.textContent).toContain(
      'Données momentanément indisponibles'
    );
    expect(bloc.querySelector('summary')!.textContent).toBe('Détails techniques');
  });
});

describe('#1222 — source-page : adresses admises', () => {
  it.each([
    PAGE,
    'http://exemple.fr/jeu',
    '/donnees/prix-carburants',
    'jeu.html',
    '../catalogue/',
    '?jeu=prix',
    '#source',
    '//data.gouv.fr/datasets/prix',
    '  https://exemple.fr/jeu  ',
  ])('admet %j', (v) => {
    expect(safeSourcePage(v)).toBe(v.trim());
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\nscript:alert(1)',
    'java\tscript:alert(1)',
    '\u0001javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'mailto:contact@exemple.fr',
    'blob:https://exemple.fr/uuid',
    'https://',
    '',
    '   ',
  ])('refuse %j', (v) => {
    expect(safeSourcePage(v)).toBeUndefined();
  });

  it('refuse null et undefined', () => {
    expect(safeSourcePage(null)).toBeUndefined();
    expect(safeSourcePage(undefined)).toBeUndefined();
  });

  it('ne vaut que pour des données introuvables', () => {
    expect(sourcePageFor('donnees-introuvables', PAGE)).toBe(PAGE);
    for (const cause of [
      'service-indisponible',
      'hors-connexion',
      'service-sollicite',
      'acces-restreint',
      'page-mal-reglee',
      'reponse-bloquee',
    ] as SourceErrorCause[]) {
      expect(sourcePageFor(cause, PAGE)).toBeUndefined();
    }
    expect(sourcePageFor('donnees-introuvables', undefined)).toBeUndefined();
    expect(sourcePageFor('donnees-introuvables', 'javascript:alert(1)')).toBeUndefined();
  });
});

describe('#1222 — source-page : le lien, sur un 404 seulement', () => {
  function lien(racine: Element): HTMLAnchorElement | null {
    return racine.querySelector('a.dsfr-data-status__source-page');
  }

  it('gabarit complet, forme compacte et bandeau : même lien, même texte, rel="noopener"', async () => {
    const podium = await mount(new DsfrDataPodium(), A);
    const kpi = await mountKpi();
    dispatchDataError(A, new Error('HTTP 404: Not Found'), 'https://api.exemple.fr/records', {
      sourcePage: PAGE,
    });
    await Promise.all([podium.updateComplete, kpi.updateComplete]);

    for (const racine of [podium, kpi]) {
      const a = lien(racine)!;
      expect(a.getAttribute('href')).toBe(PAGE);
      expect(a.textContent!.trim()).toBe(SOURCE_PAGE_LABEL);
      expect(a.textContent!.trim()).toBe('Consulter la page de ces données');
      expect(a.getAttribute('rel')).toBe('noopener');
      expect(a.hasAttribute('target')).toBe(false);
    }

    const bandeau = await mount(new DsfrDataSourceStatus(), A);
    await Promise.all([podium.updateComplete, kpi.updateComplete]);
    expect(lien(bandeau)!.getAttribute('href')).toBe(PAGE);
    expect(lien(bandeau)!.getAttribute('rel')).toBe('noopener');
    // Le bandeau posé, les blocs ne répètent pas le lien.
    expect(lien(podium)).toBeNull();
    expect(lien(kpi)).toBeNull();
  });

  it('410 vaut 404', async () => {
    const kpi = await mountKpi();
    dispatchDataError(A, new Error('HTTP 410: Gone'), undefined, { sourcePage: PAGE });
    await kpi.updateComplete;
    expect(lien(kpi)!.getAttribute('href')).toBe(PAGE);
  });

  it.each([
    ['503', 'HTTP 503: Service Unavailable'],
    ['429', 'HTTP 429: Too Many Requests'],
    ['403', 'HTTP 403: Forbidden'],
    ['400', 'HTTP 400: Bad Request'],
  ])('aucun lien sur un %s, même avec source-page', async (_code, message) => {
    const podium = await mount(new DsfrDataPodium(), A);
    const kpi = await mountKpi();
    const bandeauAvant = document.querySelectorAll('a').length;
    dispatchDataError(A, new Error(message), undefined, { sourcePage: PAGE });
    await Promise.all([podium.updateComplete, kpi.updateComplete]);
    const bandeau = await mount(new DsfrDataSourceStatus(), A);
    expect(lien(podium)).toBeNull();
    expect(lien(kpi)).toBeNull();
    expect(lien(bandeau)).toBeNull();
    expect(document.querySelectorAll('a').length).toBe(bandeauAvant);
  });

  it('sans source-page : aucun lien — rien n’est déduit, surtout pas de l’adresse d’API', async () => {
    const podium = await mount(new DsfrDataPodium(), A);
    const kpi = await mountKpi();
    const bandeau = await mount(new DsfrDataSourceStatus(), '');
    dispatchDataError(
      A,
      new Error('HTTP 404: Not Found'),
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-carburants/records'
    );
    await Promise.all([podium, kpi, bandeau].map((el) => el.updateComplete));
    expect(document.querySelectorAll('a').length).toBe(0);
  });

  it('une adresse refusée n’entre pas dans le registre, et ne donne aucun lien', async () => {
    const kpi = await mountKpi();
    dispatchDataError(A, new Error('HTTP 404'), undefined, { sourcePage: 'javascript:alert(1)' });
    await kpi.updateComplete;
    expect(getDataErrorState(A)?.sourcePage).toBeUndefined();
    expect(document.querySelectorAll('a').length).toBe(0);
  });

  it('une valeur hostile reste du texte d’attribut : pas d’injection de balisage', async () => {
    const hostile = '/jeu"><img src=x onerror=alert(1)>';
    const kpi = await mountKpi();
    dispatchDataError(A, new Error('HTTP 404'), undefined, { sourcePage: hostile });
    await kpi.updateComplete;
    expect(lien(kpi)!.getAttribute('href')).toBe(hostile);
    expect(kpi.querySelector('img')).toBeNull();
  });

  it('le lien suit la chaîne : un bloc branché sur une query le reçoit de la source', async () => {
    const kpi = await mountKpi({ source: Q });
    dispatchDataError(A, new Error('HTTP 404: Not Found'), undefined, { sourcePage: PAGE });
    dispatchDataError(Q, new Error('HTTP 404: Not Found'), undefined, { relayedFrom: A });
    await kpi.updateComplete;
    expect(lien(kpi)!.getAttribute('href')).toBe(PAGE);
  });
});

describe('#1222 — source-page : l’attribut de dsfr-data-source', () => {
  async function echec404(
    attrs: Partial<Pick<DsfrDataSource, 'sourcePage' | 'relayUrl' | 'url'>>
  ): Promise<{ fetchMock: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.spyOn> }> {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
      json: async () => ({}),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    const source = new DsfrDataSource();
    source.id = A;
    source.url = 'https://api.exemple.fr/data.json';
    Object.assign(source, attrs);
    await (source as unknown as { _fetchData: () => Promise<void> })._fetchData();
    return { fetchMock, warn };
  }

  it('l’attribut source-page est lu, et porté jusqu’au registre des erreurs', async () => {
    const el = document.createElement('dsfr-data-source') as DsfrDataSource;
    el.setAttribute('source-page', PAGE);
    expect(el.sourcePage).toBe(PAGE);

    await echec404({ sourcePage: PAGE });
    expect(getDataErrorState(A)?.cause).toBe('donnees-introuvables');
    expect(getDataErrorState(A)?.sourcePage).toBe(PAGE);
  });

  it('sans source-page, le registre ne porte aucune adresse de page', async () => {
    await echec404({});
    expect(getDataErrorState(A)?.sourcePage).toBeUndefined();
    expect(getDataErrorState(A)?.attemptedUrl).toBe('https://api.exemple.fr/data.json');
  });

  it('une adresse refusée est ignorée, et dite UNE fois en console', async () => {
    const { warn } = await echec404({ sourcePage: 'javascript:alert(1)' });
    expect(getDataErrorState(A)?.sourcePage).toBeUndefined();
    const messages = warn.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((m: string) => m.includes('source-page'));
    expect(messages.length).toBe(1);
  });

  it('avec un relais, le lien reste la page publique — jamais l’adresse du relais', async () => {
    const kpi = await mountKpi();
    const { fetchMock } = await echec404({ sourcePage: PAGE, relayUrl: '/relais' });
    await kpi.updateComplete;

    // La requête est bien partie par le relais…
    expect(String(fetchMock.mock.calls[0][0])).toContain('/relais/api.exemple.fr/');
    expect(getDataErrorState(A)?.attemptedUrl).toContain('/relais/');
    // … et le seul lien de la tuile est la page du portail.
    const liens = [...kpi.querySelectorAll('a')];
    expect(liens.map((a) => a.getAttribute('href'))).toEqual([PAGE]);
  });

  it('source-page ne déclenche aucune requête et ne change pas un chargement réussi', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => [{ n: 7 }],
      text: async () => '[{"n":7}]',
    });
    vi.stubGlobal('fetch', fetchMock);
    const kpi = await mountKpi();
    const source = new DsfrDataSource();
    source.id = A;
    source.url = 'https://api.exemple.fr/data.json';
    source.sourcePage = PAGE;
    await (source as unknown as { _fetchData: () => Promise<void> })._fetchData();
    await kpi.updateComplete;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.exemple.fr/data.json');
    expect(kpi.querySelector('.dsfr-data-kpi__value')!.textContent!.trim()).toBe('7');
    expect(document.querySelectorAll('a').length).toBe(0);
  });
});

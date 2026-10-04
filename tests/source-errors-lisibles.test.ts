/**
 * #1203 — des erreurs de données compréhensibles par l'usager, et dites une fois.
 *
 * - le barème classe une erreur de source par cause, sans DOM ;
 * - le bloc en erreur est neutre, poli (`role="status"`), détail technique replié ;
 * - « Réessayer » : dans le bloc sans bandeau, dans le bandeau seul sinon ;
 * - un bandeau par source, les blocs d'une autre source intacts ;
 * - relance manuelle par commande, relance automatique au retour du réseau
 *   SEULEMENT après un échec « hors connexion », jamais sur un 429 ;
 * - `error-message` remplace la phrase usager, pas le détail technique ;
 * - l'erreur de configuration et le contrat `dsfr-data-error` ne bougent pas.
 *
 * Le bloc témoin du gabarit complet est un `dsfr-data-podium` depuis #1222 :
 * le KPI a pris une forme compacte, gardée par `tests/kpi-source-indisponible.test.ts`.
 * Les assertions sont celles de #1203, inchangées.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'lit';
import { DsfrDataPodium } from '@/components/dsfr-data-podium.js';
import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataSourceStatus } from '@/components/dsfr-data-source-status.js';
import {
  DATA_EVENTS,
  clearDataCache,
  dispatchDataError,
  dispatchDataLoaded,
  dispatchDataLoading,
  dispatchSourceCommand,
  getDataErrorState,
  isSourceCoveredByBanner,
  type DataErrorEvent,
  type SourceCommandEvent,
} from '@/utils/data-bridge.js';
import {
  classifySourceError,
  describeSourceError,
  httpStatusOf,
  type SourceErrorCause,
} from '@/utils/source-errors.js';
import { renderConfigError, renderSourceError } from '@/utils/status-templates.js';

void DsfrDataPodium;
void DsfrDataSource;
void DsfrDataSourceStatus;

const A = 'err-src-a';
const B = 'err-src-b';
const Q = 'err-query-a';

type Updatable = HTMLElement & { updateComplete: Promise<boolean> };

async function mountBloc(source: string): Promise<DsfrDataPodium> {
  const el = new DsfrDataPodium();
  el.source = source;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

async function mountBanner(source = ''): Promise<DsfrDataSourceStatus> {
  const el = new DsfrDataSourceStatus();
  el.source = source;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

function typeError(message = 'Failed to fetch'): Error {
  return new TypeError(message);
}

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
}

function captureCommands(): { commands: SourceCommandEvent[]; stop: () => void } {
  const commands: SourceCommandEvent[] = [];
  const handler = (e: Event) => commands.push((e as CustomEvent<SourceCommandEvent>).detail);
  document.addEventListener(DATA_EVENTS.SOURCE_COMMAND, handler);
  return {
    commands,
    stop: () => document.removeEventListener(DATA_EVENTS.SOURCE_COMMAND, handler),
  };
}

beforeEach(() => {
  for (const id of [A, B, Q]) clearDataCache(id);
});

afterEach(() => {
  document.body.innerHTML = '';
  for (const id of [A, B, Q]) clearDataCache(id);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('#1203 — barème : une cause par erreur', () => {
  const CAS: Array<[string, Error, boolean, SourceErrorCause]> = [
    ['HTTP 500', new Error('HTTP 500: Internal Server Error'), true, 'service-indisponible'],
    ['HTTP 503', new Error('HTTP 503: Service Unavailable'), true, 'service-indisponible'],
    ['HTTP 408', new Error('HTTP 408: Request Timeout'), true, 'service-indisponible'],
    ['délai dépassé', new Error('The operation timed out'), true, 'service-indisponible'],
    ['HTTP 429', new Error('HTTP 429: Too Many Requests'), true, 'service-sollicite'],
    ['HTTP 404', new Error('HTTP 404: Not Found'), true, 'donnees-introuvables'],
    ['HTTP 401', new Error('HTTP 401: Unauthorized'), true, 'acces-restreint'],
    ['HTTP 403', new Error('HTTP 403: Forbidden'), true, 'acces-restreint'],
    ['HTTP 400', new Error('HTTP 400: Bad Request'), true, 'page-mal-reglee'],
    ['JSON inline invalide', new Error('Données inline invalides'), true, 'page-mal-reglee'],
    ['fetch opaque, en ligne', typeError(), true, 'reponse-bloquee'],
    ['fetch opaque, hors ligne', typeError(), false, 'hors-connexion'],
  ];

  for (const [nom, error, online, cause] of CAS) {
    it(`${nom} → ${cause}`, () => {
      expect(classifySourceError(error, online)).toBe(cause);
    });
  }

  it('lit le code HTTP dans le message, et seulement là', () => {
    expect(httpStatusOf(new Error('HTTP 503: Service Unavailable'))).toBe(503);
    expect(httpStatusOf(new Error('quota dépassé'))).toBeUndefined();
    expect(httpStatusOf(null)).toBeUndefined();
  });

  it('ne propose de réessayer que lorsque cela a un sens', () => {
    const retry = (e: Error, online = true) => describeSourceError(e, online).retry;
    expect(retry(new Error('HTTP 503'))).toBe(true);
    expect(retry(new Error('HTTP 429'))).toBe(true);
    expect(retry(typeError())).toBe(true);
    expect(retry(typeError(), false)).toBe(true);
    expect(retry(new Error('HTTP 404'))).toBe(false);
    expect(retry(new Error('HTTP 403'))).toBe(false);
    expect(retry(new Error('HTTP 400'))).toBe(false);
  });

  it('le nouvel essai automatique ne vaut que hors connexion — jamais sur un 429', () => {
    expect(describeSourceError(typeError(), false).autoRetryOnline).toBe(true);
    expect(describeSourceError(new Error('HTTP 429')).autoRetryOnline).toBe(false);
    expect(describeSourceError(new Error('HTTP 503')).autoRetryOnline).toBe(false);
    expect(describeSourceError(typeError(), true).autoRetryOnline).toBe(false);
  });

  it('parle à l’usager : aucun code HTTP dans le titre ni la phrase', () => {
    const desc = describeSourceError(new Error('HTTP 503: Service Unavailable'));
    expect(desc.title).toBe('Données momentanément indisponibles');
    expect(`${desc.title} ${desc.detail}`).not.toMatch(/HTTP|503/);
    expect(desc.status).toBe(503);
  });

  it('un 429 ne promet pas un essai qui n’aura pas lieu', () => {
    const desc = describeSourceError(new Error('HTTP 429: Too Many Requests'));
    expect(desc.title).toBe('Le service est très sollicité');
    expect(desc.detail).not.toMatch(/nouvel essai/i);
  });
});

describe('#1203 — bloc en erreur : neutre, poli, détail replié', () => {
  it('rend le message du barème, sans rouge, en role="status"', async () => {
    const kpi = await mountBloc(A);
    dispatchDataError(A, new Error('HTTP 503: Service Unavailable'), 'https://exemple.fr/api');
    await kpi.updateComplete;

    const bloc = kpi.querySelector('.dsfr-data-podium__error') as HTMLElement;
    expect(bloc).not.toBeNull();
    expect(bloc.getAttribute('role')).toBe('status');
    expect(bloc.hasAttribute('aria-live')).toBe(false);
    expect(bloc.dataset.cause).toBe('service-indisponible');
    expect(bloc.querySelector('.dsfr-data-status__title')!.textContent).toContain(
      'Données momentanément indisponibles'
    );
    // Neutre : le style en ligne l'emporte sur le rouge de la classe du composant.
    const style = bloc.getAttribute('style') ?? '';
    expect(style).toContain('--text-default-grey');
    expect(style).toContain('--background-alt-grey');
    expect(style).not.toMatch(/error|red/);
    expect(bloc.querySelector('.fr-icon-error-line')).toBeNull();
  });

  it('replie le code, l’adresse et l’heure dans « Détails techniques »', async () => {
    const kpi = await mountBloc(A);
    dispatchDataError(A, new Error('HTTP 503: Service Unavailable'), 'https://exemple.fr/api');
    await kpi.updateComplete;

    const details = kpi.querySelector('details') as HTMLDetailsElement;
    expect(details.hasAttribute('open')).toBe(false);
    expect(details.querySelector('summary')!.textContent).toBe('Détails techniques');
    const texte = details.textContent ?? '';
    expect(texte).toContain('Code HTTP : 503');
    expect(texte).toContain('HTTP 503: Service Unavailable');
    expect(texte).toContain('https://exemple.fr/api');
    expect(texte).toMatch(/Heure : \d{2}:\d{2}:\d{2}/);
  });

  it('sans bandeau : le bloc porte « Réessayer », un vrai bouton de 44 px', async () => {
    const kpi = await mountBloc(A);
    dispatchDataError(A, new Error('HTTP 503'));
    await kpi.updateComplete;

    const bouton = kpi.querySelector('button.dsfr-data-status__retry') as HTMLButtonElement;
    expect(bouton).not.toBeNull();
    expect(bouton.type).toBe('button');
    expect(bouton.classList.contains('fr-btn')).toBe(true);
    expect(bouton.textContent!.trim()).toBe('Réessayer');
    expect(bouton.getAttribute('style')).toContain('min-height: 2.75rem');
  });

  it('pas de « Réessayer » quand réessayer n’a pas de sens (404)', async () => {
    const kpi = await mountBloc(A);
    dispatchDataError(A, new Error('HTTP 404: Not Found'));
    await kpi.updateComplete;

    expect(kpi.querySelector('.dsfr-data-podium__error')!.textContent).toContain(
      'Ces données ne sont plus publiées à cette adresse'
    );
    expect(kpi.querySelector('button.dsfr-data-status__retry')).toBeNull();
  });

  it('l’erreur disparaît du registre dès que la source recharge ou livre', () => {
    dispatchDataError(A, new Error('HTTP 503'));
    expect(getDataErrorState(A)?.cause).toBe('service-indisponible');
    dispatchDataLoading(A);
    expect(getDataErrorState(A)).toBeUndefined();
    dispatchDataError(A, new Error('HTTP 503'));
    dispatchDataLoaded(A, []);
    expect(getDataErrorState(A)).toBeUndefined();
  });

  it('l’erreur de CONFIGURATION ne passe pas par le barème : inchangée', () => {
    const host = document.createElement('div');
    render(renderConfigError('dsfr-data-kpi', 'fonction inconnue'), host);
    const bloc = host.querySelector('.dsfr-data-kpi__error') as HTMLElement;
    expect(bloc.getAttribute('role')).toBe('alert');
    expect(bloc.getAttribute('aria-live')).toBe('assertive');
    expect(bloc.classList.contains('dsfr-data-status--config-error')).toBe(true);
    expect(bloc.textContent).toContain('Erreur de configuration : fonction inconnue');
    expect(bloc.hasAttribute('style')).toBe(false);
    expect(bloc.querySelector('button')).toBeNull();
    expect(bloc.querySelector('details')).toBeNull();
  });

  it('sans id de source, le bloc classe l’erreur seule et ne propose pas de relance', () => {
    const host = document.createElement('div');
    render(renderSourceError('dsfr-data-kpi', new Error('HTTP 503')), host);
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(host.querySelector('button')).toBeNull();
  });
});

describe('#1203 — bandeau : la panne dite une fois par source', () => {
  it('n’affiche rien sans panne, mais la région d’annonce existe déjà', async () => {
    const bandeau = await mountBanner(A);
    expect(bandeau.querySelector('[role="status"]')).not.toBeNull();
    expect(bandeau.querySelectorAll('.fr-alert').length).toBe(0);
  });

  it('un seul message pour la source, quel que soit le nombre de blocs et de relais', async () => {
    const bandeau = await mountBanner(A);
    const k1 = await mountBloc(A);
    const k2 = await mountBloc(A);
    const k3 = await mountBloc(Q);

    dispatchDataError(A, new Error('HTTP 503: Service Unavailable'));
    // Une query branchée sur A relaie l'erreur sous son propre id.
    dispatchDataError(Q, new Error('HTTP 503: Service Unavailable'), undefined, {
      relayedFrom: A,
    });
    await Promise.all([bandeau, k1, k2, k3].map((el) => (el as Updatable).updateComplete));

    const alertes = bandeau.querySelectorAll('.fr-alert');
    expect(alertes.length).toBe(1);
    expect((alertes[0] as HTMLElement).dataset.source).toBe(A);
    expect(alertes[0].textContent).toContain(
      'Une partie des chiffres de cette page est momentanément indisponible'
    );
    expect(bandeau.querySelectorAll('button.dsfr-data-source-status__retry').length).toBe(1);
    expect(getDataErrorState(Q)?.originId).toBe(A);
  });

  it('avec bandeau : les blocs de la source gardent le message, sans bouton ni annonce', async () => {
    const bandeau = await mountBanner(A);
    const kA = await mountBloc(A);
    const kQ = await mountBloc(Q);
    dispatchDataError(A, new Error('HTTP 503'));
    dispatchDataError(Q, new Error('HTTP 503'), undefined, { relayedFrom: A });
    await Promise.all([bandeau, kA, kQ].map((el) => (el as Updatable).updateComplete));

    for (const kpi of [kA, kQ]) {
      const bloc = kpi.querySelector('.dsfr-data-podium__error') as HTMLElement;
      expect(bloc.textContent).toContain('Données momentanément indisponibles');
      expect(bloc.hasAttribute('role')).toBe(false);
      expect(bloc.querySelector('button')).toBeNull();
      expect(bloc.querySelector('details')).not.toBeNull();
    }
    // Une seule région d'annonce pour cette panne : le bandeau.
    expect(document.querySelectorAll('[role="status"]').length).toBe(1);
  });

  it('les blocs d’une AUTRE source ne sont pas touchés', async () => {
    const bandeau = await mountBanner(A);
    const kB = await mountBloc(B);
    dispatchDataError(B, new Error('HTTP 503'));
    await Promise.all([bandeau, kB].map((el) => (el as Updatable).updateComplete));

    expect(bandeau.querySelectorAll('.fr-alert').length).toBe(0);
    const bloc = kB.querySelector('.dsfr-data-podium__error') as HTMLElement;
    expect(bloc.getAttribute('role')).toBe('status');
    expect(bloc.querySelector('button.dsfr-data-status__retry')).not.toBeNull();
  });

  it('sans attribut source : un message par source en panne', async () => {
    const bandeau = await mountBanner();
    dispatchDataError(A, new Error('HTTP 503'));
    dispatchDataError(B, new Error('HTTP 404'));
    await bandeau.updateComplete;

    const alertes = [...bandeau.querySelectorAll<HTMLElement>('.fr-alert')];
    expect(alertes.map((a) => a.dataset.source)).toEqual([A, B]);
    // 404 : pas de relance proposée.
    expect(alertes[1].querySelector('button')).toBeNull();
    expect(isSourceCoveredByBanner(B)).toBe(true);
  });

  it('monté APRÈS la panne, le bandeau la lit au registre et reprend le bouton du bloc', async () => {
    const kpi = await mountBloc(A);
    dispatchDataError(A, new Error('HTTP 503'));
    await kpi.updateComplete;
    expect(kpi.querySelector('button.dsfr-data-status__retry')).not.toBeNull();

    const bandeau = await mountBanner(A);
    await kpi.updateComplete;
    expect(bandeau.querySelectorAll('.fr-alert').length).toBe(1);
    expect(kpi.querySelector('button.dsfr-data-status__retry')).toBeNull();

    // Le bandeau retiré, le bloc reprend sa relance.
    bandeau.remove();
    await kpi.updateComplete;
    expect(isSourceCoveredByBanner(A)).toBe(false);
    expect(kpi.querySelector('button.dsfr-data-status__retry')).not.toBeNull();
  });

  it('le message reste pendant le nouvel essai, puis s’efface au retour des données', async () => {
    const bandeau = await mountBanner(A);
    dispatchDataError(A, new Error('HTTP 503'));
    await bandeau.updateComplete;

    dispatchDataLoading(A);
    await bandeau.updateComplete;
    const bouton = bandeau.querySelector('button') as HTMLButtonElement;
    expect(bouton.getAttribute('aria-disabled')).toBe('true');
    expect(bouton.textContent).toContain('Nouvel essai en cours');

    dispatchDataLoaded(A, [{ n: 1 }]);
    await bandeau.updateComplete;
    expect(bandeau.querySelectorAll('.fr-alert').length).toBe(0);
  });
});

describe('#1203 — relance', () => {
  it('« Réessayer » du bloc relance la source d’ORIGINE, pas le relais', async () => {
    const kQ = await mountBloc(Q);
    dispatchDataError(A, new Error('HTTP 503'));
    dispatchDataError(Q, new Error('HTTP 503'), undefined, { relayedFrom: A });
    await kQ.updateComplete;

    const { commands, stop } = captureCommands();
    (kQ.querySelector('button.dsfr-data-status__retry') as HTMLButtonElement).click();
    stop();
    expect(commands).toEqual([{ sourceId: A, reload: true }]);
  });

  it('« Réessayer » du bandeau émet la même commande, une fois', async () => {
    const bandeau = await mountBanner(A);
    dispatchDataError(A, new Error('HTTP 503'));
    await bandeau.updateComplete;

    const { commands, stop } = captureCommands();
    (bandeau.querySelector('button') as HTMLButtonElement).click();
    stop();
    expect(commands).toEqual([{ sourceId: A, reload: true }]);
  });

  it('la source sert la commande reload dans tous les modes, URL brute comprise', () => {
    const source = new DsfrDataSource();
    source.id = A;
    source.url = 'https://exemple.fr/data.json';
    const fetchSpy = vi
      .spyOn(source as unknown as { _fetchData: () => Promise<void> }, '_fetchData')
      .mockResolvedValue();
    document.body.appendChild(source);

    dispatchSourceCommand(A, { reload: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Une commande adressée à une autre source ne la concerne pas.
    dispatchSourceCommand(B, { reload: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  describe('automatique, au retour du réseau', () => {
    function sourceEnErreur(error: Error): {
      source: DsfrDataSource;
      reload: ReturnType<typeof vi.spyOn>;
    } {
      const source = new DsfrDataSource();
      source.id = A;
      source.url = 'https://exemple.fr/data.json';
      vi.spyOn(
        source as unknown as { _fetchData: () => Promise<void> },
        '_fetchData'
      ).mockResolvedValue();
      document.body.appendChild(source);
      (source as unknown as { _error: Error | null })._error = error;
      dispatchDataError(A, error);
      const reload = vi.spyOn(source, 'reload');
      return { source, reload };
    }

    it('relance UNE fois après un échec hors connexion', () => {
      setOnline(false);
      const { reload } = sourceEnErreur(typeError());
      expect(getDataErrorState(A)?.cause).toBe('hors-connexion');

      setOnline(true);
      window.dispatchEvent(new Event('online'));
      expect(reload).toHaveBeenCalledTimes(1);

      // La relance est partie : l'état d'erreur est levé, un second retour ne relance rien.
      dispatchDataLoading(A);
      window.dispatchEvent(new Event('online'));
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('ne relance JAMAIS sur un 429', () => {
      const { reload } = sourceEnErreur(new Error('HTTP 429: Too Many Requests'));
      window.dispatchEvent(new Event('online'));
      expect(reload).not.toHaveBeenCalled();
    });

    it('ne relance ni sur une panne du service ni sur une réponse bloquée', () => {
      const { reload, source } = sourceEnErreur(new Error('HTTP 503'));
      window.dispatchEvent(new Event('online'));
      expect(reload).not.toHaveBeenCalled();

      setOnline(true);
      (source as unknown as { _error: Error | null })._error = typeError();
      dispatchDataError(A, typeError());
      expect(getDataErrorState(A)?.cause).toBe('reponse-bloquee');
      window.dispatchEvent(new Event('online'));
      expect(reload).not.toHaveBeenCalled();
    });

    it('une source retirée de la page n’écoute plus le réseau', () => {
      setOnline(false);
      const { reload, source } = sourceEnErreur(typeError());
      source.remove();
      // Le retrait purge le cache de l'id : on repose l'état pour isoler l'écoute.
      dispatchDataError(A, typeError());
      window.dispatchEvent(new Event('online'));
      expect(reload).not.toHaveBeenCalled();
    });
  });
});

describe('#1203 — error-message et contrat de l’erreur', () => {
  async function echec(errorMessage: string): Promise<{
    events: DataErrorEvent[];
    consoleError: ReturnType<typeof vi.spyOn>;
  }> {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers(),
        json: async () => ({}),
        text: async () => '',
      })
    );
    const events: DataErrorEvent[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent<DataErrorEvent>).detail);
    document.addEventListener(DATA_EVENTS.ERROR, handler);

    const source = new DsfrDataSource();
    source.id = A;
    source.url = 'https://exemple.fr/data.json';
    source.errorMessage = errorMessage;
    await (source as unknown as { _fetchData: () => Promise<void> })._fetchData();
    document.removeEventListener(DATA_EVENTS.ERROR, handler);
    return { events, consoleError };
  }

  it('remplace la phrase usager, dans le bloc comme dans le bandeau', async () => {
    const kpi = await mountBloc(A);
    const autre = await mountBloc(B);
    await echec('Les chiffres de la DGFiP sont en cours de mise à jour.');
    await kpi.updateComplete;

    const bloc = kpi.querySelector('.dsfr-data-podium__error') as HTMLElement;
    expect(bloc.querySelector('.dsfr-data-status__title')!.textContent).toContain(
      'Les chiffres de la DGFiP sont en cours de mise à jour.'
    );
    expect(bloc.textContent).not.toContain('Données momentanément indisponibles');
    // Le détail technique reste replié, et complet.
    const details = bloc.querySelector('details') as HTMLDetailsElement;
    expect(details.hasAttribute('open')).toBe(false);
    expect(details.textContent).toContain('Code HTTP : 503');

    const bandeau = await mountBanner(A);
    expect(bandeau.querySelector('.dsfr-data-source-status__text')!.textContent).toContain(
      'Les chiffres de la DGFiP sont en cours de mise à jour.'
    );
    expect(autre.querySelector('.dsfr-data-podium__error')).toBeNull();
  });

  it('sans error-message, la phrase est celle du barème', async () => {
    const kpi = await mountBloc(A);
    await echec('');
    await kpi.updateComplete;
    expect(getDataErrorState(A)?.userMessage).toBeUndefined();
    expect(kpi.querySelector('.dsfr-data-status__title')!.textContent).toContain(
      'Données momentanément indisponibles'
    );
  });

  it('dsfr-data-error est toujours émis, avec le code HTTP dans error.message, et en console', async () => {
    const { events, consoleError } = await echec('Phrase de l’intégrateur');

    expect(events.length).toBe(1);
    expect(events[0].sourceId).toBe(A);
    expect(events[0].error).toBeInstanceOf(Error);
    expect(events[0].error.message).toContain('HTTP 503');
    expect(events[0].error.message).not.toContain('Phrase de l’intégrateur');
    // Le détail de l'événement ne gagne aucune clé.
    expect(Object.keys(events[0]).sort()).toEqual(['attemptedUrl', 'error', 'sourceId']);
    expect(consoleError).toHaveBeenCalled();
    expect(String(consoleError.mock.calls[0][0])).toContain('Erreur de chargement');
  });

  it('le détail de dsfr-data-error reste { sourceId, error } pour une erreur sans adresse', () => {
    const events: DataErrorEvent[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent<DataErrorEvent>).detail);
    document.addEventListener(DATA_EVENTS.ERROR, handler);
    const error = new Error('HTTP 503');
    dispatchDataError(Q, error, undefined, { relayedFrom: A, userMessage: 'phrase' });
    document.removeEventListener(DATA_EVENTS.ERROR, handler);
    expect(events).toEqual([{ sourceId: Q, error }]);
  });
});

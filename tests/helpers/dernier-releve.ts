/**
 * Aides communes aux tests du dernier relevé (#1288, proposition B) — un fichier
 * de tests par lot : la règle et le socle (`dernier-releve.test.ts`), le KPI et
 * le graphique, les listes et le tableau équivalent, la carte.
 */
import { afterEach, beforeEach, vi, type Mock } from 'vitest';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataError,
  dispatchDataLoaded,
  type SourceCommandEvent,
} from '@/utils/data-bridge.js';
import type { DsfrDataSource } from '@/components/dsfr-data-source.js';

/** Une commande telle que la reçoit un abonné : sans l'id de la source visée. */
export type Commande = Omit<SourceCommandEvent, 'sourceId'>;

export const E503 = (): Error => new Error('HTTP 503: Service Unavailable');
export const E404 = (): Error => new Error('HTTP 404: Not Found');
export const E403 = (): Error => new Error('HTTP 403: Forbidden');
export const E400 = (): Error => new Error('HTTP 400: Bad Request');
export const E429 = (): Error => new Error('HTTP 429: Too Many Requests');

/** Mardi 13 octobre 2026, 14 h 32 min 07 s, heure LOCALE : le relevé. */
export const RELEVE = new Date(2026, 9, 13, 14, 32, 7).getTime();
export const MINUTE = 60_000;

/** Texte rendu d'un nœud, espaces ramenés à un seul et collés à la ponctuation, hors `<style>`. */
export function texte(el: Element | null): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('style').forEach((s) => s.remove());
  return (clone.textContent ?? '')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,])/g, '$1')
    .trim();
}

/** Nom accessible d'une figure, espaces insécables des nombres ramenés à l'espace. */
export function nom(el: Element): string {
  return (el.getAttribute('aria-label') ?? '').replace(/[\u202f\u00a0]/g, ' ');
}

const SOURCES: string[] = [];
/** Un id de source par test : le registre d'erreur est global. */
export function source(nomDeSource: string): string {
  const id = `b1288-${nomDeSource}-${SOURCES.length}`;
  SOURCES.push(id);
  return id;
}

/** La source livre : les lignes sont datées de l'horloge du test. */
export function charge(src: string, rows: unknown, key = 'q1'): void {
  dispatchDataLoaded(src, rows, { requestKey: key });
}

/** La source échoue, avec la consigne `stale-if-error` et l'empreinte de l'appel. */
export function panne(
  src: string,
  options: { erreur?: Error; consigne?: number | null; key?: string; message?: string } = {}
): Error {
  const erreur = options.erreur ?? E503();
  const consigne = options.consigne === undefined ? 3600 : options.consigne;
  dispatchDataError(src, erreur, undefined, {
    ...(consigne !== null ? { staleIfError: consigne } : {}),
    requestKey: options.key ?? 'q1',
    ...(options.message ? { userMessage: options.message } : {}),
  });
  return erreur;
}

/**
 * Horloge fixée au relevé avant chaque test (`Date` et minuteries, pas
 * `requestAnimationFrame` : la liste annonce par lui), ménage après.
 */
export function horlogeDuReleve(mockFetch?: Mock): void {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(RELEVE);
  });

  afterEach(() => {
    document.body.replaceChildren();
    for (const id of SOURCES.splice(0)) {
      clearDataCache(id);
      clearDataMeta(id);
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mockFetch?.mockReset();
  });
}

// --- Une vraie source, sur un faux réseau ---------------------------------------

export const reponseOk = (rows: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(rows),
    headers: new Headers({ 'content-type': 'application/json' }),
  });

export const reponseKo = (status: number) =>
  Promise.resolve({
    ok: false,
    status,
    statusText: 'Erreur',
    body: null,
    headers: new Headers(),
  });

/** Laisse passer les micro-tâches et le `setTimeout(0)` de la source. */
export async function tourner(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await vi.advanceTimersByTimeAsync(1);
  }
}

export async function mountSource(
  id: string,
  attrs: Record<string, string>
): Promise<DsfrDataSource> {
  const el = document.createElement('dsfr-data-source') as DsfrDataSource;
  el.id = id;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  await tourner();
  return el;
}

/**
 * Types and data fetching for widget monitoring.
 */

import { PROXY_BASE_URL } from '@dsfr-data/shared';

export interface MonitoringEntry {
  referer: string;
  component: string;
  chartType: string | null;
  firstSeen: string;
  lastSeen: string;
  callCount: number;
}

export interface MonitoringSummary {
  totalSites: number;
  totalComponents: number;
  byComponent: Record<string, number>;
  byChartType: Record<string, number>;
}

export interface MonitoringData {
  generated: string;
  entries: MonitoringEntry[];
  summary: MonitoringSummary;
}

const DATA_URL = `${PROXY_BASE_URL}/public/monitoring-data.json`;
const REFRESH_URL = `${PROXY_BASE_URL}/api/refresh-monitoring`;
const API_DATA_URL = '/api/monitoring/data';

function isDbMode(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as Window & { __gwDbMode?: boolean }).__gwDbMode === true
  );
}

export async function fetchMonitoringData(): Promise<MonitoringData> {
  if (isDbMode()) {
    const response = await fetch(`${API_DATA_URL}?_=${Date.now()}`, {
      cache: 'no-cache',
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  const response = await fetch(`${DATA_URL}?_=${Date.now()}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('json')) {
    throw new Error(
      `Le fichier monitoring-data.json n'existe pas encore sur le serveur (reponse ${ct || 'text/html'}). Lancez scripts/parse-beacon-logs.js pour le generer.`
    );
  }
  return response.json();
}

/** Trigger server-side log parsing, then wait for it to complete */
export async function triggerRefresh(): Promise<void> {
  if (isDbMode()) return; // In DB mode, data is stored in SQLite — no log parsing needed
  await fetch(REFRESH_URL, { mode: 'no-cors' }).catch(() => {});
  // Wait for the entrypoint to detect the trigger and run the parser (~3s max)
  await new Promise((r) => setTimeout(r, 4000));
}

/** Decode a possibly percent-encoded URL (e.g. https%3A%2F%2F… → https://…) */
export function decodeUrl(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

/** Check if a URL is a real HTTP(S) origin (not file://, null, srcdoc, etc.) */
export function isRealOrigin(url: string): boolean {
  const decoded = decodeUrl(url);
  try {
    const u = new URL(decoded);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Extract domain from a full URL */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    // URL may be percent-encoded — decode and retry
    try {
      return new URL(decodeUrl(url)).hostname;
    } catch {
      /* */
    }
    return url;
  }
}

/** Extract path from a full URL */
export function extractPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    try {
      return new URL(decodeUrl(url)).pathname;
    } catch {
      /* */
    }
    return url;
  }
}

/** Mock data for development */
export function getMockData(): MonitoringData {
  return {
    generated: new Date().toISOString(),
    entries: [
      {
        referer: 'https://ministere-interieur.gouv.fr/stats/tableau-de-bord',
        component: 'dsfr-data-chart',
        chartType: 'bar',
        firstSeen: '2026-01-15T10:23:45Z',
        lastSeen: '2026-02-07T08:12:33Z',
        callCount: 1247,
      },
      {
        referer: 'https://ministere-interieur.gouv.fr/stats/tableau-de-bord',
        component: 'dsfr-data-kpi',
        chartType: null,
        firstSeen: '2026-01-15T10:23:45Z',
        lastSeen: '2026-02-07T08:12:33Z',
        callCount: 1245,
      },
      {
        referer: 'https://education.gouv.fr/donnees/indicateurs',
        component: 'dsfr-data-chart',
        chartType: 'line',
        firstSeen: '2026-01-20T14:05:12Z',
        lastSeen: '2026-02-06T22:45:01Z',
        callCount: 892,
      },
      {
        referer: 'https://education.gouv.fr/donnees/indicateurs',
        component: 'dsfr-data-list',
        chartType: null,
        firstSeen: '2026-01-22T09:15:00Z',
        lastSeen: '2026-02-06T22:45:01Z',
        callCount: 654,
      },
      {
        referer: 'https://sante.gouv.fr/open-data/dashboard',
        component: 'dsfr-data-chart',
        chartType: 'pie',
        firstSeen: '2026-01-25T16:30:00Z',
        lastSeen: '2026-02-07T07:00:00Z',
        callCount: 423,
      },
      {
        referer: 'https://sante.gouv.fr/open-data/dashboard',
        component: 'dsfr-data-chart',
        chartType: 'bar',
        firstSeen: '2026-01-25T16:30:00Z',
        lastSeen: '2026-02-07T07:00:00Z',
        callCount: 418,
      },
      {
        referer: 'https://ecologie.gouv.fr/observatoire/emissions',
        component: 'dsfr-data-chart',
        chartType: 'scatter',
        firstSeen: '2026-02-01T11:00:00Z',
        lastSeen: '2026-02-07T06:30:00Z',
        callCount: 156,
      },
      {
        referer: 'https://ecologie.gouv.fr/observatoire/emissions',
        component: 'dsfr-data-source',
        chartType: null,
        firstSeen: '2026-02-01T11:00:00Z',
        lastSeen: '2026-02-07T06:30:00Z',
        callCount: 312,
      },
    ],
    summary: {
      totalSites: 4,
      totalComponents: 8,
      byComponent: {
        'dsfr-data-chart': 4,
        'dsfr-data-kpi': 1,
        'dsfr-data-list': 1,
        'dsfr-data-source': 1,
        'dsfr-data-query': 1,
      },
      byChartType: {
        bar: 2,
        line: 1,
        pie: 1,
        scatter: 1,
      },
    },
  };
}

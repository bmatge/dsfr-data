/**
 * Grist Bridge - Pont entre l'API Grist et le data-bridge dsfr-data
 *
 * Utilise le global DsfrData (UMD) pour dispatcher les evenements
 * compatibles avec le systeme dsfr-data-loaded / dsfr-data-error.
 */

export const GRIST_SOURCE_ID = 'grist';

let gristApiBaseUrl: string | null = null;
let gristTableId: string | null = null;
let gristColumnMappings: Record<string, string> | null = null;

/**
 * Detecte l'URL API Grist et le table ID (fire-and-forget).
 * Essaie getAccessToken puis fallback sur document.referrer.
 * Essaie selectedTable puis getTable() pour le table ID.
 */
export function detectGristApi(): void {
  // 1. Detect API base URL via getAccessToken (requires 'full' access)
  try {
    if (typeof grist.docApi?.getAccessToken === 'function') {
      grist.docApi
        .getAccessToken({ readOnly: true })
        .then((info) => {
          gristApiBaseUrl = info.baseUrl;
        })
        .catch(() => {
          detectBaseUrlFromReferrer();
        });
    } else {
      detectBaseUrlFromReferrer();
    }
  } catch {
    detectBaseUrlFromReferrer();
  }

  // 2. Detect table ID
  try {
    const table = grist.selectedTable ?? grist.getTable();
    if (table && typeof table.getTableId === 'function') {
      table
        .getTableId()
        .then((id) => {
          gristTableId = id;
        })
        .catch(() => {});
    }
  } catch {
    /* getTable() not available */
  }
}

/**
 * Fallback : parse l'URL API depuis document.referrer.
 * Page URL: https://HOST/o/ORG/DOC_ID/slug/p/N
 * API URL:  https://HOST/o/ORG/api/docs/DOC_ID
 */
function detectBaseUrlFromReferrer(): void {
  try {
    const referrer = document.referrer;
    if (!referrer) return;
    const url = new URL(referrer);
    const match = url.pathname.match(/^(\/o\/[^/]+)\/([^/]+)/);
    if (match) {
      gristApiBaseUrl = `${url.origin}${match[1]}/api/docs/${match[2]}`;
    }
  } catch {
    /* parsing failed */
  }
}

/**
 * Retourne les infos API Grist detectees (baseUrl, tableId, mappings colonnes).
 */
export function getGristApiInfo(): {
  apiBaseUrl: string | null;
  tableId: string | null;
  columnMappings: Record<string, string> | null;
} {
  return {
    apiBaseUrl: gristApiBaseUrl,
    tableId: gristTableId,
    columnMappings: gristColumnMappings,
  };
}

/**
 * Initialise le pont Grist -> data-bridge.
 *
 * @param columns - Colonnes attendues (definies par le widget)
 * @param options - Options supplementaires pour grist.ready()
 */
export function initGristBridge(
  columns: GristColumnDef[],
  options?: {
    onEditOptions?: () => void;
  }
): void {
  grist.ready({
    columns,
    requiredAccess: 'full',
    onEditOptions: options?.onEditOptions,
  });

  detectGristApi();
  DsfrData.dispatchDataLoading(GRIST_SOURCE_ID);

  grist.onRecords((records, mappings) => {
    if (mappings) {
      gristColumnMappings = mappings as Record<string, string>;
    }
    const mapped = grist.mapColumnNames(records, mappings);
    if (!mapped) {
      DsfrData.dispatchDataError(
        GRIST_SOURCE_ID,
        new Error('Colonnes non mappees. Configurez le mapping dans les options du widget Grist.')
      );
      return;
    }
    DsfrData.dispatchDataLoaded(GRIST_SOURCE_ID, mapped);
  });
}

/**
 * Charge les options sauvegardees et ecoute les changements.
 */
export function onGristOptions(callback: (options: Record<string, unknown>) => void): void {
  grist.onOptions((opts) => {
    if (opts) {
      callback(opts);
    }
  });
}

/**
 * Sauvegarde une option dans le stockage Grist.
 */
export function saveGristOption(key: string, value: unknown): void {
  grist.setOption(key, value);
}

/**
 * Sauvegarde plusieurs options dans le stockage Grist.
 */
export function saveGristOptions(options: Record<string, unknown>): void {
  grist.setOptions(options);
}

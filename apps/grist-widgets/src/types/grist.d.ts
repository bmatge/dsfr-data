/**
 * Type declarations for the Grist Plugin API
 * Loaded via <script src="https://docs.getgrist.com/grist-plugin-api.js">
 * Exposes a global `grist` object.
 */

interface GristColumnDef {
  name: string;
  title?: string;
  type?: 'Text' | 'Numeric' | 'Int' | 'Bool' | 'Date' | 'DateTime' | 'Any';
  optional?: boolean;
  allowMultiple?: boolean;
}

interface GristReadyOptions {
  columns?: GristColumnDef[];
  requiredAccess?: 'none' | 'read table' | 'full';
  allowSelectBy?: boolean;
  onEditOptions?: () => void;
}

interface GristRecord {
  id: number;
  [key: string]: unknown;
}

interface GristColumnMappings {
  [widgetColName: string]: string | string[];
}

interface GristApi {
  ready(options?: GristReadyOptions): void;
  onRecords(callback: (records: GristRecord[], mappings: GristColumnMappings) => void): void;
  onRecord(callback: (record: GristRecord, mappings: GristColumnMappings) => void): void;
  onOptions(callback: (options: Record<string, unknown> | null) => void): void;
  setOption(key: string, value: unknown): Promise<void>;
  setOptions(options: Record<string, unknown>): Promise<void>;
  getOption(key: string): Promise<unknown>;
  getOptions(): Promise<Record<string, unknown> | null>;
  mapColumnNames(records: GristRecord[], mappings?: GristColumnMappings): Record<string, unknown>[] | null;
  mapColumnNamesBack(record: Record<string, unknown>, mappings?: GristColumnMappings): Record<string, unknown>;
  getTable(): GristTableApi;
  on(event: string, callback: (...args: unknown[]) => void): void;
  onNewRecord(callback: (record: GristRecord) => void): void;
  selectedTable: GristTableApi | null;
  docApi: GristDocApi;
}

interface GristTableApi {
  getTableId(): Promise<string>;
  getRecords(options?: { filters?: Record<string, unknown[]> }): Promise<GristRecord[]>;
  create(records: Record<string, unknown>): Promise<number[]>;
  update(records: Record<string, unknown>): Promise<void>;
  destroy(rowIds: number[]): Promise<void>;
}

interface GristDocApi {
  getDocName(): Promise<string>;
  listTables(): Promise<string[]>;
  fetchTable(tableId: string): Promise<Record<string, unknown[]>>;
  getAccessToken(options: { readOnly: boolean }): Promise<{ baseUrl: string; token: string; ttl: number }>;
}

declare const grist: GristApi;

/**
 * Type declarations for the dsfr-data UMD bundle.
 * Loaded via <script src="dsfr-data.umd.js">, exposes DsfrData global.
 */
interface DsfrDataApi {
  dispatchDataLoaded(sourceId: string, data: unknown): void;
  dispatchDataError(sourceId: string, error: Error): void;
  dispatchDataLoading(sourceId: string): void;
  getDataCache(sourceId: string): unknown | undefined;
  subscribeToSource(sourceId: string, callbacks: {
    onLoaded?: (data: unknown) => void;
    onError?: (error: Error) => void;
    onLoading?: () => void;
  }): () => void;
  DATA_EVENTS: {
    LOADED: 'dsfr-data-loaded';
    ERROR: 'dsfr-data-error';
    LOADING: 'dsfr-data-loading';
  };
}

declare const DsfrData: DsfrDataApi;

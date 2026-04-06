import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  loadFromStorage,
  STORAGE_KEYS,
  getProxyUrl,
  buildGristHeaders,
  detectProvider,
  extractResourceIds,
} from '@dsfr-data/shared';
import type { Source } from '@dsfr-data/shared';
import { SavedSourceSelector } from '../nodes/base-node.js';

// ---------------------------------------------------------------------------
// Connection types (lightweight — avoids coupling with sources app)
// ---------------------------------------------------------------------------

interface GristConnection {
  id: string;
  type: 'grist';
  name: string;
  url: string;
  apiKey: string | null;
  isPublic: boolean;
  status: string;
  statusText: string;
}

interface ApiConnection {
  id: string;
  type: 'api';
  name: string;
  apiUrl: string;
  method: string;
  headers: string | null;
  dataPath: string | null;
  status: string;
  statusText: string;
}

type Connection = (GristConnection | ApiConnection) & Record<string, unknown>;

interface GristDoc {
  id: string;
  name: string;
}

interface GristTable {
  id: string;
}

// ---------------------------------------------------------------------------
// Normalize connections from backend (config_json merge)
// ---------------------------------------------------------------------------

function normalizeConnection(conn: Connection): Connection {
  const raw = conn as Record<string, unknown>;
  const n = { ...raw };

  // Unpack config_json (from backend sync)
  const configJson = raw.config_json;
  if (configJson && typeof configJson === 'object') {
    const c = configJson as Record<string, unknown>;
    if (c.url && !n.url) n.url = c.url;
    if (c.apiKey !== undefined && n.apiKey === undefined) n.apiKey = c.apiKey;
    if (c.isPublic !== undefined && n.isPublic === undefined) n.isPublic = c.isPublic;
    if (c.apiUrl && !n.apiUrl) n.apiUrl = c.apiUrl;
    if (c.method && !n.method) n.method = c.method;
    if (c.headers !== undefined && n.headers === undefined) n.headers = c.headers;
    if (c.dataPath !== undefined && n.dataPath === undefined) n.dataPath = c.dataPath;
    if (c.url && n.type === 'api') n.type = 'grist';
  }

  // Fallback: api_key_encrypted → apiKey (backend stores decrypted key in this field)
  if (!n.apiKey && n.api_key_encrypted && typeof n.api_key_encrypted === 'string') {
    const key = n.api_key_encrypted as string;
    // Skip masked keys (****xxxx)
    if (!key.startsWith('*')) {
      n.apiKey = key;
    }
  }

  return n as Connection;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@customElement('saved-source-control')
export class SavedSourceControlElement extends LitElement {
  @property({ type: Object }) ctrl!: SavedSourceSelector;
  @state() private _sources: Source[] = [];
  @state() private _connections: Connection[] = [];

  // Grist explorer state
  @state() private _gristDocs: GristDoc[] = [];
  @state() private _gristTables: GristTable[] = [];
  @state() private _gristLoading = '';
  @state() private _gristError = '';
  @state() private _selectedDoc = '';
  @state() private _selectedTable = '';

  /** The connection currently selected (if any) */
  private _selectedConnection: Connection | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this._loadData();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('ctrl') && this.ctrl) {
      this.ctrl.onChange = () => this.requestUpdate();
    }
  }

  // ========== Data loading ==========

  private _loadData() {
    try {
      const rawSources = loadFromStorage(STORAGE_KEYS.SOURCES, []);
      this._sources = Array.isArray(rawSources) ? (rawSources as Source[]) : [];
    } catch {
      this._sources = [];
    }
    try {
      const rawConns = loadFromStorage(STORAGE_KEYS.CONNECTIONS, []);
      const conns = Array.isArray(rawConns) ? (rawConns as Connection[]) : [];
      this._connections = conns.map(normalizeConnection);
    } catch {
      this._connections = [];
    }
  }

  // ========== Selection ==========

  private _onSelect(e: Event) {
    e.stopPropagation();
    const value = (e.target as HTMLSelectElement).value;
    this.ctrl.value = value;

    // Reset Grist explorer
    this._resetGrist();
    this._selectedConnection = null;

    if (!value) {
      this.ctrl.onSourceSelected?.(null);
      return;
    }

    // Check if it's a source
    const source = this._sources.find((s) => s.id === value);
    if (source) {
      this.ctrl.onSourceSelected?.(source);
      return;
    }

    // Check if it's a connection (prefixed with conn:)
    if (value.startsWith('conn:')) {
      const connId = value.slice(5);
      const conn = this._connections.find((c) => c.id === connId);
      if (!conn) return;
      this._selectedConnection = conn;

      if (conn.type === 'grist') {
        const gristConn = conn as GristConnection;
        // Warn if API key seems missing for a non-public connection
        if (!gristConn.isPublic && !gristConn.apiKey) {
          this._gristError = 'Cle API manquante — re-configurez la connexion dans Sources';
          return;
        }
        // Grist connection: emit partial info + start loading documents
        this.ctrl.onSourceSelected?.({
          _isConnection: true,
          type: 'grist',
          provider: 'grist',
          apiUrl: gristConn.url,
        });
        this._loadGristDocs(gristConn);
      } else {
        // API connection: detect provider and extract resource IDs
        const apiConn = conn as ApiConnection;
        const provider = detectProvider(apiConn.apiUrl);
        const resourceIds = extractResourceIds(apiConn.apiUrl, provider) || {};
        let baseUrl: string;
        try {
          baseUrl = new URL(apiConn.apiUrl).origin;
        } catch {
          baseUrl = apiConn.apiUrl;
        }
        this.ctrl.onSourceSelected?.({
          _isConnection: true,
          type: 'api',
          provider: provider.id,
          apiUrl: apiConn.apiUrl,
          resourceIds,
          baseUrl,
        });
      }
    }
  }

  // ========== Grist Explorer ==========

  private _resetGrist() {
    this._gristDocs = [];
    this._gristTables = [];
    this._gristLoading = '';
    this._gristError = '';
    this._selectedDoc = '';
    this._selectedTable = '';
  }

  private async _gristFetch(conn: GristConnection, endpoint: string): Promise<unknown> {
    const proxyUrl = getProxyUrl(conn.url, endpoint);
    const apiKey = conn.isPublic ? null : conn.apiKey;
    const response = await fetch(proxyUrl, {
      headers: buildGristHeaders(apiKey),
      redirect: 'manual',
    });
    // Redirect responses (3xx) = likely auth issue (Grist redirects to login page)
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw new Error('Redirection detectee — verifiez la cle API de la connexion');
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  private async _loadGristDocs(conn: GristConnection) {
    this._gristLoading = 'Chargement des documents...';
    this._gristError = '';
    this._gristDocs = [];
    this._gristTables = [];

    try {
      const orgs = (await this._gristFetch(conn, '/orgs')) as { id: number; name: string }[];
      const docs: GristDoc[] = [];

      for (const org of orgs) {
        const workspaces = (await this._gristFetch(conn, `/orgs/${org.id}/workspaces`)) as {
          id: number;
          name: string;
          docs: { id: string; name: string }[];
        }[];
        for (const ws of workspaces) {
          for (const doc of ws.docs || []) {
            docs.push({ id: doc.id, name: `${org.name} / ${ws.name} / ${doc.name}` });
          }
        }
      }

      this._gristDocs = docs;
      this._gristLoading = '';
    } catch (err) {
      this._gristLoading = '';
      this._gristError = `Erreur : ${(err as Error).message}`;
    }
  }

  private async _onDocSelect(e: Event) {
    e.stopPropagation();
    const docId = (e.target as HTMLSelectElement).value;
    this._selectedDoc = docId;
    this._selectedTable = '';
    this._gristTables = [];

    if (!docId || !this._selectedConnection) return;

    const conn = this._selectedConnection as GristConnection;
    this._gristLoading = 'Chargement des tables...';
    this._gristError = '';

    try {
      const result = (await this._gristFetch(conn, `/docs/${docId}/tables`)) as {
        tables: { id: string }[];
      };
      this._gristTables = result.tables || [];
      this._gristLoading = '';
    } catch (err) {
      this._gristLoading = '';
      this._gristError = `Erreur : ${(err as Error).message}`;
    }
  }

  private _onTableSelect(e: Event) {
    e.stopPropagation();
    const tableId = (e.target as HTMLSelectElement).value;
    this._selectedTable = tableId;

    if (!tableId || !this._selectedDoc || !this._selectedConnection) return;

    const conn = this._selectedConnection as GristConnection;
    // Emit full Grist source info
    this.ctrl.onSourceSelected?.({
      _isConnection: true,
      type: 'grist',
      provider: 'grist',
      apiUrl: conn.url,
      documentId: this._selectedDoc,
      tableId,
      apiKey: conn.isPublic ? null : conn.apiKey,
      isPublic: conn.isPublic,
    });
  }

  // ========== Stop event propagation ==========

  private _stop(e: Event) {
    e.stopPropagation();
  }

  // ========== Rendering ==========

  private _isGristSelected() {
    return this._selectedConnection?.type === 'grist';
  }

  private _renderGristExplorer() {
    if (!this._isGristSelected()) return nothing;

    return html`
      <div
        style="margin-top:4px;padding:4px 6px;background:#f5f5f5;border-radius:3px;font-size:0.7rem"
      >
        ${this._gristError
          ? html`<div style="color:#ce0500;margin-bottom:4px">${this._gristError}</div>`
          : nothing}
        ${this._gristLoading
          ? html`<div style="color:#666;margin-bottom:4px">${this._gristLoading}</div>`
          : nothing}
        ${this._gristDocs.length > 0
          ? html`
              <label class="attr-label" style="font-size:0.7rem">Document</label>
              <select
                class="attr-input"
                style="font-size:0.7rem;margin-bottom:4px"
                .value=${this._selectedDoc}
                @change=${this._onDocSelect}
                @pointerdown=${this._stop}
              >
                <option value="">-- Choisir un document --</option>
                ${this._gristDocs.map(
                  (d) => html`
                    <option value=${d.id} ?selected=${this._selectedDoc === d.id}>${d.name}</option>
                  `
                )}
              </select>
            `
          : nothing}
        ${this._gristTables.length > 0
          ? html`
              <label class="attr-label" style="font-size:0.7rem">Table</label>
              <select
                class="attr-input"
                style="font-size:0.7rem"
                .value=${this._selectedTable}
                @change=${this._onTableSelect}
                @pointerdown=${this._stop}
              >
                <option value="">-- Choisir une table --</option>
                ${this._gristTables.map(
                  (t) => html`
                    <option value=${t.id} ?selected=${this._selectedTable === t.id}>${t.id}</option>
                  `
                )}
              </select>
            `
          : nothing}
      </div>
    `;
  }

  private _getSelectedLabel(): string {
    const v = this.ctrl.value;
    if (!v) return '';
    const src = this._sources.find((s) => s.id === v);
    if (src) return src.name;
    if (v.startsWith('conn:')) {
      const conn = this._connections.find((c) => c.id === v.slice(5));
      return conn?.name ?? v;
    }
    return v;
  }

  render() {
    if (!this.ctrl) return nothing;

    const hasConnections = this._connections.length > 0;

    return html`
      <div class="attr-field">
        <label class="attr-label" style="color:#000091;font-weight:700">Source / Connexion</label>
        <select
          class="attr-input"
          style="border-color:#000091"
          .value=${this.ctrl.value}
          @change=${this._onSelect}
          @pointerdown=${this._stop}
        >
          <option value="">-- Configuration manuelle --</option>
          ${this._sources.length > 0
            ? html`
                <optgroup label="Sources enregistrees">
                  ${this._sources.map(
                    (s) => html`
                      <option value=${s.id} ?selected=${this.ctrl.value === s.id}>
                        ${s.name} (${s.provider || s.type})
                      </option>
                    `
                  )}
                </optgroup>
              `
            : nothing}
          ${hasConnections
            ? html`
                <optgroup label="Connexions">
                  ${this._connections.map(
                    (c) => html`
                      <option
                        value=${'conn:' + c.id}
                        ?selected=${this.ctrl.value === 'conn:' + c.id}
                      >
                        ${c.name} (${c.type === 'grist' ? 'Grist' : 'API'})
                      </option>
                    `
                  )}
                </optgroup>
              `
            : nothing}
        </select>
      </div>
      ${this.ctrl.value
        ? html`
            <div
              style="font-size:0.7rem;color:#000091;margin:2px 0 4px;padding:2px 6px;background:#f0f0ff;border-radius:3px"
            >
              ${this.ctrl.value.startsWith('conn:') ? 'Connexion' : 'Source'} :
              ${this._getSelectedLabel()}
            </div>
          `
        : nothing}
      ${this._renderGristExplorer()}
    `;
  }
}

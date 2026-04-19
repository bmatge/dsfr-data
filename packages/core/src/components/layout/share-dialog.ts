/**
 * <share-dialog> - Dialog for sharing resources with users, groups, or globally.
 *
 * Light DOM for DSFR style inheritance.
 * Props: resource-type, resource-id
 * Only visible when the user is the owner of the resource.
 *
 * @example
 * <share-dialog resource-type="source" resource-id="abc123"></share-dialog>
 */

import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { escapeHtml, isAuthenticated } from '@dsfr-data/shared';

interface Share {
  id: string;
  resource_type: string;
  resource_id: string;
  target_type: 'user' | 'group' | 'global';
  target_id: string | null;
  target_name: string;
  target_email?: string;
  permission: 'read' | 'write';
  created_at: string;
}

interface SearchResult {
  id: string;
  email: string;
  displayName: string;
}

@customElement('share-dialog')
export class ShareDialog extends LitElement {
  @property({ type: String, attribute: 'resource-type' })
  resourceType = '';

  @property({ type: String, attribute: 'resource-id' })
  resourceId = '';

  @state() private _open = false;
  @state() private _shares: Share[] = [];
  @state() private _loading = false;
  @state() private _error = '';
  @state() private _targetType: 'user' | 'group' | 'global' = 'user';
  @state() private _searchQuery = '';
  @state() private _searchResults: SearchResult[] = [];
  @state() private _selectedTarget: SearchResult | null = null;
  @state() private _permission: 'read' | 'write' = 'read';

  // Light DOM for DSFR
  createRenderRoot() {
    return this;
  }

  open(): void {
    if (!isAuthenticated()) return;
    this._open = true;
    this._error = '';
    this._searchQuery = '';
    this._searchResults = [];
    this._selectedTarget = null;
    this._loadShares();
  }

  close(): void {
    this._open = false;
  }

  private async _loadShares(): Promise<void> {
    this._loading = true;
    try {
      const res = await fetch(
        `/api/shares?resource_type=${this.resourceType}&resource_id=${this.resourceId}`,
        { credentials: 'include' }
      );
      if (res.ok) {
        this._shares = await res.json();
      }
    } catch {
      this._error = 'Impossible de charger les partages';
    } finally {
      this._loading = false;
    }
  }

  private async _searchUsers(): Promise<void> {
    if (this._searchQuery.length < 2) {
      this._searchResults = [];
      return;
    }
    try {
      const res = await fetch(`/api/auth/users?q=${encodeURIComponent(this._searchQuery)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        this._searchResults = await res.json();
      }
    } catch {
      this._searchResults = [];
    }
  }

  private async _addShare(): Promise<void> {
    this._error = '';

    if (this._targetType === 'user' && !this._selectedTarget) {
      this._error = 'Selectionnez un utilisateur';
      return;
    }

    try {
      const body: Record<string, unknown> = {
        resource_type: this.resourceType,
        resource_id: this.resourceId,
        target_type: this._targetType,
        permission: this._permission,
      };

      if (this._targetType === 'user' && this._selectedTarget) {
        body.target_id = this._selectedTarget.id;
      }

      const res = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        this._error = data.error || 'Erreur lors du partage';
        return;
      }

      this._selectedTarget = null;
      this._searchQuery = '';
      this._searchResults = [];
      await this._loadShares();
    } catch {
      this._error = 'Erreur reseau';
    }
  }

  private async _removeShare(shareId: string): Promise<void> {
    try {
      await fetch(`/api/shares/${shareId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      await this._loadShares();
    } catch {
      this._error = 'Impossible de supprimer le partage';
    }
  }

  private _selectUser(user: SearchResult): void {
    this._selectedTarget = user;
    this._searchQuery = user.displayName || user.email;
    this._searchResults = [];
  }

  render() {
    if (!this._open) return nothing;

    return html`
      <dialog
        class="fr-modal fr-modal--opened"
        data-fr-opened="true"
        role="dialog"
        aria-labelledby="share-dialog-title"
        aria-modal="true"
        style="display:flex;opacity:1;visibility:visible"
        @click=${(e: Event) => {
          if (e.target === e.currentTarget) this.close();
        }}
      >
        <div class="fr-container fr-container--fluid fr-container-md">
          <div class="fr-grid-row fr-grid-row--center">
            <div class="fr-col-12 fr-col-md-8 fr-col-lg-6">
              <div class="fr-modal__body">
                <div class="fr-modal__header">
                  <button class="fr-btn--close fr-btn" title="Fermer" @click=${() => this.close()}>
                    Fermer
                  </button>
                </div>
                <div class="fr-modal__content">
                  <h1 id="share-dialog-title" class="fr-modal__title">Partager</h1>

                  ${this._error
                    ? html`
                        <div
                          class="fr-alert fr-alert--error fr-alert--sm"
                          style="margin-bottom:1rem"
                        >
                          <p>${this._error}</p>
                        </div>
                      `
                    : nothing}

                  <!-- Add share form -->
                  <div style="margin-bottom:1.5rem">
                    <div class="fr-select-group" style="margin-bottom:0.5rem">
                      <label class="fr-label" for="share-target-type">Partager avec</label>
                      <select
                        class="fr-select"
                        id="share-target-type"
                        @change=${(e: Event) => {
                          this._targetType = (e.target as HTMLSelectElement).value as
                            | 'user'
                            | 'group'
                            | 'global';
                        }}
                      >
                        <option value="user" ?selected=${this._targetType === 'user'}>
                          Un utilisateur
                        </option>
                        <option value="global" ?selected=${this._targetType === 'global'}>
                          Tout le monde
                        </option>
                      </select>
                    </div>

                    ${this._targetType === 'user'
                      ? html`
                          <div
                            class="fr-input-group"
                            style="margin-bottom:0.5rem; position:relative"
                          >
                            <label class="fr-label" for="share-user-search"
                              >Rechercher un utilisateur</label
                            >
                            <input
                              class="fr-input"
                              type="text"
                              id="share-user-search"
                              .value=${this._searchQuery}
                              @input=${(e: Event) => {
                                this._searchQuery = (e.target as HTMLInputElement).value;
                                this._searchUsers();
                              }}
                              placeholder="Email ou nom..."
                            />
                            ${this._searchResults.length > 0
                              ? html`
                                  <ul
                                    style="position:absolute;z-index:10;background:var(--background-default-grey);border:1px solid var(--border-default-grey);
                                     list-style:none;padding:0;margin:0;width:100%;max-height:200px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.1)"
                                  >
                                    ${this._searchResults.map(
                                      (user) => html`
                                        <li
                                          style="padding:0.5rem 0.75rem;cursor:pointer;border-bottom:1px solid var(--border-default-grey)"
                                          @click=${() => this._selectUser(user)}
                                        >
                                          <strong>${escapeHtml(user.displayName)}</strong>
                                          <span
                                            style="color:var(--text-mention-grey);margin-left:0.5rem"
                                            >${escapeHtml(user.email)}</span
                                          >
                                        </li>
                                      `
                                    )}
                                  </ul>
                                `
                              : nothing}
                          </div>
                        `
                      : nothing}

                    <div class="fr-select-group" style="margin-bottom:0.5rem">
                      <label class="fr-label" for="share-permission">Permission</label>
                      <select
                        class="fr-select"
                        id="share-permission"
                        @change=${(e: Event) => {
                          this._permission = (e.target as HTMLSelectElement).value as
                            | 'read'
                            | 'write';
                        }}
                      >
                        <option value="read" ?selected=${this._permission === 'read'}>
                          Lecture seule
                        </option>
                        <option value="write" ?selected=${this._permission === 'write'}>
                          Lecture et ecriture
                        </option>
                      </select>
                    </div>

                    <button
                      class="fr-btn fr-btn--sm fr-btn--icon-left fr-icon-add-line"
                      @click=${this._addShare}
                    >
                      Ajouter le partage
                    </button>
                  </div>

                  <!-- Existing shares -->
                  <h2 class="fr-text--lg" style="margin-bottom:0.5rem">Partages actuels</h2>
                  ${this._loading ? html`<p>Chargement...</p>` : nothing}
                  ${!this._loading && this._shares.length === 0
                    ? html`
                        <p class="fr-text--sm" style="color:var(--text-mention-grey)">
                          Aucun partage pour cette ressource.
                        </p>
                      `
                    : nothing}
                  ${this._shares.map(
                    (share) => html`
                      <div
                        style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border-default-grey)"
                      >
                        <div>
                          <strong>${escapeHtml(share.target_name)}</strong>
                          ${share.target_email
                            ? html`<span style="color:var(--text-mention-grey);margin-left:0.5rem"
                                >${escapeHtml(share.target_email)}</span
                              >`
                            : nothing}
                          <span
                            class="fr-badge fr-badge--sm ${share.permission === 'write'
                              ? 'fr-badge--warning'
                              : 'fr-badge--info'}"
                            style="margin-left:0.5rem"
                          >
                            ${share.permission === 'write' ? 'Ecriture' : 'Lecture'}
                          </span>
                        </div>
                        <button
                          class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-delete-line"
                          title="Supprimer ce partage"
                          @click=${() => this._removeShare(share.id)}
                        ></button>
                      </div>
                    `
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'share-dialog': ShareDialog;
  }
}

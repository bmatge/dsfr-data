/**
 * <password-change-modal> - Modal to change password for logged-in users.
 *
 * Light DOM for DSFR style inheritance.
 * Uses the shared auth service changePassword function.
 *
 * @example
 * <password-change-modal></password-change-modal>
 * // Open via: document.querySelector('password-change-modal')?.open()
 */

import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { changePassword } from '@dsfr-data/shared';

@customElement('password-change-modal')
export class PasswordChangeModal extends LitElement {
  @state() private _open = false;
  @state() private _error = '';
  @state() private _success = false;
  @state() private _loading = false;

  @state() private _currentPassword = '';
  @state() private _newPassword = '';
  @state() private _confirmPassword = '';

  // Light DOM for DSFR
  createRenderRoot() {
    return this;
  }

  open(): void {
    this._error = '';
    this._success = false;
    this._currentPassword = '';
    this._newPassword = '';
    this._confirmPassword = '';
    this._open = true;
  }

  close(): void {
    this._open = false;
  }

  private async _handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    this._error = '';
    this._success = false;
    this._loading = true;

    try {
      if (this._newPassword !== this._confirmPassword) {
        this._error = 'Les nouveaux mots de passe ne correspondent pas';
        return;
      }

      const result = await changePassword(this._currentPassword, this._newPassword);
      if (!result.success) {
        this._error = result.error || 'Erreur lors du changement de mot de passe';
        return;
      }

      this._success = true;
      this._currentPassword = '';
      this._newPassword = '';
      this._confirmPassword = '';
    } finally {
      this._loading = false;
    }
  }

  render() {
    if (!this._open) return nothing;

    return html`
      <dialog
        class="fr-modal fr-modal--opened"
        role="dialog"
        aria-labelledby="pw-change-title"
        aria-modal="true"
        style="display:flex"
        @click=${(e: Event) => {
          if (e.target === e.currentTarget) this.close();
        }}
      >
        <div class="fr-container fr-container--fluid fr-container-md">
          <div class="fr-grid-row fr-grid-row--center">
            <div class="fr-col-12 fr-col-md-6 fr-col-lg-4">
              <div class="fr-modal__body">
                <div class="fr-modal__header">
                  <button class="fr-btn--close fr-btn" title="Fermer" @click=${() => this.close()}>
                    Fermer
                  </button>
                </div>
                <div class="fr-modal__content">
                  <h1 id="pw-change-title" class="fr-modal__title">Changer le mot de passe</h1>

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
                  ${this._success
                    ? html`
                        <div
                          class="fr-alert fr-alert--success fr-alert--sm"
                          style="margin-bottom:1rem"
                        >
                          <p>Mot de passe modifie avec succes</p>
                        </div>
                      `
                    : nothing}
                  ${!this._success
                    ? html`
                        <form @submit=${this._handleSubmit}>
                          <div class="fr-input-group">
                            <label class="fr-label" for="pw-current">Mot de passe actuel</label>
                            <input
                              class="fr-input"
                              type="password"
                              id="pw-current"
                              autocomplete="current-password"
                              .value=${this._currentPassword}
                              @input=${(e: Event) => {
                                this._currentPassword = (e.target as HTMLInputElement).value;
                              }}
                              required
                            />
                          </div>

                          <div class="fr-input-group">
                            <label class="fr-label" for="pw-new">Nouveau mot de passe</label>
                            <input
                              class="fr-input"
                              type="password"
                              id="pw-new"
                              autocomplete="new-password"
                              minlength="8"
                              .value=${this._newPassword}
                              @input=${(e: Event) => {
                                this._newPassword = (e.target as HTMLInputElement).value;
                              }}
                              required
                            />
                            <p class="fr-hint-text">
                              8 caracteres minimum, 1 majuscule, 1 minuscule, 1 chiffre
                            </p>
                          </div>

                          <div class="fr-input-group">
                            <label class="fr-label" for="pw-confirm"
                              >Confirmer le nouveau mot de passe</label
                            >
                            <input
                              class="fr-input"
                              type="password"
                              id="pw-confirm"
                              autocomplete="new-password"
                              minlength="8"
                              .value=${this._confirmPassword}
                              @input=${(e: Event) => {
                                this._confirmPassword = (e.target as HTMLInputElement).value;
                              }}
                              required
                            />
                          </div>

                          <div class="fr-input-group" style="margin-top:1.5rem">
                            <button
                              class="fr-btn"
                              type="submit"
                              ?disabled=${this._loading}
                              style="width:100%"
                            >
                              ${this._loading ? 'Chargement...' : 'Changer le mot de passe'}
                            </button>
                          </div>
                        </form>
                      `
                    : html`
                        <div class="fr-input-group" style="margin-top:1rem">
                          <button
                            class="fr-btn fr-btn--secondary"
                            @click=${() => this.close()}
                            style="width:100%"
                          >
                            Fermer
                          </button>
                        </div>
                      `}
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
    'password-change-modal': PasswordChangeModal;
  }
}

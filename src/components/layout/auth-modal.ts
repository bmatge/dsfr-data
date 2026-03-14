/**
 * <auth-modal> - Login/Register modal using DSFR styling.
 *
 * Light DOM for DSFR style inheritance.
 * Uses the shared auth service for login/register.
 *
 * @example
 * <auth-modal></auth-modal>
 * // Open via: document.querySelector('auth-modal')?.open()
 */

import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { login, register } from '@dsfr-data/shared';

type Tab = 'login' | 'register';

@customElement('auth-modal')
export class AuthModal extends LitElement {
  @state() private _open = false;
  @state() private _tab: Tab = 'login';
  @state() private _error = '';
  @state() private _loading = false;

  // Form fields
  @state() private _email = '';
  @state() private _password = '';
  @state() private _displayName = '';

  // Light DOM for DSFR
  createRenderRoot() { return this; }

  open(tab: Tab = 'login'): void {
    this._tab = tab;
    this._error = '';
    this._email = '';
    this._password = '';
    this._displayName = '';
    this._open = true;
  }

  close(): void {
    this._open = false;
  }

  private async _handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    this._error = '';
    this._loading = true;

    try {
      if (this._tab === 'login') {
        const result = await login({ email: this._email, password: this._password });
        if (!result.success) {
          this._error = result.error || 'Identifiants incorrects';
          return;
        }
      } else {
        if (!this._displayName.trim()) {
          this._error = 'Le nom est requis';
          return;
        }
        const result = await register({
          email: this._email,
          password: this._password,
          displayName: this._displayName,
        });
        if (!result.success) {
          this._error = result.error || "Erreur lors de l'inscription";
          return;
        }
      }

      this.close();
      // Reload to re-init app with auth context
      window.location.reload();
    } finally {
      this._loading = false;
    }
  }

  private _switchTab(tab: Tab): void {
    this._tab = tab;
    this._error = '';
  }

  render() {
    if (!this._open) return nothing;

    const isLogin = this._tab === 'login';

    return html`
      <dialog class="fr-modal fr-modal--opened" role="dialog" aria-labelledby="auth-modal-title" aria-modal="true"
              style="display:flex" @click=${(e: Event) => { if (e.target === e.currentTarget) this.close(); }}>
        <div class="fr-container fr-container--fluid fr-container-md">
          <div class="fr-grid-row fr-grid-row--center">
            <div class="fr-col-12 fr-col-md-6 fr-col-lg-4">
              <div class="fr-modal__body">
                <div class="fr-modal__header">
                  <button class="fr-btn--close fr-btn" title="Fermer"
                          @click=${() => this.close()}>Fermer</button>
                </div>
                <div class="fr-modal__content">
                  <h1 id="auth-modal-title" class="fr-modal__title">
                    ${isLogin ? 'Connexion' : 'Inscription'}
                  </h1>

                  <!-- Tabs -->
                  <div class="fr-tabs" style="margin-bottom:1rem">
                    <ul class="fr-tabs__list" role="tablist">
                      <li role="presentation">
                        <button class="fr-tabs__tab ${isLogin ? 'fr-tabs__tab--selected' : ''}"
                                role="tab" aria-selected="${isLogin}"
                                @click=${() => this._switchTab('login')}>
                          Connexion
                        </button>
                      </li>
                      <li role="presentation">
                        <button class="fr-tabs__tab ${!isLogin ? 'fr-tabs__tab--selected' : ''}"
                                role="tab" aria-selected="${!isLogin}"
                                @click=${() => this._switchTab('register')}>
                          Inscription
                        </button>
                      </li>
                    </ul>
                  </div>

                  ${this._error ? html`
                    <div class="fr-alert fr-alert--error fr-alert--sm" style="margin-bottom:1rem">
                      <p>${this._error}</p>
                    </div>
                  ` : nothing}

                  <form @submit=${this._handleSubmit}>
                    ${!isLogin ? html`
                      <div class="fr-input-group">
                        <label class="fr-label" for="auth-name">Nom d'affichage</label>
                        <input class="fr-input" type="text" id="auth-name"
                               .value=${this._displayName}
                               @input=${(e: Event) => { this._displayName = (e.target as HTMLInputElement).value; }}
                               required>
                      </div>
                    ` : nothing}

                    <div class="fr-input-group">
                      <label class="fr-label" for="auth-email">Email</label>
                      <input class="fr-input" type="email" id="auth-email" autocomplete="email"
                             .value=${this._email}
                             @input=${(e: Event) => { this._email = (e.target as HTMLInputElement).value; }}
                             required>
                    </div>

                    <div class="fr-input-group">
                      <label class="fr-label" for="auth-password">Mot de passe</label>
                      <input class="fr-input" type="password" id="auth-password"
                             autocomplete="${isLogin ? 'current-password' : 'new-password'}"
                             minlength="6"
                             .value=${this._password}
                             @input=${(e: Event) => { this._password = (e.target as HTMLInputElement).value; }}
                             required>
                      ${!isLogin ? html`<p class="fr-hint-text">6 caracteres minimum</p>` : nothing}
                    </div>

                    <div class="fr-input-group" style="margin-top:1.5rem">
                      <button class="fr-btn" type="submit" ?disabled=${this._loading}
                              style="width:100%">
                        ${this._loading ? 'Chargement...' : (isLogin ? 'Se connecter' : "S'inscrire")}
                      </button>
                    </div>
                  </form>
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
    'auth-modal': AuthModal;
  }
}

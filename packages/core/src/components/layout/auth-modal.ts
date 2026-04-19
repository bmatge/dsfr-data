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
import { login, register, forgotPassword, resetPassword } from '@dsfr-data/shared';

type Tab = 'login' | 'register' | 'forgot' | 'reset';

@customElement('auth-modal')
export class AuthModal extends LitElement {
  @state() private _open = false;
  @state() private _tab: Tab = 'login';
  @state() private _error = '';
  @state() private _loading = false;

  // Form fields
  @state() private _email = '';
  @state() private _password = '';
  @state() private _passwordConfirm = '';
  @state() private _displayName = '';
  @state() private _successMessage = '';
  @state() private _resetToken = '';

  // Light DOM for DSFR
  createRenderRoot() {
    return this;
  }

  open(tab: Tab = 'login', resetToken?: string): void {
    this._tab = tab;
    this._error = '';
    this._successMessage = '';
    this._email = '';
    this._password = '';
    this._passwordConfirm = '';
    this._displayName = '';
    this._resetToken = resetToken || '';
    this._open = true;
  }

  close(): void {
    this._open = false;
  }

  private async _handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    this._error = '';
    this._successMessage = '';
    this._loading = true;

    try {
      if (this._tab === 'login') {
        const result = await login({ email: this._email, password: this._password });
        if (!result.success) {
          this._error = result.error || 'Identifiants incorrects';
          return;
        }
        this.close();
        window.location.reload();
      } else if (this._tab === 'register') {
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
        this.close();
        window.location.reload();
      } else if (this._tab === 'forgot') {
        const result = await forgotPassword(this._email);
        this._successMessage = result.message || 'Si un compte existe, un email a ete envoye';
      } else if (this._tab === 'reset') {
        if (this._password !== this._passwordConfirm) {
          this._error = 'Les mots de passe ne correspondent pas';
          return;
        }
        const result = await resetPassword(this._resetToken, this._password);
        if (!result.success) {
          this._error = result.error || 'Erreur lors de la reinitialisation';
          return;
        }
        this.close();
        window.location.reload();
      }
    } finally {
      this._loading = false;
    }
  }

  private _switchTab(tab: Tab): void {
    this._tab = tab;
    this._error = '';
    this._successMessage = '';
  }

  private _renderTitle(): string {
    switch (this._tab) {
      case 'login':
        return 'Connexion';
      case 'register':
        return 'Inscription';
      case 'forgot':
        return 'Mot de passe oublie';
      case 'reset':
        return 'Nouveau mot de passe';
    }
  }

  private _renderSubmitLabel(): string {
    if (this._loading) return 'Chargement...';
    switch (this._tab) {
      case 'login':
        return 'Se connecter';
      case 'register':
        return "S'inscrire";
      case 'forgot':
        return 'Envoyer le lien';
      case 'reset':
        return 'Reinitialiser';
    }
  }

  private _renderForm() {
    if (this._tab === 'forgot') {
      return html`
        <div class="fr-input-group">
          <label class="fr-label" for="auth-email">Email</label>
          <input
            class="fr-input"
            type="email"
            id="auth-email"
            autocomplete="email"
            .value=${this._email}
            @input=${(e: Event) => {
              this._email = (e.target as HTMLInputElement).value;
            }}
            required
          />
        </div>
      `;
    }

    if (this._tab === 'reset') {
      return html`
        <div class="fr-input-group">
          <label class="fr-label" for="auth-password">Nouveau mot de passe</label>
          <input
            class="fr-input"
            type="password"
            id="auth-password"
            autocomplete="new-password"
            minlength="8"
            .value=${this._password}
            @input=${(e: Event) => {
              this._password = (e.target as HTMLInputElement).value;
            }}
            required
          />
          <p class="fr-hint-text">8 caracteres minimum, 1 majuscule, 1 minuscule, 1 chiffre</p>
        </div>
        <div class="fr-input-group">
          <label class="fr-label" for="auth-password-confirm">Confirmer le mot de passe</label>
          <input
            class="fr-input"
            type="password"
            id="auth-password-confirm"
            autocomplete="new-password"
            minlength="8"
            .value=${this._passwordConfirm}
            @input=${(e: Event) => {
              this._passwordConfirm = (e.target as HTMLInputElement).value;
            }}
            required
          />
        </div>
      `;
    }

    const isLogin = this._tab === 'login';

    return html`
      ${!isLogin
        ? html`
            <div class="fr-input-group">
              <label class="fr-label" for="auth-name">Nom d'affichage</label>
              <input
                class="fr-input"
                type="text"
                id="auth-name"
                .value=${this._displayName}
                @input=${(e: Event) => {
                  this._displayName = (e.target as HTMLInputElement).value;
                }}
                required
              />
            </div>
          `
        : nothing}

      <div class="fr-input-group">
        <label class="fr-label" for="auth-email">Email</label>
        <input
          class="fr-input"
          type="email"
          id="auth-email"
          autocomplete="email"
          .value=${this._email}
          @input=${(e: Event) => {
            this._email = (e.target as HTMLInputElement).value;
          }}
          required
        />
      </div>

      <div class="fr-input-group">
        <label class="fr-label" for="auth-password">Mot de passe</label>
        <input
          class="fr-input"
          type="password"
          id="auth-password"
          autocomplete="${isLogin ? 'current-password' : 'new-password'}"
          minlength="${isLogin ? 6 : 8}"
          .value=${this._password}
          @input=${(e: Event) => {
            this._password = (e.target as HTMLInputElement).value;
          }}
          required
        />
        ${!isLogin
          ? html`<p class="fr-hint-text">
              8 caracteres minimum, 1 majuscule, 1 minuscule, 1 chiffre
            </p>`
          : nothing}
      </div>

      ${isLogin
        ? html`
            <p style="margin-top:0.5rem;margin-bottom:0">
              <a
                href="#"
                @click=${(e: Event) => {
                  e.preventDefault();
                  this._switchTab('forgot');
                }}
                style="font-size:0.875rem"
                >Mot de passe oublie ?</a
              >
            </p>
          `
        : nothing}
    `;
  }

  render() {
    if (!this._open) return nothing;

    const showTabs = this._tab === 'login' || this._tab === 'register';

    return html`
      <dialog
        class="fr-modal fr-modal--opened"
        data-fr-opened="true"
        role="dialog"
        aria-labelledby="auth-modal-title"
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
                  <h1 id="auth-modal-title" class="fr-modal__title">${this._renderTitle()}</h1>

                  ${showTabs
                    ? html`
                        <!-- Tabs -->
                        <div class="fr-tabs" style="margin-bottom:1rem">
                          <ul class="fr-tabs__list" role="tablist">
                            <li role="presentation">
                              <button
                                class="fr-tabs__tab ${this._tab === 'login'
                                  ? 'fr-tabs__tab--selected'
                                  : ''}"
                                role="tab"
                                aria-selected="${this._tab === 'login'}"
                                @click=${() => this._switchTab('login')}
                              >
                                Connexion
                              </button>
                            </li>
                            <li role="presentation">
                              <button
                                class="fr-tabs__tab ${this._tab === 'register'
                                  ? 'fr-tabs__tab--selected'
                                  : ''}"
                                role="tab"
                                aria-selected="${this._tab === 'register'}"
                                @click=${() => this._switchTab('register')}
                              >
                                Inscription
                              </button>
                            </li>
                          </ul>
                        </div>
                      `
                    : html`
                        <p style="margin-bottom:1rem">
                          <a
                            href="#"
                            @click=${(e: Event) => {
                              e.preventDefault();
                              this._switchTab('login');
                            }}
                            style="font-size:0.875rem"
                            >&larr; Retour a la connexion</a
                          >
                        </p>
                      `}
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
                  ${this._successMessage
                    ? html`
                        <div
                          class="fr-alert fr-alert--success fr-alert--sm"
                          style="margin-bottom:1rem"
                        >
                          <p>${this._successMessage}</p>
                        </div>
                      `
                    : nothing}

                  <form @submit=${this._handleSubmit}>
                    ${this._renderForm()}

                    <div class="fr-input-group" style="margin-top:1.5rem">
                      <button
                        class="fr-btn"
                        type="submit"
                        ?disabled=${this._loading}
                        style="width:100%"
                      >
                        ${this._renderSubmitLabel()}
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

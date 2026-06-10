import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/**
 * Constantes injectées au build de la lib par `scripts/build-lib.ts`
 * (via le `define` esbuild). En l'absence de define (import direct hors
 * build lib), les usages restent gardés par `typeof X !== 'undefined'`.
 */
declare const __DSFR_DATA_VERSION__: string;
declare const __DSFR_DATA_COMMIT__: string;

/**
 * <app-footer> - Footer DSFR
 *
 * Affiche le footer conforme DSFR avec logo, liens et mentions légales.
 *
 * @example
 * <app-footer base-path=""></app-footer>
 * <app-footer base-path="../../"></app-footer>
 */
@customElement('app-footer')
export class AppFooter extends LitElement {
  /**
   * Chemin de base pour les liens (ex: '', '../', '../../')
   */
  @property({ type: String, attribute: 'base-path' })
  basePath = '';

  private get _base(): string {
    const bp = this.basePath;
    if (!bp) return '';
    return bp.endsWith('/') ? bp : bp + '/';
  }

  /** Version semver de la lib, injectée au build (vide hors build lib). */
  private get _version(): string {
    return typeof __DSFR_DATA_VERSION__ !== 'undefined' ? __DSFR_DATA_VERSION__ : '';
  }

  /** Hash court du commit buildé, injecté au build (vide si indisponible). */
  private get _commit(): string {
    return typeof __DSFR_DATA_COMMIT__ !== 'undefined' ? __DSFR_DATA_COMMIT__ : '';
  }

  // Light DOM pour hériter des styles DSFR
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <footer class="fr-footer" role="contentinfo" id="footer">
        <div class="fr-container">
          <div class="fr-footer__body">
            <div class="fr-footer__brand fr-enlarge-link">
              <a
                href="${this._base}index.html"
                title="Retour à l'accueil du site - République Française"
              >
                <p class="fr-logo">République<br />Française</p>
              </a>
            </div>
            <div class="fr-footer__content">
              <p class="fr-footer__content-desc">
                Charts builder est un projet open-source permettant de créer des visualisations de
                données conformes au Design System de l'État (DSFR).
              </p>
              ${this._version
                ? html`<p class="fr-footer__content-desc fr-text--xs" style="opacity: 0.7;">
                    Composants dsfr-data
                    v${this._version}${this._commit
                      ? html` ·
                          <a
                            class="fr-footer__content-link"
                            href="https://github.com/bmatge/dsfr-data/commit/${this._commit}"
                            target="_blank"
                            rel="noopener"
                            title="Voir le commit sur GitHub"
                            >commit ${this._commit}</a
                          >`
                      : ''}
                  </p>`
                : ''}
              <ul class="fr-footer__content-list">
                <li class="fr-footer__content-item">
                  <a
                    class="fr-footer__content-link"
                    target="_blank"
                    rel="noopener"
                    href="https://www.systeme-de-design.gouv.fr/"
                  >
                    systeme-de-design.gouv.fr
                  </a>
                </li>
                <li class="fr-footer__content-item">
                  <a
                    class="fr-footer__content-link"
                    target="_blank"
                    rel="noopener"
                    href="https://github.com/bmatge/dsfr-data"
                  >
                    GitHub
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div class="fr-footer__bottom">
            <ul class="fr-footer__bottom-list">
              <li class="fr-footer__bottom-item">
                <a class="fr-footer__bottom-link" href="#">Accessibilité : non conforme</a>
              </li>
              <li class="fr-footer__bottom-item">
                <a class="fr-footer__bottom-link" href="#">Mentions légales</a>
              </li>
            </ul>
            <div class="fr-footer__bottom-copy">
              <p>
                Sauf mention explicite de propriété intellectuelle détenue par des tiers, les
                contenus de ce site sont proposés sous
                <a
                  href="https://github.com/etalab/licence-ouverte/blob/master/LO.md"
                  target="_blank"
                  rel="noopener"
                  >licence etalab-2.0</a
                >
              </p>
            </div>
          </div>
        </div>
      </footer>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-footer': AppFooter;
  }
}

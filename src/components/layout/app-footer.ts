import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

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
              <a href="${this._base}index.html" title="Retour à l'accueil du site - République Française">
                <p class="fr-logo">
                  République<br>Française
                </p>
              </a>
            </div>
            <div class="fr-footer__content">
              <p class="fr-footer__content-desc">
                Charts builder est un projet open-source permettant de créer des visualisations de données conformes au Design System de l'État (DSFR).
              </p>
              <ul class="fr-footer__content-list">
                <li class="fr-footer__content-item">
                  <a class="fr-footer__content-link" target="_blank" rel="noopener" href="https://www.systeme-de-design.gouv.fr/">
                    systeme-de-design.gouv.fr
                  </a>
                </li>
                <li class="fr-footer__content-item">
                  <a class="fr-footer__content-link" target="_blank" rel="noopener" href="https://github.com/bmatge/dsfr-data">
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
                Sauf mention explicite de propriété intellectuelle détenue par des tiers, les contenus de ce site sont proposés sous
                <a href="https://github.com/etalab/licence-ouverte/blob/master/LO.md" target="_blank" rel="noopener">licence etalab-2.0</a>
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

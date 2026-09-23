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
 * `variant="slim"` : une seule ligne pour les apps de travail (Sources,
 * Playground, Tableau de bord...), ou le pied complet (~280 px) coutait une
 * fin de page entiere. Elle garde le bloc-marque et les liens obligatoires
 * (accessibilite, mentions legales, licence) ; l'accueil, le Guide et les
 * Specs gardent le pied complet.
 *
 * @example
 * <app-footer base-path=""></app-footer>
 * <app-footer base-path="../../" variant="slim"></app-footer>
 */
/**
 * Feuille de la variante une ligne, injectee une fois par document. Le
 * bloc-marque y est mis en ligne comme dans l'en-tete compact (`app-header`).
 */
export function injectAppFooterStyles(): void {
  if (document.getElementById('app-footer-style')) return;
  const style = document.createElement('style');
  style.id = 'app-footer-style';
  style.textContent = `.app-footer--slim{padding-top:0}.app-footer--slim .fr-footer__bottom{margin-top:0;box-shadow:none;flex-wrap:wrap;gap:0 1.5rem}.app-footer--slim .fr-footer__bottom-list{width:auto;flex:1 1 auto}.app-footer--slim .fr-footer__bottom-item:last-child{margin-left:auto}.app-footer--slim .app-footer__brand{background-image:none}.app-footer--slim .fr-logo{display:flex;align-items:center;gap:.5rem;line-height:1rem}.app-footer--slim .fr-logo br{display:none}.app-footer--slim .fr-logo::before{margin:0}.app-footer--slim .fr-logo::after{display:none}`;
  document.head.appendChild(style);
}

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

  /** `slim` : une seule ligne (apps de travail). Vide : pied DSFR complet. */
  @property({ type: String })
  variant: '' | 'slim' = '';

  connectedCallback() {
    super.connectedCallback();
    injectAppFooterStyles();
  }

  // Light DOM pour hériter des styles DSFR
  createRenderRoot() {
    return this;
  }

  private _renderSlim() {
    return html`
      <footer class="fr-footer app-footer--slim" role="contentinfo" id="footer">
        <div class="fr-container">
          <div class="fr-footer__bottom">
            <a
              class="app-footer__brand"
              href="${this._base}index.html"
              title="Retour à l'accueil du site - République Française"
            >
              <p class="fr-logo fr-logo--sm">République <br />Française</p>
            </a>
            <ul class="fr-footer__bottom-list">
              <li class="fr-footer__bottom-item">
                <a class="fr-footer__bottom-link" href="#">Accessibilité : non conforme</a>
              </li>
              <li class="fr-footer__bottom-item">
                <a class="fr-footer__bottom-link" href="#">Mentions légales</a>
              </li>
              <li class="fr-footer__bottom-item">
                <a
                  class="fr-footer__bottom-link"
                  href="https://github.com/etalab/licence-ouverte/blob/master/LO.md"
                  target="_blank"
                  rel="noopener"
                  >Licence etalab-2.0</a
                >
              </li>
              <li class="fr-footer__bottom-item">
                <a
                  class="fr-footer__bottom-link"
                  href="https://github.com/bmatge/dsfr-data"
                  target="_blank"
                  rel="noopener"
                  >GitHub</a
                >
              </li>
              ${
                this._version
                  ? html`<li class="fr-footer__bottom-item">
                      <span class="fr-footer__bottom-link">
                        dsfr-data
                        v${this._version}${
                          this._commit
                            ? html` ·
                                <a
                                  href="https://github.com/bmatge/dsfr-data/commit/${this._commit}"
                                  target="_blank"
                                  rel="noopener"
                                  title="Voir le commit sur GitHub"
                                  >${this._commit}</a
                                >`
                            : ''
                        }
                      </span>
                    </li>`
                  : ''
              }
            </ul>
          </div>
        </div>
      </footer>
    `;
  }

  render() {
    if (this.variant === 'slim') return this._renderSlim();
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
              ${
                this._version
                  ? html`<p
                      class="fr-footer__content-desc fr-text--xs"
                      style="color: var(--text-mention-grey, #666666);"
                    >
                      Composants dsfr-data
                      v${this._version}${
                        this._commit
                          ? html` ·
                              <a
                                class="fr-footer__content-link"
                                href="https://github.com/bmatge/dsfr-data/commit/${this._commit}"
                                target="_blank"
                                rel="noopener"
                                title="Voir le commit sur GitHub"
                                >commit ${this._commit}</a
                              >`
                          : ''
                      }
                    </p>`
                  : ''
              }
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
                    href="https://github.com/GouvernementFR/dsfr-chart"
                  >
                    DSFR Chart
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
                <li class="fr-footer__content-item">
                  <a class="fr-footer__content-link" href="${this._base}specs/roadmap.html">
                    Feuille de route
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

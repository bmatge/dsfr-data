import { LitElement, html, TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

interface MenuItem {
  id: string;
  label: string;
  href: string;
  children?: MenuItem[];
}

/**
 * <app-layout-demo> - Layout documentation avec sidemenu
 *
 * Affiche un layout avec sidemenu sticky à gauche et contenu à droite.
 * Le sidemenu contient la navigation vers tous les composants et graphiques.
 *
 * Note: Utilise Light DOM pour hériter des styles DSFR.
 * Les éléments avec slot="content" sont déplacés manuellement après le rendu.
 *
 * @example
 * <app-layout-demo
 *   title="dsfr-data-source"
 *   icon="ri-database-2-line"
 *   active-path="components/dsfr-data-source"
 *   base-path="../../">
 *   <div slot="content">
 *     <p class="fr-text--lead">Description...</p>
 *     <!-- Contenu spécifique -->
 *   </div>
 * </app-layout-demo>
 */
@customElement('app-layout-demo')
export class AppLayoutDemo extends LitElement {
  /**
   * Titre de la page (affiché en h1)
   */
  @property({ type: String })
  title = '';

  /**
   * Classe d'icône Remix Icon (ex: ri-database-2-line)
   */
  @property({ type: String })
  icon = '';

  /**
   * Chemin actif pour la mise en surbrillance dans le sidemenu
   * (ex: 'overview', 'components/dsfr-data-source', 'charts/bar-chart')
   */
  @property({ type: String, attribute: 'active-path' })
  activePath = '';

  /**
   * Chemin de base pour les liens (ex: '../', '../../')
   */
  @property({ type: String, attribute: 'base-path' })
  basePath = '';

  private get _base(): string {
    const bp = this.basePath;
    if (!bp) return '';
    return bp.endsWith('/') ? bp : bp + '/';
  }

  // Éléments enfants à projeter (sauvegardés avant le rendu)
  private _contentElements: Element[] = [];
  private _contentMoved = false;

  // Light DOM pour hériter des styles DSFR
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // Sauvegarder les éléments enfants avant le premier rendu
    this._contentElements = Array.from(this.querySelectorAll('[slot="content"]'));
  }

  firstUpdated() {
    this._moveContent();
  }

  updated() {
    if (!this._contentMoved) {
      this._moveContent();
    }
  }

  private _moveContent() {
    const contentContainer = this.querySelector('.demo-content-slot');
    if (contentContainer) {
      this._contentElements.forEach(el => contentContainer.appendChild(el));
      this._contentMoved = true;
    }
  }

  private _getMenuStructure(): MenuItem[] {
    return [
      { id: 'overview', label: "Vue d'ensemble", href: 'index.html' },
      {
        id: 'apis',
        label: 'API supportees',
        href: '#',
        children: [
          { id: 'apis/opendatasoft', label: 'OpenDataSoft', href: 'apis/opendatasoft.html' },
          { id: 'apis/tabular', label: 'Tabular', href: 'apis/tabular.html' },
          { id: 'apis/grist', label: 'Grist', href: 'apis/grist.html' },
          { id: 'apis/insee', label: 'INSEE (Melodi)', href: 'apis/insee.html' },
          { id: 'apis/generic', label: 'Generique (REST)', href: 'apis/generic.html' },
        ]
      },
      {
        id: 'components',
        label: 'Composants dsfr-data',
        href: '#',
        children: [
          { id: 'components/dsfr-data-source', label: 'dsfr-data-source', href: 'components/dsfr-data-source.html' },
          { id: 'components/dsfr-data-normalize', label: 'dsfr-data-normalize', href: 'components/dsfr-data-normalize.html' },
          { id: 'components/dsfr-data-query', label: 'dsfr-data-query', href: 'components/dsfr-data-query.html' },
          { id: 'components/dsfr-data-join', label: 'dsfr-data-join', href: 'components/dsfr-data-join.html' },
          { id: 'components/dsfr-data-facets', label: 'dsfr-data-facets', href: 'components/dsfr-data-facets.html' },
          { id: 'components/dsfr-data-search', label: 'dsfr-data-search', href: 'components/dsfr-data-search.html' },
          { id: 'components/dsfr-data-kpi', label: 'dsfr-data-kpi', href: 'components/dsfr-data-kpi.html' },
          { id: 'components/dsfr-data-list', label: 'dsfr-data-list', href: 'components/dsfr-data-list.html' },
          { id: 'components/dsfr-data-display', label: 'dsfr-data-display', href: 'components/dsfr-data-display.html' },
          { id: 'components/dsfr-data-podium', label: 'dsfr-data-podium', href: 'components/dsfr-data-podium.html' },
          { id: 'components/dsfr-data-world-map', label: 'dsfr-data-world-map', href: 'components/dsfr-data-world-map.html' },
          { id: 'components/dsfr-data-map', label: 'dsfr-data-map', href: 'components/dsfr-data-map.html' },
          { id: 'components/dsfr-data-a11y', label: 'dsfr-data-a11y', href: 'components/dsfr-data-a11y.html' },
          { id: 'components/dsfr-data-chart', label: 'dsfr-data-chart', href: 'components/dsfr-data-chart.html' },
        ]
      },
      {
        id: 'charts',
        label: 'Composants dsfr-charts',
        href: '#',
        children: [
          { id: 'charts/line-chart', label: 'line-chart', href: 'charts/line-chart.html' },
          { id: 'charts/bar-chart', label: 'bar-chart', href: 'charts/bar-chart.html' },
          { id: 'charts/pie-chart', label: 'pie-chart', href: 'charts/pie-chart.html' },
          { id: 'charts/radar-chart', label: 'radar-chart', href: 'charts/radar-chart.html' },
          { id: 'charts/gauge-chart', label: 'gauge-chart', href: 'charts/gauge-chart.html' },
          { id: 'charts/map-chart', label: 'map-chart', href: 'charts/map-chart.html' },
          { id: 'charts/scatter-chart', label: 'scatter-chart', href: 'charts/scatter-chart.html' },
        ]
      }
    ];
  }

  private _isActive(itemId: string): boolean {
    return this.activePath === itemId;
  }

  private _isParentActive(item: MenuItem): boolean {
    if (!item.children) return false;
    return item.children.some(child => this._isActive(child.id));
  }

  private _renderMenuItem(item: MenuItem): TemplateResult {
    const isActive = this._isActive(item.id);
    const isParentActive = this._isParentActive(item);

    if (item.children) {
      // Menu avec sous-items
      const sectionId = `fr-sidemenu-${item.id}`;
      const isExpanded = isParentActive;

      return html`
        <li class="fr-sidemenu__item">
          <button class="fr-sidemenu__btn"
                  aria-expanded="${isExpanded}"
                  aria-controls="${sectionId}">
            ${item.label}
          </button>
          <div class="fr-collapse ${isExpanded ? 'fr-collapse--expanded' : ''}" id="${sectionId}">
            <ul class="fr-sidemenu__list">
              ${item.children.map(child => this._renderMenuItem(child))}
            </ul>
          </div>
        </li>
      `;
    } else {
      // Lien simple
      return html`
        <li class="fr-sidemenu__item ${isActive ? 'fr-sidemenu__item--active' : ''}">
          <a class="fr-sidemenu__link"
             href="${this._base}${item.href}"
             ${isActive ? html`aria-current="page"` : ''}>
            ${item.label}
          </a>
        </li>
      `;
    }
  }

  private _renderBreadcrumb() {
    if (!this.activePath || this.activePath === 'overview') {
      return '';
    }

    const parts = this.activePath.split('/');
    const breadcrumbItems = [
      { label: 'Composants', href: `${this._base}index.html` }
    ];

    if (parts.length > 1) {
      // Add section (components or charts)
      const section = parts[0] === 'components' ? 'Composants dsfr-data' : 'Composants dsfr-charts';
      breadcrumbItems.push({ label: section, href: '#' });
    }

    // Add current page
    breadcrumbItems.push({ label: this.title, href: '' });

    return html`
      <nav role="navigation" class="fr-breadcrumb" aria-label="vous êtes ici :">
        <button class="fr-breadcrumb__button" aria-expanded="false" aria-controls="breadcrumb">
          Voir le fil d'Ariane
        </button>
        <div class="fr-collapse" id="breadcrumb">
          <ol class="fr-breadcrumb__list">
            ${breadcrumbItems.map((item, index) => html`
              <li>
                ${index === breadcrumbItems.length - 1
                  ? html`<a class="fr-breadcrumb__link" aria-current="page">${item.label}</a>`
                  : html`<a class="fr-breadcrumb__link" href="${item.href}">${item.label}</a>`
                }
              </li>
            `)}
          </ol>
        </div>
      </nav>
    `;
  }

  render() {
    const menuItems = this._getMenuStructure();

    return html`
      <main class="fr-container fr-py-4w" id="main-content">
        <div class="demo-layout">
          <!-- Sidemenu -->
          <nav class="fr-sidemenu" role="navigation" aria-labelledby="fr-sidemenu-title">
            <div class="fr-sidemenu__inner">
              <button class="fr-sidemenu__btn" hidden aria-controls="fr-sidemenu-wrapper" aria-expanded="true">
                Menu
              </button>
              <div class="fr-collapse" id="fr-sidemenu-wrapper">
                <div class="fr-sidemenu__title" id="fr-sidemenu-title">Composants</div>
                <ul class="fr-sidemenu__list">
                  ${menuItems.map(item => this._renderMenuItem(item))}
                </ul>
              </div>
            </div>
          </nav>

          <!-- Contenu principal -->
          <div class="demo-content">
            ${this._renderBreadcrumb()}

            ${this.title ? html`
              <h1>
                ${this.icon ? html`<span class="${this.icon} fr-mr-1w" aria-hidden="true"></span>` : ''}
                ${this.title}
              </h1>
            ` : ''}

            <!-- Contenu slot="content" sera déplacé ici -->
            <div class="demo-content-slot"></div>
          </div>
        </div>
      </main>

      <style>
        .demo-layout {
          display: flex;
          gap: 2rem;
        }

        .fr-sidemenu {
          flex: 0 0 280px;
          position: sticky;
          top: 1rem;
          height: fit-content;
        }

        .demo-content {
          flex: 1;
          min-width: 0;
        }

        @media (max-width: 992px) {
          .demo-layout {
            flex-direction: column;
          }

          .fr-sidemenu {
            position: static;
            flex: none;
          }
        }

        /* Styles communs pour les sections de démo */
        .demo-section {
          background: var(--background-alt-grey);
          padding: 1.5rem;
          border-radius: 4px;
          margin: 1.5rem 0;
        }

        .code-block {
          background: #1e1e1e;
          color: #d4d4d4;
          padding: 1rem;
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.85rem;
          overflow-x: auto;
          white-space: pre-wrap;
        }

        .attr-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
        }

        .attr-table th,
        .attr-table td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid var(--border-default-grey);
        }

        .attr-table th {
          background: var(--background-alt-grey);
          font-weight: 600;
        }

        .attr-table code {
          background: var(--background-contrast-grey);
          padding: 0.125rem 0.375rem;
          border-radius: 2px;
          font-size: 0.85em;
        }
      </style>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-layout-demo': AppLayoutDemo;
  }
}

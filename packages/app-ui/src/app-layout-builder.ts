import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

/**
 * <app-layout-builder> - Layout deux colonnes avec resizer
 *
 * Affiche un layout à deux colonnes (gauche: config, droite: preview)
 * avec un resizer draggable entre les deux.
 *
 * Note: Utilise Light DOM pour hériter des styles DSFR.
 * Les éléments avec slot="left" et slot="right" sont déplacés
 * manuellement dans les conteneurs après le rendu.
 *
 * @example
 * <app-layout-builder left-ratio="40">
 *   <div slot="left">Configuration panel</div>
 *   <div slot="right">Preview panel</div>
 * </app-layout-builder>
 */
@customElement('app-layout-builder')
export class AppLayoutBuilder extends LitElement {
  /**
   * Modèle de hauteur et de défilement (#613).
   *
   * @cssprop [--app-layout-left-stacked-height=auto] - Hauteur de la colonne
   *   gauche en pile verticale (sous 900 px).
   *
   * Trois apps surchargeaient les classes INTERNES de ce composant depuis
   * leur propre CSS — classes non contractuelles, dont un changement ici
   * cassait silencieusement l'app qui les contournait. Le Playground avait dû
   * empiler des `!important` pour inverser le sticky ; Builder et Assistant
   * IA maintenaient deux fois la même surcharge « plein écran ».
   *
   * - `page-scroll` (défaut) : la page défile, la colonne DROITE est
   *   épinglée. Comportement historique — aucune app existante ne change.
   * - `fullscreen` : deux colonnes à défilement interne, la page ne défile
   *   pas. Prérequis côté app : un `body` de hauteur fixe en
   *   `overflow: hidden`.
   * - `sticky-left` : l'inverse de `page-scroll` — la colonne GAUCHE est
   *   épinglée pleine hauteur et la DROITE défile avec la page.
   *
   * `reflect: true` plutôt qu'un `setAttribute` dans `render()` : muter
   * l'élément pendant le rendu déclenche une nouvelle demande de mise à jour
   * et Lit finit par abandonner — le composant restait alors sans contenu,
   * ses colonnes jamais construites.
   */
  @property({ type: String, reflect: true })
  mode: 'page-scroll' | 'fullscreen' | 'sticky-left' = 'page-scroll';

  /**
   * Ratio initial du panneau gauche en pourcentage (ex: 40 pour 40%)
   */
  @property({ type: Number, attribute: 'left-ratio' })
  leftRatio = 40;

  /**
   * Largeur minimale du panneau gauche en pixels
   */
  @property({ type: Number, attribute: 'min-left-width' })
  minLeftWidth = 280;

  /**
   * Largeur minimale du panneau droit en pixels
   */
  @property({ type: Number, attribute: 'min-right-width' })
  minRightWidth = 300;

  @state()
  private _isResizing = false;

  @state()
  private _currentLeftRatio = 40;

  // Éléments enfants à projeter (sauvegardés avant le rendu)
  private _leftContent: Element[] = [];
  private _rightContent: Element[] = [];
  private _contentMoved = false;

  // Light DOM pour hériter des styles DSFR
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this._currentLeftRatio = this.leftRatio;
    this._setupResizer();
    // Sauvegarder les éléments enfants avant le premier rendu
    this._saveSlotContent();
  }

  /**
   * Sauvegarde les éléments enfants avec slot="left" et slot="right"
   * pour les déplacer après le rendu (Light DOM n'a pas de slots natifs)
   */
  private _saveSlotContent() {
    this._leftContent = Array.from(this.querySelectorAll('[slot="left"]'));
    this._rightContent = Array.from(this.querySelectorAll('[slot="right"]'));
  }

  /**
   * Déplace le contenu sauvegardé dans les conteneurs après le rendu
   */
  firstUpdated() {
    this._moveContent();
  }

  updated() {
    // S'assurer que le contenu est toujours dans les bons conteneurs
    if (!this._contentMoved) {
      this._moveContent();
    }
  }

  private _moveContent() {
    const leftContainer = this.querySelector('.builder-layout-left');
    const rightContainer = this.querySelector('.builder-layout-right');

    if (leftContainer && rightContainer) {
      this._leftContent.forEach((el) => leftContainer.appendChild(el));
      this._rightContent.forEach((el) => rightContainer.appendChild(el));
      this._contentMoved = true;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._cleanupResizer();
  }

  private _boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private _boundMouseUp: (() => void) | null = null;

  private _setupResizer() {
    this._boundMouseMove = this._handleMouseMove.bind(this);
    this._boundMouseUp = this._handleMouseUp.bind(this);
  }

  private _cleanupResizer() {
    if (this._boundMouseMove) {
      document.removeEventListener('mousemove', this._boundMouseMove);
    }
    if (this._boundMouseUp) {
      document.removeEventListener('mouseup', this._boundMouseUp);
    }
  }

  private _handleMouseDown(e: MouseEvent) {
    e.preventDefault();
    this._isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    if (this._boundMouseMove) {
      document.addEventListener('mousemove', this._boundMouseMove);
    }
    if (this._boundMouseUp) {
      document.addEventListener('mouseup', this._boundMouseUp);
    }
  }

  private _handleMouseMove(e: MouseEvent) {
    if (!this._isResizing) return;

    const container = this.querySelector('.builder-layout-container') as HTMLElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    let newWidth = e.clientX - containerRect.left;

    // Contraintes min/max en pixels
    newWidth = Math.max(this.minLeftWidth, Math.min(newWidth, containerWidth - this.minRightWidth));

    // Convertir en ratio
    this._currentLeftRatio = (newWidth / containerWidth) * 100;
    this.requestUpdate();
  }

  private _handleMouseUp() {
    if (this._isResizing) {
      this._isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (this._boundMouseMove) {
        document.removeEventListener('mousemove', this._boundMouseMove);
      }
      if (this._boundMouseUp) {
        document.removeEventListener('mouseup', this._boundMouseUp);
      }
    }
  }

  render() {
    return html`
      <div class="builder-layout-container">
        <aside class="builder-layout-left" style="flex: 0 0 ${this._currentLeftRatio}%">
          <!-- Contenu slot="left" sera déplacé ici -->
        </aside>

        <div
          class="builder-layout-resizer ${this._isResizing ? 'dragging' : ''}"
          @mousedown="${this._handleMouseDown}"
        ></div>

        <main class="builder-layout-right" id="main-content">
          <!-- Contenu slot="right" sera déplacé ici -->
        </main>
      </div>

      <style>
        /* Modèle « page-scroll » : la page défile (le header sort du champ),
           le panneau DROIT est sticky et garde une hauteur ~pleine page, donc
           en scrollant on cadre la zone de travail plein écran (header parti,
           footer encore dessous). La colonne GAUCHE défile avec la page. */
        /* Ce composant rend en LIGHT DOM (createRenderRoot renvoie this) :
           :host() n'y matche rien. Les regles de mode ci-dessous doivent
           donc cibler la balise, comme cette regle de base. */
        app-layout-builder {
          display: block;
        }

        .builder-layout-container {
          display: flex;
          align-items: flex-start;
          /* Au moins un écran de hauteur : garantit qu'on peut faire sortir le
             header par le scroll sans déjà atteindre le footer. */
          min-height: 100vh;
          min-height: 100dvh;
        }

        .builder-layout-left {
          overflow-x: hidden;
          border-right: 1px solid var(--border-default-grey);
          background: var(--background-alt-grey);
          display: flex;
          flex-direction: column;
          min-width: 280px;
        }

        .builder-layout-resizer {
          width: 6px;
          background: var(--border-default-grey);
          cursor: col-resize;
          flex-shrink: 0;
          align-self: stretch;
          transition: background 0.15s;
        }

        .builder-layout-resizer:hover,
        .builder-layout-resizer.dragging {
          background: var(--border-action-high-blue-france);
        }

        .builder-layout-right {
          flex: 1;
          position: sticky;
          /* Le header commun est collant (lot UX #538) : le panneau se cale
             sous sa hauteur réelle, publiée par <app-header> dans
             --app-header-h. */
          top: calc(var(--app-header-h, 0px) + var(--app-action-bar-h, 0px));
          align-self: flex-start;
          /* Hauteur utile ~pleine page (header/footer non comptés) avec une
             petite marge ; défile en interne si l'aperçu est plus grand. */
          min-height: calc(
            100vh - var(--app-header-h, 0px) - var(--app-action-bar-h, 0px) - 1.5rem
          );
          min-height: calc(
            100dvh - var(--app-header-h, 0px) - var(--app-action-bar-h, 0px) - 1.5rem
          );
          max-height: calc(100vh - var(--app-header-h, 0px) - var(--app-action-bar-h, 0px));
          max-height: calc(100dvh - var(--app-header-h, 0px) - var(--app-action-bar-h, 0px));
          overflow: auto;
          background: var(--background-default-grey);
          display: flex;
          flex-direction: column;
        }

        /* ---- Mode « fullscreen » : deux colonnes à défilement interne ----
           Absorbe les surcharges dupliquées de Builder et Assistant IA. La
           page ne défile pas : chaque colonne défile chez elle, et le footer
           n'est pas atteignable — c'est le compromis assumé d'un éditeur
           plein écran. Prérequis côté app : un body de hauteur fixe en
           overflow: hidden. */
        app-layout-builder[mode='fullscreen'] {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }

        app-layout-builder[mode='fullscreen'] .builder-layout-container {
          flex: 1 1 auto;
          min-height: 0;
          align-items: stretch;
        }

        app-layout-builder[mode='fullscreen'] .builder-layout-left {
          min-height: 0;
          overflow-y: auto;
        }

        app-layout-builder[mode='fullscreen'] .builder-layout-right {
          position: static;
          min-height: 0;
          max-height: none;
          overflow: auto;
        }

        /* ---- Mode « sticky-left » : l'inverse de page-scroll ----
           La colonne GAUCHE est épinglée pleine hauteur et défile chez elle ;
           la DROITE grandit et défile avec la page. Absorbe les !important
           du Playground, qui inversait le sticky à la main. */
        app-layout-builder[mode='sticky-left'] .builder-layout-left {
          position: sticky;
          top: calc(var(--app-header-h, 0px) + var(--app-action-bar-h, 0px));
          height: calc(100vh - var(--app-header-h, 0px) - var(--app-action-bar-h, 0px));
          height: calc(100dvh - var(--app-header-h, 0px) - var(--app-action-bar-h, 0px));
          align-self: flex-start;
          overflow: hidden;
        }

        app-layout-builder[mode='sticky-left'] .builder-layout-right {
          position: static;
          min-height: 100vh;
          min-height: 100dvh;
          max-height: none;
          overflow: visible;
        }

        /* Responsive: stack vertical on mobile (pas de sticky) */
        /* Seuil partage avec le chrome (chrome-breakpoints.ts, STACK_MAX_PX) :
           sous cette largeur les colonnes s'empilent ET rien n'est epingle en
           haut — ni l'en-tete, ni la barre de titre. Litteral obligatoire :
           Lit refuse les expressions dans un <style>. Verrouille sur la
           constante par tests/apps/app-ui/chrome-mobile.test.ts. */
        @media (max-width: 900px) {
          .builder-layout-container {
            flex-direction: column;
            min-height: 0;
          }

          .builder-layout-left {
            width: 100% !important;
            border-right: none;
            border-bottom: 1px solid var(--border-default-grey);
            /* Hauteur de la colonne gauche en pile verticale. Propriete
               PUBLIQUE : une app qui veut un demi-ecran d'editeur la pose sur
               l'hote, au lieu de surcharger cette classe interne. */
            /* flex 0 0 auto !important est indispensable : render() pose un
               style INLINE flex: 0 0 <ratio>% sur cette colonne, qui l'emporte
               sur toute feuille. En pile verticale ce pourcentage se resout en
               taille de contenu et height reste sans effet. */
            flex: 0 0 auto !important;
            height: var(--app-layout-left-stacked-height, auto);
            overflow: auto;
          }

          .builder-layout-resizer {
            display: none;
          }

          .builder-layout-right {
            position: static;
            min-height: 0;
            max-height: none;
          }

          /* En pile verticale, aucun mode ne conserve son épinglage : les
             deux colonnes défilent avec la page. */
          app-layout-builder[mode='sticky-left'] .builder-layout-left {
            /* La regle de BASE de ce mode pose une hauteur plein ecran avec
               une specificite superieure a la classe seule : elle gagnerait
               ici meme dans la media query, et la propriete publique
               resterait sans effet. On la neutralise au meme niveau. */
            position: static;
            height: var(--app-layout-left-stacked-height, auto);
            overflow: auto;
          }

          app-layout-builder[mode='sticky-left'] .builder-layout-right {
            min-height: 0;
          }

          app-layout-builder[mode='fullscreen'] .builder-layout-left,
          app-layout-builder[mode='fullscreen'] .builder-layout-right {
            overflow: visible;
          }
        }
      </style>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-layout-builder': AppLayoutBuilder;
  }
}

import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ContextFilterLike } from '@dsfr-data/shared/lib';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import { CONTEXT_CONNECTED_EVENT, findContextHostById } from '../utils/context-registry.js';

/**
 * Ce que ce composant lit d'un `dsfr-data-context` : ses filtres actifs
 * (vue structurelle, #681 — pas d'import du composant, qui vit dans un
 * autre bundle pour la carte).
 */
interface ContextReader extends HTMLElement {
  activeFilters(): ContextFilterLike[];
}

/** Reperage des marqueurs `{{champ}}` d'un gabarit (pas de regex gloutonne) */
const PLACEHOLDER = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g;

/**
 * &lt;dsfr-data-context-value&gt; — la valeur courante d'un filtre, dans une phrase (#742).
 *
 * `dsfr-data-context-tags` LISTE les filtres actifs ; il ne s'insere pas
 * dans un titre. Ce composant rend la valeur d'un filtre du contexte comme
 * du texte, seule ou interpolee dans un gabarit :
 *
 * ```html
 * &lt;h2&gt;
 *   &lt;dsfr-data-context-value for="ctx"
 *     template="Résultats pour {{departement}}"
 *     fallback="Résultats pour toute la France" live&gt;
 *   &lt;/dsfr-data-context-value&gt;
 * &lt;/h2&gt;
 * ```
 *
 * Accessibilite : `live` fait du composant une region live discrete
 * (`aria-live="polite"`), pour qu'un titre qui suit le filtre annonce le
 * changement de contenu. A poser sur UN seul element de la page — trois
 * libelles qui parlent en meme temps sont un bruit, pas une aide.
 *
 * Le texte rendu est du TEXTE : la valeur d'un filtre traverse le rendu Lit,
 * jamais l'analyseur HTML.
 *
 * @attr {string} for - Id du &lt;dsfr-data-context&gt; observe (requis).
 * @attr {string} field - Champ dont la valeur est rendue. Raccourci de `template="{{champ}}"` ; ignore si `template` est pose.
 * @attr {string} template - Gabarit texte ou chaque `{{champ}}` est remplace par la valeur courante du filtre de ce champ.
 * @attr {string} fallback - Texte de repli rendu tant qu'un champ cite n'a aucune valeur. Vide = le composant ne rend rien.
 * @attr {boolean} live - Fait du composant une region live polie : le changement de valeur est annonce aux lecteurs d'écran.
 */
@customElement('dsfr-data-context-value')
export class DsfrDataContextValue extends LitElement {
  /** Id du dsfr-data-context observe */
  @property({ type: String })
  for = '';

  /**
   * Champ dont la valeur est rendue — raccourci de `template="{{champ}}"`.
   * Ignore quand `template` est pose.
   */
  @property({ type: String })
  field = '';

  /**
   * Gabarit texte : chaque `{{champ}}` est remplace par la valeur courante
   * du filtre de ce champ (« Résultats pour {{departement}} »).
   */
  @property({ type: String })
  template = '';

  /**
   * Texte rendu tant qu'un champ cite n'a aucune valeur — le repli declare
   * de #742. Vide : le composant ne rend rien du tout.
   */
  @property({ type: String })
  fallback = '';

  /**
   * Région live polie : le titre annonce le changement de contenu aux
   * lecteurs d'écran. À poser sur UN seul élément de la page.
   */
  @property({ type: Boolean })
  live = false;

  private _context: ContextReader | null = null;

  private _onContextChange = () => this.requestUpdate();

  /** Un contexte vise par id vient d'être connecte : (re)bind si c'est le notre (#678) */
  private _onContextConnected = (e: Event) => {
    const id = (e as CustomEvent<{ id: string | null }>).detail?.id;
    if (this.for && id === this.for) this._bind();
  };

  /** Light DOM : le texte herite des styles de la page (titre, paragraphe) */
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
    // Bind differe : le contexte peut être declare apres dans le fragment
    queueMicrotask(() => this._bind());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
    this._unbind();
  }

  willUpdate(changed: Map<PropertyKey, unknown>) {
    super.willUpdate(changed);
    if (changed.has('for') && this.hasUpdated) {
      this._unbind();
      this._bind();
    }
    if (changed.has('live') || !this.hasUpdated) {
      if (this.live) {
        this.setAttribute('aria-live', 'polite');
        this.setAttribute('role', 'status');
      } else {
        this.removeAttribute('aria-live');
        this.removeAttribute('role');
      }
    }
  }

  private _unbind(): void {
    this._context?.removeEventListener('dsfr-data-context-change', this._onContextChange);
    this._context = null;
  }

  private _bind(): void {
    if (!this.isConnected) return;
    const host = this.for ? findContextHostById(this.for) : null;
    if (!host || !('activeFilters' in host)) {
      reportConfigError(
        this,
        'dsfr-data-context-value',
        this.for
          ? `dsfr-data-context introuvable : "${this.for}"`
          : 'attribut "for" requis (id du dsfr-data-context observe)'
      );
      this.requestUpdate();
      return;
    }
    clearConfigError(this);
    this._context = host as unknown as ContextReader;
    this._context.addEventListener('dsfr-data-context-change', this._onContextChange);
    this.requestUpdate();
  }

  /** Gabarit effectif : `template` s'il est pose, sinon le raccourci `field` */
  private _effectiveTemplate(): string {
    if (this.template) return this.template;
    if (this.field) return `{{${this.field}}}`;
    return '';
  }

  /**
   * Valeur humaine courante d'un champ — la premiere du contexte, comme les
   * tags. `null` quand aucun filtre actif ne porte ce champ.
   */
  private _valueOf(field: string): string | null {
    for (const filter of this._context?.activeFilters() ?? []) {
      if (filter.field !== field) continue;
      const value = filter.displayValue();
      if (value !== '') return value;
    }
    return null;
  }

  /**
   * Texte rendu. Un seul champ cite sans valeur suffit a basculer sur le
   * repli : « Résultats pour  » serait pire qu'une phrase de repli.
   */
  _resolveText(): string {
    const template = this._effectiveTemplate();
    if (!template) return this.fallback;
    let complete = true;
    const text = template.replace(PLACEHOLDER, (_match, rawField: string) => {
      const value = this._valueOf(rawField.trim());
      if (value === null) {
        complete = false;
        return '';
      }
      return value;
    });
    return complete ? text : this.fallback;
  }

  render() {
    return html`${this._resolveText()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-context-value': DsfrDataContextValue;
  }
}

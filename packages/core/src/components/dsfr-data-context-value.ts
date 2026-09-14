import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { reportConfigError } from '../utils/config-error.js';
import { ContextBindingMixin } from '../utils/context-binding.js';
import type { ContextHost } from '../utils/context-registry.js';

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
export class DsfrDataContextValue extends ContextBindingMixin(LitElement) {
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

  private _onContextChange = () => this.requestUpdate();

  /** Le contexte observe est vise par `for` (et non par `context`) */
  protected contextTargetId(): string {
    return (this.for || '').trim();
  }

  /**
   * La liaison est TOUJOURS tentee, meme sans `for` : c'est elle qui signale
   * l'attribut manquant (#742).
   */
  get _contextMode(): boolean {
    return true;
  }

  protected contextRebindProps(): PropertyKey[] {
    return ['for'];
  }

  protected contextErrorTag(): string {
    return 'dsfr-data-context-value';
  }

  /** Contexte introuvable — ou `for` absent, la cause la plus frequente */
  protected onContextUnavailable(): void {
    reportConfigError(
      this,
      'dsfr-data-context-value',
      this.for
        ? `dsfr-data-context introuvable : "${this.for}"`
        : 'attribut "for" requis (id du dsfr-data-context observe)'
    );
    this.requestUpdate();
  }

  /** Contexte resolu : ses changements de filtres redessinent la phrase */
  protected onContextBound(context: ContextHost): void {
    context.addEventListener('dsfr-data-context-change', this._onContextChange);
    this.requestUpdate();
  }

  protected onContextUnbound(context: ContextHost | null): void {
    context?.removeEventListener('dsfr-data-context-change', this._onContextChange);
  }

  /** Light DOM : le texte herite des styles de la page (titre, paragraphe) */
  createRenderRoot() {
    return this;
  }

  willUpdate(changed: Map<PropertyKey, unknown>) {
    super.willUpdate(changed);
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

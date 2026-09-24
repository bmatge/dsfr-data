import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { toNumber, CHOROPLETH_SCALES } from '@dsfr-data/shared/lib';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { getByPath } from '../utils/json-path.js';
import { formatNumber } from '../utils/formatters.js';
import { sanitizeTemplateUrl } from '../utils/template-expression.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import {
  renderSourceLoading,
  renderSourceError,
  renderSourceIdle,
  IDLE_MESSAGE_DEFAULT,
} from '../utils/status-templates.js';

// Palettes : source unique @dsfr-data/shared (#302) — la categorical locale
// differait de PALETTE_COLORS : meme attribut selected-palette que chart,
// couleurs differentes (dashboard incoherent visuellement).

interface PodiumItem {
  label: string;
  subtitle: string;
  value: number;
  ratio: number;
  color: string;
  rank: number;
  image: string;
  icon: string;
  picto: string;
}

/**
 * Classes d'icone acceptees pour `icon` / `icon-field` : liste blanche stricte.
 * Ce qui vient de la donnee ne pose qu'une classe CSS, jamais du balisage.
 */
const ICON_CLASS_RE = /^(fr-icon|ri)-[a-z0-9-]+$/;

/**
 * Noms de pictogramme acceptes pour `picto` / `picto-field`. La donnee ne
 * fournit qu'un NOM ; l'URL est construite en le concatenant a `picto-base`,
 * attribut de la balise donc ecrit par l'integrateur. Ce decoupage exclut
 * mecaniquement `../` et `javascript:` sans dependre d'un assainisseur.
 */
const PICTO_SEGMENT_RE = /^[a-z0-9-]+$/;

/** `true` si le nom est une suite de segments `[a-z0-9-]+` separes par `/`. */
function isPictoName(value: string): boolean {
  const segments = value.split('/');
  return segments.length > 0 && segments.every((s) => PICTO_SEGMENT_RE.test(s));
}

/** Cles deja signalees — une valeur refusee n'avertit qu'une fois (#7139). */
const mediaWarned = new Set<string>();

/** Remet a zero la deduplication des avertissements (tests). */
export function resetPodiumMediaWarnings(): void {
  mediaWarned.clear();
}

function warnRejected(kind: string, field: string, value: string, why: string): void {
  const key = `${kind}|${field}|${value}`;
  if (mediaWarned.has(key)) return;
  mediaWarned.add(key);
  console.warn(
    `dsfr-data-podium (${kind}) : la valeur « ${value} » du champ « ${field} » est ignoree — ${why}`
  );
}

/**
 * <dsfr-data-podium> - Classement visuel avec barres proportionnelles
 *
 * Affiche un podium (top N) avec rang, label, barre de progression et valeur.
 * Se connecte au pipeline dsfr-data-source / dsfr-data-query.
 *
 * Trois axes de presentation independants, a ne pas confondre :
 * `bar` dit CE QUE PORTE la barre, `bar-position` dit OU elle est, `border`
 * pose un lisere purement decoratif. Les trois se combinent librement.
 *
 * @example
 * <dsfr-data-podium
 *   source="regions"
 *   label-field="nom"
 *   value-field="population"
 *   subtitle="Region"
 *   value-unit="hab."
 *   selected-palette="sequentialDescending"
 *   max-items="5">
 * </dsfr-data-podium>
 */
@customElement('dsfr-data-podium')
export class DsfrDataPodium extends SourceSubscriberMixin(LitElement) {
  /** Id de la source (ou du transformateur) dont ce composant consomme les données. */
  @property({ type: String })
  source = '';

  /**
   * Chemin vers le champ label
   * @champ nom
   */
  @property({ type: String, attribute: 'label-field' })
  labelField = '';

  /**
   * Chemin vers le champ valeur (numérique)
   * @champ nom
   */
  @property({ type: String, attribute: 'value-field' })
  valueField = '';

  /** Texte fixe affiché sous chaque label */
  @property({ type: String })
  subtitle = '';

  /**
   * Chemin vers un champ pour le sous-titre (prioritaire sur subtitle)
   * @champ nom
   */
  @property({ type: String, attribute: 'subtitle-field' })
  subtitleField = '';

  /** Unité affichée après la valeur */
  @property({ type: String, attribute: 'value-unit' })
  valueUnit = '';

  /** Palette de couleurs pour la bordure gauche */
  @property({ type: String, attribute: 'selected-palette' })
  selectedPalette = 'sequentialDescending';

  /** Nombre maximum d'items affichés */
  @property({ type: Number, attribute: 'max-items' })
  maxItems = 5;

  /** Desactive le tri automatique (desc par valeur) */
  @property({ type: Boolean, attribute: 'no-sort' })
  noSort = false;

  /** Valeur max forcee pour le calcul des barres (ex: 100 pour des %) */
  @property({ type: Number, attribute: 'bar-max' })
  barMax?: number;

  /**
   * Chemin vers un champ contenant l'URL d'une image (logo, blason), rendue
   * en vignette 40 px entre le rang et le libellé.
   *
   * L'URL vient de la donnée : elle passe par la même liste blanche de schémas
   * que le format `{{champ:url}}` (`http:`, `https:`, `mailto:`, `tel:` ou URL
   * relative). Une URL refusée n'affiche rien et avertit en console, une fois
   * par valeur. Exclusif avec `icon-field` / `icon` et `picto` / `picto-field`
   * (l'image l'emporte, et le cumul est signalé).
   * @champ nom
   */
  @property({ type: String, attribute: 'image-field' })
  imageField = '';

  /** Forme de la vignette d'`image-field` : `square` (défaut) ou `circle`. */
  @property({ type: String, attribute: 'image-shape' })
  imageShape = 'square';

  /**
   * Chemin vers un champ contenant une classe d'icône DSFR ou Remix
   * (`fr-icon-building-line`, `ri-map-pin-line`), rendue 40 px en Bleu France.
   *
   * Liste blanche stricte `^(fr-icon|ri)-[a-z0-9-]+$` : ce qui vient de la
   * donnée ne pose qu'une classe CSS, jamais du balisage. Une valeur hors
   * motif est ignorée avec un avertissement nommant le champ et la valeur
   * (dédupliqué : une fois par valeur refusée).
   *
   * ⚠️ 40 px sort de l'échelle documentée du DSFR, qui s'arrête à
   * `fr-icon--lg` = 32 px ; au-delà le DSFR parle de pictogramme. Le rendu
   * marche (le masque d'une `fr-icon-*` est en `1em`, donc pilotable par
   * `font-size`), mais c'est un usage hors échelle : `picto` est la voie
   * conforme pour une illustration de cette taille.
   * @champ nom
   */
  @property({ type: String, attribute: 'icon-field' })
  iconField = '';

  /** Même classe d'icône pour tous les items. Même liste blanche qu'`icon-field`. */
  @property({ type: String })
  icon = '';

  /**
   * Nom d'un pictogramme DSFR, identique pour tous les items. L'URL est
   * construite en concaténant `picto-base` et ce nom (`<base><nom>.svg`) :
   * la donnée ne fournit jamais qu'un nom, contraint à
   * `^[a-z0-9-]+(/[a-z0-9-]+)*$`. Le balisage rendu est le `fr-artwork`
   * standard du DSFR, donc les couleurs viennent des classes DSFR et le mode
   * sombre suit sans travail.
   */
  @property({ type: String })
  picto = '';

  /**
   * Chemin vers un champ contenant le nom du pictogramme. Même contrainte que `picto`.
   * @champ nom
   */
  @property({ type: String, attribute: 'picto-field' })
  pictoField = '';

  /**
   * Préfixe d'URL des pictogrammes, écrit par l'intégrateur (jamais par la
   * donnée) — par exemple `/dsfr/artwork/pictograms/`. Sans lui, `picto` et
   * `picto-field` ne rendent rien et avertissent : c'est ce découpage
   * nom / base qui exclut `../` et `javascript:` par construction.
   */
  @property({ type: String, attribute: 'picto-base' })
  pictoBase = '';

  /**
   * Rendu du rang : `number` (chiffre, défaut), `medal` (pastille de la
   * couleur de l'item) ou `none` (masqué — l'ordre et la barre suffisent).
   *
   * En `medal`, la couleur d'encre du chiffre est choisie par calcul de
   * luminance relative WCAG : la rampe s'éclaircit, et du blanc dès son
   * **4e ton** serait illisible. Le chiffre reste `aria-hidden` : l'ordre est
   * porté par la position dans la liste, le chiffre n'en est qu'un rappel.
   *
   * ⚠️ La rampe est `CHOROPLETH_SCALES.sequentialDescending` (9 tons), de
   * `constants/choropleth-scales.ts` — **pas**
   * `PALETTE_COLORS.sequentialDescending` (5 tons), de
   * `constants/palette-colors.ts`, qui porte le même nom de clé. Lire la
   * seconde donne un tableau de contraste plausible et faux — c'est arrivé
   * trois fois quand les deux vivaient dans le même fichier (#969). Ratios
   * sur les 5 premiers tons, encre retenue en gras :
   *
   * | Rang | Couleur   | vs blanc  | vs `#161616` |
   * |------|-----------|-----------|--------------|
   * | 1    | `#000091` | **14,91** | 1,21         |
   * | 2    | `#2323B4` | **10,65** | 1,70         |
   * | 3    | `#4747E5` | **6,36**  | 2,84         |
   * | 4    | `#6A6AF4` | 4,22      | **4,29**     |
   * | 5    | `#8585F6` | 3,14      | **5,76**     |
   *
   * Le point bas est le **rang 4** : 4,29:1, sous AA texte normal (4,5:1) et
   * au-dessus de AA texte large (3:1). Aucune des deux encres n'atteint 4,5
   * sur `#6A6AF4`. Ces chiffres sont figés par
   * `tests/dsfr-data-podium-evolutions.test.ts`.
   */
  @property({ type: String })
  rank = 'number';

  /**
   * `horizontal` (défaut) ou `vertical` : barres verticales en colonnes,
   * une par item, dans l'ordre du classement.
   */
  @property({ type: String })
  orientation = 'horizontal';

  /**
   * `list` (défaut) ou `podium` : estrade 2‑1‑3, le premier au centre.
   *
   * L'inversion est **purement visuelle** (`order` CSS sur les éléments de
   * grille) : le DOM reste dans l'ordre 1‑2‑3, donc un lecteur d'écran et la
   * navigation clavier parcourent le classement dans l'ordre. Les items
   * au‑delà du 3e passent en liste compacte sous l'estrade, dans le même
   * `<ol>`.
   */
  @property({ type: String })
  layout = 'list';

  /**
   * Ce que porte la barre de donnée : `proportional` (longueur = la donnée,
   * défaut), `full` (pleine largeur, la couleur seule distingue les rangs) ou
   * `none` (aucune barre). Indépendant de `bar-position` et de `border`.
   */
  @property({ type: String })
  bar = 'proportional';

  /**
   * Où la barre se place : `inline` (6 px sous le libellé, défaut),
   * `between` (16 px entre un libellé de 130 px et la valeur, façon
   * graphique en barres horizontal), `top` ou `bottom` (trait de 4 px en
   * haut ou en bas de l'item, façon liseré mais proportionnel).
   * Indépendant de `bar` et de `border`.
   */
  @property({ type: String, attribute: 'bar-position' })
  barPosition = 'inline';

  /**
   * Liseré gauche purement décoratif, à la couleur de l'item : `left`
   * (défaut) ou `none`. Indépendant de `bar` et de `bar-position` — la barre
   * porte la donnée, le liseré ne porte que la couleur.
   */
  @property({ type: String })
  border = 'left';

  /**
   * Supprime les arrondis (0 px), conforme DSFR strict. **C'est le rendu par
   * défaut depuis la 0.34** : l'attribut n'existe que pour l'écrire
   * explicitement. L'échappatoire est `rounded`, qui rétablit les anciens
   * arrondis (4 px sur l'item, 3 px sur la barre) ; si les deux sont posés,
   * `square` l'emporte.
   */
  @property({ type: Boolean })
  square = false;

  /** Rétablit les arrondis d'avant la 0.34 (item 4 px, barre 3 px). */
  @property({ type: Boolean })
  rounded = false;

  /**
   * Message rendu quand l'amont attend un filtre (`require-where`, #690).
   * Distinct de « aucune donnée » : aucune requête n'a été faite. Vide,
   * le libellé par défaut est utilisé.
   */
  @property({ type: String, attribute: 'idle-message' })
  idleMessage = IDLE_MESSAGE_DEFAULT;

  @state()
  private _data: Record<string, unknown>[] = [];

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-podium');
  }

  static styles = [];

  onSourceReset(): void {
    this._data = [];
  }

  onSourceData(data: unknown): void {
    this._data = Array.isArray(data) ? data : [];
  }

  /** `true` des qu'une vignette (image, picto ou icone) est configuree. */
  private get _hasMedia(): boolean {
    return Boolean(this.imageField || this.iconField || this.icon || this.picto || this.pictoField);
  }

  private _resolveImage(record: Record<string, unknown>): string {
    if (!this.imageField) return '';
    const raw = getByPath(record, this.imageField);
    if (raw === null || raw === undefined || raw === '') return '';
    const safe = sanitizeTemplateUrl(raw);
    if (!safe) {
      warnRejected('image-field', this.imageField, String(raw), 'schema d’URL non autorise');
    }
    return safe;
  }

  private _resolveIcon(record: Record<string, unknown>): string {
    const fromField = this.iconField ? getByPath(record, this.iconField) : undefined;
    const raw = fromField !== undefined && fromField !== null ? String(fromField) : this.icon;
    if (!raw) return '';
    if (ICON_CLASS_RE.test(raw)) return raw;
    warnRejected(
      'icon-field',
      this.iconField || 'icon',
      raw,
      'hors liste blanche ^(fr-icon|ri)-[a-z0-9-]+$'
    );
    return '';
  }

  private _resolvePicto(record: Record<string, unknown>): string {
    const fromField = this.pictoField ? getByPath(record, this.pictoField) : undefined;
    const raw = fromField !== undefined && fromField !== null ? String(fromField) : this.picto;
    if (!raw) return '';
    if (!isPictoName(raw)) {
      warnRejected(
        'picto-field',
        this.pictoField || 'picto',
        raw,
        'hors liste blanche ^[a-z0-9-]+(/[a-z0-9-]+)*$'
      );
      return '';
    }
    if (!this.pictoBase) {
      warnRejected('picto-base', this.pictoField || 'picto', raw, 'picto-base n’est pas pose');
      return '';
    }
    return raw;
  }

  private _processItems(): PodiumItem[] {
    if (!this._data.length || !this.labelField || !this.valueField) return [];

    // Extract label + value + subtitle. L'enregistrement d'origine est garde
    // le temps du tri : les vignettes ne sont resolues qu'apres troncature,
    // pour qu'un jeu de 10 000 lignes ne produise pas 10 000 validations.
    let items = this._data.map((record) => ({
      label: String(getByPath(record, this.labelField) ?? ''),
      subtitle: this.subtitleField
        ? String(getByPath(record, this.subtitleField) ?? '')
        : this.subtitle,
      value: toNumber(getByPath(record, this.valueField)),
      ratio: 0,
      color: '',
      rank: 0,
      image: '',
      icon: '',
      picto: '',
      record,
    }));

    // Sort descending by value (unless disabled)
    if (!this.noSort) {
      items.sort((a, b) => b.value - a.value);
    }

    // Truncate
    items = items.slice(0, this.maxItems);

    // Compute bar ratios
    const maxValue = this.barMax ?? Math.max(...items.map((i) => i.value), 1);

    // Pick palette colors
    const palette =
      CHOROPLETH_SCALES[this.selectedPalette] ?? CHOROPLETH_SCALES['sequentialDescending'];

    items.forEach((item, index) => {
      item.ratio = maxValue > 0 ? item.value / maxValue : 0;
      item.color = palette[index % palette.length];
      item.rank = index + 1;
    });

    if (this._hasMedia) {
      items.forEach((item) => {
        item.image = this._resolveImage(item.record);
        if (item.image) return;
        item.picto = this._resolvePicto(item.record);
        if (item.picto) return;
        item.icon = this._resolveIcon(item.record);
      });
    }

    return items.map(({ record: _record, ...item }) => item);
  }

  private _formatValue(value: number): string {
    const formatted = formatNumber(value);
    return this.valueUnit ? `${formatted} ${this.valueUnit}` : formatted;
  }

  private _getAriaLabel(): string {
    const items = this._processItems();
    if (!items.length) return 'Classement vide';
    return `Classement : ${items.map((i) => `${i.rank}. ${i.label}, ${this._formatValue(i.value)}`).join(' ; ')}`;
  }

  render() {
    if (this._sourceLoading) {
      return html`
        <div class="dsfr-data-podium">${renderSourceLoading('dsfr-data-podium')}</div>
        ${this._renderStyles()}
      `;
    }

    if (this._sourceError) {
      return html`
        <div class="dsfr-data-podium">
          ${renderSourceError('dsfr-data-podium', this._sourceError)}
        </div>
        ${this._renderStyles()}
      `;
    }

    if (this._sourceIdle) {
      return html`
        <div class="dsfr-data-podium">
          ${renderSourceIdle('dsfr-data-podium', this.idleMessage)}
        </div>
        ${this._renderStyles()}
      `;
    }

    const items = this._processItems();

    if (!items.length) {
      return html`
        <div class="dsfr-data-podium">
          <div class="dsfr-data-podium__empty">Aucune donnee</div>
        </div>
        ${this._renderStyles()}
      `;
    }

    this._warnExclusiveMedia();

    return html`
      <ol class="${this._listClasses()}" role="list" aria-label="${this._getAriaLabel()}">
        ${items.map((item) => this._renderItem(item))}
      </ol>
      ${this._renderStyles()}
    `;
  }

  /** Classes de la liste : rien de plus que `dsfr-data-podium` tant que rien n'est pose. */
  private _listClasses(): string {
    const cls = ['dsfr-data-podium'];
    if (this.orientation === 'vertical') cls.push('dsfr-data-podium--vertical');
    if (this.layout === 'podium') cls.push('dsfr-data-podium--podium');
    if (this.rank === 'medal') cls.push('dsfr-data-podium--rank-medal');
    if (this.bar === 'full') cls.push('dsfr-data-podium--bar-full');
    if (this.barPosition === 'between') cls.push('dsfr-data-podium--bar-between');
    if (this.barPosition === 'top') cls.push('dsfr-data-podium--bar-top');
    if (this.barPosition === 'bottom') cls.push('dsfr-data-podium--bar-bottom');
    if (this.border === 'none') cls.push('dsfr-data-podium--border-none');
    if (this.imageShape === 'circle') cls.push('dsfr-data-podium--image-circle');
    if (this._hasMedia) cls.push('dsfr-data-podium--has-media');
    if (this.rounded && !this.square) cls.push('dsfr-data-podium--rounded');
    return cls.join(' ');
  }

  private _warnExclusiveMedia(): void {
    const posed = [
      this.imageField && 'image-field',
      (this.iconField || this.icon) && 'icon-field/icon',
      (this.picto || this.pictoField) && 'picto/picto-field',
    ].filter(Boolean) as string[];
    if (posed.length < 2) return;
    const key = `exclusive|${posed.join(',')}`;
    if (mediaWarned.has(key)) return;
    mediaWarned.add(key);
    console.warn(
      `dsfr-data-podium : ${posed.join(' et ')} sont poses ensemble alors qu'ils sont exclusifs — ` +
        `l'ordre de priorite applique est image-field, puis picto, puis icon.`
    );
  }

  private _barWidthPercent(item: PodiumItem): number {
    return this.bar === 'full' ? 100 : Math.round(item.ratio * 100);
  }

  private _renderMedia(item: PodiumItem) {
    if (item.image) {
      return html`<img
        class="dsfr-data-podium__image"
        src="${item.image}"
        alt=""
        aria-hidden="true"
      />`;
    }
    if (item.picto) {
      const href = `${this.pictoBase}${item.picto}.svg`;
      return html`<svg
        class="dsfr-data-podium__picto fr-artwork"
        aria-hidden="true"
        viewBox="0 0 80 80"
        width="80"
        height="80"
      >
        <use class="fr-artwork-decorative" href="${href}#artwork-decorative"></use>
        <use class="fr-artwork-minor" href="${href}#artwork-minor"></use>
        <use class="fr-artwork-major" href="${href}#artwork-major"></use>
      </svg>`;
    }
    if (item.icon) {
      return html`<span class="dsfr-data-podium__icon ${item.icon}" aria-hidden="true"></span>`;
    }
    return nothing;
  }

  /**
   * Encre du chiffre d'une pastille : blanc ou gris de titre, choisi par
   * luminance relative WCAG de la couleur de l'item. Aucun hexadecimal n'est
   * ecrit ici : la classe rendue pointe vers deux tokens DSFR (grey-1000-50 /
   * grey-50-1000), croises sous [data-fr-theme="dark"] pour que l'encre reste
   * la meme dans les deux themes — le fond de la pastille, lui, est une
   * couleur de palette qui ne change pas avec le theme.
   */
  private _medalInk(color: string): string {
    return relativeLuminance(color) > 0.19
      ? 'dsfr-data-podium__rank--ink-dark'
      : 'dsfr-data-podium__rank--ink-light';
  }

  private _renderRank(item: PodiumItem) {
    if (this.rank === 'none') return nothing;
    if (this.rank === 'medal') {
      return html`<span
        class="dsfr-data-podium__rank dsfr-data-podium__rank--medal ${this._medalInk(item.color)}"
        aria-hidden="true"
        >${item.rank}</span
      >`;
    }
    return html`<span class="dsfr-data-podium__rank" aria-hidden="true">${item.rank}</span>`;
  }

  private _renderBar(item: PodiumItem, vertical = false) {
    if (this.bar === 'none') return nothing;
    const pct = this._barWidthPercent(item);
    return html`<div class="dsfr-data-podium__bar-track" aria-hidden="true">
      <div
        class="dsfr-data-podium__bar-fill"
        style="${vertical ? `height: ${pct}%` : `width: ${pct}%`}"
      ></div>
    </div>`;
  }

  private _renderItem(item: PodiumItem) {
    if (this.orientation === 'vertical') return this._renderVerticalItem(item);
    if (this.layout === 'podium' && item.rank <= 3) return this._renderStepItem(item);
    return this._renderListItem(item);
  }

  /**
   * Item de liste — la forme historique. Sans aucun des attributs de
   * presentation, ce gabarit produit exactement le DOM d'avant la 0.34.
   */
  private _renderListItem(item: PodiumItem) {
    const between = this.barPosition === 'between';
    return html`
      <li
        class="dsfr-data-podium__item${
          this.layout === 'podium' ? ' dsfr-data-podium__item--tail' : ''
        }"
        style="--podium-color: ${item.color}"
      >
        ${this._renderRank(item)}${this._renderMedia(item)}
        <div class="dsfr-data-podium__content">
          <div class="dsfr-data-podium__header">
            <div class="dsfr-data-podium__label-group">
              <span class="dsfr-data-podium__label">${item.label}</span>
              ${
                item.subtitle
                  ? html`<span class="dsfr-data-podium__subtitle">${item.subtitle}</span>`
                  : ''
              }
            </div>
            ${between ? this._renderBar(item) : nothing}
            <span class="dsfr-data-podium__value">${this._formatValue(item.value)}</span>
          </div>
          ${between ? nothing : this._renderBar(item)}
        </div>
      </li>
    `;
  }

  /** Colonne du mode vertical : valeur, barre, rang, libelle. */
  private _renderVerticalItem(item: PodiumItem) {
    return html`
      <li
        class="dsfr-data-podium__item"
        style="--podium-color: ${item.color}; --podium-ratio: ${item.ratio}"
      >
        <span class="dsfr-data-podium__value">${this._formatValue(item.value)}</span>
        ${this._renderBar(item, true)}${this._renderRank(item)}${this._renderMedia(item)}
        <div class="dsfr-data-podium__label-group">
          <span class="dsfr-data-podium__label">${item.label}</span>
          ${
            item.subtitle
              ? html`<span class="dsfr-data-podium__subtitle">${item.subtitle}</span>`
              : ''
          }
        </div>
      </li>
    `;
  }

  /**
   * Marche de l'estrade. Le DOM reste 1, 2, 3 : c'est `order` en CSS qui
   * place le premier au centre (cf. `layout`).
   */
  private _renderStepItem(item: PodiumItem) {
    return html`
      <li
        class="dsfr-data-podium__item dsfr-data-podium__item--step"
        style="--podium-color: ${item.color}"
      >
        ${this._renderMedia(item)}
        <div class="dsfr-data-podium__label-group">
          <span class="dsfr-data-podium__label">${item.label}</span>
          ${
            item.subtitle
              ? html`<span class="dsfr-data-podium__subtitle">${item.subtitle}</span>`
              : ''
          }
        </div>
        <span class="dsfr-data-podium__value">${this._formatValue(item.value)}</span>
        ${this._renderRank(item)}
      </li>
    `;
  }

  private _renderStyles() {
    return html`
      <style>
        .dsfr-data-podium {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .dsfr-data-podium__item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.25rem;
          background: var(--background-default-grey);
          border-radius: 0;
          border-left: 4px solid var(--podium-color, var(--border-default-grey));
        }
        .dsfr-data-podium--rounded .dsfr-data-podium__item {
          border-radius: 0.25rem;
        }
        .dsfr-data-podium--border-none .dsfr-data-podium__item {
          border-left: 0;
        }
        .dsfr-data-podium__rank {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-mention-grey);
          min-width: 1.75rem;
          text-align: center;
          flex-shrink: 0;
        }
        .dsfr-data-podium__content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .dsfr-data-podium__header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 1rem;
        }
        .dsfr-data-podium__label-group {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .dsfr-data-podium__label {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text-title-grey);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dsfr-data-podium__subtitle {
          font-size: 0.75rem;
          color: var(--text-mention-grey);
        }
        .dsfr-data-podium__value {
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--text-mention-grey);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .dsfr-data-podium__bar-track {
          height: 6px;
          background: var(--background-alt-grey);
          border-radius: 0;
          overflow: hidden;
        }
        .dsfr-data-podium__bar-fill {
          height: 100%;
          background: var(--podium-color, var(--background-flat-info));
          border-radius: 0;
          transition: width 0.3s ease;
        }
        .dsfr-data-podium--rounded .dsfr-data-podium__bar-track,
        .dsfr-data-podium--rounded .dsfr-data-podium__bar-fill {
          border-radius: 3px;
        }

        /* Vignettes — image, pictogramme, icone */
        .dsfr-data-podium__image {
          width: 2.5rem;
          height: 2.5rem;
          flex-shrink: 0;
          object-fit: cover;
          border-radius: 0;
        }
        .dsfr-data-podium--rounded .dsfr-data-podium__image {
          border-radius: 0.25rem;
        }
        .dsfr-data-podium--image-circle .dsfr-data-podium__image {
          border-radius: 50%;
        }
        .dsfr-data-podium__picto {
          width: 2.5rem;
          height: 2.5rem;
          flex-shrink: 0;
        }
        .dsfr-data-podium__icon {
          font-size: 2.5rem;
          line-height: 1;
          flex-shrink: 0;
          color: var(--text-active-blue-france);
        }
        .dsfr-data-podium__icon::before {
          --icon-size: 2.5rem;
        }

        /* Rang en pastille */
        .dsfr-data-podium__rank--medal {
          width: 2rem;
          height: 2rem;
          min-width: 2rem;
          border-radius: 50%;
          background: var(--podium-color, var(--background-alt-grey));
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          line-height: 1;
        }
        .dsfr-data-podium--has-media .dsfr-data-podium__rank--medal {
          width: 1.5rem;
          height: 1.5rem;
          min-width: 1.5rem;
          font-size: 0.75rem;
        }
        .dsfr-data-podium__rank--ink-light {
          color: var(--grey-1000-50);
        }
        .dsfr-data-podium__rank--ink-dark {
          color: var(--grey-50-1000);
        }
        [data-fr-theme='dark'] .dsfr-data-podium__rank--ink-light {
          color: var(--grey-50-1000);
        }
        [data-fr-theme='dark'] .dsfr-data-podium__rank--ink-dark {
          color: var(--grey-1000-50);
        }

        /* bar-position="between" : libelle 130 px, barre 16 px, valeur */
        .dsfr-data-podium--bar-between .dsfr-data-podium__header {
          align-items: center;
        }
        .dsfr-data-podium--bar-between .dsfr-data-podium__label-group {
          width: 8.125rem;
          flex-shrink: 0;
        }
        .dsfr-data-podium--bar-between .dsfr-data-podium__bar-track {
          flex: 1;
          height: 1rem;
        }
        .dsfr-data-podium--bar-between .dsfr-data-podium__content {
          gap: 0;
        }

        /* bar-position="top" / "bottom" : trait de 4 px sur l'item */
        .dsfr-data-podium--bar-top .dsfr-data-podium__item,
        .dsfr-data-podium--bar-bottom .dsfr-data-podium__item {
          position: relative;
        }
        .dsfr-data-podium--bar-top .dsfr-data-podium__bar-track,
        .dsfr-data-podium--bar-bottom .dsfr-data-podium__bar-track {
          position: absolute;
          left: 0;
          right: 0;
          height: 4px;
        }
        .dsfr-data-podium--bar-top .dsfr-data-podium__bar-track {
          top: 0;
        }
        .dsfr-data-podium--bar-bottom .dsfr-data-podium__bar-track {
          bottom: 0;
        }
        .dsfr-data-podium--bar-top .dsfr-data-podium__content,
        .dsfr-data-podium--bar-bottom .dsfr-data-podium__content {
          gap: 0;
        }

        /* orientation="vertical" : une colonne par item */
        .dsfr-data-podium--vertical {
          flex-direction: row;
          align-items: flex-end;
        }
        .dsfr-data-podium--vertical .dsfr-data-podium__item {
          flex: 1 1 0;
          min-width: 0;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 0.5rem;
          border-left: 0;
        }
        .dsfr-data-podium--vertical .dsfr-data-podium__bar-track {
          width: 2.5rem;
          height: 8rem;
          display: flex;
          align-items: flex-end;
        }
        .dsfr-data-podium--vertical .dsfr-data-podium__bar-fill {
          width: 100%;
          height: auto;
          align-self: flex-end;
          transition: height 0.3s ease;
        }
        .dsfr-data-podium--vertical .dsfr-data-podium__label-group {
          align-items: center;
        }
        .dsfr-data-podium--vertical .dsfr-data-podium__label {
          white-space: normal;
        }

        /* layout="podium" : estrade 2-1-3, inversion CSS seulement */
        .dsfr-data-podium--podium {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          align-items: end;
        }
        .dsfr-data-podium--podium .dsfr-data-podium__item--step {
          flex-direction: column;
          align-items: center;
          text-align: center;
          justify-content: flex-end;
          gap: 0.5rem;
          border-left: 0;
          border-bottom: 4px solid var(--podium-color, var(--border-default-grey));
        }
        .dsfr-data-podium--podium .dsfr-data-podium__item--step:nth-child(1) {
          order: 2;
          min-height: 15rem;
        }
        .dsfr-data-podium--podium .dsfr-data-podium__item--step:nth-child(2) {
          order: 1;
          min-height: 12.5rem;
        }
        .dsfr-data-podium--podium .dsfr-data-podium__item--step:nth-child(3) {
          order: 3;
          min-height: 11rem;
        }
        .dsfr-data-podium--podium .dsfr-data-podium__item--tail {
          order: 4;
          grid-column: 1 / -1;
          padding: 0.5rem 1.25rem;
        }
        .dsfr-data-podium--podium .dsfr-data-podium__item--step .dsfr-data-podium__label {
          white-space: normal;
        }

        .dsfr-data-podium__loading,
        .dsfr-data-podium__error,
        .dsfr-data-podium__empty {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 1.5rem;
          color: var(--text-mention-grey);
          font-size: 0.875rem;
        }
        .dsfr-data-podium__error {
          color: var(--text-default-error);
        }
      </style>
    `;
  }
}

/**
 * Luminance relative WCAG 2.x d'une couleur `#rrggbb`. Sert a choisir l'encre
 * du chiffre d'une pastille : la rampe CHOROPLETH_SCALES s'eclaircit, et du
 * blanc des son 4e ton (`#6A6AF4`) serait illisible. Voir la table de ratios
 * au JSDoc de `rank` — et ne pas la recalculer sur PALETTE_COLORS
 * (`constants/palette-colors.ts`), qui porte une rampe homonyme a 5 tons que
 * le podium ne sert pas.
 */
export function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 0;
  const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(clean.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-podium': DsfrDataPodium;
  }
}

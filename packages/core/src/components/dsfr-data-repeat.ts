import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { ScopeEmitter } from '../utils/scope-emitter.js';
import {
  renderTemplateRow,
  applyRowBindings,
  hasSplitBlock,
  type RowBinding,
  type TemplateVars,
} from '../utils/template-clone.js';
import { getByPath } from '../utils/json-path.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import { renderSourceError } from '../utils/status-templates.js';
import { parseScale, scaleToClasses } from '../utils/grid-layout.js';
import { sendWidgetBeacon } from '../utils/beacon.js';

/**
 * Nom de la balise (lot 0, #888 : `dsfr-data-repeat` est le nom de travail de
 * l'ADR-135, pas encore arrêté par le mainteneur). Un seul point de définition,
 * lu par les tests et par le préfixe des `$uid` : renommer = cette constante et
 * le décorateur ci-dessous, que le test « la balise enregistrée est REPEAT_TAG »
 * garde alignés.
 */
export const REPEAT_TAG = 'dsfr-data-repeat';

let repeatInstanceSeq = 0;

interface RepeatRow {
  container: HTMLElement;
  bindings: RowBinding[];
  /**
   * Composants `dsfr-data-*` retenus hors du document par `lazy` (#891), avec
   * leur marqueur d'emplacement. Vide quand la ligne est estampée.
   */
  held: Array<{ el: Element; marker: Comment }>;
}

/** Clé de repli (rang) : préfixée pour ne jamais entrer en collision avec une vraie clé. */
const RANK = '#';

/**
 * <dsfr-data-repeat> - Répéter des instances vivantes : une ligne de données, un pipeline
 *
 * Composant de STRUCTURE (ADR-135, #887) : pour chaque ligne de `source`, le `<template>`
 * enfant est cloné et ses placeholders résolus — texte, attributs, et donc les composants
 * `dsfr-data-*` qu'il contient, rehaussés avec leurs attributs déjà interpolés. C'est la
 * voie native pour « un graphique par question », « un KPI par service » : une
 * `dsfr-data-query id="q-{{clé}}" where="clé:eq:{{clé}}"` par ligne scope une source chargée
 * une fois, `type="{{champ}}"` choisit le type.
 *
 * Règle d'usage : **`dsfr-data-display` quand la ligne est du contenu ; `dsfr-data-repeat`
 * quand la ligne est un pipeline.** `display` est une liste de résultats — région nommée,
 * compteur annoncé, pagination, sélection. `repeat` est transparent : aucun `role`, aucun
 * `aria-live`, aucun compteur, aucune pagination ; la structure de la page vient des titres
 * que vous écrivez dans le gabarit.
 *
 * Ce que `repeat` promet, et que `display` ne promet pas :
 * - **l'identité par clé** (`key-field`) : à une nouvelle émission de `source`, une ligne
 *   dont la clé subsiste garde ses nœuds — les instances qu'ils portent ne sont ni
 *   déconnectées ni recréées, leurs attributs sont mis à jour en place ; les clés disparues
 *   sont retirées, les nouvelles insérées à leur rang, l'ordre du DOM suit les données ;
 * - **l'imbrication** : un `<template>` intérieur n'est pas parcouru — un `dsfr-data-display`
 *   (ou un autre `dsfr-data-repeat`) dans le gabarit rend ses propres placeholders ;
 * - **les attributs booléens conditionnels** : `data-if-databox="champ"` pose `databox` quand
 *   `champ` est vrai (ni null, undefined, « », [] ni false) et le retire sinon ;
 *   `data-unless-…` inverse. Un `{{#if}}` entre deux attributs, lui, est découpé par
 *   l'analyse HTML.
 *
 * Grammaire du gabarit : celle de `dsfr-data-display` et `dsfr-data-map-popup`
 * (`{{chemin[:format[:arg]][|défaut]}}`, `{{#if}}`, `{{#unless}}`, `{{#each}}`), sans
 * syntaxe nouvelle, avec deux différences de sortie :
 * - `{{{brut}}}` n'a pas de sens sur un nœud texte : rendu comme `{{brut}}`, avec un
 *   avertissement une fois par gabarit ;
 * - un bloc `{{#if}}…{{/if}}` doit tenir dans UN nœud texte ou UNE valeur d'attribut. Ouvert
 *   avant un élément et fermé après (« englober deux `<p>` »), il ne peut pas être un bloc :
 *   erreur de configuration, et le contenu est rendu quelle que soit la condition.
 * Variables : `{{$index}}` (rang, 0-based), `{{$key}}` (valeur de `key-field`, ou le rang),
 * `{{$uid}}` (identifiant DOM unique dérivé de la clé, sûr pour `id=` et `aria-labelledby`),
 * et avec `scopes` : `{{$scope.alias}}` (l'id scopé de la ligne pour cette entrée) —
 * `{{$scope}}` quand une seule entrée est déclarée.
 *
 * **`scopes` fait du répéteur un ÉMETTEUR** (#891) : il partitionne une source par champ
 * — une passe, une `Map` — et émet un id par ligne, au lieu d'une `dsfr-data-query` par
 * ligne qui refiltrerait chacune la source entière. Le gabarit n'a plus d'id à fabriquer,
 * et le volet Diagnostic sait d'où vient `q-001`. `lazy` diffère l'estampage des
 * composants d'une ligne à son approche du viewport, titres compris rendus d'emblée.
 *
 * Ce que ce composant ne fait pas : pas de délégation serveur derrière un id scopé (une
 * source lue par N queries reste calculée dans le navigateur, règle #765 — charger la source
 * en entier, `fetch-mode="export"`, `max-records` au volume réel) ; ni `facets` ni `search`
 * ne se répètent. Deux répéteurs qui fabriquent le même id se marchent dessus, comme deux
 * auteurs qui écriraient le même id.
 *
 * @example
 * <!-- La table des questions : une ligne par question -->
 * <dsfr-data-source id="questions" api-type="opendatasoft" base-url="https://data.economie.gouv.fr"
 *   dataset-id="bfn-table-de-correspondance" fetch-mode="export" max-records="200"></dsfr-data-source>
 * <!-- Les scores : UNE requête, chargée une fois -->
 * <dsfr-data-source id="scores" api-type="opendatasoft" base-url="https://data.economie.gouv.fr"
 *   dataset-id="questions-reponses" fetch-mode="export" max-records="5000"></dsfr-data-source>
 *
 * <dsfr-data-repeat source="questions" key-field="code_unifie" per-row="1 md:2">
 *   <template>
 *     <h3 id="{{$uid}}">{{libelle_unifie}}</h3>
 *     <dsfr-data-query id="q-{{code_unifie}}" source="scores" where="code_unifie:eq:{{code_unifie}}"
 *       group-by="annee" aggregate="score:sum" order-by="annee:asc"></dsfr-data-query>
 *     <dsfr-data-chart source="q-{{code_unifie}}" type="{{type_graphique}}"
 *       label-field="annee" value-field="score__sum" name="{{libelle_unifie}}"
 *       data-if-horizontal="est_long"></dsfr-data-chart>
 *   </template>
 * </dsfr-data-repeat>
 *
 * @example
 * <!-- La même page avec `scopes` : plus aucune query dans le gabarit, une seule
 *      partition des scores pour les 119 lignes, et `lazy` pour n'estamper que ce
 *      qui approche du viewport. -->
 * <dsfr-data-repeat source="questions" key-field="code_unifie" per-row="1 md:2"
 *   scopes="scores:code_unifie:q" lazy>
 *   <template>
 *     <h3 id="{{$uid}}">{{libelle_unifie}}</h3>
 *     <dsfr-data-chart source="{{$scope.q}}" type="{{type_graphique}}"
 *       label-field="annee" value-field="score" name="{{libelle_unifie}}"></dsfr-data-chart>
 *   </template>
 * </dsfr-data-repeat>
 */
@customElement('dsfr-data-repeat')
export class DsfrDataRepeat extends SourceSubscriberMixin(LitElement) {
  /** Id de la source (ou du transformateur) dont chaque ligne devient une instance du gabarit. Requis. */
  @property({ type: String })
  source = '';

  /**
   * Champ dont la valeur identifie une ligne entre deux émissions (chemin `a.b` accepté).
   * Une clé qui subsiste garde ses nœuds et ses instances ; vide, la clé est le rang.
   * Clé nulle ou vide sur une ligne : le rang, sans erreur. Clé en double : erreur de
   * configuration nommant la clé, et le rang pour les doublons.
   */
  @property({ type: String, attribute: 'key-field' })
  keyField = '';

  /**
   * Nombre de lignes par rangée à partir de 768 px (en dessous : une par rangée) —
   * diviseur de 12 (1, 2, 3, 4, 6, 12), ou une échelle par point de rupture
   * `"1 md:2 lg:3"`. Vide : pas de grille, un bloc par ligne. Grille `fr-grid-row`
   * avec gouttières.
   */
  @property({ type: String, attribute: 'per-row' })
  perRow = '';

  /**
   * Texte rendu quand la source émet zéro ligne — dans un `<p>` sans `role="status"` :
   * la balise n'annonce rien, c'est l'auteur qui décide de l'annonce. Vide : rien.
   */
  @property({ type: String })
  empty = '';

  /**
   * Partitionne une ou plusieurs sources par champ et émet **un id scopé par
   * ligne répétée** — la voie native pour « un graphique par question » sans
   * écrire une `dsfr-data-query` par ligne dans le gabarit (#891).
   *
   * Grammaire (#888, proposition A, celle de `champ:fonction:alias`) :
   * `source:champ:alias`, entrées séparées par `|`, termes par `:`.
   * L'alias est facultatif — à défaut, c'est l'id de la source.
   *
   * `scopes="scores:code_unifie:q | effectifs:code_unifie:e"` émet, pour
   * chaque ligne de clé `001`, les ids `q-001` et `e-001` ; le gabarit les
   * lit par `{{$scope.q}}` et `{{$scope.e}}` (`{{$scope}}` quand une seule
   * entrée est déclarée). Les composants du gabarit les consomment par leur
   * attribut `source` habituel : rien ne change pour eux.
   *
   * La clé d'appariement est celle de la ligne répétée (`key-field`, requis) :
   * une clé sans lignes dans la source scopée émet un **tableau vide** — le
   * graphique de la ligne est vide, pas absent. Les états `loading`, `error`
   * et `idle` (`require-where`) de la source scopée sont relayés sur chaque id
   * scopé, pour que la ligne affiche le bon message. Une ré-émission de la
   * source scopée re-partitionne et ré-émet **sans toucher aux lignes**.
   *
   * La partition est faite **une fois** par émission (une `Map` par champ),
   * là où N `dsfr-data-query` refiltraient chacune la source entière. Les ids
   * scopés sont purgés du cache quand leur ligne disparaît et à la
   * déconnexion du répéteur.
   *
   * Entrée fausse (nombre de termes, terme vide, alias en double, source
   * introuvable, champ absent des lignes) : `reportConfigError` nommant
   * l'entrée — rien de silencieux.
   */
  @property({ type: String })
  scopes = '';

  /**
   * N'estampe les composants d'une ligne qu'à son approche du viewport
   * (`IntersectionObserver`, marge 200 px — la même que `dsfr-data-map`).
   *
   * Les conteneurs et le contenu ORDINAIRE du gabarit (titres, textes, liens)
   * sont rendus d'emblée : la page garde sa structure de titres, sa hauteur et
   * son plan d'accessibilité. Seuls les éléments `dsfr-data-*` sont retenus
   * hors du document, attributs déjà interpolés, et insérés à l'entrée de la
   * ligne dans la marge — ils ne s'abonnent donc à rien et ne dessinent rien
   * avant. Les ids scopés, eux, sont émis pour **toutes** les lignes dès le
   * départ : le cache est là quand la ligne s'estampe.
   *
   * Sans `lazy`, comportement du lot 1 (tout est estampé d'emblée). Sans
   * `IntersectionObserver` (environnement de test), `lazy` est sans effet.
   */
  @property({ type: Boolean })
  lazy = false;

  /** Préfixe des `$uid` de l'instance (unique sur la page, comme `dsfr-display-N`). */
  private readonly _uid = `${REPEAT_TAG.replace('dsfr-data-', 'dsfr-')}-${++repeatInstanceSeq}`;

  private _template: HTMLTemplateElement | null = null;
  private _rows: HTMLElement | null = null;
  private _keyed = new Map<string, RepeatRow>();
  private _data: Record<string, unknown>[] = [];
  private _hasData = false;
  /** Gabarit déjà vérifié (`{{{brut}}}`, blocs coupés) et son erreur structurelle. */
  private _checkedTemplate: HTMLTemplateElement | null = null;
  private _templateError: string | null = null;
  /** Dernier message posé : `console.error` une fois par message distinct, l'attribut suit. */
  private _lastError: string | null = null;

  // --- scopes (#891) ---

  /**
   * L'émetteur de `scopes` : abonnement, partition, émission, purge. Sa logique
   * vit dans `utils/scope-emitter.ts` — aucun composant ne recode un abonnement
   * au bus (#280), et aucun mixin ne couvre « N sources en entrée, N ids
   * fabriqués en sortie ».
   */
  private readonly _scopes = new ScopeEmitter(
    (message) => this._report(message),
    () => this.isConnected
  );

  /** Observateur de visibilité de `lazy` ; un seul pour toutes les lignes. */
  private _lazyObserver: IntersectionObserver | null = null;
  private _lazyPending = new Map<Element, RepeatRow>();

  /**
   * Light DOM pour les styles DSFR, mais Lit ne rend PAS dans `this` : sa
   * `ChildPart` s'étend du marqueur à la fin du parent et emporterait tout ce
   * qui est rattaché après — les lignes. Lit reçoit un conteneur de statut
   * (erreur de source, `empty`) ; les lignes vivent dans un frère, hors de sa portée.
   */
  createRenderRoot() {
    const root = document.createElement('div');
    root.className = `${REPEAT_TAG}__status`;
    this.appendChild(root);
    return root;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon(REPEAT_TAG);
    if (!this.source) this._report('attribut "source" requis');
    this._scopes.configure(this.scopes, this.keyField);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unwatchTemplate();
    this._scopes.teardown();
    this._lazyObserver?.disconnect();
    this._lazyObserver = null;
    this._lazyPending.clear();
  }

  /**
   * `source` est géré par le mixin ; `scopes` ne l'est pas — un répéteur dont
   * on change la partition au runtime doit se réabonner, et purger les ids
   * qu'il n'émet plus.
   */
  willUpdate(changedProperties: Map<string, unknown>) {
    super.willUpdate(changedProperties);
    if (changedProperties.has('scopes') && changedProperties.get('scopes') !== undefined) {
      this._scopes.configure(this.scopes, this.keyField);
      if (this._hasData) this._renderRows();
    }
  }

  /**
   * Le gabarit n'est pas encore là quand la donnée arrive : bundle chargé dans le
   * `<head>` (l'analyseur n'a pas atteint le `<template>`, #894), élément créé puis
   * garni par script, ou happy-dom qui connecte avant de rattacher les enfants. On
   * observe les enfants jusqu'à la capture, puis on rend. L'erreur « gabarit requis »
   * est différée d'une macrotâche : l'enfant arrive souvent dans la même tâche.
   */
  private _templateObserver: MutationObserver | null = null;

  private _watchTemplate(): void {
    if (this._templateObserver) return;
    this._templateObserver = new MutationObserver(() => {
      if (!this._getTemplate()) return;
      this._unwatchTemplate();
      if (this._hasData) this._renderRows();
    });
    this._templateObserver.observe(this, { childList: true });
    setTimeout(() => {
      if (this.isConnected && this._hasData && !this._getTemplate()) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', this._onDocumentParsed, { once: true });
        } else {
          this._report('gabarit <template> enfant requis');
        }
      }
    }, 0);
  }

  private _unwatchTemplate(): void {
    this._templateObserver?.disconnect();
    this._templateObserver = null;
    document.removeEventListener('DOMContentLoaded', this._onDocumentParsed);
  }

  private _onDocumentParsed = () => {
    if (this.isConnected && this._hasData && !this._getTemplate()) {
      this._report('gabarit <template> enfant requis');
    }
  };

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('perRow') && this._rows) this._renderRows();
  }

  onSourceReset(): void {
    this._data = [];
    this._hasData = false;
    this._clearRows();
  }

  onSourceData(data: unknown): void {
    this._data = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    this._hasData = true;
    this._renderRows();
  }

  render() {
    if (this._sourceError) return renderSourceError(REPEAT_TAG, this._sourceError);
    // `loading` et `idle` : rien de visible — c'est une structure, pas une feuille.
    if (this._hasData && this._data.length === 0 && this.empty && !this._sourceLoading) {
      return html`<p class="${REPEAT_TAG}__empty">${this.empty}</p>`;
    }
    return nothing;
  }

  // --- Erreurs de configuration ---

  private _origin(): string {
    return `${REPEAT_TAG}${this.id ? `[${this.id}]` : ''}`;
  }

  /** Pose l'erreur ; `console.error` seulement quand le message change (pas une fois par émission). */
  private _report(message: string): void {
    if (this._lastError === message) return;
    this._lastError = message;
    reportConfigError(this, this._origin(), message);
  }

  private _clearError(): void {
    this._lastError = null;
    clearConfigError(this);
  }

  // --- Gabarit et conteneur ---

  /** Lecture paresseuse : le premier `<template>` enfant direct. */
  private _getTemplate(): HTMLTemplateElement | null {
    if (!this._template) {
      this._template =
        (Array.from(this.children).find((el) => el.tagName === 'TEMPLATE') as
          HTMLTemplateElement | undefined) ?? null;
    }
    return this._template;
  }

  /**
   * Vérifications structurelles, une fois par gabarit : `{{{brut}}}` (avertissement,
   * le rendu est échappé) et bloc coupé entre nœuds (erreur, retournée à chaque rendu).
   */
  private _checkTemplate(tpl: HTMLTemplateElement): string | null {
    if (this._checkedTemplate === tpl) return this._templateError;
    this._checkedTemplate = tpl;
    this._templateError = null;
    if (tpl.innerHTML.includes('{{{')) {
      console.warn(
        `${this._origin()}: {{{brut}}} n'a pas de sens dans un rendu par nœuds — la valeur est ` +
          `rendue comme {{brut}} (texte, échappé). Pour injecter du HTML, c'est dsfr-data-display.`
      );
    }
    const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
    let n: Node | null = walker.nextNode();
    while (n) {
      const text = (n as Text).data;
      if (hasSplitBlock(text)) {
        const excerpt = text.trim().replace(/\s+/g, ' ').slice(0, 60);
        this._templateError =
          `gabarit : bloc « ${excerpt} » ouvert dans un nœud texte sans sa fermeture dans le même ` +
          `nœud — un bloc ne peut pas englober des éléments ; un bloc par nœud texte ou par ` +
          `valeur d'attribut. Le contenu est rendu quelle que soit la condition.`;
        break;
      }
      n = walker.nextNode();
    }
    return this._templateError;
  }

  private _getRows(): HTMLElement {
    if (!this._rows) {
      this._rows = document.createElement('div');
      // Frère du conteneur de statut (jamais dans la racine de rendu Lit).
      this.appendChild(this._rows);
    }
    return this._rows;
  }

  private _clearRows(): void {
    for (const row of this._keyed.values()) {
      this._lazyObserver?.unobserve(row.container);
      this._lazyPending.delete(row.container);
      row.container.remove();
    }
    this._keyed.clear();
    // Plus de lignes, plus d'ids scopés : le cache ne doit pas survivre aux
    // lignes qu'il servait (même règle que la purge d'une ligne retirée).
    this._scopes.setKeys([]);
    this._scopes.emit();
    this.requestUpdate();
  }

  /** Classes de grille : `per-row` via `grid-layout.ts` (ADR-112), sans `cols`. */
  private _gridClasses(): { rows: string; row: string; error: string | null } {
    const base = { rows: `${REPEAT_TAG}__rows`, row: `${REPEAT_TAG}__row` };
    const parsed = parseScale(this.perRow, 'per-row', 12);
    if (parsed.error) return { ...base, error: parsed.error };
    if (parsed.scale) {
      return {
        rows: `${base.rows} fr-grid-row fr-grid-row--gutters`,
        row: `${base.row} ${scaleToClasses(parsed.scale)}`,
        error: null,
      };
    }
    return { ...base, error: null };
  }

  // --- Clés ---

  /**
   * Clé de chaque ligne : `key-field`, ou le rang. Champ absent de toutes les
   * lignes → erreur nommée, rang pour toutes. Doublon → erreur nommée, rang
   * pour les occurrences suivantes (la première garde la clé).
   */
  private _keysOf(items: Record<string, unknown>[]): { keys: string[]; error: string | null } {
    const field = this.keyField.trim();
    if (!field) return { keys: items.map((_, i) => `${RANK}${i}`), error: null };
    const raw = items.map((item) => {
      const v = getByPath(item, field);
      return v === null || v === undefined || v === '' ? null : String(v);
    });
    if (items.length > 0 && raw.every((v) => v === null)) {
      const seen = Object.keys(items[0]).slice(0, 8).join(', ');
      return {
        keys: items.map((_, i) => `${RANK}${i}`),
        error: `key-field="${field}" : champ absent des lignes (champs vus : ${seen}) — repli sur le rang`,
      };
    }
    const counts = new Map<string, number>();
    for (const v of raw) if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1);
    const duplicates = [...counts.entries()].filter(([, n]) => n > 1);
    let error: string | null = null;
    if (duplicates.length > 0) {
      const [key, n] = duplicates[0];
      error =
        `key-field="${field}" : clé "${key}" portée par ${n} lignes` +
        (duplicates.length > 1 ? ` (et ${duplicates.length - 1} autre(s) clé(s) en double)` : '') +
        ` — repli sur le rang pour les doublons`;
    }
    const used = new Set<string>();
    const keys = raw.map((v, i) => {
      if (v === null || used.has(v)) return `${RANK}${i}`;
      used.add(v);
      return v;
    });
    return { keys, error };
  }

  /** La clé telle que le gabarit la voit (`{{$key}}`) : le rang sans son préfixe. */
  private static _plainKey(key: string): string {
    return key.startsWith(RANK) ? key.slice(RANK.length) : key;
  }

  private _vars(index: number, key: string): TemplateVars {
    const isRank = key.startsWith(RANK);
    const plain = DsfrDataRepeat._plainKey(key);
    const vars: TemplateVars = {
      $index: () => String(index),
      $key: () => plain,
      $uid: () =>
        `${this._uid}-${isRank ? `i${key.slice(RANK.length)}` : key.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    };
    // `{{$scope.alias}}` — et `{{$scope}}` quand une seule entrée est déclarée.
    // `resolveTemplateExpression` teste `vars` sur l'expression ENTIÈRE avant
    // toute interprétation : un nom à point y est une variable, pas un chemin.
    Object.assign(vars, this._scopes.vars(plain));
    return vars;
  }

  /**
   * Les ids que ce répéteur ÉMET — lu par la reconstruction du graphe
   * (`snapshotGraph`), qui n'a aucun autre moyen de savoir d'où sort `q-001` :
   * aucun élément de la page ne porte cet id. Même doctrine que
   * `getSkippedCount()` : une méthode publique du composant, pas un événement.
   */
  getScopedIds(): string[] {
    return this._scopes.emittedIds();
  }

  // --- Rendu ---

  private _renderRows(): void {
    const tpl = this._getTemplate();
    if (!tpl) {
      this._watchTemplate();
      return;
    }
    this._unwatchTemplate();
    const origin = this._origin();
    const templateError = this._checkTemplate(tpl);
    const grid = this._gridClasses();
    const { keys, error: keyError } = this._keysOf(this._data);

    // Les ids scopés sont émis AVANT l'estampage : un composant du gabarit lit
    // le cache à `connectedCallback` (#281) — émettre après le laisserait vide
    // jusqu'à la prochaine émission de la source scopée.
    this._scopes.setKeys(keys.map((k) => DsfrDataRepeat._plainKey(k)));
    this._scopes.emit();

    const error =
      templateError ??
      keyError ??
      grid.error ??
      this._scopes.configError ??
      this._scopes.runtimeError;
    if (error) this._report(error);
    else if (this.source) this._clearError();

    const rows = this._getRows();
    rows.className = grid.rows;
    const seen = new Set<string>();
    let created = false;
    let cursor: ChildNode | null = rows.firstChild;

    this._data.forEach((item, i) => {
      const key = keys[i];
      const vars = this._vars(i, key);
      let row = this._keyed.get(key);
      if (row) {
        applyRowBindings(row.bindings, item, vars, origin);
        if (row.container.className !== grid.row) row.container.className = grid.row;
      } else {
        const container = document.createElement('div');
        container.className = grid.row;
        container.dataset.key = key;
        const rendered = renderTemplateRow(tpl, item, vars, { origin });
        const held = this._lazyEnabled() ? holdDataComponents(rendered.fragment) : [];
        container.appendChild(rendered.fragment);
        row = { container, bindings: rendered.bindings, held };
        this._keyed.set(key, row);
        created = true;
        if (held.length > 0) this._observeLazy(row);
      }
      seen.add(key);
      // L'ordre du DOM suit l'ordre des données : déplacement, jamais recréation.
      if (row.container !== cursor) {
        rows.insertBefore(row.container, cursor);
      } else {
        cursor = cursor.nextSibling;
      }
    });

    for (const [key, row] of this._keyed) {
      if (!seen.has(key)) {
        this._lazyObserver?.unobserve(row.container);
        this._lazyPending.delete(row.container);
        row.container.remove();
        this._keyed.delete(key);
      }
    }

    // `loaded` se rattrape au cache ; `loading`, `error` et `idle` sont des
    // ÉVÉNEMENTS, et une ligne qui vient de naître les a manqués — elle
    // resterait sur « aucune donnée » sous une source qui charge encore. On
    // les rejoue pour les nouvelles lignes, jamais le chargement complet.
    if (created && this._scopes.hasPendingState()) this._scopes.replayStates();

    this.requestUpdate();
  }

  // --- lazy (#891) ---

  /** `lazy` n'a de sens qu'avec un `IntersectionObserver` ; sinon tout est estampé. */
  private _lazyEnabled(): boolean {
    return this.lazy && typeof IntersectionObserver !== 'undefined';
  }

  private _observeLazy(row: RepeatRow): void {
    if (!this._lazyObserver) {
      this._lazyObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const pending = this._lazyPending.get(entry.target);
            this._lazyObserver?.unobserve(entry.target);
            this._lazyPending.delete(entry.target);
            if (pending) this._stampRow(pending);
          }
        },
        // Même marge que `dsfr-data-map` : la ligne est prête avant d'être vue.
        { rootMargin: '200px 0px' }
      );
    }
    this._lazyPending.set(row.container, row);
    this._lazyObserver.observe(row.container);
  }

  /** Remet les composants retenus à leur place : c'est là qu'ils s'abonnent. */
  private _stampRow(row: RepeatRow): void {
    for (const { el, marker } of row.held) {
      marker.parentNode?.replaceChild(el, marker);
    }
    row.held = [];
  }
}

/**
 * Retire du fragment les éléments `dsfr-data-*` les plus HAUTS (un composant
 * dans un autre suit son parent) et laisse un commentaire à leur place.
 *
 * Retenus hors du document, ils ne sont jamais connectés : aucun abonnement,
 * aucun écouteur, aucun canvas. Leurs attributs sont déjà interpolés — ce qui
 * est remis en place à la visibilité est exactement ce qui aurait été inséré.
 * Le reste du gabarit (titres, textes, liens) est rendu d'emblée : la page
 * garde son plan et sa hauteur.
 */
function holdDataComponents(fragment: DocumentFragment): Array<{ el: Element; marker: Comment }> {
  const doc = fragment.ownerDocument ?? document;
  const held: Array<{ el: Element; marker: Comment }> = [];
  const tops: Element[] = [];
  const walk = (node: ParentNode): void => {
    for (const child of Array.from(node.children)) {
      if (child.tagName.toLowerCase().startsWith('dsfr-data-')) tops.push(child);
      else walk(child);
    }
  };
  walk(fragment);
  for (const el of tops) {
    const marker = doc.createComment(` ${el.tagName.toLowerCase()} — dsfr-data-repeat lazy `);
    el.parentNode?.replaceChild(marker, el);
    held.push({ el, marker });
  }
  return held;
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-repeat': DsfrDataRepeat;
  }
}

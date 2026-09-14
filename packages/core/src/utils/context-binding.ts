/**
 * ContextBindingMixin — le tronc unique de « je suis lié à un dsfr-data-context » (#837).
 *
 * Quatre composants résolvaient le même contexte par id, chacun avec sa
 * copie : `dsfr-data-facets`, `dsfr-data-search`, le mixin de sélection des
 * afficheurs (`selection-filter.ts`, #734) et `dsfr-data-context-value`.
 * Le geste est pourtant strictement le même partout :
 *
 * - écouter `dsfr-data-context-connected` tant qu'un contexte est visé — le
 *   contexte peut être déclaré APRÈS dans la page, donc ne pas être encore
 *   upgradé au montage (#678) ;
 * - différer la première liaison d'un tick (`queueMicrotask`), pour la même
 *   raison, à l'intérieur d'un seul fragment `innerHTML` ;
 * - résoudre par id, poser l'erreur de configuration quand le contexte est
 *   introuvable, la lever au succès ;
 * - libérer à la déconnexion ;
 * - refaire la liaison quand l'attribut change à chaud.
 *
 * Toute correction portée à ce tronc (#678, #805) devait sinon être écrite
 * trois fois, et ne l'a pas toujours été.
 *
 * Ce que le mixin NE fait pas : enregistrer des filtres. Chaque hôte a le
 * sien — un filtre unique (recherche, sélection), un filtre par champ
 * (facettes), aucun (`context-value`, simple lecteur). C'est l'objet des
 * crochets `onContextBound` / `onContextUnbound`.
 *
 * L'hôte déclare lui-même la propriété qui porte l'id (`context`, ou `for`
 * pour `context-value` via `contextTargetId()`), avec sa JSDoc : la
 * référence des skills est générée depuis le manifeste des composants.
 */
import type { LitElement } from 'lit';
import { reportConfigError, clearConfigError } from './config-error.js';
import { CONTEXT_CONNECTED_EVENT, findContextHostById } from './context-registry.js';
import type { ContextHost } from './context-registry.js';

// Pattern Lit mixin canonique : le constructor doit être callable avec
// n'importe quels args pour permettre le chaînage `class extends mixin(Parent)`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any[] est le pattern canonique des mixins Lit
type Constructor<T = object> = new (...args: any[]) => T;

/** Contrat ajouté par le mixin (#837) — `_`-préfixé : interne à la bibliothèque */
export interface ContextBindingInterface {
  context: string;
  /** Contexte résolu (null tant qu'il n'est pas trouvé) */
  _context: ContextHost | null;
  /** Liaison demandée, que le contexte soit déjà résolu ou non */
  readonly _contextMode: boolean;
}

export function ContextBindingMixin<T extends Constructor<LitElement>>(superClass: T) {
  class ContextBoundElement extends superClass {
    /** Déclarée par l'hôte (`@property`), pas par le mixin : elle porte sa JSDoc */
    declare context: string;

    /** Contexte résolu (null tant qu'il n'est pas trouvé) */
    _context: ContextHost | null = null;

    /** Un contexte visé par id vient d'être connecté : (re)lie si c'est le nôtre (#678) */
    private _onContextConnected = (e: Event) => {
      const id = (e as CustomEvent<{ id: string | null }>).detail?.id;
      const target = this.contextTargetId();
      if (target && id === target) this._bindContext();
    };

    // --- Points de personnalisation de l'hôte ---

    /** Id du contexte visé — `context` par défaut (`context-value` vise `for`) */
    protected contextTargetId(): string {
      return (this.context || '').trim();
    }

    /** Liaison demandée, que le contexte soit déjà résolu ou non */
    get _contextMode(): boolean {
      return this.contextTargetId() !== '';
    }

    /** Propriétés dont le changement à chaud refait la liaison */
    protected contextRebindProps(): PropertyKey[] {
      return ['context'];
    }

    /** Nom du composant dans les messages d'erreur de configuration */
    protected contextErrorTag(): string {
      return this.tagName.toLowerCase();
    }

    /**
     * Configuration de l'hôte incompatible avec la liaison (la recherche
     * exige un champ unique) : message d'erreur, ou null si tout va bien.
     * Évalué APRÈS la résolution, AVANT que le contexte ne soit retenu.
     */
    protected validateContextBinding(): string | null {
      return null;
    }

    /** Contexte introuvable : l'erreur est posée, et levée à sa connexion */
    protected onContextUnavailable(): void {
      reportConfigError(
        this,
        this.contextErrorTag(),
        `dsfr-data-context introuvable : "${this.contextTargetId()}"`
      );
    }

    /** Contexte retenu : l'hôte enregistre ses filtres et lit l'URL du contexte */
    protected onContextBound(_context: ContextHost): void {
      // par défaut : rien
    }

    /** Même contexte redemandé : l'hôte resynchronise ce qui a pu apparaître depuis */
    protected onContextAlreadyBound(_context: ContextHost): void {
      // par défaut : rien
    }

    /** Contexte libéré : l'hôte désenregistre ses filtres */
    protected onContextUnbound(_context: ContextHost | null): void {
      // par défaut : rien
    }

    /** Avant une re-liaison à chaud (l'hôte vide sa sélection, libère sa clause directe) */
    protected beforeContextRebind(): void {
      // par défaut : rien
    }

    // --- Liaison ---

    /**
     * Résout le contexte visé et l'adopte. Le contexte peut arriver plus tard
     * (déclaré après dans la page) : l'erreur de configuration est posée en
     * attendant, et levée à sa connexion.
     */
    protected _bindContext(): void {
      if (!this.isConnected || !this._contextMode) return;
      const context = findContextHostById(this.contextTargetId());
      if (context && context === this._context) {
        this.onContextAlreadyBound(context);
        return;
      }
      this._unbindContext();
      if (!context) {
        this.onContextUnavailable();
        return;
      }
      const refusal = this.validateContextBinding();
      if (refusal) {
        reportConfigError(this, this.contextErrorTag(), refusal);
        return;
      }
      clearConfigError(this);
      this._context = context;
      this.onContextBound(context);
    }

    /** Libère le contexte (déconnexion, changement de contexte) */
    protected _unbindContext(): void {
      this.onContextUnbound(this._context);
      this._context = null;
    }

    // --- Cycle de vie ---

    connectedCallback() {
      super.connectedCallback();
      if (this._contextMode) {
        document.addEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
        // Liaison différée d'un tick : dans un même fragment innerHTML, le
        // contexte déclaré après l'hôte n'est pas encore upgradé
        queueMicrotask(() => this._bindContext());
      }
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      document.removeEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
      this._unbindContext();
    }

    willUpdate(changed: Map<PropertyKey, unknown>) {
      super.willUpdate(changed);
      if (!this.hasUpdated) return;
      if (!this.contextRebindProps().some((prop) => changed.has(prop))) return;
      // Changement de contexte à chaud (#678) : l'ancien est libéré, le
      // nouveau rejoint
      this.beforeContextRebind();
      this._unbindContext();
      document.removeEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
      if (this._contextMode) {
        document.addEventListener(CONTEXT_CONNECTED_EVENT, this._onContextConnected);
        this._bindContext();
      } else {
        clearConfigError(this);
      }
    }
  }

  return ContextBoundElement as unknown as Constructor<ContextBindingInterface> & T;
}

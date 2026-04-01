/**
 * SourceSubscriberMixin - Pattern réutilisable pour l'abonnement aux sources de données
 *
 * Factorise la logique d'abonnement/cache/désabonnement commune à
 * dsfr-data-kpi, dsfr-data-list, dsfr-data-chart.
 */
import type { LitElement } from 'lit';
import { subscribeToSource, getDataCache } from './data-bridge.js';

type Constructor<T = {}> = new (...args: any[]) => T;

export interface SourceSubscriberInterface {
  source: string;
  _sourceLoading: boolean;
  _sourceData: unknown;
  _sourceError: Error | null;
  onSourceData(data: unknown): void;
  onSourceError?(error: Error): void;
}

/**
 * Mixin qui ajoute la logique d'abonnement à une source de données.
 *
 * Le composant hôte doit :
 * - déclarer `@property({ type: String }) source = ''`
 * - implémenter `onSourceData(data)` pour réagir aux nouvelles données
 */
export function SourceSubscriberMixin<T extends Constructor<LitElement>>(superClass: T) {
  class SourceSubscriberElement extends superClass {
    _sourceLoading = false;
    _sourceData: unknown = null;
    _sourceError: Error | null = null;

    private _unsubscribeSource: (() => void) | null = null;

    /**
     * Hook appelé quand de nouvelles données arrivent.
     * À surcharger dans le composant hôte.
     */
    onSourceData(_data: unknown): void {
      // default: no-op
    }

    /**
     * Hook appelé quand une erreur survient.
     * À surcharger pour gérer les erreurs (ex: revert pagination).
     */
    onSourceError(_error: Error): void {
      // default: no-op
    }

    connectedCallback() {
      super.connectedCallback();
      this._subscribeToSource();
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      this._cleanupSubscription();
    }

    willUpdate(changedProperties: Map<string, unknown>) {
      super.willUpdate(changedProperties);
      if (changedProperties.has('source')) {
        this._subscribeToSource();
      }
    }

    private _subscribeToSource() {
      this._cleanupSubscription();

      const source = (this as any).source as string;
      if (!source) return;

      // Récupère les données en cache
      const cachedData = getDataCache(source);
      if (cachedData !== undefined) {
        this._sourceData = cachedData;
        this.onSourceData(cachedData);
      }

      this._unsubscribeSource = subscribeToSource(source, {
        onLoaded: (data) => {
          this._sourceData = data;
          this._sourceLoading = false;
          this._sourceError = null;
          this.onSourceData(data);
          this.requestUpdate();
        },
        onLoading: () => {
          this._sourceLoading = true;
          this.requestUpdate();
        },
        onError: (error) => {
          this._sourceError = error;
          this._sourceLoading = false;
          this.onSourceError(error);
          this.requestUpdate();
        },
      });
    }

    private _cleanupSubscription() {
      if (this._unsubscribeSource) {
        this._unsubscribeSource();
        this._unsubscribeSource = null;
      }
    }
  }

  return SourceSubscriberElement as unknown as Constructor<SourceSubscriberInterface> & T;
}

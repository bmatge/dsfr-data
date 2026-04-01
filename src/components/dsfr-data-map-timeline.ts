/**
 * dsfr-data-map-timeline — Controles de lecture temporelle pour dsfr-data-map-layer
 *
 * Se place comme enfant de dsfr-data-map. Decouvre automatiquement les layers
 * ayant un attribut time-field et pilote leur affichage frame par frame.
 *
 * Accessibilite :
 * - Pas d'auto-play (l'utilisateur doit lancer la lecture)
 * - prefers-reduced-motion desactive l'auto-play
 * - Clavier : Espace=play/pause, fleches=pas a pas, Home/End=debut/fin
 * - ARIA labels sur tous les controles
 * - Live region pour annoncer le pas courant
 *
 * @example
 * <dsfr-data-map center="46.5,2.5" zoom="5" height="600px">
 *   <dsfr-data-map-layer source="data" type="circle"
 *     time-field="date" time-bucket="month" time-mode="cumulative">
 *   </dsfr-data-map-layer>
 *   <dsfr-data-map-timeline speed="1" interval="1000">
 *   </dsfr-data-map-timeline>
 * </dsfr-data-map>
 */
import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import type { DsfrDataMapLayer } from './dsfr-data-map-layer.js';

const SPEEDS = [0.5, 1, 2, 4];

@customElement('dsfr-data-map-timeline')
export class DsfrDataMapTimeline extends LitElement {

  /** Target specific layer IDs (comma-separated). If empty, targets all layers with time-field. */
  @property({ type: String })
  for = '';

  /** Playback speed multiplier */
  @property({ type: Number })
  speed = 1;

  /** Base interval in ms between frames */
  @property({ type: Number })
  interval = 1000;

  /** Label format for display. 'auto' uses the raw step value. */
  @property({ type: String })
  label = 'auto';

  @state() private _playing = false;
  @state() private _currentIndex = 0;
  @state() private _steps: string[] = [];
  @state() private _ready = false;

  private _timer: ReturnType<typeof setInterval> | null = null;
  private _prefersReducedMotion = false;
  private _boundOnTimeReady = this._onTimeReady.bind(this);

  // Light DOM — inherits DSFR styles
  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-map-timeline', '');
    this._prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Listen for layers reporting their time steps
    const map = this.closest('dsfr-data-map');
    map?.addEventListener('dsfr-data-map-layer-time-ready', this._boundOnTimeReady);
    this._injectStyles();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stop();
    const map = this.closest('dsfr-data-map');
    map?.removeEventListener('dsfr-data-map-layer-time-ready', this._boundOnTimeReady);
  }

  /** Called by dsfr-data-map when map is ready (same pattern as layers) */
  _onMapReady(): void {
    // Try to collect steps from already-loaded layers
    this._collectSteps();
  }

  // --- Layer discovery ---

  private _getTargetLayers(): DsfrDataMapLayer[] {
    const map = this.closest('dsfr-data-map');
    if (!map) return [];

    if (this.for) {
      const ids = this.for.split(',').map(s => s.trim());
      return ids
        .map(id => map.querySelector(`#${id}`) as DsfrDataMapLayer | null)
        .filter((el): el is DsfrDataMapLayer => el !== null && el.timeField !== '');
    }

    return Array.from(map.querySelectorAll('dsfr-data-map-layer[time-field]')) as DsfrDataMapLayer[];
  }

  // --- Time steps ---

  private _onTimeReady(e: Event): void {
    // A layer has computed its time steps — merge all layer steps
    e.stopPropagation();
    this._collectSteps();
  }

  private _collectSteps(): void {
    const layers = this._getTargetLayers();
    // Union of all layer time steps, sorted
    const allSteps = new Set<string>();
    for (const layer of layers) {
      for (const step of layer.getTimeSteps()) {
        allSteps.add(step);
      }
    }
    this._steps = [...allSteps].sort();
    if (this._steps.length > 0 && !this._ready) {
      this._ready = true;
      // Show first frame
      this._seek(0);
    }
  }

  // --- Playback controls ---

  private _play(): void {
    if (this._playing || this._steps.length === 0) return;
    if (this._prefersReducedMotion) return;

    // If at the end, restart
    if (this._currentIndex >= this._steps.length - 1) {
      this._currentIndex = 0;
    }

    this._playing = true;
    const ms = Math.max(50, this.interval / this.speed);
    this._timer = setInterval(() => this._tick(), ms);
  }

  private _pause(): void {
    this._playing = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  private _stop(): void {
    this._pause();
    if (this._steps.length > 0) {
      this._seek(0);
    }
  }

  private _tick(): void {
    if (this._currentIndex >= this._steps.length - 1) {
      // End of timeline
      this._pause();
      return;
    }
    this._seek(this._currentIndex + 1);
  }

  private _stepForward(): void {
    if (this._currentIndex < this._steps.length - 1) {
      this._seek(this._currentIndex + 1);
    }
  }

  private _stepBackward(): void {
    if (this._currentIndex > 0) {
      this._seek(this._currentIndex - 1);
    }
  }

  private _seek(index: number): void {
    this._currentIndex = Math.max(0, Math.min(index, this._steps.length - 1));
    const layers = this._getTargetLayers();
    for (const layer of layers) {
      // Find the closest frame index in this layer's own steps
      const layerSteps = layer.getTimeSteps();
      const targetStep = this._steps[this._currentIndex];
      const layerIndex = layerSteps.indexOf(targetStep);
      if (layerIndex >= 0) {
        layer.setTimelineFrame(layerIndex);
      } else if (layer.timeMode === 'cumulative') {
        // For cumulative, find the last step <= current
        let best = -1;
        for (let i = 0; i < layerSteps.length; i++) {
          if (layerSteps[i] <= targetStep) best = i;
        }
        if (best >= 0) layer.setTimelineFrame(best);
      }
    }
    this.requestUpdate();
  }

  private _onSliderInput(e: Event): void {
    const val = Number((e.target as HTMLInputElement).value);
    this._seek(val);
  }

  private _onSpeedChange(e: Event): void {
    const newSpeed = Number((e.target as HTMLSelectElement).value);
    this.speed = newSpeed;
    // Restart timer with new speed if playing
    if (this._playing) {
      this._pause();
      this._play();
    }
  }

  private _togglePlay(): void {
    if (this._playing) {
      this._pause();
    } else {
      this._play();
    }
  }

  // --- Keyboard ---

  private _onKeydown(e: KeyboardEvent): void {
    switch (e.key) {
      case ' ':
        e.preventDefault();
        this._togglePlay();
        break;
      case 'ArrowRight':
        e.preventDefault();
        this._stepForward();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this._stepBackward();
        break;
      case 'Home':
        e.preventDefault();
        this._seek(0);
        break;
      case 'End':
        e.preventDefault();
        this._seek(this._steps.length - 1);
        break;
    }
  }

  // --- Styles ---

  private _injectStyles(): void {
    if (document.querySelector('style[data-dsfr-data-map-timeline]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-dsfr-data-map-timeline', '');
    style.textContent = `
      .dsfr-data-map-timeline {
        position: absolute;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1000;
        background: var(--background-default-grey, #fff);
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        padding: 0.5rem 1rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        min-width: 300px;
        max-width: 90%;
      }
      .dsfr-data-map-timeline__label {
        font-size: 0.875rem;
        font-weight: 600;
        white-space: nowrap;
      }
      .dsfr-data-map-timeline__slider {
        width: 100%;
      }
      .dsfr-data-map-timeline__slider input[type="range"] {
        width: 100%;
        cursor: pointer;
      }
      .dsfr-data-map-timeline__controls {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }
      .dsfr-data-map-timeline__speed {
        width: auto;
        min-width: 4rem;
        padding: 0.25rem;
        font-size: 0.75rem;
        border: 1px solid var(--border-default-grey, #ddd);
        border-radius: 4px;
        background: var(--background-default-grey, #fff);
      }
      @media (prefers-reduced-motion: reduce) {
        .dsfr-data-map-timeline__play-btn[data-auto] {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // --- Render ---

  render() {
    if (!this._ready || this._steps.length === 0) return nothing;

    const currentLabel = this._steps[this._currentIndex] ?? '';
    const total = this._steps.length;

    return html`
      <div class="dsfr-data-map-timeline"
           role="group"
           aria-label="Controles de la frise chronologique"
           @keydown=${this._onKeydown}
           tabindex="0">

        <!-- Current time label (live region) -->
        <div class="dsfr-data-map-timeline__label"
             aria-live="polite" aria-atomic="true">
          ${currentLabel} (${this._currentIndex + 1}/${total})
        </div>

        <!-- Slider -->
        <div class="dsfr-data-map-timeline__slider">
          <input type="range"
            min="0"
            max="${total - 1}"
            .value="${String(this._currentIndex)}"
            @input=${this._onSliderInput}
            aria-label="Position dans la frise chronologique"
            aria-valuemin="0"
            aria-valuemax="${total - 1}"
            aria-valuenow="${this._currentIndex}"
            aria-valuetext="${currentLabel}"
          />
        </div>

        <!-- Transport controls -->
        <div class="dsfr-data-map-timeline__controls">
          <button class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline"
            @click=${this._stepBackward}
            aria-label="Image precedente"
            ?disabled=${this._currentIndex === 0}>
            <span class="fr-icon-arrow-left-s-line" aria-hidden="true"></span>
          </button>

          <button class="fr-btn fr-btn--sm dsfr-data-map-timeline__play-btn"
            data-auto
            @click=${this._togglePlay}
            aria-label="${this._playing ? 'Pause' : 'Lecture'}"
            ?disabled=${this._prefersReducedMotion}>
            <span class="${this._playing ? 'fr-icon-pause-circle-line' : 'fr-icon-play-circle-line'}"
                  aria-hidden="true"></span>
          </button>

          <button class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline"
            @click=${this._stop}
            aria-label="Arreter et revenir au debut">
            <span class="fr-icon-stop-circle-line" aria-hidden="true"></span>
          </button>

          <button class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline"
            @click=${this._stepForward}
            aria-label="Image suivante"
            ?disabled=${this._currentIndex >= total - 1}>
            <span class="fr-icon-arrow-right-s-line" aria-hidden="true"></span>
          </button>

          <!-- Speed selector -->
          <select class="dsfr-data-map-timeline__speed"
            @change=${this._onSpeedChange}
            aria-label="Vitesse de lecture">
            ${SPEEDS.map(s => html`
              <option value="${s}" ?selected=${this.speed === s}>${s}x</option>
            `)}
          </select>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-map-timeline': DsfrDataMapTimeline;
  }
}

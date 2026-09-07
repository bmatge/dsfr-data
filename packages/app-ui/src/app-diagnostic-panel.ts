import { LitElement, html, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  fieldMatrix,
  formatTrace,
  summarizeTrace,
  topoOrder,
  type StageNode,
  type StageState,
  type Trace,
} from '@dsfr-data/shared';

/**
 * <app-diagnostic-panel> — le volet **Diagnostic** (#605)
 *
 * Un tiroir en bas de page qui montre ce qui transite entre les composants
 * d'un pipeline : combien de lignes à chaque étape, quels champs
 * apparaissent et disparaissent, et où ça casse.
 *
 * **Pourquoi un tiroir et pas un onglet.** `app-preview-panel` n'existe que
 * dans trois apps, `app-action-bar` dans sept. Et `docs/ux/actions.md` §1
 * tranche : « un onglet n'est pas une action ». Le diagnostic n'agit sur
 * rien, c'est une loupe transversale — même place dans toutes les apps.
 *
 * **Le rail replié porte déjà l'information** (`3 étapes · 100 → 8 lignes ·
 * 1 alerte`). Si l'état fermé n'était qu'un bouton, personne ne l'ouvrirait.
 *
 * **Deux modes.** `live` : le volet observe un pipeline via `setTrace()`.
 * `rapporte` : il affiche une trace qu'on lui a donnée (collée, transmise
 * par une autre app, reçue dans une conversation). Le second rend le volet
 * utile là où il n'y a rien à observer — l'Assistant IA rend son aperçu sans
 * aucun composant dsfr-data, donc sans trafic sur le bus.
 *
 * Light DOM pour hériter des styles DSFR.
 *
 * @fires diagnostic-copy - Le diagnostic textuel a été copié.
 * @fires diagnostic-send - { text } demande d'envoi vers l'assistant.
 * @fires diagnostic-toggle - { open } ouverture/fermeture du tiroir.
 */

const STORAGE_KEY = 'dsfr-data-diagnostic-open';
const TABS = ['flux', 'champs', 'journal'] as const;
type DiagnosticTab = (typeof TABS)[number];

const TAB_LABELS: Record<DiagnosticTab, string> = {
  flux: 'Flux',
  champs: 'Champs',
  journal: 'Journal',
};

let panelSeq = 0;

export function injectAppDiagnosticStyles(): void {
  if (document.getElementById('app-diagnostic-panel-style')) return;
  const style = document.createElement('style');
  style.id = 'app-diagnostic-panel-style';
  // z-index 780 : au-dessus du contenu et de la barre d'actions collante
  // (700), mais SOUS la barre d'actions fixe du mobile (800) — sinon le
  // tiroir masquerait le geste primaire de l'app.
  style.textContent = `
app-diagnostic-panel{position:fixed;left:0;right:0;bottom:0;z-index:780;display:block;font-size:.875rem}
app-diagnostic-panel[hidden]{display:none}
.app-diag{background:var(--background-default-grey);border-top:1px solid var(--border-default-grey);box-shadow:0 -4px 12px rgba(0,0,0,.08)}
.app-diag__rail{display:flex;align-items:center;gap:.75rem;width:100%;padding:.4rem 1rem;margin:0;border:0;background:none;color:var(--text-title-grey);font:inherit;font-weight:500;text-align:left;cursor:pointer;min-height:2.25rem}
.app-diag__rail:hover{background:var(--background-alt-grey)}
.app-diag__rail:focus-visible{outline:2px solid var(--border-active-blue-france);outline-offset:-2px}
.app-diag__rail-title{display:flex;align-items:center;gap:.4rem;flex:0 0 auto}
.app-diag__rail-summary{flex:1 1 auto;min-width:0;color:var(--text-mention-grey);font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.app-diag__rail-chevron{flex:0 0 auto;color:var(--text-mention-grey)}
.app-diag__alert{color:var(--text-default-warning);font-weight:500}
.app-diag__ok{color:var(--text-default-success)}
.app-diag__body{max-height:min(48vh,26rem);overflow:auto;border-top:1px solid var(--border-default-grey);padding:.5rem 1rem 1rem}
.app-diag__toolbar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;justify-content:flex-end;padding:.5rem 0}
.app-diag__tabs{display:flex;gap:.25rem;flex:1 1 auto}
.app-diag__tab{padding:.35rem .85rem;border:0;border-bottom:2px solid transparent;background:none;color:var(--text-mention-grey);font:inherit;font-size:.875rem;cursor:pointer}
.app-diag__tab[aria-selected="true"]{color:var(--text-active-blue-france);border-bottom-color:var(--border-active-blue-france);font-weight:500}
.app-diag__tab:focus-visible{outline:2px solid var(--border-active-blue-france);outline-offset:-2px}
.app-diag__empty{padding:1.5rem 0;color:var(--text-mention-grey)}
.app-diag__chain{display:flex;flex-wrap:wrap;gap:.5rem;align-items:stretch}
.app-diag__stage{flex:1 1 12rem;min-width:11rem;border:1px solid var(--border-default-grey);padding:.6rem .7rem;background:var(--background-alt-grey)}
.app-diag__stage[data-status="error"]{border-left:3px solid var(--border-plain-error)}
.app-diag__stage[data-status="loaded"]{border-left:3px solid var(--border-plain-success)}
.app-diag__stage[data-warn="true"]{border-left:3px solid var(--border-plain-warning)}
.app-diag__stage-id{font-weight:700;color:var(--text-title-grey)}
.app-diag__stage-tag{color:var(--text-mention-grey);font-size:.75rem;word-break:break-all}
.app-diag__stage-rows{margin-top:.35rem;font-variant-numeric:tabular-nums}
.app-diag__stage-note{margin-top:.25rem;font-size:.8125rem;color:var(--text-mention-grey)}
.app-diag__stage-note--warn{color:var(--text-default-warning)}
.app-diag__stage-note--error{color:var(--text-default-error);word-break:break-word}
.app-diag__table-wrap{overflow-x:auto}
.app-diag table{width:100%;border-collapse:collapse;font-size:.8125rem}
.app-diag th,.app-diag td{padding:.3rem .5rem;text-align:left;border-bottom:1px solid var(--border-default-grey);white-space:nowrap}
.app-diag th{color:var(--text-mention-grey);font-weight:500}
.app-diag td[data-absent="true"]{color:var(--text-disabled-grey)}
.app-diag__journal{margin:0;padding:0;list-style:none;font-variant-numeric:tabular-nums}
.app-diag__journal li{display:flex;gap:.6rem;padding:.25rem 0;border-bottom:1px solid var(--border-default-grey)}
.app-diag__journal-kind{flex:0 0 5.5rem;color:var(--text-mention-grey);font-size:.75rem;text-transform:uppercase;letter-spacing:.04em}
.app-diag__journal-body{flex:1 1 auto;min-width:0;word-break:break-word}
/* Le rail masquerait le bas du contenu : on lui reserve sa hauteur.
   La double :has monte la specificite au-dessus de la regle mobile de
   app-action-bar, qui pose deja un padding-bottom sur body — sinon le
   gagnant dependrait de l'ordre d'injection des feuilles. */
body:has(app-diagnostic-panel){padding-bottom:var(--app-diagnostic-h,2.25rem)}
@media (max-width:47.99em){
  app-diagnostic-panel{bottom:var(--app-action-bar-fixed-h,0px)}
  .app-diag__body{max-height:60vh}
  .app-diag__rail-summary{display:none}
  body:has(app-diagnostic-panel):has(app-action-bar){padding-bottom:calc(var(--app-action-bar-fixed-h,3.5rem) + var(--app-diagnostic-h,2.25rem))}
}
`;
  document.head.appendChild(style);
}

@customElement('app-diagnostic-panel')
export class AppDiagnosticPanel extends LitElement {
  /** Trace affichée. `null` = rien observé pour l'instant. */
  @property({ attribute: false })
  trace: Trace | null = null;

  /**
   * `live` : le volet observe un pipeline. `rapporte` : il rend une trace
   * qu'on lui a transmise — le seul mode possible là où aucun composant
   * dsfr-data ne tourne.
   */
  @property({ type: String })
  mode: 'live' | 'rapporte' = 'live';

  /** Affiche « Envoyer à l'assistant » (apps conversationnelles). */
  @property({ type: Boolean, attribute: 'can-send' })
  canSend = false;

  /** Explique l'absence de trace quand l'app sait pourquoi. */
  @property({ type: String, attribute: 'empty-hint' })
  emptyHint = '';

  @state() private _open = false;
  @state() private _tab: DiagnosticTab = 'flux';
  @state() private _copied = false;

  private readonly _uid = `app-diag-${++panelSeq}`;
  private _copyTimer: ReturnType<typeof setTimeout> | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    injectAppDiagnosticStyles();
    // Fermé au premier lancement : le volet ne doit pas s'imposer.
    try {
      this._open = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      this._open = false;
    }
    document.addEventListener('keydown', this._onKeydown);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeydown);
    if (this._copyTimer) clearTimeout(this._copyTimer);
  }

  /** Échap referme le tiroir — le volet n'est pas modal, rien d'autre à faire. */
  private _onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this._open) this.toggle(false);
  };

  /**
   * Publie la hauteur du rail dans `--app-diagnostic-h`, comme app-header
   * publie `--app-header-h`. Le rail est en position fixe : sans cette
   * reserve il masque la fin du contenu, et sur une page courte le dernier
   * bouton devient inatteignable.
   */
  private _publishRailHeight(): void {
    const rail = this.querySelector('.app-diag__rail');
    if (!rail) return;
    const height = (rail as HTMLElement).offsetHeight;
    if (height > 0) {
      document.documentElement.style.setProperty('--app-diagnostic-h', `${height}px`);
    }
  }

  protected updated(): void {
    this._publishRailHeight();
  }

  /** Ouvre, ferme, ou bascule. Point d'entrée public pour la barre d'actions. */
  toggle(open?: boolean): void {
    this._open = open ?? !this._open;
    try {
      localStorage.setItem(STORAGE_KEY, this._open ? '1' : '0');
    } catch {
      // Stockage indisponible (navigation privée) : l'état reste en mémoire.
    }
    this.dispatchEvent(
      new CustomEvent('diagnostic-toggle', { detail: { open: this._open }, bubbles: true })
    );
  }

  get isOpen(): boolean {
    return this._open;
  }

  /** Le texte que copient et envoient les deux boutons — un seul format. */
  get diagnosticText(): string {
    if (!this.trace) return 'Aucune trace : le pipeline n’a pas encore été exécuté.';
    return formatTrace(this.trace, { sampleRows: 2 });
  }

  private _summaryText(): TemplateResult | string {
    if (!this.trace) return 'aucune exécution observée';
    const s = summarizeTrace(this.trace);
    if (s.stages === 0) return 'aucun composant dsfr-data';

    const flow =
      s.firstRows === null
        ? 'aucune donnée'
        : s.firstRows === s.lastRows
          ? `${s.firstRows} lignes`
          : `${s.firstRows} → ${s.lastRows} lignes`;

    return html`${s.stages} étape${s.stages > 1 ? 's' : ''} · ${flow} ·
    ${
      s.alerts > 0
        ? html`<span class="app-diag__alert">${s.alerts} alerte${s.alerts > 1 ? 's' : ''}</span>`
        : html`<span class="app-diag__ok">aucune alerte</span>`
    }`;
  }

  private async _copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.diagnosticText);
      this._copied = true;
      if (this._copyTimer) clearTimeout(this._copyTimer);
      this._copyTimer = setTimeout(() => (this._copied = false), 2000);
      this.dispatchEvent(new CustomEvent('diagnostic-copy', { bubbles: true }));
    } catch {
      // Presse-papier refusé : l'utilisateur peut toujours lire le volet.
    }
  }

  private _send(): void {
    this.dispatchEvent(
      new CustomEvent('diagnostic-send', {
        detail: { text: this.diagnosticText },
        bubbles: true,
      })
    );
  }

  // --- Onglets ---

  private _renderFlux(trace: Trace): TemplateResult {
    const nodes = topoOrder(trace.graph);
    if (nodes.length === 0) {
      return html`<p class="app-diag__empty">
        Aucun composant dsfr-data dans cette page — rien à diagnostiquer.
      </p>`;
    }
    return html`
      <div class="app-diag__chain">${nodes.map((node) => this._renderStage(node, trace))}</div>
      ${
        trace.graph.dangling.length > 0
          ? html`<p class="app-diag__stage-note app-diag__stage-note--error">
              ${trace.graph.dangling.map(
                (d) =>
                  html`✗ ${d.node} déclare une source « ${d.missing} » absente de la page — il
                    attend un signal qui ne viendra jamais.<br />`
              )}
            </p>`
          : nothing
      }
    `;
  }

  private _renderStage(node: StageNode, trace: Trace): TemplateResult {
    const state: StageState = trace.states[node.id] ?? { status: 'idle', emissions: 0 };
    const upstreamRows = node.upstream
      .map((up) => trace.states[up]?.rows)
      .filter((n): n is number => n !== undefined);
    const delegation = trace.delegation[node.id];
    const clientSide = delegation && !delegation.groupBy && !delegation.aggregate;
    const warn =
      state.meta?.needsClientProcessing ||
      (state.status === 'loaded' && state.rows === 0) ||
      !!node.configError ||
      (node.role === 'display' && state.status === 'idle' && upstreamRows.every((n) => n === 0));

    return html`
      <div class="app-diag__stage" data-status=${state.status} data-warn=${warn ? 'true' : 'false'}>
        <div class="app-diag__stage-id">${node.id}</div>
        <div class="app-diag__stage-tag">${node.tag}</div>
        ${
          upstreamRows.length > 0
            ? html`<div class="app-diag__stage-note">
                reçoit ${upstreamRows.join(' + ')} lignes ← ${node.upstream.join(', ')}
              </div>`
            : nothing
        }
        <div class="app-diag__stage-rows">
          ${
            state.status === 'loaded'
              ? html`→ <strong>${state.rows}</strong> lignes, ${state.fields?.length ?? 0} champs`
              : state.status === 'error'
                ? html`<span class="app-diag__stage-note--error">✗ échec</span>`
                : state.status === 'loading'
                  ? html`… chargement`
                  : node.role === 'display'
                    ? html`${upstreamRows.some((n) => n > 0) ? '✓ alimenté' : '⚠ rien reçu'}`
                    : html`inerte`
          }
        </div>
        ${
          node.configError
            ? html`<div class="app-diag__stage-note app-diag__stage-note--error">
                ✗ ${node.configError}
              </div>`
            : nothing
        }
        ${
          state.status === 'error'
            ? html`<div class="app-diag__stage-note app-diag__stage-note--error">
                ${state.message}${
                  state.attemptedUrl ? html`<br />URL appelée : ${state.attemptedUrl}` : nothing
                }
              </div>`
            : nothing
        }
        ${
          state.status === 'loaded' && state.rows === 0
            ? html`<div class="app-diag__stage-note app-diag__stage-note--warn">
                ⚠ zéro ligne : l’aval ne rendra rien.
              </div>`
            : nothing
        }
        ${
          state.meta?.needsClientProcessing
            ? html`<div class="app-diag__stage-note app-diag__stage-note--warn">
                ⚠ group-by / agrégation non traités côté serveur : repli client sur ${state.rows}
                lignes rapatriées.
              </div>`
            : nothing
        }
        ${
          clientSide
            ? html`<div class="app-diag__stage-note app-diag__stage-note--warn">
                ⚠ agrégation exécutée côté client.
              </div>`
            : nothing
        }
        ${
          state.emissions > 3
            ? html`<div class="app-diag__stage-note app-diag__stage-note--warn">
                ⚠ ${state.emissions} émissions — rechargements en boucle ?
              </div>`
            : nothing
        }
      </div>
    `;
  }

  /**
   * Matrice champ × étape.
   *
   * L'onglet le plus rentable : un champ renommé en amont — panne qui ne lève
   * aucune erreur et vide la dataviz — s'y voit d'un coup d'œil.
   */
  private _renderChamps(trace: Trace): TemplateResult {
    const stages = topoOrder(trace.graph)
      .map((node) => ({ id: node.id, fields: trace.states[node.id]?.fields ?? [] }))
      .filter((s) => s.fields.length > 0);

    if (stages.length === 0) {
      return html`<p class="app-diag__empty">
        Aucun champ observé : le pipeline n’a encore rien produit.
      </p>`;
    }

    const matrix = fieldMatrix(stages);
    return html`
      <div class="app-diag__table-wrap">
        <table>
          <caption class="fr-sr-only">
            Présence et type de chaque champ à chaque étape du pipeline
          </caption>
          <thead>
            <tr>
              <th scope="col">Champ</th>
              ${stages.map((s) => html`<th scope="col">${s.id}</th>`)}
            </tr>
          </thead>
          <tbody>
            ${matrix.map(
              (row) => html`
                <tr>
                  <th scope="row">${row.field}</th>
                  ${row.byStage.map(
                    (type) =>
                      html`<td data-absent=${type === null ? 'true' : 'false'}>${type ?? '—'}</td>`
                  )}
                </tr>
              `
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  private _renderJournal(trace: Trace): TemplateResult {
    if (trace.events.length === 0) {
      return html`<p class="app-diag__empty">Aucun événement enregistré.</p>`;
    }
    const first = trace.events[0].t;
    return html`
      <ul class="app-diag__journal">
        ${[...trace.events].reverse().map((e) => {
          const at = `+${((e.t - first) / 1000).toFixed(2)} s`;
          let body: TemplateResult | string;
          switch (e.kind) {
            case 'loaded':
              body = html`<strong>${e.node}</strong> → ${e.rows} lignes, ${e.fields.length} champs`;
              break;
            case 'error':
              body = html`<strong>${e.node}</strong> ✗
                ${e.message}${e.attemptedUrl ? html`<br />${e.attemptedUrl}` : nothing}`;
              break;
            case 'loading':
              body = html`<strong>${e.node}</strong> chargement…`;
              break;
            default:
              body = html`${e.from ? html`<strong>${e.from}</strong> → ` : nothing}
                <strong>${e.node}</strong> ${JSON.stringify(e.cmd)}`;
          }
          return html`<li>
            <span class="app-diag__journal-kind">${e.kind} ${at}</span>
            <span class="app-diag__journal-body">${body}</span>
          </li>`;
        })}
      </ul>
    `;
  }

  private _renderBody(): TemplateResult {
    if (!this.trace) {
      return html`<p class="app-diag__empty">
        ${
          this.emptyHint ||
          (this.mode === 'rapporte'
            ? 'Aucun diagnostic chargé. Collez-en un, ou ouvrez-en un produit par une autre app.'
            : 'Exécutez le pipeline pour observer ce qui transite entre les composants.')
        }
      </p>`;
    }
    switch (this._tab) {
      case 'champs':
        return this._renderChamps(this.trace);
      case 'journal':
        return this._renderJournal(this.trace);
      default:
        return this._renderFlux(this.trace);
    }
  }

  render() {
    const bodyId = `${this._uid}-body`;
    return html`
      <div class="app-diag">
        <button
          type="button"
          class="app-diag__rail"
          aria-expanded=${this._open ? 'true' : 'false'}
          aria-controls=${bodyId}
          @click=${() => this.toggle()}
        >
          <span class="app-diag__rail-title">
            <span class="fr-icon-tools-line fr-icon--sm" aria-hidden="true"></span>
            Diagnostic
          </span>
          <span class="app-diag__rail-summary">${this._summaryText()}</span>
          <span
            class="app-diag__rail-chevron ${
              this._open ? 'fr-icon-arrow-down-s-line' : 'fr-icon-arrow-up-s-line'
            } fr-icon--sm"
            aria-hidden="true"
          ></span>
        </button>

        <div
          id=${bodyId}
          class="app-diag__body"
          role="region"
          aria-label="Diagnostic du pipeline"
          ?hidden=${!this._open}
        >
          <div class="app-diag__toolbar">
            <div class="app-diag__tabs" role="tablist" aria-label="Vues du diagnostic">
              ${TABS.map(
                (tab) => html`
                  <button
                    type="button"
                    role="tab"
                    class="app-diag__tab"
                    aria-selected=${this._tab === tab ? 'true' : 'false'}
                    @click=${() => (this._tab = tab)}
                  >
                    ${TAB_LABELS[tab]}
                  </button>
                `
              )}
            </div>
            ${
              this.canSend
                ? html`<button
                    type="button"
                    class="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-send-plane-fill fr-btn--icon-left"
                    ?disabled=${!this.trace}
                    @click=${this._send}
                  >
                    Envoyer à l’assistant
                  </button>`
                : nothing
            }
            <button
              type="button"
              class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-clipboard-line fr-btn--icon-left"
              ?disabled=${!this.trace}
              @click=${this._copy}
            >
              ${this._copied ? 'Diagnostic copié' : 'Copier le diagnostic'}
            </button>
          </div>
          ${this._renderBody()}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-diagnostic-panel': AppDiagnosticPanel;
  }
}

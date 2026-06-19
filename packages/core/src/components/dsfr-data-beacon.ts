import { LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/**
 * <dsfr-data-beacon url="..."> — cible telemetrie declarative (#345).
 *
 * Pendant declaratif de `proxy-url` (#340) cote telemetrie : rend la collecte
 * du beacon VISIBLE et RETIRABLE dans le HTML, au lieu d'un `window.*` opaque.
 * L'integrateur qui colle un embed *voit* qu'une telemetrie part et vers ou,
 * et peut la retirer en connaissance de cause (argument RGPD/souverainete).
 *
 * La presence d'un element avec un `url` non vide :
 *   - fournit l'URL de collecte, **prioritaire** sur `window.DSFR_DATA_BEACON_URL`
 *     puis sur l'URL bakee au build ;
 *   - vaut **opt-in** (equivaut a `window.DSFR_DATA_BEACON = true`).
 * `window.DSFR_DATA_BEACON = false` reste un **kill switch** qui neutralise meme
 * un element present (coherent avec `window.DSFR_DATA_PROXY = false`).
 *
 * L'element est invisible (aucun rendu) et vit dans le bundle core. Il ne
 * declenche AUCUN beacon lui-meme : c'est `beacon.ts` qui le consulte en
 * **lookup paresseux** au moment de l'envoi (#156), donc l'ordre de declaration
 * dans le DOM ne compte pas — l'element peut etre place apres les composants.
 *
 * ```html
 * <dsfr-data-beacon url="https://collecte.ministere.fr"></dsfr-data-beacon>
 * <dsfr-data-chart ...></dsfr-data-chart>
 * ```
 */
@customElement('dsfr-data-beacon')
export class DsfrDataBeacon extends LitElement {
  /** Domaine de collecte du beacon. Vide = pas de cible declarative (no-op). */
  @property({ type: String })
  url = '';

  /** Light DOM : element de configuration, aucun rendu visible. */
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // Element de config strictement invisible (pas de footprint de layout).
    this.style.display = 'none';
  }

  render() {
    return nothing;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-beacon': DsfrDataBeacon;
  }
}

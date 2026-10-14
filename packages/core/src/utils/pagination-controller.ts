/**
 * PaginationController — contrôleur de pagination partagé (#304).
 *
 * dsfr-data-list et dsfr-data-display dupliquaient ~150 lignes de
 * pagination/url-sync avec des dérives réelles :
 * - `?page=3` ignoré en pagination cliente (la page restaurée depuis l'URL
 *   était écrasée par le reset à 1 à l'arrivée des données) ;
 * - tri serveur sans reset de page (trier en page 5 affichait la page 5 du
 *   nouveau tri) ;
 * - `$index` faux en pagination serveur (offset non calculé avec la taille
 *   de page serveur) ;
 * - pagination serveur masquée si l'attribut `pagination` n'était pas
 *   redondé avec le `page-size` de la source.
 *
 * Le contrôleur possède l'état de page (courante/précédente), la détection
 * du mode serveur depuis la meta (#270), la synchronisation URL (lecture,
 * écriture, popstate) et les transitions (changement de page, tri, erreur).
 * Les composants gardent leur rendu et leurs états locaux.
 *
 * Changement de page REFUSÉ en mode serveur (#1288) : la page précédente
 * reste affichée, et le contrôleur sait laquelle a échoué (`failedPage`) —
 * l'hôte dit « La page 4 n'a pas pu être chargée. Vous consultez toujours la
 * page 3. » au lieu de garder l'ancienne page sans un mot. Un échec qui n'est
 * PAS un changement de page (rafraîchissement, tri, filtre) ne laisse aucune
 * page affichée : `failedPage` reste `null` et l'hôte rend le message de panne.
 */
import { dispatchSourceCommand, requestSourceRetry, type PaginationMeta } from './data-bridge.js';

/** Surface minimale attendue du composant hôte */
export interface PaginationHostLike {
  source: string;
  /**
   * Id du composant hote — nomme l'emetteur des commandes remontantes (#603).
   * Optionnel : un afficheur n'est pas tenu d'avoir un id.
   */
  id?: string;
  urlSync: boolean;
  urlPageParam: string;
  /** Taille de page CLIENTE (attribut `pagination` ; 0 = désactivée) */
  pagination: number;
  requestUpdate(): void;
}

export class PaginationController {
  currentPage = 1;
  previousPage = 1;
  serverMode = false;
  serverTotal: number | undefined = undefined;
  serverPageSize = 0;

  /**
   * Page dont le chargement a échoué en mode serveur (#1288), `null` sinon.
   * Tant qu'elle est posée, `currentPage` est la page réellement affichée —
   * la précédente — et la source, elle, est restée sur la page demandée.
   */
  failedPage: number | null = null;

  /** Page demandée au serveur, pas encore reçue (#1288). */
  private _pendingPage: number | null = null;

  /**
   * Page restaurée depuis l'URL, à préserver à la première arrivée de
   * données en mode client (#304) — l'ancien reset à 1 écrasait `?page=3`.
   */
  private _pendingUrlPage: number | null = null;

  private _popstateHandler: (() => void) | null = null;

  constructor(private host: PaginationHostLike) {}

  /** À appeler depuis connectedCallback du composant */
  connect(): void {
    if (!this.host.urlSync) return;
    this.applyUrlPage();
    this._popstateHandler = () => {
      this.applyUrlPage();
      this.host.requestUpdate();
    };
    window.addEventListener('popstate', this._popstateHandler);
  }

  /** À appeler depuis disconnectedCallback du composant */
  disconnect(): void {
    if (this._popstateHandler) {
      window.removeEventListener('popstate', this._popstateHandler);
      this._popstateHandler = null;
    }
  }

  /** Lit `?page=N` et l'applique (commande envoyée à la source si présente) */
  applyUrlPage(): void {
    const params = new URLSearchParams(window.location.search);
    const pageStr = params.get(this.host.urlPageParam);
    if (!pageStr) return;
    const page = parseInt(pageStr, 10);
    if (isNaN(page) || page < 1) return;

    this.currentPage = page;
    this._pendingUrlPage = page;
    // La source server-side utilisera la commande ; les autres l'ignorent
    if (this.host.source) {
      dispatchSourceCommand(this.host.source, { page, origin: this.host.id });
    }
  }

  /**
   * À appeler depuis onSourceData avec la meta de la source.
   * Mode serveur (#270) : serverSide explicite + pageSize > 0 — la meta
   * fait foi. Mode client : reset page 1, SAUF restauration URL en attente.
   */
  onData(meta: PaginationMeta | undefined): void {
    this._pendingPage = null;
    this.failedPage = null;
    if (meta && meta.serverSide && meta.pageSize > 0) {
      this.serverMode = true;
      this.serverTotal = meta.total;
      this.serverPageSize = meta.pageSize;
      this.currentPage = meta.page;
      this._pendingUrlPage = null;
    } else {
      this.serverMode = false;
      if (this._pendingUrlPage !== null) {
        this.currentPage = this._pendingUrlPage;
        this._pendingUrlPage = null;
      } else {
        this.currentPage = 1;
      }
    }
  }

  /**
   * Échec de fetch en mode serveur. Si c'est un changement de page qui a
   * échoué et qu'une page est affichée : retour à la page précédente, dans
   * l'état comme dans l'URL, et la page refusée est notée (#1288).
   *
   * Tout autre échec ne touche pas à la page : avant #1288 un rafraîchissement
   * raté ramenait `currentPage` à la page d'un changement ANCIEN, et la
   * pagination désignait une page qui n'était pas celle des lignes affichées.
   * Un nouvel échec sur la même page refusée (« Réessayer ») garde l'état.
   */
  onError(hasData: boolean): void {
    if (!this.serverMode || !hasData) {
      this._pendingPage = null;
      this.failedPage = null;
      return;
    }
    if (this._pendingPage === null) return;
    this.failedPage = this._pendingPage;
    this._pendingPage = null;
    this.currentPage = this.previousPage;
    if (this.host.urlSync) this.syncUrl();
  }

  /**
   * Les lignes viennent d'un RELEVÉ (#1288, `stale-if-error`) : la source est
   * en panne, l'hôte reprend ce qu'elle avait livré. Le mode serveur se relit
   * dans la meta, que la panne ne déplace pas — un bloc monté pendant la panne
   * ne l'a jamais reçue. La page n'est PAS ramenée à 1 en mode client : ce
   * sont les mêmes lignes, l'usager reste où il était.
   */
  onStale(meta: PaginationMeta | undefined): void {
    this._pendingPage = null;
    this.failedPage = null;
    if (meta && meta.serverSide && meta.pageSize > 0) {
      this.serverMode = true;
      this.serverTotal = meta.total;
      this.serverPageSize = meta.pageSize;
      this.currentPage = meta.page;
    } else {
      this.serverMode = false;
    }
  }

  /** Reset des états au changement de source (#284) */
  reset(): void {
    this.serverMode = false;
    this.currentPage = 1;
    this.previousPage = 1;
    this.serverTotal = undefined;
    this.serverPageSize = 0;
    this._pendingPage = null;
    this.failedPage = null;
  }

  /** Changement de page (optimiste en mode serveur — commande envoyée) */
  changePage(page: number): void {
    this.previousPage = this.currentPage;
    this.currentPage = page;
    if (this.serverMode && this.host.source) {
      if (this.failedPage === page) {
        // La source est restée sur la page refusée (#1288) : lui redemander
        // cette page serait une commande sans effet, dédupliquée (#276). Le
        // geste de l'usager est un nouvel essai — la source recharge.
        requestSourceRetry(this.host.source);
      } else {
        dispatchSourceCommand(this.host.source, { page, origin: this.host.id });
      }
      this._pendingPage = page;
    }
    if (this.host.urlSync) this.syncUrl();
    this.host.requestUpdate();
  }

  /**
   * Tri délégué au serveur : TOUJOURS revenir page 1 (#304) — trier en
   * page 5 affichait la page 5 du nouveau tri. orderBy et page partent
   * dans la même commande (un seul refetch).
   */
  notifyServerSort(orderBy: string): void {
    this.previousPage = this.currentPage;
    this.currentPage = 1;
    // Un tri n'est pas un changement de page (#1288) : s'il échoue, aucune
    // page de l'ancien tri ne reste affichée.
    this._pendingPage = null;
    this.failedPage = null;
    if (this.host.source) {
      dispatchSourceCommand(this.host.source, { orderBy, page: 1, origin: this.host.id });
    }
    if (this.host.urlSync) this.syncUrl();
    this.host.requestUpdate();
  }

  /**
   * Tri INITIAL délégué au serveur (#1178) : l'attribut `sort` d'un afficheur
   * en `server-sort` part à la source dès la connexion, avant son premier
   * chargement — sans quoi la flèche de tri s'affichait sur des lignes non
   * triées. La page n'est PAS ramenée à 1 : celle restaurée depuis l'URL
   * (#304) reste celle qu'on affiche.
   */
  notifyInitialServerSort(orderBy: string): void {
    if (this.host.source) {
      dispatchSourceCommand(this.host.source, { orderBy, origin: this.host.id });
    }
  }

  /** Recherche/filtre local : retour page 1 */
  resetToFirstPage(): void {
    this.currentPage = 1;
    if (this.host.urlSync) this.syncUrl();
  }

  /** Écrit la page courante dans l'URL (replaceState) */
  syncUrl(): void {
    const params = new URLSearchParams(window.location.search);
    if (this.currentPage > 1) {
      params.set(this.host.urlPageParam, String(this.currentPage));
    } else {
      params.delete(this.host.urlPageParam);
    }
    const search = params.toString();
    const newUrl = search
      ? `${window.location.pathname}?${search}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, '', newUrl);
  }

  /** Nombre total de pages (client ou serveur) */
  totalPages(clientItemCount: number): number {
    if (this.serverMode) {
      if (this.serverTotal === undefined) {
        // Total inconnu (#270) : proposer "page suivante" tant que pleine
        const pageFull = clientItemCount >= this.serverPageSize;
        return pageFull ? this.currentPage + 1 : this.currentPage;
      }
      return Math.max(1, Math.ceil(this.serverTotal / this.serverPageSize));
    }
    if (!this.host.pagination || this.host.pagination <= 0) return 1;
    return Math.max(1, Math.ceil(clientItemCount / this.host.pagination));
  }

  /**
   * Offset absolu du premier item affiché — `$index` exact en pagination
   * serveur (#304) : l'offset se calcule avec la taille de page SERVEUR.
   */
  pageOffset(): number {
    if (this.serverMode) {
      return (this.currentPage - 1) * this.serverPageSize;
    }
    if (!this.host.pagination || this.host.pagination <= 0) return 0;
    return (this.currentPage - 1) * this.host.pagination;
  }

  /**
   * La pagination doit-elle s'afficher ? En mode serveur : OUI, même sans
   * attribut `pagination` redondant (#304 — elle était masquée si
   * l'attribut n'était pas aligné sur le page-size de la source).
   */
  showPagination(clientItemCount: number): boolean {
    if (this.serverMode) {
      return this.serverTotal === undefined || this.totalPages(clientItemCount) > 1;
    }
    return this.host.pagination > 0 && clientItemCount > this.host.pagination;
  }
}

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
 */
import { dispatchSourceCommand, type PaginationMeta } from './data-bridge.js';

/** Surface minimale attendue du composant hôte */
export interface PaginationHostLike {
  source: string;
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
      dispatchSourceCommand(this.host.source, { page });
    }
  }

  /**
   * À appeler depuis onSourceData avec la meta de la source.
   * Mode serveur (#270) : serverSide explicite + pageSize > 0 — la meta
   * fait foi. Mode client : reset page 1, SAUF restauration URL en attente.
   */
  onData(meta: PaginationMeta | undefined): void {
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

  /** Échec de fetch en mode serveur : revert à la page précédente */
  onError(hasData: boolean): void {
    if (this.serverMode && hasData) {
      this.currentPage = this.previousPage;
    }
  }

  /** Reset des états au changement de source (#284) */
  reset(): void {
    this.serverMode = false;
    this.currentPage = 1;
    this.previousPage = 1;
    this.serverTotal = undefined;
    this.serverPageSize = 0;
  }

  /** Changement de page (optimiste en mode serveur — commande envoyée) */
  changePage(page: number): void {
    this.previousPage = this.currentPage;
    this.currentPage = page;
    if (this.serverMode && this.host.source) {
      dispatchSourceCommand(this.host.source, { page });
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
    if (this.host.source) {
      dispatchSourceCommand(this.host.source, { orderBy, page: 1 });
    }
    if (this.host.urlSync) this.syncUrl();
    this.host.requestUpdate();
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

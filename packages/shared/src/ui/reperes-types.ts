/**
 * Repères d'interface : le contrat du registre généré (#997, epic #992, ADR-143).
 *
 * Chaque contrôle et chaque zone de réglage d'une app porte un repère LITTÉRAL
 * dans son balisage :
 *
 *   data-zone="carto.elements"                           (zone : panneau, section)
 *   data-zone="carto.elements.clic"                      (sous-zone)
 *   data-repere="carto.elements.clic.popup-mode"         (contrôle)
 *   data-attribut="dsfr-data-map-popup:mode"             (attribut(s) de la lib pilotés)
 *   data-prerequis="couche-active"                       (règle(s) nommée(s) de l'app)
 *   data-repere-libelle="Couleur"                        (libellé littéral, prioritaire)
 *
 * `data-repere-libelle` est réservé aux contrôles répétés dont le nom accessible
 * est dynamique (une pastille par couleur, un bouton par couche) : il donne le
 * libellé de la famille, l'`aria-label` dynamique reste le nom accessible.
 *
 * Grammaire des identifiants : `<prefixe>.<zone>…` ; une zone a au moins deux
 * segments, un contrôle au moins trois. La zone d'un repère est TOUJOURS son
 * identifiant privé du dernier segment, et elle doit exister comme `data-zone` :
 * le chemin annoncé (« Panneau Éléments › Au clic ») se dérive du registre seul,
 * y compris pour un gabarit TS rendu par `innerHTML`, sans ancêtre lexical.
 *
 * `npm run build:reperes` extrait ces marques (index.html + gabarits TS) et
 * écrit `apps/<app>/src/assistant/reperes.generated.ts`, jamais édité à la main ;
 * `npm run check:reperes` le vérifie en CI.
 *
 * Consommateurs : révélation d'un contrôle (`reveler()` / `montrer()`, #1003),
 * panneau assistant (#1011), correspondance sans modèle (#1012, qui projette le
 * registre en `MatchableSkill[]`).
 *
 * Types seulement, sans import, côté app : exportés par `@dsfr-data/shared`,
 * jamais par `@dsfr-data/shared/lib` (frontière #319).
 */

/** Un contrôle (input, select, textarea, button…) ou une zone qui en regroupe. */
export type GenreRepere = 'controle' | 'zone';

/** Attribut d'un composant `dsfr-data-*` piloté par un contrôle. */
export interface AttributRepere {
  /** Nom de balise : `dsfr-data-map-layer`. */
  readonly tag: string;
  /** Nom d'attribut : `popup-template`. */
  readonly nom: string;
  /** Description tirée du custom-elements manifest (JSDoc du composant). */
  readonly description: string;
}

/** Une entrée du registre généré. */
export interface Repere {
  /** Identifiant stable, préfixé par l'app : `carto.elements.clic.popup-mode`. */
  readonly id: string;
  readonly genre: GenreRepere;
  /**
   * Libellé tel que l'usager le lit : `data-repere-libelle` (famille d'un
   * contrôle répété), sinon `<label for>`, sinon `aria-label`, sinon
   * `aria-labelledby`, sinon le `<label>` englobant, sinon le texte, sinon
   * `title` (pour une zone : son premier titre, `legend` ou `summary`).
   */
  readonly libelle: string;
  /** Balise porteuse : `select`, `button`, `section`… */
  readonly element: string;
  /**
   * Zone englobante : l'identifiant privé de son dernier segment. Toujours
   * présente pour un contrôle ; pour une zone, seulement si c'est une sous-zone.
   */
  readonly zone?: string;
  /** Attributs de la lib pilotés par ce contrôle (`data-attribut`). */
  readonly attributs: readonly AttributRepere[];
  /** Prérequis nommés (`data-prerequis`), implémentés dans le `prerequis.ts` de l'app. */
  readonly prerequis: readonly string[];
  /** Synonymes déclarés dans `reperes.config.ts` (correspondance sans modèle, #1012). */
  readonly synonymes: readonly string[];
  /** Fichiers, relatifs à la racine du dépôt, où le repère est posé (sans numéro de ligne). */
  readonly sources: readonly string[];
}

/** Registre d'une app, tel que le reçoivent l'assistant (#1011) et la correspondance (#1012). */
export interface RegistreReperes {
  /** Dossier de l'app sous `apps/` : `builder-carto`. */
  readonly app: string;
  /** Préfixe des identifiants : `carto`. */
  readonly prefixe: string;
  readonly reperes: readonly Repere[];
}

/**
 * Prérequis : règle nommée, implémentée une fois par app dans
 * `apps/<app>/src/assistant/prerequis.ts` (`export const PREREQUIS = { … }`).
 * Un prérequis manquant n'est jamais un refus : l'assistant montre d'abord le
 * repère qui le lève, puis reprend (ADR-143 §5).
 */
export interface Prerequis<Etat = unknown> {
  /** Ce que l'assistant dit quand le prérequis n'est pas rempli. */
  readonly message: string;
  /** Identifiant du repère qui lève le prérequis (vérifié par check:reperes). */
  readonly repereQuiLeve: string;
  readonly verifier: (etat: Etat) => boolean;
}

export type PrerequisParId<Etat = unknown> = Readonly<Record<string, Prerequis<Etat>>>;

/**
 * Fonction de gabarit qui reçoit le repère en paramètre (`fieldInput({ repere })`) :
 * l'expression y est tolérée dans `data-repere`, et l'extracteur lit à la place
 * ses SITES D'APPEL, dont les propriétés `repere`, `label`, `attribut` et
 * `prerequis` doivent être littérales.
 */
export interface HelperRepere {
  /** Nom de la fonction : `fieldInput`. */
  readonly fonction: string;
  /** Propriété de l'objet passé en argument qui porte l'identifiant : `repere`. */
  readonly parametre: string;
}

/** Exception au contrôle « tout contrôle d'une zone de réglage porte un repère ». */
export interface ExceptionRepere {
  /** Sélecteur simple : `#id`, `.classe`, `tag[attr]`, `tag[attr="v"]`. */
  readonly cible: string;
  /** Pourquoi ce contrôle n'a pas de repère. Obligatoire. */
  readonly raison: string;
}

/** Configuration d'une app : `apps/<app>/src/assistant/reperes.config.ts`. */
export interface ReperesConfig {
  /** Dossier de l'app sous `apps/` : `builder-carto`. */
  readonly app: string;
  /** Préfixe des identifiants : `carto` (→ `carto.elements.clic.popup-mode`). */
  readonly prefixe: string;
  /** Fichiers balisés, relatifs au dossier de l'app : `index.html`, `src/main.ts`… */
  readonly sources: readonly string[];
  /**
   * Zones de réglage : tout `input`, `select`, `textarea` ou `button` qu'elles
   * contiennent (lexicalement) doit porter un repère. `#id` désigne un élément
   * par son id, toute autre valeur un `data-zone`.
   */
  readonly zonesDeReglage: readonly string[];
  readonly exceptions: readonly ExceptionRepere[];
  /** Fonctions de gabarit qui posent un repère reçu en paramètre. */
  readonly helpers?: readonly HelperRepere[];
  /** Module des prérequis de l'app, relatif au dossier de l'app. */
  readonly prerequis?: string;
  /** Fichiers de constats citant des repères, relatifs à la racine du dépôt. */
  readonly constats?: readonly string[];
  /** Synonymes par identifiant de repère. */
  readonly synonymes?: Readonly<Record<string, readonly string[]>>;
}

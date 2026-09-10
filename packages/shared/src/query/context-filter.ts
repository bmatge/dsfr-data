/**
 * Contrat d'un filtre de `dsfr-data-context` (#678, ADR-104 — amende ADR-031).
 *
 * Extrait tel quel de ce que le contexte attendait de `dsfr-data-context-filter`,
 * pour que d'autres composants qui filtrent (facettes, recherche, carte) puissent
 * s'enregistrer aupres du meme bus de diffusion : un seul contexte diffuse,
 * traduit au dialecte de chaque source, porte l'URL et alimente les tags.
 *
 * Un filtre construit sa clause en **colon** (dialecte pivot de la lib,
 * `champ:op:valeur, champ2:op:v1|v2`) — chaine vide = filtre inactif (retrait
 * sur le meme whereKey). Le contexte n'inspecte jamais l'UI du filtre : il ne
 * connait que ce contrat.
 */
export interface ContextFilterLike {
  /** Colonne filtree — cle du whereKey stable et nom du parametre d'URL */
  readonly field: string;

  /** Cibles : `*` (toutes les sources du contexte) ou ids separes par des espaces */
  readonly applyTo: string;

  /**
   * Operateur declare (eq, in, contains…) — sert uniquement a la detection
   * de doublon field+operator (avertissement console, ADR-031). Optionnel :
   * un filtre sans operateur fixe n'est jamais signale comme doublon.
   */
  readonly operator?: string;

  /** Un filtre retire du DOM n'est plus actif (recap des tags) */
  readonly isConnected: boolean;

  /** Clause colon courante — chaine vide si le filtre est inactif */
  buildColonWhere(): string;

  /** Libelle naturel (tags) */
  displayLabel(): string;

  /** Valeur humaine du filtre (tags) */
  displayValue(): string;

  /**
   * Reinitialise le filtre par le MEME chemin qu'un geste utilisateur :
   * vide son UI puis re-emet — sources, URL et tags se mettent a jour ensemble.
   */
  clear(): void;

  /** Valeur pour l'URL (valeurs jointes par virgule) — chaine vide = parametre retire */
  urlValue(): string;

  /**
   * Valeurs humaines, une par une, quand le filtre en porte plusieurs (#679 :
   * une facette `in` donne un tag par valeur, supprimable individuellement).
   * Optionnel : sans cette methode, les tags rendent `displayValue()` en un
   * seul tag et la croix appelle `clear()`.
   */
  displayValues?(): string[];

  /**
   * Retire UNE valeur (celle de `displayValues()`) par le meme chemin qu'un
   * geste utilisateur — les autres restent actives. Optionnel, va de pair
   * avec `displayValues()`.
   */
  clearValue?(value: string): void;
}

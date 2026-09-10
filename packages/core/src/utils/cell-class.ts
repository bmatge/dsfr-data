/**
 * Colonne calculée devenue classe CSS d'une cellule (#740).
 *
 * `threshold-*` n'existait que sur `dsfr-data-kpi` : un tableau ne pouvait pas
 * signaler visuellement une valeur hors seuil. Plutôt qu'un second jeu de
 * seuils par colonne, la voie retenue réutilise la mécanique déjà là :
 * `compute` de dsfr-data-normalize sait produire une tranche
 * (`when … then 'seuil-bas' else 'seuil-ok'`, #671) ; il ne manquait que de
 * pouvoir en faire une classe sur la cellule.
 *
 * Deux conséquences : une seule mécanique au lieu de deux, et le critère
 * RGAA 1.4.1 (« l'information n'est pas portée par la seule couleur »)
 * satisfait par construction, la valeur textuelle existant déjà dans une
 * colonne — l'afficheur la restitue aux lecteurs d'écran quand cette colonne
 * n'est pas montrée.
 */

/** Une paire `colonne → colonne portant la classe` */
export interface CellClassRule {
  /** Colonne dont la cellule reçoit la classe */
  column: string;
  /** Colonne dont la valeur EST la classe (souvent une colonne calculée) */
  classColumn: string;
}

/**
 * Analyse `cell-class` : `"montant:alerte, delai:retard"`, ou `"statut"` seul
 * (la cellule est classée par sa propre valeur). Les entrées vides sont
 * ignorées ; la dernière règle d'une même colonne gagne.
 */
export function parseCellClassRules(expr: string): CellClassRule[] {
  if (!expr) return [];
  const rules: CellClassRule[] = [];
  for (const part of expr.split(',')) {
    const raw = part.trim();
    if (!raw) continue;
    const [column, classColumn] = raw.split(':').map((s) => s.trim());
    if (!column) continue;
    rules.push({ column, classColumn: classColumn || column });
  }
  return rules;
}

/**
 * Un identifiant CSS acceptable : lettre, tiret bas ou tiret initial, puis
 * lettres, chiffres, tirets et tirets bas. Les lettres accentuées sont
 * valides en CSS et acceptées. Tout le reste (espaces internes, guillemets,
 * chevrons, points, deux-points) est écarté — la valeur vient de la donnée,
 * elle n'a pas à pouvoir sortir de l'attribut `class`.
 */
const CSS_IDENT = /^[A-Za-zÀ-ɏ_-][A-Za-z0-9À-ɏ_-]*$/;

/**
 * Classes retenues pour une valeur de colonne : les mots qui sont des
 * identifiants CSS valides. `"seuil-bas"` donne `["seuil-bas"]`,
 * `"fr-badge fr-badge--error"` en donne deux, `"12 %"` n'en donne aucune.
 */
export function cellClassTokens(value: unknown): string[] {
  if (value === null || value === undefined || typeof value === 'object') return [];
  const text = String(value).trim();
  if (!text) return [];
  return text.split(/\s+/).filter((token) => CSS_IDENT.test(token));
}

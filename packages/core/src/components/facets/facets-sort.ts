import {
  DEFAULT_FACET_SORT,
  FACET_SORT_CRITERIA,
  type FacetSort,
  type FacetValue,
} from './facets-types.js';

/**
 * Tri des valeurs de facettes (#645, #741), sorti du composant (#838).
 *
 * Les avertissements ne sont pas emis ici : la fonction recoit un rappel
 * `warn`, que le composant dedoublonne par instance (`_deprecatedSortWarned`).
 * Le module reste donc pur et testable sans DOM.
 */

/** Rappel d'avertissement : la forme brute fautive, puis le message. */
export type SortWarn = (raw: string, message: string) => void;

/**
 * Resout un critère de tri isole (`count`, `alpha`, `count:asc`…) en
 * (critère, sens) — grammaire `critere:sens` de `order-by` (#645). Les
 * formes `-count` / `-alpha` restent acceptees avec leur sens historique
 * mais sont signalees : le tiret y voulait dire « inverse du défaut »
 * (croissant pour count, decroissant pour alpha), une convention ambigue
 * qu'aucune forme explicite ne partage.
 */
export function resolveSortCriterion(raw: string, warn: SortWarn): FacetSort {
  if (raw === '-count' || raw === '-alpha') {
    const by = raw === '-count' ? 'count' : 'alpha';
    const dir = by === 'count' ? 'asc' : 'desc';
    warn(
      raw,
      `sort="${raw}" est deprecie — le tiret signifie « inverse du defaut » ` +
        `(${by === 'count' ? 'du plus rare au plus fréquent' : 'Z vers A'}), une convention ambigue. ` +
        `Utiliser sort="${by}:${dir}" (grammaire de order-by : count:desc, count:asc, alpha:asc, alpha:desc).`
    );
    return { by, dir };
  }
  const [byPart, dirPart] = raw.split(':');
  const byKey = byPart.trim();
  if (byKey !== 'alpha' && byKey !== 'count') {
    // Une faute de frappe retombait en silence sur `count` (revue 2026-09-13).
    warn(
      raw,
      `sort="${raw}" — critère « ${byKey} » inconnu, ` +
        `tri par fréquence appliqué. Critères : count, alpha (ex. sort="alpha:asc").`
    );
  }
  const by = byKey === 'alpha' ? 'alpha' : 'count';
  const defaultDir = by === 'count' ? 'desc' : 'asc';
  const trimmedDir = (dirPart ?? '').trim();
  const dir = trimmedDir === 'asc' || trimmedDir === 'desc' ? trimmedDir : defaultDir;
  return { by, dir };
}

/**
 * Decoupe l'attribut `sort` en un tri par défaut et un tri par champ
 * (#741). Une entrée est « par champ » des qu'elle porte trois segments
 * (`annee:alpha:asc`) ou qu'elle en porte deux dont le premier n'est pas
 * un critère (`annee:alpha`) : la forme globale historique (`count`,
 * `alpha:desc`, `-count`) ne peut jamais prendre ces formes. Le champ `*`
 * pose le tri par défaut des champs non nommes.
 */
export function parseSortAttribute(
  raw: string,
  warn: SortWarn
): { fallback: FacetSort; byField: Map<string, FacetSort> } {
  const byField = new Map<string, FacetSort>();
  if (!raw) return { fallback: DEFAULT_FACET_SORT, byField };

  let fallback: FacetSort = DEFAULT_FACET_SORT;
  for (const entry of raw.split('|')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const segments = trimmed.split(':').map((s) => s.trim());
    const perField =
      segments.length >= 3 || (segments.length === 2 && !FACET_SORT_CRITERIA.has(segments[0]));
    if (!perField) {
      fallback = resolveSortCriterion(trimmed, warn);
      continue;
    }
    const field = segments[0];
    if (!field) continue;
    const criterion = resolveSortCriterion(segments.slice(1).join(':'), warn);
    if (field === '*') fallback = criterion;
    else byField.set(field, criterion);
  }
  return { fallback, byField };
}

/**
 * Copie triee des valeurs, collation francaise pour `alpha`.
 *
 * Le tri alphabetique porte sur ce qui est AFFICHE : le libelle de valeur
 * quand `value-labels` en pose un (#928), la valeur brute sinon. Ranger par
 * code une liste qui montre des noms donnerait un ordre incomprehensible
 * (« Ain » derriere « Morbihan » parce que 75 > 56).
 */
export function sortFacetValues(values: FacetValue[], { by, dir }: FacetSort): FacetValue[] {
  const sign = dir === 'asc' ? 1 : -1;
  const sorted = [...values];
  if (by === 'alpha') {
    sorted.sort((a, b) => sign * (a.label ?? a.value).localeCompare(b.label ?? b.value, 'fr'));
  } else {
    sorted.sort((a, b) => sign * (a.count - b.count));
  }
  return sorted;
}

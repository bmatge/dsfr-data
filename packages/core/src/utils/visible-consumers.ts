/**
 * Qui REGARDE une source (#931, AM-083).
 *
 * Le bus est plat : `dsfr-data-loaded` dit qui émet, jamais qui consomme.
 * Les arêtes n'existent que dans le DOM — l'`id` d'un composant et l'attribut
 * qui le nomme chez son voisin. Ce module les remonte pour répondre à une
 * question précise : **quels éléments de la page faut-il regarder entrer dans
 * le viewport pour savoir que cette source sert enfin à quelque chose ?**
 *
 * Deux règles, qui expliquent pourquoi on ne peut pas se contenter des
 * consommateurs directs :
 *
 * 1. **Les transformateurs n'ont pas de boîte.** Un `dsfr-data-query` est un
 *    tuyau : sur les pages du banc d'essai, il est déclaré en haut du
 *    document, à côté de sa source, tandis que le graphique qu'il nourrit
 *    vit dans le panneau d'onglet. Observer le tuyau reviendrait à observer
 *    le haut de page — c'est-à-dire à ne rien différer du tout. On descend
 *    donc la chaîne jusqu'aux **feuilles**, les composants qui rendent
 *    quelque chose.
 * 2. **Une couche de carte n'est pas ce qu'on voit.** `dsfr-data-map-layer`
 *    est un élément invisible dans le light DOM de `dsfr-data-map` : c'est la
 *    carte qui a la hauteur et que l'utilisateur regarde. On remonte donc de
 *    la couche à sa carte.
 *
 * Ce que ce module ne sait PAS voir, et qui est documenté comme tel :
 * un consommateur créé en JavaScript avec la seule propriété `source` (sans
 * l'attribut), et les instances fabriquées au vol par le gabarit d'un
 * `dsfr-data-repeat` ou d'un `dsfr-data-display` (leurs ids sont interpolés
 * à partir de la donnée, donc inconnus avant le chargement). Dans les deux
 * cas, le répéteur ou l'afficheur lui-même est vu, et c'est lui qu'on
 * observe — ce qui est le bon élément.
 */

/**
 * Feuilles du pipeline : les composants qui RENDENT quelque chose, donc les
 * seuls dont la visibilité veut dire « quelqu'un regarde ». Aligné sur les
 * rôles `display` de `STAGE_ROLES` (`packages/shared/src/debug/graph.ts`),
 * recopié ici pour ne pas faire entrer le module de diagnostic dans le
 * bundle d'une source.
 */
const LEAF_TAGS: ReadonlySet<string> = new Set([
  'dsfr-data-a11y',
  'dsfr-data-chart',
  'dsfr-data-display',
  'dsfr-data-kpi',
  'dsfr-data-list',
  'dsfr-data-map-layer',
  'dsfr-data-podium',
  'dsfr-data-repeat',
]);

/** Échappe un id pour l'injecter dans un sélecteur d'attribut. */
function quote(id: string): string {
  return id.replace(/["\\]/g, '\\$&');
}

/**
 * Éléments qui déclarent consommer `id` par un de leurs attributs d'arête.
 *
 * - `source` : le cas général (feuilles et transformateurs) ;
 * - `left` / `right` : les deux entrées d'un `dsfr-data-join` ;
 * - `sources` : la liste d'ids d'un `dsfr-data-concat` (#777) ;
 * - `scopes` : les sources partitionnées par un `dsfr-data-repeat`
 *   (`source:champ:alias | …`, #891).
 */
function directConsumers(id: string): Element[] {
  const q = quote(id);
  const found = new Set<Element>();
  for (const el of Array.from(
    document.querySelectorAll(`[source="${q}"], [left="${q}"], [right="${q}"]`)
  )) {
    found.add(el);
  }
  for (const el of Array.from(document.querySelectorAll('[sources]'))) {
    const list = (el.getAttribute('sources') ?? '').split(',').map((s) => s.trim());
    if (list.includes(id)) found.add(el);
  }
  for (const el of Array.from(document.querySelectorAll('[scopes]'))) {
    const entries = (el.getAttribute('scopes') ?? '').split('|');
    if (entries.some((entry) => entry.split(':')[0]?.trim() === id)) found.add(el);
  }
  return [...found];
}

/**
 * Éléments à observer pour savoir si la sortie de `sourceId` est regardée :
 * les feuilles de sa chaîne aval, dans l'ordre du DOM, sans doublon.
 *
 * La marche est une largeur d'abord sur les ids : un transformateur rencontré
 * en chemin pousse son propre id dans la file (il réémet sous ce nom), une
 * feuille est retenue. Les cycles sont fermés par `visited` — un `id` en
 * boucle est une panne de page, pas une raison de boucler ici.
 */
export function visibleConsumers(sourceId: string): Element[] {
  if (!sourceId) return [];
  const visited = new Set<string>();
  const queue: string[] = [sourceId];
  const leaves = new Set<Element>();

  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const el of directConsumers(id)) {
      const tag = el.tagName.toLowerCase();
      if (LEAF_TAGS.has(tag)) {
        // Une couche n'a pas de hauteur : c'est sa carte qu'on regarde.
        const watched = tag === 'dsfr-data-map-layer' ? (el.closest('dsfr-data-map') ?? el) : el;
        leaves.add(watched);
      }
      // Un `dsfr-data-repeat` est une feuille ET un émetteur : sa sortie
      // scopée est fabriquée à partir de la donnée, donc pas suivable ici.
      if (el.id && !LEAF_TAGS.has(tag)) queue.push(el.id);
    }
  }

  return [...leaves];
}

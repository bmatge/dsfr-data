/**
 * Registre des instances `dsfr-data-*` présentes dans la page (#836).
 *
 * `dsfr-data-query` doit savoir QUI LIT une chaîne de délégation avant de
 * déléguer un regroupement au serveur (#765) : la source n'a qu'UN
 * regroupement serveur et elle sert ses lignes à tous ses abonnés. La réponse
 * se lisait par un `document.querySelectorAll('*')` par saut de chaîne, refait
 * à chaque négociation et à chaque contestation — un balayage complet du DOM,
 * jusqu'à dix fois par query, vingt queries sur un tableau de bord.
 *
 * Un sélecteur d'attribut ne remplace pas ce balayage : Lit ne reflète pas
 * `source`, un composant construit en JavaScript (`q.source = 'src'`) n'a pas
 * d'attribut. Ce registre remplace la question : chaque composant qui s'abonne
 * à une chaîne s'inscrit à `connectedCallback` et se retire à
 * `disconnectedCallback` (`TransformerMixin`, `SourceSubscriberMixin`), et la
 * lecture est alors en O(composants de la page), pas en O(nœuds du document).
 *
 * **Un composant s'inscrit au REHAUSSEMENT, pas à l'analyse du document.**
 * L'ordre des `customElements.define` (l'ordre des exports de `index.ts`) fait
 * qu'une `dsfr-data-query` est rehaussée AVANT un `dsfr-data-normalize` ou un
 * `dsfr-data-kpi` écrits dans la même page : au moment où elle négocie, ces
 * composants-là ne sont pas encore dans le registre. C'est pour cela que
 * l'inscription NOTIFIE : la query réagit à l'arrivée d'un composant sur sa
 * chaîne en renégociant (#853 pour un lecteur, #855 pour un maillon relais).
 * Tout se joue dans la même tâche que l'évaluation du module — donc avant le
 * premier fetch, qui est différé d'une macro-tâche par `dsfr-data-source`.
 *
 * Le `dsfr-data-beacon` n'a pas de registre à partager : `beacon.ts` le
 * cherche par un sélecteur d'attribut unique (`dsfr-data-beacon[url]`), en
 * lecture paresseuse et sur un élément qui peut ne jamais être rehaussé.
 */

/** Instances `dsfr-data-*` connectées, dans leur ordre d'inscription. */
const instances = new Set<Element>();

type InstanceListener = (el: Element) => void;

const listeners = new Set<InstanceListener>();

/**
 * Inscrit une instance connectée. Appelé par `connectedCallback` des mixins
 * d'abonnement ; ré-inscrire la même instance est sans effet (pas de double
 * notification quand un composant est déplacé puis remis).
 */
export function registerDsfrDataInstance(el: Element): void {
  if (instances.has(el)) return;
  instances.add(el);
  // Copie : un auditeur peut se désabonner (démontage) pendant la notification.
  for (const listener of [...listeners]) listener(el);
}

/** Retire une instance démontée. */
export function unregisterDsfrDataInstance(el: Element): void {
  instances.delete(el);
}

/** Les instances connectées, en lecture seule. */
export function dsfrDataInstances(): ReadonlySet<Element> {
  return instances;
}

/**
 * S'abonne aux ARRIVÉES d'instances. Rend la fonction de désabonnement.
 * L'auditeur est appelé pour chaque nouvelle inscription, y compris celle
 * d'un composant déjà écrit dans le document mais rehaussé après lui.
 */
export function onDsfrDataInstance(listener: InstanceListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Remise à zéro — réservée aux tests (une page n'en a pas l'usage). */
export function resetDsfrDataInstances(): void {
  instances.clear();
  listeners.clear();
}

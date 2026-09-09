/**
 * Seuil unique d'EPINGLAGE du chrome partage.
 *
 * #613 a choisi 900 px pour empiler les deux colonnes de `app-layout-builder`
 * (280 + 480 px ne tiennent plus en dessous). Le reste du chrome basculait
 * ailleurs : 48em pour le sticky de l'en-tete. Entre 768 et 900 px l'en-tete
 * etait donc epingle dans sa variante DSFR haute PENDANT que la page defilait
 * — et un telephone en PAYSAGE (844x390) tombe pile dans cette bande.
 *
 * INVARIANT. `--app-header-h` a deux usages de nature differente :
 *
 *   - en HAUTEUR (dans un `calc`) il est inconditionnel et sans danger ;
 *   - en DECALAGE D'EPINGLAGE (dans un `top:`) c'est une valeur DERIVEE, qui
 *     n'a de sens que la ou l'en-tete est lui-meme epingle. Elle doit donc
 *     toujours porter la garde `PINNED`.
 *
 * C'est cet invariant qui manquait : `app-action-bar` s'epinglait a
 * `top: var(--app-header-h)` SANS media query, si bien que sur telephone la
 * barre de titre restait clouee a 189 px du haut pendant que son referent
 * sortait de l'ecran — 189 px de contenu defilant AU-DESSUS d'elle.
 * `docs/ux/actions.md` exigeait pourtant l'inverse mot pour mot : « Le titre
 * (et la zone contexte) restent en haut, dans le flux. »
 *
 * Ce seuil n'est PAS celui du chrome mobile (barre d'actions fixee en bas,
 * rail du volet), qui reste a 47.99em : descendre les actions a portee de
 * pouce est un choix de largeur de main, pas d'epinglage.
 *
 * Le litteral `(max-width: 900px)` de `app-layout-builder` n'est PAS
 * interpole — Lit n'accepte pas d'expression dans un `<style>`. Il est
 * verrouille sur `STACK_MAX_PX` par `tests/apps/app-ui/chrome-mobile.test.ts`.
 */

/** Largeur en deca de laquelle les colonnes s'empilent (#613). */
export const STACK_MAX_PX = 900;

/** Largeurs en pile verticale — identique au litteral de app-layout-builder. */
export const STACKED = `(max-width: ${STACK_MAX_PX}px)`;

/** Largeurs a deux colonnes : les seules ou un epinglage haut a un referent. */
export const PINNED = `(min-width: ${STACK_MAX_PX + 0.02}px)`;

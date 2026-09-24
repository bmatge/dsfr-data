/**
 * Apps qui confient du code au Playground (`sessionStorage['playground-code']`
 * puis `?from=<app>`), et le lien de retour vers chacune.
 *
 * Une seule liste : la Carte n'y figurait pas, et son « Ouvrir dans le
 * Playground » ouvrait le Playground sur son contenu par défaut, sans un mot
 * (même panne que #978 côté Builder). Un test-garde relit les apps et vérifie
 * que toute origine qui envoie vers le Playground est ici.
 */

/** Origine d'un code confié, et libellé du lien de retour (« Retour … »). */
export const ORIGINES_CODE = {
  favorites: 'aux Favoris',
  builder: 'au Builder',
  'builder-carto': 'à la carte',
  'builder-ia': 'au Builder IA',
  studio: 'au Studio IA',
  'pipeline-helper': 'au Pipeline',
} as const;

export type OrigineCode = keyof typeof ORIGINES_CODE;

/** Le paramètre `from` (fourni par l'URL, donc non fiable) est-il une origine connue ? */
export function estOrigineCode(from: string | null): from is OrigineCode {
  return from !== null && Object.prototype.hasOwnProperty.call(ORIGINES_CODE, from);
}

/** Message quand du code a été confié par une app que le Playground ne connaît pas. */
export const MESSAGE_ORIGINE_INCONNUE =
  "Du code a été transmis au Playground par une application qu'il ne reconnaît pas : il n'a pas été chargé.";

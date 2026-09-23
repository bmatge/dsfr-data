/**
 * Relire l'instantané de configuration déposé par une autre app (#978).
 *
 * Quatre apps rouvrent un graphique dans le Builder en déposant sa configuration
 * dans `sessionStorage` (`builder-state`) puis en naviguant avec `?from=<app>` :
 * les favoris, le Playground (au retour), le tableau de bord et le Pipeline (au
 * retour, #1095). Le Builder ne relisait que les deux premières : l'état déposé
 * par le tableau de bord était écrit, jamais lu, et le Builder s'ouvrait vierge
 * sans un mot. Celui déposé avant d'ouvrir le Pipeline ne l'était pas non plus,
 * faute de chemin de retour.
 *
 * La liste des origines vit donc ici, à un seul endroit, et tout ce qui empêche
 * de rouvrir un état déposé — origine inconnue, contenu illisible, configuration
 * d'une carte à couches — produit un message, jamais un Builder vierge muet.
 *
 * Le contenu de `sessionStorage` est une entrée : il est parsé défensivement.
 * Fonctions pures : la décision se teste sans navigateur.
 */

/** Apps qui déposent un instantané de configuration avant d'ouvrir le Builder. */
export const ORIGINES_ETAT_DEPOSE = [
  'favorites',
  'playground',
  'dashboard',
  'pipeline-helper',
] as const;

export type OrigineEtatDepose = (typeof ORIGINES_ETAT_DEPOSE)[number];

export function estOrigineEtatDepose(from: string | null): from is OrigineEtatDepose {
  return from !== null && (ORIGINES_ETAT_DEPOSE as readonly string[]).includes(from);
}

export type MotifRefus = 'illisible' | 'pas-une-configuration' | 'configuration-carte';

export type LectureEtatDepose =
  { lisible: true; etat: Record<string, unknown> } | { lisible: false; motif: MotifRefus };

function estObjetSimple(valeur: unknown): valeur is Record<string, unknown> {
  if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) return false;
  const proto = Object.getPrototypeOf(valeur) as unknown;
  return proto === Object.prototype || proto === null;
}

function parser(brut: string): { ok: true; valeur: unknown } | { ok: false } {
  try {
    return { ok: true, valeur: JSON.parse(brut) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * Lit l'instantané déposé. Refuse ce qui n'est pas une configuration du Builder
 * graphique plutôt que de l'appliquer de travers.
 */
export function lireEtatDepose(brut: string): LectureEtatDepose {
  const premier = parser(brut);
  if (!premier.ok) return { lisible: false, motif: 'illisible' };
  let valeur = premier.valeur;

  // Une configuration enregistrée sous forme de texte JSON (colonne texte d'une
  // ancienne base) arrive encodée deux fois : on la décode une seule fois de plus.
  if (typeof valeur === 'string') {
    const second = parser(valeur);
    if (!second.ok) return { lisible: false, motif: 'illisible' };
    valeur = second.valeur;
  }

  if (!estObjetSimple(valeur)) return { lisible: false, motif: 'pas-une-configuration' };

  // Un favori né du Builder carto porte une carte à couches (`map` + `layers`),
  // que le Builder graphique appliquerait en silence de travers (#965).
  if (Array.isArray(valeur.layers) && !('chartType' in valeur)) {
    return { lisible: false, motif: 'configuration-carte' };
  }

  return { lisible: true, etat: valeur };
}

const PROVENANCE: Record<OrigineEtatDepose, string> = {
  favorites: 'depuis les favoris',
  playground: 'depuis le Playground',
  dashboard: 'depuis le tableau de bord',
  'pipeline-helper': 'depuis le Pipeline',
};

const RAISON: Record<MotifRefus, string> = {
  illisible: 'sa configuration est illisible',
  'pas-une-configuration': "ce qui a été transmis n'est pas une configuration de graphique",
  'configuration-carte':
    'sa configuration décrit une carte à couches, que le Builder graphique ne sait pas rouvrir ' +
    '(ouvrez-la dans le Builder carto ou son code dans le Playground)',
};

/** Message affiché quand un état déposé est refusé : la raison, puis l'effet. */
export function messageEtatRefuse(from: OrigineEtatDepose, motif: MotifRefus): string {
  return (
    `Le graphique transmis ${PROVENANCE[from]} n'a pas pu être rouvert : ${RAISON[motif]}. ` +
    "Le Builder s'ouvre sur une configuration vierge."
  );
}

/** Message affiché quand un état est déposé par une app que le Builder ne connaît pas. */
export const MESSAGE_ORIGINE_INCONNUE =
  "Une configuration a été transmise au Builder par une application qu'il ne reconnaît pas : " +
  "elle n'a pas été rouverte. Le Builder s'ouvre sur une configuration vierge.";

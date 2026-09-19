/**
 * « Ouvrir dans le Builder » : dire la vraie raison quand ça n'est pas possible (#965).
 *
 * Le Builder se rouvre depuis une **configuration** enregistrée avec le favori,
 * jamais depuis son code. Trois favoris sur quatre en ont une ; les autres non,
 * et jusqu'ici tous recevaient le même message — « Ce favori a été créé avant la
 * mise à jour » — qui accuse l'âge alors que le motif réel est ailleurs. Un
 * message qui donne une raison fausse coûte plus cher que pas de message : il
 * envoie chercher au mauvais endroit.
 *
 * Fonction pure : la décision se teste sans navigateur.
 */

/** Ce que la décision a besoin de savoir d'un favori. */
export interface FavoriAOuvrir {
  code?: string;
  sourceApp?: string;
  /** @deprecated entrées locales anciennes */
  source?: string;
  builderStateJson?: Record<string, unknown>;
  /** @deprecated entrées locales anciennes */
  builderState?: Record<string, unknown>;
}

export type OuvertureFavori =
  /** Le Builder sait rouvrir ce favori : on lui passe sa configuration. */
  | { cible: 'builder'; etat: Record<string, unknown> }
  /** Le Builder ne sait pas : on ouvre le code dans le Playground, en le disant. */
  | {
      cible: 'playground';
      motif: 'origine-playground' | 'origine-carto' | 'sans-configuration';
      message: string;
    };

const MESSAGES: Record<'origine-playground' | 'origine-carto' | 'sans-configuration', string> = {
  // Le motif n'est pas l'âge : c'est l'origine.
  'origine-playground':
    'Ce favori vient du Playground : il porte du code, pas une configuration de Builder. ' +
    "Le Builder ne sait pas relire du code — le favori s'ouvre donc dans le Playground, " +
    'avec son code intact.',
  // Deux outils distincts : la configuration d'une carte à couches ne veut rien
  // dire pour le Builder graphique, qui l'appliquerait en silence de travers.
  'origine-carto':
    'Ce favori vient du Builder carto : sa configuration décrit une carte à couches, que le ' +
    "Builder graphique ne sait pas rouvrir. Il s'ouvre dans le Playground, avec son code intact.",
  'sans-configuration':
    "Ce favori n'a pas de configuration de Builder enregistrée : seul son code a été conservé. " +
    "Le Builder ne sait pas relire du code — le favori s'ouvre donc dans le Playground, " +
    'avec son code intact.',
};

/**
 * Où doit aller « Ouvrir dans le Builder », et que faut-il dire à l'utilisateur.
 */
export function ouvertureDepuisFavori(fav: FavoriAOuvrir): OuvertureFavori {
  const origine = fav.sourceApp ?? fav.source ?? '';
  const etat = fav.builderStateJson ?? fav.builderState;

  if (origine === 'builder-carto') {
    return { cible: 'playground', motif: 'origine-carto', message: MESSAGES['origine-carto'] };
  }
  if (etat) return { cible: 'builder', etat };
  if (origine === 'playground') {
    return {
      cible: 'playground',
      motif: 'origine-playground',
      message: MESSAGES['origine-playground'],
    };
  }
  return {
    cible: 'playground',
    motif: 'sans-configuration',
    message: MESSAGES['sans-configuration'],
  };
}

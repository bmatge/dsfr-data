/**
 * Passation entre apps : dire ce qui va être perdu, avant de le perdre (#965).
 *
 * Le Builder ne lit jamais de code. Quand il envoie un graphique au Playground,
 * il dépose à côté un **instantané de sa configuration** (`builder-state`), et
 * c'est cet instantané — pas le code affiché — qu'il rouvrira au retour. Toute
 * modification faite entre-temps dans le Playground est donc écrasée.
 *
 * Ce module ne répare pas l'aller-retour (il n'existe aucun lecteur HTML →
 * configuration dans le dépôt, et en écrire un ferait perdre en silence plus de
 * la moitié du markup — voir le chiffrage de #965). Il rend la perte **dicible** :
 * on compare le code confié au départ et le code rapporté au retour, et on
 * prévient avant d'écraser.
 *
 * Les fonctions d'ici sont pures : la décision se teste sans navigateur.
 */

/** Instantané de configuration du Builder, déposé avant de partir. */
export const CLE_ETAT_BUILDER = 'builder-state';

/** Code exact que le Builder a confié à l'app d'accueil, à l'instant du départ. */
export const CLE_CODE_CONFIE = 'builder-code-confie';

/**
 * Code réellement affiché au moment où l'utilisateur revient au Builder.
 * La valeur de la clé date du seul Playground ; le Pipeline y rapporte aussi
 * (#1095), et seulement quand il a été modifié.
 */
export const CLE_CODE_RAPPORTE = 'playground-code-rapporte';

/**
 * Apps d'accueil dont on revient au Builder avec un code à comparer : le
 * Playground (#965) et le Pipeline (#1095). Chacune reçoit son code par sa
 * propre clé, et c'est par elle qu'on y repart si l'usager refuse de perdre
 * sa modification.
 */
export const APPS_ACCUEIL = ['playground', 'pipeline-helper'] as const;

export type AppAccueil = (typeof APPS_ACCUEIL)[number];

export function estAppAccueil(from: string | null): from is AppAccueil {
  return from !== null && (APPS_ACCUEIL as readonly string[]).includes(from);
}

/**
 * Forme comparable d'un extrait de code : fins de ligne unifiées, indentation
 * et lignes vides retirées. Un simple reformatage ne doit pas déclencher
 * d'avertissement — seule une vraie modification doit le faire.
 */
export function normaliserCode(code: string | null | undefined): string {
  if (!code) return '';
  return code
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== '')
    .join('\n');
}

export type VerdictRetour =
  /** Rien à comparer : on n'arrive pas d'une app d'accueil, ou elle n'a rien rapporté. */
  | { verdict: 'rien-a-comparer' }
  /** Le code rapporté est celui qui était parti : la reprise ne perd rien. */
  | { verdict: 'inchange' }
  /** Le code rapporté diffère : reprendre l'instantané le jetterait. */
  | { verdict: 'divergent'; codeRapporte: string };

/**
 * Décide s'il faut avertir avant de reprendre l'instantané du Builder.
 *
 * `codeConfie` absent alors qu'un code est rapporté compte comme divergent :
 * on s'apprête à écraser un code dont on ne peut pas prouver qu'il est celui
 * qu'on avait envoyé.
 */
export function verdictRetourAuBuilder(opts: {
  from: string | null;
  codeConfie: string | null;
  codeRapporte: string | null;
}): VerdictRetour {
  if (!estAppAccueil(opts.from)) return { verdict: 'rien-a-comparer' };
  const rapporte = normaliserCode(opts.codeRapporte);
  if (!rapporte) return { verdict: 'rien-a-comparer' };
  if (rapporte === normaliserCode(opts.codeConfie)) return { verdict: 'inchange' };
  return { verdict: 'divergent', codeRapporte: opts.codeRapporte as string };
}

/**
 * Texte de l'avertissement. Il dit ce qui va se passer, pourquoi, et ce qu'on
 * peut faire à la place — pas de jargon interne, pas de « une erreur est
 * survenue ».
 */
export const AVERTISSEMENT_RETOUR_PLAYGROUND = {
  titre: 'Vos modifications du Playground vont être perdues',
  message:
    "Le Builder ne sait pas relire du code : en revenant, il rouvre la configuration qu'il " +
    'avait au moment où vous êtes parti, et le code que vous avez modifié dans le Playground ' +
    'est abandonné. Pour le conserver : retournez au Playground, copiez le code ou ' +
    'enregistrez-le en favori, puis revenez ici.',
  confirmLabel: 'Reprendre la configuration',
  cancelLabel: 'Retourner au Playground',
} as const;

/**
 * Même avertissement au retour du Pipeline (#1095). Le Pipeline régénère son
 * code depuis le graphe de nœuds : il ne rapporte donc un code que si le
 * pipeline a changé depuis son arrivée, jamais sa simple réécriture.
 */
export const AVERTISSEMENT_RETOUR_PIPELINE = {
  titre: 'Vos modifications du Pipeline vont être perdues',
  message:
    "Le Builder ne sait pas relire un pipeline : en revenant, il rouvre la configuration qu'il " +
    'avait au moment où vous êtes parti, et les étapes que vous avez modifiées dans le Pipeline ' +
    'sont abandonnées. Pour les conserver : retournez au Pipeline, copiez le code ou ' +
    'enregistrez-le en favori depuis le Playground, puis revenez ici.',
  confirmLabel: 'Reprendre la configuration',
  cancelLabel: 'Retourner au Pipeline',
} as const;

export interface AvertissementRetour {
  readonly titre: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

/**
 * Ce qu'il faut pour avertir, puis repartir sans rien perdre : l'avertissement
 * propre à l'app d'accueil et la clé par laquelle elle relit son code.
 */
export const RETOUR_VERS_ACCUEIL: Record<
  AppAccueil,
  { readonly cleCode: string; readonly avertissement: AvertissementRetour }
> = {
  playground: { cleCode: 'playground-code', avertissement: AVERTISSEMENT_RETOUR_PLAYGROUND },
  'pipeline-helper': {
    cleCode: 'pipeline-helper-code',
    avertissement: AVERTISSEMENT_RETOUR_PIPELINE,
  },
};

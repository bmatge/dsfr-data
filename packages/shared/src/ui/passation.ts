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

/** Code réellement affiché au moment où l'utilisateur revient au Builder. */
export const CLE_CODE_RAPPORTE = 'playground-code-rapporte';

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
  /** Rien à comparer : on n'arrive pas du Playground, ou il n'a rien rapporté. */
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
export function verdictRetourPlayground(opts: {
  from: string | null;
  codeConfie: string | null;
  codeRapporte: string | null;
}): VerdictRetour {
  if (opts.from !== 'playground') return { verdict: 'rien-a-comparer' };
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

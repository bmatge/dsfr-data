/**
 * Attendre qu'une observation ne bouge PLUS.
 *
 * Un geste utilisateur (clic de facette, frappe, choix dans une liste) ne
 * produit pas son chiffre à l'instant du geste : il traverse un filtre, parfois
 * un aller-retour réseau, toujours un rendu Lit — qui est asynchrone. Lire
 * trop tôt, c'est lire la valeur d'AVANT le geste, et un contrôle qui compare
 * cette valeur-là est vert ou rouge au hasard de la machine.
 *
 * Un sommeil fixe ne règle pas ce problème, il le déplace : trop court il
 * laisse passer le cas lent, trop long il ralentit tout le reste sans jamais
 * garantir quoi que ce soit. Ce qu'on veut n'est pas « avoir attendu », c'est
 * « avoir constaté que ça ne bouge plus » — deux lectures identiques séparées
 * d'un vrai délai, et une borne au-delà de laquelle on échoue en le disant.
 *
 * La fonction ne sait rien de Playwright : elle reçoit une lecture, une
 * attente et une horloge. C'est ce qui permet de l'éprouver hors navigateur
 * (`tests/oracle/stabilite.test.ts`) plutôt que de découvrir ses propres
 * défauts à travers un test instable.
 */

/** Écart minimal entre les deux lectures identiques, en millisecondes. */
export const PAUSE_STABILITE = 150;

/** Borne de la scrutation, en millisecondes. */
export const LIMITE_STABILITE = 10_000;

export interface OptionsStabilite<T> {
  /** Écart minimal entre les deux lectures identiques (défaut : 150 ms). */
  pause?: number;
  /** Borne au-delà de laquelle la scrutation échoue (défaut : 10 s). */
  limite?: number;
  /** Attente entre deux lectures — injectable pour l'éprouver hors navigateur. */
  dormir?: (ms: number) => Promise<void>;
  /** Horloge — injectable, pour la même raison. */
  maintenant?: () => number;
  /**
   * Deux lectures disent-elles la même chose ? Défaut : égalité de leur forme
   * JSON, une lecture absente n'étant jamais égale à quoi que ce soit — sans
   * quoi deux échecs de lecture consécutifs passeraient pour une stabilité.
   */
  egales?: (a: T, b: T) => boolean;
  /** Ce qu'on observe, pour que l'échec nomme le contrôle et pas la mécanique. */
  quoi?: string;
}

/** Égalité par défaut : même forme JSON, et jamais rien pour une lecture absente. */
export function memeLecture(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

const dormirVraiment = (ms: number): Promise<void> =>
  new Promise((resoudre) => setTimeout(resoudre, ms));

/**
 * Relit jusqu'à obtenir DEUX lectures identiques espacées d'au moins `pause`,
 * et rend la seconde. Au-delà de `limite`, lève — en nommant ce qu'on
 * observait et la dernière valeur vue : une attente qui expire doit dire
 * pourquoi, sinon elle se relit comme un mystère.
 */
export async function lireJusquAStabilite<T>(
  lire: () => Promise<T>,
  options: OptionsStabilite<T> = {}
): Promise<T> {
  const pause = options.pause ?? PAUSE_STABILITE;
  const limite = options.limite ?? LIMITE_STABILITE;
  const dormir = options.dormir ?? dormirVraiment;
  const maintenant = options.maintenant ?? (() => Date.now());
  const egales = options.egales ?? ((a: T, b: T) => memeLecture(a, b));
  const quoi = options.quoi ?? 'l’observation';

  const depart = maintenant();
  let precedente = await lire();
  for (;;) {
    await dormir(pause);
    const courante = await lire();
    if (egales(precedente, courante)) return courante;
    precedente = courante;
    if (maintenant() - depart >= limite) {
      throw new Error(
        `${quoi} n’est pas stabilisée après ${limite} ms : deux lectures espacées de ` +
          `${pause} ms diffèrent encore (dernière : ${apercu(courante)}).`
      );
    }
  }
}

/** Rendu court d'une lecture, pour le message d'échec. */
function apercu(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return 'rien à lire';
  const texte = JSON.stringify(valeur);
  return texte.length > 160 ? `${texte.slice(0, 160)}…` : texte;
}

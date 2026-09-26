/**
 * Événements métier du Studio vers le kit de retours d'usage. Le kit est chargé par `<app-header>`
 * (packages/app-ui/src/retours.ts) sur les seuls déploiements déclarés : ailleurs, `window.fc`
 * n'existe pas et ces appels ne font rien.
 */

type Props = Record<string, string | number | boolean | null>;

export interface TourAssistant {
  question?: string;
  reponse?: string;
  /** Appels d'outils : nom, arguments, résultat (tronqué), erreur, durée. */
  outils?: {
    nom: string;
    arguments?: Record<string, unknown>;
    resultat?: string;
    erreur?: string;
    dureeMs?: number;
  }[];
  /** Pourquoi la boucle s'est arrêtée (`terminal`, `plafond`…). */
  fin?: string;
  /** Nombre de blocs du document effectivement appliqués pendant le tour. */
  blocs?: number;
  modele?: string;
  dureeMs?: number;
  erreur?: string;
}

/** Le peu que le Studio utilise du kit. */
interface Kit {
  track(nom: string, props?: Props): unknown;
  assistant: { turn(t: TourAssistant): unknown };
}

const kit = (): Kit | undefined => (window as unknown as { fc?: Kit }).fc;

export const retours = {
  track(nom: string, props?: Props): void {
    kit()?.track(nom, props);
  },
  tour(t: TourAssistant): void {
    kit()?.assistant.turn(t);
  },
};

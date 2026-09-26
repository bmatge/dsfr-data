/**
 * Événements métier du Studio vers le kit de retours d'usage. Le kit est chargé par `<app-header>`
 * (packages/app-ui/src/retours.ts) sur les seuls déploiements déclarés : ailleurs, `window.fc`
 * n'existe pas et ces appels ne font rien.
 */

type Props = Record<string, string | number | boolean | null>;

export interface TourAssistant {
  question?: string;
  reponse?: string;
  outils?: { nom: string }[];
  modele?: string;
  dureeMs?: number;
  erreur?: string;
}

/** Le peu que le Studio utilise du kit. */
interface Kit {
  track(nom: string, props?: Props): unknown;
  moment(nom: string): unknown;
  assistant: { turn(t: TourAssistant): unknown };
}

const kit = (): Kit | undefined => (window as unknown as { fc?: Kit }).fc;

export const retours = {
  track(nom: string, props?: Props): void {
    kit()?.track(nom, props);
  },
  moment(nom: 'succes-probable' | 'erreur'): void {
    kit()?.moment(nom);
  },
  tour(t: TourAssistant): void {
    kit()?.assistant.turn(t);
  },
};

/**
 * Retours d'usage du Studio (bmatge/feedback-collector) : parcours, tours de l'assistant et
 * aboutissement de la tâche, pour les testeurs volontaires (opt-in par le bandeau du kit).
 *
 * Le kit n'est chargé que sur les déploiements déclarés dans DEPLOIEMENTS : aujourd'hui
 * l'instance de test chartsbeta. Ailleurs (production comprise), rien n'est chargé et toutes
 * les fonctions ci-dessous sont sans effet.
 *
 * La clé est publique : elle identifie l'application, le collecteur filtre par origine.
 * Jamais d'email ni de valeur saisie : l'utilisateur connecté est transmis haché.
 */
import { getUser, onAuthChange, type User } from '@dsfr-data/shared';

export const COLLECTEUR = 'https://feedback-collector.lab.miweb.run';

/**
 * Hôte → application déclarée au collecteur (config/apps.json de feedback-collector).
 * Les clés sont PUBLIQUES par conception (servies dans la page) : `gitleaks:allow` assumé.
 */
export const DEPLOIEMENTS: Readonly<Record<string, { app: string; key: string }>> = {
  'chartsbeta.lab.miweb.run': { app: 'chartsbeta', key: 'Ix_H0YV03otvXW5osPqYCHe4' }, // gitleaks:allow
};

type Props = Record<string, string | number | boolean | null>;

export interface TourAssistant {
  question?: string;
  reponse?: string;
  outils?: { nom: string }[];
  modele?: string;
  dureeMs?: number;
  erreur?: string;
}

/** Ce que le Studio utilise du kit (`window.fc`). */
export interface KitRetours {
  init(o: Record<string, unknown>): KitRetours;
  identify(id: string): KitRetours;
  track(nom: string, props?: Props): KitRetours;
  moment(nom: 'succes-probable' | 'erreur'): KitRetours;
  assistant: { turn(t: TourAssistant): KitRetours };
}

declare global {
  interface Window {
    fc?: KitRetours;
  }
}

export function configRetours(hote: string = window.location.hostname) {
  return DEPLOIEMENTS[hote] ?? null;
}

/** Empreinte de l'identifiant de compte : le collecteur ne voit jamais l'id brut ni l'email. */
export async function empreinte(user: Pick<User, 'id'>): Promise<string> {
  const octets = new TextEncoder().encode(`dsfr-data:${user.id}`);
  const hash = await crypto.subtle.digest('SHA-256', octets);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

async function identifier(user: User | null): Promise<void> {
  if (user && window.fc) window.fc.identify(await empreinte(user));
}

let charge = false;

/** Charge le kit si ce déploiement est déclaré. Idempotent. Rend vrai s'il a été demandé. */
export function initRetours(hote?: string): boolean {
  const cfg = configRetours(hote);
  if (!cfg || charge) return false;
  charge = true;
  const script = document.createElement('script');
  script.src = `${COLLECTEUR}/kit.js`;
  script.async = true;
  script.onload = () => {
    window.fc?.init({ ...cfg, endpoint: COLLECTEUR, assistant: true });
    void identifier(getUser());
    onAuthChange((etat) => void identifier(etat.user));
  };
  document.head.appendChild(script);
  return true;
}

/** Sans kit chargé (production) ou sans consentement, ces appels ne font rien. */
export const retours = {
  track(nom: string, props?: Props): void {
    window.fc?.track(nom, props);
  },
  moment(nom: 'succes-probable' | 'erreur'): void {
    window.fc?.moment(nom);
  },
  tour(t: TourAssistant): void {
    window.fc?.assistant.turn(t);
  },
};

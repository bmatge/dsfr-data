/**
 * Retours d'usage de chartsbuilder (bmatge/feedback-collector, ADR-148) : volet testeur, type de
 * tâche, parcours, échanges avec les assistants et pensée à voix haute, pour les testeurs volontaires.
 *
 * Initialisé par `<app-header>`, donc sur TOUTES les pages (applications, guide, specs) : une tâche se
 * poursuit d'une page à l'autre. Le kit n'est chargé que sur les déploiements déclarés dans
 * DEPLOIEMENTS : aujourd'hui l'instance de test chartsbeta. Ailleurs (production comprise), rien
 * n'est chargé et toutes les fonctions ci-dessous sont sans effet.
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

/** Types de tâche proposés dans le volet testeur (« Autre », en texte libre, est ajouté par le kit). */
export const TACHES = [
  { id: 'graphique-csv', libelle: 'Un graphique simple depuis un fichier CSV' },
  {
    id: 'dataviz-jeu-en-ligne',
    libelle: 'Une dataviz depuis un jeu de données en ligne (data.gouv, ODS…)',
  },
  { id: 'carte', libelle: 'Une carte' },
  { id: 'tableau-de-bord', libelle: 'Un tableau de bord complet' },
  { id: 'integrer', libelle: 'Intégrer un graphique dans mon site (code, widget Grist)' },
  { id: 'reprendre', libelle: 'Reprendre ou modifier un travail existant' },
  { id: 'comprendre', libelle: 'Comprendre l’outil (guide, specs)' },
] as const;

type Props = Record<string, string | number | boolean | null>;

export interface TourAssistant {
  question?: string;
  reponse?: string;
  outils?: { nom: string }[];
  modele?: string;
  dureeMs?: number;
  erreur?: string;
}

/** Ce que les pages utilisent du kit (`window.fc`). */
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

/**
 * Charge le kit si ce déploiement est déclaré. Idempotent, y compris entre bundles (plusieurs
 * `<app-header>`, ou une app qui embarque sa propre copie) : le témoin est posé sur `window`.
 * Rend vrai s'il a été demandé.
 */
export function initRetours(hote?: string): boolean {
  const cfg = configRetours(hote);
  const w = window as Window & { __dsfrDataRetours?: boolean };
  if (!cfg || w.__dsfrDataRetours) return false;
  w.__dsfrDataRetours = true;
  const script = document.createElement('script');
  script.src = `${COLLECTEUR}/kit.js`;
  script.async = true;
  script.onload = () => {
    window.fc?.init({
      ...cfg,
      endpoint: COLLECTEUR,
      assistant: true,
      taches: TACHES,
      // Au-dessus des barres fixées en bas de l'écran (« Diagnostic », actions sur mobile).
      decalage: '3.5rem',
    });
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

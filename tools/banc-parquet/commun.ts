/**
 * Banc Parquet (#1022) — constantes partagees par la spec, le setup et le
 * rapport. Aucun import de `packages/` ni de `@dsfr-data/*` (meme hygiene que
 * `tools/oracle/`, garde `tests/oracle/guard.test.ts`).
 */
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DOSSIER = fileURLToPath(new URL('.', import.meta.url));
export const SORTIE = fileURLToPath(new URL('./out/', import.meta.url));
export const MESURES = fileURLToPath(new URL('./out/mesures.jsonl', import.meta.url));
export const PORT = 5190;

export interface Jeu {
  cle: string;
  nom: string;
  rid: string;
  /** Trois colonnes lues par les scenarios (#1022, protocole). */
  colonnes: string[];
  /** Colonne numerique de la verification d'integrite. */
  somme: string;
}

export const JEUX: Jeu[] = [
  {
    cle: 'elus',
    nom: 'Élus maires (35 k)',
    rid: '2876a346-d50c-4911-934e-19ee07b0e503',
    colonnes: ["Nom de l'élu", 'Code de la commune', 'Code du département'],
    somme: 'Code de la catégorie socio-professionnelle',
  },
  {
    cle: 'irve',
    nom: 'IRVE consolidée (223 k)',
    rid: 'eb76d20a-8501-400e-b336-d85724de5435',
    colonnes: ['nom_station', 'consolidated_latitude', 'consolidated_longitude'],
    somme: 'puissance_nominale',
  },
  {
    cle: 'vehicules',
    nom: 'Véhicules par commune (703 k)',
    rid: '90e0d717-deda-4bdc-9987-f82faac5bc93',
    // Jeu sans coordonnees : identifiant, libelle, une valeur.
    colonnes: ['CODGEO', 'LIBGEO', 'NB_VP'],
    somme: 'NB_VP',
  },
];

/**
 * Dix ressources pour la fraicheur : les trois du banc et sept autres
 * relevees le 2026-09-22 (jeux geographiques de tailles variees).
 */
export const FRAICHEUR: string[] = [
  ...JEUX.map((j) => j.rid),
  '5102dfdc-d2da-4d1c-b274-4db799e0fbd4', // bornes de recharge issues d'OSM
  '2b07e802-8dd7-4744-a0b2-8810f95efdfc', // arbres (geo_point_2d)
  '83f0fb0e-e0ef-47fe-93dd-9aaee851674a', // accidents 2024, caracteristiques
  '104dbb32-704f-4e99-a71e-43563cb604f2', // accidents 2023, caracteristiques
  '07a88205-83c1-4123-a993-cba5331e8ae0', // accidents 2020, caracteristiques
  '0582ad65-eef1-47d8-aa32-92b88e46cfcb', // structures DGFIP
  '5ec141e4-3650-4365-82b1-db459efe690c', // stations Meteo-France
];

/** Plafond de l'adaptateur tabulaire : 25 000 lignes (#286, inchange par #1019). */
export const PLAFOND_ADAPTATEUR = 25_000;

export type Profil = 'poste' | 'mobile';

/** Preset DevTools « Fast 3G » (Chromium) + CPU x4, comme le demande l'issue. */
export const FAST_3G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: ((1.6 * 1000 * 1000) / 8) * 0.9,
  uploadThroughput: ((750 * 1000) / 8) * 0.9,
};

export function consigner(ligne: Record<string, unknown>): void {
  appendFileSync(MESURES, JSON.stringify(ligne) + '\n');
}

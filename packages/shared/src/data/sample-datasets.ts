/**
 * Sample datasets for zero-friction first chart experience.
 * Realistic but fictitious data covering all chart types.
 */

export interface SampleDataset {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Suggested chart type when loading this dataset */
  suggestedChartType: string;
  /** Suggested label field */
  suggestedLabelField: string;
  /** Suggested value field */
  suggestedValueField: string;
  rows: Record<string, unknown>[];
}

export const SAMPLE_DATASETS: SampleDataset[] = [
  {
    id: 'regions-france',
    name: 'Regions de France',
    description: '13 regions metropolitaines : population, superficie, PIB, code departement',
    icon: 'ri-map-pin-line',
    suggestedChartType: 'bar',
    suggestedLabelField: 'region',
    suggestedValueField: 'population',
    rows: [
      { region: 'Ile-de-France', population: 12271794, superficie: 12012, pib: 709, code_dept: '75' },
      { region: 'Auvergne-Rhone-Alpes', population: 8078652, superficie: 69711, pib: 275, code_dept: '69' },
      { region: 'Nouvelle-Aquitaine', population: 6010391, superficie: 84036, pib: 175, code_dept: '33' },
      { region: 'Occitanie', population: 5924753, superficie: 72724, pib: 172, code_dept: '31' },
      { region: 'Hauts-de-France', population: 5997734, superficie: 31806, pib: 160, code_dept: '59' },
      { region: 'Provence-Alpes-Cote d\'Azur', population: 5081101, superficie: 31400, pib: 167, code_dept: '13' },
      { region: 'Grand Est', population: 5556219, superficie: 57433, pib: 157, code_dept: '67' },
      { region: 'Pays de la Loire', population: 3801797, superficie: 32082, pib: 118, code_dept: '44' },
      { region: 'Bretagne', population: 3354854, superficie: 27208, pib: 100, code_dept: '35' },
      { region: 'Normandie', population: 3303500, superficie: 29906, pib: 94, code_dept: '76' },
      { region: 'Bourgogne-Franche-Comte', population: 2801695, superficie: 47784, pib: 78, code_dept: '21' },
      { region: 'Centre-Val de Loire', population: 2573180, superficie: 39151, pib: 75, code_dept: '45' },
      { region: 'Corse', population: 344679, superficie: 8680, pib: 10, code_dept: '2A' },
    ],
  },
  {
    id: 'evolution-annuelle',
    name: 'Evolution annuelle',
    description: '20 ans de donnees : emissions CO2, temperature, budget',
    icon: 'ri-line-chart-line',
    suggestedChartType: 'line',
    suggestedLabelField: 'annee',
    suggestedValueField: 'emissions_co2',
    rows: Array.from({ length: 20 }, (_, i) => {
      const annee = 2005 + i;
      return {
        annee: String(annee),
        emissions_co2: Math.round(450 - i * 8 + (Math.sin(i * 0.7) * 15)),
        temperature: +(13.2 + i * 0.06 + Math.sin(i * 0.5) * 0.3).toFixed(1),
        budget: Math.round(280 + i * 12 + (Math.cos(i * 0.4) * 20)),
      };
    }),
  },
  {
    id: 'catalogue-services',
    name: 'Catalogue de services publics',
    description: '15 services : categorie, note de satisfaction, nombre d\'usagers',
    icon: 'ri-government-line',
    suggestedChartType: 'datalist',
    suggestedLabelField: 'service',
    suggestedValueField: 'nombre_usagers',
    rows: [
      { service: 'Carte d\'identite', categorie: 'Etat civil', note: 4.2, nombre_usagers: 3200000, description: 'Demande et renouvellement de CNI' },
      { service: 'Passeport', categorie: 'Etat civil', note: 3.8, nombre_usagers: 2100000, description: 'Demande et renouvellement de passeport' },
      { service: 'Permis de conduire', categorie: 'Transport', note: 3.5, nombre_usagers: 1800000, description: 'Inscription et suivi du permis' },
      { service: 'Carte grise', categorie: 'Transport', note: 3.9, nombre_usagers: 4500000, description: 'Immatriculation de vehicules' },
      { service: 'Impots en ligne', categorie: 'Finances', note: 4.5, nombre_usagers: 25000000, description: 'Declaration et paiement des impots' },
      { service: 'CAF - Allocations', categorie: 'Social', note: 3.6, nombre_usagers: 12000000, description: 'Prestations sociales et familiales' },
      { service: 'Pole Emploi', categorie: 'Emploi', note: 3.2, nombre_usagers: 6000000, description: 'Inscription et recherche d\'emploi' },
      { service: 'Assurance maladie', categorie: 'Sante', note: 4.0, nombre_usagers: 35000000, description: 'Remboursements et attestations' },
      { service: 'Service civique', categorie: 'Emploi', note: 4.3, nombre_usagers: 145000, description: 'Missions d\'engagement citoyen' },
      { service: 'RSA', categorie: 'Social', note: 3.4, nombre_usagers: 1900000, description: 'Revenu de solidarite active' },
      { service: 'APL', categorie: 'Social', note: 3.7, nombre_usagers: 6500000, description: 'Aide personnalisee au logement' },
      { service: 'Inscription electorale', categorie: 'Etat civil', note: 4.1, nombre_usagers: 47000000, description: 'Inscription sur les listes electorales' },
      { service: 'Service-Public.fr', categorie: 'Information', note: 4.4, nombre_usagers: 340000000, description: 'Portail d\'information administrative' },
      { service: 'FranceConnect', categorie: 'Numerique', note: 4.6, nombre_usagers: 40000000, description: 'Identite numerique pour les demarches' },
      { service: 'Data.gouv.fr', categorie: 'Numerique', note: 4.1, nombre_usagers: 5000000, description: 'Plateforme de donnees ouvertes' },
    ],
  },
];

/**
 * Jeux de donnees des scenarios du banc de pertinence du Studio (#1112).
 *
 * Petits, ecrits a la main, et FIDELES a une forme reelle : ce que le banc
 * mesure, c'est la lecture qu'en fait le modele (format long, total repete,
 * coordonnees), pas un volume.
 */

export type Ligne = Record<string, unknown>;

/**
 * « Aides nationales » — reconstitue d'apres le constat de #1108 : format LONG
 * (une ligne par couple ville x aide), coordonnees repetees, et une colonne
 * « Nombre total d'actions » qui est un TOTAL PAR VILLE recopie sur chaque
 * ligne (4 pour chacune des 4 lignes de Lille), pas une valeur par aide.
 */
export const AIDES_NATIONALES: Ligne[] = [
  aide('Lille', 'Nord', 'Action cœur de ville', 4, 50.6292, 3.0573),
  aide('Lille', 'Nord', 'Territoires d’industrie', 4, 50.6292, 3.0573),
  aide('Lille', 'Nord', 'France services', 4, 50.6292, 3.0573),
  aide('Lille', 'Nord', 'Quartiers de reconquête républicaine', 4, 50.6292, 3.0573),
  aide('Amiens', 'Somme', 'Action cœur de ville', 3, 49.8941, 2.2958),
  aide('Amiens', 'Somme', 'France services', 3, 49.8941, 2.2958),
  aide('Amiens', 'Somme', 'Fonds vert', 3, 49.8941, 2.2958),
  aide('Arras', 'Pas-de-Calais', 'Action cœur de ville', 2, 50.291, 2.7775),
  aide('Arras', 'Pas-de-Calais', 'Petites villes de demain', 2, 50.291, 2.7775),
  aide('Beauvais', 'Oise', 'Territoires d’industrie', 1, 49.4295, 2.0807),
];

function aide(
  ville: string,
  departement: string,
  action: string,
  total: number,
  lat: number,
  lon: number
): Ligne {
  return {
    Ville: ville,
    Département: departement,
    'Action / aide nationale': action,
    "Nombre total d'actions": total,
    Latitude: lat,
    Longitude: lon,
  };
}

/** Population des regions de metropole (ordre alphabetique : le tri est a faire). */
export const POPULATION_REGIONS: Ligne[] = [
  ['Auvergne-Rhône-Alpes', 8114361],
  ['Bourgogne-Franche-Comté', 2805580],
  ['Bretagne', 3402932],
  ['Centre-Val de Loire', 2573295],
  ['Corse', 351255],
  ['Grand Est', 5568711],
  ['Hauts-de-France', 5997734],
  ['Île-de-France', 12317279],
  ['Normandie', 3327477],
  ['Nouvelle-Aquitaine', 6081985],
  ['Occitanie', 6053548],
  ['Pays de la Loire', 3873096],
  ["Provence-Alpes-Côte d'Azur", 5127840],
].map(([region, population]) => ({
  Région: region,
  Population: population,
}));

/** Etablissements scolaires : assez de lignes pour qu'une pagination ait un sens. */
export const ETABLISSEMENTS: Ligne[] = Array.from({ length: 30 }, (_, i) => {
  const communes = ['Rennes', 'Brest', 'Quimper', 'Lorient', 'Vannes', 'Saint-Malo'];
  const types = ['École', 'Collège', 'Lycée'];
  return {
    'Nom de l’établissement': `${types[i % 3]} ${String.fromCharCode(65 + (i % 26))}${i + 1}`,
    Type: types[i % 3],
    Commune: communes[i % communes.length],
    'Nombre d’élèves': 120 + ((i * 37) % 900),
  };
});

/** Musees : une ligne par lieu, coordonnees numeriques. */
export const MUSEES: Ligne[] = [
  ['Musée du Louvre', 'Paris', 48.8606, 2.3376, 8900000],
  ['Musée des Beaux-Arts de Lyon', 'Lyon', 45.7672, 4.8335, 320000],
  ['MuCEM', 'Marseille', 43.2967, 5.3611, 1200000],
  ['Musée des Augustins', 'Toulouse', 43.6007, 1.4462, 180000],
  ['Musée d’Aquitaine', 'Bordeaux', 44.8354, -0.5725, 150000],
  ['Musée d’arts de Nantes', 'Nantes', 47.2192, -1.5475, 350000],
  ['Palais des Beaux-Arts', 'Lille', 50.6307, 3.0625, 270000],
  ['Musée Unterlinden', 'Colmar', 48.0795, 7.3548, 200000],
].map(([nom, ville, lat, lon, visiteurs]) => ({
  Nom: nom,
  Ville: ville,
  Latitude: lat,
  Longitude: lon,
  'Visiteurs annuels': visiteurs,
}));

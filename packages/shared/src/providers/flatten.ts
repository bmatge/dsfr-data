/**
 * Aplatissement des enregistrements imbriques renvoyes par les APIs (#586).
 *
 * Plusieurs providers renvoient des enregistrements a plusieurs niveaux :
 * Grist enveloppe les champs sous `fields`, INSEE Melodi eclate chaque
 * observation en `attributes` / `dimensions` / `measures`. Les composants
 * (`dsfr-data-*`) et les builders attendent des objets **plats** : une
 * observation non aplatie s'affiche `[object Object]` dans les tables et
 * n'est selectionnable dans aucun champ de graphique.
 *
 * `ProviderConfig.response.nestedDataKey` et `requiresFlatten` decrivaient
 * deja ce besoin mais n'etaient lus par aucun code : ce module est le
 * consommateur manquant, partage par le chemin composant (adapters de
 * `packages/core`) et le chemin connexion (`apps/sources`), pour que les deux
 * produisent exactement **les memes noms de colonnes**.
 */

/** Un enregistrement plat : pas de valeur objet, hors `null`. */
export type FlatRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Aplatit une observation INSEE Melodi.
 *
 * Entree : `{ dimensions: {GEO: "...", FREQ: "A"}, measures: {OBS_VALUE_NIVEAU: {value: 123}}, attributes: {OBS_STATUS: "A"} }`
 * Sortie : `{ GEO: "...", FREQ: "A", OBS_VALUE: 123, OBS_STATUS: "A" }`
 *
 * Les mesures sont doublement imbriquees (`{value: n}`) et portent un suffixe
 * `_NIVEAU` que l'on retire pour obtenir la colonne `OBS_VALUE` attendue par
 * les exemples et les skills.
 */
export function flattenInseeObservation(observation: unknown): FlatRecord {
  const o = isPlainObject(observation) ? observation : {};
  const flat: FlatRecord = {};

  const dims = o.dimensions;
  if (isPlainObject(dims)) {
    for (const [key, value] of Object.entries(dims)) flat[key] = value;
  }

  const measures = o.measures;
  if (isPlainObject(measures)) {
    for (const [measureKey, measureObj] of Object.entries(measures)) {
      if (isPlainObject(measureObj) && 'value' in measureObj) {
        flat[measureKey.replace(/_NIVEAU$/, '')] = measureObj.value;
      }
    }
  }

  const attrs = o.attributes;
  if (isPlainObject(attrs)) {
    for (const [key, value] of Object.entries(attrs)) flat[key] = value;
  }

  return flat;
}

/**
 * Aplatit un enregistrement enveloppe sous une cle (`nestedDataKey`).
 *
 * Entree Grist : `{ id: 1, fields: {Nom: "Paris", Pop: 2000000} }`
 * Sortie       : `{ id: 1, Nom: "Paris", Pop: 2000000 }`
 *
 * Les cles de premier niveau sont conservees (l'`id` Grist est utile) ; en cas
 * de collision, la valeur imbriquee gagne, car c'est la donnee metier.
 */
export function flattenNestedKey(record: unknown, nestedKey: string): FlatRecord {
  if (!isPlainObject(record)) return {};
  const nested = record[nestedKey];
  if (!isPlainObject(nested)) return { ...record };

  const flat: FlatRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (key !== nestedKey) flat[key] = value;
  }
  for (const [key, value] of Object.entries(nested)) flat[key] = value;
  return flat;
}

/**
 * Applique la strategie d'aplatissement declaree par un provider.
 *
 * Ordre de resolution :
 * 1. `response.flattenRecord` s'il est fourni (INSEE) ;
 * 2. sinon `response.nestedDataKey` s'il est renseigne (Grist) ;
 * 3. sinon les enregistrements sont renvoyes tels quels.
 *
 * Retourne le tableau d'origine (meme reference) quand il n'y a rien a faire,
 * pour ne pas recopier inutilement de gros jeux de donnees.
 */
export function flattenProviderRecords(
  records: unknown[],
  response: {
    nestedDataKey: string | null;
    requiresFlatten: boolean;
    flattenRecord?: (record: unknown) => FlatRecord;
  }
): unknown[] {
  if (!response.requiresFlatten) return records;

  const { flattenRecord, nestedDataKey } = response;
  if (flattenRecord) return records.map(flattenRecord);
  if (nestedDataKey) return records.map((r) => flattenNestedKey(r, nestedDataKey));
  return records;
}

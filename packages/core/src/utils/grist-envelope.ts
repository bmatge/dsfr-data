/**
 * Aplatissement de l'enveloppe Grist en mode URL (#482 bug 1).
 *
 * L'API Grist /records renvoie `{ records: [{ id, fields: {…} }] }`. En mode
 * adapter (api-type="grist"), GristAdapter aplatit chaque record ; mais en
 * mode URL (`url="…" transform="records"`), dsfr-data-source livrait les
 * records bruts `{ id, fields }` — l'aval ne voyait que 2 champs et aucune
 * des colonnes réelles (cartes vides silencieuses, datalists inutilisables).
 */

/** Un record ressemble-t-il à une enveloppe Grist `{ id?, fields: {…} }` ? */
function isGristRecord(r: unknown): r is { fields: Record<string, unknown> } {
  if (r === null || typeof r !== 'object' || Array.isArray(r)) return false;
  const rec = r as Record<string, unknown>;
  const keys = Object.keys(rec);
  return (
    typeof rec.fields === 'object' &&
    rec.fields !== null &&
    !Array.isArray(rec.fields) &&
    keys.length > 0 &&
    keys.every((k) => k === 'id' || k === 'fields')
  );
}

/**
 * Aplatit un tableau de records Grist `[{ id, fields: {…} }]` en objets plats
 * `[{…fields}]` (même forme que GristAdapter._flattenRecords — les deux
 * chemins de chargement, cache adapter et fetch URL direct, doivent produire
 * les mêmes lignes). Ne touche à rien si la signature ne correspond pas
 * strictement à TOUS les éléments : une colonne métier `fields` légitime
 * n'est jamais dépliée par accident.
 */
export function flattenGristEnvelope(data: unknown): unknown {
  if (!Array.isArray(data) || data.length === 0) return data;
  if (!data.every(isGristRecord)) return data;
  return data.map((r) => ({ ...r.fields }));
}

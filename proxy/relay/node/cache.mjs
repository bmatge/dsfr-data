// Relais cachable (ADR-155) — cache en mémoire à taille bornée (C-CACHE-4).
//
// Un `where` aléatoire fabrique autant d'URL qu'on veut : sans borne, le cache
// est une fuite de mémoire pilotée de l'extérieur. Deux bornes, en octets et en
// nombre d'entrées ; l'entrée la moins récemment servie part la première.

/** Coût fixe estimé d'une entrée (objet, en-têtes, clé dans la table). */
const ENTRY_OVERHEAD = 512;

/**
 * @typedef {object} CacheEntry
 * @property {Buffer} body
 * @property {string} contentType
 * @property {string | undefined} etag
 * @property {string | undefined} lastModified
 * @property {number} storedAt horodatage (ms) de la réponse de l'amont
 * @property {number} freshUntil fin de fraîcheur (ms)
 * @property {number} staleUntil fin de la fenêtre « périmé si l'amont tombe » (ms)
 */

export class MemoryCache {
  /**
   * @param {{ maxBytes: number, maxEntries: number }} limits
   */
  constructor({ maxBytes, maxEntries }) {
    this.maxBytes = maxBytes;
    this.maxEntries = maxEntries;
    this.bytes = 0;
    /** @type {Map<string, { entry: CacheEntry, size: number }>} */
    this.entries = new Map();
  }

  get size() {
    return this.entries.size;
  }

  /**
   * @param {string} key
   * @param {number} now
   * @returns {CacheEntry | undefined} l'entrée, fraîche ou périmée ; jamais une entrée hors fenêtre
   */
  get(key, now) {
    const slot = this.entries.get(key);
    if (!slot) return undefined;
    if (now >= slot.entry.staleUntil) {
      this.delete(key);
      return undefined;
    }
    // Remise en queue : l'ordre d'insertion d'une `Map` tient lieu d'ordre d'usage.
    this.entries.delete(key);
    this.entries.set(key, slot);
    return slot.entry;
  }

  /**
   * @param {string} key
   * @param {CacheEntry} entry
   * @returns {boolean} faux si l'entrée est trop grosse pour être gardée
   */
  set(key, entry) {
    const size = entry.body.length + key.length + ENTRY_OVERHEAD;
    this.delete(key);
    if (size > this.maxBytes || this.maxEntries < 1) return false;
    this.entries.set(key, { entry, size });
    this.bytes += size;
    while (this.bytes > this.maxBytes || this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined || oldest === key) break;
      this.delete(oldest);
    }
    return true;
  }

  /** @param {string} key */
  delete(key) {
    const slot = this.entries.get(key);
    if (!slot) return;
    this.entries.delete(key);
    this.bytes -= slot.size;
  }
}

// Relais cachable (ADR-155) — limite de débit par adresse (C-DOS-3).
//
// Fenêtre fixe : `requests` requêtes par `windowSeconds`, par clé (adresse IPv4
// ou préfixe /64). La table des compteurs est elle-même bornée : sinon c'est la
// limite de débit qui devient le moyen d'épuiser la mémoire.

export class RateLimiter {
  /**
   * @param {{ requests: number, windowSeconds: number, maxKeys?: number }} options
   */
  constructor({ requests, windowSeconds, maxKeys = 20000 }) {
    this.requests = requests;
    this.windowMs = windowSeconds * 1000;
    this.maxKeys = maxKeys;
    /** @type {Map<string, { start: number, count: number }>} */
    this.windows = new Map();
  }

  /**
   * Compte une requête.
   *
   * @param {string} key
   * @param {number} now
   * @returns {{ allowed: boolean, retryAfter: number }} `retryAfter` en secondes
   */
  take(key, now) {
    let slot = this.windows.get(key);
    if (!slot || now - slot.start >= this.windowMs) {
      if (!slot && this.windows.size >= this.maxKeys) this.#prune(now);
      slot = { start: now, count: 0 };
      this.windows.delete(key);
      this.windows.set(key, slot);
    }
    slot.count += 1;
    if (slot.count <= this.requests) return { allowed: true, retryAfter: 0 };
    const retryAfter = Math.max(1, Math.ceil((slot.start + this.windowMs - now) / 1000));
    return { allowed: false, retryAfter };
  }

  /** Retire les fenêtres échues, puis les plus anciennes s'il n'y a toujours pas de place. */
  #prune(now) {
    for (const [key, slot] of this.windows) {
      if (now - slot.start >= this.windowMs) this.windows.delete(key);
    }
    while (this.windows.size >= this.maxKeys) {
      const oldest = this.windows.keys().next().value;
      if (oldest === undefined) break;
      this.windows.delete(oldest);
    }
  }
}

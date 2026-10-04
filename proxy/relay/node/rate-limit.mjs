// Relais cachable (ADR-155) — limite de débit par adresse (C-DOS-3).
//
// Fenêtre fixe : `requests` requêtes par `windowSeconds`, par clé (adresse IPv4
// ou préfixe /64). La table des compteurs est elle-même bornée : sinon c'est la
// limite de débit qui devient le moyen d'épuiser la mémoire.
//
// Limite assumée : au-delà de `maxKeys` adresses actives dans une même fenêtre,
// des compteurs sont évincés et ces adresses repartent de zéro. Qui dispose de
// vingt mille adresses n'est de toute façon pas arrêté par une limite par adresse.

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

  /**
   * Fait de la place dans une table pleine. Les fenêtres échues partent d'abord.
   * S'il n'y en a pas assez, un LOT (un dixième de la table) est libéré d'un
   * coup, les plus anciennes d'abord : parcourir toute la table à chaque
   * nouvelle adresse coûterait mille fois une prise ordinaire. Une adresse en
   * cours de limitation est épargnée — l'évincer lui rendrait son quota —, sauf
   * si la table n'est faite que de cela.
   */
  #prune(now) {
    for (const [key, slot] of this.windows) {
      if (now - slot.start >= this.windowMs) this.windows.delete(key);
    }
    const target = this.maxKeys - Math.max(1, Math.ceil(this.maxKeys / 10));
    if (this.windows.size <= target) return;
    for (const [key, slot] of this.windows) {
      if (this.windows.size <= target) return;
      if (slot.count <= this.requests) this.windows.delete(key);
    }
    for (const key of this.windows.keys()) {
      if (this.windows.size < this.maxKeys) return;
      this.windows.delete(key);
    }
  }
}

/**
 * Réponse HTTP refusée : libérer son corps, puis dire l'erreur (#1272).
 *
 * Une source et ses adaptateurs ne lisent le corps d'une réponse que
 * lorsqu'elle a abouti. Sur un 404 ou un 503, ils lançaient `HTTP 404: …` et
 * laissaient le corps en plan : pour le navigateur, la requête n'était pas
 * finie tant que personne ne l'avait lu ni abandonné. Deux effets mesurés —
 * la connexion n'est pas rendue au lot (six par hôte en HTTP/1.1, sur une
 * page de vingt sources en panne), et un outil qui attend le calme du réseau
 * (`networkidle` de Playwright, un pré-rendu) ne le voit jamais revenir.
 *
 * `cancel()` plutôt que `text()` : rien n'est téléchargé pour être jeté.
 */

/** Abandonne le corps d'une réponse qu'on ne lira pas. Ne lève jamais. */
export function releaseBody(response: Response | null | undefined): void {
  try {
    // Un corps déjà lu ou verrouillé refuse l'abandon : sans objet.
    if (!response?.body || response.bodyUsed) return;
    void response.body.cancel().catch(() => {});
  } catch {
    // Réponse simulée sans flux, ou flux verrouillé : rien à libérer.
  }
}

/**
 * L'erreur d'une réponse refusée, au format que lit le barème
 * (`HTTP <code>: <texte>`, voir `httpStatusOf`), corps libéré.
 */
export function httpError(response: Response): Error {
  releaseBody(response);
  return new Error(`HTTP ${response.status}: ${response.statusText}`);
}

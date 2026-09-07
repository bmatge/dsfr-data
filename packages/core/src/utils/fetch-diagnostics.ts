/**
 * Diagnostic des echecs de fetch opaques (#598).
 *
 * Quand une API repond une erreur HTTP **sans en-tete CORS**, le navigateur
 * interdit la lecture de la reponse et `fetch` rejette avec un `TypeError`
 * generique (« NetworkError when attempting to fetch resource »). Le statut et
 * le corps — qui portent le vrai diagnostic — sont perdus : l'echec devient
 * indiscernable d'une panne reseau, et le message affiche en console n'aide
 * pas l'integrateur.
 *
 * Cas d'origine (#596) : l'API Tabular emettait un 400 « Malformed query »
 * sans `Access-Control-Allow-Origin`. Le navigateur n'affichait qu'un
 * `NetworkError`, alors que le corps de la reponse nommait la colonne fautive.
 *
 * Le complement produit ici s'ajoute au log console ; l'objet `Error` remonte
 * aux consommateurs (evenement `data-error`, template de statut) reste
 * inchange, pour ne pas deverser un paragraphe dans l'UI.
 */

/**
 * True si l'erreur est le rejet generique d'un `fetch` — panne reseau, DNS,
 * ou reponse cross-origin illisible faute d'en-tete CORS.
 *
 * Teste `name` plutot que `instanceof TypeError` : l'erreur peut provenir
 * d'un autre realm (iframe, environnement de test), ou le `instanceof`
 * echoue silencieusement.
 */
export function isOpaqueFetchFailure(error: unknown): boolean {
  return (error as Error | undefined)?.name === 'TypeError';
}

/**
 * Complement de diagnostic a joindre au log d'erreur, ou chaine vide si
 * l'erreur n'est pas un echec de fetch opaque (rien a expliquer alors : le
 * message d'origine porte deja le statut HTTP).
 *
 * @param url URL reellement appelee, proxy applique. Omise si indisponible.
 */
export function describeFetchFailure(error: unknown, url?: string): string {
  if (!isOpaqueFetchFailure(error)) return '';

  const lines = [
    url ? `  URL appelée : ${url}` : '  URL appelée : indisponible',
    "  Le navigateur n'a pas pu lire la réponse. Deux causes possibles :",
    "  1. l'API a répondu une erreur HTTP (4xx/5xx) sans en-tête " +
      'Access-Control-Allow-Origin — le statut et le corps sont alors masqués ;',
    '  2. la requête n’a pas abouti (réseau, DNS, hôte injoignable).',
    '  Pour trancher, rejouez la requête hors navigateur :',
    url ? `      curl -i "${url}"` : '      curl -i "<URL de la source>"',
    '  Un proxy (attributs use-proxy / proxy-url) relaie la réponse ' +
      "d'erreur avec son statut et son corps lisibles.",
  ];

  return '\n' + lines.join('\n');
}

/**
 * Emet le log en n'ajoutant le diagnostic que s'il y en a un : hors echec
 * opaque, le message d'origine porte deja le statut HTTP et un troisieme
 * argument vide ne ferait que polluer la console.
 */
function emit(
  log: (...args: unknown[]) => void,
  prefix: string,
  error: unknown,
  url?: string
): void {
  const diagnostic = describeFetchFailure(error, url);
  if (diagnostic) {
    log(prefix, error, diagnostic);
  } else {
    log(prefix, error);
  }
}

/**
 * Log d'erreur de chargement enrichi du diagnostic CORS quand il s'applique.
 * Point d'entree unique des composants, pour que les deux chemins de fetch
 * (URL et adapter) produisent le meme message.
 */
export function logFetchError(prefix: string, error: unknown, url?: string): void {
  emit(console.error, prefix, error, url);
}

/** Variante `console.warn`, pour les fetch non bloquants (facettes, #309). */
export function logFetchWarning(prefix: string, error: unknown, url?: string): void {
  emit(console.warn, prefix, error, url);
}

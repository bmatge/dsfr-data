/**
 * Assemblage d'URL des generateurs de code.
 */

/**
 * Ajoute une chaine de requete a une URL qui en a peut-etre deja une.
 *
 * Les generateurs concatenaient `?` sans regarder :
 *
 *     `${source.apiUrl}?${params}`
 *
 * Sur une source deja parametree — et les URLs OpenDataSoft le sont
 * couramment (`…/records?refine=annee:2024`) — cela produit une SECONDE
 * interrogation :
 *
 *     …/records?refine=annee:2024?select=sum(pop) as value&group_by=region
 *
 * Le serveur lit alors `refine` comme valant `annee:2024?select=…` et ignore
 * purement et simplement le `select` et le `group_by`. L'utilisateur recoit
 * des donnees brutes non agregees, sans la moindre erreur : un graphique qui
 * s'affiche et qui est faux.
 *
 * Un fragment (`#…`) doit rester en queue : on l'isole avant d'ajouter.
 */
export function appendQuery(url: string, query: string): string {
  if (!query) return url;
  const finDeFragment = url.indexOf('#');
  const base = finDeFragment === -1 ? url : url.slice(0, finDeFragment);
  const fragment = finDeFragment === -1 ? '' : url.slice(finDeFragment);
  const separateur = base.includes('?') ? '&' : '?';
  return `${base}${separateur}${query}${fragment}`;
}

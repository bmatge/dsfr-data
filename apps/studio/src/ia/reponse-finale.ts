/**
 * Reponse finale ecrite en JSON brut (#1123).
 *
 * Constat du banc de pertinence : 3 reponses finales sur 16 etaient
 * l'argument de `finish` ecrit EN TEXTE (`{"message": "…"}`) au lieu d'un
 * appel d'outil. L'usager voyait ce JSON tel quel. Quand la reponse est
 * exactement cet objet, la boucle la traite comme un `finish` et n'en garde
 * que le message.
 *
 * La reponse du modele est une ENTREE EXTERNE : `JSON.parse` seulement (jamais
 * d'evaluation), aucune expression reguliere, et tout texte qui n'est pas cet
 * objet est rendu TEL QUEL.
 */

/** Retire une cloture de code Markdown (```json … ```) entourant tout le texte. */
function sansCloture(texte: string): string {
  if (!texte.startsWith('```') || !texte.endsWith('```') || texte.length < 6) return texte;
  const finPremiereLigne = texte.indexOf('\n');
  if (finPremiereLigne === -1) return texte;
  return texte.slice(finPremiereLigne + 1, texte.length - 3).trim();
}

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** `message` d'un objet d'arguments de finish, s'il est une chaine non vide. */
function messageDe(args: unknown): string | null {
  if (!estObjet(args)) return null;
  const message = args.message;
  return typeof message === 'string' && message.trim() !== '' ? message.trim() : null;
}

/**
 * Message de `finish` quand le texte n'est QUE son argument JSON, sinon null.
 *
 * Formes reconnues, seules ou dans une cloture ```json :
 *   - `{"message": "…"}` (l'argument de finish, sans autre cle) ;
 *   - `{"name": "finish", "arguments": {"message": "…"}}` (l'appel entier,
 *     arguments en objet ou en chaine JSON).
 */
export function messageDeFinishEnTexte(texte: string): string | null {
  const brut = sansCloture(texte.trim());
  if (!brut.startsWith('{') || !brut.endsWith('}')) return null;
  let valeur: unknown;
  try {
    valeur = JSON.parse(brut);
  } catch {
    return null;
  }
  if (!estObjet(valeur)) return null;
  // L'argument de finish, et RIEN d'autre : un objet qui porte aussi `blocks`
  // ou `config` est une action ecrite en texte, pas une conclusion — on ne la
  // maquille pas en message.
  const cles = Object.keys(valeur);
  if (cles.length === 1 && cles[0] === 'message') return messageDe(valeur);
  if (valeur.name === 'finish') {
    const args = valeur.arguments;
    if (typeof args === 'string') {
      try {
        return messageDe(JSON.parse(args));
      } catch {
        return null;
      }
    }
    return messageDe(args);
  }
  return null;
}

/** Texte a montrer a l'usager : le message de finish s'il a ete ecrit en JSON. */
export function texteAffichable(texte: string): string {
  return messageDeFinishEnTexte(texte) ?? texte;
}

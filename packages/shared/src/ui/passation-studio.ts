/**
 * Passation « Envoyer au Studio IA » (#1132) : ce qu'une app confie au Studio
 * À CÔTÉ du diagnostic (`transmettreDiagnostic`, #1016), pour qu'il reprenne
 * fidèlement un code au lieu de le deviner :
 *
 *   - le code d'origine (le modèle le reconstruit en blocs ; le lien de retour
 *     le rend au Playground tel quel) ;
 *   - la source déclarée par ce code, réduite à une ADRESSE PUBLIQUE, que le
 *     Studio charge par le même chemin que `charger_source_url` (reconnaissance,
 *     proxy, refus) ;
 *   - ou la raison pour laquelle la source n'est pas transmise (elle exige une
 *     clé : jamais de jeton ni d'en-tête dans la passation).
 *
 * `sessionStorage` est une entrée externe pour le Studio : la lecture valide
 * la forme et écarte tout le reste. Rien de ce qui est lu ici n'est envoyé au
 * modèle sans que l'usager ait relu et envoyé son message.
 */

/** Clé de passation (session du navigateur, consommée à la lecture). */
export const PASSATION_STUDIO_KEY = 'dsfr-data-studio-passation';

/** Longueur maximale du code transmis (au-delà, la passation est refusée). */
export const LONGUEUR_MAX_CODE_PASSATION = 60_000;

/** Pourquoi la source du code n'est pas transmise. */
export type SourceNonTransmise =
  /** Le code ne déclare aucune `dsfr-data-source`. */
  | 'absente'
  /** La source porte une clé (en-têtes, `api-key-ref`, paramètre secret). */
  | 'cle'
  /** Données embarquées dans le code (`data="…"`) : pas d'adresse à charger. */
  | 'embarquee'
  /** Adresse d'aucun fournisseur reconnu. */
  | 'non-reconnue';

export interface PassationStudio {
  /** App d'origine (seule connue : le Playground). */
  origine: 'playground';
  /** Code d'origine, tel qu'il était dans l'éditeur. */
  code: string;
  /** Adresse publique de la source, si elle est transmise. */
  source?: { url: string; ressource?: string };
  /** Sinon, pourquoi elle ne l'est pas. */
  sourceNonTransmise?: SourceNonTransmise;
  /** Nombre de `dsfr-data-source` du code (une seule est chargée). */
  sources: number;
}

const RAISONS: readonly SourceNonTransmise[] = ['absente', 'cle', 'embarquee', 'non-reconnue'];

/** Dépose la passation pour le Studio. Rend `false` si le stockage refuse. */
export function transmettrePassationStudio(passation: PassationStudio): boolean {
  try {
    sessionStorage.setItem(PASSATION_STUDIO_KEY, JSON.stringify(passation));
    return true;
  } catch {
    return false;
  }
}

/** Valide la forme d'une passation lue (entrée externe). */
export function validerPassationStudio(brut: unknown): PassationStudio | null {
  if (!brut || typeof brut !== 'object') return null;
  const p = brut as Record<string, unknown>;
  if (p.origine !== 'playground') return null;
  if (typeof p.code !== 'string' || p.code.length > LONGUEUR_MAX_CODE_PASSATION) return null;
  const sources = typeof p.sources === 'number' && Number.isInteger(p.sources) ? p.sources : 0;
  const passation: PassationStudio = { origine: 'playground', code: p.code, sources };
  const s = p.source as Record<string, unknown> | undefined;
  if (s && typeof s === 'object' && typeof s.url === 'string' && s.url.startsWith('https://')) {
    passation.source = { url: s.url };
    if (typeof s.ressource === 'string' && s.ressource) passation.source.ressource = s.ressource;
  } else if (RAISONS.includes(p.sourceNonTransmise as SourceNonTransmise)) {
    passation.sourceNonTransmise = p.sourceNonTransmise as SourceNonTransmise;
  }
  return passation;
}

/** Récupère et consomme la passation, ou null. */
export function recupererPassationStudio(): PassationStudio | null {
  try {
    const texte = sessionStorage.getItem(PASSATION_STUDIO_KEY);
    if (texte === null) return null;
    sessionStorage.removeItem(PASSATION_STUDIO_KEY);
    return validerPassationStudio(JSON.parse(texte));
  } catch {
    return null;
  }
}

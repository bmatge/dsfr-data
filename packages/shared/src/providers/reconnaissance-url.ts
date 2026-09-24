/**
 * Reconnaissance d'une URL de jeu de donnees (#1140) — UNE voie, partagee.
 *
 * La creation d'une connexion dans l'app Sources (`runUrlDetection`) et
 * l'outil `charger_source_url` du Studio IA lisent une URL collee par
 * l'usager et en deduisent le fournisseur et ses identifiants. La logique
 * vivait dans l'app Sources, melee au formulaire ; elle est ici, pure (aucun
 * appel reseau, aucun DOM), et les deux appelants aiguillent sur son verdict.
 *
 * Verdicts, dans l'ordre ou Sources les teste :
 *   - `grist`            : serveur Grist (hote reconnu ou URL d'API Grist) ;
 *   - `api`              : plateforme a URL d'API derivable sans reseau
 *                          (Opendatasoft/Huwise, Tabular, INSEE Melodi) ;
 *   - `datagouv-jeu`     : page d'un jeu data.gouv.fr (1 jeu → N ressources) ;
 *   - `datagouv-racine`  : data.gouv.fr sans jeu ni ressource ;
 *   - `inconnue`         : rien de reconnu.
 */

import { resolveSourceUrl, type ResolvedSourceUrl } from './index.js';
import { parseDataGouvDataset } from './datagouv-dataset.js';

/** Reference d'un document Grist : serveur et identifiant. */
export interface GristDocRef {
  baseUrl: string;
  docId: string;
}

/**
 * Extrait le serveur (`baseUrl`) et le `docId` d'une reference de document Grist.
 *
 * Accepte :
 *  - URL UI : `https://grist.numerique.gouv.fr/o/mon-org/jGd2ge4dy2ZM/MaPage`
 *  - URL UI sans org : `https://docs.getgrist.com/jGd2ge4dy2ZM/MonDoc`
 *  - URL API : `https://grist.numerique.gouv.fr/api/docs/jGd2ge4dy2ZM/tables/...`
 *  - docId brut : `jGd2ge4dy2ZM` (serveur par defaut grist.numerique.gouv.fr)
 *
 * Retourne `null` si l'entree est vide ou non parsable.
 */
export function parseGristDocRef(input: string): GristDocRef | null {
  const raw = input.trim();
  if (!raw) return null;

  // docId brut (ni schema ni chemin) → serveur gouv par defaut.
  if (!raw.includes('/') && !raw.includes(' ') && !raw.includes('.')) {
    return { baseUrl: 'https://grist.numerique.gouv.fr', docId: raw };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const baseUrl = `${url.protocol}//${url.host}`;
  const segments = url.pathname.split('/').filter(Boolean);

  const docsIdx = segments.indexOf('docs');
  // Forme API : /api/docs/{docId}/... — sinon forme UI : /o/{org}/{docId}/{page} ou /{docId}/{page}
  const docId =
    docsIdx > 0 && segments[docsIdx - 1] === 'api' && segments[docsIdx + 1]
      ? segments[docsIdx + 1]
      : (segments[segments[0] === 'o' && segments.length >= 2 ? 2 : 0] ?? null);

  if (!docId) return null;
  return { baseUrl, docId };
}

/** Hote Grist : `grist` dans le nom, ou le service getgrist.com. */
export function estHoteGrist(host: string): boolean {
  return /grist/i.test(host) || host === 'getgrist.com' || host.endsWith('.getgrist.com');
}

/** Verdict de la reconnaissance d'une URL de jeu. */
export type UrlSourceReconnue =
  | {
      kind: 'grist';
      /** Document vise, ou `null` pour la racine d'un serveur. */
      ref: GristDocRef | null;
      /** Table nommee dans une URL d'API (`/api/docs/{doc}/tables/{table}`), sinon `null`. */
      tableId: string | null;
      resolved: ResolvedSourceUrl;
    }
  | { kind: 'api'; resolved: ResolvedSourceUrl & { apiUrl: string } }
  | { kind: 'datagouv-jeu'; slug: string }
  | { kind: 'datagouv-racine' }
  | { kind: 'inconnue' };

/**
 * Reconnait une URL collee (page humaine OU URL d'API) sans aucun appel
 * reseau. Meme ordre de tests que la creation d'une connexion dans Sources :
 * Grist, plateforme a URL d'API derivable, jeu data.gouv, racine data.gouv.
 */
export function reconnaitreUrlSource(raw: string): UrlSourceReconnue {
  const url = raw.trim();
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    // pas une URL absolue : seules les formes relatives reconnues ci-dessous
  }

  const resolved = resolveSourceUrl(url);

  if ((host && estHoteGrist(host)) || resolved.provider.id === 'grist') {
    return {
      kind: 'grist',
      ref: parseGristDocRef(url),
      tableId: resolved.provider.id === 'grist' ? (resolved.ids?.tableId ?? null) : null,
      resolved,
    };
  }

  if (resolved.provider.id !== 'generic' && resolved.apiUrl) {
    return { kind: 'api', resolved: { ...resolved, apiUrl: resolved.apiUrl } };
  }

  const slug = parseDataGouvDataset(url);
  if (slug) return { kind: 'datagouv-jeu', slug };

  if (host.endsWith('data.gouv.fr')) return { kind: 'datagouv-racine' };

  return { kind: 'inconnue' };
}

/**
 * Formats d'URL reconnus, pour le dire a l'usager quand une URL ne l'est pas.
 * Un exemple par forme ; l'ordre suit la liste des fournisseurs.
 */
export const FORMATS_URL_RECONNUS: readonly { fournisseur: string; exemple: string }[] = [
  {
    fournisseur: 'Opendatasoft / Huwise (tout portail, y compris sur domaine propre)',
    exemple: 'https://data.economie.gouv.fr/explore/dataset/<jeu>/',
  },
  {
    fournisseur: 'Opendatasoft / Huwise, URL d’API',
    exemple: 'https://<portail>/api/explore/v2.1/catalog/datasets/<jeu>/records',
  },
  {
    fournisseur: 'data.gouv.fr, page d’un jeu',
    exemple: 'https://www.data.gouv.fr/fr/datasets/<jeu>/',
  },
  {
    fournisseur: 'data.gouv.fr, ressource ou API tabulaire',
    exemple:
      'https://www.data.gouv.fr/fr/datasets/r/<uuid> ou https://tabular-api.data.gouv.fr/api/resources/<uuid>/data/',
  },
  {
    fournisseur: 'Grist (document public)',
    exemple: 'https://grist.numerique.gouv.fr/o/<organisation>/<document>/<page>',
  },
  { fournisseur: 'INSEE Melodi', exemple: 'https://api.insee.fr/melodi/data/<jeu>' },
];

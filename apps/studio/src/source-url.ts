/**
 * Studio IA - Charger une source depuis l'URL d'un jeu (#1140).
 *
 * L'usager ecrit « fais un graphique de … avec https://… » : l'outil
 * `charger_source_url` reconnait l'URL par LA voie de la creation d'une
 * connexion (`reconnaitreUrlSource`, @dsfr-data/shared), charge les lignes par
 * le proxy (`buildProxiedRequest` / `getProxyUrl`, comme l'app Sources), et rend une
 * `Source` de la meme forme que celles de l'app Sources : le generateur du
 * document en tire la meme balise `<dsfr-data-source>` (requete declarative
 * pour Opendatasoft et Tabular, donnees embarquees pour Grist).
 *
 * L'URL vient de la conversation : c'est une entree externe.
 *   - `new URL`, https seul, ni identifiant ni mot de passe dans l'URL ;
 *   - seuls les fournisseurs reconnus sont appeles, et seulement sur leurs
 *     chemins d'API (reconstruits depuis des identifiants verifies) ;
 *   - aucune cle ni jeton : une URL qui en porte est refusee, un jeu prive
 *     renvoie vers l'app Sources — jamais de jeton demande dans le chat.
 */

import {
  analyzeDataFields,
  applyInseeLabels,
  buildGristHeaders,
  buildProxiedRequest,
  dataGouvDatasetApiUrl,
  extractDataGouvResources,
  fetchInseeLabelIndex,
  flattenProviderRecords,
  FORMATS_URL_RECONNUS,
  getProxiedUrl,
  getProxyUrl,
  GRIST_CONFIG,
  reconnaitreUrlSource,
  resolveSourceUrl,
  type Field,
  type ResolvedSourceUrl,
  type Source,
} from '@dsfr-data/shared';

/** Lignes chargees au plus pour l'inspection (l'export d'une source API refait sa requete). */
export const MAX_LIGNES_URL = 1000;

/** Longueur maximale d'une URL acceptee. */
const LONGUEUR_MAX_URL = 2048;

/**
 * Identifiant de jeu, de ressource, de document ou de table : caracteres
 * surs uniquement (classe simple, lineaire). Tout autre caractere refuse
 * l'URL plutot que de l'inserer dans un chemin d'API.
 */
const IDENTIFIANT_SUR = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

/** Parametres d'URL qui portent un secret : refuses d'emblee. */
const PARAMETRES_SECRETS: ReadonlySet<string> = new Set([
  'apikey',
  'api_key',
  'api-key',
  'token',
  'access_token',
  'auth',
  'key',
]);

/** Renvoi vers l'app Sources, commun aux refus. */
const VERS_SOURCES =
  'Propose à l’usager de créer la connexion dans l’app Sources (menu « Sources »), puis de choisir la source dans le sélecteur du Studio.';

export interface ChargementReussi {
  ok: true;
  source: Source;
  fields: Field[];
  /** Nom lisible du fournisseur. */
  fournisseur: string;
  /** Total annonce par l'API, si connu. */
  total: number | null;
  /** Tables ou ressources voisines (Grist, data.gouv), pour les proposer. */
  autres: string[];
}

export interface ChargementRefuse {
  ok: false;
  /** Message rendu au modele, qu'il reformule a l'usager. */
  message: string;
}

export type ResultatChargement = ChargementReussi | ChargementRefuse;

export interface OptionsChargement {
  /** Table (Grist) ou ressource (data.gouv) a retenir, par identifiant ou titre. */
  ressource?: string;
  /** Transport injectable (tests) ; `fetch` global par defaut. */
  fetchImpl?: typeof fetch;
}

function refus(message: string): ChargementRefuse {
  return { ok: false, message };
}

/** Les formats reconnus, une ligne chacun. */
export function listerFormatsReconnus(): string {
  return FORMATS_URL_RECONNUS.map((f) => `- ${f.fournisseur} : ${f.exemple}`).join('\n');
}

function refusNonReconnue(): ChargementRefuse {
  return refus(
    `URL non reconnue : ce n'est l'adresse d'aucun jeu d'un fournisseur connu. Formats reconnus :\n${listerFormatsReconnus()}\n${VERS_SOURCES}`
  );
}

function refusAcces(fournisseur: string): ChargementRefuse {
  return refus(
    `Accès refusé par ${fournisseur} : ce jeu n'est pas public. Ne demande PAS de clé ni de jeton dans la conversation. ${VERS_SOURCES} (la clé s'y saisit, hors du chat).`
  );
}

/** Lit un chemin pointe (`meta.total`) dans une reponse JSON. */
function lireChemin(objet: unknown, chemin: string | null): unknown {
  if (!chemin) return objet;
  let courant: unknown = objet;
  for (const cle of chemin.split('.')) {
    if (
      courant === null ||
      typeof courant !== 'object' ||
      !Object.prototype.hasOwnProperty.call(courant, cle)
    ) {
      return undefined;
    }
    courant = (courant as Record<string, unknown>)[cle];
  }
  return courant;
}

/** Nom de document Grist lu dans l'URL (segment suivant l'identifiant). */
function nomDocumentGrist(url: URL, docId: string): string {
  const segments = url.pathname.split('/').filter(Boolean);
  const i = segments.indexOf(docId);
  const suivant = i >= 0 ? segments[i + 1] : undefined;
  if (!suivant || suivant === 'tables') return docId;
  try {
    return decodeURIComponent(suivant);
  } catch {
    return docId;
  }
}

// ---------------------------------------------------------------------------
// Fournisseurs a URL d'API derivable (Opendatasoft, Tabular, INSEE)
// ---------------------------------------------------------------------------

async function chargerApi(
  resolved: ResolvedSourceUrl & { apiUrl: string },
  nom: string | null,
  autres: string[],
  doFetch: typeof fetch
): Promise<ResultatChargement> {
  const provider = resolved.provider;
  const ids = resolved.ids ?? {};
  const valeurs = Object.values(ids);
  if (valeurs.length === 0 || !valeurs.every((v) => IDENTIFIANT_SUR.test(v))) {
    return refusNonReconnue();
  }

  const { pagination, response } = provider;
  const taillePage = Math.max(1, Math.min(pagination.pageSize || 100, MAX_LIGNES_URL));
  const pagesMax = Math.ceil(MAX_LIGNES_URL / taillePage);

  let lignes: Record<string, unknown>[] = [];
  let total: number | null = null;
  for (let page = 0; page < pagesMax && lignes.length < MAX_LIGNES_URL; page++) {
    const pageUrl = new URL(resolved.apiUrl);
    if (pagination.type === 'offset') {
      pageUrl.searchParams.set(pagination.params.limit ?? 'limit', String(taillePage));
      pageUrl.searchParams.set(pagination.params.offset ?? 'offset', String(page * taillePage));
    } else {
      pageUrl.searchParams.set(pagination.params.pageSize ?? 'page_size', String(taillePage));
      pageUrl.searchParams.set(pagination.params.page ?? 'page', String(page + 1));
    }

    // Meme routage que le chargement d'une connexion API dans Sources
    // (`fetchOnePage`) : proxy dedie pour un hote connu, proxy CORS generique
    // pour un portail sur domaine propre (sinon bloque par la CSP de l'app).
    const requete = buildProxiedRequest(pageUrl.href);
    const reponse = await doFetch(requete.url, { headers: requete.headers });
    if (reponse.status === 401 || reponse.status === 403) return refusAcces(provider.displayName);
    if (reponse.status === 404) {
      return refus(
        provider.id === 'tabular'
          ? "Ressource introuvable, ou non tabulaire : l'API tabulaire de data.gouv.fr ne la sert pas (seuls les fichiers CSV/XLS analysés par data.gouv le sont). " +
              VERS_SOURCES
          : `Jeu introuvable chez ${provider.displayName} : vérifie l'identifiant du jeu dans l'URL. ${VERS_SOURCES}`
      );
    }
    if (!reponse.ok) {
      return refus(`${provider.displayName} a répondu HTTP ${reponse.status}. Réessaie plus tard.`);
    }

    const json: unknown = await reponse.json();
    if (total === null) {
      const brut = lireChemin(json, response.totalCountPath);
      total = typeof brut === 'number' && Number.isFinite(brut) ? brut : null;
    }
    const enregistrements = lireChemin(json, response.dataPath || null);
    if (!Array.isArray(enregistrements)) {
      return refus(
        `Réponse inattendue de ${provider.displayName} : pas de liste d'enregistrements. ${VERS_SOURCES}`
      );
    }
    const plats = flattenProviderRecords(enregistrements, response) as Record<string, unknown>[];
    lignes = lignes.concat(plats);
    if (enregistrements.length < taillePage) break;
    if (total !== null && lignes.length >= total) break;
  }
  lignes = lignes.slice(0, MAX_LIGNES_URL);

  if (lignes.length === 0) {
    return refus(`Le jeu est vide chez ${provider.displayName} : aucune ligne à représenter.`);
  }

  // INSEE : codes SDMX -> libelles, comme le chemin connexion de l'app Sources.
  if (provider.id === 'insee' && ids.datasetId) {
    const index = await fetchInseeLabelIndex(ids.datasetId, {
      baseUrl: provider.defaultBaseUrl,
      toProxiedUrl: (u) => getProxiedUrl(u),
      fetchImpl: doFetch,
    });
    lignes = applyInseeLabels(lignes, index);
  }

  const premierId = valeurs[0];
  const source: Source = {
    id: `url_${provider.id}_${premierId}`,
    name: nom ?? premierId,
    type: 'api',
    provider: provider.id,
    apiUrl: resolved.apiUrl,
    method: 'GET',
    headers: null,
    dataPath: response.dataPath,
    resourceIds: ids,
    data: lignes,
    recordCount: lignes.length,
  };
  return {
    ok: true,
    source,
    fields: analyzeDataFields(lignes),
    fournisseur: provider.displayName,
    total,
    autres,
  };
}

// ---------------------------------------------------------------------------
// data.gouv.fr : page d'un jeu -> une ressource tabulaire
// ---------------------------------------------------------------------------

async function chargerDataGouv(
  slug: string,
  ressource: string | undefined,
  doFetch: typeof fetch
): Promise<ResultatChargement> {
  if (!IDENTIFIANT_SUR.test(slug)) return refusNonReconnue();
  const reponse = await doFetch(getProxiedUrl(dataGouvDatasetApiUrl(slug)));
  if (reponse.status === 404) {
    return refus(`Jeu introuvable sur data.gouv.fr (« ${slug} »). ${VERS_SOURCES}`);
  }
  if (!reponse.ok) {
    return refus(`data.gouv.fr a répondu HTTP ${reponse.status}. Réessaie plus tard.`);
  }
  const json = (await reponse.json()) as { title?: unknown };
  const titreJeu = typeof json.title === 'string' ? json.title : slug;
  const ressources = extractDataGouvResources(json);
  const tabulaires = ressources.filter((r) => r.tabularApiUrl);
  if (tabulaires.length === 0) {
    const formats = [...new Set(ressources.map((r) => r.format).filter(Boolean))].join(', ');
    return refus(
      `Le jeu « ${titreJeu} » n'a aucune ressource tabulaire interrogeable (fichiers : ${formats || 'aucun'}) : ` +
        "seules les ressources CSV/XLS analysées par l'API tabulaire de data.gouv.fr se chargent. " +
        VERS_SOURCES
    );
  }

  let choisie = tabulaires[0];
  if (ressource) {
    const cherche = ressource.trim().toLowerCase();
    const trouvee = tabulaires.find(
      (r) => r.id.toLowerCase() === cherche || r.title.toLowerCase() === cherche
    );
    if (!trouvee) {
      return refus(
        `Ressource « ${ressource} » absente des ressources tabulaires du jeu. Disponibles : ${tabulaires
          .map((r) => `« ${r.title} » (${r.id})`)
          .join(', ')}.`
      );
    }
    choisie = trouvee;
  }

  const resolved = resolveSourceUrl(choisie.tabularApiUrl ?? '');
  if (!resolved.apiUrl) return refusNonReconnue();
  const autres = tabulaires
    .filter((r) => r.id !== choisie.id)
    .map((r) => `« ${r.title} » (${r.id})`);
  return chargerApi(
    { ...resolved, apiUrl: resolved.apiUrl },
    `${titreJeu} — ${choisie.title}`,
    autres,
    doFetch
  );
}

// ---------------------------------------------------------------------------
// Grist : document public, une table
// ---------------------------------------------------------------------------

async function chargerGrist(
  url: URL,
  baseUrl: string,
  docId: string,
  tableUrl: string | null,
  ressource: string | undefined,
  doFetch: typeof fetch
): Promise<ResultatChargement> {
  if (!IDENTIFIANT_SUR.test(docId)) return refusNonReconnue();
  const docSegment = encodeURIComponent(docId);
  const sonde = await doFetch(getProxyUrl(baseUrl, `/docs/${docSegment}/tables`), {
    headers: buildGristHeaders(null),
  });
  if (sonde.status === 401 || sonde.status === 403) return refusAcces('Grist');
  if (sonde.status === 404) {
    return refus(`Document Grist introuvable (« ${docId} »). ${VERS_SOURCES}`);
  }
  if (!sonde.ok) return refus(`Grist a répondu HTTP ${sonde.status}. Réessaie plus tard.`);
  const liste = (await sonde.json()) as { tables?: Array<{ id?: unknown }> };
  const tables = (liste.tables ?? [])
    .map((t) => (typeof t.id === 'string' ? t.id : ''))
    .filter((id) => IDENTIFIANT_SUR.test(id));
  if (tables.length === 0) return refus('Ce document Grist ne contient aucune table lisible.');

  const voulue = ressource?.trim() || tableUrl;
  let table = tables[0];
  if (voulue) {
    const trouvee = tables.find((t) => t === voulue);
    if (!trouvee) {
      return refus(`Table « ${voulue} » absente du document. Tables : ${tables.join(', ')}.`);
    }
    table = trouvee;
  }

  const reponse = await doFetch(
    getProxyUrl(baseUrl, `/docs/${docSegment}/tables/${encodeURIComponent(table)}/records`),
    { headers: buildGristHeaders(null) }
  );
  if (reponse.status === 401 || reponse.status === 403) return refusAcces('Grist');
  if (!reponse.ok) return refus(`Grist a répondu HTTP ${reponse.status}. Réessaie plus tard.`);
  const json = (await reponse.json()) as { records?: unknown[] };
  const enregistrements = Array.isArray(json.records) ? json.records : [];
  const lignes = (
    flattenProviderRecords(enregistrements, GRIST_CONFIG.response) as Record<string, unknown>[]
  ).slice(0, MAX_LIGNES_URL);
  if (lignes.length === 0) return refus(`La table « ${table} » est vide.`);

  const source: Source = {
    id: `grist_${docId}_${table}`,
    name: `${nomDocumentGrist(url, docId)} / ${table}`,
    type: 'grist',
    provider: 'grist',
    documentId: docId,
    tableId: table,
    apiUrl: `${baseUrl}/api/docs/${docSegment}/tables/${encodeURIComponent(table)}/records`,
    apiKey: null,
    isPublic: true,
    data: lignes,
    recordCount: lignes.length,
  };
  return {
    ok: true,
    source,
    fields: analyzeDataFields(lignes),
    fournisseur: GRIST_CONFIG.displayName,
    total: enregistrements.length,
    autres: tables.filter((t) => t !== table),
  };
}

// ---------------------------------------------------------------------------
// Point d'entree
// ---------------------------------------------------------------------------

/**
 * Reconnait l'URL et charge le jeu. Ne leve pas : toute impossibilite est un
 * refus explicite, rendu au modele.
 */
export async function chargerSourceDepuisUrl(
  brute: unknown,
  options: OptionsChargement = {}
): Promise<ResultatChargement> {
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const texte = typeof brute === 'string' ? brute.trim() : '';
  if (!texte) return refus('Aucune URL fournie : passe l’adresse du jeu dans « url ».');
  if (texte.length > LONGUEUR_MAX_URL) return refus('URL trop longue.');

  let url: URL;
  try {
    url = new URL(texte);
  } catch {
    return refusNonReconnue();
  }
  if (url.protocol !== 'https:') {
    return refus(`Seules les adresses https:// sont acceptées. ${VERS_SOURCES}`);
  }
  if (url.username || url.password) {
    return refus(
      `L'URL porte un identifiant : il n'est pas utilisé ici, et ne doit pas circuler dans la conversation. ${VERS_SOURCES}`
    );
  }
  for (const cle of url.searchParams.keys()) {
    if (PARAMETRES_SECRETS.has(cle.toLowerCase())) {
      return refus(
        `L'URL porte une clé d'accès (paramètre « ${cle} ») : elle n'est pas utilisée ici, et ne doit pas circuler dans la conversation. ${VERS_SOURCES}`
      );
    }
  }

  const reconnue = reconnaitreUrlSource(url.href);
  try {
    switch (reconnue.kind) {
      case 'api':
        return await chargerApi(reconnue.resolved, null, [], doFetch);
      case 'datagouv-jeu':
        return await chargerDataGouv(reconnue.slug, options.ressource, doFetch);
      case 'grist':
        if (!reconnue.ref?.docId || !reconnue.ref.baseUrl.startsWith('https://')) {
          return refus(
            `Serveur Grist sans document précis : il faut l'URL de partage d'un document public. ${VERS_SOURCES}`
          );
        }
        return await chargerGrist(
          url,
          reconnue.ref.baseUrl,
          reconnue.ref.docId,
          reconnue.tableId,
          options.ressource,
          doFetch
        );
      default:
        return refusNonReconnue();
    }
  } catch {
    // Reseau coupe, CORS, JSON illisible : l'URL n'est pas en cause, le chemin si.
    return refus(`Le jeu n'a pas pu être chargé (réseau ou réponse illisible). ${VERS_SOURCES}`);
  }
}

// ---------------------------------------------------------------------------
// Outil du modele
// ---------------------------------------------------------------------------

export const CHARGER_SOURCE_URL_TOOL = {
  type: 'function',
  function: {
    name: 'charger_source_url',
    description:
      "Crée la source du document à partir de l'URL d'un jeu donnée par l'usager (Opendatasoft/Huwise, data.gouv.fr, Grist public, INSEE Melodi) : reconnaît l'URL, charge les lignes et rend fournisseur, champs et nombre de lignes. À appeler dès que l'usager donne l'adresse d'un jeu, AVANT inspect_data et add_blocks.",
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: "URL du jeu, telle que l'usager l'a donnée" },
        ressource: {
          type: 'string',
          description:
            'Facultatif : table (Grist) ou ressource (data.gouv) à retenir, par identifiant ou titre',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
} as const;

/** Resume rendu au modele apres un chargement reussi. */
export function resumerChargement(
  resultat: ChargementReussi,
  conservees: readonly { id: string; name: string }[]
): string {
  const { source, fields, total, autres, fournisseur } = resultat;
  const n = source.data?.length ?? 0;
  const surTotal = total !== null && total > n ? ` (sur ${total} au total : échantillon)` : '';
  const lignes = [
    `Source chargée : « ${source.name} » (${fournisseur}), id « ${source.id} ». C'est désormais la source du document : les nouveaux blocs la lisent.`,
    `Lignes : ${n}${surTotal}.`,
    `Champs (${fields.length}) : ${fields.map((f) => `${f.name} (${f.type})`).join(', ')}.`,
  ];
  if (autres.length > 0)
    lignes.push(`Autres tables ou ressources disponibles : ${autres.join(', ')}.`);
  if (conservees.length > 0) {
    lignes.push(
      `Source(s) précédente(s) conservée(s) parce que des blocs la lisent encore : ${conservees
        .map((s) => `« ${s.name} » (${s.id})`)
        .join(', ')}.`
    );
  }
  lignes.push(
    'Étape suivante : inspect_data (ou distinct_values avant un filtre), puis add_blocks.'
  );
  return lignes.join('\n');
}

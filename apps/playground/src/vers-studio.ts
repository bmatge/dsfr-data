/**
 * « Envoyer au Studio IA » (#1132) : ce que le Playground confie au Studio
 * à côté du diagnostic — le code, et la source qu'il déclare.
 *
 * La source est réduite à une ADRESSE PUBLIQUE, reconnue par la même
 * fonction que la création d'une connexion et que l'outil `charger_source_url`
 * du Studio (`reconnaitreUrlSource`) : le Studio la charge ensuite par le
 * chemin de cet outil (validation, proxy, refus propres). Une source qui porte
 * une clé (en-têtes, `api-key-ref`, paramètre secret dans l'URL) n'est PAS
 * transmise : ni l'en-tête ni le jeton ne quittent l'éditeur, et le Studio le
 * dit à l'usager.
 *
 * Analyse par `DOMParser` : le code n'est pas exécuté, seuls les attributs
 * des `<dsfr-data-source>` sont lus.
 */
import {
  LONGUEUR_MAX_CODE_PASSATION,
  reconnaitreUrlSource,
  type PassationStudio,
  type SourceNonTransmise,
} from '@dsfr-data/shared';

/** Paramètres d'URL qui portent un secret (même liste que le Studio). */
const PARAMETRES_SECRETS: ReadonlySet<string> = new Set([
  'apikey',
  'api_key',
  'api-key',
  'token',
  'access_token',
  'auth',
  'key',
]);

/** Hôte par défaut de l'API tabulaire de data.gouv.fr (adaptateur `tabular`). */
const TABULAR_PAR_DEFAUT = 'https://tabular-api.data.gouv.fr';
/** Base par défaut d'INSEE Melodi (adaptateur `insee`). */
const INSEE_PAR_DEFAUT = 'https://api.insee.fr/melodi';

export type SourceDuCode =
  { transmise: true; url: string } | { transmise: false; raison: SourceNonTransmise };

function attr(el: Element, nom: string): string {
  return (el.getAttribute(nom) ?? '').trim();
}

/** Origine d'une base d'URL, ou la valeur par défaut si elle est vide ou illisible. */
function origine(base: string, defaut: string): string | null {
  if (!base) return new URL(defaut).origin;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
}

/** L'adresse d'API qu'interroge une `dsfr-data-source`, reconstruite depuis ses attributs. */
function adresseDeLaSource(el: Element): string | null {
  const url = attr(el, 'url');
  if (url) return url;
  const type = (attr(el, 'api-type') || 'generic').toLowerCase();
  const base = attr(el, 'base-url');
  const jeu = attr(el, 'dataset-id');
  switch (type) {
    case 'opendatasoft': {
      if (!base || !jeu) return null;
      const o = origine(base, base);
      if (!o) return null;
      return `${o}/api/explore/v2.1/catalog/datasets/${encodeURIComponent(jeu)}/records`;
    }
    case 'tabular': {
      const ressource = attr(el, 'resource');
      const o = origine(base, TABULAR_PAR_DEFAUT);
      if (!ressource || !o) return null;
      return `${o}/api/resources/${encodeURIComponent(ressource)}/data/`;
    }
    case 'insee': {
      if (!jeu) return null;
      return `${(base || INSEE_PAR_DEFAUT).replace(/\/+$/, '')}/data/${encodeURIComponent(jeu)}`;
    }
    case 'grist':
      // L'adaptateur Grist lit l'URL complète des enregistrements dans base-url.
      return base || null;
    default:
      return null;
  }
}

/** Verdict pour UNE source du code. */
export function analyserSource(el: Element): SourceDuCode {
  if (attr(el, 'headers') || attr(el, 'api-key-ref')) return { transmise: false, raison: 'cle' };
  const adresse = adresseDeLaSource(el);
  if (!adresse) {
    return attr(el, 'data')
      ? { transmise: false, raison: 'embarquee' }
      : { transmise: false, raison: 'non-reconnue' };
  }
  let url: URL;
  try {
    url = new URL(adresse);
  } catch {
    return { transmise: false, raison: 'non-reconnue' };
  }
  if (url.username || url.password) return { transmise: false, raison: 'cle' };
  for (const cle of url.searchParams.keys()) {
    if (PARAMETRES_SECRETS.has(cle.toLowerCase())) return { transmise: false, raison: 'cle' };
  }
  if (url.protocol !== 'https:') return { transmise: false, raison: 'non-reconnue' };
  const reconnue = reconnaitreUrlSource(url.href);
  if (reconnue.kind === 'api' || reconnue.kind === 'grist' || reconnue.kind === 'datagouv-jeu') {
    return { transmise: true, url: url.href };
  }
  return { transmise: false, raison: 'non-reconnue' };
}

/**
 * Source du code : la PREMIÈRE `dsfr-data-source` transmissible ; à défaut,
 * la raison qui écarte la première. `sources` compte toutes les sources.
 */
export function extraireSourceDuCode(code: string): { source: SourceDuCode; sources: number } {
  const doc = new DOMParser().parseFromString(code, 'text/html');
  const elements = Array.from(doc.querySelectorAll('dsfr-data-source'));
  if (elements.length === 0) {
    return { source: { transmise: false, raison: 'absente' }, sources: 0 };
  }
  const verdicts = elements.map(analyserSource);
  const transmise = verdicts.find((v) => v.transmise);
  return { source: transmise ?? verdicts[0], sources: elements.length };
}

/** La passation complète, ou null si le code est vide ou trop long pour la session. */
export function construirePassation(code: string): PassationStudio | null {
  if (!code.trim() || code.length > LONGUEUR_MAX_CODE_PASSATION) return null;
  const { source, sources } = extraireSourceDuCode(code);
  return {
    origine: 'playground',
    code,
    sources,
    ...(source.transmise ? { source: { url: source.url } } : { sourceNonTransmise: source.raison }),
  };
}

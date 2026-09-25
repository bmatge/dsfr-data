/**
 * Studio IA - Reprise d'un code du Playground (#1132).
 *
 * Le Playground confie au Studio, par « Envoyer au Studio IA » (ou « Construire
 * pour moi » de son assistant), son code, la source publique qu'il déclare
 * (`PassationStudio`) et le diagnostic de son pipeline. Le Studio :
 *
 *   1. charge la source par LE chemin de `charger_source_url`
 *      (`chargerSourceDepuisUrl` : reconnaissance, proxy, refus propres), puis
 *      l'adopte comme source du document, exactement comme après cet outil
 *      (`appliquerSource` + `enregistrerSourceChargee`) ;
 *   2. pose dans le champ du chat la consigne de reconstruction fidèle, le code
 *      et le diagnostic — SANS l'envoyer : l'usager relit ce qui partira vers
 *      le modèle (le diagnostic contient des lignes de données) ;
 *   3. offre le lien « Retour au Playground », qui rend le code d'origine.
 *
 * Aucune donnée ne part vers le modèle avant que l'usager envoie son message :
 * le chargement de la source n'interroge que l'API du fournisseur.
 */

import { appHref, type PassationStudio, type Source } from '@dsfr-data/shared';
import type { ResultatChargement } from './source-url.js';

/** Clé du code d'origine, pour le lien de retour (session du navigateur). */
export const CLE_RETOUR_PLAYGROUND = 'studio-retour-playground';

/** Clé de passation du code vers le Playground (même clé que « Ouvrir dans le Playground »). */
const CLE_CODE_PLAYGROUND = 'playground-code';

/** Consigne de reconstruction, en tête du message posé dans le champ. */
export const QUESTION_RECONSTRUIRE =
  'Reconstruisez fidèlement, dans ce tableau de bord, le code ci-dessous venu du Playground : mêmes composants, mêmes champs, mêmes réglages. ' +
  'Utilisez les blocs guidés (text, chart, filters, map) quand ils le couvrent, et un bloc « composant libre » (kind:"component") pour le reste ' +
  '(tableau croisé, dépivotage, recherche, facettes, volet de carte…). ' +
  "N'ajoutez rien qui ne soit pas dans le code, et dites ce qui ne peut pas être repris.";

/** Ce que le chargement de la source a donné, pour la consigne et le chat. */
export type IssueSource =
  | { charge: true; source: Source }
  | {
      charge: false;
      raison: NonNullable<PassationStudio['sourceNonTransmise']> | 'refus';
      detail?: string;
    };

/** Ligne de la consigne qui dit au modèle d'où viennent les données. */
export function ligneSource(issue: IssueSource, sources: number): string {
  const lignes: string[] = [];
  if (issue.charge) {
    lignes.push(
      `La source déclarée dans le code est chargée comme source du document : « ${issue.source.name} » (id « ${issue.source.id} »). ` +
        'Reportez ses clauses (where, select, group-by, order-by…) sur les blocs quand leur vocabulaire le permet.'
    );
  } else {
    lignes.push(
      "La source déclarée dans le code n'a pas été chargée : utilisez la source du document."
    );
  }
  if (sources > 1) {
    lignes.push(
      `Le code déclare ${sources} sources : une seule est chargée ; dites ce que les autres portaient.`
    );
  }
  return lignes.join(' ');
}

/** Message complet posé dans le champ (jamais envoyé d'office). */
export function messageReconstruction(
  passation: PassationStudio,
  issue: IssueSource,
  diagnostic: string | null
): string {
  const parties = [
    `${QUESTION_RECONSTRUIRE}\n${ligneSource(issue, passation.sources)}`,
    `Code du Playground :\n\`\`\`html\n${passation.code.trim()}\n\`\`\``,
  ];
  if (diagnostic?.trim()) parties.push(diagnostic.trim());
  return parties.join('\n\n');
}

/** Première phrase d'un refus de `chargerSourceDepuisUrl` (le reste s'adresse au modèle). */
function premierePhrase(message: string): string {
  const fin = message.search(/\.(\s|$)/);
  return fin >= 0 ? message.slice(0, fin) : message;
}

/** Annonce dans le chat, lue par l'usager (pas envoyée au modèle avant son message). */
export function annonceSource(issue: IssueSource, sourceCourante: string | null): string {
  const relire = 'La demande de reconstruction est dans le champ : relisez-la, puis envoyez-la.';
  if (issue.charge) {
    const n = issue.source.data?.length ?? 0;
    return `Code du Playground reçu. Source « ${issue.source.name} » chargée depuis ce code (${n.toLocaleString('fr-FR')} lignes). ${relire}`;
  }
  const choisir = sourceCourante
    ? `Sinon, la source déjà choisie (« ${sourceCourante} ») sera utilisée.`
    : 'Choisissez une source dans « Source » avant d’envoyer la demande.';
  const pourquoi: Record<typeof issue.raison, string> = {
    cle: "La source du code demande une clé d'accès : elle n'a pas été transmise au Studio IA. Connectez-la dans l'app Sources (la clé s'y saisit, hors du chat), puis choisissez-la dans « Source ».",
    embarquee:
      "Le code porte ses données dans la page (attribut data) : elles n'ont pas été reprises comme source.",
    absente: 'Le code ne déclare aucune source de données.',
    'non-reconnue':
      "La source du code n'est l'adresse d'aucun fournisseur reconnu : elle n'a pas été chargée.",
    refus: `La source du code n'a pas pu être chargée (${premierePhrase(issue.detail ?? 'raison inconnue')}).`,
  };
  return `Code du Playground reçu. ${pourquoi[issue.raison]} ${choisir} ${relire}`;
}

export interface DependancesReprise {
  /** Charge une URL par le chemin de `charger_source_url`. */
  charger: (url: string, ressource?: string) => Promise<ResultatChargement>;
  /** Adopte la source comme après l'outil (état, document, sélecteur). */
  adopter: (source: Source) => void;
  /** Nom de la source déjà choisie, s'il y en a une. */
  sourceCourante: () => string | null;
  /** Annonce dans le chat. */
  annoncer: (texte: string) => void;
  /** Pose le message dans le champ, sans l'envoyer. */
  poser: (texte: string) => void;
}

/**
 * Reprend une passation du Playground. La source d'abord (la consigne dit si
 * elle est chargée), puis le message dans le champ. Ne lève pas.
 */
export async function reprendreCodePlayground(
  passation: PassationStudio,
  diagnostic: string | null,
  deps: DependancesReprise
): Promise<IssueSource> {
  let issue: IssueSource;
  if (passation.source) {
    let resultat: ResultatChargement;
    try {
      resultat = await deps.charger(passation.source.url, passation.source.ressource);
    } catch {
      resultat = { ok: false, message: 'réseau indisponible' };
    }
    if (resultat.ok) {
      deps.adopter(resultat.source);
      issue = { charge: true, source: resultat.source };
    } else {
      issue = { charge: false, raison: 'refus', detail: resultat.message };
    }
  } else {
    issue = { charge: false, raison: passation.sourceNonTransmise ?? 'absente' };
  }
  deps.annoncer(annonceSource(issue, issue.charge ? null : deps.sourceCourante()));
  deps.poser(messageReconstruction(passation, issue, diagnostic));
  return issue;
}

/** Garde le code d'origine pour le lien de retour (avant de le monter). */
export function garderCodePourRetour(code: string): void {
  try {
    sessionStorage.setItem(CLE_RETOUR_PLAYGROUND, code);
  } catch {
    // Stockage plein : pas de lien de retour, le reste de la reprise tient.
  }
}

/**
 * Lien « Retour au Playground » : visible quand le Studio a été ouvert depuis
 * le Playground (`?from=playground`) et qu'un code d'origine est gardé. Il le
 * rend au Playground (`playground-code`, `?from=studio`), qui propose à son
 * tour « Retour au Studio IA ». Rend `true` si le lien est montré.
 */
export function monterRetourPlayground(from: string | null): boolean {
  const lien = document.getElementById('retour-playground-link') as HTMLAnchorElement | null;
  const bloc = document.getElementById('retour-playground');
  if (!lien || !bloc || from !== 'playground') return false;
  let code: string | null;
  try {
    code = sessionStorage.getItem(CLE_RETOUR_PLAYGROUND);
  } catch {
    return false;
  }
  if (!code) return false;
  lien.href = appHref('playground', { from: 'studio' });
  lien.addEventListener('click', () => {
    try {
      const garde = sessionStorage.getItem(CLE_RETOUR_PLAYGROUND);
      if (garde) sessionStorage.setItem(CLE_CODE_PLAYGROUND, garde);
    } catch {
      // Sans stockage, le Playground s'ouvre sur son exemple par défaut.
    }
  });
  bloc.hidden = false;
  return true;
}

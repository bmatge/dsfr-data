/**
 * Publication d'une source (ADR-165, #1361).
 *
 * Une table Grist à clé ou non publique n'est lisible par aucun code généré
 * sans l'instance. « Publier » crée un partage `public` sur la source
 * (`POST /api/shares`) : son jeton devient l'adresse
 * `/api/public/sources/<jeton>/records`, lue avec la clé déchiffrée côté
 * serveur. Le jeton est recopié sur la source (`publicToken`) pour que le
 * Builder, le Studio et l'export sachent écrire cette adresse sans
 * interroger le serveur. « Révoquer » supprime le partage et le jeton.
 *
 * Mode serveur seulement : sans session, les boutons n'apparaissent pas.
 */

import {
  authenticatedFetch,
  confirmDialog,
  isAuthenticated,
  isPublishedSource,
  publicSourceRecordsUrl,
  toastError,
  toastSuccess,
} from '@dsfr-data/shared';
import type { Source } from '@dsfr-data/shared';

/** Une source a quelque chose à publier : table Grist à clé, à connexion, ou non publique. */
export function sourcePubliable(source: Source | null | undefined): boolean {
  if (!source || source.type !== 'grist') return false;
  const cle = typeof source.apiKey === 'string' && source.apiKey.trim().length > 0;
  return cle || source.isPublic === false || !!source.connectionId;
}

/** Les boutons de publication ont un sens : mode serveur, session ouverte, source publiable. */
export function publicationPossible(source: Source | null | undefined): boolean {
  return isAuthenticated() && sourcePubliable(source);
}

function messageErreur(data: unknown, fallback: string): string {
  const d = data as { error?: unknown; code?: unknown } | null;
  if (d?.code === 'SOURCE_NOT_PUBLISHABLE')
    return "Cette source n'a pas besoin d'être publiée : son code généré la lit déjà sans l'instance.";
  if (d?.code === 'ALREADY_PUBLISHED') return 'Cette source est déjà publiée.';
  return typeof d?.error === 'string' ? d.error : fallback;
}

/**
 * Publie la source : dialogue de consentement, création du partage, jeton
 * recopié sur la source. Rend la source mise à jour, ou `null` si rien n'a
 * été fait (refus, erreur).
 */
export async function publierSource(source: Source): Promise<Source | null> {
  if (!publicationPossible(source)) return null;
  const ok = await confirmDialog(
    `Publier la table « ${source.name} » ?\n\n` +
      'Quiconque aura le lien pourra lire cette table, même si le document Grist est privé. ' +
      'Votre clé reste sur le serveur. Vous pourrez révoquer le lien à tout moment depuis Sources.\n\n' +
      'Conseil : utilisez une clé Grist dédiée, en lecture seule si votre instance Grist le permet ; une clé régénérée casse les graphiques publiés.',
    { title: 'Publier cette table', confirmLabel: 'Publier', danger: false }
  );
  if (!ok) return null;

  try {
    const res = await authenticatedFetch('/api/shares', {
      method: 'POST',
      body: JSON.stringify({
        resource_type: 'source',
        resource_id: source.id,
        target_type: 'public',
      }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      toastError(messageErreur(data, 'La publication a échoué.'));
      return null;
    }
    const token = (data as { id?: unknown })?.id;
    if (typeof token !== 'string') {
      toastError('La publication a échoué : jeton absent.');
      return null;
    }
    toastSuccess(
      `« ${source.name} » publiée. Le Builder génère désormais un code qui lit cette instance.`
    );
    return { ...source, publicToken: token };
  } catch {
    toastError('La publication a échoué (réseau).');
    return null;
  }
}

/** Révoque la publication : supprime le partage, retire le jeton de la source. */
export async function revoquerPublication(source: Source): Promise<Source | null> {
  if (!isPublishedSource(source as unknown as Record<string, unknown>)) return null;
  const ok = await confirmDialog(
    `Révoquer la publication de « ${source.name} » ?\n\n` +
      'Les graphiques qui lisent ce lien cesseront de fonctionner immédiatement.',
    { title: 'Révoquer le lien', confirmLabel: 'Révoquer', danger: true }
  );
  if (!ok) return null;

  try {
    const res = await authenticatedFetch(
      `/api/shares/${encodeURIComponent(source.publicToken as string)}`,
      {
        method: 'DELETE',
      }
    );
    // 404 : le partage n'existe plus côté serveur — le jeton local est périmé,
    // on le retire aussi.
    if (!res.ok && res.status !== 404) {
      const data: unknown = await res.json().catch(() => null);
      toastError(messageErreur(data, 'La révocation a échoué.'));
      return null;
    }
    toastSuccess(`Publication de « ${source.name} » révoquée.`);
    const { publicToken: _retire, ...reste } = source;
    return { ...reste, publicToken: null };
  } catch {
    toastError('La révocation a échoué (réseau).');
    return null;
  }
}

/** Adresse publique d'une source publiée, pour l'afficher ou la copier. */
export function adressePublique(source: Source): string | null {
  return isPublishedSource(source as unknown as Record<string, unknown>)
    ? publicSourceRecordsUrl(source.publicToken as string)
    : null;
}

/**
 * Export d'image (PNG / JPG) depuis un apercu.
 *
 * v2 (retour d'usage) : capture DOM FIDELE via `html-to-image` — le bloc
 * complet tel que l'oeil le voit (titre, graphique, LEGENDE, mention de
 * source), et plus seulement le canvas nu. Les graphiques dsfr-chart rendent
 * en effet leur titre, leur legende et leur source en HTML AUTOUR du canvas
 * Chart.js : une capture canvas-only produisait un camembert sans legende.
 *
 * La cible est soit un element direct (builder-IA), soit le document d'une
 * iframe same-origin (builder classique, playground, favoris).
 *
 * Bonus v2 : les apercus sans canvas (KPI, tableaux, podiums — du DOM)
 * deviennent exportables aussi.
 *
 * Toujours pas d'export SVG : la chaine de rendu (Chart.js) est raster,
 * il n'y a rien de vectoriel a recuperer (decision documentee).
 *
 * Limites assumees, remontees en erreurs TYPEES (l'appelant les toaste) :
 *  - iframe vide ou non chargee → 'iframe-inaccessible' ;
 *  - apercu vide → 'empty' ;
 *  - ressources cross-origin non capturables (tuiles de carte sans CORS) ou
 *    echec de rendu → 'capture-failed'. Les polices CDN non embarquables
 *    retombent silencieusement sur la police systeme (compromis accepte).
 */

import { toPng, toJpeg } from 'html-to-image';

export type ImageExportFormat = 'png' | 'jpg';

export type ImageExportFailure = 'empty' | 'capture-failed' | 'iframe-inaccessible';

export class ImageExportError extends Error {
  constructor(public readonly reason: ImageExportFailure) {
    super(reason);
    this.name = 'ImageExportError';
  }
}

/** Messages utilisateur par cause d'echec (a toaster par l'appelant). */
export const IMAGE_EXPORT_MESSAGES: Record<ImageExportFailure, string> = {
  empty: "L'aperçu est vide : générez d'abord un rendu avant de l'exporter.",
  'capture-failed':
    "Export impossible : l'aperçu contient des ressources que le navigateur interdit de capturer (ex. tuiles de carte externes).",
  'iframe-inaccessible': "L'aperçu n'est pas accessible (iframe vide ou non chargée).",
};

/** Racine de capture : un element, ou une iframe same-origin (on prend son body). */
export type ExportRoot = HTMLElement;

/** Resout le noeud DOM a capturer. Exporte pour les tests. */
export function resolveCaptureNode(root: ExportRoot): HTMLElement {
  if (root instanceof HTMLIFrameElement) {
    const body = root.contentDocument?.body;
    if (!body) throw new ImageExportError('iframe-inaccessible');
    if (body.childElementCount === 0) throw new ImageExportError('empty');
    return body;
  }
  return root;
}

/** Nom de fichier sur : base nettoyee + extension du format. */
export function imageFilename(base: string, format: ImageExportFormat): string {
  const clean =
    base
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 60) || 'graphique';
  return `${clean}.${format}`;
}

/** Declenche le telechargement d'une data URL. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Rendus injectables pour les tests (jsdom ne sait pas rasteriser). */
export interface ImageRenderers {
  toPng: typeof toPng;
  toJpeg: typeof toJpeg;
}

const DEFAULT_RENDERERS: ImageRenderers = { toPng, toJpeg };

/**
 * Export complet : capture le bloc d'apercu en image (fond blanc, 2x pour la
 * nettete) et telecharge. Jette ImageExportError — utiliser
 * IMAGE_EXPORT_MESSAGES[err.reason] pour informer l'utilisateur.
 */
export async function exportPreviewImage(
  root: ExportRoot,
  format: ImageExportFormat,
  filenameBase: string,
  renderers: ImageRenderers = DEFAULT_RENDERERS
): Promise<void> {
  const node = resolveCaptureNode(root);

  const options = {
    // Fond blanc : les blocs DSFR sont transparents et le JPEG n'a pas d'alpha.
    backgroundColor: '#ffffff',
    // 2x : nettete a l'impression / au zoom (le besoin reel derriere « SVG »).
    pixelRatio: 2,
    // Les polices CDN (Marianne) ne sont pas toujours embarquables (CORS) :
    // on ne bloque pas l'export pour ca, la police systeme prend le relais.
    skipFonts: false,
  };

  let dataUrl: string;
  try {
    dataUrl =
      format === 'jpg'
        ? await renderers.toJpeg(node, { ...options, quality: 0.92 })
        : await renderers.toPng(node, options);
  } catch {
    throw new ImageExportError('capture-failed');
  }
  if (!dataUrl || dataUrl === 'data:,') throw new ImageExportError('capture-failed');

  downloadDataUrl(dataUrl, imageFilename(filenameBase, format));
}

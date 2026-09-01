/**
 * Export d'image (PNG / JPG) depuis un apercu.
 *
 * Toute la chaine de rendu des graphiques (dsfr-chart = Chart.js) produit du
 * RASTER sur <canvas> : on capture donc le canvas de l'apercu — direct
 * (builder-IA), ou a l'interieur d'une iframe same-origin (builder classique,
 * playground, favoris). Pas d'export SVG : il n'existe aucune sortie
 * vectorielle a recuperer (decision documentee, cf. discussion #export).
 *
 * Limites assumees, remontees en erreurs TYPEES (l'appelant les toaste) :
 *  - apercu sans canvas (KPI, tableau, podium — du DOM) → 'no-canvas' ;
 *  - canvas "taint" par des tuiles sans CORS (cartes Leaflet/IGN) →
 *    'tainted' (le navigateur interdit la lecture des pixels).
 */

export type ImageExportFormat = 'png' | 'jpg';

export type ImageExportFailure = 'no-canvas' | 'tainted' | 'iframe-inaccessible';

export class ImageExportError extends Error {
  constructor(public readonly reason: ImageExportFailure) {
    super(reason);
    this.name = 'ImageExportError';
  }
}

/** Messages utilisateur par cause d'echec (a toaster par l'appelant). */
export const IMAGE_EXPORT_MESSAGES: Record<ImageExportFailure, string> = {
  'no-canvas':
    "L'export d'image est disponible pour les graphiques (rendu canvas) — pas pour les KPI, tableaux ou contenus texte.",
  tainted:
    "Export impossible : l'aperçu contient des images externes (tuiles de carte) que le navigateur interdit de capturer.",
  'iframe-inaccessible': "L'aperçu n'est pas accessible (iframe vide ou non chargée).",
};

/** Racine de recherche : un element, un document, ou une iframe same-origin. */
export type ExportRoot = Document | HTMLElement;

function searchDocuments(root: ExportRoot): Array<Document | HTMLElement> {
  if (root instanceof HTMLIFrameElement) {
    // Iframe same-origin (srcdoc) : on cherche DANS son document.
    const doc = root.contentDocument;
    if (!doc) throw new ImageExportError('iframe-inaccessible');
    return [doc];
  }
  return [root];
}

/**
 * Canvas exportable de l'apercu : le plus grand canvas VISIBLE trouve
 * (les graphiques dsfr-chart posent parfois plusieurs canvas — legendes,
 * axes — le plus grand est le graphique).
 */
export function pickExportCanvas(root: ExportRoot): HTMLCanvasElement {
  const candidates: HTMLCanvasElement[] = [];
  for (const scope of searchDocuments(root)) {
    for (const canvas of Array.from(scope.querySelectorAll('canvas'))) {
      const el = canvas as HTMLCanvasElement;
      if (el.width > 0 && el.height > 0 && el.offsetParent !== null) candidates.push(el);
    }
  }
  if (candidates.length === 0) throw new ImageExportError('no-canvas');
  candidates.sort((a, b) => b.width * b.height - a.width * a.height);
  return candidates[0];
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

/**
 * Compose le canvas source sur fond blanc (les canvas Chart.js sont
 * transparents ; le JPEG n'a pas d'alpha) et rend une data URL.
 * `createCanvas` est injectable pour les tests (jsdom n'implemente pas 2d).
 */
export function canvasToDataUrl(
  source: HTMLCanvasElement,
  format: ImageExportFormat,
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')
): string {
  const out = createCanvas();
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new ImageExportError('no-canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  try {
    ctx.drawImage(source, 0, 0);
    return out.toDataURL(format === 'jpg' ? 'image/jpeg' : 'image/png', 0.92);
  } catch {
    // SecurityError : canvas taint (tuiles cross-origin sans CORS).
    throw new ImageExportError('tainted');
  }
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

/**
 * Export complet : trouve le canvas de l'apercu, compose, telecharge.
 * Jette ImageExportError — utiliser IMAGE_EXPORT_MESSAGES[err.reason] pour
 * informer l'utilisateur.
 */
export function exportPreviewImage(
  root: ExportRoot,
  format: ImageExportFormat,
  filenameBase: string
): void {
  const canvas = pickExportCanvas(root);
  const dataUrl = canvasToDataUrl(canvas, format);
  downloadDataUrl(dataUrl, imageFilename(filenameBase, format));
}

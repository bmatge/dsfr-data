/**
 * Export d'image PNG/JPG depuis un apercu — v2 : capture DOM fidele via
 * html-to-image (titre + legende + source inclus).
 *
 * jsdom ne sait pas rasteriser : les rendus toPng/toJpeg sont INJECTES
 * (ImageRenderers). Ce qui compte : la resolution du noeud a capturer,
 * le mapping format→rendu et ses options (fond blanc, 2x, qualite JPEG),
 * les erreurs typees, le nom de fichier.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  resolveCaptureNode,
  imageFilename,
  exportPreviewImage,
  ImageExportError,
  IMAGE_EXPORT_MESSAGES,
  type ImageRenderers,
} from '../../packages/shared/src/ui/image-export';

function renderers(result = 'data:image/png;base64,xxx') {
  return {
    toPng: vi.fn(async () => result),
    toJpeg: vi.fn(async () => result.replace('png', 'jpeg')),
  } as unknown as ImageRenderers & {
    toPng: ReturnType<typeof vi.fn>;
    toJpeg: ReturnType<typeof vi.fn>;
  };
}

function iframeWith(body: string | null): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  if (body === null) {
    Object.defineProperty(iframe, 'contentDocument', { value: null });
  } else {
    const doc = document.implementation.createHTMLDocument('apercu');
    doc.body.innerHTML = body;
    Object.defineProperty(iframe, 'contentDocument', { value: doc });
  }
  return iframe;
}

describe('resolveCaptureNode', () => {
  it('un element direct est capture tel quel', () => {
    const el = document.createElement('div');
    expect(resolveCaptureNode(el)).toBe(el);
  });

  it('une iframe same-origin est capturee par son body', () => {
    const iframe = iframeWith('<h2>Titre</h2><canvas></canvas><ul>légende</ul>');
    const node = resolveCaptureNode(iframe);
    expect(node.tagName).toBe('BODY');
    expect(node.querySelector('h2')?.textContent).toBe('Titre');
  });

  it('iframe sans document → iframe-inaccessible ; body vide → empty', () => {
    expect(() => resolveCaptureNode(iframeWith(null))).toThrowError(
      expect.objectContaining({ reason: 'iframe-inaccessible' })
    );
    expect(() => resolveCaptureNode(iframeWith(''))).toThrowError(
      expect.objectContaining({ reason: 'empty' })
    );
  });
});

describe('exportPreviewImage', () => {
  it('png : toPng avec fond blanc et pixelRatio 2, telechargement nomme', async () => {
    const r = renderers();
    const el = document.createElement('div');
    const clicks: string[] = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      clicks.push((this as HTMLAnchorElement).download);
    };
    try {
      await exportPreviewImage(el, 'png', 'Évolution 2024', r);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
    expect(r.toPng).toHaveBeenCalledWith(
      el,
      expect.objectContaining({ backgroundColor: '#ffffff', pixelRatio: 2 })
    );
    expect(r.toJpeg).not.toHaveBeenCalled();
    expect(clicks).toEqual(['evolution-2024.png']);
  });

  it('jpg : toJpeg avec qualite 0.92', async () => {
    const r = renderers();
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = () => {};
    try {
      await exportPreviewImage(document.createElement('div'), 'jpg', 'x', r);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
    expect(r.toJpeg).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ quality: 0.92, backgroundColor: '#ffffff' })
    );
  });

  it('un echec de rendu devient capture-failed (message utilisateur dispo)', async () => {
    const r = {
      toPng: vi.fn(async () => {
        throw new Error('CORS tile');
      }),
      toJpeg: vi.fn(),
    } as unknown as ImageRenderers;
    await expect(
      exportPreviewImage(document.createElement('div'), 'png', 'x', r)
    ).rejects.toMatchObject({ reason: 'capture-failed' });
    expect(IMAGE_EXPORT_MESSAGES['capture-failed']).toContain('capturer');
  });

  it('une data URL vide devient capture-failed aussi', async () => {
    const r = {
      toPng: vi.fn(async () => 'data:,'),
      toJpeg: vi.fn(),
    } as unknown as ImageRenderers;
    await expect(
      exportPreviewImage(document.createElement('div'), 'png', 'x', r)
    ).rejects.toBeInstanceOf(ImageExportError);
  });
});

describe('imageFilename', () => {
  it('nettoie accents, ponctuation et espaces, borne la longueur', () => {
    expect(imageFilename('Évolution des effectifs (2024) !', 'png')).toBe(
      'evolution-des-effectifs-2024.png'
    );
    expect(imageFilename('   ', 'jpg')).toBe('graphique.jpg');
    expect(imageFilename('x'.repeat(100), 'png')).toBe(`${'x'.repeat(60)}.png`);
  });
});

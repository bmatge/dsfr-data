/**
 * Export d'image PNG/JPG depuis un apercu.
 *
 * jsdom n'implemente pas le contexte 2d : la composition est testee via un
 * canvas MOCKE injecte (createCanvas). Ce qui compte : la selection du bon
 * canvas, le fond blanc, le mapping format→MIME, les erreurs typees, le nom
 * de fichier.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  pickExportCanvas,
  imageFilename,
  canvasToDataUrl,
  ImageExportError,
  IMAGE_EXPORT_MESSAGES,
} from '../../packages/shared/src/ui/image-export';

/** Canvas dessinable mocke (jsdom rend getContext null). */
function mockCanvas(behavior?: { taint?: boolean }) {
  const ctx = {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(() => {
      if (behavior?.taint) throw new DOMException('tainted', 'SecurityError');
    }),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toDataURL: vi.fn((mime: string) => `data:${mime};base64,xxx`),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, ctx };
}

function domCanvas(width: number, height: number, hidden = false): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  // jsdom : offsetParent est null partout — on le simule.
  Object.defineProperty(el, 'offsetParent', { value: hidden ? null : document.body });
  return el;
}

describe('pickExportCanvas', () => {
  it('choisit le plus grand canvas visible', () => {
    const root = document.createElement('div');
    const small = domCanvas(100, 50);
    const big = domCanvas(800, 400);
    const invisible = domCanvas(2000, 2000, true);
    root.append(small, big, invisible);
    expect(pickExportCanvas(root)).toBe(big);
  });

  it("jette no-canvas quand l'apercu n'a pas de canvas (KPI, tableau…)", () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="kpi-card">42</div>';
    try {
      pickExportCanvas(root);
      throw new Error('aurait du jeter');
    } catch (err) {
      expect(err).toBeInstanceOf(ImageExportError);
      expect((err as ImageExportError).reason).toBe('no-canvas');
      expect(IMAGE_EXPORT_MESSAGES[(err as ImageExportError).reason]).toContain('graphiques');
    }
  });

  it('jette iframe-inaccessible sur une iframe sans document', () => {
    const iframe = document.createElement('iframe');
    Object.defineProperty(iframe, 'contentDocument', { value: null });
    try {
      pickExportCanvas(iframe);
      throw new Error('aurait du jeter');
    } catch (err) {
      expect((err as ImageExportError).reason).toBe('iframe-inaccessible');
    }
  });
});

describe('canvasToDataUrl', () => {
  it('compose sur fond blanc et mappe png/jpg vers le bon MIME', () => {
    const source = domCanvas(300, 200);
    const png = mockCanvas();
    expect(canvasToDataUrl(source, 'png', () => png.canvas)).toBe('data:image/png;base64,xxx');
    expect(png.ctx.fillStyle).toBe('#ffffff');
    expect(png.ctx.fillRect).toHaveBeenCalledWith(0, 0, 300, 200);
    expect((png.canvas as unknown as { width: number }).width).toBe(300);

    const jpg = mockCanvas();
    expect(canvasToDataUrl(source, 'jpg', () => jpg.canvas)).toBe('data:image/jpeg;base64,xxx');
  });

  it('traduit un SecurityError (canvas taint) en erreur typee tainted', () => {
    const source = domCanvas(10, 10);
    const out = mockCanvas({ taint: true });
    try {
      canvasToDataUrl(source, 'png', () => out.canvas);
      throw new Error('aurait du jeter');
    } catch (err) {
      expect((err as ImageExportError).reason).toBe('tainted');
    }
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

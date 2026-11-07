import { PixtiError } from '../errors.ts';
import { LIMITS } from '../limits.ts';

/**
 * Pixel mapping (v1): opaque RGB, 8 bits per channel, 3 payload bytes per pixel,
 * row-major, top-left first, zero padding after the data. No alpha, no palette,
 * no colour management: the PDF stores these bytes verbatim (no image filter),
 * so there is nothing lossy anywhere in the path.
 */
export const BYTES_PER_PIXEL = 3;

export interface Layout {
  width: number;
  height: number;
  /** width * height * 3 */
  rawBytes: number;
  /** bytes of real data (header + payload); the rest is zero padding */
  usedBytes: number;
}

/** Near-square layout. Integer-only arithmetic on bounded values. */
export function computeLayout(usedBytes: number): Layout {
  if (!Number.isSafeInteger(usedBytes) || usedBytes < 1) throw new PixtiError('INTERNAL', 'Invalid layout size.');
  const pixels = Math.ceil(usedBytes / BYTES_PER_PIXEL);
  const width = Math.max(1, Math.ceil(Math.sqrt(pixels)));
  const height = Math.ceil(pixels / width);
  if (width > LIMITS.MAX_IMAGE_DIMENSION || height > LIMITS.MAX_IMAGE_DIMENSION) {
    throw new PixtiError('LIMIT_EXCEEDED', 'A page would be too large. Lower the page size in advanced settings.');
  }
  return { width, height, rawBytes: width * height * BYTES_PER_PIXEL, usedBytes };
}

/** Container bytes -> pixel buffer (data followed by deterministic zero padding). */
export function containerToPixels(container: Uint8Array): { layout: Layout; pixels: Uint8Array } {
  const layout = computeLayout(container.length);
  const pixels = new Uint8Array(layout.rawBytes);
  pixels.set(container, 0);
  return { layout, pixels };
}

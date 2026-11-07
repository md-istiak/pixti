import { PixtiError } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { BYTES_PER_PIXEL } from './pixelEncoder.ts';

/** Pixel buffer -> container bytes (still including padding). Validates dimensions first. */
export function pixelsToContainer(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= LIMITS.MAX_IMAGE_DIMENSION;
  if (!ok(width) || !ok(height)) throw new PixtiError('MALFORMED_PDF', 'A page has invalid dimensions.');
  if (pixels.length !== width * height * BYTES_PER_PIXEL) {
    throw new PixtiError('MALFORMED_PDF', 'A page has the wrong amount of pixel data.');
  }
  return pixels;
}

/** Largest legitimate padding for a given width (see computeLayout). */
export function paddingIsCanonical(rawBytes: number, usedBytes: number, width: number): boolean {
  const pad = rawBytes - usedBytes;
  return pad >= 0 && pad < BYTES_PER_PIXEL * width;
}

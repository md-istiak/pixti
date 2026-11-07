export interface Thumbnail {
  width: number;
  height: number;
  /** opaque RGBA, ready for ImageData (display only; never used for data recovery) */
  rgba: Uint8ClampedArray;
}

/** Nearest-neighbour downsample of an RGB pixel buffer. */
export function makeThumbnail(pixels: Uint8Array, width: number, height: number, maxDim: number): Thumbnail {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const tw = Math.max(1, Math.round(width * scale));
  const th = Math.max(1, Math.round(height * scale));
  const rgba = new Uint8ClampedArray(tw * th * 4);
  for (let ty = 0; ty < th; ty++) {
    const sy = Math.min(height - 1, Math.floor((ty * height) / th));
    for (let tx = 0; tx < tw; tx++) {
      const sx = Math.min(width - 1, Math.floor((tx * width) / tw));
      const s = (sy * width + sx) * 3;
      const d = (ty * tw + tx) * 4;
      rgba[d] = pixels[s];
      rgba[d + 1] = pixels[s + 1];
      rgba[d + 2] = pixels[s + 2];
      rgba[d + 3] = 255;
    }
  }
  return { width: tw, height: th, rgba };
}

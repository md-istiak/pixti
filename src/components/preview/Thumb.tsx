import { useEffect, useRef } from 'react';
import type { Thumbnail } from '../../core/image/thumbnail.ts';

/** Draws a worker-made thumbnail. Display only: data recovery never reads from a canvas. */
export function Thumb({ thumb, label, className = '' }: { thumb: Thumbnail; label: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = thumb.width;
    canvas.height = thumb.height;
    const img = ctx.createImageData(thumb.width, thumb.height);
    img.data.set(thumb.rgba);
    ctx.putImageData(img, 0, 0);
  }, [thumb]);
  return <canvas ref={ref} role="img" aria-label={label} className={className} style={{ imageRendering: 'pixelated' }} />;
}

import { PixtiError } from '../errors.ts';
import { toBufferSource } from '../bytes.ts';
import { throwIfAborted } from '../progress.ts';

const CHUNK = 1024 * 1024;

export interface DeflateOptions {
  /** Stop and return null as soon as the output reaches this many bytes ("no benefit"). */
  maxOutput?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * zlib-wrapped DEFLATE via the browser's native CompressionStream (also in Node 18+).
 * Streaming gives real progress and lets us bail out early on incompressible data.
 */
export async function deflateZlib(data: Uint8Array, opts: DeflateOptions = {}): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') {
    throw new PixtiError('UNSUPPORTED_BROWSER', 'This browser does not support compression streams. Please update it.');
  }
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let outLen = 0;
  let exceeded = false;

  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      chunks.push(value);
      outLen += value.byteLength;
      if (opts.maxOutput !== undefined && outLen >= opts.maxOutput) {
        exceeded = true;
        await reader.cancel().catch(() => undefined);
        return;
      }
    }
  })();

  const feed = (async () => {
    try {
      for (let off = 0; off < data.length; off += CHUNK) {
        if (exceeded) break;
        throwIfAborted(opts.signal);
        await writer.write(toBufferSource(data.subarray(off, off + CHUNK)));
        opts.onProgress?.(Math.min(1, (off + CHUNK) / data.length));
      }
      if (!exceeded) await writer.close();
    } catch (e) {
      if (!exceeded) throw e;
    }
  })();

  try {
    await Promise.all([feed, pump]);
  } catch (e) {
    // Cancel the reader FIRST: it unblocks any write stuck on backpressure. Never await
    // writer.abort() - it waits for in-flight writes and could hang the job.
    void writer.abort(e).catch(() => undefined);
    await reader.cancel(e).catch(() => undefined);
    if (e instanceof PixtiError) throw e;
    throw new PixtiError('INTERNAL', 'Compression failed.');
  }
  if (exceeded) return null;

  const out = new Uint8Array(outLen);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

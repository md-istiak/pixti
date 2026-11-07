import { PixtiError } from '../errors.ts';
import { toBufferSource } from '../bytes.ts';
import { throwIfAborted } from '../progress.ts';

const CHUNK = 1024 * 1024;

const fail = (msg = 'The data could not be decompressed. It may be damaged.') =>
  new PixtiError('DECOMPRESS_FAILED', msg);

/**
 * Inflate into a buffer pre-allocated at the DECLARED size. Output beyond that size
 * aborts immediately (decompression-bomb guard) and a short result is also an error.
 * The declared size has already been bounded by LIMITS.MAX_INPUT_BYTES.
 */
export async function inflateZlibExact(
  data: Uint8Array,
  expectedSize: number,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new PixtiError('UNSUPPORTED_BROWSER', 'This browser does not support decompression streams. Please update it.');
  }
  const out = new Uint8Array(expectedSize);
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  let pos = 0;

  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (pos + value.byteLength > expectedSize) {
        await reader.cancel().catch(() => undefined);
        throw fail('The data expands beyond its declared size and was rejected.');
      }
      out.set(value, pos);
      pos += value.byteLength;
      if (expectedSize > 0) opts.onProgress?.(pos / expectedSize);
    }
  })();

  const feed = (async () => {
    for (let off = 0; off < data.length; off += CHUNK) {
      throwIfAborted(opts.signal);
      await writer.write(toBufferSource(data.subarray(off, off + CHUNK)));
    }
    await writer.close();
  })();

  try {
    await Promise.all([feed, pump]);
  } catch (e) {
    // Cancel the reader FIRST: it unblocks any write stuck on backpressure. Never await
    // writer.abort() - it waits for in-flight writes and could hang the job.
    void writer.abort(e).catch(() => undefined);
    await reader.cancel(e).catch(() => undefined);
    if (e instanceof PixtiError) throw e;
    throw fail();
  }
  if (pos !== expectedSize) throw fail('The decompressed data has the wrong length.');
  return out;
}

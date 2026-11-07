import { describe, expect, it } from 'vitest';
import { deflateZlib } from '../src/core/compression/compress.ts';
import { inflateZlibExact } from '../src/core/compression/decompress.ts';
import { bytesEqual } from '../src/core/bytes.ts';
import { randomData } from './helpers.ts';

describe('compression', () => {
  it('round-trips text and shrinks it', async () => {
    const text = new TextEncoder().encode('pixti '.repeat(50_000));
    const packed = await deflateZlib(text);
    expect(packed).not.toBeNull();
    expect(packed!.length).toBeLessThan(text.length / 20);
    const back = await inflateZlibExact(packed!, text.length);
    expect(bytesEqual(back, text)).toBe(true);
  });

  it('round-trips an empty input', async () => {
    const packed = await deflateZlib(new Uint8Array(0));
    expect(packed).not.toBeNull();
    const back = await inflateZlibExact(packed!, 0);
    expect(back.length).toBe(0);
  });

  it('reports "no benefit" for incompressible data instead of returning a bigger blob', async () => {
    const data = randomData(2 * 1024 * 1024);
    expect(await deflateZlib(data, { maxOutput: data.length })).toBeNull();
  });

  it('reports real, monotonic progress', async () => {
    const seen: number[] = [];
    await deflateZlib(randomData(3 * 1024 * 1024 + 5), { onProgress: (f) => seen.push(f) });
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen[seen.length - 1]).toBe(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });

  it('stops at once when the signal is aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(deflateZlib(randomData(5000), { signal: ac.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  describe('decompression safety', () => {
    it('rejects a bomb: output beyond the declared size aborts', async () => {
      const zeros = new Uint8Array(40 * 1024 * 1024);
      const packed = (await deflateZlib(zeros))!;
      expect(packed.length).toBeLessThan(100_000);
      await expect(inflateZlibExact(packed, 1000)).rejects.toMatchObject({ code: 'DECOMPRESS_FAILED' });
    });
    it('rejects a result shorter than declared', async () => {
      const packed = (await deflateZlib(new Uint8Array(1000)))!;
      await expect(inflateZlibExact(packed, 5000)).rejects.toMatchObject({ code: 'DECOMPRESS_FAILED' });
    });
    it('rejects truncated and garbage streams', async () => {
      const packed = (await deflateZlib(new TextEncoder().encode('hello hello hello hello'.repeat(100))))!;
      await expect(inflateZlibExact(packed.subarray(0, packed.length - 6), 2300)).rejects.toMatchObject({
        code: 'DECOMPRESS_FAILED',
      });
      await expect(inflateZlibExact(randomData(500), 1000)).rejects.toMatchObject({ code: 'DECOMPRESS_FAILED' });
    });
  });
});

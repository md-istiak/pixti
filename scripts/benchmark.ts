/**
 * Measures the real encode / decode pipeline in Node (same code the browser worker runs).
 * Run with:  npm run bench
 * Browser timings differ (Web Crypto and CompressionStream implementations vary), so treat
 * these as a relative guide and record results from your own devices in the README.
 */
import { randomBytes } from 'node:crypto';
import { decodeFiles } from '../src/features/decode/decodeService.ts';
import { DEFAULT_ENCODE_OPTIONS, encodeFile } from '../src/features/encode/encodeService.ts';
import { KiB, MiB } from '../src/core/limits.ts';

const sizes = [1 * KiB, 100 * KiB, 1 * MiB, 10 * MiB, 25 * MiB, 50 * MiB];
const PASSWORD = 'benchmark-password';
const rows: Record<string, string | number | boolean>[] = [];

for (const kind of ['random', 'compressible'] as const) {
  for (const size of sizes) {
    const data = kind === 'random' ? new Uint8Array(randomBytes(size)) : new Uint8Array(size).fill(0x41);
    const file = new File([data as unknown as BlobPart], 'bench.bin');

    const t0 = performance.now();
    const enc = await encodeFile(file, { ...DEFAULT_ENCODE_OPTIONS, encrypt: true, password: PASSWORD });
    const t1 = performance.now();
    const files = enc.documents.map((d) => new File([d.blob], d.fileName));
    const dec = await decodeFiles(files, PASSWORD);
    const t2 = performance.now();

    rows.push({
      data: kind,
      size: `${(size / MiB).toFixed(size < MiB ? 3 : 0)} MB`,
      'encode ms': Math.round(t1 - t0),
      'decode ms': Math.round(t2 - t1),
      pages: enc.stats.partCount,
      'pdf MB': +(enc.stats.documentBytes / MiB).toFixed(2),
      compression: enc.stats.compression,
      ok: dec.verified && dec.size === size,
    });
  }
}
console.table(rows);

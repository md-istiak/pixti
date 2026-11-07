import { describe, expect, it } from 'vitest';
import { decodeFiles, inspectFiles } from '../src/features/decode/decodeService.ts';
import { DEFAULT_ENCODE_OPTIONS, encodeFile } from '../src/features/encode/encodeService.ts';
import type { EncodeOptions } from '../src/features/encode/encodeService.ts';
import { buildPdf } from '../src/core/image/pdfWriter.ts';
import { computeLayout } from '../src/core/image/pixelEncoder.ts';
import { readPixtiPdf } from '../src/core/image/pdfReader.ts';
import { deflateZlib } from '../src/core/compression/compress.ts';
import { buildInner } from '../src/core/format/payload.ts';
import { serializeHeader } from '../src/core/format/header.ts';
import { COMPRESSION, FORMAT_VERSION, HEADER_SIZE, KDF, CIPHER } from '../src/core/format/version.ts';
import { sha256, sha256Hex } from '../src/core/integrity/hashing.ts';
import { randomBytes } from '../src/core/bytes.ts';
import { KiB, MiB } from '../src/core/limits.ts';
import { DECRYPT_FAILED_MESSAGE } from '../src/core/encryption/decrypt.ts';
import {
  FAST_KDF,
  asFile,
  docBytes,
  docFiles,
  fileOf,
  findAscii,
  forgePayload,
  patchHeader,
  pixelOffset,
  randomData,
  shuffle,
} from './helpers.ts';

const opts = (o: Partial<EncodeOptions> = {}): EncodeOptions => ({
  ...DEFAULT_ENCODE_OPTIONS,
  encrypt: false,
  kdfIterations: FAST_KDF,
  ...o,
});
const enc = (o: Partial<EncodeOptions> = {}) => opts({ encrypt: true, password: 'hunter2-hunter2', ...o });

function withPrefix(prefix: number[], total: number): Uint8Array {
  const d = randomData(total);
  d.set(prefix, 0);
  return d;
}
const text = (s: string) => new TextEncoder().encode(s);

const samples: [string, string, Uint8Array][] = [
  ['notes.txt', 'text/plain', text('Hello, pixti! ünïcödé ✓\n'.repeat(2000))],
  ['report.pdf', 'application/pdf', withPrefix([0x25, 0x50, 0x44, 0x46, 0x2d], 150_000)],
  ['picture.png', 'image/png', withPrefix([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 90_000)],
  ['photo.jpeg', 'image/jpeg', withPrefix([0xff, 0xd8, 0xff, 0xe0], 120_000)],
  ['song.mp3', 'audio/mpeg', withPrefix([0x49, 0x44, 0x33], 200_000)],
  ['clip.mp4', 'video/mp4', withPrefix([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70], 300_000)],
  ['bundle.zip', 'application/zip', withPrefix([0x50, 0x4b, 0x03, 0x04], 80_000)],
  ['tool.exe', 'application/x-msdownload', withPrefix([0x4d, 0x5a], 60_000)],
  ['random.bin', '', randomData(1_000_000)],
  ['zeros.dat', '', new Uint8Array(2_000_000)],
  ['empty.txt', 'text/plain', new Uint8Array(0)],
  ['one.bin', '', new Uint8Array([0xab])],
  ['two.bin', '', new Uint8Array([1, 2])],
  ['three.bin', '', new Uint8Array([1, 2, 3])],
  ['four.bin', '', new Uint8Array([1, 2, 3, 4])],
  ['weird name (1) – ü.tar.gz', 'application/gzip', randomData(5000)],
];

async function roundTrip(name: string, type: string, data: Uint8Array, o: EncodeOptions, password?: string) {
  const enc = await encodeFile(fileOf(name, data, type), o);
  const out = await decodeFiles(await docFiles(enc), password);
  const bytes = new Uint8Array(await out.blob.arrayBuffer());
  return { enc, out, bytes };
}

describe('round trip: every file type, unencrypted', () => {
  for (const [name, type, data] of samples) {
    it(`${name} (${data.length} bytes)`, async () => {
      const { enc, out, bytes } = await roundTrip(name, type, data, opts());
      expect(bytes.length).toBe(data.length);
      expect(await sha256Hex(bytes)).toBe(await sha256Hex(data));
      expect(Buffer.from(bytes).equals(Buffer.from(data))).toBe(true);
      expect(out.fileName).toBe(name.replace(/[\\/:*?"<>|]/g, '_'));
      expect(out.mime).toBe(type);
      expect(out.verified).toBe(true);
      expect(out.size).toBe(data.length);
      expect(enc.stats.originalSha256).toBe(out.sha256);
    });
  }
});

describe('round trip: encrypted', () => {
  for (const [name, type, data] of samples.filter((_, i) => [0, 1, 8, 9, 10, 11].includes(i))) {
    it(`${name} (${data.length} bytes)`, async () => {
      const { enc: e, out, bytes } = await roundTrip(name, type, data, enc(), 'hunter2-hunter2');
      expect(Buffer.from(bytes).equals(Buffer.from(data))).toBe(true);
      expect(out.encrypted).toBe(true);
      expect(e.stats.encrypted).toBe(true);
      expect(out.fileName).toBe(name);
    });
  }
});

describe('compression decision', () => {
  it('compresses compressible data and records it', async () => {
    const { enc: e, out } = await roundTrip('z.dat', '', new Uint8Array(1_000_000), opts());
    expect(e.stats.compression).toBe('deflate');
    expect(e.stats.storedSize).toBeLessThan(5000);
    expect(out.compression).toBe('deflate');
  });
  it('skips compression when it would not help', async () => {
    const { enc: e, out } = await roundTrip('r.bin', '', randomData(300_000), opts());
    expect(e.stats.compression).toBe('none');
    expect(out.compression).toBe('none');
  });
  it('honours compression: off', async () => {
    const { enc: e } = await roundTrip('z.dat', '', new Uint8Array(100_000), opts({ compression: 'off' }));
    expect(e.stats.compression).toBe('none');
  });
});

describe('passwords', () => {
  const data = randomData(20_000);
  it('wrong password is rejected with the standard message', async () => {
    const e = await encodeFile(fileOf('a.bin', data), enc());
    await expect(decodeFiles(await docFiles(e), 'nope')).rejects.toMatchObject({
      code: 'DECRYPT_FAILED',
      message: DECRYPT_FAILED_MESSAGE,
    });
  });
  it('missing password asks for one, inspect says so', async () => {
    const e = await encodeFile(fileOf('a.bin', data), enc());
    const files = await docFiles(e);
    await expect(decodeFiles(files, undefined)).rejects.toMatchObject({ code: 'PASSWORD_REQUIRED' });
    const r = await inspectFiles(files);
    expect(r.needsPassword).toBe(true);
    expect(r.canDecode).toBe(true);
  });
  it('encoding with an empty password is refused', async () => {
    await expect(encodeFile(fileOf('a.bin', data), enc({ password: '' }))).rejects.toMatchObject({ code: 'EMPTY_PASSWORD' });
  });
  it('an unencrypted set ignores a supplied password', async () => {
    const e = await encodeFile(fileOf('a.bin', data), opts());
    const out = await decodeFiles(await docFiles(e), 'whatever');
    expect(out.size).toBe(data.length);
    expect((await inspectFiles(await docFiles(e))).needsPassword).toBe(false);
  });
  it('the filename is not visible anywhere in an encrypted document', async () => {
    const e = await encodeFile(fileOf('secret-plans-2026.txt', text('x'.repeat(5000)), 'text/plain'), enc());
    const bytes = await docBytes(e);
    expect(findAscii(bytes, 'secret-plans')).toBe(-1);
    expect(findAscii(bytes, 'text/plain')).toBe(-1);
  });
  it('two encodings of the same file use different salts, nonces and ciphertext', async () => {
    const a = await docBytes(await encodeFile(fileOf('a.bin', data), enc()));
    const b = await docBytes(await encodeFile(fileOf('a.bin', data), enc()));
    const ha = readPixtiPdf(a)[0].pixels.slice(0, HEADER_SIZE);
    const hb = readPixtiPdf(b)[0].pixels.slice(0, HEADER_SIZE);
    expect(Buffer.from(ha.subarray(56, 72)).equals(Buffer.from(hb.subarray(56, 72)))).toBe(false); // salt
    expect(Buffer.from(ha.subarray(72, 84)).equals(Buffer.from(hb.subarray(72, 84)))).toBe(false); // nonce
    expect(Buffer.from(ha.subarray(84, 116)).equals(Buffer.from(hb.subarray(84, 116)))).toBe(false); // part hash
  });
});

describe('multiple pages and files', () => {
  const data = randomData(700_000);
  const small = 64 * KiB;

  it('one PDF with many pages round-trips', async () => {
    const e = await encodeFile(fileOf('big.bin', data), opts({ maxPartBytes: small }));
    expect(e.documents.length).toBe(1);
    expect(e.stats.partCount).toBeGreaterThan(5);
    expect(e.stats.pages.length).toBe(e.stats.partCount);
    const out = await decodeFiles(await docFiles(e), undefined);
    expect(out.sha256).toBe(await sha256Hex(data));
    expect(out.partCount).toBe(e.stats.partCount);
  });

  it('splits into multiple documents with sequential names and part ranges', async () => {
    const big = randomData(3 * MiB);
    const e = await encodeFile(fileOf('b.bin', big), opts({ maxPartBytes: 512 * KiB, maxDocumentBytes: MiB }));
    expect(e.documents.length).toBeGreaterThan(1);
    expect(e.documents[0].fileName).toMatch(/^pixti_[0-9a-f]{8}_file_001_of_00\d\.pdf$/);
    let next = 1;
    for (const d of e.documents) {
      expect(d.firstPart).toBe(next);
      next = d.lastPart + 1;
    }
    expect(next - 1).toBe(e.stats.partCount);
    const out = await decodeFiles(shuffle(await docFiles(e)), undefined);
    expect(out.sha256).toBe(await sha256Hex(big));
  });

  it('encrypted multi-page round trip', async () => {
    const e = await encodeFile(fileOf('big.bin', data), enc({ maxPartBytes: small }));
    const out = await decodeFiles(shuffle(await docFiles(e)), 'hunter2-hunter2');
    expect(out.sha256).toBe(await sha256Hex(data));
  });

  it('missing files are detected and named, never silently decoded', async () => {
    const big = randomData(3 * MiB);
    const e = await encodeFile(fileOf('b.bin', big), opts({ maxPartBytes: 512 * KiB, maxDocumentBytes: MiB }));
    const files = await docFiles(e);
    const partial = files.slice(1);
    const rep = await inspectFiles(partial);
    expect(rep.canDecode).toBe(false);
    expect(rep.set!.missing).toEqual(Array.from({ length: e.documents[0].lastPart }, (_, i) => i + 1));
    await expect(decodeFiles(partial, undefined)).rejects.toMatchObject({ code: 'MISSING_PARTS' });
  });

  it('identical duplicates are reported but harmless', async () => {
    const e = await encodeFile(fileOf('big.bin', data), opts({ maxPartBytes: small }));
    const files = await docFiles(e);
    const rep = await inspectFiles([...files, ...files]);
    expect(rep.canDecode).toBe(true);
    expect(rep.set!.duplicates.length).toBe(e.stats.partCount);
    const out = await decodeFiles([...files, ...files], undefined);
    expect(out.sha256).toBe(await sha256Hex(data));
  });

  it('pages from different encodings are refused', async () => {
    const a = await encodeFile(fileOf('a.bin', randomData(1000)), opts());
    const b = await encodeFile(fileOf('b.bin', randomData(1000)), opts());
    const files = [...(await docFiles(a)), ...(await docFiles(b))];
    await expect(decodeFiles(files, undefined)).rejects.toMatchObject({ code: 'MIXED_SESSIONS' });
    expect((await inspectFiles(files)).sessions.length).toBe(2);
  });
});

describe('corruption and tampering', () => {
  const data = randomData(400_000);

  it('a flipped bit inside a page is caught by the part checksum', async () => {
    const e = await encodeFile(fileOf('a.bin', data), opts({ maxPartBytes: 128 * KiB }));
    const pdf = await docBytes(e);
    pdf[pixelOffset(pdf, 1) + HEADER_SIZE + 77] ^= 1;
    const files = [asFile(pdf)];
    const rep = await inspectFiles(files);
    expect(rep.set!.corrupt).toEqual([2]);
    expect(rep.files[0].pages[1].status).toBe('corrupt');
    await expect(decodeFiles(files, undefined)).rejects.toMatchObject({ code: 'CORRUPT_PART' });
  });

  it('a damaged header makes the page unreadable and the set incomplete', async () => {
    const e = await encodeFile(fileOf('a.bin', data), opts({ maxPartBytes: 128 * KiB }));
    const pdf = await docBytes(e);
    pdf[pixelOffset(pdf, 0) + 20] ^= 0xff;
    const rep = await inspectFiles([asFile(pdf)]);
    expect(rep.files[0].pages[0].status).toBe('invalid');
    expect(rep.set!.missing).toEqual([1]);
    await expect(decodeFiles([asFile(pdf)], undefined)).rejects.toMatchObject({ code: 'MISSING_PARTS' });
  });

  it('tampered ciphertext with a re-signed part is still rejected by AES-GCM', async () => {
    const e = await encodeFile(fileOf('a.bin', randomData(5000)), enc());
    const pdf = await docBytes(e);
    await forgePayload(pdf, 0, 100);
    await expect(decodeFiles([asFile(pdf)], 'hunter2-hunter2')).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
  });

  it('changing the authenticated KDF iteration count is rejected', async () => {
    const e = await encodeFile(fileOf('a.bin', randomData(5000)), enc());
    const pdf = await docBytes(e);
    patchHeader(pdf, 0, (v) => v.setUint32(52, FAST_KDF + 1));
    await expect(decodeFiles([asFile(pdf)], 'hunter2-hunter2')).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
  });

  it('an unencrypted forgery with valid checksums is caught by the final SHA-256 gate', async () => {
    const e = await encodeFile(fileOf('a.bin', randomData(5000)), opts({ compression: 'off' }));
    const pdf = await docBytes(e);
    await forgePayload(pdf, 0, 46 + 'a.bin'.length + 100);
    await expect(decodeFiles([asFile(pdf)], undefined)).rejects.toMatchObject({ code: 'HASH_MISMATCH' });
  });

  it('an unsupported format version is reported clearly', async () => {
    const e = await encodeFile(fileOf('a.bin', randomData(500)), opts());
    const pdf = await docBytes(e);
    patchHeader(pdf, 0, (v) => v.setUint16(8, 7));
    const rep = await inspectFiles([asFile(pdf)]);
    expect(rep.files[0].pages[0].error).toMatch(/version 7/);
    await expect(decodeFiles([asFile(pdf)], undefined)).rejects.toBeInstanceOf(Error);
  });

  it('malicious header values never cause allocations or crashes', async () => {
    const e = await encodeFile(fileOf('a.bin', randomData(500)), opts());
    for (const edit of [
      (v: DataView) => v.setUint32(44, 0xffffffff), // totalLen
      (v: DataView) => v.setUint32(40, 0xffffffff), // partLen
      (v: DataView) => v.setUint32(36, 0xffffffff), // partCount
      (v: DataView) => v.setUint32(40, 400_000), // partLen larger than the page holds
    ]) {
      const pdf = await docBytes(e);
      patchHeader(pdf, 0, edit);
      const rep = await inspectFiles([asFile(pdf)]);
      expect(rep.files[0].pages[0].status).toBe('invalid');
      await expect(decodeFiles([asFile(pdf)], undefined)).rejects.toBeInstanceOf(Error);
    }
  });

  it('a decompression bomb inside a validly signed container is stopped', async () => {
    const zeros = new Uint8Array(30 * MiB);
    const packed = (await deflateZlib(zeros))!;
    const inner = buildInner({
      filename: 'bomb.bin',
      mime: '',
      originalSize: 200_000, // lies: really 30 MiB
      originalSha256: randomBytes(32),
      compression: COMPRESSION.DEFLATE_ZLIB,
      data: packed,
    });
    const header = serializeHeader({
      version: FORMAT_VERSION,
      flags: 0,
      sessionId: randomBytes(16),
      partIndex: 1,
      partCount: 1,
      partLen: inner.length,
      totalLen: inner.length,
      kdfId: KDF.NONE,
      cipherId: CIPHER.NONE,
      kdfIterations: 0,
      salt: new Uint8Array(16),
      nonce: new Uint8Array(12),
      partSha256: await sha256(inner),
    });
    const pdf = buildPdf([{ layout: computeLayout(HEADER_SIZE + inner.length), segments: [header, inner], label: 'Part 1 of 1' }]);
    await expect(decodeFiles([asFile(pdf)], undefined)).rejects.toMatchObject({ code: 'DECOMPRESS_FAILED' });
  });
});

describe('input handling', () => {
  it('rejects non-pixti files with a clear error', async () => {
    const f = fileOf('doc.pdf', text('%PDF-1.4 not ours'), 'application/pdf');
    const rep = await inspectFiles([f]);
    expect(rep.canDecode).toBe(false);
    expect(rep.files[0].error).toBeTruthy();
    await expect(decodeFiles([f], undefined)).rejects.toMatchObject({ code: 'NOT_PIXTI_DOCUMENT' });
  });
  it('requires at least one file', async () => {
    await expect(decodeFiles([], undefined)).rejects.toMatchObject({ code: 'NO_FILES' });
  });
  it('refuses oversized input before reading it', async () => {
    const huge = { name: 'huge.bin', size: 70 * MiB, arrayBuffer: async () => { throw new Error('should not be read'); } };
    await expect(encodeFile(huge, opts())).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });
  it('validates options', async () => {
    const f = fileOf('a.bin', randomData(10));
    await expect(encodeFile(f, opts({ maxPartBytes: 5 }))).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    await expect(encodeFile(f, opts({ maxDocumentBytes: 10 }))).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    await expect(encodeFile(f, enc({ kdfIterations: 5 }))).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
  });
  it('sanitises hostile embedded names on decode', async () => {
    const e = await encodeFile(fileOf('../../evil.sh', randomData(10), 'text/html; charset=x'), opts());
    const out = await decodeFiles(await docFiles(e), undefined);
    expect(out.fileName).toBe('.._.._evil.sh');
    expect(out.mime).toBe('');
  });
});

describe('progress and cancellation', () => {
  it('reports the real stages in order', async () => {
    const seen: string[] = [];
    await encodeFile(fileOf('a.bin', new Uint8Array(500_000)), enc(), {
      onProgress: (s) => {
        if (seen[seen.length - 1] !== s) seen.push(s);
      },
    });
    expect(seen).toEqual(['read', 'hash', 'compress', 'encrypt', 'build', 'verify']);
  });
  it('decode reports its stages', async () => {
    const e = await encodeFile(fileOf('a.bin', new Uint8Array(500_000)), enc());
    const seen: string[] = [];
    await decodeFiles(await docFiles(e), 'hunter2-hunter2', {
      onProgress: (s) => {
        if (seen[seen.length - 1] !== s) seen.push(s);
      },
    });
    expect(seen).toEqual(['read', 'assemble', 'decrypt', 'decompress', 'verify']);
  });
  it('encode can be aborted at a safe boundary', async () => {
    const ac = new AbortController();
    const p = encodeFile(fileOf('a.bin', randomData(2 * MiB)), opts(), {
      signal: ac.signal,
      onProgress: (s) => {
        if (s === 'hash') ac.abort();
      },
    });
    await expect(p).rejects.toMatchObject({ code: 'CANCELLED' });
  });
  it('decode can be aborted', async () => {
    const e = await encodeFile(fileOf('a.bin', randomData(10_000)), opts());
    const ac = new AbortController();
    ac.abort();
    await expect(decodeFiles(await docFiles(e), undefined, { signal: ac.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});

describe('result metadata', () => {
  it('describes sizes, pages and preview truthfully', async () => {
    const data = randomData(200_000);
    const e = await encodeFile(fileOf('a.bin', data), opts({ maxPartBytes: 64 * KiB }));
    expect(e.stats.originalSize).toBe(200_000);
    expect(e.stats.partCount).toBe(4);
    expect(e.stats.pages.length).toBe(4);
    expect(e.documents[0].byteLength).toBe(e.documents[0].blob.size);
    expect(e.preview.rgba.length).toBe(e.preview.width * e.preview.height * 4);
    expect(e.stats.payloadSize).toBeGreaterThan(200_000);
    expect(e.stats.documentBytes).toBe(e.documents.reduce((a, d) => a + d.byteLength, 0));
  });
});

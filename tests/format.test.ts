import { describe, expect, it } from 'vitest';
import { crc32 } from '../src/core/integrity/checksums.ts';
import { sha256Hex } from '../src/core/integrity/hashing.ts';
import { randomBytes, toHex } from '../src/core/bytes.ts';
import { buildAad, parseHeader, serializeHeader } from '../src/core/format/header.ts';
import type { PartHeader } from '../src/core/format/header.ts';
import { buildInner, parseInner } from '../src/core/format/payload.ts';
import { sanitizeFilename, sanitizeMime } from '../src/core/format/validation.ts';
import {
  CIPHER,
  COMPRESSION,
  FLAG_ENCRYPTED,
  HEADER_SIZE,
  KDF,
} from '../src/core/format/version.ts';
import { LIMITS } from '../src/core/limits.ts';

function header(over: Partial<PartHeader> = {}): PartHeader {
  return {
    version: 1,
    flags: 0,
    sessionId: randomBytes(16),
    partIndex: 1,
    partCount: 1,
    partLen: 100,
    totalLen: 100,
    kdfId: KDF.NONE,
    cipherId: CIPHER.NONE,
    kdfIterations: 0,
    salt: new Uint8Array(16),
    nonce: new Uint8Array(12),
    partSha256: randomBytes(32),
    ...over,
  };
}
const encHeader = (over: Partial<PartHeader> = {}) =>
  header({
    flags: FLAG_ENCRYPTED,
    kdfId: KDF.PBKDF2_SHA256,
    cipherId: CIPHER.AES_256_GCM,
    kdfIterations: 600_000,
    salt: randomBytes(16),
    nonce: randomBytes(12),
    totalLen: 200,
    partLen: 200,
    ...over,
  });

/** Patch a header field and re-sign the CRC, so only the semantic check can reject it. */
function patched(h: PartHeader, edit: (v: DataView) => void): Uint8Array {
  const raw = serializeHeader(h);
  const v = new DataView(raw.buffer);
  edit(v);
  v.setUint32(116, crc32(raw, 0, 116));
  return raw;
}

describe('crc32 / sha256 reference vectors', () => {
  it('crc32("123456789") = 0xCBF43926', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('sha256("abc")', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('header serialization', () => {
  it('has the documented fixed size and round-trips (plain)', () => {
    const h = header();
    const bytes = serializeHeader(h);
    expect(bytes.length).toBe(HEADER_SIZE);
    const p = parseHeader(bytes);
    expect(toHex(p.sessionId)).toBe(toHex(h.sessionId));
    expect(p.partIndex).toBe(1);
    expect(p.partLen).toBe(100);
    expect(toHex(p.partSha256)).toBe(toHex(h.partSha256));
  });

  it('round-trips an encrypted header', () => {
    const h = encHeader({ partCount: 3, partIndex: 2 });
    const p = parseHeader(serializeHeader(h));
    expect(p.flags).toBe(FLAG_ENCRYPTED);
    expect(p.kdfIterations).toBe(600_000);
    expect(toHex(p.salt)).toBe(toHex(h.salt));
    expect(toHex(p.nonce)).toBe(toHex(h.nonce));
  });

  it('rejects wrong magic and short input as "not pixti"', () => {
    const b = serializeHeader(header());
    b[0] ^= 1;
    expect(() => parseHeader(b)).toThrow(/does not contain pixti/);
    expect(() => parseHeader(new Uint8Array(3))).toThrow(/does not contain pixti/);
  });

  it('rejects unsupported versions with a useful message (before CRC)', () => {
    const b = serializeHeader(header());
    new DataView(b.buffer).setUint16(8, 2);
    expect(() => parseHeader(b)).toThrow(/version 2/);
  });

  it('rejects unknown flag bits', () => {
    expect(() => parseHeader(patched(header(), (v) => v.setUint16(10, 0x8000)))).toThrow(/features/);
  });

  it('detects accidental header damage via CRC', () => {
    const b = serializeHeader(header());
    b[20] ^= 0x40;
    expect(() => parseHeader(b)).toThrow(/damaged/);
  });

  const cases: [string, (v: DataView) => void][] = [
    ['partCount 0', (v) => v.setUint32(36, 0)],
    ['partCount above limit', (v) => v.setUint32(36, LIMITS.MAX_PART_COUNT + 1)],
    ['partIndex above count', (v) => v.setUint32(32, 5)],
    ['partLen 0', (v) => v.setUint32(40, 0)],
    ['partLen above limit', (v) => v.setUint32(40, 0xffffffff)],
    ['totalLen huge', (v) => v.setUint32(44, 0xffffffff)],
    ['totalLen smaller than partLen', (v) => v.setUint32(44, 50)],
    ['kdf set on a plain header', (v) => v.setUint8(48, 1)],
    ['non-zero reserved', (v) => v.setUint16(50, 1)],
    ['iterations on a plain header', (v) => v.setUint32(52, 600000)],
  ];
  for (const [name, edit] of cases) {
    it(`rejects malicious field: ${name}`, () => {
      expect(() => parseHeader(patched(header(), edit))).toThrow();
    });
  }

  it('bounds KDF iterations on encrypted headers (CPU-exhaustion guard)', () => {
    expect(() => parseHeader(patched(encHeader(), (v) => v.setUint32(52, 50_000_000)))).toThrow(/outside the accepted range/);
    expect(() => parseHeader(patched(encHeader(), (v) => v.setUint32(52, 10)))).toThrow(/outside the accepted range/);
  });

  it('serializeHeader refuses to write what the parser would refuse', () => {
    expect(() => serializeHeader(header({ partIndex: 9, partCount: 2 }))).toThrow();
  });

  it('AAD changes when any authenticated field changes (incl. iterations)', () => {
    const h = encHeader();
    const a = toHex(buildAad(h));
    expect(toHex(buildAad({ ...h, kdfIterations: h.kdfIterations + 1 }))).not.toBe(a);
    expect(toHex(buildAad({ ...h, partCount: h.partCount + 1 }))).not.toBe(a);
    expect(toHex(buildAad({ ...h, totalLen: h.totalLen + 1 }))).not.toBe(a);
    expect(toHex(buildAad({ ...h, salt: randomBytes(16) }))).not.toBe(a);
  });
});

describe('inner envelope', () => {
  const sha = randomBytes(32);
  const base = {
    filename: 'report ✓.pdf',
    mime: 'application/pdf',
    originalSize: 5,
    originalSha256: sha,
    compression: COMPRESSION.NONE,
    data: new Uint8Array([1, 2, 3, 4, 5]),
  };

  it('preserves filename (unicode), MIME, size, digest and data', () => {
    const e = parseInner(buildInner(base));
    expect(e.filename).toBe('report ✓.pdf');
    expect(e.mime).toBe('application/pdf');
    expect(e.originalSize).toBe(5);
    expect(toHex(e.originalSha256)).toBe(toHex(sha));
    expect(Array.from(e.data)).toEqual([1, 2, 3, 4, 5]);
  });

  it('supports an empty file', () => {
    const e = parseInner(buildInner({ ...base, originalSize: 0, data: new Uint8Array(0) }));
    expect(e.data.length).toBe(0);
  });

  it('rejects inconsistent lengths and fields', () => {
    const good = buildInner(base);
    expect(() => parseInner(good.subarray(0, good.length - 1))).toThrow();
    expect(() => parseInner(good.subarray(0, 10))).toThrow();
    const wrongSize = buildInner({ ...base, originalSize: 6 });
    expect(() => parseInner(wrongSize)).toThrow(/Size fields disagree/);
    const bomb = buildInner({ ...base, compression: COMPRESSION.DEFLATE_ZLIB, originalSize: 3 });
    expect(() => parseInner(bomb)).toThrow(/Compression fields disagree/);
  });

  it('rejects a declared original size above the supported limit', () => {
    const b = buildInner(base);
    new DataView(b.buffer).setUint32(6, LIMITS.MAX_INPUT_BYTES + 1);
    expect(() => parseInner(b)).toThrow(/above the supported limit/);
  });

  it('rejects invalid UTF-8 names and unknown versions / compression ids', () => {
    const b = buildInner(base);
    b[46] = 0xff;
    expect(() => parseInner(b)).toThrow(/not valid text/);
    const v = buildInner(base);
    v[0] = 9;
    expect(() => parseInner(v)).toThrow(/version/);
    const c = buildInner(base);
    c[1] = 7;
    expect(() => parseInner(c)).toThrow(/compression/i);
  });
});

describe('sanitizing', () => {
  it('neutralises path tricks and control characters', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(sanitizeFilename('a\\b:c*?.txt')).toBe('a_b_c__.txt');
    expect(sanitizeFilename('bad\u0000name\n.txt')).toBe('bad_name_.txt');
  });
  it('never returns an empty or dot-only name', () => {
    expect(sanitizeFilename('')).toBe('recovered-file');
    expect(sanitizeFilename('..')).toBe('recovered-file');
    expect(sanitizeFilename('   ')).toBe('recovered-file');
  });
  it('keeps the extension when shortening very long names', () => {
    const n = sanitizeFilename('é'.repeat(400) + '.mp4');
    expect(new TextEncoder().encode(n).length).toBeLessThanOrEqual(255);
    expect(n.endsWith('.mp4')).toBe(true);
  });
  it('accepts valid MIME types only', () => {
    expect(sanitizeMime('Image/PNG')).toBe('image/png');
    expect(sanitizeMime('text/html; charset=utf-8')).toBe('');
    expect(sanitizeMime('nonsense')).toBe('');
  });
});

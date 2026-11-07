import { describe, expect, it } from 'vitest';
import { randomBytes, toHex } from '../src/core/bytes.ts';
import { groupForDocuments, planParts, splitPayload } from '../src/core/splitting/split.ts';
import { mergeParts } from '../src/core/splitting/merge.ts';
import { analyzeParts, selectParts } from '../src/core/splitting/partMetadata.ts';
import type { PartLike } from '../src/core/splitting/partMetadata.ts';
import { CIPHER, FLAG_ENCRYPTED, KDF } from '../src/core/format/version.ts';
import type { PartHeader } from '../src/core/format/header.ts';
import { LIMITS } from '../src/core/limits.ts';
import { randomData, shuffle } from './helpers.ts';

describe('planParts / splitPayload / mergeParts', () => {
  it('splits into balanced parts that cover every byte', () => {
    for (const [total, max] of [
      [1, 65536],
      [65536, 65536],
      [65537, 65536],
      [1_000_000, 65536],
      [10 * 1024 * 1024, 4 * 1024 * 1024],
    ]) {
      const lens = planParts(total, max);
      expect(lens.reduce((a, b) => a + b, 0)).toBe(total);
      expect(Math.max(...lens)).toBeLessThanOrEqual(max);
      expect(Math.max(...lens) - Math.min(...lens)).toBeLessThanOrEqual(1);
      expect(lens.length).toBe(Math.ceil(total / max));
    }
  });

  it('rejects out-of-range page sizes and absurd page counts', () => {
    expect(() => planParts(100, 10)).toThrow(/page size/);
    expect(() => planParts(100, LIMITS.MAX_PART_BYTES + 1)).toThrow(/page size/);
    expect(() => planParts(LIMITS.MIN_PART_BYTES * (LIMITS.MAX_PART_COUNT + 1), LIMITS.MIN_PART_BYTES)).toThrow(/too many pages/);
    expect(() => planParts(0, 65536)).toThrow();
  });

  it('split then merge returns the original bytes', () => {
    const data = randomData(300_001);
    const lens = planParts(data.length, 65536);
    const parts = splitPayload(data, lens);
    expect(parts.length).toBe(5);
    expect(Buffer.from(mergeParts(parts, data.length)).equals(Buffer.from(data))).toBe(true);
  });

  it('merge refuses a total that does not match the header', () => {
    expect(() => mergeParts([new Uint8Array(10), new Uint8Array(10)], 21)).toThrow(/do not add up/);
  });
});

describe('groupForDocuments', () => {
  it('one document when unlimited', () => {
    expect(groupForDocuments([5, 5, 5], null)).toEqual([[0, 1, 2]]);
  });
  it('greedy grouping, at least one part per document', () => {
    expect(groupForDocuments([5, 5, 5, 5, 5], 10)).toEqual([[0, 1], [2, 3], [4]]);
    expect(groupForDocuments([50, 50], 10)).toEqual([[0], [1]]);
  });
});

function headers(count: number, over: Partial<PartHeader> = {}): PartHeader[] {
  const sessionId = randomBytes(16);
  const salt = new Uint8Array(16);
  const nonce = new Uint8Array(12);
  return Array.from({ length: count }, (_, i) => ({
    version: 1,
    flags: 0,
    sessionId,
    partIndex: i + 1,
    partCount: count,
    partLen: 10,
    totalLen: 10 * count,
    kdfId: KDF.NONE,
    cipherId: CIPHER.NONE,
    kdfIterations: 0,
    salt,
    nonce,
    partSha256: randomBytes(32),
    ...over,
  }));
}
const ok = (h: PartHeader): PartLike => ({ header: h, hashOk: true });

describe('analyzeParts', () => {
  it('accepts a complete set in any order', () => {
    const parts = shuffle(headers(6).map(ok));
    const a = analyzeParts(parts);
    expect(a.ok).toBe(true);
    expect(a.status!.received).toEqual([1, 2, 3, 4, 5, 6]);
    expect(selectParts(parts).map((p) => p.header.partIndex)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('reports exactly which pages are missing', () => {
    const hs = headers(5);
    const a = analyzeParts([hs[0], hs[2], hs[4]].map(ok));
    expect(a.ok).toBe(false);
    expect(a.status!.missing).toEqual([2, 4]);
    expect(a.issues[0].code).toBe('MISSING_PARTS');
    expect(a.issues[0].message).toMatch(/pages 2, 4 of 5/);
  });

  it('tolerates identical duplicates (warning) but names them', () => {
    const hs = headers(3);
    const a = analyzeParts([...hs, hs[1]].map(ok));
    expect(a.ok).toBe(true);
    expect(a.status!.duplicates).toEqual([2]);
    expect(a.issues.some((i) => i.code === 'DUPLICATE_PARTS' && i.severity === 'warning')).toBe(true);
  });

  it('rejects conflicting copies of the same page', () => {
    const hs = headers(3);
    const evil = { ...hs[1], partSha256: randomBytes(32) };
    const a = analyzeParts([...hs, evil].map(ok));
    expect(a.ok).toBe(false);
    expect(a.status!.conflicting).toEqual([2]);
  });

  it('treats a damaged page as not usable, even if listed', () => {
    const hs = headers(3);
    const parts: PartLike[] = [ok(hs[0]), { header: hs[1], hashOk: false }, ok(hs[2])];
    const a = analyzeParts(parts);
    expect(a.ok).toBe(false);
    expect(a.status!.corrupt).toEqual([2]);
    expect(a.status!.missing).toEqual([]);
  });

  it('an intact second copy rescues a damaged page', () => {
    const hs = headers(3);
    const a = analyzeParts([ok(hs[0]), { header: hs[1], hashOk: false }, ok(hs[1]), ok(hs[2])]);
    expect(a.ok).toBe(true);
  });

  it('refuses pages from different encodings', () => {
    const a = analyzeParts([...headers(2), ...headers(2)].map(ok));
    expect(a.ok).toBe(false);
    expect(a.issues[0].code).toBe('MIXED_SESSIONS');
    expect(a.sessions.length).toBe(2);
    expect(a.status).toBeNull();
  });

  it('refuses pages whose shared settings disagree', () => {
    const hs = headers(3);
    const odd = { ...hs[2], totalLen: hs[2].totalLen + 1 };
    const a = analyzeParts([hs[0], hs[1], odd].map(ok));
    expect(a.ok).toBe(false);
    expect(a.issues.some((i) => i.code === 'CONFLICTING_PARTS')).toBe(true);
  });

  it('reports encryption from the flags and handles no pages', () => {
    const hs = headers(1, { flags: FLAG_ENCRYPTED, kdfId: KDF.PBKDF2_SHA256, cipherId: CIPHER.AES_256_GCM, kdfIterations: 600000 });
    expect(analyzeParts(hs.map(ok)).status!.encrypted).toBe(true);
    expect(analyzeParts([]).ok).toBe(false);
  });

  it('session ids are surfaced as hex', () => {
    const hs = headers(1);
    expect(analyzeParts(hs.map(ok)).status!.sessionId).toBe(toHex(hs[0].sessionId));
  });
});

import { PixtiError } from '../errors.ts';
import { LIMITS } from '../limits.ts';

/**
 * Balanced split: part lengths differ by at most one byte. Deterministic.
 * Returns the length of every part (all >= 1).
 */
export function planParts(totalLen: number, maxPartBytes: number): number[] {
  if (!Number.isInteger(totalLen) || totalLen < 1) throw new PixtiError('INTERNAL', 'Nothing to split.');
  if (!Number.isInteger(maxPartBytes) || maxPartBytes < LIMITS.MIN_PART_BYTES || maxPartBytes > LIMITS.MAX_PART_BYTES) {
    throw new PixtiError('INVALID_OPTIONS', 'The page size is outside the supported range.');
  }
  const count = Math.ceil(totalLen / maxPartBytes);
  if (count > LIMITS.MAX_PART_COUNT) {
    throw new PixtiError('LIMIT_EXCEEDED', 'This file would need too many pages. Increase the page size.');
  }
  const base = Math.floor(totalLen / count);
  const rem = totalLen % count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Zero-copy views of the payload, in order. */
export function splitPayload(payload: Uint8Array, lengths: number[]): Uint8Array[] {
  const out: Uint8Array[] = [];
  let pos = 0;
  for (const len of lengths) {
    out.push(payload.subarray(pos, pos + len));
    pos += len;
  }
  if (pos !== payload.length) throw new PixtiError('INTERNAL', 'Split lengths do not cover the payload.');
  return out;
}

/**
 * Group consecutive parts into output documents no larger than maxDocBytes
 * (always at least one part per document). null = everything in one document.
 */
export function groupForDocuments(approxPartBytes: number[], maxDocBytes: number | null): number[][] {
  const all = approxPartBytes.map((_, i) => i);
  if (maxDocBytes === null) return [all];
  const groups: number[][] = [];
  let cur: number[] = [];
  let size = 0;
  for (const i of all) {
    const b = approxPartBytes[i];
    if (cur.length > 0 && size + b > maxDocBytes) {
      groups.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(i);
    size += b;
  }
  if (cur.length > 0) groups.push(cur);
  return groups;
}

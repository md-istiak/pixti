import { PixtiError } from '../errors.ts';

/** Concatenate parts that are already in index order. Total must match the header's totalLen. */
export function mergeParts(ordered: Uint8Array[], totalLen: number): Uint8Array {
  let sum = 0;
  for (const p of ordered) sum += p.length;
  if (sum !== totalLen) {
    throw new PixtiError('CORRUPT_PART', 'The page lengths do not add up to the expected size.');
  }
  if (ordered.length === 1) return ordered[0];
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of ordered) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

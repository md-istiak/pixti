export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function isAllZero(b: Uint8Array, start = 0, end = b.length): boolean {
  for (let i = start; i < end; i++) if (b[i] !== 0) return false;
  return true;
}

export function toHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

export function fromHex(s: string): Uint8Array {
  if (s.length % 2 !== 0 || /[^0-9a-f]/i.test(s)) throw new Error('invalid hex');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

/**
 * TypeScript 5.7+ distinguishes Uint8Array<ArrayBuffer> from Uint8Array<ArrayBufferLike>
 * and its DOM typings reject the latter. These two helpers keep the rest of the code
 * free of version-specific casts. Runtime behaviour is identical.
 */
export function toBufferSource(b: Uint8Array): BufferSource {
  return b as unknown as BufferSource;
}
export function toBlobPart(b: Uint8Array): BlobPart {
  return b as unknown as BlobPart;
}

import { randomBytes as nodeRandom } from 'node:crypto';
import { crc32 } from '../src/core/integrity/checksums.ts';
import { sha256 } from '../src/core/integrity/hashing.ts';
import { serializeHeader } from '../src/core/format/header.ts';
import { parsePartPixels } from '../src/core/format/part.ts';
import { HEADER_SIZE } from '../src/core/format/version.ts';
import { readPixtiPdf } from '../src/core/image/pdfReader.ts';
import { sha256Hex } from '../src/core/integrity/hashing.ts';
import type { EncodeResult } from '../src/features/encode/encodeService.ts';

export const FAST_KDF = 100_000;

export function randomData(n: number): Uint8Array {
  return new Uint8Array(nodeRandom(n));
}

export function fileOf(name: string, bytes: Uint8Array, type = ''): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}

export async function docBytes(result: EncodeResult, i = 0): Promise<Uint8Array> {
  return new Uint8Array(await result.documents[i].blob.arrayBuffer());
}

export async function docFiles(result: EncodeResult): Promise<File[]> {
  return result.documents.map((d) => new File([d.blob], d.fileName, { type: 'application/pdf' }));
}

export function asFile(bytes: Uint8Array, name = 'x.pdf'): File {
  return fileOf(name, bytes, 'application/pdf');
}

export async function hex(b: Uint8Array): Promise<string> {
  return sha256Hex(b);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor((nodeRandom(4).readUInt32BE() / 2 ** 32) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function findAscii(bytes: Uint8Array, s: string, from = 0): number {
  const needle = Array.from(s, (c) => c.charCodeAt(0));
  outer: for (let i = from; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** Edit header bytes of page `page` in a PDF and fix the header CRC so only the edit is "wrong". */
export function patchHeader(pdf: Uint8Array, page: number, edit: (v: DataView, raw: Uint8Array) => void): void {
  const img = readPixtiPdf(pdf)[page];
  const raw = img.pixels.subarray(0, HEADER_SIZE);
  const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  edit(v, raw);
  v.setUint32(116, crc32(raw, 0, 116));
}

/** Change payload bytes of a page and re-sign it (new part hash + header CRC): simulates a forger. */
export async function forgePayload(pdf: Uint8Array, page: number, offsetInPayload: number): Promise<void> {
  const img = readPixtiPdf(pdf)[page];
  const parsed = await parsePartPixels(img.pixels, img.width, img.height);
  img.pixels[HEADER_SIZE + offsetInPayload] ^= 0xff;
  const sha = await sha256(img.pixels.subarray(HEADER_SIZE, HEADER_SIZE + parsed.header.partLen));
  img.pixels.set(serializeHeader({ ...parsed.header, partSha256: sha }), 0);
}

export function pixelOffset(pdf: Uint8Array, page: number): number {
  return readPixtiPdf(pdf)[page].pixels.byteOffset - pdf.byteOffset;
}

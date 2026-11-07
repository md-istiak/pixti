import { PixtiError } from '../errors.ts';
import { bytesEqual } from '../bytes.ts';
import { sha256 } from '../integrity/hashing.ts';
import { paddingIsCanonical, pixelsToContainer } from '../image/pixelDecoder.ts';
import { parseHeader } from './header.ts';
import { HEADER_SIZE } from './version.ts';
import type { PartHeader } from './header.ts';

export interface ParsedPart {
  header: PartHeader;
  /** zero-copy view into the pixel buffer */
  payload: Uint8Array;
  /** SHA-256 of payload equals header.partSha256 */
  hashOk: boolean;
}

/** Validate one page's pixel buffer and return its header + payload. */
export async function parsePartPixels(pixels: Uint8Array, width: number, height: number): Promise<ParsedPart> {
  const container = pixelsToContainer(pixels, width, height);
  const header = parseHeader(container);
  const used = HEADER_SIZE + header.partLen;
  if (used > container.length || !paddingIsCanonical(container.length, used, width)) {
    throw new PixtiError('CORRUPT_HEADER', 'The page length does not match its contents.');
  }
  const payload = container.subarray(HEADER_SIZE, used);
  const hashOk = bytesEqual(await sha256(payload), header.partSha256);
  return { header, payload, hashOk };
}

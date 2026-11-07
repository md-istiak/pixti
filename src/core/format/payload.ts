import { PixtiError } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { sanitizeFilename, sanitizeMime } from './validation.ts';
import { COMPRESSION, INNER_PREFIX_SIZE, INNER_VERSION, SHA256_BYTES } from './version.ts';
import type { CompressionId } from './version.ts';

/**
 * The inner envelope. It is the plaintext that gets encrypted (when encryption is on),
 * so filename, MIME type, size and original SHA-256 are never exposed for encrypted sets.
 *
 *  off  size  field
 *   0    1    innerVersion (=1)
 *   1    1    compression id
 *   2    2    filename length (bytes, UTF-8)
 *   4    2    mime length
 *   6    4    original size
 *  10    4    stored data length (after compression)
 *  14   32    SHA-256 of the ORIGINAL file
 *  46    …    filename, mime, stored data
 */
export interface InnerEnvelope {
  filename: string;
  mime: string;
  originalSize: number;
  originalSha256: Uint8Array;
  compression: CompressionId;
  data: Uint8Array;
}

export function buildInner(p: InnerEnvelope): Uint8Array {
  const enc = new TextEncoder();
  const name = enc.encode(sanitizeFilename(p.filename));
  const mime = enc.encode(sanitizeMime(p.mime));
  if (name.length > LIMITS.MAX_FILENAME_BYTES || mime.length > LIMITS.MAX_MIME_BYTES) {
    throw new PixtiError('INVALID_OPTIONS', 'The file name is too long.');
  }
  if (p.originalSha256.length !== SHA256_BYTES) throw new PixtiError('INTERNAL', 'Bad digest length.');
  const out = new Uint8Array(INNER_PREFIX_SIZE + name.length + mime.length + p.data.length);
  const v = new DataView(out.buffer);
  out[0] = INNER_VERSION;
  out[1] = p.compression;
  v.setUint16(2, name.length);
  v.setUint16(4, mime.length);
  v.setUint32(6, p.originalSize);
  v.setUint32(10, p.data.length);
  out.set(p.originalSha256, 14);
  out.set(name, INNER_PREFIX_SIZE);
  out.set(mime, INNER_PREFIX_SIZE + name.length);
  out.set(p.data, INNER_PREFIX_SIZE + name.length + mime.length);
  return out;
}

const corrupt = (m: string) => new PixtiError('CORRUPT_PART', m);

export function parseInner(buf: Uint8Array): InnerEnvelope {
  if (buf.length < INNER_PREFIX_SIZE) throw corrupt('The recovered data is too short.');
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf[0] !== INNER_VERSION) throw new PixtiError('UNSUPPORTED_VERSION', 'Unsupported file envelope version.');
  const compression = buf[1];
  if (compression !== COMPRESSION.NONE && compression !== COMPRESSION.DEFLATE_ZLIB) {
    throw new PixtiError('UNSUPPORTED_VERSION', 'Unsupported compression method.');
  }
  const nameLen = v.getUint16(2);
  const mimeLen = v.getUint16(4);
  const originalSize = v.getUint32(6);
  const dataLen = v.getUint32(10);
  if (nameLen > LIMITS.MAX_FILENAME_BYTES || mimeLen > LIMITS.MAX_MIME_BYTES) throw corrupt('Invalid name length.');
  if (originalSize > LIMITS.MAX_INPUT_BYTES) throw corrupt('Declared file size is above the supported limit.');
  if (INNER_PREFIX_SIZE + nameLen + mimeLen + dataLen !== buf.length) throw corrupt('Envelope length mismatch.');
  if (compression === COMPRESSION.NONE && dataLen !== originalSize) throw corrupt('Size fields disagree.');
  if (compression === COMPRESSION.DEFLATE_ZLIB && (dataLen === 0 || dataLen >= originalSize)) {
    throw corrupt('Compression fields disagree.');
  }

  const dec = new TextDecoder('utf-8', { fatal: true });
  let filename: string;
  let mime: string;
  try {
    filename = dec.decode(buf.subarray(INNER_PREFIX_SIZE, INNER_PREFIX_SIZE + nameLen));
    mime = dec.decode(buf.subarray(INNER_PREFIX_SIZE + nameLen, INNER_PREFIX_SIZE + nameLen + mimeLen));
  } catch {
    throw corrupt('The stored file name is not valid text.');
  }
  return {
    filename: sanitizeFilename(filename),
    mime: sanitizeMime(mime),
    originalSize,
    originalSha256: buf.slice(14, 14 + SHA256_BYTES),
    compression: compression as CompressionId,
    data: buf.subarray(INNER_PREFIX_SIZE + nameLen + mimeLen),
  };
}

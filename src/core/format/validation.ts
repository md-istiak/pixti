import { PixtiError } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { isAllZero } from '../bytes.ts';
import {
  AES_GCM_TAG_BYTES,
  CIPHER,
  FLAG_ENCRYPTED,
  FORMAT_VERSION,
  INNER_PREFIX_SIZE,
  KDF,
  KNOWN_FLAGS,
  NONCE_BYTES,
  SALT_BYTES,
  SESSION_ID_BYTES,
  SHA256_BYTES,
} from './version.ts';
import type { PartHeader } from './header.ts';

const bad = (msg: string) => new PixtiError('CORRUPT_HEADER', msg);
const isInt = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;

/**
 * Semantic validation of a header. Runs on parse AND on serialize so the encoder
 * can never write something the decoder would refuse.
 */
export function validateHeaderFields(h: PartHeader): void {
  if (h.version !== FORMAT_VERSION) {
    throw new PixtiError(
      'UNSUPPORTED_VERSION',
      `This document uses pixti format version ${h.version}, which this copy of pixti cannot read. Update pixti and try again.`,
    );
  }
  if ((h.flags & ~KNOWN_FLAGS) !== 0) {
    throw new PixtiError('UNSUPPORTED_VERSION', 'This document uses features this copy of pixti does not support.');
  }
  if (h.sessionId.length !== SESSION_ID_BYTES || h.salt.length !== SALT_BYTES) throw bad('Bad field size.');
  if (h.nonce.length !== NONCE_BYTES || h.partSha256.length !== SHA256_BYTES) throw bad('Bad field size.');

  if (!isInt(h.partCount, 1, LIMITS.MAX_PART_COUNT)) throw bad('Invalid part count.');
  if (!isInt(h.partIndex, 1, h.partCount)) throw bad('Invalid part index.');
  if (!isInt(h.partLen, 1, LIMITS.MAX_PART_BYTES)) throw bad('Invalid part length.');

  const encrypted = (h.flags & FLAG_ENCRYPTED) !== 0;
  const minTotal = INNER_PREFIX_SIZE + (encrypted ? AES_GCM_TAG_BYTES : 0);
  if (!isInt(h.totalLen, Math.max(minTotal, h.partLen, h.partCount), LIMITS.MAX_PAYLOAD_BYTES)) {
    throw bad('Invalid total length.');
  }
  if (h.totalLen > h.partCount * LIMITS.MAX_PART_BYTES) throw bad('Inconsistent lengths.');

  if (encrypted) {
    if (h.kdfId !== KDF.PBKDF2_SHA256 || h.cipherId !== CIPHER.AES_256_GCM) {
      throw new PixtiError('UNSUPPORTED_VERSION', 'This document uses an encryption method this copy of pixti does not support.');
    }
    if (!isInt(h.kdfIterations, LIMITS.MIN_KDF_ITERATIONS, LIMITS.MAX_KDF_ITERATIONS)) {
      throw bad('Key-derivation settings are outside the accepted range.');
    }
  } else {
    if (h.kdfId !== KDF.NONE || h.cipherId !== CIPHER.NONE || h.kdfIterations !== 0) throw bad('Inconsistent encryption fields.');
    if (!isAllZero(h.salt) || !isAllZero(h.nonce)) throw bad('Inconsistent encryption fields.');
  }
}

/** Makes an embedded filename safe to use as a download name. */
export function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  let n = name.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').trim();
  n = n.replace(/^\.+$/, '');
  n = fitUtf8(n, LIMITS.MAX_FILENAME_BYTES);
  return n.length > 0 ? n : 'recovered-file';
}

function utf8Len(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Trim a name to a UTF-8 byte budget, keeping a short extension intact. */
function fitUtf8(name: string, maxBytes: number): string {
  if (utf8Len(name) <= maxBytes) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : '';
  let base = ext ? name.slice(0, dot) : name;
  const chars = Array.from(base);
  while (chars.length > 1 && utf8Len(chars.join('') + ext) > maxBytes) chars.pop();
  base = chars.join('');
  return base + ext;
}

const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

export function sanitizeMime(mime: string): string {
  const m = mime.trim().toLowerCase();
  return m.length > 0 && m.length <= LIMITS.MAX_MIME_BYTES && MIME_RE.test(m) ? m : '';
}

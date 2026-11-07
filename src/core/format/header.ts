import { PixtiError } from '../errors.ts';
import { bytesEqual, concatBytes } from '../bytes.ts';
import { crc32 } from '../integrity/checksums.ts';
import { validateHeaderFields } from './validation.ts';
import { FORMAT_VERSION, HEADER_SIZE, MAGIC } from './version.ts';

/** Header of one part (= one PDF page). Big-endian, fixed 120 bytes. */
export interface PartHeader {
  version: number;
  flags: number;
  sessionId: Uint8Array; // 16
  partIndex: number; // 1-based
  partCount: number;
  partLen: number; // payload bytes carried by this part
  totalLen: number; // payload bytes across all parts
  kdfId: number;
  cipherId: number;
  kdfIterations: number;
  salt: Uint8Array; // 16
  nonce: Uint8Array; // 12
  partSha256: Uint8Array; // 32, SHA-256 of this part's payload bytes
}

/** The fields that must be identical in every part of a set. */
export type SharedFields = Pick<
  PartHeader,
  'version' | 'flags' | 'sessionId' | 'partCount' | 'totalLen' | 'kdfId' | 'cipherId' | 'kdfIterations' | 'salt'
>;

// Byte offsets (see docs/FORMAT.md)
const OFF = {
  version: 8,
  flags: 10,
  headerLen: 12,
  sessionId: 16,
  partIndex: 32,
  partCount: 36,
  partLen: 40,
  totalLen: 44,
  kdfId: 48,
  cipherId: 49,
  reserved: 50,
  iterations: 52,
  salt: 56,
  nonce: 72,
  sha: 84,
  crc: 116,
} as const;

export function serializeHeader(h: PartHeader): Uint8Array {
  validateHeaderFields(h);
  const out = new Uint8Array(HEADER_SIZE);
  const v = new DataView(out.buffer);
  out.set(MAGIC, 0);
  v.setUint16(OFF.version, h.version);
  v.setUint16(OFF.flags, h.flags);
  v.setUint32(OFF.headerLen, HEADER_SIZE);
  out.set(h.sessionId, OFF.sessionId);
  v.setUint32(OFF.partIndex, h.partIndex);
  v.setUint32(OFF.partCount, h.partCount);
  v.setUint32(OFF.partLen, h.partLen);
  v.setUint32(OFF.totalLen, h.totalLen);
  v.setUint8(OFF.kdfId, h.kdfId);
  v.setUint8(OFF.cipherId, h.cipherId);
  v.setUint16(OFF.reserved, 0);
  v.setUint32(OFF.iterations, h.kdfIterations);
  out.set(h.salt, OFF.salt);
  out.set(h.nonce, OFF.nonce);
  out.set(h.partSha256, OFF.sha);
  v.setUint32(OFF.crc, crc32(out, 0, OFF.crc));
  return out;
}

export function parseHeader(bytes: Uint8Array): PartHeader {
  if (bytes.length < MAGIC.length || !bytesEqual(bytes.subarray(0, MAGIC.length), MAGIC)) {
    throw new PixtiError('NOT_PIXTI_DOCUMENT', 'This page does not contain pixti data.');
  }
  if (bytes.length < HEADER_SIZE) throw new PixtiError('CORRUPT_HEADER', 'This page is truncated.');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Version is checked before anything else so future formats can change the layout.
  const version = v.getUint16(OFF.version);
  if (version !== FORMAT_VERSION) {
    throw new PixtiError(
      'UNSUPPORTED_VERSION',
      `This document uses pixti format version ${version}, which this copy of pixti cannot read. Update pixti and try again.`,
    );
  }
  if (v.getUint32(OFF.headerLen) !== HEADER_SIZE) throw new PixtiError('CORRUPT_HEADER', 'Unexpected header size.');
  if (v.getUint32(OFF.crc) !== crc32(bytes, 0, OFF.crc)) {
    throw new PixtiError('CORRUPT_HEADER', 'The page header is damaged (checksum mismatch).');
  }
  if (v.getUint16(OFF.reserved) !== 0) throw new PixtiError('CORRUPT_HEADER', 'Reserved field is not zero.');

  const h: PartHeader = {
    version,
    flags: v.getUint16(OFF.flags),
    sessionId: bytes.slice(OFF.sessionId, OFF.sessionId + 16),
    partIndex: v.getUint32(OFF.partIndex),
    partCount: v.getUint32(OFF.partCount),
    partLen: v.getUint32(OFF.partLen),
    totalLen: v.getUint32(OFF.totalLen),
    kdfId: v.getUint8(OFF.kdfId),
    cipherId: v.getUint8(OFF.cipherId),
    kdfIterations: v.getUint32(OFF.iterations),
    salt: bytes.slice(OFF.salt, OFF.salt + 16),
    nonce: bytes.slice(OFF.nonce, OFF.nonce + 12),
    partSha256: bytes.slice(OFF.sha, OFF.sha + 32),
  };
  validateHeaderFields(h);
  return h;
}

/**
 * Additional authenticated data for AES-GCM: binds every shared header field
 * (including the KDF iteration count) to the ciphertext, so editing them makes
 * decryption fail instead of merely wasting CPU.
 */
export function buildAad(h: SharedFields): Uint8Array {
  const out = new Uint8Array(2 + 2 + 16 + 4 + 4 + 1 + 1 + 4 + 16);
  const v = new DataView(out.buffer);
  v.setUint16(0, h.version);
  v.setUint16(2, h.flags);
  out.set(h.sessionId, 4);
  v.setUint32(20, h.partCount);
  v.setUint32(24, h.totalLen);
  v.setUint8(28, h.kdfId);
  v.setUint8(29, h.cipherId);
  v.setUint32(30, h.kdfIterations);
  out.set(h.salt, 34);
  return out;
}

/** Stable fingerprint of the shared fields + nonce, for cross-part consistency checks. */
export function sharedFingerprint(h: PartHeader): Uint8Array {
  return concatBytes([buildAad(h), h.nonce]);
}

import { PixtiError } from '../../core/errors.ts';
import { LIMITS, MiB } from '../../core/limits.ts';
import { bytesEqual, isAllZero, randomBytes, toBlobPart, toHex } from '../../core/bytes.ts';
import { throwIfAborted } from '../../core/progress.ts';
import type { JobHooks } from '../../core/progress.ts';
import { sha256 } from '../../core/integrity/hashing.ts';
import { deflateZlib } from '../../core/compression/compress.ts';
import { encryptBytes, newEncryptionSetup } from '../../core/encryption/encrypt.ts';
import { buildAad, serializeHeader } from '../../core/format/header.ts';
import type { PartHeader } from '../../core/format/header.ts';
import { buildInner } from '../../core/format/payload.ts';
import { parsePartPixels } from '../../core/format/part.ts';
import { sanitizeFilename, sanitizeMime } from '../../core/format/validation.ts';
import {
  AES_GCM_TAG_BYTES,
  CIPHER,
  COMPRESSION,
  FLAG_ENCRYPTED,
  FORMAT_VERSION,
  HEADER_SIZE,
  KDF,
  NONCE_BYTES,
  SALT_BYTES,
  SESSION_ID_BYTES,
} from '../../core/format/version.ts';
import type { CompressionId } from '../../core/format/version.ts';
import { computeLayout } from '../../core/image/pixelEncoder.ts';
import type { Layout } from '../../core/image/pixelEncoder.ts';
import { pixelsToContainer } from '../../core/image/pixelDecoder.ts';
import { buildPdf } from '../../core/image/pdfWriter.ts';
import { readPixtiPdf } from '../../core/image/pdfReader.ts';
import { makeThumbnail } from '../../core/image/thumbnail.ts';
import type { Thumbnail } from '../../core/image/thumbnail.ts';
import { groupForDocuments, planParts, splitPayload } from '../../core/splitting/split.ts';
import type { InputFile } from '../../types/files.ts';
import { formatBytes } from '../../utils/format.ts';

export interface EncodeOptions {
  encrypt: boolean;
  password: string;
  compression: 'auto' | 'off';
  /** Max payload bytes per page. */
  maxPartBytes: number;
  /** Max size of each output PDF, or null for a single PDF holding every page. */
  maxDocumentBytes: number | null;
  /** Tuning/testing only. Defaults to 600 000; accepted range is validated. */
  kdfIterations?: number;
}

export const DEFAULT_ENCODE_OPTIONS: EncodeOptions = {
  encrypt: true,
  password: '',
  compression: 'auto',
  maxPartBytes: LIMITS.DEFAULT_PART_BYTES,
  maxDocumentBytes: null,
};

export interface EncodedDocument {
  fileName: string;
  blob: Blob;
  byteLength: number;
  /** 1-based page-part numbers contained in this document */
  firstPart: number;
  lastPart: number;
}

export interface EncodeStats {
  originalName: string;
  originalSize: number;
  originalSha256: string;
  compression: 'none' | 'deflate';
  /** file data after (optional) compression, before envelope/encryption */
  storedSize: number;
  /** bytes carried by the pages (envelope + optional encryption tag included) */
  payloadSize: number;
  encrypted: boolean;
  partCount: number;
  documentBytes: number;
  pages: { width: number; height: number }[];
}

export interface EncodeResult {
  sessionId: string;
  documents: EncodedDocument[];
  stats: EncodeStats;
  preview: Thumbnail;
}

function validateOptions(file: InputFile, o: EncodeOptions): void {
  if (!Number.isInteger(o.maxPartBytes) || o.maxPartBytes < LIMITS.MIN_PART_BYTES || o.maxPartBytes > LIMITS.MAX_PART_BYTES) {
    throw new PixtiError('INVALID_OPTIONS', 'The page size is outside the supported range.');
  }
  if (o.maxDocumentBytes !== null && (!Number.isInteger(o.maxDocumentBytes) || o.maxDocumentBytes < MiB)) {
    throw new PixtiError('INVALID_OPTIONS', 'The per-file size limit must be at least 1 MB.');
  }
  if (o.encrypt && o.password.length === 0) {
    throw new PixtiError('EMPTY_PASSWORD', 'Enter a password, or turn encryption off.');
  }
  if (
    o.kdfIterations !== undefined &&
    (!Number.isInteger(o.kdfIterations) || o.kdfIterations < LIMITS.MIN_KDF_ITERATIONS || o.kdfIterations > LIMITS.MAX_KDF_ITERATIONS)
  ) {
    throw new PixtiError('INVALID_OPTIONS', 'Key-derivation iterations are outside the accepted range.');
  }
  if (file.size > LIMITS.MAX_INPUT_BYTES) tooLarge();
}

function tooLarge(): never {
  throw new PixtiError(
    'FILE_TOO_LARGE',
    `This file is larger than the ${formatBytes(LIMITS.MAX_INPUT_BYTES)} pixti can safely process in a browser. Split it into smaller files first.`,
  );
}

interface PendingPart {
  header: Uint8Array;
  slice: Uint8Array;
  layout: Layout;
}

/**
 * Re-reads the PDF we just wrote with the same strict reader the decoder uses and
 * checks every page byte-for-byte against what we intended to write.
 */
async function verifyDocument(
  pdf: Uint8Array,
  expected: PendingPart[],
  onPart: () => void,
  signal: AbortSignal | undefined,
): Promise<Thumbnail | null> {
  const fail = (why: string) => new PixtiError('VERIFY_FAILED', `Output verification failed (${why}). Nothing was saved.`);
  const images = readPixtiPdf(pdf);
  if (images.length !== expected.length) throw fail('page count');
  let thumb: Thumbnail | null = null;
  for (let j = 0; j < images.length; j++) {
    throwIfAborted(signal);
    const img = images[j];
    const e = expected[j];
    if (img.width !== e.layout.width || img.height !== e.layout.height) throw fail('dimensions');
    const container = pixelsToContainer(img.pixels, img.width, img.height);
    const used = HEADER_SIZE + e.slice.length;
    if (!bytesEqual(container.subarray(0, HEADER_SIZE), e.header)) throw fail('header');
    if (!bytesEqual(container.subarray(HEADER_SIZE, used), e.slice)) throw fail('data');
    if (!isAllZero(container, used)) throw fail('padding');
    const parsed = await parsePartPixels(img.pixels, img.width, img.height);
    if (!parsed.hashOk) throw fail('checksum');
    if (j === 0) thumb = makeThumbnail(img.pixels, img.width, img.height, 360);
    onPart();
  }
  return thumb;
}

export async function encodeFile(file: InputFile, options: EncodeOptions, hooks: JobHooks = {}): Promise<EncodeResult> {
  const { signal } = hooks;
  const report = hooks.onProgress ?? (() => undefined);
  validateOptions(file, options);
  throwIfAborted(signal);

  // 1. read
  report('read', null);
  const data = new Uint8Array(await file.arrayBuffer());
  if (data.length > LIMITS.MAX_INPUT_BYTES) tooLarge();
  report('read', 1);

  // 2. checksum of the original bytes
  throwIfAborted(signal);
  report('hash', null);
  const originalSha256 = await sha256(data);

  // 3. compress only when it actually helps
  let method: CompressionId = COMPRESSION.NONE;
  let stored: Uint8Array = data;
  if (options.compression === 'auto' && data.length > 0) {
    report('compress', 0);
    const packed = await deflateZlib(data, {
      maxOutput: data.length,
      onProgress: (f) => report('compress', f),
      signal,
    });
    if (packed) {
      method = COMPRESSION.DEFLATE_ZLIB;
      stored = packed;
    }
    report('compress', 1);
  }

  // 4. inner envelope (filename, MIME, size, SHA-256, data)
  const filename = sanitizeFilename(file.name);
  const inner = buildInner({
    filename,
    mime: sanitizeMime(file.type ?? ''),
    originalSize: data.length,
    originalSha256,
    compression: method,
    data: stored,
  });
  const storedSize = stored.length;

  // 5. layout + optional encryption. The page count must be known first because the
  //    header fields are authenticated as AES-GCM additional data.
  const encrypted = options.encrypt;
  const payloadLen = inner.length + (encrypted ? AES_GCM_TAG_BYTES : 0);
  if (payloadLen > LIMITS.MAX_PAYLOAD_BYTES) tooLarge();
  const lengths = planParts(payloadLen, options.maxPartBytes);
  const partCount = lengths.length;
  const sessionId = randomBytes(SESSION_ID_BYTES);
  const setup = encrypted ? newEncryptionSetup(options.kdfIterations ?? LIMITS.DEFAULT_KDF_ITERATIONS) : null;
  const base: Omit<PartHeader, 'partIndex' | 'partLen' | 'partSha256'> = {
    version: FORMAT_VERSION,
    flags: encrypted ? FLAG_ENCRYPTED : 0,
    sessionId,
    partCount,
    totalLen: payloadLen,
    kdfId: encrypted ? KDF.PBKDF2_SHA256 : KDF.NONE,
    cipherId: encrypted ? CIPHER.AES_256_GCM : CIPHER.NONE,
    kdfIterations: setup?.iterations ?? 0,
    salt: setup?.salt ?? new Uint8Array(SALT_BYTES),
    nonce: setup?.nonce ?? new Uint8Array(NONCE_BYTES),
  };

  throwIfAborted(signal);
  let payload: Uint8Array = inner;
  if (setup) {
    report('encrypt', null);
    payload = await encryptBytes(inner, options.password, setup, buildAad(base));
    report('encrypt', 1);
  }
  if (payload.length !== payloadLen) throw new PixtiError('INTERNAL', 'Payload length mismatch.');

  // 6. build every page and PDF
  const slices = splitPayload(payload, lengths);
  const approxPartBytes = lengths.map((l) => computeLayout(HEADER_SIZE + l).rawBytes + 2048);
  const groups = groupForDocuments(approxPartBytes, options.maxDocumentBytes);
  const built: { pdf: Uint8Array; parts: PendingPart[]; firstPart: number; lastPart: number }[] = [];
  const pages: { width: number; height: number }[] = [];
  let builtParts = 0;
  report('build', 0);
  for (const group of groups) {
    const parts: PendingPart[] = [];
    for (const i of group) {
      throwIfAborted(signal);
      const slice = slices[i];
      const header = serializeHeader({
        ...base,
        partIndex: i + 1,
        partLen: slice.length,
        partSha256: await sha256(slice),
      });
      const layout = computeLayout(HEADER_SIZE + slice.length);
      parts.push({ header, slice, layout });
      pages.push({ width: layout.width, height: layout.height });
      report('build', ++builtParts / partCount);
    }
    const pdf = buildPdf(
      parts.map((p, k) => ({
        layout: p.layout,
        segments: [p.header, p.slice],
        label: `Part ${group[k] + 1} of ${partCount}`,
      })),
    );
    built.push({ pdf, parts, firstPart: group[0] + 1, lastPart: group[group.length - 1] + 1 });
  }

  // 7. read the PDFs back and compare to what we meant to write
  const idHex = toHex(sessionId).slice(0, 8);
  const documents: EncodedDocument[] = [];
  let preview: Thumbnail | null = null;
  let verified = 0;
  let docBytes = 0;
  report('verify', 0);
  while (built.length > 0) {
    const b = built.shift()!;
    const thumb = await verifyDocument(b.pdf, b.parts, () => report('verify', ++verified / partCount), signal);
    preview ??= thumb;
    docBytes += b.pdf.length;
    const n = documents.length + 1;
    documents.push({
      fileName:
        groups.length === 1
          ? `pixti_${idHex}.pdf`
          : `pixti_${idHex}_file_${String(n).padStart(3, '0')}_of_${String(groups.length).padStart(3, '0')}.pdf`,
      blob: new Blob([toBlobPart(b.pdf)], { type: 'application/pdf' }),
      byteLength: b.pdf.length,
      firstPart: b.firstPart,
      lastPart: b.lastPart,
    });
  }
  if (!preview) throw new PixtiError('INTERNAL', 'No preview.');

  return {
    sessionId: toHex(sessionId),
    documents,
    preview,
    stats: {
      originalName: filename,
      originalSize: data.length,
      originalSha256: toHex(originalSha256),
      compression: method === COMPRESSION.NONE ? 'none' : 'deflate',
      storedSize,
      payloadSize: payloadLen,
      encrypted,
      partCount,
      documentBytes: docBytes,
      pages,
    },
  };
}

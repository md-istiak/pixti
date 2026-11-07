import { PixtiError } from '../../core/errors.ts';
import { LIMITS } from '../../core/limits.ts';
import { toBlobPart, toHex } from '../../core/bytes.ts';
import { throwIfAborted } from '../../core/progress.ts';
import type { JobHooks } from '../../core/progress.ts';
import { sha256Hex } from '../../core/integrity/hashing.ts';
import { verifyRecoveredFile } from '../../core/integrity/verification.ts';
import { inflateZlibExact } from '../../core/compression/decompress.ts';
import { decryptBytes } from '../../core/encryption/decrypt.ts';
import { buildAad } from '../../core/format/header.ts';
import type { PartHeader } from '../../core/format/header.ts';
import { parseInner } from '../../core/format/payload.ts';
import { parsePartPixels } from '../../core/format/part.ts';
import { COMPRESSION } from '../../core/format/version.ts';
import { readPixtiPdf } from '../../core/image/pdfReader.ts';
import { makeThumbnail } from '../../core/image/thumbnail.ts';
import type { Thumbnail } from '../../core/image/thumbnail.ts';
import { mergeParts } from '../../core/splitting/merge.ts';
import { analyzeParts, selectParts } from '../../core/splitting/partMetadata.ts';
import type { SetAnalysis, SetIssue, SetStatus } from '../../core/splitting/partMetadata.ts';
import type { InputFile } from '../../types/files.ts';

export interface PageReport {
  /** 1-based page number inside its file */
  page: number;
  status: 'ok' | 'corrupt' | 'invalid';
  index?: number;
  count?: number;
  sessionId?: string;
  error?: string;
  thumb: Thumbnail;
}

export interface FileReport {
  name: string;
  size: number;
  error?: string;
  pages: PageReport[];
}

export interface InspectReport {
  files: FileReport[];
  sessions: { id: string; parts: number }[];
  set: SetStatus | null;
  issues: SetIssue[];
  canDecode: boolean;
  needsPassword: boolean;
}

export interface DecodeResult {
  blob: Blob;
  fileName: string;
  /** '' when none was stored */
  mime: string;
  size: number;
  sha256: string;
  verified: true;
  compression: 'none' | 'deflate';
  /** bytes stored for the file data (after compression) */
  storedSize: number;
  encrypted: boolean;
  partCount: number;
}

interface LoadedPart {
  header: PartHeader;
  hashOk: boolean;
  payload: Uint8Array;
}

/** Cap on payload bytes we keep in memory while collecting pages (duplicates are not kept). */
const MAX_RETAINED_BYTES = 2 * LIMITS.MAX_PAYLOAD_BYTES;

async function loadParts(
  files: InputFile[],
  keepPayload: boolean,
  hooks: JobHooks,
): Promise<{ reports: FileReport[]; parts: LoadedPart[] }> {
  const { signal } = hooks;
  const report = hooks.onProgress ?? (() => undefined);
  if (files.length === 0) throw new PixtiError('NO_FILES', 'Add at least one pixti PDF.');
  if (files.length > LIMITS.MAX_FILES_PER_DECODE) {
    throw new PixtiError('LIMIT_EXCEEDED', `Please select at most ${LIMITS.MAX_FILES_PER_DECODE} files.`);
  }

  const reports: FileReport[] = [];
  const parts: LoadedPart[] = [];
  const seen = new Set<string>();
  let retained = 0;

  for (let fi = 0; fi < files.length; fi++) {
    throwIfAborted(signal);
    report('read', fi / files.length);
    const f = files[fi];
    const rep: FileReport = { name: f.name, size: f.size, pages: [] };
    reports.push(rep);

    if (f.size > LIMITS.MAX_DOCUMENT_BYTES) {
      rep.error = 'This file is too large to be a pixti document.';
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await f.arrayBuffer());
    } catch (e) {
      if (e instanceof RangeError) throw e;
      rep.error = 'This file could not be read.';
      continue;
    }
    let images;
    try {
      images = readPixtiPdf(bytes);
    } catch (e) {
      if (!(e instanceof PixtiError)) throw e;
      rep.error = e.message;
      continue;
    }

    for (let j = 0; j < images.length; j++) {
      throwIfAborted(signal);
      const img = images[j];
      const thumb = makeThumbnail(img.pixels, img.width, img.height, 96);
      try {
        const p = await parsePartPixels(img.pixels, img.width, img.height);
        const sid = toHex(p.header.sessionId);
        let payload = new Uint8Array(0);
        if (keepPayload && p.hashOk) {
          const key = `${sid}:${p.header.partIndex}:${toHex(p.header.partSha256)}`;
          if (!seen.has(key)) {
            retained += p.payload.length;
            if (retained > MAX_RETAINED_BYTES) {
              throw new PixtiError('LIMIT_EXCEEDED', 'The selected files contain more data than pixti can process at once.');
            }
            seen.add(key);
            payload = p.payload.slice();
          }
        }
        parts.push({ header: p.header, hashOk: p.hashOk, payload });
        rep.pages.push({
          page: j + 1,
          status: p.hashOk ? 'ok' : 'corrupt',
          index: p.header.partIndex,
          count: p.header.partCount,
          sessionId: sid,
          thumb,
          ...(p.hashOk ? {} : { error: 'The data on this page is damaged.' }),
        });
      } catch (e) {
        if (!(e instanceof PixtiError) || e.code === 'LIMIT_EXCEEDED') throw e;
        rep.pages.push({ page: j + 1, status: 'invalid', error: e.message, thumb });
      }
    }
  }
  report('read', 1);
  return { reports, parts };
}

/** Cheap pass used by the UI to show the set, missing pages, etc. Nothing is decrypted. */
export async function inspectFiles(files: InputFile[], hooks: JobHooks = {}): Promise<InspectReport> {
  const { reports, parts } = await loadParts(files, false, hooks);
  const analysis = analyzeParts(parts);
  const issues = [...analysis.issues];
  // Files that held nothing readable deserve their own explanation.
  if (parts.length === 0) {
    const firstErr = reports.find((r) => r.error ?? r.pages.some((p) => p.error));
    if (firstErr) {
      issues.length = 0;
      issues.push({
        severity: 'error',
        code: 'NOT_PIXTI_DOCUMENT',
        message: 'None of the selected files could be read as pixti documents.',
      });
    }
  }
  return {
    files: reports,
    sessions: analysis.sessions,
    set: analysis.status,
    issues,
    canDecode: analysis.ok,
    needsPassword: analysis.status?.encrypted ?? false,
  };
}

function errorFromAnalysis(a: SetAnalysis): PixtiError {
  const errors = a.issues.filter((i) => i.severity === 'error');
  const first = errors[0];
  return new PixtiError(first?.code ?? 'CORRUPT_PART', errors.map((e) => e.message).join(' '), a.status ?? undefined);
}

/**
 * Full recovery. Order of checks: set completeness -> (password) -> AES-GCM
 * authentication -> envelope validation -> bounded inflate -> size -> SHA-256.
 * The result is only returned if every applicable check passed.
 */
export async function decodeFiles(files: InputFile[], password: string | undefined, hooks: JobHooks = {}): Promise<DecodeResult> {
  const { signal } = hooks;
  const report = hooks.onProgress ?? (() => undefined);

  const { parts } = await loadParts(files, true, hooks);
  throwIfAborted(signal);
  report('assemble', null);
  const analysis = analyzeParts(parts);
  if (!analysis.ok) throw errorFromAnalysis(analysis);

  const selected = selectParts(parts);
  const h = selected[0].header;
  if (selected.length !== h.partCount) throw new PixtiError('MISSING_PARTS', 'Some pages are missing.');
  const payload = mergeParts(
    selected.map((p) => p.payload),
    h.totalLen,
  );
  report('assemble', 1);

  let inner: Uint8Array;
  if (analysis.status?.encrypted) {
    if (!password) throw new PixtiError('PASSWORD_REQUIRED', 'This file is password-protected. Enter its password.');
    throwIfAborted(signal);
    report('decrypt', null);
    inner = await decryptBytes(
      payload,
      password,
      { kdfId: h.kdfId, iterations: h.kdfIterations, salt: h.salt, nonce: h.nonce },
      buildAad(h),
    );
    report('decrypt', 1);
  } else {
    inner = payload;
  }

  const env = parseInner(inner);
  let fileBytes: Uint8Array;
  if (env.compression === COMPRESSION.NONE) {
    fileBytes = env.data;
  } else {
    throwIfAborted(signal);
    report('decompress', 0);
    fileBytes = await inflateZlibExact(env.data, env.originalSize, {
      onProgress: (f) => report('decompress', f),
      signal,
    });
    report('decompress', 1);
  }

  throwIfAborted(signal);
  report('verify', null);
  await verifyRecoveredFile(fileBytes, env.originalSize, env.originalSha256);
  const sha = await sha256Hex(fileBytes);

  return {
    blob: new Blob([toBlobPart(fileBytes)], { type: env.mime || 'application/octet-stream' }),
    fileName: env.filename,
    mime: env.mime,
    size: fileBytes.length,
    sha256: sha,
    verified: true,
    compression: env.compression === COMPRESSION.NONE ? 'none' : 'deflate',
    storedSize: env.data.length,
    encrypted: analysis.status?.encrypted ?? false,
    partCount: h.partCount,
  };
}

/**
 * Every failure the pipeline can report. Messages are written for end users and
 * must never contain passwords, keys, payload bytes or stack traces.
 */
export type ErrorCode =
  | 'NOT_PIXTI_DOCUMENT'
  | 'MALFORMED_PDF'
  | 'UNSUPPORTED_VERSION'
  | 'CORRUPT_HEADER'
  | 'CORRUPT_PART'
  | 'MISSING_PARTS'
  | 'DUPLICATE_PARTS'
  | 'MIXED_SESSIONS'
  | 'CONFLICTING_PARTS'
  | 'PASSWORD_REQUIRED'
  | 'EMPTY_PASSWORD'
  | 'DECRYPT_FAILED'
  | 'DECOMPRESS_FAILED'
  | 'HASH_MISMATCH'
  | 'SIZE_MISMATCH'
  | 'FILE_TOO_LARGE'
  | 'LIMIT_EXCEEDED'
  | 'OUT_OF_MEMORY'
  | 'INVALID_OPTIONS'
  | 'NO_FILES'
  | 'VERIFY_FAILED'
  | 'WORKER_FAILED'
  | 'UNSUPPORTED_BROWSER'
  | 'CANCELLED'
  | 'INTERNAL';

export class PixtiError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'PixtiError';
    this.code = code;
    this.details = details;
  }
}

/** Plain-object form that survives structuredClone / postMessage. */
export interface SerializedError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export function serializeError(e: unknown): SerializedError {
  if (e instanceof PixtiError) return { code: e.code, message: e.message, details: e.details };
  if (e instanceof RangeError || (e instanceof Error && /memory|allocation/i.test(e.message))) {
    return {
      code: 'OUT_OF_MEMORY',
      message:
        'This device ran out of memory. Try a smaller file, close other tabs, or lower the page size in advanced settings.',
    };
  }
  return { code: 'INTERNAL', message: 'Something went wrong while processing. Please try again.' };
}

export function deserializeError(s: SerializedError): PixtiError {
  return new PixtiError(s.code, s.message, s.details);
}

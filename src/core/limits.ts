export const KiB = 1024;
export const MiB = 1024 * 1024;

/**
 * Hard upper bounds. Every value read from an untrusted document is checked
 * against these BEFORE anything is allocated or any expensive work starts.
 */
export const LIMITS = {
  /** Largest input file the encoder accepts (target is ~50 MB; headroom above that). */
  MAX_INPUT_BYTES: 64 * MiB,
  /** Largest stored payload (compressed + envelope + auth tag). */
  MAX_PAYLOAD_BYTES: 65 * MiB,
  /** Payload bytes per page ("part"). */
  MIN_PART_BYTES: 64 * KiB,
  DEFAULT_PART_BYTES: 8 * MiB,
  MAX_PART_BYTES: 32 * MiB,
  MAX_PART_COUNT: 2048,
  /** Largest single PDF the decoder will read. */
  MAX_DOCUMENT_BYTES: 128 * MiB,
  MAX_FILES_PER_DECODE: 256,
  /** Sanity bound on image side length (px). */
  MAX_IMAGE_DIMENSION: 10_000,
  MAX_FILENAME_BYTES: 255,
  MAX_MIME_BYTES: 127,
  DEFAULT_KDF_ITERATIONS: 600_000,
  MIN_KDF_ITERATIONS: 100_000,
  MAX_KDF_ITERATIONS: 2_000_000,
} as const;

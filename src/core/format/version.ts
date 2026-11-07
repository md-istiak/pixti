/** pixti container format constants. See docs/FORMAT.md. */
export const FORMAT_VERSION = 1;

/** "PIXTI\0\0\0" */
export const MAGIC = new Uint8Array([0x50, 0x49, 0x58, 0x54, 0x49, 0x00, 0x00, 0x00]);

/** Fixed v1 header size in bytes. */
export const HEADER_SIZE = 120;

export const FLAG_ENCRYPTED = 0x0001;
/** Every flag bit this implementation understands. Unknown bits are rejected. */
export const KNOWN_FLAGS = FLAG_ENCRYPTED;

export const KDF = { NONE: 0, PBKDF2_SHA256: 1 } as const;
export const CIPHER = { NONE: 0, AES_256_GCM: 1 } as const;
export const COMPRESSION = { NONE: 0, DEFLATE_ZLIB: 1 } as const;
export type CompressionId = (typeof COMPRESSION)[keyof typeof COMPRESSION];

export const SESSION_ID_BYTES = 16;
export const SALT_BYTES = 16;
export const NONCE_BYTES = 12;
export const SHA256_BYTES = 32;
export const AES_GCM_TAG_BYTES = 16;

/** Fixed prefix of the inner envelope (before filename / mime / data). */
export const INNER_VERSION = 1;
export const INNER_PREFIX_SIZE = 46;

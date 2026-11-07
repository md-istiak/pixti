import { PixtiError } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { toBufferSource } from '../bytes.ts';
import { assertCrypto } from '../integrity/hashing.ts';
import { KDF, SALT_BYTES } from '../format/version.ts';

export interface KdfParams {
  kdfId: number;
  iterations: number;
  salt: Uint8Array;
}

/** NFKC-normalised UTF-8, so the same typed password works on every device/keyboard. */
export function passwordBytes(password: string): Uint8Array {
  return new TextEncoder().encode(password.normalize('NFKC'));
}

type Deriver = (password: string, p: KdfParams, usage: KeyUsage) => Promise<CryptoKey>;

async function pbkdf2Sha256(password: string, p: KdfParams, usage: KeyUsage): Promise<CryptoKey> {
  if (p.iterations < LIMITS.MIN_KDF_ITERATIONS || p.iterations > LIMITS.MAX_KDF_ITERATIONS) {
    throw new PixtiError('CORRUPT_HEADER', 'Key-derivation settings are outside the accepted range.');
  }
  if (p.salt.length !== SALT_BYTES) throw new PixtiError('CORRUPT_HEADER', 'Bad salt.');
  const base = await crypto.subtle.importKey('raw', toBufferSource(passwordBytes(password)), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: toBufferSource(p.salt), iterations: p.iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

/** Registry keyed by the on-disk KDF id. Add Argon2id here (new id + format minor bump) later. */
const DERIVERS: Record<number, Deriver> = {
  [KDF.PBKDF2_SHA256]: pbkdf2Sha256,
};

export async function deriveAesKey(password: string, p: KdfParams, usage: KeyUsage): Promise<CryptoKey> {
  assertCrypto();
  const derive = DERIVERS[p.kdfId];
  if (!derive) throw new PixtiError('UNSUPPORTED_VERSION', 'Unsupported key-derivation method.');
  return derive(password, p, usage);
}

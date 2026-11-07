import { PixtiError } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { randomBytes, toBufferSource } from '../bytes.ts';
import { KDF, NONCE_BYTES, SALT_BYTES } from '../format/version.ts';
import { deriveAesKey } from './keyDerivation.ts';

export interface EncryptionSetup {
  salt: Uint8Array;
  nonce: Uint8Array;
  iterations: number;
}

/** Fresh random salt and 96-bit nonce for every encryption. Never reused. */
export function newEncryptionSetup(iterations: number = LIMITS.DEFAULT_KDF_ITERATIONS): EncryptionSetup {
  return { salt: randomBytes(SALT_BYTES), nonce: randomBytes(NONCE_BYTES), iterations };
}

export async function encryptBytes(
  plain: Uint8Array,
  password: string,
  setup: EncryptionSetup,
  aad: Uint8Array,
): Promise<Uint8Array> {
  if (password.length === 0) throw new PixtiError('EMPTY_PASSWORD', 'Enter a password, or turn encryption off.');
  const key = await deriveAesKey(
    password,
    { kdfId: KDF.PBKDF2_SHA256, iterations: setup.iterations, salt: setup.salt },
    'encrypt',
  );
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBufferSource(setup.nonce), additionalData: toBufferSource(aad), tagLength: 128 },
    key,
    toBufferSource(plain),
  );
  return new Uint8Array(ct);
}

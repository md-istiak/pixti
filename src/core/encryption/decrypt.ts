import { PixtiError } from '../errors.ts';
import { toBufferSource } from '../bytes.ts';
import { AES_GCM_TAG_BYTES } from '../format/version.ts';
import { deriveAesKey } from './keyDerivation.ts';
import type { KdfParams } from './keyDerivation.ts';

export const DECRYPT_FAILED_MESSAGE =
  'Unable to decrypt this file. The password may be incorrect, or the encoded data may have been modified.';

/**
 * AES-256-GCM decrypt + authenticate. A wrong password and tampered data are
 * deliberately indistinguishable.
 */
export async function decryptBytes(
  cipher: Uint8Array,
  password: string,
  params: KdfParams & { nonce: Uint8Array },
  aad: Uint8Array,
): Promise<Uint8Array> {
  if (password.length === 0) throw new PixtiError('PASSWORD_REQUIRED', 'This file is password-protected. Enter its password.');
  if (cipher.length < AES_GCM_TAG_BYTES) throw new PixtiError('DECRYPT_FAILED', DECRYPT_FAILED_MESSAGE);
  const key = await deriveAesKey(password, params, 'decrypt');
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toBufferSource(params.nonce), additionalData: toBufferSource(aad), tagLength: 128 },
      key,
      toBufferSource(cipher),
    );
    return new Uint8Array(plain);
  } catch {
    throw new PixtiError('DECRYPT_FAILED', DECRYPT_FAILED_MESSAGE);
  }
}

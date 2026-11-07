import { PixtiError } from '../errors.ts';
import { toBufferSource, toHex } from '../bytes.ts';

export function assertCrypto(): void {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new PixtiError(
      'UNSUPPORTED_BROWSER',
      'This browser does not provide secure cryptography here. Open pixti over HTTPS (or localhost) in a current browser.',
    );
  }
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  assertCrypto();
  return new Uint8Array(await crypto.subtle.digest('SHA-256', toBufferSource(data)));
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  return toHex(await sha256(data));
}

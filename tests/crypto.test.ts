import { describe, expect, it } from 'vitest';
import { decryptBytes, DECRYPT_FAILED_MESSAGE } from '../src/core/encryption/decrypt.ts';
import { encryptBytes, newEncryptionSetup } from '../src/core/encryption/encrypt.ts';
import { bytesEqual, randomBytes, toHex } from '../src/core/bytes.ts';
import { KDF } from '../src/core/format/version.ts';
import { FAST_KDF, randomData } from './helpers.ts';

const aad = randomBytes(50);
const paramsOf = (s: { salt: Uint8Array; nonce: Uint8Array; iterations: number }) => ({
  kdfId: KDF.PBKDF2_SHA256,
  iterations: s.iterations,
  salt: s.salt,
  nonce: s.nonce,
});

describe('AES-256-GCM + PBKDF2-SHA-256', () => {
  it('round-trips with the correct password and adds a 16-byte tag', async () => {
    const plain = randomData(10_000);
    const s = newEncryptionSetup(FAST_KDF);
    const ct = await encryptBytes(plain, 'correct horse', s, aad);
    expect(ct.length).toBe(plain.length + 16);
    expect(bytesEqual(await decryptBytes(ct, 'correct horse', paramsOf(s), aad), plain)).toBe(true);
  });

  it('rejects a wrong password with the standard message', async () => {
    const s = newEncryptionSetup(FAST_KDF);
    const ct = await encryptBytes(randomData(100), 'right', s, aad);
    await expect(decryptBytes(ct, 'wrong', paramsOf(s), aad)).rejects.toMatchObject({
      code: 'DECRYPT_FAILED',
      message: DECRYPT_FAILED_MESSAGE,
    });
  });

  it('refuses an empty password when encrypting; asks for one when decrypting', async () => {
    const s = newEncryptionSetup(FAST_KDF);
    await expect(encryptBytes(randomData(10), '', s, aad)).rejects.toMatchObject({ code: 'EMPTY_PASSWORD' });
    const ct = await encryptBytes(randomData(10), 'x', s, aad);
    await expect(decryptBytes(ct, '', paramsOf(s), aad)).rejects.toMatchObject({ code: 'PASSWORD_REQUIRED' });
  });

  it('detects any modified ciphertext byte', async () => {
    const s = newEncryptionSetup(FAST_KDF);
    const ct = await encryptBytes(randomData(500), 'pw', s, aad);
    for (const pos of [0, 100, ct.length - 17]) {
      const bad = ct.slice();
      bad[pos] ^= 1;
      await expect(decryptBytes(bad, 'pw', paramsOf(s), aad)).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
    }
  });

  it('detects a modified authentication tag', async () => {
    const s = newEncryptionSetup(FAST_KDF);
    const ct = await encryptBytes(randomData(500), 'pw', s, aad);
    for (const pos of [ct.length - 1, ct.length - 8, ct.length - 16]) {
      const bad = ct.slice();
      bad[pos] ^= 0x80;
      await expect(decryptBytes(bad, 'pw', paramsOf(s), aad)).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
    }
  });

  it('detects truncated ciphertext', async () => {
    const s = newEncryptionSetup(FAST_KDF);
    const ct = await encryptBytes(randomData(500), 'pw', s, aad);
    await expect(decryptBytes(ct.subarray(0, 10), 'pw', paramsOf(s), aad)).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
    await expect(decryptBytes(ct.subarray(0, ct.length - 1), 'pw', paramsOf(s), aad)).rejects.toMatchObject({
      code: 'DECRYPT_FAILED',
    });
  });

  it('authenticates the header fields (AAD) and the nonce', async () => {
    const s = newEncryptionSetup(FAST_KDF);
    const ct = await encryptBytes(randomData(100), 'pw', s, aad);
    const otherAad = aad.slice();
    otherAad[0] ^= 1;
    await expect(decryptBytes(ct, 'pw', paramsOf(s), otherAad)).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
    await expect(decryptBytes(ct, 'pw', paramsOf({ ...s, nonce: randomBytes(12) }), aad)).rejects.toMatchObject({
      code: 'DECRYPT_FAILED',
    });
  });

  it('uses a fresh random salt and nonce every time', async () => {
    const a = newEncryptionSetup(FAST_KDF);
    const b = newEncryptionSetup(FAST_KDF);
    expect(toHex(a.salt)).not.toBe(toHex(b.salt));
    expect(toHex(a.nonce)).not.toBe(toHex(b.nonce));
    const plain = randomData(64);
    const c1 = await encryptBytes(plain, 'pw', a, aad);
    const c2 = await encryptBytes(plain, 'pw', b, aad);
    expect(toHex(c1)).not.toBe(toHex(c2));
  });

  it('treats equivalent Unicode spellings of a password as the same (NFKC)', async () => {
    const s = newEncryptionSetup(FAST_KDF);
    const ct = await encryptBytes(randomData(32), 'caf\u00e9', s, aad);
    const plain = await decryptBytes(ct, 'cafe\u0301', paramsOf(s), aad);
    expect(plain.length).toBe(32);
  });

  it('refuses out-of-range iteration counts and unknown KDFs before doing any work', async () => {
    const s = newEncryptionSetup(FAST_KDF);
    const ct = await encryptBytes(randomData(32), 'pw', s, aad);
    await expect(decryptBytes(ct, 'pw', { ...paramsOf(s), iterations: 900_000_000 }, aad)).rejects.toMatchObject({
      code: 'CORRUPT_HEADER',
    });
    await expect(decryptBytes(ct, 'pw', { ...paramsOf(s), kdfId: 9 }, aad)).rejects.toMatchObject({
      code: 'UNSUPPORTED_VERSION',
    });
  });
});

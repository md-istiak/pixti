import { PixtiError } from '../errors.ts';
import { bytesEqual } from '../bytes.ts';
import { sha256 } from './hashing.ts';

/** The final gate: nothing is offered as "recovered" unless this passes. */
export async function verifyRecoveredFile(
  data: Uint8Array,
  expectedSize: number,
  expectedSha256: Uint8Array,
): Promise<void> {
  if (data.length !== expectedSize) {
    throw new PixtiError('SIZE_MISMATCH', 'The recovered file has the wrong size, so it was rejected.');
  }
  if (!bytesEqual(await sha256(data), expectedSha256)) {
    throw new PixtiError(
      'HASH_MISMATCH',
      'The recovered file does not match the original checksum, so it was rejected. The data is corrupt or incomplete.',
    );
  }
}

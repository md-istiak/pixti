import { PixtiError } from './errors.ts';

export type Stage =
  | 'read'
  | 'hash'
  | 'compress'
  | 'encrypt'
  | 'build'
  | 'verify'
  | 'assemble'
  | 'decrypt'
  | 'decompress';

/** fraction is 0..1, or null when the operation cannot report real progress. */
export type ProgressFn = (stage: Stage, fraction: number | null) => void;

export interface JobHooks {
  onProgress?: ProgressFn;
  signal?: AbortSignal;
}

export interface StageInfo {
  id: Stage;
  label: string;
}

export const ENCODE_STAGES: StageInfo[] = [
  { id: 'read', label: 'Reading file' },
  { id: 'hash', label: 'Calculating checksum' },
  { id: 'compress', label: 'Compressing' },
  { id: 'encrypt', label: 'Encrypting' },
  { id: 'build', label: 'Building document' },
  { id: 'verify', label: 'Verifying output' },
];

export const DECODE_STAGES: StageInfo[] = [
  { id: 'read', label: 'Reading pages' },
  { id: 'assemble', label: 'Checking the set' },
  { id: 'decrypt', label: 'Decrypting' },
  { id: 'decompress', label: 'Decompressing' },
  { id: 'verify', label: 'Verifying the recovered file' },
];

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new PixtiError('CANCELLED', 'Cancelled.');
}

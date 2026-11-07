import type { SerializedError } from '../core/errors.ts';
import type { Stage } from '../core/progress.ts';
import type { EncodeOptions, EncodeResult } from '../features/encode/encodeService.ts';
import type { DecodeResult, InspectReport } from '../features/decode/decodeService.ts';
import type { InputFile } from '../types/files.ts';

export type WorkerRequest =
  | { type: 'encode'; file: InputFile; options: EncodeOptions }
  | { type: 'inspect'; files: InputFile[] }
  | { type: 'decode'; files: InputFile[]; password?: string };

export type JobKind = WorkerRequest['type'];

export interface ResultMap {
  encode: EncodeResult;
  inspect: InspectReport;
  decode: DecodeResult;
}

export type WorkerMessage =
  | { type: 'progress'; stage: Stage; fraction: number | null }
  | { type: 'result'; result: ResultMap[JobKind] }
  | { type: 'error'; error: SerializedError };

export type RequestOf<K extends JobKind> = Extract<WorkerRequest, { type: K }>;

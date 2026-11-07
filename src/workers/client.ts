import { runJob } from './jobRunner.ts';
import type { Job, JobProgress, WorkerFactory, WorkerLike } from './jobRunner.ts';
import type { JobKind, RequestOf, ResultMap } from './protocol.ts';

const createWorker: WorkerFactory = () =>
  new Worker(new URL('./processing.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

/** Starts one job in a fresh Worker. The worker is terminated when the job settles or is cancelled. */
export function startJob<K extends JobKind>(request: RequestOf<K>, onProgress?: JobProgress): Job<ResultMap[K]> {
  return runJob<K>(createWorker, request, onProgress);
}

export type { Job };

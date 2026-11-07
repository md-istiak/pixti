import { PixtiError, deserializeError } from '../core/errors.ts';
import type { Stage } from '../core/progress.ts';
import type { JobKind, RequestOf, ResultMap, WorkerMessage } from './protocol.ts';

/** The subset of the Worker API we use (lets tests inject a fake). */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onmessageerror: ((e: unknown) => void) | null;
}
export type WorkerFactory = () => WorkerLike;

export interface Job<T> {
  promise: Promise<T>;
  /** Terminates the worker immediately (works even in the middle of a one-shot crypto call). */
  cancel(): void;
}

export type JobProgress = (stage: Stage, fraction: number | null) => void;

const WORKER_FAILED = () =>
  new PixtiError('WORKER_FAILED', 'The background worker stopped unexpectedly. Please try again, or use a smaller file.');

export function runJob<K extends JobKind>(
  factory: WorkerFactory,
  request: RequestOf<K>,
  onProgress?: JobProgress,
): Job<ResultMap[K]> {
  let worker: WorkerLike | null = null;
  let settled = false;
  let rejectOuter: ((e: unknown) => void) | null = null;

  const release = () => {
    settled = true;
    const w = worker;
    worker = null;
    if (w) {
      w.onmessage = w.onerror = w.onmessageerror = null;
      w.terminate();
    }
  };

  const promise = new Promise<ResultMap[K]>((resolve, reject) => {
    rejectOuter = reject;
    try {
      worker = factory();
    } catch {
      settled = true;
      reject(WORKER_FAILED());
      return;
    }
    worker.onmessage = (e) => {
      if (settled) return;
      const m = e.data as WorkerMessage;
      if (m.type === 'progress') {
        onProgress?.(m.stage, m.fraction);
      } else if (m.type === 'result') {
        release();
        resolve(m.result as ResultMap[K]);
      } else {
        release();
        reject(deserializeError(m.error));
      }
    };
    const crashed = () => {
      if (settled) return;
      release();
      reject(WORKER_FAILED());
    };
    worker.onerror = crashed;
    worker.onmessageerror = crashed;
    try {
      worker.postMessage(request);
    } catch {
      crashed();
    }
  });

  return {
    promise,
    cancel() {
      if (settled) return;
      release();
      rejectOuter?.(new PixtiError('CANCELLED', 'Cancelled.'));
    },
  };
}

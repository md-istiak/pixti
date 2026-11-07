import { useCallback, useEffect, useRef, useState } from 'react';
import { PixtiError, serializeError } from '../core/errors.ts';
import type { Stage } from '../core/progress.ts';
import { startJob } from '../workers/client.ts';
import type { Job } from '../workers/client.ts';
import type { JobKind, RequestOf, ResultMap } from '../workers/protocol.ts';

export type JobOutcome<T> =
  | { status: 'done'; result: T }
  | { status: 'error'; error: PixtiError }
  | { status: 'cancelled' }
  | { status: 'stale' };

export type JobState<T> =
  | { status: 'idle' }
  | { status: 'running'; stage: Stage | null; fraction: number | null }
  | { status: 'done'; result: T }
  | { status: 'error'; error: PixtiError }
  | { status: 'cancelled' };

/**
 * Runs one worker job at a time. Starting a new job cancels the previous one, and
 * unmounting terminates the worker, so no processing outlives the page that asked for it.
 */
export function useJob<K extends JobKind>() {
  const [state, setState] = useState<JobState<ResultMap[K]>>({ status: 'idle' });
  const current = useRef<Job<ResultMap[K]> | null>(null);

  const run = useCallback(async (request: RequestOf<K>): Promise<JobOutcome<ResultMap[K]>> => {
    current.current?.cancel();
    const job = startJob<K>(request, (stage, fraction) => {
      if (current.current === job) setState({ status: 'running', stage, fraction });
    });
    current.current = job;
    setState({ status: 'running', stage: null, fraction: null });
    try {
      const result = await job.promise;
      if (current.current !== job) return { status: 'stale' };
      setState({ status: 'done', result });
      return { status: 'done', result };
    } catch (e) {
      if (current.current !== job) return { status: 'stale' };
      if (e instanceof PixtiError && e.code === 'CANCELLED') {
        setState({ status: 'cancelled' });
        return { status: 'cancelled' };
      }
      const s = serializeError(e);
      const error = e instanceof PixtiError ? e : new PixtiError(s.code, s.message);
      setState({ status: 'error', error });
      return { status: 'error', error };
    }
  }, []);

  const cancel = useCallback(() => {
    current.current?.cancel();
  }, []);

  const reset = useCallback(() => {
    current.current?.cancel();
    current.current = null;
    setState({ status: 'idle' });
  }, []);

  useEffect(
    () => () => {
      current.current?.cancel();
      current.current = null;
    },
    [],
  );

  return { state, run, cancel, reset };
}

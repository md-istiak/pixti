import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/workers/handler.ts';
import { runJob } from '../src/workers/jobRunner.ts';
import type { WorkerFactory, WorkerLike } from '../src/workers/jobRunner.ts';
import type { WorkerMessage, WorkerRequest } from '../src/workers/protocol.ts';
import { DEFAULT_ENCODE_OPTIONS } from '../src/features/encode/encodeService.ts';
import { FAST_KDF, fileOf, randomData } from './helpers.ts';

/** In-process stand-in for a Worker that runs the real handler. */
class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  onmessageerror: WorkerLike['onmessageerror'] = null;
  terminated = false;
  postMessage(m: unknown): void {
    void handleRequest(m as WorkerRequest, (msg: WorkerMessage) => {
      if (!this.terminated) queueMicrotask(() => this.onmessage?.({ data: msg }));
    });
  }
  terminate(): void {
    this.terminated = true;
  }
}

const opts = { ...DEFAULT_ENCODE_OPTIONS, encrypt: false, kdfIterations: FAST_KDF };

describe('worker job runner', () => {
  it('runs encode -> inspect -> decode through the message protocol', async () => {
    const data = randomData(50_000);
    const workers: FakeWorker[] = [];
    const factory: WorkerFactory = () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    };
    const stages: string[] = [];
    const enc = await runJob<'encode'>(factory, { type: 'encode', file: fileOf('a.bin', data), options: opts }, (s) => {
      stages.push(s);
    }).promise;
    expect(stages).toContain('verify');
    const files = enc.documents.map((d) => new File([d.blob], d.fileName));
    const insp = await runJob<'inspect'>(factory, { type: 'inspect', files }).promise;
    expect(insp.canDecode).toBe(true);
    const dec = await runJob<'decode'>(factory, { type: 'decode', files }).promise;
    expect(dec.size).toBe(50_000);
    expect(workers.every((w) => w.terminated)).toBe(true); // one worker per job, always released
  });

  it('turns failures into sanitised errors with a code', async () => {
    const job = runJob<'decode'>(() => new FakeWorker(), { type: 'decode', files: [fileOf('x.pdf', randomData(100))] });
    await expect(job.promise).rejects.toMatchObject({ code: 'NOT_PIXTI_DOCUMENT' });
  });

  it('cancel terminates the worker and rejects with CANCELLED', async () => {
    const w = new FakeWorker();
    w.postMessage = () => undefined; // never answers
    const job = runJob<'encode'>(() => w, { type: 'encode', file: fileOf('a', randomData(10)), options: opts });
    job.cancel();
    await expect(job.promise).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(w.terminated).toBe(true);
    job.cancel(); // idempotent
  });

  it('a worker crash surfaces as WORKER_FAILED and releases the worker', async () => {
    const w = new FakeWorker();
    w.postMessage = () => queueMicrotask(() => w.onerror?.(new Error('boom: secret stack trace')));
    const job = runJob<'encode'>(() => w, { type: 'encode', file: fileOf('a', randomData(10)), options: opts });
    await expect(job.promise).rejects.toMatchObject({ code: 'WORKER_FAILED' });
    expect(w.terminated).toBe(true);
    await job.promise.catch((e: Error) => expect(e.message).not.toMatch(/secret/));
  });

  it('a worker that cannot be created is reported, not thrown', async () => {
    const job = runJob<'encode'>(
      () => {
        throw new Error('no workers here');
      },
      { type: 'encode', file: fileOf('a', randomData(10)), options: opts },
    );
    await expect(job.promise).rejects.toMatchObject({ code: 'WORKER_FAILED' });
  });

  it('an unexpected internal error never leaks details', async () => {
    const bad = { name: 'x', size: 3, arrayBuffer: async () => { throw new Error('/home/me/secret/path exploded'); } };
    const job = runJob<'encode'>(() => new FakeWorker(), { type: 'encode', file: bad, options: opts });
    await expect(job.promise).rejects.toMatchObject({ code: 'INTERNAL' });
    await job.promise.catch((e: Error) => expect(e.message).not.toMatch(/secret/));
  });
});

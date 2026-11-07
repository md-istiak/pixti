import { serializeError } from '../core/errors.ts';
import type { JobHooks } from '../core/progress.ts';
import { encodeFile } from '../features/encode/encodeService.ts';
import { decodeFiles, inspectFiles } from '../features/decode/decodeService.ts';
import type { WorkerMessage, WorkerRequest } from './protocol.ts';

/**
 * Runs one request and reports through `post`. Kept separate from the Worker entry
 * file so the whole protocol can be exercised in plain Node tests.
 */
export async function handleRequest(req: WorkerRequest, post: (m: WorkerMessage) => void): Promise<void> {
  const hooks: JobHooks = { onProgress: (stage, fraction) => post({ type: 'progress', stage, fraction }) };
  try {
    switch (req.type) {
      case 'encode':
        post({ type: 'result', result: await encodeFile(req.file, req.options, hooks) });
        break;
      case 'inspect':
        post({ type: 'result', result: await inspectFiles(req.files, hooks) });
        break;
      case 'decode':
        post({ type: 'result', result: await decodeFiles(req.files, req.password, hooks) });
        break;
    }
  } catch (e) {
    // Only a sanitised code + user-facing message ever leaves the worker.
    post({ type: 'error', error: serializeError(e) });
  }
}

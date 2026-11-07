import { handleRequest } from './handler.ts';
import type { WorkerMessage, WorkerRequest } from './protocol.ts';

const ctx = self as unknown as {
  postMessage(m: WorkerMessage): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};

// One job per worker instance. The client terminates the worker when the job ends or is
// cancelled, which releases every buffer the job allocated.
ctx.onmessage = (e) => {
  void handleRequest(e.data, (m) => ctx.postMessage(m));
};

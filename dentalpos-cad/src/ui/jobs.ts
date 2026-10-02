import type { JobRequest, JobResponse } from "../core/worker";
import { runJob } from "../core/worker";

let worker: Worker | null = null;
let seq = 1;
const pending = new Map<number, (r: JobResponse) => void>();
function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../core/worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<JobResponse>) => { pending.get(e.data.id)?.(e.data); pending.delete(e.data.id); };
    worker.onerror = () => { worker = null; };
  } catch { worker = null; }
  return worker;
}
type Distribute<T> = T extends unknown ? Omit<T, "id"> : never;
export function job(req: Distribute<JobRequest>): Promise<JobResponse> {
  const id = seq++;
  const full = { ...req, id } as JobRequest;
  const w = getWorker();
  if (!w) return new Promise((res) => setTimeout(() => res(runJob(full)), 20));
  return new Promise((res) => { pending.set(id, res); w.postMessage(full); });
}

import type { JobRequest, JobResponse } from "../core/worker";
import { runJob } from "../core/worker";

let worker: Worker | null = null;
let seq = 1;
const pending = new Map<number, (r: JobResponse) => void>();
const progressCb = new Map<number, (stage: string, p: number) => void>();
function getWorker(): Worker | null {
  if (worker) return worker;
  if (location.protocol === "file:") return null; // abrindo o HTML direto do disco: sem Web Worker, roda na thread principal
  try {
    worker = new Worker(new URL("../core/worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<JobResponse>) => { if (e.data.progress) { progressCb.get(e.data.id)?.(e.data.progress.stage, e.data.progress.p); return; } pending.get(e.data.id)?.(e.data); pending.delete(e.data.id); progressCb.delete(e.data.id); };
    worker.onerror = () => { worker = null; };
  } catch { worker = null; }
  return worker;
}
type Distribute<T> = T extends unknown ? Omit<T, "id"> : never;
export function job(req: Distribute<JobRequest>, onProgress?: (stage: string, p: number) => void): Promise<JobResponse> {
  const id = seq++;
  if (onProgress) progressCb.set(id, onProgress);
  const full = { ...req, id } as JobRequest;
  const w = getWorker();
  if (!w) return new Promise((res) => setTimeout(() => res(runJob(full, onProgress)), 20));
  return new Promise((res) => { pending.set(id, res); w.postMessage(full); });
}

/**
 * Bounded-concurrency job queue for video generation pipelines.
 * Distributes whole videos across Mac Minis (1 local + 2 remote).
 * Persists on globalThis to survive Next.js dev hot reloads.
 */

export type WorkerSlot =
  | { type: "local" }
  | { type: "remote"; host: string };

export interface QueueEntry {
  jobId: string;
  rawVideoPath: string;
  position: number;
  localOnly?: boolean;
}

const WORKERS: WorkerSlot[] = [
  { type: "local" },
  { type: "remote", host: "100.100.6.101" },
  { type: "remote", host: "100.68.192.57" },
];

const GLOBAL_KEY = "__vgen_job_queue__" as const;

interface QueueState {
  pending: QueueEntry[];
  active: Map<number, string>; // workerIndex → jobId
}

const store = globalThis as unknown as Record<string, QueueState>;
if (!store[GLOBAL_KEY]) {
  store[GLOBAL_KEY] = {
    pending: [],
    active: new Map(),
  };
}
const state = store[GLOBAL_KEY];

type PipelineRunner = (
  rawVideoPath: string,
  jobId: string,
  worker: WorkerSlot
) => Promise<void>;

const RUNNER_KEY = "__vgen_pipeline_runner__" as const;
const runnerStore = globalThis as unknown as Record<string, PipelineRunner | null>;
if (!runnerStore[RUNNER_KEY]) {
  runnerStore[RUNNER_KEY] = null;
}

export function registerPipelineRunner(runner: PipelineRunner): void {
  runnerStore[RUNNER_KEY] = runner;
}

function getRunner(): PipelineRunner | null {
  return runnerStore[RUNNER_KEY];
}

export function enqueueJob(
  rawVideoPath: string,
  jobId: string,
  opts?: { localOnly?: boolean }
): number {
  const position = state.pending.length + state.active.size + 1;
  state.pending.push({ jobId, rawVideoPath, position, localOnly: opts?.localOnly });
  updatePositions();
  drain();
  return position;
}

export function getQueuePosition(jobId: string): number | null {
  const entry = state.pending.find((e) => e.jobId === jobId);
  return entry ? entry.position : null;
}

export function getTotalQueued(): number {
  return state.pending.length;
}

export function getTotalActive(): number {
  return state.active.size;
}

function updatePositions(): void {
  for (let i = 0; i < state.pending.length; i++) {
    state.pending[i].position = i + 1;
  }
}

function findFreeWorkerIndex(localOnly?: boolean): number {
  for (let i = 0; i < WORKERS.length; i++) {
    if (state.active.has(i)) continue;
    if (localOnly && WORKERS[i].type !== "local") continue;
    return i;
  }
  return -1;
}

function drain(): void {
  let scheduled = true;
  while (scheduled && state.pending.length > 0) {
    scheduled = false;
    for (let i = 0; i < state.pending.length; i++) {
      const workerIdx = findFreeWorkerIndex(state.pending[i].localOnly);
      if (workerIdx === -1) continue;

      const [entry] = state.pending.splice(i, 1);
      updatePositions();
      state.active.set(workerIdx, entry.jobId);
      scheduled = true;

      const worker = WORKERS[workerIdx];
      console.log(
        `[job-queue] Starting job ${entry.jobId} on ${worker.type === "local" ? "local" : worker.host}`
      );

      const runner = getRunner();
      if (!runner) {
        console.error("[job-queue] No pipeline runner registered");
        state.active.delete(workerIdx);
        break;
      }

      runner(entry.rawVideoPath, entry.jobId, worker)
        .catch((err) => {
          console.error(`[job-queue] Job ${entry.jobId} failed:`, err.message);
        })
        .finally(() => {
          state.active.delete(workerIdx);
          console.log(
            `[job-queue] Job ${entry.jobId} finished on ${worker.type === "local" ? "local" : worker.host}, ` +
            `${state.pending.length} queued, ${state.active.size} active`
          );
          drain();
        });

      break; // re-scan from the top after scheduling one
    }
  }
}

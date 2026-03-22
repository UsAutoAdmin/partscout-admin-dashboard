export type JobPhase =
  | "queued"
  | "processing"
  | "done"
  | "error";

export interface HookResult {
  hookIndex: number;
  hookText: string;
  brollFile: string;
  outputFile: string;
}

export interface JobStatus {
  id: string;
  phase: JobPhase;
  currentHook: number;
  totalHooks: number;
  hookResults: HookResult[];
  error?: string;
  createdAt: number;
  completedAt?: number;
}

// Use globalThis to survive Next.js dev mode hot reloads
const globalKey = "__video_gen_jobs__" as const;
const globalStore = globalThis as unknown as Record<string, Map<string, JobStatus>>;
if (!globalStore[globalKey]) {
  globalStore[globalKey] = new Map<string, JobStatus>();
}
const jobs = globalStore[globalKey];

export function createJob(id: string, totalHooks: number): JobStatus {
  const job: JobStatus = {
    id,
    phase: "queued",
    currentHook: 0,
    totalHooks,
    hookResults: [],
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): JobStatus | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, patch: Partial<JobStatus>): void {
  const job = jobs.get(id);
  if (job) Object.assign(job, patch);
}

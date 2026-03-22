"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface BrollFile {
  name: string;
  sizeMb: number;
  modified: string;
}

interface HookResult {
  hookIndex: number;
  hookText: string;
  brollFile: string;
  outputFile: string;
}

interface JobStatus {
  id: string;
  phase: "queued" | "processing" | "done" | "error";
  currentHook: number;
  totalHooks: number;
  hookResults: HookResult[];
  error?: string;
  createdAt: number;
  completedAt?: number;
}

function DropZone({
  label,
  accept,
  multiple,
  files,
  onFiles,
}: {
  label: string;
  accept: string;
  multiple: boolean;
  files: File[];
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = Array.from(e.dataTransfer.files).filter((f) =>
        /\.(mp4|mov|mkv|avi|webm)$/i.test(f.name)
      );
      if (dropped.length > 0) onFiles(multiple ? dropped : [dropped[0]]);
    },
    [onFiles, multiple]
  );

  return (
    <div
      className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
        dragging
          ? "border-brand-400 bg-brand-50 dark:bg-brand-500/10"
          : files.length > 0
          ? "border-success-400/30 dark:border-success-500/30 bg-success-50 dark:bg-success-500/5"
          : "border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-white/[0.02] hover:border-gray-400 dark:hover:border-gray-600"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const selected = Array.from(e.target.files ?? []);
          if (selected.length > 0) onFiles(selected);
        }}
      />

      {files.length === 0 ? (
        <>
          <div className="flex justify-center mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gray-400">
                <path d="M12 16V8m0 0l-4 4m4-4l4 4M6.75 19.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</p>
          <p className="text-xs text-gray-500 mt-1">Drag & drop or click to browse</p>
          <p className="text-xs text-gray-400 mt-0.5">Supports 1:1, 16:9, 9:16 inputs</p>
        </>
      ) : (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-success-600 dark:text-success-400">
            {files.length} file{files.length !== 1 ? "s" : ""} selected
          </p>
          {files.map((f, i) => (
            <p key={i} className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {f.name} <span className="text-gray-400 dark:text-gray-500">({(f.size / 1024 / 1024).toFixed(1)} MB)</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Processing hook {current} of {total}
        </span>
        <span className="text-sm font-bold text-brand-600 dark:text-brand-400">{pct}%</span>
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function BulkSchedulePanel({ job }: { job: JobStatus }) {
  const router = useRouter();
  const [postType, setPostType] = useState<"reel" | "trial_reel">("trial_reel");
  const [startTime, setStartTime] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(6, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [intervalMin, setIntervalMin] = useState(15);
  const [scheduling, setScheduling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountConnected, setAccountConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/instagram/account")
      .then((r) => r.json())
      .then((d) => {
        setAccountConnected(d.connected);
        if (d.connected) setAccountId(d.id);
      })
      .catch(() => setAccountConnected(false));
  }, []);

  async function handleScheduleAll() {
    if (!accountId) return;
    setScheduling(true);
    setError(null);
    setProgress(0);

    try {
      const results = job.hookResults;
      const base = new Date(startTime);

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        setProgress(i + 1);

        const videoRes = await fetch(`/api/video-generator/output/${job.id}/${r.outputFile}`);
        const videoBlob = await videoRes.blob();
        const formData = new FormData();
        formData.append("video", videoBlob, r.outputFile);
        const uploadRes = await fetch("/api/scheduler/upload", { method: "POST", body: formData });
        const uploadData = await uploadRes.json();
        if (uploadData.error) throw new Error(uploadData.error);

        const scheduledAt = new Date(base.getTime() + i * intervalMin * 60 * 1000);

        const postRes = await fetch("/api/scheduler/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ig_account_id: accountId,
            video_storage_path: uploadData.storagePath,
            video_public_url: uploadData.publicUrl,
            caption: "",
            post_type: postType,
            graduation_strategy: postType === "trial_reel" ? "MANUAL" : null,
            scheduled_at: scheduledAt.toISOString(),
          }),
        });
        const postData = await postRes.json();
        if (postData.error) throw new Error(postData.error);
      }

      router.push("/scheduler");
    } catch (e: any) {
      setError(e.message);
      setScheduling(false);
    }
  }

  if (accountConnected === null) return null;

  if (!accountConnected) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90">Schedule to Instagram</h4>
            <p className="text-xs text-gray-500 mt-0.5">Connect your Instagram account to schedule these videos</p>
          </div>
          <a href="/api/instagram/auth" className="rounded-lg bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity">
            Connect Instagram
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-brand-200 dark:border-brand-500/20 bg-brand-50 dark:bg-brand-500/5 p-5">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90 mb-4">Schedule to Instagram</h4>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Post Type</label>
          <div className="flex gap-2">
            <button
              onClick={() => setPostType("trial_reel")}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                postType === "trial_reel"
                  ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
              }`}
            >
              Trial Reel
            </button>
            <button
              onClick={() => setPostType("reel")}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                postType === "reel"
                  ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
              }`}
            >
              Reel
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Start Time</label>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Interval</label>
          <select
            value={intervalMin}
            onChange={(e) => setIntervalMin(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value={5}>Every 5 min</option>
            <option value={10}>Every 10 min</option>
            <option value={15}>Every 15 min</option>
            <option value={30}>Every 30 min</option>
            <option value={60}>Every 1 hour</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2 mb-3">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <button
        onClick={handleScheduleAll}
        disabled={scheduling}
        className="w-full sm:w-auto rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black px-6 py-2.5 text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {scheduling
          ? `Uploading ${progress}/${job.hookResults.length}...`
          : `Schedule ${job.hookResults.length} Videos as ${postType === "trial_reel" ? "Trial Reels" : "Reels"}`}
      </button>
    </div>
  );
}

export default function VideoGenerator() {
  const [hooks, setHooks] = useState<File[]>([]);
  const [body, setBody] = useState<File[]>([]);
  const [generating, setGenerating] = useState(false);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [hookTexts, setHookTexts] = useState<string[]>([]);
  const [brollFiles, setBrollFiles] = useState<BrollFile[]>([]);
  const [brollLoading, setBrollLoading] = useState(true);
  const [uploadingBroll, setUploadingBroll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const brollInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadBroll();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function loadBroll() {
    setBrollLoading(true);
    try {
      const res = await fetch("/api/video-generator/broll");
      const data = await res.json();
      setBrollFiles(data.files ?? []);
    } catch { setBrollFiles([]); }
    setBrollLoading(false);
  }

  async function uploadBroll(files: FileList) {
    setUploadingBroll(true);
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));
    try {
      await fetch("/api/video-generator/broll", { method: "POST", body: formData });
      await loadBroll();
    } catch {}
    setUploadingBroll(false);
  }

  async function handleGenerate() {
    if (hooks.length === 0 || body.length === 0) return;
    if (brollFiles.length === 0) {
      setError("Upload at least one B-roll clip before generating.");
      return;
    }

    setGenerating(true);
    setError(null);
    setJob(null);
    setHookTexts([]);

    const formData = new FormData();
    hooks.forEach((h, i) => formData.append(`hook_${i}`, h));
    formData.append("body", body[0]);

    try {
      const res = await fetch("/api/video-generator/generate", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) { setError(data.error); setGenerating(false); return; }

      setHookTexts(data.hookTexts);
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/video-generator/status/${data.jobId}`);
          const status: JobStatus = await statusRes.json();
          setJob(status);
          if (status.phase === "done" || status.phase === "error") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setGenerating(false);
            if (status.phase === "error") setError(status.error ?? "Unknown error");
          }
        } catch {}
      }, 1500);
    } catch (err: any) {
      setError(err.message);
      setGenerating(false);
    }
  }

  function reset() {
    setHooks([]);
    setBody([]);
    setJob(null);
    setHookTexts([]);
    setError(null);
    setGenerating(false);
    if (pollRef.current) clearInterval(pollRef.current);
  }

  const canGenerate = hooks.length > 0 && body.length > 0 && !generating;

  return (
    <DashboardLayout title="Video Generator">
      <div className="space-y-6">
        {/* B-Roll Library */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90">B-Roll Library</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {brollLoading ? "Loading..." : `${brollFiles.length} clip${brollFiles.length !== 1 ? "s" : ""} available`}
              </p>
            </div>
            <div>
              <input
                ref={brollInputRef}
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files && e.target.files.length > 0) uploadBroll(e.target.files); }}
              />
              <button
                onClick={() => brollInputRef.current?.click()}
                disabled={uploadingBroll}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
              >
                {uploadingBroll ? "Uploading..." : "Upload B-Roll"}
              </button>
            </div>
          </div>

          {brollFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {brollFiles.map((f) => (
                <span key={f.name} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                  <span className="text-brand-500 dark:text-brand-400">&#9654;</span>
                  {f.name}
                  <span className="text-gray-400 dark:text-gray-500">({f.sizeMb} MB)</span>
                </span>
              ))}
            </div>
          )}

          {!brollLoading && brollFiles.length === 0 && (
            <p className="text-xs text-warning-600 dark:text-warning-400 bg-warning-50 dark:bg-warning-500/5 border border-warning-400/20 dark:border-warning-500/20 rounded-lg px-3 py-2">
              No B-roll clips found. Upload clips or copy them to <code className="font-mono text-xs">media/broll/</code>
            </p>
          )}
        </div>

        {/* Upload Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DropZone label="Drop 5 Hook Clips" accept="video/*" multiple files={hooks} onFiles={setHooks} />
          <DropZone label="Drop 1 Edited Body" accept="video/*" multiple={false} files={body} onFiles={setBody} />
        </div>

        {/* Hook Texts Preview */}
        {hookTexts.length > 0 && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90 mb-3">Assigned Hook Texts</h4>
            <div className="flex flex-wrap gap-2">
              {hookTexts.map((t, i) => (
                <span key={i} className="rounded-lg bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/20 px-3 py-1.5 text-xs font-bold text-brand-600 dark:text-brand-400">
                  Hook {i + 1}: {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Generate Button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="rounded-xl bg-brand-500 px-8 py-3 text-base font-bold text-white shadow-theme-sm hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generating ? "Generating..." : `Generate ${hooks.length || 5} Videos`}
          </button>
          {(job || error) && (
            <button onClick={reset} className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Reset
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-error-300 dark:border-error-500/20 bg-error-50 dark:bg-error-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-error-600 dark:text-error-400">Error</p>
            <p className="text-sm text-error-500 dark:text-error-300 mt-1">{error}</p>
          </div>
        )}

        {/* Progress */}
        {job && job.phase === "processing" && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
            <ProgressBar current={job.currentHook} total={job.totalHooks} />
          </div>
        )}

        {/* Results */}
        {job && job.phase === "done" && job.hookResults.length > 0 && (
          <div className="rounded-2xl border border-success-300 dark:border-success-500/20 bg-success-50 dark:bg-success-500/5 overflow-hidden">
            <div className="px-5 py-4 border-b border-success-200 dark:border-success-500/20">
              <h4 className="font-bold text-success-600 dark:text-success-400">
                {job.hookResults.length} Videos Ready
              </h4>
              <p className="text-xs text-success-500/70 mt-0.5">
                Completed in {((job.completedAt! - job.createdAt) / 1000).toFixed(1)}s
              </p>
            </div>
            <div className="divide-y divide-success-200 dark:divide-success-500/10">
              {job.hookResults.map((r) => (
                <div key={r.hookIndex} className="flex items-center justify-between px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white/90">Video {r.hookIndex + 1}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Hook: &ldquo;{r.hookText}&rdquo; &middot; B-Roll: {r.brollFile}
                    </p>
                  </div>
                  <a
                    href={`/api/video-generator/output/${job.id}/${r.outputFile}`}
                    download
                    className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
                  >
                    Download
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bulk Schedule */}
        {job && job.phase === "done" && job.hookResults.length > 0 && (
          <BulkSchedulePanel job={job} />
        )}

        {/* Info */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90 mb-3">How It Works</h4>
          <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside">
            <li>Upload B-roll clips to the library (one-time setup)</li>
            <li>Drop your <span className="text-gray-900 dark:text-gray-200 font-medium">5 trimmed hook clips</span> and <span className="text-gray-900 dark:text-gray-200 font-medium">1 fully edited body</span></li>
            <li>Each hook gets: random B-roll (top) + talking head (bottom) + color grading + centered text + riser SFX</li>
            <li>Each processed hook is concatenated with the body to produce 5 final videos</li>
          </ol>
          <div className="mt-4 text-xs text-gray-500 border-t border-gray-200 dark:border-gray-800 pt-3">
            <p><span className="text-gray-600 dark:text-gray-400 font-medium">Supported input formats:</span> 1:1 square (DJI Mini), 16:9 landscape (YouTube), 9:16 portrait — auto-scaled to fill</p>
            <p className="mt-1">
              <span className="text-gray-600 dark:text-gray-400 font-medium">Optional assets:</span> Place{" "}
              <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400">grade.cube</code> (LUT) and{" "}
              <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400">riser.mp3</code> in{" "}
              <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400">media/assets/</code>
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

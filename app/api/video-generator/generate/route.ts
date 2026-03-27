import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { UPLOADS_DIR, OUTPUT_DIR } from "@/lib/video-generator/constants";
import { createJob, updateJob } from "@/lib/video-generator/job-store";
import { processHookWithBody } from "@/lib/video-generator/ffmpeg-pipeline";
import { composeBody, OverlayEntry } from "@/lib/video-generator/body-pipeline";
import {
  REMOTE_WORKERS,
  checkRemoteAvailable,
  processHookWithBodyRemote,
} from "@/lib/video-generator/remote-ffmpeg";

interface OverlayInput {
  slot: "part" | "car" | "price" | "soldPrice";
  filename: string;
  timestamp: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId, overlays: overlayInputs, hookTexts: inputHookTexts } = body as {
      jobId: string;
      overlays: OverlayInput[];
      hookTexts?: string[];
    };

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const jobDir = path.join(UPLOADS_DIR, jobId);
    const outputDir = path.join(OUTPUT_DIR, jobId);
    await fs.mkdir(outputDir, { recursive: true });

    const files = await fs.readdir(jobDir);
    const hookFiles = files
      .filter((f) => /^hook_\d+\.mp4$/.test(f))
      .sort((a, b) => {
        const ai = parseInt(a.match(/\d+/)![0]);
        const bi = parseInt(b.match(/\d+/)![0]);
        return ai - bi;
      });

    const bodySegmentPath = path.join(jobDir, "body_segment.mp4");
    try {
      await fs.access(bodySegmentPath);
    } catch {
      return NextResponse.json({ error: "body_segment.mp4 not found — run split-segments first" }, { status: 400 });
    }

    if (hookFiles.length === 0) {
      return NextResponse.json({ error: "No hook segments found — run split-segments first" }, { status: 400 });
    }

    const totalHooks = hookFiles.length;
    const job = createJob(jobId, totalHooks);
    updateJob(jobId, { phase: "processing" });

    const overlayEntries: OverlayEntry[] = (overlayInputs ?? [])
      .filter((o) => o.filename && o.timestamp !== undefined)
      .map((o) => ({
        slot: o.slot,
        imagePath: path.join(jobDir, o.filename),
        timestamp: o.timestamp,
      }));

    (async () => {
      try {
        const composedBodyPath = path.join(jobDir, "body_composed.mp4");
        await composeBody(bodySegmentPath, overlayEntries, composedBodyPath);

        // Discover available remote workers (SSH + FFmpeg reachable)
        const availableRemotes: string[] = [];
        const checks = await Promise.all(
          REMOTE_WORKERS.map(async (w) => ({
            host: w.host,
            label: w.label,
            ok: await checkRemoteAvailable(w.host),
          }))
        );
        for (const c of checks) {
          if (c.ok) {
            availableRemotes.push(c.host);
            console.log(`[vgen] Remote worker ${c.label} (${c.host}) available`);
          } else {
            console.log(`[vgen] Remote worker ${c.label} (${c.host}) unavailable, skipping`);
          }
        }

        // Build a pool: local slot + each available remote
        // Round-robin assign hooks to workers for maximum parallelism
        type Worker = { type: "local" } | { type: "remote"; host: string };
        const workers: Worker[] = [{ type: "local" }];
        for (const host of availableRemotes) {
          workers.push({ type: "remote", host });
        }

        console.log(`[vgen] Processing ${hookFiles.length} hooks across ${workers.length} workers`);

        let completed = 0;
        const pending = hookFiles.map((file, idx) => ({ file, idx }));

        // Process all hooks concurrently, one per worker at a time
        const processNext = async (worker: Worker): Promise<void> => {
          while (pending.length > 0) {
            const item = pending.shift();
            if (!item) return;
            const { file, idx } = item;
            const hookPath = path.join(jobDir, file);
            const outputFile = `video_${idx + 1}.mp4`;
            const outputPath = path.join(outputDir, outputFile);

            const hookText = inputHookTexts?.[idx] || undefined;
            let brollFile: string;
            try {
              if (worker.type === "remote") {
                const result = await processHookWithBodyRemote(
                  hookPath,
                  composedBodyPath,
                  outputPath,
                  worker.host
                );
                brollFile = result.brollFile;
              } else {
                const result = await processHookWithBody(
                  hookPath,
                  composedBodyPath,
                  outputPath,
                  hookText
                );
                brollFile = result.brollFile;
              }
            } catch (err: any) {
              if (worker.type === "remote") {
                console.log(`[vgen] Remote ${worker.host} failed for hook ${idx}, falling back to local: ${err.message}`);
                const result = await processHookWithBody(
                  hookPath,
                  composedBodyPath,
                  outputPath,
                  hookText
                );
                brollFile = result.brollFile;
              } else {
                throw err;
              }
            }

            job.hookResults.push({
              hookIndex: idx,
              hookText: hookText || `Hook ${idx + 1}`,
              brollFile,
              outputFile,
            });
            completed++;
            updateJob(jobId, { currentHook: completed });
          }
        };

        await Promise.all(workers.map((w) => processNext(w)));

        updateJob(jobId, { phase: "done", completedAt: Date.now() });
      } catch (err: any) {
        updateJob(jobId, { phase: "error", error: err.message, completedAt: Date.now() });
      }
    })();

    return NextResponse.json({
      jobId,
      totalHooks,
      hookTexts: hookFiles.map((_, i) => `Hook ${i + 1}`),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

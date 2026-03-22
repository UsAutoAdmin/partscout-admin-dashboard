import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { UPLOADS_DIR, OUTPUT_DIR, HOOKS_PER_BATCH } from "@/lib/video-generator/constants";
import { createJob, updateJob } from "@/lib/video-generator/job-store";
import { getRandomHookTexts } from "@/lib/video-generator/hook-text-library";
import { processAllHooks } from "@/lib/video-generator/ffmpeg-pipeline";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const hookFiles: File[] = [];
    for (let i = 0; i < HOOKS_PER_BATCH; i++) {
      const f = formData.get(`hook_${i}`) as File | null;
      if (f) hookFiles.push(f);
    }
    const bodyFile = formData.get("body") as File | null;

    if (hookFiles.length === 0)
      return NextResponse.json({ error: "No hook files provided" }, { status: 400 });
    if (!bodyFile)
      return NextResponse.json({ error: "No body file provided" }, { status: 400 });

    const jobId = crypto.randomUUID();
    const jobUploadDir = path.join(UPLOADS_DIR, jobId);
    const jobOutputDir = path.join(OUTPUT_DIR, jobId);
    await fs.mkdir(jobUploadDir, { recursive: true });
    await fs.mkdir(jobOutputDir, { recursive: true });

    const hookPaths: string[] = [];
    for (let i = 0; i < hookFiles.length; i++) {
      const dest = path.join(jobUploadDir, `hook_${i}.mp4`);
      const buf = Buffer.from(await hookFiles[i].arrayBuffer());
      await fs.writeFile(dest, buf);
      hookPaths.push(dest);
    }

    const bodyPath = path.join(jobUploadDir, "body.mp4");
    const bodyBuf = Buffer.from(await bodyFile.arrayBuffer());
    await fs.writeFile(bodyPath, bodyBuf);

    const hookTexts = getRandomHookTexts(hookFiles.length);
    const job = createJob(jobId, hookFiles.length);

    processAllHooks(hookPaths, bodyPath, hookTexts, jobOutputDir, (idx, brollFile, outputFile) => {
      job.hookResults.push({
        hookIndex: idx,
        hookText: hookTexts[idx],
        brollFile,
        outputFile,
      });
      updateJob(jobId, { currentHook: idx + 1 });
    })
      .then(() => {
        updateJob(jobId, { phase: "done", completedAt: Date.now() });
        fs.rm(jobUploadDir, { recursive: true }).catch(() => {});
      })
      .catch((err) => {
        updateJob(jobId, { phase: "error", error: err.message, completedAt: Date.now() });
      });

    updateJob(jobId, { phase: "processing" });

    return NextResponse.json({
      jobId,
      hookTexts,
      totalHooks: hookFiles.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

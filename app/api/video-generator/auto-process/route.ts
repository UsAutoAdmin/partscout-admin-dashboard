import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { UPLOADS_DIR, OUTPUT_DIR } from "@/lib/video-generator/constants";
import {
  startAutoPipeline,
  getAutoJob,
  getAllAutoJobs,
  removeAutoJob,
} from "@/lib/video-generator/auto-pipeline";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("video") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    const jobId = crypto.randomUUID();
    const jobDir = path.join(UPLOADS_DIR, jobId);
    await fs.mkdir(jobDir, { recursive: true });

    const rawPath = path.join(jobDir, "raw.mp4");
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(rawPath, buf);

    const localOnly = formData.get("localOnly") === "1";
    const job = await startAutoPipeline(rawPath, jobId, { localOnly });

    return NextResponse.json({ jobId: job.id, phase: job.phase });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (jobId) {
    const job = getAutoJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(job);
  }

  return NextResponse.json({ jobs: getAllAutoJobs() });
}

export async function PATCH(req: NextRequest) {
  try {
    const { jobId, hookIndex, flagged } = await req.json();
    if (!jobId || hookIndex == null || flagged == null) {
      return NextResponse.json({ error: "jobId, hookIndex, and flagged are required" }, { status: 400 });
    }

    const job = getAutoJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (!job.hookFlags) job.hookFlags = [];

    const existing = job.hookFlags.find((f) => f.index === hookIndex);
    if (existing) {
      existing.flagged = flagged;
      if (flagged && !existing.reason) existing.reason = "Manually flagged";
      if (!flagged) existing.reason = undefined;
    } else {
      job.hookFlags.push({ index: hookIndex, flagged, reason: flagged ? "Manually flagged" : undefined });
    }

    return NextResponse.json({ ok: true, hookFlags: job.hookFlags });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }

    removeAutoJob(jobId);

    const rmDir = async (dir: string) => {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {}
    };

    await Promise.all([
      rmDir(path.join(UPLOADS_DIR, jobId)),
      rmDir(path.join(OUTPUT_DIR, jobId)),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

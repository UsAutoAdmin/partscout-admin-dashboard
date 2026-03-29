import { NextRequest, NextResponse } from "next/server";
import { getAutoJob } from "@/lib/video-generator/auto-pipeline";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = getAutoJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    phase: job.phase,
    videoName: job.videoName,
    segments: job.segments ?? null,
    transcript: job.transcript ?? null,
    overlayDetection: job.overlayDetection ?? null,
    overlaySlots: job.overlaySlots ?? null,
    hookTexts: job.hookTexts ?? null,
    hookFlags: job.hookFlags ?? null,
    outputFiles: job.outputFiles,
    error: job.error,
  });
}

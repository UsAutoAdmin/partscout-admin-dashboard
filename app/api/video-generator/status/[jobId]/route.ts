import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/video-generator/job-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const job = getJob(params.jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json(job);
}

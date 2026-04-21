import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const QUEUE_FILE = path.join(process.cwd(), "data", "release-queue", "queue.json");

export async function GET() {
  if (!fs.existsSync(QUEUE_FILE)) {
    return NextResponse.json({
      generatedAt: null,
      target: 0,
      criteria: null,
      stats: null,
      parts: [],
    });
  }
  const payload = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
  return NextResponse.json(payload);
}

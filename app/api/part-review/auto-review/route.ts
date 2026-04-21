import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const RESULTS_FILE = path.join(process.cwd(), "data", "part-review", "auto-review-results.json");

export async function GET() {
  if (!fs.existsSync(RESULTS_FILE)) {
    return NextResponse.json({
      summary: {
        generatedAt: null,
        totalParts: 0,
        rescraped: 0,
        pending: 0,
        classifications: {},
        tierMatrix: {},
      },
      parts: [],
    });
  }
  const payload = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8"));
  return NextResponse.json(payload);
}

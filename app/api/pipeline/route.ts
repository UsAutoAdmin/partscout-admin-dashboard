import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const STATE_PATH = resolve(process.cwd(), "data/pipeline/state.json");
const LOG_PATH = resolve(process.cwd(), "data/pipeline/log.jsonl");

function readState() {
  if (!existsSync(STATE_PATH)) return null;
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}

function readRecentLogs(limit = 200): Array<{ ts: string; level: string; message: string }> {
  const logs: Array<{ ts: string; level: string; message: string }> = [];

  // Inline logs from state.json
  const state = readState();
  if (state?.log) logs.push(...state.log);

  // Append from streaming log file if it exists
  if (existsSync(LOG_PATH)) {
    const lines = readFileSync(LOG_PATH, "utf8").trim().split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        logs.push(JSON.parse(line));
      } catch {}
    }
  }

  logs.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return logs.slice(0, limit);
}

export async function GET() {
  const state = readState();
  if (!state) {
    return NextResponse.json({ error: "Pipeline state not initialized" }, { status: 404 });
  }

  const logs = readRecentLogs();
  return NextResponse.json({ ...state, log: logs });
}

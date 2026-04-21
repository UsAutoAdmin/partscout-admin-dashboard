import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

type MachineRun = {
  name: string;
  ip: string;
  kind: string;
  ok: boolean;
  deepStatus: string;
  action: string;
  error: string;
};

type WatchdogRun = {
  id: string;
  timestamp: string;
  ok: boolean;
  machines: MachineRun[];
};

const RUNS_DIR = path.join(process.cwd(), "data", "watchdog-runs");

export async function GET() {
  try {
    if (!fs.existsSync(RUNS_DIR)) {
      return NextResponse.json({ runs: [] });
    }

    const files = fs
      .readdirSync(RUNS_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();

    const runs: WatchdogRun[] = files.map((f) => {
      const raw = fs.readFileSync(path.join(RUNS_DIR, f), "utf-8");
      return JSON.parse(raw);
    });

    return NextResponse.json({ runs });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read watchdog runs", detail: String(err) },
      { status: 500 }
    );
  }
}

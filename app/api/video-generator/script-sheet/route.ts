import { NextRequest, NextResponse } from "next/server";
import {
  parseScriptSheet,
  setScriptEntries,
  getScriptEntries,
  clearScriptEntries,
} from "@/lib/video-generator/script-sheet";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const entries = await parseScriptSheet(buf);
    setScriptEntries(entries);

    console.log(`[script-sheet] Parsed ${entries.length} entries from "${file.name}"`);
    for (const e of entries) {
      console.log(`[script-sheet]   ${e.year || "?"} ${e.make} ${e.model} — ${e.part}`);
    }

    return NextResponse.json({
      count: entries.length,
      entries: entries.map((e) => ({
        year: e.year,
        make: e.make,
        model: e.model,
        part: e.part,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  const entries = getScriptEntries();
  return NextResponse.json({
    count: entries.length,
    entries: entries.map((e) => ({
      year: e.year,
      make: e.make,
      model: e.model,
      part: e.part,
    })),
  });
}

export async function DELETE() {
  clearScriptEntries();
  return NextResponse.json({ ok: true });
}

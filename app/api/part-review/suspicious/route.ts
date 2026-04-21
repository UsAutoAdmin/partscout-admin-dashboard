import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "data", "part-review", "suspicious-parts.json");
const RESULTS_FILE = path.join(
  process.env.HOME ?? "",
  "Downloads",
  "Seed Database",
  "suspicious-rescrape-results.json"
);
const SUMMARY_FILE = path.join(process.cwd(), "data", "part-review", "expand-summary.json");

export async function GET() {
  if (!fs.existsSync(FILE)) {
    return NextResponse.json({ parts: [], stats: null, summary: null });
  }

  const parts = JSON.parse(fs.readFileSync(FILE, "utf8"));

  // Merge in active-rescrape results if present (keyed by scrape_id)
  let rescraped = 0;
  if (fs.existsSync(RESULTS_FILE)) {
    try {
      const results: Array<{ id: string; new_active: number }> = JSON.parse(
        fs.readFileSync(RESULTS_FILE, "utf8"),
      );
      const byId = new Map(results.map((r) => [r.id, r.new_active]));
      for (const p of parts) {
        if (p.scrape_id && byId.has(p.scrape_id)) {
          p.new_active = byId.get(p.scrape_id);
          if (p.new_active > 0 && p.sold_volume) {
            p.new_sell_through = (Number(p.sold_volume) / p.new_active) * 100;
          } else {
            p.new_sell_through = null;
          }
          rescraped++;
        }
      }
    } catch {
      /* ignore */
    }
  }

  let summary = null;
  if (fs.existsSync(SUMMARY_FILE)) {
    try {
      summary = JSON.parse(fs.readFileSync(SUMMARY_FILE, "utf8"));
    } catch {
      /* ignore */
    }
  }

  const stats = {
    total: parts.length,
    rescraped,
    pending: parts.length - rescraped,
    bySellThrough: {
      "500-1000": parts.filter((p: any) => p.sell_through < 1000).length,
      "1000-2000": parts.filter((p: any) => p.sell_through >= 1000 && p.sell_through < 2000).length,
      "2000-5000": parts.filter((p: any) => p.sell_through >= 2000 && p.sell_through < 5000).length,
      "5000+": parts.filter((p: any) => p.sell_through >= 5000).length,
    },
  };

  return NextResponse.json({ parts, stats, summary });
}

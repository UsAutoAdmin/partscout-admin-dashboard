import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const RESULTS_FILE = path.join(process.cwd(), "data", "cross-compat-results.json");

type CrossCompatResult = {
  scored_part_id: string;
  scrape_id: string;
  base_year: number | null;
  base_make: string;
  base_model: string;
  base_part: string;
  compatible_year_start: number | null;
  compatible_year_end: number | null;
  compatible_makes: string[];
  compatible_models: string[];
  trims: string[];
  confidence: number;
  title_count: number;
  source_titles: string[];
};

function readResults(): CrossCompatResult[] {
  if (!fs.existsSync(RESULTS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8"));
  } catch {
    return [];
  }
}

export async function GET() {
  const results = readResults();

  const byPartId = new Map<string, CrossCompatResult>();
  for (const r of results) {
    byPartId.set(r.scored_part_id, r);
  }

  const stats = {
    total: results.length,
    withYearRange: results.filter(
      (r) => r.compatible_year_start && r.compatible_year_end
    ).length,
    withCrossMakes: results.filter((r) => r.compatible_makes.length > 0).length,
    withCrossModels: results.filter(
      (r) => r.compatible_models.length > 0
    ).length,
    avgConfidence:
      results.length > 0
        ? Math.round(
            (results.reduce((s, r) => s + r.confidence, 0) / results.length) *
              100
          ) / 100
        : 0,
  };

  return NextResponse.json({ stats, results });
}

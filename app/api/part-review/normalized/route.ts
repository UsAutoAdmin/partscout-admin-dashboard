import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "data", "part-review", "normalized-parts.json");

export async function GET() {
  if (!fs.existsSync(FILE)) {
    return NextResponse.json({ parts: [], stats: { total: 0, withCompat: 0, withImage: 0, withCog: 0, multiYear: 0 } });
  }

  const parts = JSON.parse(fs.readFileSync(FILE, "utf8"));

  const stats = {
    total: parts.length,
    withCompat: parts.filter((p: any) => p.year_start !== p.year_end || p.compatible_makes?.length > 0).length,
    withImage: parts.filter((p: any) => p.best_image_url).length,
    withCog: parts.filter((p: any) => p.cog).length,
    multiYear: parts.filter((p: any) => p.source_count > 1).length,
  };

  return NextResponse.json({ parts, stats });
}

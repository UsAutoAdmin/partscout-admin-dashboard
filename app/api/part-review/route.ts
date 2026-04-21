import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const QUEUE_FILE = path.join(process.cwd(), "data", "part-review", "queue.json");

type QueueItem = {
  queue_position: number;
  scored_part_id: string;
  year: number;
  make: string;
  model: string;
  part_name: string;
  variation_name: string | null;
  avg_sell_price: number;
  original_sell_through: number;
  original_sold_volume: number;
  sold_confidence: number;
  profit_margin: number;
  cog: number | null;
  price_consistency: number | null;
  best_image_url: string | null;
  ebay_url: string | null;
  status: "pending" | "scraped" | "removed";
  new_active_count: number | null;
  new_sold_count: number | null;
  new_sell_through: number | null;
  st_change_pct: number | null;
  removed: boolean;
  remove_reason: string | null;
  scraped_at: string | null;
};

function readQueue(): QueueItem[] {
  if (!fs.existsSync(QUEUE_FILE)) return [];
  return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
}

export async function GET() {
  const queue = readQueue();

  const pending = queue.filter((q) => q.status === "pending");
  const scraped = queue.filter((q) => q.status === "scraped" && !q.removed);
  const removed = queue.filter((q) => q.removed);

  const stats = {
    total: queue.length,
    pending: pending.length,
    completed: scraped.length,
    removed: removed.length,
    progress: queue.length > 0
      ? Math.round(((scraped.length + removed.length) / queue.length) * 100)
      : 0,
  };

  return NextResponse.json({ stats, pending, scraped, removed });
}

import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import {
  findPriceCard,
  clearPriceCatalogCache,
} from "@/lib/video-generator/price-lookup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = getServiceRoleClient();

  let force = false;
  try {
    const body = await req.json();
    force = Boolean(body?.force);
  } catch {
    // no body or invalid JSON — default to non-force
  }

  if (force) clearPriceCatalogCache();

  const query = supabase
    .from("Video_Parts_for_research")
    .select("id, part")
    .order("id");

  if (!force) query.is("part_price", null);

  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ matched: 0, unmatched: 0, total: 0 });
  }

  let matched = 0;
  let unmatched = 0;

  const BATCH = 10;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    await Promise.all(
      batch.map(async (row) => {
        const partName = (row.part ?? "").trim();
        if (!partName) {
          unmatched++;
          return;
        }

        try {
          const card = await findPriceCard(partName);
          if (!card) {
            unmatched++;
            return;
          }

          const { error: updateErr } = await supabase
            .from("Video_Parts_for_research")
            .update({
              part_price: card.price,
              part_price_card_url: card.image_url,
              part_price_matched_name: card.part_name,
            })
            .eq("id", row.id);

          if (updateErr) {
            console.error(
              `[match-prices] Failed to update row ${row.id}:`,
              updateErr.message
            );
            unmatched++;
          } else {
            matched++;
          }
        } catch (err: any) {
          console.error(
            `[match-prices] Error matching "${partName}":`,
            err.message
          );
          unmatched++;
        }
      })
    );
  }

  console.log(
    `[match-prices] Done: ${matched} matched, ${unmatched} unmatched out of ${rows.length}`
  );

  return NextResponse.json({
    matched,
    unmatched,
    total: rows.length,
  });
}

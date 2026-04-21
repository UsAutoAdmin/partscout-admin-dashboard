/**
 * Inserts normalized parts from data/part-review/normalized-parts.json
 * into 6_user_database_parts and 7_user_part_alternate_fitments for specified users.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const envContent = readFileSync(resolve(import.meta.dirname, "../.env.local"), "utf8");
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const USER_IDS = process.argv.slice(2);
if (USER_IDS.length === 0) {
  console.error("Usage: npx tsx scripts/insert-normalized-parts.mjs <user_id1> [user_id2] ...");
  process.exit(1);
}

const parts = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../data/part-review/normalized-parts.json"), "utf8"),
);
console.log(`Loaded ${parts.length} normalized parts`);
console.log(`Inserting for ${USER_IDS.length} user(s): ${USER_IDS.join(", ")}\n`);

async function getExistingParts(userId) {
  const existing = new Set();
  let offset = 0;
  while (true) {
    const { data } = await sb
      .from("6_user_database_parts")
      .select("year, make, model, part_name")
      .eq("user_id", userId)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      existing.add(`${r.year}|${(r.make || "").toLowerCase()}|${(r.model || "").toLowerCase()}|${(r.part_name || "").toLowerCase()}`);
    }
    offset += 1000;
    if (data.length < 1000) break;
  }
  return existing;
}

async function insertForUser(userId) {
  console.log(`--- ${userId} ---`);
  const existing = await getExistingParts(userId);
  console.log(`  Existing parts: ${existing.size}`);

  let inserted = 0;
  let skipped = 0;
  let fitments = 0;

  for (const p of parts) {
    const dedupeKey = `${p.primary_year}|${p.make.toLowerCase()}|${p.model.toLowerCase()}|${p.part_name.toLowerCase()}`;
    if (existing.has(dedupeKey)) {
      skipped++;
      continue;
    }

    const row = {
      user_id: userId,
      year: p.primary_year,
      make: p.make,
      model: p.model,
      part_name: p.part_name,
      variation: p.variation || null,
      number_sold_90d: p.sold_volume || 0,
      number_active: p.active_count || 0,
      sell_through: p.sell_through || 0,
      sell_price: Math.round(p.avg_sell_price || 0),
      average_cog: p.cog ? Math.round(p.cog) : null,
      image_url: p.best_image_url || null,
      needs_review: false,
      manually_verified: "pending",
      quantity: 0,
    };

    const { data: insertedRow, error } = await sb
      .from("6_user_database_parts")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      console.error(`  Error inserting ${p.make} ${p.model} ${p.part_name}: ${error.message}`);
      continue;
    }

    inserted++;
    const partId = insertedRow.id;

    // Insert alternate fitments: all years for this part
    const fitmentRows = [];
    for (const y of p.all_years) {
      fitmentRows.push({
        database_part_id: partId,
        year: y,
        make: p.make,
        model: p.model,
        source: "AUTO",
      });
    }

    // Add cross-compatible models
    if (p.compatible_models && p.compatible_models.length > 0) {
      for (const cm of p.compatible_models) {
        const ccMake = p.compatible_makes?.[0] || p.make;
        for (let y = p.year_start; y <= p.year_end; y++) {
          fitmentRows.push({
            database_part_id: partId,
            year: y,
            make: ccMake,
            model: cm,
            source: "AUTO",
          });
        }
      }
    }

    // Also add cross-compatible makes with same model
    if (p.compatible_makes && p.compatible_makes.length > 0) {
      for (const cm of p.compatible_makes) {
        if (cm.toLowerCase() === p.make.toLowerCase()) continue;
        for (let y = p.year_start; y <= p.year_end; y++) {
          fitmentRows.push({
            database_part_id: partId,
            year: y,
            make: cm,
            model: p.model,
            source: "AUTO",
          });
        }
      }
    }

    // Batch insert fitments (50 at a time)
    for (let i = 0; i < fitmentRows.length; i += 50) {
      const batch = fitmentRows.slice(i, i + 50);
      const { error: fitErr } = await sb.from("7_user_part_alternate_fitments").insert(batch);
      if (fitErr) {
        console.error(`  Fitment error for ${p.part_name}: ${fitErr.message}`);
        break;
      }
      fitments += batch.length;
    }

    if (inserted % 100 === 0) {
      process.stdout.write(`\r  Inserted: ${inserted}, skipped: ${skipped}, fitments: ${fitments}`);
    }
  }

  console.log(`\r  Done: ${inserted} parts inserted, ${skipped} skipped (already existed), ${fitments} fitments`);
  return { inserted, skipped, fitments };
}

let totalInserted = 0;
let totalFitments = 0;
for (const uid of USER_IDS) {
  const { inserted, fitments } = await insertForUser(uid);
  totalInserted += inserted;
  totalFitments += fitments;
}

console.log(`\nTotal: ${totalInserted} parts, ${totalFitments} fitments across ${USER_IDS.length} users`);

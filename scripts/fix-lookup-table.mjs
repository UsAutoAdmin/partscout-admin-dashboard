/**
 * Cleans the 00_year_make_model_lookup table:
 * 1. Strip make prefix from model (e.g., "FORD F150 PICKUP" → "F150 Pickup")
 * 2. Apply title-case normalization (preserve abbreviations like CRV, BMW, etc.)
 * 3. Deduplicate rows that become identical after cleanup
 * 4. Fix make casing (e.g., "Bmw" → "BMW")
 */
import { createClient } from "@supabase/supabase-js";
import { resolve } from "path";
import { readFileSync } from "fs";

const envContent = readFileSync(resolve(import.meta.dirname, "../.env.local"), "utf8");
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const MAKE_CASING = {
  BMW: "BMW",
  GMC: "GMC",
  KIA: "Kia",
};

function looksLikeAbbreviation(w) {
  if (w.length <= 3 && w === w.toUpperCase() && /[A-Z]/.test(w)) return true;
  if (/\d/.test(w)) return true;
  if (w.length <= 4 && !/[aeiou]/i.test(w) && /^[A-Z]+$/.test(w)) return true;
  return false;
}

function toTitleCase(str) {
  const KEEP_UPPER = new Set([
    "BMW", "GMC", "AMG", "GTS", "SRT", "TRD", "CRV", "RSX", "MDX", "RDX",
    "TLX", "TSX", "CTS", "STS", "DTS", "ATS", "XTS", "RX", "GX", "LX",
    "IS", "NX", "UX", "RC", "NV", "GT", "XL", "EV", "IM", "XB", "XA",
    "XD", "TC", "FR-S", "LS", "LT", "SS", "RS", "ZL1", "SLE", "SLT",
    "XUV", "SUV", "VAN", "HS", "CT", "LC", "RZ",
  ]);
  return str.split(/\s+/).map(w => {
    const upper = w.toUpperCase();
    if (KEEP_UPPER.has(upper)) return upper;
    if (/^\d/.test(w)) return w.toUpperCase();
    if (/^[A-Z0-9]+-[A-Z0-9]+$/i.test(w)) {
      return w.split("-").map(p => {
        if (p.length <= 2) return p.toUpperCase();
        if (looksLikeAbbreviation(p)) return p.toUpperCase();
        return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      }).join("-");
    }
    if (looksLikeAbbreviation(w)) return upper;
    if (w.length <= 2) return upper;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ");
}

function fixMake(make) {
  const upper = make.toUpperCase();
  if (MAKE_CASING[upper]) return MAKE_CASING[upper];
  if (make.includes("-")) {
    return make.split("-").map(p =>
      p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
    ).join("-");
  }
  return make.charAt(0).toUpperCase() + make.slice(1).toLowerCase();
}

const MAKE_PREFIXES = {
  "MERCEDES-BENZ": ["MERCEDES-BENZ", "MERCEDES BENZ", "MERCEDES"],
  "ALFA-ROMEO": ["ALFA-ROMEO", "ALFA ROMEO", "ALFA"],
  "LAND ROVER": ["LAND ROVER", "LAND"],
};

function stripMakeFromModel(make, model) {
  const makeUpper = make.trim().toUpperCase();
  const modelTrimmed = model.trim();
  const modelUpper = modelTrimmed.toUpperCase();

  const prefixes = MAKE_PREFIXES[makeUpper] || [makeUpper];
  for (const prefix of prefixes) {
    if (modelUpper.startsWith(prefix + " ")) {
      return modelTrimmed.slice(prefix.length).trim();
    }
  }
  if (modelUpper === makeUpper) {
    return modelTrimmed;
  }
  return modelTrimmed;
}

async function main() {
  console.log("Loading all rows from 00_year_make_model_lookup...");
  const allRows = [];
  let offset = 0;
  while (true) {
    const { data } = await sb.from("00_year_make_model_lookup").select("*").range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allRows.push(...data);
    offset += 1000;
    if (data.length < 1000) break;
  }
  console.log(`Loaded ${allRows.length} rows\n`);

  const updates = [];
  const seen = new Map();
  const toDelete = [];

  for (const row of allRows) {
    const origMake = row.make;
    const origModel = row.model;

    const newMake = fixMake(origMake);
    let strippedModel = stripMakeFromModel(origMake, origModel);
    const newModel = toTitleCase(strippedModel);

    const dedupeKey = `${row.year}|${newMake.toUpperCase()}|${newModel.toUpperCase()}`;

    if (seen.has(dedupeKey)) {
      toDelete.push(row.id);
    } else {
      seen.set(dedupeKey, row.id);
      if (newMake !== origMake || newModel !== origModel) {
        updates.push({ id: row.id, make: newMake, model: newModel });
      }
    }
  }

  console.log(`Updates needed: ${updates.length}`);
  console.log(`Duplicates to delete: ${toDelete.length}`);
  console.log(`Clean rows (no change): ${allRows.length - updates.length - toDelete.length}`);

  // Show sample transformations
  console.log("\n=== Sample transformations ===");
  const samples = updates.slice(0, 40);
  for (const u of samples) {
    const orig = allRows.find(r => r.id === u.id);
    console.log(`  ${orig.make} | ${orig.model}  →  ${u.make} | ${u.model}`);
  }

  // Show sample duplicates
  console.log("\n=== Sample duplicates to delete ===");
  for (const id of toDelete.slice(0, 15)) {
    const orig = allRows.find(r => r.id === id);
    console.log(`  ${orig.year} ${orig.make} | ${orig.model}`);
  }

  // Dry-run check: proceed?
  if (process.argv.includes("--apply")) {
    console.log("\n--- APPLYING CHANGES ---");

    // Batch updates (10 at a time)
    let updated = 0;
    for (let i = 0; i < updates.length; i += 10) {
      const batch = updates.slice(i, i + 10);
      await Promise.all(batch.map(u =>
        sb.from("00_year_make_model_lookup").update({ make: u.make, model: u.model }).eq("id", u.id)
      ));
      updated += batch.length;
      if (updated % 100 === 0) process.stdout.write(`\rUpdated: ${updated}/${updates.length}`);
    }
    console.log(`\nUpdated ${updated} rows`);

    // Delete duplicates (10 at a time)
    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += 10) {
      const batch = toDelete.slice(i, i + 10);
      await Promise.all(batch.map(id =>
        sb.from("00_year_make_model_lookup").delete().eq("id", id)
      ));
      deleted += batch.length;
      if (deleted % 100 === 0) process.stdout.write(`\rDeleted: ${deleted}/${toDelete.length}`);
    }
    console.log(`\nDeleted ${deleted} duplicate rows`);

    // Final count
    const { count } = await sb.from("00_year_make_model_lookup").select("id", { count: "exact", head: true });
    console.log(`\nFinal table row count: ${count}`);
  } else {
    console.log("\n--- DRY RUN (pass --apply to commit changes) ---");
  }
}

main().catch(console.error);

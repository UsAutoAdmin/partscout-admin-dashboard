/**
 * Fix casing for scored_parts, 6_user_database_parts, and Video_Parts_for_research.
 * Skips 9_Octoparse_Scrapes (handled separately by the rescrape mode).
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAGE = 1000;
const PARALLEL = 25;

const UPPERCASE_BRANDS = new Set([
  "BMW", "GMC", "RAM", "AMG", "SRT", "TRD", "AMC",
]);

const SPECIAL_MODELS = {
  "RAV4": "RAV4", "CX-5": "CX-5", "CX-9": "CX-9", "CX-30": "CX-30",
  "CX-50": "CX-50", "CR-V": "CR-V", "HR-V": "HR-V", "MX-5": "MX-5",
  "GT-R": "GT-R",
};

function looksLikeAbbreviation(w) {
  const u = w.toUpperCase();
  if (u.length <= 3) return true;
  if (/\d/.test(u)) return true;
  if (!/[AEIOU]/i.test(u)) return true;
  return false;
}

function toTitleCase(word) {
  if (UPPERCASE_BRANDS.has(word.toUpperCase())) return word.toUpperCase();
  const upper = word.toUpperCase();
  if (SPECIAL_MODELS[upper]) return SPECIAL_MODELS[upper];
  if (looksLikeAbbreviation(word)) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function normalizeField(value) {
  if (!value) return value;
  return value
    .split(/(\s+|-)/)
    .map((seg) => (seg.match(/^[\s-]+$/) ? seg : toTitleCase(seg)))
    .join("");
}

async function parallelUpdate(table, rows, buildUpdate) {
  for (let i = 0; i < rows.length; i += PARALLEL) {
    const chunk = rows.slice(i, i + PARALLEL);
    await Promise.all(
      chunk.map((row) => {
        const { id, ...updates } = buildUpdate(row);
        return sb.from(table).update(updates).eq("id", id);
      })
    );
  }
}

async function main() {
  const startTime = Date.now();

  // ── 1. Fix scored_parts ──
  console.log("=== Phase 1: Fix scored_parts ===");
  let from = 0;
  let totalScored = 0;
  let scoredFixCount = 0;

  while (true) {
    const { data, error } = await sb
      .from("scored_parts")
      .select("id, year, make, model, part_name, search_term")
      .range(from, from + PAGE - 1);

    if (error) { console.error("  Error:", error.message); break; }
    if (!data || data.length === 0) break;
    totalScored += data.length;

    const toUpdate = [];
    for (const row of data) {
      let { make, model, part_name, search_term } = row;
      let changed = false;

      if (make && model && model.toUpperCase() === make.toUpperCase()) {
        const tokens = (search_term || "")
          .replace(/\b(19|20)\d{2}\b/, "")
          .trim()
          .split(/\s+/);

        let idx = 0;
        const parsedMake = tokens[idx] || make;
        idx++;
        if (tokens[idx] && tokens[idx].toUpperCase() === parsedMake.toUpperCase()) idx++;
        const parsedModel = tokens[idx] || null;
        idx++;
        const parsedPart = tokens.slice(idx).join(" ") || part_name;

        if (parsedModel && parsedModel.toUpperCase() !== parsedMake.toUpperCase()) {
          model = parsedModel;
          part_name = parsedPart;
          changed = true;
        }
      }

      const newMake = normalizeField(make);
      const newModel = normalizeField(model);
      const newPartName = normalizeField(part_name);

      if (newMake !== row.make || newModel !== row.model || newPartName !== row.part_name) {
        changed = true;
      }

      if (changed) {
        const year = row.year || "";
        const newST = [year, newMake, newModel, newPartName].filter(Boolean).join(" ");
        scoredFixCount++;
        toUpdate.push({
          id: row.id,
          make: newMake,
          model: newModel,
          part_name: newPartName,
          search_term: newST,
        });
      }
    }

    if (toUpdate.length > 0) {
      await parallelUpdate("scored_parts", toUpdate, (r) => r);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(
      `  Scanned ${totalScored}, fixed ${scoredFixCount} (${elapsed}s)\r`
    );
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`\n  Done: ${scoredFixCount}/${totalScored} scored_parts fixed`);

  // ── 2. Fix 6_user_database_parts ──
  console.log("\n=== Phase 2: Fix 6_user_database_parts ===");
  from = 0;
  let totalUser = 0;
  let userFixCount = 0;

  while (true) {
    const { data, error } = await sb
      .from("6_user_database_parts")
      .select("id, make, model, part_name")
      .range(from, from + PAGE - 1);

    if (error) { console.error("  Error:", error.message); break; }
    if (!data || data.length === 0) break;
    totalUser += data.length;

    const toUpdate = [];
    for (const row of data) {
      const newMake = normalizeField(row.make);
      const newModel = normalizeField(row.model);
      const newPartName = normalizeField(row.part_name);

      if (newMake !== row.make || newModel !== row.model || newPartName !== row.part_name) {
        userFixCount++;
        toUpdate.push({ id: row.id, make: newMake, model: newModel, part_name: newPartName });
      }
    }

    if (toUpdate.length > 0) {
      await parallelUpdate("6_user_database_parts", toUpdate, (r) => r);
    }

    process.stdout.write(
      `  Scanned ${totalUser}, fixed ${userFixCount}\r`
    );
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`\n  Done: ${userFixCount}/${totalUser} user_database_parts fixed`);

  // ── 3. Fix Video_Parts_for_research ──
  console.log("\n=== Phase 3: Fix Video_Parts_for_research ===");
  from = 0;
  let totalVideo = 0;
  let videoFixCount = 0;

  while (true) {
    const { data, error } = await sb
      .from("Video_Parts_for_research")
      .select("id, make, model, part")
      .range(from, from + PAGE - 1);

    if (error) { console.error("  Error:", error.message); break; }
    if (!data || data.length === 0) break;
    totalVideo += data.length;

    const toUpdate = [];
    for (const row of data) {
      const newMake = normalizeField(row.make);
      const newModel = normalizeField(row.model);
      const newPart = normalizeField(row.part);

      if (newMake !== row.make || newModel !== row.model || newPart !== row.part) {
        videoFixCount++;
        toUpdate.push({ id: row.id, make: newMake, model: newModel, part: newPart });
      }
    }

    if (toUpdate.length > 0) {
      await parallelUpdate("Video_Parts_for_research", toUpdate, (r) => r);
    }

    process.stdout.write(
      `  Scanned ${totalVideo}, fixed ${videoFixCount}\r`
    );
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`\n  Done: ${videoFixCount}/${totalVideo} video_parts fixed`);

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n=== Summary (${totalTime}s) ===`);
  console.log(`scored_parts: ${scoredFixCount}/${totalScored}`);
  console.log(`6_user_database_parts: ${userFixCount}/${totalUser}`);
  console.log(`Video_Parts_for_research: ${videoFixCount}/${totalVideo}`);
}

main().catch(console.error);

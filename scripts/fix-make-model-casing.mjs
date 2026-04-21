/**
 * Fix duplicate-make-in-model and all-caps issues across all PartScout tables.
 * Processes page-by-page with parallel updates for speed.
 * Tracks which 9_Octoparse_Scrapes URLs changed for the re-scrape phase.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAGE = 1000;
const PARALLEL = 25;

// --- Casing normalization ---

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

// --- URL fixer ---

function fixNkw(nkw) {
  const tokens = nkw.split(/\s+/);
  if (tokens.length < 3) return { fixed: nkw, changed: false };

  const yearMatch = tokens[0].match(/^(19|20)\d{2}$/);
  let start = yearMatch ? 1 : 0;
  const make = tokens[start];

  let changed = false;
  if (
    tokens.length > start + 1 &&
    tokens[start + 1].toUpperCase() === make.toUpperCase()
  ) {
    tokens.splice(start + 1, 1);
    changed = true;
  }

  const result = tokens.map((t, i) => {
    if (i < start) return t;
    const normalized = normalizeField(t);
    if (normalized !== t) changed = true;
    return normalized;
  });

  return { fixed: result.join(" "), changed };
}

function fixUrl(url) {
  if (!url) return { fixedUrl: url, changed: false };
  const match = url.match(/([?&])_nkw=([^&]+)/);
  if (!match) return { fixedUrl: url, changed: false };

  const rawNkw = decodeURIComponent(match[2].replace(/\+/g, " "));
  const { fixed, changed } = fixNkw(rawNkw);
  if (!changed) return { fixedUrl: url, changed: false };

  const encodedNkw = encodeURIComponent(fixed).replace(/%20/g, "+");
  const fixedUrl = url.replace(match[0], `${match[1]}_nkw=${encodedNkw}`);
  return { fixedUrl, changed: true };
}

// --- Parallel update helper ---

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

// --- Main ---

async function main() {
  const affectedUrls = [];
  const outDir = path.join(process.cwd(), "data", "rescrape-affected");
  fs.mkdirSync(outDir, { recursive: true });

  // ── 1. Fix 9_Octoparse_Scrapes URLs (streaming) ──
  console.log("=== Phase 1: Fix 9_Octoparse_Scrapes URLs ===");
  let from = 0;
  let totalScraped = 0;
  let urlFixCount = 0;

  while (true) {
    const { data, error } = await sb
      .from("9_Octoparse_Scrapes")
      .select("id, original_url, sold_link")
      .range(from, from + PAGE - 1);

    if (error) { console.error("  Error:", error.message); break; }
    if (!data || data.length === 0) break;
    totalScraped += data.length;

    const toUpdate = [];
    for (const row of data) {
      const { fixedUrl: fixedOriginal, changed: c1 } = fixUrl(row.original_url);
      const { fixedUrl: fixedSold, changed: c2 } = fixUrl(row.sold_link);

      if (c1 || c2) {
        urlFixCount++;
        toUpdate.push({ id: row.id, original_url: fixedOriginal, sold_link: fixedSold });
        affectedUrls.push({ id: row.id, active_url: fixedOriginal, sold_url: fixedSold });
      }
    }

    if (toUpdate.length > 0) {
      await parallelUpdate("9_Octoparse_Scrapes", toUpdate, (r) => r);
    }

    process.stdout.write(`  Scanned ${totalScraped} rows, fixed ${urlFixCount}\r`);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`\n  Done: ${urlFixCount}/${totalScraped} URLs fixed`);

  // Save affected URLs for rescrape phase
  fs.writeFileSync(path.join(outDir, "affected-urls.json"), JSON.stringify(affectedUrls));
  fs.writeFileSync(
    path.join(outDir, "affected-scrape-ids.json"),
    JSON.stringify(affectedUrls.map((r) => r.id))
  );
  console.log(`  Saved ${affectedUrls.length} affected URLs to ${outDir}/`);

  // ── 2. Fix scored_parts ──
  console.log("\n=== Phase 2: Fix scored_parts ===");
  from = 0;
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

      // Fix duplicate make in model
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

    process.stdout.write(`  Scanned ${totalScored} rows, fixed ${scoredFixCount}\r`);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`\n  Done: ${scoredFixCount}/${totalScored} scored_parts fixed`);

  // ── 3. Fix 6_user_database_parts ──
  console.log("\n=== Phase 3: Fix 6_user_database_parts ===");
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

    process.stdout.write(`  Scanned ${totalUser} rows, fixed ${userFixCount}\r`);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`\n  Done: ${userFixCount}/${totalUser} user_database_parts fixed`);

  // ── 4. Fix Video_Parts_for_research ──
  console.log("\n=== Phase 4: Fix Video_Parts_for_research ===");
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

    process.stdout.write(`  Scanned ${totalVideo} rows, fixed ${videoFixCount}\r`);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`\n  Done: ${videoFixCount}/${totalVideo} video_parts fixed`);

  // ── Summary ──
  console.log(`\n=== Summary ===`);
  console.log(`9_Octoparse_Scrapes URLs fixed: ${urlFixCount}`);
  console.log(`scored_parts rows fixed: ${scoredFixCount}`);
  console.log(`6_user_database_parts rows fixed: ${userFixCount}`);
  console.log(`Video_Parts_for_research rows fixed: ${videoFixCount}`);
  console.log(`Affected URLs for rescrape: ${affectedUrls.length}`);
}

main().catch(console.error);

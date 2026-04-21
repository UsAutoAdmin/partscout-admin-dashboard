/**
 * READ-ONLY scan of 9_Octoparse_Scrapes to identify URLs that need fixing.
 * Saves corrected URLs to affected-urls.json WITHOUT writing back to DB.
 * The URL fix will be bundled into the rescrape step for efficiency.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAGE = 1000;

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

async function main() {
  const outDir = path.join(process.cwd(), "data", "rescrape-affected");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, "affected-urls.json");
  const stream = fs.createWriteStream(outFile);
  stream.write("[\n");

  let from = 0;
  let totalScraped = 0;
  let affectedCount = 0;
  let first = true;
  const startTime = Date.now();

  console.log("=== Scanning 9_Octoparse_Scrapes (read-only) ===\n");

  while (true) {
    const { data, error } = await sb
      .from("9_Octoparse_Scrapes")
      .select("id, original_url, sold_link")
      .range(from, from + PAGE - 1);

    if (error) { console.error("  Error:", error.message); break; }
    if (!data || data.length === 0) break;
    totalScraped += data.length;

    for (const row of data) {
      const { fixedUrl: fixedOriginal, changed: c1 } = fixUrl(row.original_url);
      const { fixedUrl: fixedSold, changed: c2 } = fixUrl(row.sold_link);

      if (c1 || c2) {
        affectedCount++;
        const entry = JSON.stringify({
          id: row.id,
          active_url: fixedOriginal,
          sold_url: fixedSold,
          orig_active_url: row.original_url,
          orig_sold_url: row.sold_link,
        });
        stream.write(first ? entry : ",\n" + entry);
        first = false;
      }
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round(totalScraped / elapsed);
    process.stdout.write(
      `  Scanned ${totalScraped} rows, ${affectedCount} affected — ${rate} rows/sec\r`
    );

    if (data.length < PAGE) break;
    from += PAGE;
  }

  stream.write("\n]");
  stream.end();

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n\n=== Done in ${totalTime}s ===`);
  console.log(`Total rows: ${totalScraped}`);
  console.log(`Affected (URL changed): ${affectedCount}`);
  console.log(`Rate: ${Math.round(totalScraped / totalTime)} rows/sec`);
  console.log(`Saved to: ${outFile}`);

  // Also save the IDs file
  fs.writeFileSync(
    path.join(outDir, "affected-scrape-ids.json"),
    JSON.stringify({ count: affectedCount, note: "IDs are in affected-urls.json" })
  );
}

main().catch(console.error);

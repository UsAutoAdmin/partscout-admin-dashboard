/**
 * Extract cross-compatibility data from sold listing titles using LLM.
 * Processes the refined Part Review sample (~2,200 parts).
 * For each part, fetches listing titles from sold_listing_details,
 * sends them to GPT-4.1-nano for structured extraction,
 * and writes results to the part_cross_compatibility table.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = "gpt-4.1-nano";
const BATCH_SIZE = 5; // Parts processed concurrently
const SAVE_INTERVAL = 50;

const QUEUE_FILE = path.join(process.cwd(), "data", "part-review", "queue.json");
const RESULTS_FILE = path.join(process.cwd(), "data", "cross-compat-results.json");

async function callLLM(titles, basePart) {
  const prompt = `You are analyzing eBay sold listing titles for an auto part to extract cross-compatibility information.

Base part: ${basePart.year} ${basePart.make} ${basePart.model} ${basePart.part_name}

Here are the listing titles:
${titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Extract the following from ALL titles combined:
1. What year range does this part fit? Look for patterns like "2007-2012", "07-12", "2016-2023", etc.
2. What other makes does this part fit? Look for mentions of other brands (e.g., "Chevy/GMC", "Honda/Acura")
3. What other models does this part fit? Look for mentions of other model names
4. What trim/variant info exists? (e.g., "EXT", "Pickup", "Sedan", "Coupe")

Respond ONLY with valid JSON (no markdown):
{
  "year_start": <number or null>,
  "year_end": <number or null>,
  "compatible_makes": ["make1", "make2"],
  "compatible_models": ["model1", "model2"],
  "trims": ["trim1", "trim2"],
  "confidence": <0.0 to 1.0 based on consistency across titles>
}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 500,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  const content = data.choices[0]?.message?.content?.trim();
  if (!content) return null;

  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    console.error("  Failed to parse LLM response:", content.slice(0, 200));
    return null;
  }
}

async function fetchTitles(scrapeId) {
  const { data, error } = await sb
    .from("sold_listing_details")
    .select("title")
    .eq("scrape_id", scrapeId)
    .limit(30);

  if (error || !data) return [];
  return [...new Set(data.map((d) => d.title).filter(Boolean))];
}

async function processOnePart(part) {
  const titles = await fetchTitles(part.scrape_id);
  if (titles.length < 2) {
    return { part, result: null, reason: "insufficient_titles", titleCount: titles.length };
  }

  const basePart = {
    year: part.year,
    make: part.make,
    model: part.model,
    part_name: part.part_name,
  };

  const llmResult = await callLLM(titles, basePart);
  if (!llmResult) {
    return { part, result: null, reason: "llm_failed", titleCount: titles.length };
  }

  return {
    part,
    result: {
      scored_part_id: part.scored_part_id,
      scrape_id: part.scrape_id,
      base_year: parseInt(part.year) || null,
      base_make: part.make,
      base_model: part.model,
      base_part: part.part_name,
      compatible_year_start: llmResult.year_start,
      compatible_year_end: llmResult.year_end,
      compatible_makes: llmResult.compatible_makes || [],
      compatible_models: llmResult.compatible_models || [],
      trims: llmResult.trims || [],
      confidence: llmResult.confidence || 0,
      title_count: titles.length,
      source_titles: titles.slice(0, 5),
    },
    titleCount: titles.length,
  };
}

async function main() {
  if (!OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not set");
    process.exit(1);
  }

  const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
  const refined = queue.filter((r) => r.status === "scraped" && !r.removed);
  console.log(`Refined parts: ${refined.length}\n`);

  // Load existing progress
  let results = [];
  const processed = new Set();
  if (fs.existsSync(RESULTS_FILE)) {
    results = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8"));
    for (const r of results) processed.add(r.scored_part_id);
    console.log(`Resuming: ${processed.size} already processed\n`);
  }

  const pending = refined.filter((r) => !processed.has(r.scored_part_id));
  console.log(`Pending: ${pending.length}\n`);

  let done = 0;
  let succeeded = 0;
  let noTitles = 0;
  let llmFailed = 0;
  const startTime = Date.now();

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(batch.map(processOnePart));

    for (const { part, result, reason, titleCount } of batchResults) {
      done++;
      if (result) {
        results.push(result);
        succeeded++;
      } else if (reason === "insufficient_titles") {
        noTitles++;
      } else {
        llmFailed++;
      }
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round((done / elapsed) * 60);
    process.stdout.write(
      `  [${done}/${pending.length}] ok=${succeeded} no_titles=${noTitles} llm_fail=${llmFailed} — ${rate}/min\r`
    );

    if (done % SAVE_INTERVAL < BATCH_SIZE) {
      fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    }
  }

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n\n=== Done in ${totalTime}s ===`);
  console.log(`Processed: ${done}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`No titles: ${noTitles}`);
  console.log(`LLM failed: ${llmFailed}`);
  console.log(`Results saved to ${RESULTS_FILE}`);

  // Also write to Supabase table if results exist
  if (results.length > 0) {
    console.log(`\nUpserting ${results.length} rows to part_cross_compatibility...`);
    for (let i = 0; i < results.length; i += 50) {
      const chunk = results.slice(i, i + 50).map((r) => ({
        scored_part_id: r.scored_part_id,
        scrape_id: r.scrape_id,
        base_year: r.base_year,
        base_make: r.base_make,
        base_model: r.base_model,
        base_part: r.base_part,
        compatible_year_start: r.compatible_year_start,
        compatible_year_end: r.compatible_year_end,
        compatible_makes: r.compatible_makes,
        compatible_models: r.compatible_models,
        trims: r.trims,
        confidence: r.confidence,
        title_count: r.title_count,
        source_titles: r.source_titles,
      }));

      const { error } = await sb
        .from("part_cross_compatibility")
        .upsert(chunk, { onConflict: "scored_part_id" });

      if (error) {
        console.error(`  Upsert error at chunk ${i}:`, error.message);
        console.log("  Skipping DB write — results are saved locally.");
        break;
      }
      process.stdout.write(`  Upserted ${Math.min(i + 50, results.length)}/${results.length}\r`);
    }
    console.log();
  }
}

main().catch(console.error);

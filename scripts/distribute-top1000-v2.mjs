/**
 * Distribute top 1,000 unique parts from Part Review into all paid users' databases.
 * 
 * Key differences from v1:
 * - Deduplicates by (make, model, part_name) picking highest-value variation
 * - Stores cross-compatibility in 7_user_part_alternate_fitments (the proper table)
 * - Does NOT use fitment_sub_category for compat storage
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_ID = "user_38tYWMdCYvz3XkcG1ENgzErjpoR";

/* ── COG matching ── */

const SYNONYM_MAP = {
  "coolant pump": ["water pump", "pump"], "water pump": ["coolant pump", "pump"],
  "ac compressor": ["a/c compressor", "air conditioning compressor"],
  "a/c compressor": ["ac compressor", "air conditioning compressor"],
  "headlight": ["head light", "head lamp", "headlamp"],
  "taillight": ["tail light", "tail lamp", "taillamp"],
  "tail light": ["taillight", "tail lamp", "taillamp"],
  "turn signal": ["blinker", "turn signal light"],
  "bumper cover": ["bumper", "front bumper", "rear bumper"],
  "fender": ["front fender", "fender panel"],
  "rim": ["wheel", "alloy wheel"], "wheel": ["rim", "alloy wheel"],
  "radiator support": ["rad support", "radiator core support"],
  "catalytic converter": ["cat converter", "cat"],
  "alternator": ["generator"], "starter": ["starter motor"], "starter motor": ["starter"],
  "power steering pump": ["ps pump", "steering pump"],
  "exhaust manifold": ["exhaust header", "header"],
  "side mirror": ["mirror", "door mirror", "side view mirror"],
  "mirror": ["side mirror", "door mirror"], "door mirror": ["side mirror", "mirror"],
  "fog light": ["fog lamp"], "fog lamp": ["fog light"],
  "rotor": ["brake rotor", "disc rotor"], "brake rotor": ["rotor", "disc rotor"],
  "caliper": ["brake caliper"], "brake caliper": ["caliper"],
  "strut": ["shock", "strut assembly", "shock absorber"], "shock": ["strut", "shock absorber"],
  "cv axle": ["axle shaft", "half shaft", "drive axle"], "axle shaft": ["cv axle", "half shaft"],
  "control arm": ["lower control arm", "upper control arm"],
  "tie rod": ["tie rod end", "inner tie rod"],
  "hub": ["wheel bearing", "hub assembly", "wheel hub"], "wheel bearing": ["hub", "hub assembly"],
  "condenser": ["ac condenser", "a/c condenser"], "evaporator": ["ac evaporator", "a/c evaporator"],
  "blower motor": ["heater blower", "fan motor"],
  "radio": ["stereo", "head unit", "radio bezel"],
  "grille": ["grill", "front grille"], "grill": ["grille", "front grille"],
  "hood": ["bonnet"], "trunk lid": ["trunk", "deck lid", "decklid"], "trunk": ["trunk lid", "deck lid"],
  "valve cover": ["rocker cover", "cam cover"],
  "thermostat": ["thermostat housing"], "throttle body": ["throttle"],
  "fuel pump": ["fuel pump assembly", "fuel pump module"],
  "fuel injector": ["injector"], "injector": ["fuel injector"],
  "window regulator": ["window motor", "power window motor"], "window motor": ["window regulator"],
  "wiper motor": ["windshield wiper motor"],
  "speedometer": ["instrument cluster", "gauge cluster", "cluster"],
  "instrument cluster": ["speedometer", "gauge cluster"],
  "intake manifold": ["intake", "upper intake manifold", "lower intake manifold"],
  "console lid": ["center console lid", "armrest lid", "console cover"],
  "console": ["center console", "console assembly"],
};

function tokenize(t) { return t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean); }
function collapse(t) { return t.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function baseName(n) { return n.replace(/\s*\(.*?\)\s*/g, "").trim(); }

function matchScore(spoken, catalogName) {
  const sl = spoken.toLowerCase().trim(), cl = catalogName.toLowerCase().trim();
  if (sl === cl) return 100;
  const sc = collapse(spoken), cbc = collapse(baseName(catalogName));
  if (sc === cbc) return 98;
  if (sc === collapse(catalogName)) return 96;
  if (cbc.includes(sc)) return 82 + Math.round((sc.length / cbc.length) * 13);
  if (sc.includes(cbc)) return 82 + Math.round((cbc.length / sc.length) * 13);
  if (cl.includes(sl)) return 80 + Math.round((sl.length / cl.length) * 12);
  if (sl.includes(cl)) return 80 + Math.round((cl.length / sl.length) * 12);
  const st = tokenize(spoken), ct = tokenize(catalogName);
  if (!st.length || !ct.length) return 0;
  let ms = 0; for (const s of st) if (ct.some(c => c.includes(s) || s.includes(c))) ms++;
  let mc = 0; for (const c of ct) if (st.some(s => s.includes(c) || c.includes(s))) mc++;
  const p = ms / st.length, r = mc / ct.length;
  if (p + r === 0) return 0;
  return Math.round(((2 * p * r) / (p + r)) * 75);
}

function expandSynonyms(name) {
  const key = name.toLowerCase().trim();
  const names = [name];
  if (SYNONYM_MAP[key]) names.push(...SYNONYM_MAP[key]);
  for (const [sk, alts] of Object.entries(SYNONYM_MAP)) {
    if (key !== sk && key.includes(sk)) names.push(...alts);
  }
  return [...new Set(names)];
}

function findCog(partName, catalog) {
  const namesToTry = expandSynonyms(partName);
  let best = null, bestScore = 0, bestPri = Infinity;
  for (const nv of namesToTry) {
    for (const entry of catalog) {
      const score = matchScore(nv, entry.part_name);
      if (score < 40) continue;
      if (score > bestScore || (score === bestScore && entry.priority < bestPri)) {
        bestScore = score; best = entry; bestPri = entry.priority;
      }
    }
  }
  return best ? { ...best, matchScore: bestScore } : null;
}

/* ── Main ── */

async function main() {
  // 1. Load queue
  const queuePath = resolve(import.meta.dirname, "../data/part-review/queue.json");
  const queue = JSON.parse(readFileSync(queuePath, "utf8"));
  const verified = queue.filter(q => q.status === "scraped" && !q.removed);
  console.log(`Verified parts: ${verified.length}`);

  // 2. Deduplicate by (make, model, part_name) — keep highest avg_sell_price
  const deduped = new Map();
  for (const p of verified) {
    const key = `${p.make.toLowerCase()}|${p.model.toLowerCase()}|${p.part_name.toLowerCase()}`;
    const existing = deduped.get(key);
    if (!existing || (p.avg_sell_price || 0) > (existing.avg_sell_price || 0)) {
      deduped.set(key, p);
    }
  }
  const uniqueParts = [...deduped.values()];
  console.log(`Unique (make/model/part): ${uniqueParts.length}`);

  // 3. Rank and take top 1000
  function rankScore(p) {
    const st = p.new_sell_through ?? p.original_sell_through ?? 0;
    const vol = p.new_sold_count ?? p.original_sold_volume ?? 0;
    const margin = p.profit_margin ?? 0;
    const consistency = p.price_consistency ?? 0.5;
    const stScore = st >= 80 && st <= 200 ? (1 - Math.abs(st - 125) / 125) : 0;
    return stScore * 0.35 + Math.min(vol / 50, 1) * 0.3 + Math.min(Math.max(margin, 0) / 100, 1) * 0.2 + consistency * 0.15;
  }
  uniqueParts.sort((a, b) => rankScore(b) - rankScore(a));
  const TOP_N = Math.min(1000, uniqueParts.length);
  const top = uniqueParts.slice(0, TOP_N);
  console.log(`Selected top ${TOP_N} unique parts\n`);

  // 4. Load cross-compat
  const ccPath = resolve(import.meta.dirname, "../data/cross-compat-results.json");
  const ccData = JSON.parse(readFileSync(ccPath, "utf8"));
  const ccByKey = new Map();
  for (const entry of ccData) {
    const key = `${entry.base_year}|${(entry.base_make || "").toLowerCase()}|${(entry.base_model || "").toLowerCase()}|${(entry.base_part || "").toLowerCase()}`;
    ccByKey.set(key, entry);
  }
  // Also index by (make, model, part) ignoring year for broader matching
  const ccByPartKey = new Map();
  for (const entry of ccData) {
    const key = `${(entry.base_make || "").toLowerCase()}|${(entry.base_model || "").toLowerCase()}|${(entry.base_part || "").toLowerCase()}`;
    if (!ccByPartKey.has(key) || (entry.confidence || 0) > (ccByPartKey.get(key).confidence || 0)) {
      ccByPartKey.set(key, entry);
    }
  }
  console.log(`Cross-compat entries: ${ccData.length}\n`);

  // 5. Load COG catalog
  const { data: catalog } = await sb.from("lkq_prices").select("id, part_name, price, yard_location, priority").order("part_name");
  console.log(`LKQ catalog: ${catalog.length} entries\n`);

  // 6. Get target users
  const { data: allUsers } = await sb.from("users").select("id, clerk_subscription_status, clerk_plan_slug, stripe_subscription_status");
  const paidIds = allUsers
    .filter(u => (u.clerk_subscription_status === "active" && u.clerk_plan_slug !== "free_user" && u.clerk_plan_slug !== null) || u.stripe_subscription_status === "active")
    .map(u => u.id);
  const targetUsers = [ADMIN_ID, ...paidIds.filter(id => id !== ADMIN_ID)];
  console.log(`Target users: ${targetUsers.length}\n`);

  // 7. Get existing parts per user for dedup
  const existingByUser = {};
  for (const uid of targetUsers) {
    let all = [], from = 0;
    while (true) {
      const { data } = await sb.from("6_user_database_parts").select("year, make, model, part_name").eq("user_id", uid).range(from, from + 999);
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
      from += 1000;
    }
    existingByUser[uid] = new Set(all.map(r => `${r.make?.toLowerCase()}|${r.model?.toLowerCase()}|${r.part_name?.toLowerCase()}`));
  }

  // 8. Fetch images for parts missing them
  const scrapeIds = [...new Set(top.filter(p => !p.best_image_url && p.scrape_id).map(p => p.scrape_id))];
  const imageMap = {};
  for (let i = 0; i < scrapeIds.length; i += 100) {
    const batch = scrapeIds.slice(i, i + 100);
    const { data } = await sb.from("sold_listing_details").select("scrape_id, image_url, price").in("scrape_id", batch).not("image_url", "is", null).order("price", { ascending: false });
    for (const r of data ?? []) { if (!imageMap[r.scrape_id]) imageMap[r.scrape_id] = r.image_url; }
  }

  // 9. Insert parts and alternate fitments
  let totalInserted = 0, totalFitments = 0;

  for (const uid of targetUsers) {
    const isAdmin = uid === ADMIN_ID;
    const label = isAdmin ? "Admin" : uid.slice(0, 12) + "…";
    const existing = existingByUser[uid];
    const rows = [];
    const partCCMap = [];

    for (const p of top) {
      const dedupKey = `${p.make?.toLowerCase()}|${p.model?.toLowerCase()}|${p.part_name?.toLowerCase()}`;
      if (existing.has(dedupKey)) continue;

      const cog = findCog(p.part_name, catalog);
      const imageUrl = p.best_image_url || imageMap[p.scrape_id] || null;
      const st = p.new_sell_through ?? p.original_sell_through ?? null;

      const row = {
        user_id: uid,
        year: p.year,
        make: p.make,
        model: p.model,
        part_name: p.part_name,
        variation: p.variation_name || null,
        number_sold_90d: p.new_sold_count ?? p.original_sold_volume ?? 0,
        number_active: p.new_active_count ?? 0,
        sell_through: st,
        sell_price: p.avg_sell_price ?? null,
        average_cog: cog ? Math.round(cog.price * 100) / 100 : null,
        image_url: imageUrl,
        needs_review: false,
        quantity: 0,
        manually_verified: "pending",
      };

      // Find cross-compat for this part
      const ccKey = `${p.year}|${p.make.toLowerCase()}|${p.model.toLowerCase()}|${p.part_name.toLowerCase()}`;
      const partKey = `${p.make.toLowerCase()}|${p.model.toLowerCase()}|${p.part_name.toLowerCase()}`;
      const cc = ccByKey.get(ccKey) || ccByPartKey.get(partKey);

      rows.push(row);
      partCCMap.push(cc || null);
    }

    if (rows.length === 0) {
      console.log(`${label}: 0 new (all already exist)`);
      continue;
    }

    // Insert parts in batches, collect inserted IDs
    let inserted = 0, fitmentCount = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const ccBatch = partCCMap.slice(i, i + 50);

      const { data: insertedRows, error } = await sb.from("6_user_database_parts").insert(batch).select("id, year, make, model");

      if (error) {
        // Fallback to individual inserts
        for (let j = 0; j < batch.length; j++) {
          const { data: singleRow, error: e2 } = await sb.from("6_user_database_parts").insert(batch[j]).select("id, year, make, model");
          if (!e2 && singleRow?.[0]) {
            inserted++;
            const cc = ccBatch[j];
            if (cc) {
              fitmentCount += await insertFitments(singleRow[0], cc);
            }
          }
        }
      } else if (insertedRows) {
        inserted += insertedRows.length;
        for (let j = 0; j < insertedRows.length; j++) {
          const cc = ccBatch[j];
          if (cc) {
            fitmentCount += await insertFitments(insertedRows[j], cc);
          }
        }
      }
    }

    console.log(`${label}: +${inserted} parts, +${fitmentCount} fitments`);
    totalInserted += inserted;
    totalFitments += fitmentCount;
  }

  console.log(`\nDone. ${totalInserted} parts + ${totalFitments} fitments across ${targetUsers.length} users.`);
}

async function insertFitments(insertedPart, cc) {
  const fitments = [];
  const primaryYear = insertedPart.year;
  const primaryMake = (insertedPart.make || "").toLowerCase();
  const primaryModel = (insertedPart.model || "").toLowerCase();

  const yearStart = cc.compatible_year_start;
  const yearEnd = cc.compatible_year_end;
  const makes = cc.compatible_makes || [];
  const models = cc.compatible_models || [];

  if (yearStart && yearEnd) {
    // Add year range for the primary make/model (excluding primary vehicle itself)
    for (let y = yearStart; y <= yearEnd; y++) {
      if (y === primaryYear && primaryMake === (insertedPart.make || "").toLowerCase() && primaryModel === (insertedPart.model || "").toLowerCase()) continue;
      fitments.push({
        database_part_id: insertedPart.id,
        year: y,
        make: insertedPart.make,
        model: insertedPart.model,
        source: "AUTO",
      });
    }
  }

  // Add cross-make/model fitments (each make × each model × year range)
  for (const make of makes) {
    for (const model of models) {
      const makeLower = make.toLowerCase();
      const modelLower = model.toLowerCase();
      if (makeLower === primaryMake && modelLower === primaryModel) continue;
      
      const start = yearStart || primaryYear;
      const end = yearEnd || primaryYear;
      for (let y = start; y <= end; y++) {
        fitments.push({
          database_part_id: insertedPart.id,
          year: y,
          make: make,
          model: model,
          source: "AUTO",
        });
      }
    }
  }

  if (fitments.length === 0) return 0;

  // Deduplicate
  const seen = new Set();
  const unique = fitments.filter(f => {
    const key = `${f.year}|${f.make.toLowerCase()}|${f.model.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Insert in batches
  let count = 0;
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const { error } = await sb.from("7_user_part_alternate_fitments").insert(batch);
    if (error) {
      // Individual insert fallback (ignore dupes)
      for (const f of batch) {
        const { error: e2 } = await sb.from("7_user_part_alternate_fitments").insert(f);
        if (!e2) count++;
      }
    } else {
      count += batch.length;
    }
  }
  return count;
}

main().catch(console.error);

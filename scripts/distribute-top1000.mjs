/**
 * Distribute top 1,000 verified parts from Part Review into all paid users' databases.
 * - Reads the 2,234 scraped parts from queue.json
 * - Ranks by a composite score (sell-through quality, volume, profit margin, price consistency)
 * - Matches COG from lkq_prices
 * - Fetches best sold listing image from sold_listing_details
 * - Inserts into 6_user_database_parts for admin + all paid users, deduplicating
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_ID = "user_38tYWMdCYvz3XkcG1ENgzErjpoR";
const TOP_N = 1000;

/* ── COG matching (same logic as migrate-to-user-db.mjs) ── */

const SYNONYM_MAP = {
  "coolant pump": ["water pump", "pump"],
  "water pump": ["coolant pump", "pump"],
  "ac compressor": ["a/c compressor", "air conditioning compressor"],
  "a/c compressor": ["ac compressor", "air conditioning compressor"],
  "headlight": ["head light", "head lamp", "headlamp"],
  "taillight": ["tail light", "tail lamp", "taillamp"],
  "tail light": ["taillight", "tail lamp", "taillamp"],
  "turn signal": ["blinker", "turn signal light"],
  "bumper cover": ["bumper", "front bumper", "rear bumper"],
  "fender": ["front fender", "fender panel"],
  "rim": ["wheel", "alloy wheel"],
  "wheel": ["rim", "alloy wheel"],
  "radiator support": ["rad support", "radiator core support"],
  "catalytic converter": ["cat converter", "cat"],
  "alternator": ["generator"],
  "starter": ["starter motor"],
  "starter motor": ["starter"],
  "power steering pump": ["ps pump", "steering pump"],
  "exhaust manifold": ["exhaust header", "header"],
  "side mirror": ["mirror", "door mirror", "side view mirror"],
  "mirror": ["side mirror", "door mirror"],
  "door mirror": ["side mirror", "mirror"],
  "fog light": ["fog lamp"],
  "fog lamp": ["fog light"],
  "rotor": ["brake rotor", "disc rotor"],
  "brake rotor": ["rotor", "disc rotor"],
  "caliper": ["brake caliper"],
  "brake caliper": ["caliper"],
  "strut": ["shock", "strut assembly", "shock absorber"],
  "shock": ["strut", "shock absorber"],
  "cv axle": ["axle shaft", "half shaft", "drive axle"],
  "axle shaft": ["cv axle", "half shaft"],
  "control arm": ["lower control arm", "upper control arm"],
  "tie rod": ["tie rod end", "inner tie rod"],
  "hub": ["wheel bearing", "hub assembly", "wheel hub"],
  "wheel bearing": ["hub", "hub assembly"],
  "condenser": ["ac condenser", "a/c condenser"],
  "evaporator": ["ac evaporator", "a/c evaporator"],
  "blower motor": ["heater blower", "fan motor"],
  "radio": ["stereo", "head unit", "radio bezel"],
  "grille": ["grill", "front grille"],
  "grill": ["grille", "front grille"],
  "hood": ["bonnet"],
  "trunk lid": ["trunk", "deck lid", "decklid"],
  "trunk": ["trunk lid", "deck lid"],
  "valve cover": ["rocker cover", "cam cover"],
  "thermostat": ["thermostat housing"],
  "throttle body": ["throttle"],
  "fuel pump": ["fuel pump assembly", "fuel pump module"],
  "fuel injector": ["injector"],
  "injector": ["fuel injector"],
  "window regulator": ["window motor", "power window motor"],
  "window motor": ["window regulator"],
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
  const sl = spoken.toLowerCase().trim();
  const cl = catalogName.toLowerCase().trim();
  if (sl === cl) return 100;
  const sc = collapse(spoken);
  const cbc = collapse(baseName(catalogName));
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
        bestScore = score;
        best = entry;
        bestPri = entry.priority;
      }
    }
  }
  return best ? { ...best, matchScore: bestScore } : null;
}

/* ── Ranking ── */

function rankScore(p) {
  const st = p.new_sell_through ?? p.original_sell_through ?? 0;
  const vol = p.new_sold_count ?? p.original_sold_volume ?? 0;
  const margin = p.profit_margin ?? 0;
  const consistency = p.price_consistency ?? 0.5;

  // Ideal sell-through is 100-150%, penalize extremes
  const stScore = st >= 80 && st <= 200 ? (1 - Math.abs(st - 125) / 125) : 0;
  const volScore = Math.min(vol / 50, 1); // normalize volume (50+ is great)
  const marginScore = Math.min(Math.max(margin, 0) / 100, 1);
  const consistScore = consistency;

  return stScore * 0.35 + volScore * 0.3 + marginScore * 0.2 + consistScore * 0.15;
}

/* ── Main ── */

async function main() {
  // 1. Load queue and filter to verified parts
  const queuePath = resolve(import.meta.dirname, "../data/part-review/queue.json");
  const queue = JSON.parse(readFileSync(queuePath, "utf8"));
  const verified = queue.filter(q => q.status === "scraped" && !q.removed);
  console.log(`Verified parts in queue: ${verified.length}`);

  // 2. Rank and take top 1000
  verified.sort((a, b) => rankScore(b) - rankScore(a));
  const top = verified.slice(0, TOP_N);
  console.log(`Selected top ${TOP_N} parts\n`);

  const worst = rankScore(top[top.length - 1]);
  const best = rankScore(top[0]);
  console.log(`Rank score range: ${best.toFixed(3)} — ${worst.toFixed(3)}\n`);

  // 3. Load COG catalog
  console.log("Loading LKQ price catalog...");
  const { data: catalog } = await sb
    .from("lkq_prices")
    .select("id, part_name, price, yard_location, priority")
    .order("part_name");
  console.log(`  ${catalog.length} catalog entries\n`);

  // 4. Get paid user IDs
  const { data: allUsers } = await sb
    .from("users")
    .select("id, clerk_subscription_status, clerk_plan_slug, stripe_subscription_status");

  const paidUserIds = allUsers
    .filter(u =>
      (u.clerk_subscription_status === "active" && u.clerk_plan_slug !== "free_user" && u.clerk_plan_slug !== null) ||
      u.stripe_subscription_status === "active"
    )
    .map(u => u.id);

  const targetUsers = [ADMIN_ID, ...paidUserIds.filter(id => id !== ADMIN_ID)];
  console.log(`Target users: ${targetUsers.length} (1 admin + ${targetUsers.length - 1} paid)\n`);

  // 5. For each target user, get existing parts for dedup
  const existingByUser = {};
  for (const uid of targetUsers) {
    const { data } = await sb
      .from("6_user_database_parts")
      .select("year, make, model, part_name")
      .eq("user_id", uid);
    const keys = new Set(
      (data ?? []).map(r => `${r.year}|${r.make?.toLowerCase()}|${r.model?.toLowerCase()}|${r.part_name?.toLowerCase()}`)
    );
    existingByUser[uid] = keys;
  }
  console.log("Loaded existing parts for dedup\n");

  // 6. Fetch images for parts that don't have one
  const scrapeIds = [...new Set(top.filter(p => !p.best_image_url && p.scrape_id).map(p => p.scrape_id))];
  const imageMap = {};
  if (scrapeIds.length > 0) {
    console.log(`Fetching images for ${scrapeIds.length} parts without images...`);
    for (let i = 0; i < scrapeIds.length; i += 100) {
      const batch = scrapeIds.slice(i, i + 100);
      const { data } = await sb
        .from("sold_listing_details")
        .select("scrape_id, image_url, price")
        .in("scrape_id", batch)
        .not("image_url", "is", null)
        .order("price", { ascending: false });
      for (const r of data ?? []) {
        if (!imageMap[r.scrape_id]) imageMap[r.scrape_id] = r.image_url;
      }
    }
    console.log(`  Found images for ${Object.keys(imageMap).length} parts\n`);
  }

  // 7. Build rows and insert
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const uid of targetUsers) {
    const isAdmin = uid === ADMIN_ID;
    const existing = existingByUser[uid];
    const rows = [];

    for (const p of top) {
      const dedupKey = `${p.year}|${p.make?.toLowerCase()}|${p.model?.toLowerCase()}|${p.part_name?.toLowerCase()}`;
      if (existing.has(dedupKey)) continue;

      const cog = findCog(p.part_name, catalog);
      const imageUrl = p.best_image_url || imageMap[p.scrape_id] || null;
      const st = p.new_sell_through ?? p.original_sell_through ?? null;

      rows.push({
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
      });
    }

    if (rows.length === 0) {
      console.log(`${isAdmin ? "Admin" : uid.slice(0, 12) + "…"}: 0 new (all ${TOP_N} already exist)`);
      continue;
    }

    // Batch insert in chunks of 200
    let inserted = 0;
    let failed = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      const { error } = await sb.from("6_user_database_parts").insert(batch);
      if (error) {
        // Fall back to individual inserts for this batch
        for (const row of batch) {
          const { error: e2 } = await sb.from("6_user_database_parts").insert(row);
          if (e2) { failed++; } else { inserted++; }
        }
      } else {
        inserted += batch.length;
      }
    }

    const label = isAdmin ? "Admin" : uid.slice(0, 12) + "…";
    console.log(`${label}: +${inserted} new parts (${failed} failed, ${rows.length - inserted - failed} skipped)`);
    totalInserted += inserted;
    totalSkipped += (TOP_N - rows.length);
    totalFailed += failed;
  }

  console.log(`\nDone. ${totalInserted} total inserts across ${targetUsers.length} users.`);
  console.log(`  Skipped (already existed): ${totalSkipped}`);
  console.log(`  Failed: ${totalFailed}`);
}

main().catch(console.error);

/**
 * Migrates Video Research parts into 6_user_database_parts for Chase's admin account.
 * - Matches COG from lkq_prices using the same fuzzy logic as the scraper
 * - Pulls the highest-price sold listing image for each part
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const USER_ID = "user_38tYWMdCYvz3XkcG1ENgzErjpoR";

/* ── COG matching (ported from price-lookup.ts) ── */

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

/* ── Main ── */

async function main() {
  // Load LKQ catalog
  console.log("Loading LKQ price catalog...");
  const { data: catalog, error: catErr } = await sb
    .from("lkq_prices")
    .select("id, part_name, price, yard_location, priority")
    .order("part_name");
  if (catErr) { console.error("Failed to load catalog:", catErr.message); process.exit(1); }
  console.log(`  ${catalog.length} catalog entries loaded\n`);

  // Load video research parts with sell prices
  const { data: vrParts, error: vrErr } = await sb
    .from("Video_Parts_for_research")
    .select("*")
    .not("sell_price", "is", null);
  if (vrErr) { console.error("Failed to load VR parts:", vrErr.message); process.exit(1); }
  console.log(`${vrParts.length} parts to migrate\n`);

  const results = [];

  for (const p of vrParts) {
    const label = `${p.year} ${p.make} ${p.model} ${p.part}`;

    // COG match
    const cog = findCog(p.part, catalog);

    // Get highest-price sold listing image
    let imageUrl = p.image_url || null;
    if (!imageUrl && p.octoparse_id) {
      const { data: topListing } = await sb
        .from("sold_listing_details")
        .select("image_url, price")
        .eq("scrape_id", p.octoparse_id)
        .not("image_url", "is", null)
        .order("price", { ascending: false })
        .limit(1);
      if (topListing?.[0]?.image_url) {
        imageUrl = topListing[0].image_url;
      }
    }

    const sellThrough = p.active > 0 ? Math.round((p.sold / p.active) * 10000) / 100 : null;

    const row = {
      user_id: USER_ID,
      year: parseInt(p.year) || null,
      make: p.make,
      model: p.model,
      part_name: p.part,
      variation: p.nickname || null,
      number_sold_90d: p.sold || 0,
      number_active: p.active || 0,
      sell_through: sellThrough,
      sell_price: p.sell_price,
      average_cog: cog ? Math.round(cog.price * 100) / 100 : null,
      image_url: imageUrl,
      needs_review: false,
      quantity: 0,
      manually_verified: "pending",
    };

    results.push({ label, row, cog });
  }

  // Insert all
  let inserted = 0;
  let failed = 0;
  for (const { label, row, cog } of results) {
    const { error } = await sb.from("6_user_database_parts").insert(row);
    if (error) {
      console.log(`  ✗ ${label}: ${error.message}`);
      failed++;
    } else {
      const cogStr = cog ? `COG: $${cog.price} (${cog.part_name}, score: ${cog.matchScore})` : "no COG match";
      const imgStr = row.image_url ? "has image" : "no image";
      console.log(`  ✓ ${label} — sell: $${row.sell_price}, ${cogStr}, ${imgStr}`);
      inserted++;
    }
  }

  console.log(`\nDone. ${inserted} inserted, ${failed} failed.`);
}

main().catch(console.error);

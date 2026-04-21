/**
 * Backfill missing images, COGs, and cross-compatibility for the top 1000 parts
 * across all users in 6_user_database_parts.
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

async function main() {
  // 1. Load cross-compat results
  const ccPath = resolve(import.meta.dirname, "../data/cross-compat-results.json");
  const ccData = JSON.parse(readFileSync(ccPath, "utf8"));
  const ccByKey = new Map();
  for (const entry of ccData) {
    const key = `${entry.base_year}|${(entry.base_make || "").toLowerCase()}|${(entry.base_model || "").toLowerCase()}|${(entry.base_part || "").toLowerCase()}`;
    ccByKey.set(key, entry);
  }
  console.log(`Loaded ${ccData.length} cross-compat entries\n`);

  // 2. Load LKQ catalog
  console.log("Loading LKQ catalog...");
  const { data: catalog } = await sb
    .from("lkq_prices")
    .select("id, part_name, price, yard_location, priority")
    .order("part_name");
  console.log(`  ${catalog.length} entries\n`);

  // 3. Get paid users
  const { data: allUsers } = await sb
    .from("users")
    .select("id, clerk_subscription_status, clerk_plan_slug, stripe_subscription_status");
  const paidIds = allUsers
    .filter(u =>
      (u.clerk_subscription_status === "active" && u.clerk_plan_slug !== "free_user" && u.clerk_plan_slug !== null) ||
      u.stripe_subscription_status === "active"
    )
    .map(u => u.id);
  const targetUsers = [ADMIN_ID, ...paidIds.filter(id => id !== ADMIN_ID)];
  console.log(`Processing ${targetUsers.length} users\n`);

  // 4. For each user, fetch their parts and backfill
  let totalImgFixed = 0, totalCogFixed = 0, totalCcFixed = 0;

  for (const uid of targetUsers) {
    const isAdmin = uid === ADMIN_ID;
    const label = isAdmin ? "Admin" : uid.slice(0, 12) + "…";

    // Fetch all parts for this user
    const { data: parts } = await sb
      .from("6_user_database_parts")
      .select("id, year, make, model, part_name, image_url, average_cog, sell_price, fitment_sub_category")
      .eq("user_id", uid);

    if (!parts?.length) {
      console.log(`${label}: no parts, skipping`);
      continue;
    }

    let imgFixed = 0, cogFixed = 0, ccFixed = 0;

    for (const part of parts) {
      const updates = {};

      // Backfill missing image
      if (!part.image_url) {
        // Try scored_parts -> sold_listing_details for an image
        const nkw = `${part.year} ${part.make} ${part.model} ${part.part_name}`;
        const { data: scoredRows } = await sb
          .from("scored_parts")
          .select("scrape_id, best_image_url")
          .eq("year", part.year)
          .ilike("make", part.make)
          .ilike("part_name", part.part_name)
          .limit(1);
        
        if (scoredRows?.[0]?.best_image_url) {
          updates.image_url = scoredRows[0].best_image_url;
        } else if (scoredRows?.[0]?.scrape_id) {
          const { data: listings } = await sb
            .from("sold_listing_details")
            .select("image_url, price")
            .eq("scrape_id", scoredRows[0].scrape_id)
            .not("image_url", "is", null)
            .order("price", { ascending: false })
            .limit(1);
          if (listings?.[0]?.image_url) {
            updates.image_url = listings[0].image_url;
          }
        }
      }

      // Backfill missing COG
      if (!part.average_cog) {
        const cog = findCog(part.part_name, catalog);
        if (cog) {
          updates.average_cog = Math.round(cog.price * 100) / 100;
        }
      }

      // Backfill cross-compatibility
      if (!part.fitment_sub_category) {
        const key = `${part.year}|${(part.make || "").toLowerCase()}|${(part.model || "").toLowerCase()}|${(part.part_name || "").toLowerCase()}`;
        const cc = ccByKey.get(key);
        if (cc) {
          const compat = {
            year_range: cc.compatible_year_start && cc.compatible_year_end
              ? `${cc.compatible_year_start}-${cc.compatible_year_end}`
              : null,
            compatible_makes: cc.compatible_makes || [],
            compatible_models: cc.compatible_models || [],
            trims: cc.trims || [],
            confidence: cc.confidence,
          };
          updates.fitment_sub_category = JSON.stringify(compat);
        }
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await sb
          .from("6_user_database_parts")
          .update(updates)
          .eq("id", part.id);
        if (error) {
          console.log(`  ✗ ${part.part_name}: ${error.message}`);
        } else {
          if (updates.image_url) imgFixed++;
          if (updates.average_cog) cogFixed++;
          if (updates.fitment_sub_category) ccFixed++;
        }
      }
    }

    console.log(`${label}: ${parts.length} parts — img: +${imgFixed}, cog: +${cogFixed}, compat: +${ccFixed}`);
    totalImgFixed += imgFixed;
    totalCogFixed += cogFixed;
    totalCcFixed += ccFixed;
  }

  console.log(`\nDone. Totals across all users:`);
  console.log(`  Images backfilled: ${totalImgFixed}`);
  console.log(`  COGs backfilled: ${totalCogFixed}`);
  console.log(`  Compatibility added: ${totalCcFixed}`);
}

main().catch(console.error);

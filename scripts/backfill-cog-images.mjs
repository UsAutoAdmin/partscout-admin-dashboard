/**
 * Backfill COG and images for all parts in Chase's admin account
 * that are missing either.
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const USER_ID = "user_38tYWMdCYvz3XkcG1ENgzErjpoR";

/* ── COG matching (same as price-lookup.ts) ── */

const SYNONYM_MAP = {
  "coolant pump": ["water pump", "pump"],
  "water pump": ["coolant pump", "pump"],
  "ac compressor": ["a/c compressor", "air conditioning compressor"],
  "headlight": ["head light", "head lamp", "headlamp"],
  "taillight": ["tail light", "tail lamp", "taillamp"],
  "tail light": ["taillight", "tail lamp", "taillamp"],
  "turn signal": ["blinker", "turn signal light"],
  "bumper cover": ["bumper", "front bumper", "rear bumper"],
  "fender": ["front fender", "fender panel"],
  "rim": ["wheel", "alloy wheel"], "wheel": ["rim", "alloy wheel"],
  "radiator support": ["rad support", "radiator core support"],
  "catalytic converter": ["cat converter", "cat"],
  "alternator": ["generator"],
  "starter": ["starter motor"], "starter motor": ["starter"],
  "power steering pump": ["ps pump", "steering pump"],
  "exhaust manifold": ["exhaust header", "header"],
  "side mirror": ["mirror", "door mirror", "side view mirror"],
  "mirror": ["side mirror", "door mirror"],
  "door mirror": ["side mirror", "mirror"],
  "fog light": ["fog lamp"], "fog lamp": ["fog light"],
  "rotor": ["brake rotor", "disc rotor"], "brake rotor": ["rotor", "disc rotor"],
  "caliper": ["brake caliper"], "brake caliper": ["caliper"],
  "strut": ["shock", "strut assembly", "shock absorber"],
  "shock": ["strut", "shock absorber"],
  "cv axle": ["axle shaft", "half shaft", "drive axle"],
  "control arm": ["lower control arm", "upper control arm"],
  "hub": ["wheel bearing", "hub assembly", "wheel hub"],
  "wheel bearing": ["hub", "hub assembly"],
  "condenser": ["ac condenser", "a/c condenser"],
  "evaporator": ["ac evaporator", "a/c evaporator"],
  "blower motor": ["heater blower", "fan motor"],
  "radio": ["stereo", "head unit", "radio bezel"],
  "grille": ["grill", "front grille"], "grill": ["grille", "front grille"],
  "hood": ["bonnet"],
  "trunk lid": ["trunk", "deck lid", "decklid"], "trunk": ["trunk lid", "deck lid"],
  "valve cover": ["rocker cover", "cam cover"],
  "thermostat": ["thermostat housing"], "throttle body": ["throttle"],
  "fuel pump": ["fuel pump assembly", "fuel pump module"],
  "fuel injector": ["injector"], "injector": ["fuel injector"],
  "window regulator": ["window motor", "power window motor"],
  "window motor": ["window regulator"],
  "wiper motor": ["windshield wiper motor"],
  "speedometer": ["instrument cluster", "gauge cluster", "cluster"],
  "instrument cluster": ["speedometer", "gauge cluster"],
  "intake manifold": ["intake", "upper intake manifold"],
  "console lid": ["center console lid", "armrest lid", "console cover"],
  "console": ["center console", "console assembly"],
  "sun visor": ["sunvisor", "visor"], "sunvisor": ["sun visor", "visor"],
  "headrest": ["head rest"], "head rest": ["headrest"],
  "dome light": ["interior light", "map light"],
  "overhead console": ["overhead", "map dome light"],
  "steering wheel": ["steering"],
  "climate control": ["temp control", "heater control", "hvac control"],
  "temp control": ["climate control", "heater control"],
  "radio bezel": ["radio trim", "radio bezel trim", "radio trim bezel"],
  "radio bezel trim": ["radio bezel", "radio trim bezel"],
  "radio trim bezel": ["radio bezel", "radio bezel trim"],
  "glove box": ["glovebox", "glove compartment"],
  "glovebox": ["glove box", "glove compartment"],
  "third brake light": ["3rd brake light", "center brake light", "high mount brake light"],
  "abs module": ["anti-lock brake module", "abs unit", "abs pump"],
  "anti-lock brake pump": ["abs pump", "abs unit", "abs module"],
  "brake booster": ["power brake booster"],
  "power brake booster": ["brake booster"],
  "cup holder": ["cupholder"],
  "ash tray": ["ashtray"],
  "info screen": ["information screen", "display screen", "navigation screen"],
  "touch screen radio": ["touchscreen", "touch screen", "nav radio"],
  "air vents": ["air vent", "dash vent", "ac vent"],
  "spoiler": ["rear spoiler", "trunk spoiler"],
  "tow hook": ["tow eye", "recovery hook"],
  "hubcap": ["hub cap", "wheel cover"],
  "center cap": ["center hub cap"],
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

function findCog(partName, catalog, minScore = 40) {
  const namesToTry = expandSynonyms(partName);
  let best = null, bestScore = 0, bestPri = Infinity;
  for (const nv of namesToTry) {
    for (const entry of catalog) {
      const score = matchScore(nv, entry.part_name);
      if (score < minScore) continue;
      if (score > bestScore || (score === bestScore && entry.priority < bestPri)) {
        bestScore = score; best = entry; bestPri = entry.priority;
      }
    }
  }
  return best ? { ...best, matchScore: bestScore } : null;
}

/* ── Image lookup ── */

async function findImage(year, make, model, partName) {
  const searchTerm = `${year}+${make}+${model}+${partName}`.replace(/\s+/g, "+");
  
  const { data: scrapes } = await sb
    .from("9_Octoparse_Scrapes")
    .select("id")
    .ilike("original_url", `%${searchTerm}%`)
    .limit(1);

  if (!scrapes?.[0]) return null;

  const { data: listings } = await sb
    .from("sold_listing_details")
    .select("image_url, price")
    .eq("scrape_id", scrapes[0].id)
    .not("image_url", "is", null)
    .order("price", { ascending: false })
    .limit(1);

  return listings?.[0]?.image_url ?? null;
}

/* ── Main ── */

async function main() {
  console.log("Loading LKQ catalog...");
  const { data: catalog } = await sb.from("lkq_prices")
    .select("id, part_name, price, yard_location, priority")
    .order("part_name");
  console.log(`  ${catalog.length} entries\n`);

  const { data: parts } = await sb.from("6_user_database_parts")
    .select("id, year, make, model, part_name, average_cog, image_url")
    .eq("user_id", USER_ID);

  const needsCog = parts.filter(p => p.average_cog == null);
  const needsImg = parts.filter(p => !p.image_url);
  console.log(`${parts.length} total parts`);
  console.log(`${needsCog.length} need COG, ${needsImg.length} need image\n`);

  // Phase 1: COG matching (fast, in-memory)
  console.log("=== Phase 1: COG Matching ===\n");
  let cogMatched = 0, cogFailed = 0;
  for (const p of needsCog) {
    const label = `${p.year} ${p.make} ${p.model} ${p.part_name}`;
    const cog = findCog(p.part_name, catalog);
    if (cog && cog.matchScore >= 50) {
      await sb.from("6_user_database_parts").update({ average_cog: cog.price }).eq("id", p.id);
      console.log(`  ✓ ${label} → ${cog.part_name} $${cog.price} (score: ${cog.matchScore})`);
      cogMatched++;
    } else {
      console.log(`  ✗ ${label} — ${cog ? `best: ${cog.part_name} (score: ${cog.matchScore}, too low)` : "no match"}`);
      cogFailed++;
    }
  }
  console.log(`\nCOG: ${cogMatched} matched, ${cogFailed} no match\n`);

  // Phase 2: Image lookup (slower, DB queries)
  console.log("=== Phase 2: Image Lookup ===\n");
  let imgFound = 0, imgMissing = 0;
  for (let i = 0; i < needsImg.length; i++) {
    const p = needsImg[i];
    const label = `${p.year} ${p.make} ${p.model} ${p.part_name}`;
    process.stdout.write(`  [${i + 1}/${needsImg.length}] ${label}...`);

    const url = await findImage(p.year, p.make, p.model, p.part_name);
    if (url) {
      await sb.from("6_user_database_parts").update({ image_url: url }).eq("id", p.id);
      console.log(" ✓");
      imgFound++;
    } else {
      console.log(" ✗ no scrape data");
      imgMissing++;
    }
  }

  console.log(`\nImages: ${imgFound} found, ${imgMissing} not available`);
  console.log(`\nDone.`);
}

main().catch(console.error);

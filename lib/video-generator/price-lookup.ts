import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface PriceCard {
  id: string;
  part_name: string;
  price: number;
  yard_location: string;
  image_url: string;
  storage_path: string;
  priority: number;
}

// Maps commonly spoken part names to their catalog equivalents.
// Each key is a normalized spoken form; values are alternate names to also try.
const SYNONYM_MAP: Record<string, string[]> = {
  "coolant pump": ["water pump", "pump"],
  "water pump": ["coolant pump", "pump"],
  "ac compressor": ["a/c compressor", "air conditioning compressor"],
  "a/c compressor": ["ac compressor", "air conditioning compressor"],
  "headlight": ["head light", "head lamp", "headlamp"],
  "head light": ["headlight", "head lamp", "headlamp"],
  "taillight": ["tail light", "tail lamp", "taillamp"],
  "tail light": ["taillight", "tail lamp", "taillamp"],
  "turn signal": ["blinker", "turn signal light"],
  "blinker": ["turn signal", "turn signal light"],
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
  "ac condenser": ["condenser", "a/c condenser"],
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
  "mass air flow": ["maf sensor", "air flow sensor"],
  "maf sensor": ["mass air flow", "air flow sensor"],
  "oxygen sensor": ["o2 sensor"],
  "o2 sensor": ["oxygen sensor"],
  "coil pack": ["ignition coil"],
  "ignition coil": ["coil pack", "coil"],
  "fuel pump": ["fuel pump assembly", "fuel pump module"],
  "fuel injector": ["injector"],
  "injector": ["fuel injector"],
  "window regulator": ["window motor", "power window motor"],
  "window motor": ["window regulator"],
  "wiper motor": ["windshield wiper motor"],
  "speedometer": ["instrument cluster", "gauge cluster", "cluster"],
  "instrument cluster": ["speedometer", "gauge cluster"],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function collapse(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function baseName(catalogName: string): string {
  return catalogName.replace(/\s*\(.*?\)\s*/g, "").trim();
}

/**
 * Score how well a spoken part name matches a catalog part name.
 * Higher = better match. Returns 0-100.
 */
function matchScore(spoken: string, catalogName: string): number {
  const spokenLower = spoken.toLowerCase().trim();
  const catalogLower = catalogName.toLowerCase().trim();

  if (spokenLower === catalogLower) return 100;

  const spokenCollapsed = collapse(spoken);
  const catalogBase = baseName(catalogName);
  const catalogBaseCollapsed = collapse(catalogBase);

  if (spokenCollapsed === catalogBaseCollapsed) return 98;
  if (spokenCollapsed === collapse(catalogName)) return 96;

  if (catalogBaseCollapsed.includes(spokenCollapsed)) {
    const ratio = spokenCollapsed.length / catalogBaseCollapsed.length;
    return 82 + Math.round(ratio * 13);
  }
  if (spokenCollapsed.includes(catalogBaseCollapsed)) {
    const ratio = catalogBaseCollapsed.length / spokenCollapsed.length;
    return 82 + Math.round(ratio * 13);
  }

  if (catalogLower.includes(spokenLower)) {
    const ratio = spokenLower.length / catalogLower.length;
    return 80 + Math.round(ratio * 12);
  }
  if (spokenLower.includes(catalogLower)) {
    const ratio = catalogLower.length / spokenLower.length;
    return 80 + Math.round(ratio * 12);
  }

  const spokenTokens = tokenize(spoken);
  const catalogTokens = tokenize(catalogName);

  if (spokenTokens.length === 0 || catalogTokens.length === 0) return 0;

  let matchedSpoken = 0;
  for (const st of spokenTokens) {
    if (catalogTokens.some((ct) => ct.includes(st) || st.includes(ct))) {
      matchedSpoken++;
    }
  }

  let matchedCatalog = 0;
  for (const ct of catalogTokens) {
    if (spokenTokens.some((st) => st.includes(ct) || ct.includes(st))) {
      matchedCatalog++;
    }
  }

  const precision = matchedSpoken / spokenTokens.length;
  const recall = matchedCatalog / catalogTokens.length;
  if (precision + recall === 0) return 0;
  const f1 = (2 * precision * recall) / (precision + recall);

  return Math.round(f1 * 75);
}

/**
 * Expand a spoken part name into a list of names to try (original + synonyms).
 */
function expandWithSynonyms(spoken: string): string[] {
  const key = spoken.toLowerCase().trim();
  const names = [spoken];
  if (SYNONYM_MAP[key]) {
    names.push(...SYNONYM_MAP[key]);
  }
  // Also check if any synonym key is a substring of the spoken name
  for (const [synonymKey, alts] of Object.entries(SYNONYM_MAP)) {
    if (key !== synonymKey && key.includes(synonymKey)) {
      names.push(...alts);
    }
  }
  return [...new Set(names)];
}

interface CatalogEntry {
  id: string;
  part_name: string;
  price: number;
  yard_location: string;
  storage_path: string;
  image_url: string;
  priority: number;
}

let cachedPartNames: CatalogEntry[] | null = null;

async function loadPartCatalog(): Promise<CatalogEntry[]> {
  if (cachedPartNames) return cachedPartNames;

  const { data, error } = await supabase
    .from("lkq_prices")
    .select("id, part_name, price, yard_location, storage_path, metadata, priority")
    .order("part_name");

  if (error) throw new Error(`Failed to load lkq_prices: ${error.message}`);

  cachedPartNames = (data ?? []).map((row) => ({
    id: row.id,
    part_name: row.part_name ?? "",
    price: row.price ?? 0,
    yard_location: row.yard_location ?? "",
    storage_path: row.storage_path ?? "",
    image_url: (row.metadata as any)?.image_url ?? "",
    priority: row.priority ?? 99,
  }));

  return cachedPartNames;
}

/**
 * Look up the best matching price card for a spoken part name.
 * Tries synonyms if the direct match is weak. Prefers lower priority numbers.
 */
export async function findPriceCard(
  spokenPartName: string,
  minScore = 40
): Promise<PriceCard | null> {
  const catalog = await loadPartCatalog();
  const namesToTry = expandWithSynonyms(spokenPartName);

  let bestMatch: CatalogEntry | null = null;
  let bestScore = 0;
  let bestPriority = Infinity;

  for (const nameVariant of namesToTry) {
    for (const entry of catalog) {
      const score = matchScore(nameVariant, entry.part_name);
      if (score < minScore) continue;

      // Prefer higher score; on tie, prefer lower priority number
      if (
        score > bestScore ||
        (score === bestScore && entry.priority < bestPriority)
      ) {
        bestScore = score;
        bestMatch = entry;
        bestPriority = entry.priority;
      }
    }
  }

  if (!bestMatch) {
    console.log(
      `[price-lookup] No match for "${spokenPartName}" (tried ${namesToTry.length} variants, best: ${bestScore})`
    );
    return null;
  }

  console.log(
    `[price-lookup] Matched "${spokenPartName}" → "${bestMatch.part_name}" (score: ${bestScore}, priority: ${bestMatch.priority})`
  );

  return {
    id: bestMatch.id,
    part_name: bestMatch.part_name,
    price: bestMatch.price,
    yard_location: bestMatch.yard_location,
    image_url: bestMatch.image_url,
    storage_path: bestMatch.storage_path,
    priority: bestMatch.priority,
  };
}

/**
 * Download a price card image from Supabase Storage to a local path.
 */
export async function downloadPriceCardImage(
  imageUrl: string,
  destPath: string
): Promise<void> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to download price card: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const fs = await import("fs/promises");
  await fs.writeFile(destPath, buf);
}

/**
 * Invalidate the cached catalog (e.g., if new parts are added).
 */
export function clearPriceCatalogCache() {
  cachedPartNames = null;
}

import pdfParse from "pdf-parse";

export interface ScriptEntry {
  year?: string;
  make: string;
  model: string;
  part: string;
  raw: string;
}

const globalKey = "__script_sheet_entries__" as const;
const globalStore = globalThis as unknown as Record<string, ScriptEntry[]>;
if (!globalStore[globalKey]) {
  globalStore[globalKey] = [];
}

export function getScriptEntries(): ScriptEntry[] {
  return globalStore[globalKey];
}

export function clearScriptEntries(): void {
  globalStore[globalKey] = [];
}

const KNOWN_MAKES = [
  "acura", "alfa romeo", "audi", "bmw", "buick", "cadillac", "chevrolet",
  "chevy", "chrysler", "dodge", "fiat", "ford", "genesis", "gmc", "honda",
  "hyundai", "infiniti", "jaguar", "jeep", "kia", "land rover", "lexus",
  "lincoln", "mazda", "mercedes", "mercedes-benz", "mini", "mitsubishi",
  "nissan", "porsche", "ram", "subaru", "suzuki", "tesla", "toyota",
  "volkswagen", "vw", "volvo", "scion", "pontiac", "saturn", "oldsmobile",
  "hummer", "isuzu", "saab", "mercury", "plymouth",
];

/**
 * Parse a PDF (or plain text) into structured script entries.
 * Expects lines like:
 *   "2013 Nissan NV 2500 - Grill"
 *   "2018 Honda Civic Headlight"
 *   "Ford F-150 Taillight"
 */
export async function parseScriptSheet(buffer: Buffer): Promise<ScriptEntry[]> {
  let text: string;
  try {
    const result = await pdfParse(buffer);
    text = result.text;
  } catch {
    text = buffer.toString("utf-8");
  }

  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3);

  const entries: ScriptEntry[] = [];

  for (const line of lines) {
    const entry = parseLine(line);
    if (entry) entries.push(entry);
  }

  return entries;
}

function parseLine(line: string): ScriptEntry | null {
  const cleaned = line
    .replace(/[-–—]/g, " ")
    .replace(/[,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = cleaned.split(" ");
  if (tokens.length < 2) return null;

  let year: string | undefined;
  let makeIdx = 0;

  // Check if first token is a year (4 digits, 1980-2030)
  if (/^(19|20)\d{2}$/.test(tokens[0])) {
    year = tokens[0];
    makeIdx = 1;
  }

  // Find the make
  const lower = cleaned.toLowerCase();
  let foundMake = "";
  let makeEndIdx = makeIdx;

  for (const make of KNOWN_MAKES) {
    const makeTokens = make.split(" ");
    const candidate = tokens
      .slice(makeIdx, makeIdx + makeTokens.length)
      .join(" ")
      .toLowerCase();
    if (candidate === make && makeTokens.length >= (foundMake.split(" ").length || 0)) {
      foundMake = make;
      makeEndIdx = makeIdx + makeTokens.length;
    }
  }

  if (!foundMake) return null;

  // Everything after make until we hit a known part keyword is the model
  // Everything after the model is the part
  const remaining = tokens.slice(makeEndIdx);
  if (remaining.length === 0) return null;

  // Heuristic: part name is usually the last 1-3 tokens that are part-like
  const { model, part } = splitModelAndPart(remaining);
  if (!model || !part) return null;

  return {
    year,
    make: capitalize(foundMake),
    model,
    part,
    raw: line,
  };
}

const PART_KEYWORDS = new Set([
  "headlight", "headlights", "taillight", "taillights", "bumper", "fender",
  "hood", "grille", "grill", "mirror", "mirrors", "radiator", "alternator",
  "starter", "compressor", "pump", "axle", "rotor", "caliper", "strut",
  "shock", "hub", "sensor", "injector", "coil", "motor", "regulator",
  "cluster", "radio", "bezel", "rim", "wheel", "door", "window", "wiper",
  "exhaust", "catalytic", "converter", "manifold", "thermostat", "throttle",
  "fuel", "brake", "condenser", "evaporator", "blower", "valve", "cover",
  "steering", "transmission", "engine", "turbo", "intercooler", "light",
  "lamp", "assembly", "panel", "quarter", "trunk", "liftgate", "tailgate",
  "spoiler", "rack", "knuckle", "arm", "link", "bar", "column", "seat",
  "console", "dash", "dashboard", "airbag", "module", "computer", "ecu",
  "pcm", "tcm", "abs", "harness", "sunroof", "moonroof", "antenna",
  "amplifier", "speaker", "camera", "screen", "display", "nav", "navigation",
  "ac", "heater", "coolant", "water", "oil", "power", "transfer", "differential",
  "driveshaft", "flywheel", "flexplate", "crossmember", "subframe", "cradle",
]);

function splitModelAndPart(tokens: string[]): { model: string; part: string } {
  // Walk from the end — find where the part name starts
  let partStart = tokens.length;
  for (let i = tokens.length - 1; i >= 1; i--) {
    if (PART_KEYWORDS.has(tokens[i].toLowerCase())) {
      partStart = i;
    } else {
      break;
    }
  }

  // If no part keywords found at the end, try splitting on common separators
  if (partStart === tokens.length) {
    // Last token is probably the part
    partStart = tokens.length - 1;
  }

  if (partStart < 1) {
    return { model: tokens[0], part: tokens.slice(1).join(" ") };
  }

  return {
    model: tokens.slice(0, partStart).join(" "),
    part: tokens.slice(partStart).join(" "),
  };
}

function capitalize(s: string): string {
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Store parsed entries globally for use across pipeline runs.
 */
export function setScriptEntries(entries: ScriptEntry[]): void {
  globalStore[globalKey] = entries;
}

/**
 * Match a transcribed car/part against the script sheet.
 * Returns the best matching entry, or null if no good match.
 *
 * Uses token overlap between the transcript text and each script entry.
 * A script match overrides the (potentially garbled) transcript.
 */
export function matchScriptEntry(
  transcribedCar: string | undefined,
  transcribedPart: string | undefined
): ScriptEntry | null {
  const entries = getScriptEntries();
  if (entries.length === 0) return null;

  const queryTokens = tokenize(
    [transcribedCar, transcribedPart].filter(Boolean).join(" ")
  );
  if (queryTokens.length === 0) return null;

  let bestEntry: ScriptEntry | null = null;
  let bestScore = 0;

  for (const entry of entries) {
    const entryTokens = tokenize(
      [entry.year, entry.make, entry.model, entry.part].filter(Boolean).join(" ")
    );

    let matched = 0;
    for (const qt of queryTokens) {
      if (entryTokens.some((et) => et.includes(qt) || qt.includes(et))) {
        matched++;
      }
    }

    // Also check if any entry token matches a query token
    let reverseMatched = 0;
    for (const et of entryTokens) {
      if (queryTokens.some((qt) => qt.includes(et) || et.includes(qt))) {
        reverseMatched++;
      }
    }

    const precision = matched / queryTokens.length;
    const recall = reverseMatched / entryTokens.length;
    const score = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  // Require at least 30% F1 to consider it a match
  if (bestScore < 0.3) {
    console.log(
      `[script-sheet] No match for "${transcribedCar} ${transcribedPart}" (best score: ${bestScore.toFixed(2)})`
    );
    return null;
  }

  console.log(
    `[script-sheet] Matched "${transcribedCar} ${transcribedPart}" → "${bestEntry!.raw}" (score: ${bestScore.toFixed(2)})`
  );
  return bestEntry;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

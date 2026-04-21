/**
 * Multi-Location Chain Registry
 *
 * Single source of truth for junkyard chains that span multiple yards and
 * therefore require the user to pick a location BEFORE we can extract
 * inventory. The `id` of each chain matches the Python extractor's CHAIN_TYPE
 * so the two sides stay aligned by name.
 */

export interface ChainLocation {
  /** URL-safe identifier (matches the Python extractor's location slug). */
  slug: string;
  /** Display label shown in the picker (e.g. "Fresno, CA"). */
  label: string;
}

export interface MultiLocationChain {
  id: string;
  displayName: string;
  hostMatchers: string[];
  locations: ChainLocation[];
  /**
   * Inspect a user-provided URL and return the matching location slug if it
   * already specifies one (e.g. via query param), or `null` to indicate we
   * still need to prompt.
   */
  detectExistingLocation: (url: string) => string | null;
  /**
   * Produce the final URL we should send to the extractor given the user's
   * chosen location.
   */
  buildUrl: (location: ChainLocation, userUrl: string) => string;
  modalDescription: string;
}

const fossUPullIt: MultiLocationChain = {
  id: "foss_u_pull_it",
  displayName: "Foss U-Pull-It",
  hostMatchers: ["fossupullit.com"],
  locations: [
    { slug: "lagrange", label: "La Grange, NC" },
    { slug: "jacksonville", label: "Jacksonville, NC" },
    { slug: "chesapeake", label: "Chesapeake, VA" },
    { slug: "havelock", label: "Havelock, NC" },
    { slug: "wilson", label: "Wilson, NC" },
    { slug: "winston-salem", label: "Winston-Salem, NC" },
  ],
  detectExistingLocation: (url) => readQueryParam(url, "location"),
  buildUrl: (location, userUrl) => setQueryParam(userUrl, "location", location.slug),
  modalDescription:
    "Foss U-Pull-It has multiple locations. Which yard would you like to pull inventory from?",
};

const iPullUPull: MultiLocationChain = {
  id: "ipull_u_pull",
  displayName: "iPull-uPull",
  hostMatchers: ["ipullupull.com", "ipullupullcanada.ca"],
  locations: [
    { slug: "fresno", label: "Fresno, CA" },
    { slug: "pomona", label: "Pomona, CA" },
    { slug: "sacramento", label: "Sacramento, CA" },
    { slug: "stockton", label: "Stockton, CA" },
  ],
  detectExistingLocation: (url) => readQueryParam(url, "location"),
  buildUrl: (location, userUrl) => setQueryParam(userUrl, "location", location.slug),
  modalDescription:
    "iPull-uPull has 4 yards in California. Which location would you like to pull inventory from?",
};

const KENNY_BASE_URL = "https://kennyupull.com/auto-parts/our-inventory/";

const kennyUPull: MultiLocationChain = {
  id: "kenny_u_pull",
  displayName: "Kenny U-Pull",
  hostMatchers: ["kennyupull.com"],
  locations: [
    { slug: "1655615", label: "Ajax, ON" },
    { slug: "9176481", label: "Barrie, ON" },
    { slug: "1576848", label: "Cornwall, ON" },
    { slug: "1457180", label: "Drummondville, QC" },
    { slug: "1457181", label: "Elmsdale, NS" },
    { slug: "1457182", label: "Gatineau, QC" },
    { slug: "1457183", label: "Hamilton, ON" },
    { slug: "1457184", label: "LaPrairie, QC" },
    { slug: "1457185", label: "Laval, QC" },
    { slug: "1457186", label: "Levis, QC" },
    { slug: "1457187", label: "London, ON" },
    { slug: "1457188", label: "Moncton, NB" },
    { slug: "1457189", label: "Montreal, QC" },
    { slug: "1457190", label: "Newmarket, ON" },
    { slug: "1457191", label: "North Bay, ON" },
    { slug: "1457192", label: "Ottawa, ON" },
    { slug: "1457193", label: "Peterborough, ON" },
    { slug: "1457194", label: "Rouyn-Noranda, QC" },
    { slug: "1457195", label: "Saguenay, QC" },
    { slug: "1457196", label: "Sherbrooke, QC" },
    { slug: "1457197", label: "St-Augustin, QC" },
    { slug: "1457198", label: "St. Catharines, ON" },
    { slug: "1457199", label: "St-Lazare, QC" },
    { slug: "1457200", label: "St-Sophie, QC" },
    { slug: "1457201", label: "Sudbury, ON" },
    { slug: "1457202", label: "Trois-Rivières, QC" },
    { slug: "1656964", label: "Windsor, ON" },
  ],
  detectExistingLocation: (url) => {
    const branch = readQueryParam(url, "branch[]") ?? readQueryParam(url, "branch");
    return branch && branch !== "all-branches" ? branch : null;
  },
  buildUrl: (location) => {
    const u = new URL(KENNY_BASE_URL);
    u.searchParams.set("nb_items", "42");
    u.searchParams.set("sort", "date");
    u.searchParams.set("brand", "all-makes");
    u.searchParams.set("model", "all-models");
    u.searchParams.set("model_year", "all-years");
    u.searchParams.set("branch[]", location.slug);
    return u.toString();
  },
  modalDescription:
    "Kenny U-Pull has 27 locations across Canada. Select the yard you want to pull inventory from.",
};

export const MULTI_LOCATION_CHAINS: MultiLocationChain[] = [
  fossUPullIt,
  iPullUPull,
  kennyUPull,
];

export function detectMultiLocationChain(url: string): MultiLocationChain | null {
  const host = parseHost(url);
  if (!host) return null;
  for (const chain of MULTI_LOCATION_CHAINS) {
    if (chain.hostMatchers.some((m) => host.includes(m))) return chain;
  }
  return null;
}

export function needsLocationPicker(url: string): MultiLocationChain | null {
  const chain = detectMultiLocationChain(url);
  if (!chain) return null;
  return chain.detectExistingLocation(url) ? null : chain;
}

function parseHost(input: string): string | null {
  try {
    return new URL(input.trim()).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function readQueryParam(input: string, key: string): string | null {
  try {
    return new URL(input.trim()).searchParams.get(key);
  } catch {
    return null;
  }
}

function setQueryParam(input: string, key: string, value: string): string {
  const u = new URL(input.trim());
  u.searchParams.set(key, value);
  return u.toString();
}

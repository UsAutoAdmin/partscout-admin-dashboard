/**
 * Shared pick sheet matching logic.
 * Ported from Part-Scout-Production. Same Supabase backend, same admin user_id.
 */
import "server-only";
import { getServiceRoleClient } from "@/lib/supabase";

export interface Vehicle {
  year: number | null;
  make: string | null;
  model: string | null;
  row: string | null;
  space: string | null;
  arrival_date?: string | null;
  stock_number?: string | null;
  source_url: string;
}

export interface MatchedPart {
  part_id: string;
  year: number;
  make: string;
  model: string;
  part_name: string;
  variation: string | null;
  sell_through: number | null;
  sell_price: number | null;
  average_cog: number | null;
  image_url: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  row: string | null;
  space: string | null;
  arrival_date: string | null;
  stock_number: string | null;
  source_url: string;
}

const ADMIN_USER_ID = "user_38tYWMdCYvz3XkcG1ENgzErjpoR";

const normalizeString = (str: string | null): string | null => {
  if (!str) return null;
  return str.trim().toUpperCase();
};

/**
 * Two model strings match if they're equal after normalization OR one is a
 * prefix of the other (handles "Focus" vs "Focus SE", "Impala" vs "Impala
 * Limited").
 */
function modelsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const na = normalizeString(a) || "";
  const nb = normalizeString(b) || "";
  if (na === nb) return true;
  return na.startsWith(nb) || nb.startsWith(na);
}

const IN_CHUNK_SIZE = 500;

async function chunkedIn<T>(
  supabase: ReturnType<typeof getServiceRoleClient>,
  table: string,
  selectCols: string,
  filterCol: string,
  ids: string[],
): Promise<T[]> {
  if (ids.length === 0) return [];
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_CHUNK_SIZE);
    const { data } = await supabase.from(table).select(selectCols).in(filterCol, chunk);
    if (data) results.push(...(data as unknown as T[]));
  }
  return results;
}

interface RefRow {
  id: string;
  year: number;
  make: string;
  model: string;
  part_name: string;
  variation: string;
}

interface SubCategory {
  id: string;
  part_id: string;
}

interface FitmentVehicle {
  fitment_id: string;
  year: number;
  make: string;
  model: string;
}

interface UserPartRow {
  id: string;
  year: number;
  make: string;
  model: string;
  part_name: string;
  variation: string | null;
  sell_through: number | null;
  sell_price: number | null;
  average_cog: number | null;
  image_url: string | null;
}

async function batchFetchFitmentCache(
  userParts: UserPartRow[],
): Promise<Map<string, Array<{ year: number; make: string; model: string }>>> {
  const supabase = getServiceRoleClient();

  const uniqueTuples = new Map<
    string,
    { year: number; make: string; model: string; partName: string }
  >();
  for (const part of userParts) {
    const key = `${part.year}|${normalizeString(part.make)}|${normalizeString(part.model)}|${normalizeString(part.part_name)}`;
    if (!uniqueTuples.has(key)) {
      uniqueTuples.set(key, {
        year: part.year,
        make: part.make,
        model: part.model,
        partName: part.part_name,
      });
    }
  }

  const allRefRows: RefRow[] = [];
  await Promise.all(
    Array.from(uniqueTuples.values()).map(async (tuple) => {
      try {
        const { data } = await supabase
          .from("1 year_make_model_category_variation")
          .select("id, year, make, model, part_name, variation")
          .eq("year", tuple.year)
          .ilike("make", tuple.make)
          .ilike("model", tuple.model)
          .ilike("part_name", tuple.partName);
        if (data) allRefRows.push(...(data as unknown as RefRow[]));
      } catch (err) {
        console.error("[pick-sheet-match] ref fetch error:", err);
      }
    }),
  );

  if (allRefRows.length === 0) {
    console.log("[pick-sheet-match] no ref rows found - direct Y/M/M only");
    return buildEmptyCache(userParts);
  }

  const uniqueRefIds = [...new Set(allRefRows.map((r) => r.id))];
  const allSubCategories = await chunkedIn<SubCategory>(
    supabase,
    "2 Fitment Subcategory",
    "id, part_id",
    "part_id",
    uniqueRefIds,
  );

  const uniqueSubIds = [...new Set(allSubCategories.map((s) => s.id))];
  const allFitmentVehicles = await chunkedIn<FitmentVehicle>(
    supabase,
    "4 fitment_vehicles",
    "fitment_id, year, make, model",
    "fitment_id",
    uniqueSubIds,
  );

  const subsByRefId = new Map<string, string[]>();
  for (const sub of allSubCategories) {
    const list = subsByRefId.get(sub.part_id) || [];
    list.push(sub.id);
    subsByRefId.set(sub.part_id, list);
  }

  const fitmentsBySubId = new Map<string, Array<{ year: number; make: string; model: string }>>();
  for (const f of allFitmentVehicles) {
    if (!f.year || !f.make || !f.model) continue;
    const list = fitmentsBySubId.get(f.fitment_id) || [];
    list.push({ year: f.year, make: f.make.trim(), model: f.model.trim() });
    fitmentsBySubId.set(f.fitment_id, list);
  }

  function getFitmentsForRefId(
    refId: string,
  ): Array<{ year: number; make: string; model: string }> {
    const subIds = subsByRefId.get(refId) || [];
    const unique = new Map<string, { year: number; make: string; model: string }>();
    for (const subId of subIds) {
      for (const f of fitmentsBySubId.get(subId) || []) {
        const key = `${f.year}|${normalizeString(f.make)}|${normalizeString(f.model)}`;
        if (!unique.has(key)) unique.set(key, f);
      }
    }
    return Array.from(unique.values());
  }

  function computeIntersection(
    refIds: string[],
  ): Array<{ year: number; make: string; model: string }> {
    const perVariation = refIds.map((id) => getFitmentsForRefId(id)).filter((f) => f.length > 0);
    if (perVariation.length === 0) return [];
    if (perVariation.length === 1) return perVariation[0];

    const first = perVariation[0];
    return first.filter((vehicle) => {
      const vKey = `${vehicle.year}|${normalizeString(vehicle.make)}|${normalizeString(vehicle.model)}`;
      return perVariation
        .slice(1)
        .every((list) =>
          list.some(
            (f) => `${f.year}|${normalizeString(f.make)}|${normalizeString(f.model)}` === vKey,
          ),
        );
    });
  }

  const cache = new Map<string, Array<{ year: number; make: string; model: string }>>();

  for (const part of userParts) {
    const normalizedMake = normalizeString(part.make) || "";
    const normalizedModel = normalizeString(part.model) || "";
    const cacheKey = `${part.year}|${normalizedMake}|${normalizedModel}|${normalizeString(part.part_name) || ""}|${part.variation ? normalizeString(part.variation) : "NO_VARIATION"}`;

    if (cache.has(cacheKey)) continue;

    const matchingRefs = allRefRows.filter(
      (r) =>
        r.year === part.year &&
        normalizeString(r.make) === normalizedMake &&
        normalizeString(r.model) === normalizedModel &&
        normalizeString(r.part_name) === normalizeString(part.part_name),
    );

    let fitments: Array<{ year: number; make: string; model: string }> = [];

    if (part.variation) {
      const specificRef = matchingRefs.find(
        (r) => normalizeString(r.variation) === normalizeString(part.variation),
      );
      if (specificRef) {
        fitments = getFitmentsForRefId(specificRef.id);
      }
      if (fitments.length === 0 && matchingRefs.length > 0) {
        fitments = computeIntersection(matchingRefs.map((r) => r.id));
      }
    } else if (matchingRefs.length > 0) {
      fitments = computeIntersection(matchingRefs.map((r) => r.id));
    }

    cache.set(cacheKey, fitments);
  }

  return cache;
}

function buildEmptyCache(
  userParts: UserPartRow[],
): Map<string, Array<{ year: number; make: string; model: string }>> {
  const cache = new Map<string, Array<{ year: number; make: string; model: string }>>();
  for (const part of userParts) {
    const normalizedMake = normalizeString(part.make) || "";
    const normalizedModel = normalizeString(part.model) || "";
    const cacheKey = `${part.year}|${normalizedMake}|${normalizedModel}|${normalizeString(part.part_name) || ""}|${part.variation ? normalizeString(part.variation) : "NO_VARIATION"}`;
    if (!cache.has(cacheKey)) cache.set(cacheKey, []);
  }
  return cache;
}

/**
 * Match an array of extracted vehicles against the admin's parts catalog.
 * The `userId` parameter is reserved for future per-user catalogs but currently
 * the matching always reads from the hardcoded ADMIN_USER_ID's parts (matches
 * production behaviour exactly).
 */
export async function matchVehiclesToParts(
  _userId: string,
  vehicles: Vehicle[],
  minSellThrough: number | null = null,
  minPrice: number | null = null,
): Promise<MatchedPart[]> {
  const supabase = getServiceRoleClient();

  const { data: userParts, error: partsError } = await supabase
    .from("6_user_database_parts")
    .select("*")
    .eq("user_id", ADMIN_USER_ID);

  if (partsError) {
    throw new Error(`Error fetching user parts: ${partsError.message}`);
  }

  if (!userParts || userParts.length === 0) {
    return [];
  }

  function vehicleMatchesFitment(
    vehicle: Vehicle,
    fitment: { year: number; make: string; model: string },
  ): boolean {
    if (!vehicle.year || !vehicle.make || !vehicle.model) return false;
    return (
      vehicle.year === fitment.year &&
      normalizeString(vehicle.make) === normalizeString(fitment.make) &&
      modelsMatch(vehicle.model, fitment.model)
    );
  }

  const partFitmentsCache = await batchFetchFitmentCache(userParts as UserPartRow[]);

  const matchedParts: MatchedPart[] = [];
  const matchedKeys = new Set<string>();

  // O(1) vehicle lookup by year|make to avoid the O(vehicles × parts) nested loop
  const vehiclesByYearMake = new Map<string, Vehicle[]>();
  for (const v of vehicles) {
    if (!v.year || !v.make || !v.model) continue;
    const key = `${v.year}|${normalizeString(v.make)}`;
    const list = vehiclesByYearMake.get(key) || [];
    list.push(v);
    vehiclesByYearMake.set(key, list);
  }

  const sortedParts = [...(userParts as UserPartRow[])].sort((a, b) => {
    const aKey = `${a.year}|${normalizeString(a.make) || ""}|${normalizeString(a.model) || ""}|${normalizeString(a.part_name) || ""}|${a.variation || ""}`;
    const bKey = `${b.year}|${normalizeString(b.make) || ""}|${normalizeString(b.model) || ""}|${normalizeString(b.part_name) || ""}|${b.variation || ""}`;
    return aKey.localeCompare(bKey);
  });

  for (const part of sortedParts) {
    if (minSellThrough != null && (part.sell_through == null || part.sell_through < minSellThrough)) continue;
    if (minPrice != null && (part.sell_price == null || part.sell_price < minPrice)) continue;

    const normalizedPartMake = normalizeString(part.make) || "";
    const cacheKey = `${part.year}|${normalizedPartMake}|${normalizeString(part.model) || ""}|${normalizeString(part.part_name) || ""}|${part.variation ? normalizeString(part.variation) : "NO_VARIATION"}`;
    const fitments = partFitmentsCache.get(cacheKey) || [];

    const vehiclesToCheck: Array<{ vehicle: Vehicle; matchSource: "fitment" | "direct" }> = [];

    if (fitments.length > 0) {
      const checkedYearMakeKeys = new Set<string>();
      for (const f of fitments) {
        const fKey = `${f.year}|${normalizeString(f.make)}`;
        if (checkedYearMakeKeys.has(fKey)) continue;
        checkedYearMakeKeys.add(fKey);
        const candidates = vehiclesByYearMake.get(fKey) || [];
        for (const vehicle of candidates) {
          if (vehicleMatchesFitment(vehicle, f)) {
            vehiclesToCheck.push({ vehicle, matchSource: "fitment" });
          }
        }
      }
    } else {
      const yearMakeKey = `${part.year}|${normalizedPartMake}`;
      const candidates = vehiclesByYearMake.get(yearMakeKey) || [];
      for (const vehicle of candidates) {
        if (modelsMatch(vehicle.model, part.model)) {
          vehiclesToCheck.push({ vehicle, matchSource: "direct" });
        }
      }
    }

    for (const { vehicle } of vehiclesToCheck) {
      const vehicleMake = normalizeString(vehicle.make);
      const vehicleModel = normalizeString(vehicle.model);
      const matchKey = `${part.id}|${vehicle.year}|${vehicleMake}|${vehicleModel}|${vehicle.row || "NULL"}|${vehicle.space || "NULL"}`;
      if (matchedKeys.has(matchKey)) continue;
      matchedKeys.add(matchKey);

      matchedParts.push({
        part_id: part.id,
        year: part.year,
        make: part.make,
        model: part.model,
        part_name: part.part_name,
        variation: part.variation,
        sell_through: part.sell_through,
        sell_price:
          part.sell_price != null ? Math.round(part.sell_price * 0.8 * 100) / 100 : null,
        average_cog: part.average_cog || null,
        image_url: part.image_url || null,
        vehicle_year: vehicle.year,
        vehicle_make: vehicle.make,
        vehicle_model: vehicle.model,
        row: vehicle.row,
        space: vehicle.space,
        arrival_date: vehicle.arrival_date || null,
        stock_number: vehicle.stock_number || null,
        source_url: vehicle.source_url,
      });
    }
  }

  matchedParts.sort((a, b) => {
    const aKey = `${a.part_id}|${a.vehicle_year}|${normalizeString(a.vehicle_make) || ""}|${normalizeString(a.vehicle_model) || ""}|${a.row || ""}|${a.space || ""}`;
    const bKey = `${b.part_id}|${b.vehicle_year}|${normalizeString(b.vehicle_make) || ""}|${normalizeString(b.vehicle_model) || ""}|${b.row || ""}|${b.space || ""}`;
    return aKey.localeCompare(bKey);
  });

  console.log("[pick-sheet-match] matched:", matchedParts.length);
  return matchedParts;
}

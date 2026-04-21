import "server-only";
import { getServiceRoleClient } from "@/lib/supabase";

/** Yards farther than this are skipped for auto pick sheets (same as email automation). */
export const YARD_TOO_FAR_MILES = 30;

export interface NearestYardResult {
  yard: {
    id: string;
    name: string;
    city: string;
    state: string;
    url: string;
    chainType: string;
  } | null;
  distanceMiles: number | null;
  geoCity: string | null;
  error: string | null;
  tooFarForDrive: boolean;
}

interface YardRow {
  id: string;
  chain_name: string;
  location_name: string | null;
  city: string;
  state: string;
  inventory_url: string;
  latitude: number | null;
  longitude: number | null;
  chain_type: string;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function geocodeZip(
  zip: string,
): Promise<{ lat: number; lon: number; city: string } | null> {
  try {
    const clean = zip.trim().padStart(5, "0").slice(0, 5);
    const res = await fetch(`https://api.zippopotam.us/us/${clean}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const place = data?.places?.[0];
    if (!place) return null;
    return {
      lat: parseFloat(place.latitude),
      lon: parseFloat(place.longitude),
      city: `${place["place name"]}, ${place["state abbreviation"]}`,
    };
  } catch {
    return null;
  }
}

/**
 * Closest verified junkyard for a US ZIP (same logic as /api/email-automation/find-yards).
 */
export async function findNearestYardForZip(zipCode: string): Promise<NearestYardResult> {
  const supabase = getServiceRoleClient();
  const { data: yards, error: yardsError } = await supabase
    .from("junkyard_directory")
    .select(
      "id, chain_name, location_name, city, state, inventory_url, latitude, longitude, chain_type",
    )
    .eq("verification_verified", true)
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (yardsError) {
    return {
      yard: null,
      distanceMiles: null,
      geoCity: null,
      error: yardsError.message,
      tooFarForDrive: false,
    };
  }

  const geo = await geocodeZip(zipCode);
  if (!geo) {
    return {
      yard: null,
      distanceMiles: null,
      geoCity: null,
      error: `Could not geocode ZIP ${zipCode}`,
      tooFarForDrive: false,
    };
  }

  const yardRows = (yards ?? []) as YardRow[];
  let closest: YardRow | null = null;
  let closestDist = Infinity;

  for (const yard of yardRows) {
    if (yard.latitude == null || yard.longitude == null) continue;
    const dist = haversineDistance(geo.lat, geo.lon, yard.latitude, yard.longitude);
    if (dist < closestDist) {
      closestDist = dist;
      closest = yard;
    }
  }

  if (!closest) {
    return {
      yard: null,
      distanceMiles: null,
      geoCity: geo.city,
      error: "No verified yard found",
      tooFarForDrive: false,
    };
  }

  const distanceMi = Math.round(closestDist * 10) / 10;
  return {
    yard: {
      id: closest.id,
      name: closest.chain_name,
      city: closest.city,
      state: closest.state,
      url: closest.inventory_url,
      chainType: closest.chain_type,
    },
    distanceMiles: distanceMi,
    geoCity: geo.city,
    error: null,
    tooFarForDrive: closestDist > YARD_TOO_FAR_MILES,
  };
}

import "server-only";
import { randomUUID } from "crypto";
import { getServiceRoleClient } from "@/lib/supabase";
import { matchVehiclesToParts, type Vehicle, type MatchedPart } from "@/lib/pick-sheet-matching";
import { railwayExtract } from "@/lib/railway-client";

export interface CreatePickSheetInput {
  yardUrl: string;
  yardName: string;
  yardCity?: string;
  memberName: string;
}

export interface CreatePickSheetResult {
  ok: true;
  pickSheetId: string;
  shareToken: string;
  sharePath: string;
  vehicleCount: number;
  matchedPartCount: number;
  vehicles: Vehicle[];
  matchedParts: MatchedPart[];
}

export type CreatePickSheetError = {
  ok: false;
  step: "admin_user" | "extract" | "vehicles" | "match" | "save";
  message: string;
};

export async function createPickSheetForNewMember(
  input: CreatePickSheetInput,
): Promise<CreatePickSheetResult | CreatePickSheetError> {
  const { yardUrl, yardName, yardCity, memberName } = input;
  if (!yardUrl?.trim()) {
    return { ok: false, step: "extract", message: "yardUrl required" };
  }

  const supabaseInit = getServiceRoleClient();
  const { data: adminRow } = await supabaseInit
    .from("6_user_database_parts")
    .select("user_id")
    .limit(1)
    .single();

  const userId = adminRow?.user_id;
  if (!userId) {
    return { ok: false, step: "admin_user", message: "No admin user found with parts in database" };
  }

  const extractResult = await railwayExtract(yardUrl.trim(), false);
  if (!extractResult.ok) {
    return { ok: false, step: "extract", message: extractResult.error ?? "Extraction failed" };
  }

  const vehicles = extractResult.vehicles as Vehicle[];
  if (!vehicles.length) {
    return { ok: false, step: "vehicles", message: "No vehicles extracted from yard" };
  }

  const matchedParts = await matchVehiclesToParts(userId, vehicles, 1, 1);
  if (!matchedParts.length) {
    return { ok: false, step: "match", message: "No matching parts found in your database" };
  }

  const supabase = getServiceRoleClient();
  const pickSheetName = `${memberName} – ${yardName}`;

  const { data: saved, error: saveError } = await supabase
    .from("saved_pick_sheets")
    .insert({
      user_id: userId,
      name: pickSheetName,
      source_url: yardUrl.trim(),
      vehicles,
      matched_parts: matchedParts,
      min_sell_through: 1,
      min_price: 1,
      recipient_name: memberName,
      yard_city: (yardCity ?? "").trim() || null,
    })
    .select("id")
    .single();

  if (saveError || !saved) {
    return {
      ok: false,
      step: "save",
      message: saveError?.message ?? "Save failed",
    };
  }

  const shareToken = randomUUID();
  await supabase.from("saved_pick_sheets").update({ share_token: shareToken }).eq("id", saved.id);

  const sharePath = `/pick-sheet/shared/${shareToken}`;

  return {
    ok: true,
    pickSheetId: saved.id,
    shareToken,
    sharePath,
    vehicleCount: vehicles.length,
    matchedPartCount: matchedParts.length,
    vehicles,
    matchedParts,
  };
}

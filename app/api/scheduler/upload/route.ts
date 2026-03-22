import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const BUCKET = "scheduled-videos";

export async function POST(req: NextRequest) {
  const supabase = getServiceRoleClient();

  const formData = await req.formData();
  const file = formData.get("video") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No video file provided" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "mp4";
  const storagePath = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type || "video/mp4",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  return NextResponse.json({
    storagePath,
    publicUrl: urlData.publicUrl,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const supabase = getServiceRoleClient();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const id = formData.get("id") as string | null;
  const field = formData.get("field") as string | null;

  if (!file || !id || !field) {
    return NextResponse.json({ error: "file, id, and field are required" }, { status: 400 });
  }

  if (field !== "image_url" && field !== "sold_screenshot_url") {
    return NextResponse.json({ error: "field must be image_url or sold_screenshot_url" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "png";
  const path = `${id}/${field}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from("video-research-images")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from("video-research-images")
    .getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("Video_Parts_for_research")
    .update({ [field]: urlData.publicUrl })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ url: urlData.publicUrl });
}

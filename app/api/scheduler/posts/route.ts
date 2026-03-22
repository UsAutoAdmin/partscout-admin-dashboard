import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = getServiceRoleClient();
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  let query = supabase
    .from("scheduled_posts")
    .select("*, instagram_accounts(ig_username)")
    .order("scheduled_at", { ascending: true });

  if (from) query = query.gte("scheduled_at", from);
  if (to) query = query.lte("scheduled_at", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = getServiceRoleClient();
  const body = await req.json();

  const {
    ig_account_id,
    video_storage_path,
    video_public_url,
    caption = "",
    post_type = "reel",
    graduation_strategy = "MANUAL",
    scheduled_at,
  } = body;

  if (!ig_account_id || !video_public_url || !scheduled_at) {
    return NextResponse.json(
      { error: "Missing required fields: ig_account_id, video_public_url, scheduled_at" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("scheduled_posts")
    .insert({
      ig_account_id,
      video_storage_path: video_storage_path ?? "",
      video_public_url,
      caption,
      post_type,
      graduation_strategy: post_type === "trial_reel" ? graduation_strategy : null,
      scheduled_at,
      status: "scheduled",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const supabase = getServiceRoleClient();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("scheduled_posts")
    .delete()
    .eq("id", id)
    .eq("status", "scheduled");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import {
  createReelContainer,
  checkContainerStatus,
  publishContainer,
} from "@/lib/instagram";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function publishPost(
  post: any,
  account: { ig_user_id: string; access_token: string }
) {
  const supabase = getServiceRoleClient();
  const isTrialReel = post.post_type === "trial_reel";

  await supabase
    .from("scheduled_posts")
    .update({ status: "publishing" })
    .eq("id", post.id);

  try {
    const containerId = await createReelContainer(
      account.ig_user_id,
      account.access_token,
      post.video_public_url,
      post.caption,
      isTrialReel,
      post.graduation_strategy ?? "MANUAL"
    );

    let ready = false;
    for (let i = 0; i < 60; i++) {
      await sleep(5000);
      const status = await checkContainerStatus(containerId, account.access_token);
      if (status.statusCode === "FINISHED") {
        ready = true;
        break;
      }
      if (status.statusCode === "ERROR") {
        throw new Error(`Container processing failed: ${status.status ?? "unknown"}`);
      }
    }

    if (!ready) throw new Error("Container processing timed out after 5 minutes");

    const mediaId = await publishContainer(
      account.ig_user_id,
      account.access_token,
      containerId
    );

    await supabase
      .from("scheduled_posts")
      .update({ status: "published", ig_media_id: mediaId })
      .eq("id", post.id);

    return { id: post.id, status: "published", mediaId };
  } catch (e: any) {
    await supabase
      .from("scheduled_posts")
      .update({ status: "failed", error: e.message })
      .eq("id", post.id);
    return { id: post.id, status: "failed", error: e.message };
  }
}

async function handleCron(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = getServiceRoleClient();
  const now = new Date().toISOString();

  const { data: duePosts, error } = await supabase
    .from("scheduled_posts")
    .select("*, instagram_accounts(*)")
    .eq("status", "scheduled")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(5);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!duePosts || duePosts.length === 0) {
    return NextResponse.json({ published: 0, message: "No posts due" });
  }

  const results = [];
  for (const post of duePosts) {
    const account = post.instagram_accounts;
    if (!account) {
      await supabase
        .from("scheduled_posts")
        .update({ status: "failed", error: "No connected Instagram account" })
        .eq("id", post.id);
      results.push({ id: post.id, status: "failed", error: "No account" });
      continue;
    }

    const result = await publishPost(post, account);
    results.push(result);
  }

  return NextResponse.json({
    published: results.filter((r) => r.status === "published").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  });
}

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

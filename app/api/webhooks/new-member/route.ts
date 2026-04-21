import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getServiceRoleClient } from "@/lib/supabase";
import { parseSkoolNewMemberPayload } from "@/lib/new-member/parse-zap-payload";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function verifyWebhookSecret(request: Request): boolean {
  const secret = (
    process.env.SKOOL_WEBHOOK_SECRET || process.env.NEW_MEMBER_WEBHOOK_SECRET
  )?.trim();
  if (!secret) {
    console.error("[webhooks/new-member] set SKOOL_WEBHOOK_SECRET or NEW_MEMBER_WEBHOOK_SECRET");
    return false;
  }
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const header = request.headers.get("x-webhook-secret")?.trim();
  const token = bearer ?? header;
  if (!token) return false;
  try {
    const a = Buffer.from(token, "utf8");
    const b = Buffer.from(secret, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Thin Vercel worker: validate Zapier/Skool secret, insert into Supabase queue.
 * Full automation runs on your local machine (separate checkout) via a poller.
 */
export async function POST(request: Request) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseSkoolNewMemberPayload(body);
  if ("error" in parsed) {
    return NextResponse.json(
      {
        error: parsed.error,
        webhooksUrl: "POST JSON must include a discoverable email + US zip (5 digits). In Zapier, map the Skool step fields into the custom request body (e.g. data.email, data.zip) or a flat object with those keys.",
      },
      { status: 400 },
    );
  }

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("new_member_automation_queue")
    .insert({ payload: parsed, status: "pending" })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[webhooks/new-member] queue insert", error);
    return NextResponse.json(
      {
        error:
          error?.message ??
          "Could not enqueue (run ops/new-member-automation-queue.sql in Supabase if missing table)",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    queued: true,
    queueId: data.id,
    message: "Run the local worker to process this row",
  });
}

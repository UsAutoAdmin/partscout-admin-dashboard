import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getServiceRoleClient } from "@/lib/supabase";
import { parseSkoolNewMemberPayload } from "@/lib/new-member/parse-zap-payload";
import { executeNewMemberWebhook } from "@/lib/new-member/execute-new-member-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

function verifySkoolSecret(request: Request): boolean {
  const secret = (
    process.env.SKOOL_WEBHOOK_SECRET ||
    process.env.NEW_MEMBER_WEBHOOK_SECRET
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
 * When `AUTOMATION_EXPECT_INBOUND_RELAY=1` is set (e.g. your Mac), only requests
 * with matching `x-automation-relay-secret` are accepted.
 */
function verifyRelayInboundIfExpected(request: Request): boolean {
  const expect = process.env.AUTOMATION_EXPECT_INBOUND_RELAY;
  if (expect !== "1" && expect !== "true") return true;
  const expected = process.env.AUTOMATION_RELAY_SECRET?.trim();
  if (!expected) return true;
  const got = request.headers.get("x-automation-relay-secret")?.trim() ?? "";
  try {
    const a = Buffer.from(got, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function automationRelayUrl(): string | null {
  const u = process.env.AUTOMATION_RELAY_URL?.trim();
  return u || null;
}

function newMemberQueueMode(): boolean {
  const v = process.env.NEW_MEMBER_QUEUE_MODE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function POST(request: Request) {
  if (!verifySkoolSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();

  const relay = automationRelayUrl();
  if (relay) {
    try {
      const headers: Record<string, string> = {
        "content-type": request.headers.get("content-type") || "application/json",
      };
      if (request.headers.get("authorization")) {
        headers.authorization = request.headers.get("authorization")!;
      } else if (request.headers.get("x-webhook-secret")) {
        headers["x-webhook-secret"] = request.headers.get("x-webhook-secret")!;
      }
      const relaySecret = process.env.AUTOMATION_RELAY_SECRET?.trim();
      if (relaySecret) {
        headers["x-automation-relay-secret"] = relaySecret;
      }

      const r = await fetch(relay, {
        method: "POST",
        headers,
        body: rawBody,
      });
      const text = await r.text();
      return new NextResponse(text, {
        status: r.status,
        headers: { "content-type": r.headers.get("content-type") || "application/json" },
      });
    } catch (e) {
      console.error("[webhooks/new-member] relay failed:", e);
      return NextResponse.json(
        {
          error: "Relay to local automation failed",
          detail: e instanceof Error ? e.message : String(e),
        },
        { status: 502 },
      );
    }
  }

  if (!verifyRelayInboundIfExpected(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseSkoolNewMemberPayload(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (newMemberQueueMode()) {
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("new_member_automation_queue")
      .insert({ payload: parsed, status: "pending" })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[webhooks/new-member] queue insert", error);
      return NextResponse.json(
        { error: error?.message ?? "Could not enqueue (create table: scripts/new-member-automation-queue.sql)" },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      queued: true,
      queueId: data.id,
      message: "Picked up by your Mac when it polls /api/internal/new-member-dequeue",
    });
  }

  const result = await executeNewMemberWebhook(parsed);
  return NextResponse.json(result.body, { status: result.status });
}

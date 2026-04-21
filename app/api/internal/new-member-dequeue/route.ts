import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getServiceRoleClient } from "@/lib/supabase";
import { executeNewMemberWebhook } from "@/lib/new-member/execute-new-member-webhook";
import type { ParsedNewMemberPayload } from "@/lib/new-member/parse-zap-payload";
import { scheduleDequeueFromEnv } from "@/lib/new-member/trigger-dequeue";

export const dynamic = "force-dynamic";
/** Vercel Pro: raise in dashboard if automation (Railway + Gmail) needs more time. */
export const maxDuration = 300;

function tokenFromRequest(request: Request): string {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-internal-secret")?.trim() ?? "";
}

function verifyDequeueAuth(request: Request): boolean {
  const token = tokenFromRequest(request);
  if (!token) return false;
  const internal = process.env.INTERNAL_NEW_MEMBER_SECRET?.trim();
  if (internal) {
    try {
      const a = Buffer.from(token, "utf8");
      const b = Buffer.from(internal, "utf8");
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* fall through */
    }
  }
  const cron = process.env.CRON_SECRET?.trim();
  if (cron) {
    try {
      const a = Buffer.from(token, "utf8");
      const c = Buffer.from(cron, "utf8");
      if (a.length === c.length && timingSafeEqual(a, c)) return true;
    } catch {
      /* fall through */
    }
  }
  return false;
}

function isPayload(v: unknown): v is ParsedNewMemberPayload {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.email === "string" && typeof o.zip === "string";
}

/**
 * If more rows are still pending, trigger another run (drains backlog on Vercel).
 * Awaited so `waitUntil` runs in the same handler turn as the response (required on Vercel).
 */
async function chainIfMorePending(
  supabase: ReturnType<typeof getServiceRoleClient>,
): Promise<void> {
  const { count, error } = await supabase
    .from("new_member_automation_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error || !count || count < 1) return;
  scheduleDequeueFromEnv();
}

export async function POST(request: Request) {
  return runDequeue(request);
}

/** Vercel Cron (GET) — set CRON_SECRET in the project and use the same value in Authorization: Bearer. */
export async function GET(request: Request) {
  return runDequeue(request);
}

async function runDequeue(request: Request) {
  if (!verifyDequeueAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceRoleClient();
  const now = new Date().toISOString();

  const { data: candidate, error: selErr } = await supabase
    .from("new_member_automation_queue")
    .select("id, payload, status")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selErr) {
    console.error("[new-member-dequeue] select", selErr);
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  if (!candidate) {
    return NextResponse.json({ ok: true, processed: false, message: "queue empty" });
  }

  const { data: claimed, error: claimErr } = await supabase
    .from("new_member_automation_queue")
    .update({ status: "processing", updated_at: now })
    .eq("id", candidate.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (claimErr || !claimed) {
    await chainIfMorePending(supabase);
    return NextResponse.json({ ok: true, processed: false, message: "lost claim (another worker)" });
  }

  const raw = candidate.payload;
  if (!isPayload(raw)) {
    await supabase
      .from("new_member_automation_queue")
      .update({
        status: "failed",
        error_message: "invalid payload shape",
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", candidate.id);
    await chainIfMorePending(supabase);
    return NextResponse.json(
      { ok: false, queueId: candidate.id, error: "invalid payload" },
      { status: 422 },
    );
  }

  const result = await executeNewMemberWebhook(raw);
  const done = new Date().toISOString();
  const r = result.body as { ok?: boolean; error?: string };
  const automationOk = r?.ok === true;

  if (automationOk) {
    await supabase
      .from("new_member_automation_queue")
      .update({
        status: "completed",
        error_message: null,
        updated_at: done,
        completed_at: done,
      })
      .eq("id", candidate.id);
  } else {
    const errMsg = JSON.stringify(result.body).slice(0, 2000);
    await supabase
      .from("new_member_automation_queue")
      .update({
        status: "failed",
        error_message: errMsg,
        updated_at: done,
        completed_at: done,
      })
      .eq("id", candidate.id);
  }

  await chainIfMorePending(supabase);

  return NextResponse.json({
    ok: automationOk,
    processed: true,
    queueId: candidate.id,
    result: result.body,
    httpStatus: result.status,
  });
}

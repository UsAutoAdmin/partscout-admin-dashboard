import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getServiceRoleClient } from "@/lib/supabase";
import { executeNewMemberWebhook } from "@/lib/new-member/execute-new-member-webhook";
import type { ParsedNewMemberPayload } from "@/lib/new-member/parse-zap-payload";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

function verifyInternalSecret(request: Request): boolean {
  const secret = process.env.INTERNAL_NEW_MEMBER_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const token = bearer ?? request.headers.get("x-internal-secret")?.trim();
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

function isPayload(v: unknown): v is ParsedNewMemberPayload {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.email === "string" && typeof o.zip === "string";
}

/**
 * POST — process up to one queued job (oldest pending). Secured by INTERNAL_NEW_MEMBER_SECRET.
 * Run from your Mac on a loop (e.g. scripts/poll-new-member-queue.mjs) against localhost.
 */
export async function POST(request: Request) {
  if (!verifyInternalSecret(request)) {
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
    return NextResponse.json({ ok: false, queueId: candidate.id, error: "invalid payload" }, { status: 422 });
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

  return NextResponse.json({
    ok: automationOk,
    processed: true,
    queueId: candidate.id,
    result: result.body,
    httpStatus: result.status,
  });
}

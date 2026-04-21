import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getServiceRoleClient } from "@/lib/supabase";
import { isNewMemberEmailBlocked } from "@/lib/new-member/blocked-emails";
import { parseSkoolNewMemberPayload } from "@/lib/new-member/parse-zap-payload";
import { scheduleDequeueFromBaseUrl } from "@/lib/new-member/trigger-dequeue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Zapier often appends \\n to pasted header values — trim so signing still matches. */
function normalizeToken(s: string | null | undefined): string {
  if (s == null) return "";
  return s.trim();
}

function verifyWebhookSecret(request: Request): boolean {
  const secret = (
    process.env.SKOOL_WEBHOOK_SECRET || process.env.NEW_MEMBER_WEBHOOK_SECRET
  )?.trim();
  if (!secret) {
    console.error("[webhooks/new-member] set SKOOL_WEBHOOK_SECRET or NEW_MEMBER_WEBHOOK_SECRET");
    return false;
  }
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? normalizeToken(auth.slice(7)) : "";
  const header = normalizeToken(request.headers.get("x-webhook-secret"));
  const token = bearer || header;
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
 * Validate Zapier/Skool secret, insert into Supabase, then trigger processing on
 * this deployment (fire-and-forget POST to /api/internal/new-member-dequeue).
 * Set INTERNAL_NEW_MEMBER_SECRET on Vercel so the trigger can authenticate.
 */
export async function POST(request: Request) {
  try {
    if (!verifyWebhookSecret(request)) {
      return NextResponse.json(
        { error: "Unauthorized", hint: "Trim x-webhook-secret / Bearer in Zapier; no trailing newlines" },
        { status: 401 },
      );
    }

    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    ) {
      return NextResponse.json(
        { error: "Server missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", code: "MISSING_ENV" },
        { status: 500 },
      );
    }

    const raw = await request.text();
    let body: unknown;
    try {
      if (raw.trim().startsWith("{") || raw.trim().startsWith("[")) {
        body = JSON.parse(raw) as unknown;
      } else {
        const ct = (request.headers.get("content-type") || "").toLowerCase();
        if (ct.includes("application/x-www-form-urlencoded") || raw.includes("=")) {
          const p = new URLSearchParams(raw);
          const o: Record<string, string> = {};
          p.forEach((v, k) => {
            o[k] = v;
          });
          body = o;
        } else {
          body = JSON.parse(raw) as unknown;
        }
      }
    } catch {
      return NextResponse.json(
        { error: "Body must be valid JSON (object) or x-www-form-urlencoded" },
        { status: 400 },
      );
    }

    const parsed = parseSkoolNewMemberPayload(body);
    if ("error" in parsed) {
      return NextResponse.json(
        {
          error: parsed.error,
          webhooksUrl:
            "POST JSON must include a discoverable email + US zip (5 digits). Map first_name, last_name, and answer_one/two/three if that is how Skool sends the quiz.",
        },
        { status: 400 },
      );
    }

    if (isNewMemberEmailBlocked(parsed.email)) {
      return NextResponse.json({
        ok: true,
        queued: false,
        skipped: true,
        reason: "new_member_blocklist",
      });
    }

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("new_member_automation_queue")
      .insert({ payload: parsed, status: "pending" })
      .select("id")
      .single();

    if (error || !data) {
      const msg = error?.message ?? "unknown supabase error";
      const pgrst = (error as { code?: string } | null)?.code;
      console.error("[webhooks/new-member] queue insert", pgrst, msg);
      return NextResponse.json(
        {
          error: msg,
          code: pgrst ?? "INSERT_FAILED",
          hint:
            pgrst === "42P01" || /relation.*does not exist/i.test(msg)
              ? "Run ops/new-member-automation-queue.sql in the Supabase SQL editor"
              : pgrst === "PGRST301" || /permission|RLS/i.test(msg)
                ? "Check Supabase RLS: service role should bypass RLS for this table"
                : undefined,
        },
        { status: 500 },
      );
    }

    const origin = new URL(request.url);
    scheduleDequeueFromBaseUrl(`${origin.protocol}//${origin.host}`);

    return NextResponse.json({
      ok: true,
      queued: true,
      queueId: data.id,
      message: "Processing started on this deployment (dequeue triggered)",
    });
  } catch (e) {
    console.error("[webhooks/new-member] unhandled", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "internal error",
        code: "UNHANDLED",
      },
      { status: 500 },
    );
  }
}

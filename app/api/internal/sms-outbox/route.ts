import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { verifySmsOutboxPollSecret } from "@/lib/internal/sms-outbox-auth";

export const dynamic = "force-dynamic";

/**
 * Pull / ACK queue: Mac Mini (or other worker) polls GET, sends with native iMessage
 * via OpenClaw CLI (`scripts/poll-sms-outbox.mjs`), then POSTs ack. Optional Twilio
 * on the worker via SMS_PROVIDER=twilio. Vercel can send Twilio only if
 * SMS_SEND_FROM_VERCEL_TWILIO=true on the webhook.
 *
 * Auth: Bearer SMS_OUTBOX_POLL_SECRET (or legacy OPENCLAW_POLL_SECRET).
 */
export async function GET(request: Request) {
  if (!verifySmsOutboxPollSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("openclaw_sms_outbox")
      .select("id, to_e164, message, share_url, automation_run_id, attempts, created_at")
      .is("sent_at", null)
      .lt("attempts", 8)
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) {
      console.error("[sms-outbox]", error.message);
      return NextResponse.json({ error: error.message, pending: [] }, { status: 500 });
    }

    return NextResponse.json({ pending: data ?? [] });
  } catch (e) {
    console.error("[sms-outbox]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!verifySmsOutboxPollSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      id: string;
      ok: boolean;
      error?: string;
    };

    if (!body?.id || typeof body.ok !== "boolean") {
      return NextResponse.json({ error: "id and ok (boolean) required" }, { status: 400 });
    }

    const supabase = getServiceRoleClient();

    if (body.ok) {
      const { data, error } = await supabase
        .from("openclaw_sms_outbox")
        .update({ sent_at: new Date().toISOString(), last_error: null })
        .eq("id", body.id)
        .is("sent_at", null)
        .select("id")
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ error: "Row not found or already sent" }, { status: 409 });
      }
      return NextResponse.json({ success: true });
    }

    const errMsg = (body.error ?? "send failed").slice(0, 2000);
    const { data: row } = await supabase
      .from("openclaw_sms_outbox")
      .select("attempts")
      .eq("id", body.id)
      .maybeSingle();

    const nextAttempts = (row?.attempts ?? 0) + 1;
    const { error: upErr } = await supabase
      .from("openclaw_sms_outbox")
      .update({ attempts: nextAttempts, last_error: errMsg })
      .eq("id", body.id);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, attempts: nextAttempts });
  } catch (e) {
    console.error("[sms-outbox ack]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}

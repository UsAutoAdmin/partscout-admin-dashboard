import { NextResponse } from "next/server";
import { unauthorized, verifyDequeueAuth } from "@/lib/internal/verify-dequeue-or-cron";
import { sendPickSheetGmailForRunId } from "@/lib/new-member/complete-pick-email-for-run";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST JSON `{ "runId": "<uuid>" }` — send the pick sheet email using **local** Gmail OAuth
 * (run `next dev` on a machine that has GOOGLE_* in `.env`). Not for Vercel unless you set
 * those env vars there (use ALLOW_GMAIL_ON_VERCEL on the pipeline instead).
 */
export async function POST(request: Request) {
  if (!verifyDequeueAuth(request)) {
    return unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const runId =
    typeof body === "object" &&
    body !== null &&
    "runId" in body &&
    typeof (body as { runId: unknown }).runId === "string"
      ? (body as { runId: string }).runId.trim()
      : "";
  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const result = await sendPickSheetGmailForRunId(runId);
  if (result.ok) {
    return NextResponse.json({
      ok: true,
      runId,
      messageId: result.messageId,
      crmTracked: result.crmTracked,
    });
  }
  if (result.code === "already_sent") {
    return NextResponse.json({ ok: true, runId, alreadySent: true });
  }
  const status =
    result.code === "not_found" ? 404 : result.code === "bad_state" ? 400 : 500;
  return NextResponse.json(
    { ok: false, runId, error: result.error, code: result.code },
    { status },
  );
}

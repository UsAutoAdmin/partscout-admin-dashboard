import { NextResponse } from "next/server";
import { createDraft } from "@/lib/gmail";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { toEmail, subject, body, threadId } = await req.json();
  if (!toEmail || !body) return NextResponse.json({ error: "toEmail and body required" }, { status: 400 });
  try {
    const draftId = await createDraft(toEmail, subject ?? "", body, threadId);
    return NextResponse.json({ draftId, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

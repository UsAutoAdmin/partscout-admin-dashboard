import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** 1×1 transparent GIF */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const t = url.searchParams.get("t") ?? "";

  if (UUID_RE.test(t)) {
    try {
      const supabase = getServiceRoleClient();
      const { data: msg } = await supabase
        .from("crm_messages")
        .select("id, contact_id")
        .eq("tracking_token", t)
        .maybeSingle();

      if (msg) {
        const ua = request.headers.get("user-agent") ?? undefined;
        await supabase.from("crm_message_events").insert({
          message_id: msg.id,
          link_id: null,
          event_type: "open",
          user_agent: ua,
        });
        await supabase
          .from("crm_contacts")
          .update({ last_activity_at: new Date().toISOString() })
          .eq("id", msg.contact_id);
      }
    } catch (e) {
      console.error("[crm/track/open]", e);
    }
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
    },
  });
}

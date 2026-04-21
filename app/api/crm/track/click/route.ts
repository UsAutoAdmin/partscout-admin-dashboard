import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const l = url.searchParams.get("l") ?? "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://partscout.app";
  const fallback = appUrl.replace(/\/$/, "");

  if (!UUID_RE.test(l)) {
    return NextResponse.redirect(fallback, 302);
  }

  try {
    const supabase = getServiceRoleClient();
    const { data: link } = await supabase
      .from("crm_message_links")
      .select("id, target_url, message_id")
      .eq("id", l)
      .maybeSingle();

    const target =
      link?.target_url &&
      (link.target_url.startsWith("http://") || link.target_url.startsWith("https://"))
        ? link.target_url
        : fallback;

    if (link) {
      const { data: msg } = await supabase
        .from("crm_messages")
        .select("contact_id")
        .eq("id", link.message_id)
        .maybeSingle();

      const ua = request.headers.get("user-agent") ?? undefined;
      await supabase.from("crm_message_events").insert({
        message_id: link.message_id,
        link_id: link.id,
        event_type: "click",
        user_agent: ua,
      });

      if (msg?.contact_id) {
        await supabase
          .from("crm_contacts")
          .update({ last_activity_at: new Date().toISOString() })
          .eq("id", msg.contact_id);
      }
    }

    return NextResponse.redirect(target, 302);
  } catch (e) {
    console.error("[crm/track/click]", e);
    return NextResponse.redirect(fallback, 302);
  }
}

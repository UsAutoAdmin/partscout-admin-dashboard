import { NextResponse } from "next/server";
import { sendPickSheetGmail } from "@/lib/new-member/send-pick-sheet-email";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      to: string;
      firstName: string;
      lastName?: string;
      shareUrl: string;
      yardName: string;
      yardCity: string;
      yardState: string;
      partCount: number;
      vehicleCount: number;
      communityName?: string;
      senderName?: string;
      customMessage?: string;
      crmTracking?: boolean;
      phone?: string;
      zip?: string;
    };

    const {
      to,
      firstName,
      lastName,
      shareUrl,
      yardName,
      yardCity,
      yardState,
      partCount,
      vehicleCount,
      communityName,
      senderName,
      customMessage,
      crmTracking = true,
      phone,
      zip,
    } = body;

    const result = await sendPickSheetGmail({
      to,
      firstName,
      lastName,
      sharePath: shareUrl,
      yardNameForSubject: yardName,
      yardCity,
      yardState,
      partCount,
      vehicleCount,
      customMessage,
      communityName,
      senderName,
      crmTracking,
      phone,
      zip,
    });

    if (!result.ok) {
      if (result.code === "gmail_not_configured") {
        return NextResponse.json(
          {
            error:
              "Gmail OAuth not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, and GOOGLE_EMAIL_ADDRESS to .env.local (scope must include gmail.compose or gmail.send), then restart.",
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      method: "gmail",
      messageId: result.messageId,
      crmTracked: result.crmTracked,
      crmMessageId: result.crmMessageId,
    });
  } catch (err) {
    console.error("[send-email]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Email failed" },
      { status: 500 },
    );
  }
}

/**
 * Pick-sheet email body builders (Gmail and future providers).
 * HTML is minimal — like a person typed the message, not a marketing layout — to stay
 * aligned with the plain part and look natural in the inbox.
 */

/** Sum sell_price for “worth $X,XXX” in the member email. */
export function sumSellPricesForWorthDollars(
  parts: ReadonlyArray<{ sell_price: number | null }>,
): number | null {
  let s = 0;
  for (const p of parts) {
    if (typeof p.sell_price === "number" && p.sell_price > 0) s += p.sell_price;
  }
  if (s < 1) return null;
  return Math.round(s);
}

export function formatCurrencyUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export interface BuildEmailParams {
  firstName: string;
  sharePath: string;
  appUrl: string;
  partCount: number;
  partTotalWorthDollars: number | null;
  communityName: string;
  senderName: string;
  customMessage?: string;
}

type BodyBlock = { type: "line"; text: string } | { type: "link"; href: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * One ordered list of blocks — used to build both plain and HTML so they match.
 */
function buildBodyBlocks(p: BuildEmailParams & { fullShareUrl: string }): BodyBlock[] {
  const d = (p.firstName || "there").trim() || "there";
  const worthLine =
    p.partTotalWorthDollars != null && p.partTotalWorthDollars > 0
      ? `I researched your local yard for you and found ${p.partCount} parts worth ${formatCurrencyUsd(p.partTotalWorthDollars)}.`
      : `I researched your local yard for you and found ${p.partCount} parts.`;

  const blocks: BodyBlock[] = [
    { type: "line", text: `Hey, ${d}` },
    { type: "line", text: worthLine },
    {
      type: "line",
      text:
        "Here is your custom pick sheet link. You can get a free trial to access it and generate unlimited additional pick sheets for U-Pull style yards in your area.",
    },
    { type: "line", text: "Here is your pick sheet:" },
    { type: "link", href: p.fullShareUrl },
    {
      type: "line",
      text:
        "Try to get to the parts as soon as possible as these highly profitable ones get grabbed the quickest.",
    },
    {
      type: "line",
      text: `In the meantime I have also invited you to the ${p.communityName} community of auto part flippers. Inside there is a full course on how I flip parts, and a static list of 100 parts I've recently sold. This is totally free no card or anything.`,
    },
  ];

  if (p.customMessage?.trim()) {
    for (const line of p.customMessage.split("\n")) {
      const t = line.trim();
      if (t) blocks.push({ type: "line", text: t });
    }
  }

  blocks.push({ type: "line", text: "Best," }, { type: "line", text: p.senderName });
  return blocks;
}

const P_STYLE =
  "margin:0 0 1em 0;padding:0;font-size:15px;line-height:1.55;color:#202124;";

const LINK_STYLE = "color:#1a0dab;text-decoration:underline;word-break:break-all;";

export function buildEmailHtml(params: BuildEmailParams): string {
  const relPath = params.sharePath.startsWith("/") ? params.sharePath : `/${params.sharePath}`;
  const appUrl = params.appUrl.replace(/\/$/, "");
  const fullShareUrl = `${appUrl}${relPath}`;
  const community =
    params.communityName?.trim() || process.env.EMAIL_COMMUNITY_NAME || "Auto Salvage Hub";
  const sender =
    params.senderName?.trim() || process.env.EMAIL_SENDER_NAME || "Chase Eriksson";

  const blocks = buildBodyBlocks({
    ...params,
    communityName: community,
    senderName: sender,
    fullShareUrl,
  });

  const inner = blocks
    .map((b) => {
      if (b.type === "line") {
        return `<p style="${P_STYLE}">${escapeHtml(b.text).replace(/\n/g, "<br>")}</p>`;
      }
      return `<p style="margin:0 0 1em 0;padding:0"><a href="${escapeHtml(b.href)}" style="${LINK_STYLE}">${escapeHtml(
        b.href,
      )}</a></p>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body style="margin:0;padding:0;">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;padding:8px 4px;max-width:100%;">
${inner}
</div>
</body>
</html>`;
}

export interface BuildPlainTextParams {
  firstName: string;
  fullShareUrl: string;
  partCount: number;
  partTotalWorthDollars: number | null;
  communityName: string;
  senderName: string;
  customMessage?: string;
}

export function buildPlainText(params: BuildPlainTextParams): string {
  const community =
    params.communityName?.trim() || process.env.EMAIL_COMMUNITY_NAME || "Auto Salvage Hub";
  const sender =
    params.senderName?.trim() || process.env.EMAIL_SENDER_NAME || "Chase Eriksson";

  const bodyBlocks = buildBodyBlocks({
    firstName: params.firstName,
    sharePath: "",
    appUrl: "",
    partCount: params.partCount,
    partTotalWorthDollars: params.partTotalWorthDollars,
    communityName: community,
    senderName: sender,
    customMessage: params.customMessage,
    fullShareUrl: params.fullShareUrl,
  });

  return bodyBlocks
    .map((b) => (b.type === "line" ? b.text : b.href))
    .join("\n\n");
}

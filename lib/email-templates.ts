/**
 * Pick-sheet email body builders.
 * Kept platform-agnostic so the same HTML is used for Gmail / future providers.
 */

interface BuildEmailParams {
  firstName: string;
  shareUrl: string;
  appUrl: string;
  communityName: string;
  senderName: string;
  customMessage?: string;
}

export function buildEmailHtml(params: BuildEmailParams): string {
  const { firstName, shareUrl, appUrl, communityName, senderName, customMessage } = params;
  const fullShareUrl = `${appUrl}${shareUrl}`;

  const defaultMessage = `If you haven't flipped any parts watch the full free course in the community to get started. Come back to Part Scout once you've made some money, but don't wait too long as the founding membership with a lifetime price lock is limited.`;
  const bodyMessage = customMessage || defaultMessage;

  const messageLines = bodyMessage
    .split("\n")
    .filter((l) => l.trim())
    .map(
      (l) =>
        `<p style="margin:0 0 16px;color:#1f2937;font-size:16px;line-height:1.7;">${escapeHtml(l.trim())}</p>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Pick Sheet is Ready</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:48px 24px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:0;">

              <p style="margin:0 0 16px;color:#1f2937;font-size:16px;line-height:1.7;">
                Hey ${escapeHtml(firstName)}, thanks for being a member of ${escapeHtml(communityName)}. As promised, here is your custom pick sheet for your local junkyard should you decide to be a founding member of Part Scout.
              </p>

              <p style="margin:0 0 16px;">
                <a href="${fullShareUrl}"
                   style="color:#2563eb;font-size:16px;line-height:1.7;word-break:break-all;font-family:Georgia,'Times New Roman',serif;">
                  ${escapeHtml(fullShareUrl)}
                </a>
              </p>

              ${messageLines}

              <p style="margin:32px 0 0;color:#1f2937;font-size:16px;line-height:1.7;">
                Best,<br/>
                ${escapeHtml(senderName)}
              </p>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

interface BuildPlainTextParams {
  firstName: string;
  fullShareUrl: string;
  yardName: string;
  yardCity: string;
  yardState: string;
  partCount: number;
  vehicleCount: number;
  communityName: string;
  senderName: string;
  customMessage?: string;
}

export function buildPlainText(params: BuildPlainTextParams): string {
  const defaultMessage = `If you haven't flipped any parts watch the full free course in the community to get started. Come back to Part Scout once you've made some money, but don't wait too long as the founding membership with a lifetime price lock is limited.`;
  const bodyMessage = params.customMessage || defaultMessage;
  return [
    `Hey ${params.firstName},`,
    ``,
    `Thanks for being a member of ${params.communityName}. As promised, here is your custom pick sheet for your local junkyard should you decide to be a founding member of Part Scout.`,
    ``,
    params.fullShareUrl,
    ``,
    `Your custom pick sheet for ${params.yardName} in ${params.yardCity}, ${params.yardState} is ready.`,
    `${params.partCount} parts across ${params.vehicleCount} vehicles.`,
    ``,
    bodyMessage,
    ``,
    `Best,`,
    params.senderName,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

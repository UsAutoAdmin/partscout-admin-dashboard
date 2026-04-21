import { randomBytes } from "crypto";

const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

function wrapMimeBase64(b64: string): string {
  return (b64.match(/.{1,76}/g) ?? [b64]).join("\r\n");
}

/** RFC 822 message → base64url for Gmail API `raw`. */
function rfc822ToGmailRaw(rfc822: string): string {
  return Buffer.from(rfc822, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function isGmailOutboundConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN &&
      process.env.GOOGLE_EMAIL_ADDRESS,
  );
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  subject: string;
  date: string;
  snippet: string;
  isUnread: boolean;
}

async function getAccessToken(): Promise<string> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Gmail token error: ${data.error_description}`);
  return data.access_token as string;
}

function parseFrom(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2] };
  return { name: raw, email: raw };
}

export async function fetchInboxMessages(maxResults = 20): Promise<GmailMessage[]> {
  const token = await getAccessToken();
  const listRes = await fetch(
    `${GMAIL_API}/messages?maxResults=${maxResults}&labelIds=INBOX`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const listData = await listRes.json();
  const messages: any[] = listData.messages ?? [];

  const full = await Promise.all(
    messages.map((m) =>
      fetch(
        `${GMAIL_API}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then((r) => r.json())
    )
  );

  return full.map((msg) => {
    const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
    const get = (name: string) => headers.find((h) => h.name === name)?.value ?? "";
    const { name: fromName, email: fromEmail } = parseFrom(get("From"));
    return {
      id: msg.id,
      threadId: msg.threadId,
      from: fromName || fromEmail,
      fromEmail,
      subject: get("Subject") || "(no subject)",
      date: get("Date"),
      snippet: msg.snippet ?? "",
      isUnread: (msg.labelIds ?? []).includes("UNREAD"),
    };
  });
}

export async function createDraft(
  toEmail: string,
  subject: string,
  body: string,
  threadId?: string
): Promise<string> {
  const token = await getAccessToken();
  const fromEmail = process.env.GOOGLE_EMAIL_ADDRESS ?? "";
  const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
  const rawLines = [
    `From: ${fromEmail}`,
    `To: ${toEmail}`,
    `Subject: ${replySubject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body,
  ];
  const raw = Buffer.from(rawLines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const payload: any = { message: { raw } };
  if (threadId) payload.message.threadId = threadId;

  const res = await fetch(`${GMAIL_API}/drafts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "Failed to create draft");
  return data.id as string;
}

/**
 * Send an outbound HTML+text multipart message via Gmail API. Same OAuth
 * refresh token as the admin inbox (scope must include gmail.compose or
 * gmail.send).
 */
export async function sendGmailHtmlEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromDisplayName?: string;
}): Promise<{ id: string }> {
  const token = await getAccessToken();
  const addr = (process.env.GOOGLE_EMAIL_ADDRESS ?? "").trim();
  if (!addr) throw new Error("GOOGLE_EMAIL_ADDRESS is not set");

  const display =
    params.fromDisplayName?.trim() ||
    process.env.GOOGLE_SENDER_NAME?.trim() ||
    process.env.EMAIL_SENDER_NAME?.trim() ||
    "Part Scout";
  const fromHeader = `${display} <${addr}>`;

  const boundary = `ps_${randomBytes(16).toString("hex")}`;
  const textB64 = wrapMimeBase64(Buffer.from(params.text, "utf8").toString("base64"));
  const htmlB64 = wrapMimeBase64(Buffer.from(params.html, "utf8").toString("base64"));
  const safeSubject = params.subject.replace(/\r?\n/g, " ").trim();

  const rfc822 = [
    `From: ${fromHeader}`,
    `To: ${params.to}`,
    `Subject: ${safeSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    textB64,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    htmlB64,
    `--${boundary}--`,
    ``,
  ].join("\r\n");

  const raw = rfc822ToGmailRaw(rfc822);

  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data.error?.message ?? JSON.stringify(data);
    throw new Error(`Gmail send failed: ${msg}`);
  }
  return { id: data.id as string };
}

const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

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

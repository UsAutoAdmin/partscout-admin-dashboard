"use client";

import { useState } from "react";

interface Email {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  subject: string;
  date: string;
  snippet: string;
  isUnread: boolean;
}

function timeAgo(dateStr: string) {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return dateStr; }
}

export function GmailInbox({ initialEmails }: { initialEmails: Email[] }) {
  const [selected, setSelected] = useState<Email | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  async function saveDraft() {
    if (!selected || !draftBody.trim()) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: selected.fromEmail, subject: selected.subject, body: draftBody, threadId: selected.threadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus("saved");
      setDraftBody("");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (e: any) {
      setStatus("error");
      setErrMsg(e.message);
    }
  }

  if (initialEmails.length === 0) {
    return <div className="rounded-xl border border-border bg-white p-6 text-sm text-ink-subtle">No emails found in inbox.</div>;
  }

  return (
    <div className="rounded-xl border border-border bg-white shadow-brand-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-ink text-sm">Business Inbox — {initialEmails.filter(e => e.isUnread).length} unread</h3>
        <span className="text-xs text-ink-subtle">{initialEmails.length} messages</span>
      </div>
      <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
        {initialEmails.map((email) => (
          <div key={email.id}>
            <button
              onClick={() => { setSelected(selected?.id === email.id ? null : email); setDraftBody(""); setStatus("idle"); }}
              className={`w-full text-left px-5 py-3.5 hover:bg-cream transition-colors ${selected?.id === email.id ? "bg-brand-muted" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {email.isUnread && <span className="shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-1" />}
                  <div className="min-w-0">
                    <p className={`text-sm truncate ${email.isUnread ? "font-bold text-ink" : "font-medium text-ink-muted"}`}>{email.from}</p>
                    <p className={`text-xs truncate mt-0.5 ${email.isUnread ? "font-semibold text-ink" : "text-ink-muted"}`}>{email.subject}</p>
                    <p className="text-xs text-ink-subtle truncate mt-0.5">{email.snippet}</p>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-ink-subtle">{timeAgo(email.date)}</span>
              </div>
            </button>

            {selected?.id === email.id && (
              <div className="px-5 pb-4 bg-brand-muted border-b border-brand-muted">
                <p className="text-xs font-semibold text-ink-subtle mb-2">Draft reply → {email.fromEmail}</p>
                <textarea
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  placeholder="Write your reply…"
                  rows={4}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-ink-subtle">Saves to Gmail Drafts — you send from Gmail</p>
                  <button
                    onClick={saveDraft}
                    disabled={!draftBody.trim() || status === "saving"}
                    className="rounded-lg bg-brand px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-40 transition-colors"
                  >
                    {status === "saving" ? "Saving…" : status === "saved" ? "✓ Saved" : "Save Draft"}
                  </button>
                </div>
                {status === "error" && <p className="text-xs text-red-500 mt-1">{errMsg}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

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
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-6 text-sm text-gray-500">
        No emails found in inbox.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <h4 className="font-semibold text-gray-900 dark:text-white/90 text-sm">
          Business Inbox — {initialEmails.filter(e => e.isUnread).length} unread
        </h4>
        <span className="text-xs text-gray-500">{initialEmails.length} messages</span>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-800 max-h-[520px] overflow-y-auto custom-scrollbar">
        {initialEmails.map((email) => (
          <div key={email.id}>
            <button
              onClick={() => { setSelected(selected?.id === email.id ? null : email); setDraftBody(""); setStatus("idle"); }}
              className={`w-full text-left px-5 py-3.5 transition-colors ${
                selected?.id === email.id
                  ? "bg-brand-50 dark:bg-brand-500/[0.08]"
                  : "hover:bg-gray-50 dark:hover:bg-white/[0.02]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {email.isUnread && <span className="shrink-0 w-2 h-2 rounded-full bg-brand-400 mt-1" />}
                  <div className="min-w-0">
                    <p className={`text-sm truncate ${email.isUnread ? "font-bold text-gray-900 dark:text-white/90" : "font-medium text-gray-700 dark:text-gray-300"}`}>
                      {email.from}
                    </p>
                    <p className={`text-xs truncate mt-0.5 ${email.isUnread ? "font-semibold text-gray-900 dark:text-white/90" : "text-gray-500 dark:text-gray-400"}`}>
                      {email.subject}
                    </p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{email.snippet}</p>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-gray-500">{timeAgo(email.date)}</span>
              </div>
            </button>

            {selected?.id === email.id && (
              <div className="px-5 pb-4 bg-brand-50 dark:bg-brand-500/[0.05] border-b border-gray-200 dark:border-gray-800">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Draft reply → {email.fromEmail}</p>
                <textarea
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  placeholder="Write your reply..."
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white/90 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/50 resize-none"
                />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-500">Saves to Gmail Drafts — you send from Gmail</p>
                  <button
                    onClick={saveDraft}
                    disabled={!draftBody.trim() || status === "saving"}
                    className="rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40 transition-colors"
                  >
                    {status === "saving" ? "Saving..." : status === "saved" ? "Saved" : "Save Draft"}
                  </button>
                </div>
                {status === "error" && <p className="text-xs text-error-500 dark:text-error-400 mt-1">{errMsg}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

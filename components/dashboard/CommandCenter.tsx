"use client";

import { useEffect, useState } from "react";

type CommandMessage = {
  role: "user" | "assistant";
  body: string;
  createdAt: string;
};

type CommandTask = {
  id: number;
  title: string;
  status: "open" | "done";
  createdAt: string;
  updatedAt?: string;
};

type CommandState = {
  messages: CommandMessage[];
  tasks: CommandTask[];
  lastUpdated: string | null;
};

const emptyState: CommandState = { messages: [], tasks: [], lastUpdated: null };

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default function CommandCenter() {
  const [state, setState] = useState<CommandState>(emptyState);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithTimeout("/api/command-center")
      .then((res) => res.json())
      .then((data) => setState(data))
      .catch(() => setError("Couldn’t load command history."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetchWithTimeout("/api/command-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Command center request failed.");
      }

      setState(data.state);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Command center request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Command center</p>
            <h3 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white/90">Talk to Chud from inside the dashboard</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">This is the communication-first home for directing work without dropping to terminal chat.</p>
          </div>
          <div className="rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-700 dark:bg-brand-500/[0.12] dark:text-brand-300">
            {state.lastUpdated ? `Updated ${new Date(state.lastUpdated).toLocaleString()}` : "Waiting for first command"}
          </div>
        </div>

        <div className="custom-scrollbar mb-4 flex max-h-[420px] min-h-[320px] flex-col gap-3 overflow-y-auto rounded-2xl bg-gray-50 p-4 dark:bg-black/20">
          {loading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading command history…</div>
          ) : state.messages.length ? (
            state.messages.map((entry, index) => (
              <div
                key={`${entry.createdAt}-${index}`}
                className={`max-w-[88%] rounded-2xl px-4 py-3 ${entry.role === "assistant" ? "bg-brand-50 text-brand-950 dark:bg-brand-500/[0.14] dark:text-brand-100" : "ml-auto bg-gray-900 text-white dark:bg-white/10 dark:text-white"}`}
              >
                <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] opacity-70">
                  {entry.role === "assistant" ? "Chud" : "You"}
                </div>
                <div className="whitespace-pre-wrap text-sm leading-6">{entry.body}</div>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">No command history yet. Try “add task audit inbox workflow”.</div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Tell Chud what to work on next…"
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none ring-0 transition focus:border-brand-400 dark:border-gray-800 dark:bg-[#0f1115] dark:text-white/90"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Built-in commands: add task, complete task, show tasks, status.</p>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Send to Chud"}
            </button>
          </div>
          {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}
        </form>
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">State</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-black/20">
              <div className="text-xs text-gray-500 dark:text-gray-400">Messages</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{state.messages.length}</div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-black/20">
              <div className="text-xs text-gray-500 dark:text-gray-400">Tasks</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{state.tasks.length}</div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-black/20">
              <div className="text-xs text-gray-500 dark:text-gray-400">Open tasks</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{state.tasks.filter((task) => task.status === "open").length}</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Tracked tasks</p>
              <h4 className="mt-1 text-base font-semibold text-gray-900 dark:text-white/90">Dashboard-native work queue</h4>
            </div>
          </div>
          <div className="space-y-3">
            {state.tasks.length ? state.tasks.slice().reverse().map((task) => (
              <div key={task.id} className="rounded-xl bg-gray-50 p-4 dark:bg-black/20">
                <div className="text-sm font-medium text-gray-900 dark:text-white">#{task.id} · {task.title}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{task.status.toUpperCase()} · {new Date(task.createdAt).toLocaleString()}</div>
              </div>
            )) : (
              <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-black/20 dark:text-gray-400">No tasks yet.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

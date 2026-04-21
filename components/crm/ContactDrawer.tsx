"use client";

import { useEffect, useState } from "react";
import Badge from "../Badge";
import { timeAgo } from "@/lib/format";
import type { ContactDetail, ContactTimelineEvent, Stage } from "@/lib/crm-types";
import ActivityHeatmap from "./ActivityHeatmap";

interface Props {
  rowKey: string | null;
  onClose: () => void;
}

const STAGE_BADGE_COLOR: Record<Stage, "default" | "info" | "warning" | "brand" | "success" | "error"> = {
  community: "default",
  emailed: "info",
  opened: "info",
  clicked: "brand",
  signed_up: "brand",
  trial: "warning",
  paid: "success",
};

const TIMELINE_ICON: Record<ContactTimelineEvent["type"], { color: string; label: string }> = {
  email_sent: { color: "bg-blue-light-500", label: "\u2709" },
  email_opened: { color: "bg-success-500", label: "\u25CB" },
  email_clicked: { color: "bg-brand-500", label: "\u2192" },
  user_created: { color: "bg-brand-500", label: "+" },
  trial_started: { color: "bg-warning-500", label: "T" },
  subscription_started: { color: "bg-success-500", label: "$" },
  ebay_connected: { color: "bg-info-500", label: "e" },
  pick_sheet_created: { color: "bg-brand-400", label: "\u2630" },
  last_sign_in: { color: "bg-gray-400", label: "\u25CF" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function nameOf(d: ContactDetail) {
  const n = [d.contact.firstName, d.contact.lastName].filter(Boolean).join(" ").trim();
  return n || d.contact.email || "—";
}

export default function ContactDrawer({ rowKey, onClose }: Props) {
  const [data, setData] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rowKey) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/crm/contacts/${encodeURIComponent(rowKey)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        setData(json as ContactDetail);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "load failed");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rowKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (rowKey) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rowKey, onClose]);

  if (!rowKey) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 dark:bg-gray-900/60"
        onClick={onClose}
      />
      <aside className="fixed top-0 right-0 z-50 h-screen w-full sm:w-[480px] bg-white dark:bg-[#0a0a0a] border-l border-gray-200 dark:border-gray-800 overflow-y-auto">
        {loading && (
          <div className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-6 w-40 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-4 w-56 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-24 rounded-xl bg-gray-200 dark:bg-gray-800" />
              <div className="h-40 rounded-xl bg-gray-200 dark:bg-gray-800" />
            </div>
          </div>
        )}

        {error && (
          <div className="p-6">
            <p className="text-sm text-error-500">Failed to load contact: {error}</p>
            <button onClick={onClose} className="mt-3 text-xs text-gray-500 underline">
              Close
            </button>
          </div>
        )}

        {data && <DrawerBody data={data} onClose={onClose} />}
      </aside>
    </>
  );
}

function DrawerBody({ data, onClose }: { data: ContactDetail; onClose: () => void }) {
  const name = nameOf(data);
  const planSlug = data.user?.clerk_plan_slug ?? null;
  const subStatus = data.user?.clerk_subscription_status ?? data.user?.stripe_subscription_status ?? null;

  return (
    <div>
      <div className="sticky top-0 z-10 bg-white dark:bg-[#0a0a0a] border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge color={STAGE_BADGE_COLOR[data.stage]}>{data.stage.replace("_", " ")}</Badge>
            {data.isDirect && <Badge color="default">Direct</Badge>}
            {data.user?.ebay_connected_at && <Badge color="info">eBay</Badge>}
          </div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white/90 truncate">{name}</h2>
          <p className="text-xs text-gray-500 truncate">{data.contact.email || "—"}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Contact info */}
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Contact</h4>
          <dl className="grid grid-cols-2 gap-y-2 text-xs">
            <dt className="text-gray-500">Zip</dt>
            <dd className="text-gray-900 dark:text-white/90">{data.contact.zip || "—"}</dd>
            <dt className="text-gray-500">Phone</dt>
            <dd className="text-gray-900 dark:text-white/90">{data.contact.phone || "—"}</dd>
            <dt className="text-gray-500">Joined Skool</dt>
            <dd className="text-gray-900 dark:text-white/90">
              {data.contact.createdAt ? fmtDate(data.contact.createdAt) : "—"}
            </dd>
            <dt className="text-gray-500">Last activity</dt>
            <dd className="text-gray-900 dark:text-white/90">
              {data.contact.lastActivityAt ? fmtDate(data.contact.lastActivityAt) : "—"}
            </dd>
          </dl>
        </section>

        {/* User / subscription */}
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Account</h4>
          {data.user ? (
            <dl className="grid grid-cols-2 gap-y-2 text-xs">
              <dt className="text-gray-500">Clerk plan</dt>
              <dd className="text-gray-900 dark:text-white/90">{planSlug ?? "—"}</dd>
              <dt className="text-gray-500">Status</dt>
              <dd className="text-gray-900 dark:text-white/90">{subStatus ?? "—"}</dd>
              <dt className="text-gray-500">Period end</dt>
              <dd className="text-gray-900 dark:text-white/90">
                {data.user.clerk_period_end
                  ? fmtDate(data.user.clerk_period_end)
                  : data.user.stripe_current_period_end
                  ? fmtDate(data.user.stripe_current_period_end)
                  : "—"}
              </dd>
              <dt className="text-gray-500">Cancels at end?</dt>
              <dd className="text-gray-900 dark:text-white/90">
                {data.user.clerk_cancel_at_period_end || data.user.stripe_cancel_at_period_end ? "yes" : "no"}
              </dd>
              <dt className="text-gray-500">Last sign-in</dt>
              <dd className="text-gray-900 dark:text-white/90">
                {data.user.last_sign_in_at ? `${fmtDate(data.user.last_sign_in_at)} (${timeAgo(data.user.last_sign_in_at)})` : "—"}
              </dd>
            </dl>
          ) : (
            <p className="text-xs text-gray-500">
              No Part Scout account yet (no <code>users</code> row matches this email).
            </p>
          )}
        </section>

        {/* Meaningful actions */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Pick sheets generated
            </h4>
            <span className="text-[11px] text-gray-500">last 12 weeks</span>
          </div>
          {data.user ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
              <div className="flex items-center gap-3">
                <ActivityHeatmap byDay={data.pickSheetHeatmap} size="md" weeks={12} />
                <div className="text-xs">
                  <p className="text-gray-900 dark:text-white/90 font-semibold">{data.pickSheets.length} total</p>
                  <p className="text-gray-500">{data.pickSheetHeatmap.reduce((a, b) => a + b, 0)} in last 12 weeks</p>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-gray-400">
                Sign-in event log coming soon &mdash; using pick-sheet creation as the meaningful-action signal.
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-500">No account, no pick sheets.</p>
          )}
        </section>

        {/* Messages */}
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            Emails ({data.messages.length})
          </h4>
          {data.messages.length === 0 ? (
            <p className="text-xs text-gray-500">No emails sent yet.</p>
          ) : (
            <div className="space-y-2">
              {data.messages.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white/90 truncate">{m.subject}</p>
                      <p className="text-gray-500 mt-0.5">
                        {m.yardName ? `${m.yardName}` : ""}
                        {m.yardCity ? ` \u00b7 ${m.yardCity}${m.yardState ? `, ${m.yardState}` : ""}` : ""}
                      </p>
                    </div>
                    <span className="text-gray-500 whitespace-nowrap">{timeAgo(m.sentAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-gray-500">via {m.deliveryMethod ?? "?"}</span>
                    <span className={m.opens.length > 0 ? "text-success-500" : "text-gray-400"}>
                      {m.opens.length} open{m.opens.length === 1 ? "" : "s"}
                    </span>
                    <span className={m.clicks.length > 0 ? "text-brand-500" : "text-gray-400"}>
                      {m.clicks.length} click{m.clicks.length === 1 ? "" : "s"}
                    </span>
                    {m.sharePath && (
                      <span className="text-gray-500 truncate font-mono text-[10px]">{m.sharePath}</span>
                    )}
                  </div>
                  {m.clicks.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {m.clicks.map((c) => (
                        <li key={c.id} className="text-[11px] text-gray-600 dark:text-gray-400 truncate">
                          <span className="text-brand-500">\u2192</span>{" "}
                          {c.targetUrl ? (
                            <a href={c.targetUrl} target="_blank" rel="noreferrer" className="underline hover:text-brand-500 truncate">
                              {c.targetUrl}
                            </a>
                          ) : (
                            "(unknown link)"
                          )}{" "}
                          <span className="text-gray-400">{timeAgo(c.at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Timeline */}
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            Timeline
          </h4>
          {data.timeline.length === 0 ? (
            <p className="text-xs text-gray-500">No events recorded.</p>
          ) : (
            <ol className="relative border-l border-gray-200 dark:border-gray-800 ml-1.5 space-y-3">
              {data.timeline.map((e, i) => {
                const meta = TIMELINE_ICON[e.type];
                return (
                  <li key={`${e.type}-${i}`} className="ml-4">
                    <span
                      className={`absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white ${meta.color}`}
                    >
                      {meta.label}
                    </span>
                    <div className="text-xs">
                      <p className="text-gray-900 dark:text-white/90 font-medium">{e.label}</p>
                      {e.detail && (
                        <p className="text-gray-500 truncate">{e.detail}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(e.at)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

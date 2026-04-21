"use client";

import Badge from "../Badge";
import { timeAgo } from "@/lib/format";
import { STAGES, type PipelineRow, type Stage } from "@/lib/crm-types";
import ActivityHeatmap from "./ActivityHeatmap";

interface Props {
  rows: PipelineRow[];
  selectedRowKey: string | null;
  onSelect: (rowKey: string) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey) => void;
}

export type SortKey = "lastActivity" | "emails" | "opens" | "clicks" | "pickSheets" | "stage" | "joined";
export type SortDir = "asc" | "desc";

const STAGE_RANK: Record<Stage, number> = STAGES.reduce(
  (acc, s, i) => ({ ...acc, [s]: i }),
  {} as Record<Stage, number>,
);

const STAGE_BADGE_COLOR: Record<Stage, "default" | "info" | "warning" | "brand" | "success" | "error"> = {
  community: "default",
  emailed: "info",
  opened: "info",
  clicked: "brand",
  signed_up: "brand",
  trial: "warning",
  paid: "success",
};

function nameFor(r: PipelineRow): string {
  const name = [r.firstName, r.lastName].filter(Boolean).join(" ").trim();
  return name || r.email || "—";
}

function lastActivityIso(r: PipelineRow): string | null {
  const candidates = [
    r.lastSignInAt,
    r.lastPickSheetAt,
    r.firstClickedAt,
    r.firstOpenedAt,
    r.lastSentAt,
    r.contactLastActivityAt,
    r.contactCreatedAt,
    r.userCreatedAt,
  ].filter(Boolean) as string[];
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.localeCompare(a))[0];
}

function planLabel(r: PipelineRow): { label: string; color: "default" | "info" | "warning" | "brand" | "success" | "error" } {
  if (r.isPaid) return { label: r.clerkPlanSlug ?? "paid", color: "success" };
  if (r.isTrial) return { label: "trial", color: "warning" };
  if (r.userId) return { label: r.clerkPlanSlug ?? "free", color: "info" };
  return { label: "—", color: "default" };
}

function HeaderCell({
  label,
  sortKey,
  current,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  sortKey?: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick?: (k: SortKey) => void;
  align?: "left" | "right" | "center";
}) {
  const isActive = sortKey && current === sortKey;
  const arrow = isActive ? (dir === "desc" ? "\u2193" : "\u2191") : "";
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      className={`px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 ${alignClass} ${
        sortKey ? "cursor-pointer select-none" : ""
      }`}
      onClick={sortKey && onClick ? () => onClick(sortKey) : undefined}
    >
      <span className={`inline-flex items-center gap-1 ${isActive ? "text-gray-900 dark:text-white/90" : ""}`}>
        {label}
        {arrow && <span className="text-[10px]">{arrow}</span>}
      </span>
    </th>
  );
}

export default function ContactsTable({
  rows,
  selectedRowKey,
  onSelect,
  sortKey,
  sortDir,
  onSortChange,
}: Props) {
  const sorted = [...rows].sort((a, b) => {
    const dir = sortDir === "desc" ? -1 : 1;
    switch (sortKey) {
      case "emails":
        return dir * (a.emailCount - b.emailCount);
      case "opens":
        return dir * (a.openCount - b.openCount);
      case "clicks":
        return dir * (a.clickCount - b.clickCount);
      case "pickSheets":
        return dir * (a.pickSheetCount - b.pickSheetCount);
      case "stage":
        return dir * (STAGE_RANK[a.stage] - STAGE_RANK[b.stage]);
      case "joined": {
        const aT = a.contactCreatedAt ?? a.userCreatedAt ?? "";
        const bT = b.contactCreatedAt ?? b.userCreatedAt ?? "";
        return dir * aT.localeCompare(bT);
      }
      case "lastActivity":
      default: {
        const aT = lastActivityIso(a) ?? "";
        const bT = lastActivityIso(b) ?? "";
        return dir * aT.localeCompare(bT);
      }
    }
  });

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-gray-800">
            <tr>
              <HeaderCell label="Contact" current={sortKey} dir={sortDir} />
              <HeaderCell label="Zip" current={sortKey} dir={sortDir} />
              <HeaderCell label="Stage" sortKey="stage" current={sortKey} dir={sortDir} onClick={onSortChange} />
              <HeaderCell label="Emails" sortKey="emails" current={sortKey} dir={sortDir} onClick={onSortChange} align="right" />
              <HeaderCell label="Opens" sortKey="opens" current={sortKey} dir={sortDir} onClick={onSortChange} align="right" />
              <HeaderCell label="Clicks" sortKey="clicks" current={sortKey} dir={sortDir} onClick={onSortChange} align="right" />
              <HeaderCell label="Pick Sheets" sortKey="pickSheets" current={sortKey} dir={sortDir} onClick={onSortChange} />
              <HeaderCell label="Auto Email Sent" current={sortKey} dir={sortDir} align="center" />
              <HeaderCell label="Auto Email Opened" current={sortKey} dir={sortDir} align="center" />
              <HeaderCell label="Auto Pick Sheet Clicked" current={sortKey} dir={sortDir} align="center" />
              <HeaderCell label="Plan" current={sortKey} dir={sortDir} />
              <HeaderCell label="Last Activity" sortKey="lastActivity" current={sortKey} dir={sortDir} onClick={onSortChange} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-sm text-gray-500">
                  No contacts match the current filter.
                </td>
              </tr>
            )}
            {sorted.map((r) => {
              const isSelected = r.rowKey === selectedRowKey;
              const plan = planLabel(r);
              const lastIso = lastActivityIso(r);
              return (
                <tr
                  key={r.rowKey}
                  onClick={() => onSelect(r.rowKey)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-brand-50 dark:bg-brand-500/[0.08]"
                      : "hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-[11px] font-semibold text-gray-600 dark:text-gray-300 shrink-0">
                        {(nameFor(r)[0] || "?").toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-900 dark:text-white/90 truncate">{nameFor(r)}</p>
                          {r.isDirect && <Badge color="default">Direct</Badge>}
                          {r.ebayConnectedAt && <Badge color="info">eBay</Badge>}
                        </div>
                        <p className="text-[11px] text-gray-500 truncate">{r.email || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-400">{r.zip || "—"}</td>
                  <td className="px-3 py-2.5">
                    <Badge color={STAGE_BADGE_COLOR[r.stage]}>{r.stage.replace("_", " ")}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums text-gray-700 dark:text-gray-300">
                    {r.emailCount || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums text-gray-700 dark:text-gray-300">
                    {r.openCount || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums text-gray-700 dark:text-gray-300">
                    {r.clickCount || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <ActivityHeatmap byDay={r.pickSheetsByDay} size="sm" weeks={12} />
                      <span className="text-xs tabular-nums text-gray-600 dark:text-gray-400">
                        {r.pickSheetCount}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {r.emailCount > 0 ? (
                      <Badge color="success">Yes</Badge>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {r.openCount > 0 ? (
                      <Badge color="info">Yes</Badge>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {r.clickCount > 0 ? (
                      <Badge color="brand">Yes</Badge>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge color={plan.color}>{plan.label}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {lastIso ? timeAgo(lastIso) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

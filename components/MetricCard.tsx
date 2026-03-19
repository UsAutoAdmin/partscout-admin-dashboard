"use client";

interface Props {
  label: string;
  value: string | number;
  subtext?: string;
  color?: "default" | "green" | "blue" | "amber" | "red" | "purple";
}

const bg = { default: "bg-white border-border", green: "bg-emerald-50 border-emerald-200", blue: "bg-blue-50 border-blue-200", amber: "bg-amber-50 border-amber-200", red: "bg-red-50 border-red-200", purple: "bg-purple-50 border-purple-200" };
const val = { default: "text-ink", green: "text-emerald-700", blue: "text-blue-700", amber: "text-amber-700", red: "text-red-700", purple: "text-purple-700" };

export function MetricCard({ label, value, subtext, color = "default" }: Props) {
  return (
    <div className={`rounded-xl border p-5 shadow-brand-sm ${bg[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${val[color]}`}>{value}</p>
      {subtext && <p className="mt-1 text-xs text-ink-subtle">{subtext}</p>}
    </div>
  );
}

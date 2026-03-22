"use client";

type MetricColor = "default" | "success" | "error" | "warning" | "brand" | "info";

interface Props {
  label: string;
  value: string | number;
  subtext?: string;
  color?: MetricColor;
  icon?: React.ReactNode;
}

const iconBg: Record<MetricColor, string> = {
  default: "bg-gray-100 dark:bg-gray-800",
  success: "bg-success-50 dark:bg-success-500/10",
  error: "bg-error-50 dark:bg-error-500/10",
  warning: "bg-warning-50 dark:bg-warning-500/10",
  brand: "bg-brand-50 dark:bg-brand-500/10",
  info: "bg-blue-light-50 dark:bg-blue-light-500/10",
};

const iconColor: Record<MetricColor, string> = {
  default: "text-gray-500 dark:text-gray-300",
  success: "text-success-500 dark:text-success-400",
  error: "text-error-500 dark:text-error-400",
  warning: "text-warning-500 dark:text-warning-400",
  brand: "text-brand-500 dark:text-brand-400",
  info: "text-blue-light-500 dark:text-blue-light-400",
};

const valueColor: Record<MetricColor, string> = {
  default: "text-gray-900 dark:text-white/90",
  success: "text-success-600 dark:text-success-400",
  error: "text-error-600 dark:text-error-400",
  warning: "text-warning-600 dark:text-warning-400",
  brand: "text-brand-600 dark:text-brand-400",
  info: "text-blue-light-600 dark:text-blue-light-400",
};

const defaultIcons: Record<MetricColor, React.ReactNode> = {
  default: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3.33 3.33h5.56v7.78H3.33V3.33zm7.78 0h5.56v4.45h-5.56V3.33zm0 6.67h5.56v7.78h-5.56V10zm-7.78 3.33h5.56v4.45H3.33v-4.45z" fill="currentColor"/></svg>
  ),
  success: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 1.667A8.333 8.333 0 1018.333 10 8.342 8.342 0 0010 1.667zm3.583 6.416l-4.166 4.167a.625.625 0 01-.884 0L6.417 10.133a.625.625 0 11.883-.883L8.975 10.925l3.725-3.725a.625.625 0 11.883.883z" fill="currentColor"/></svg>
  ),
  error: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 1.667A8.333 8.333 0 1018.333 10 8.342 8.342 0 0010 1.667zm.625 12.5h-1.25v-1.25h1.25v1.25zm0-3.334h-1.25V5.833h1.25v5z" fill="currentColor"/></svg>
  ),
  warning: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 1.667A8.333 8.333 0 1018.333 10 8.342 8.342 0 0010 1.667zm.625 12.5h-1.25v-1.25h1.25v1.25zm0-3.334h-1.25V5.833h1.25v5z" fill="currentColor"/></svg>
  ),
  brand: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3.33 3.33h5.56v7.78H3.33V3.33zm7.78 0h5.56v4.45h-5.56V3.33zm0 6.67h5.56v7.78h-5.56V10zm-7.78 3.33h5.56v4.45H3.33v-4.45z" fill="currentColor"/></svg>
  ),
  info: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 1.667A8.333 8.333 0 1018.333 10 8.342 8.342 0 0010 1.667zm.625 12.5h-1.25V9.167h1.25v5zm0-6.667h-1.25V6.25h1.25V7.5z" fill="currentColor"/></svg>
  ),
};

export function MetricCard({ label, value, subtext, color = "default", icon }: Props) {
  const displayIcon = icon ?? defaultIcons[color];

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg[color]}`}>
        <span className={iconColor[color]}>{displayIcon}</span>
      </div>
      <div className="mt-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
        <h4 className={`mt-1 text-2xl font-bold ${valueColor[color]}`}>{value}</h4>
        {subtext && <p className="mt-1 text-theme-xs text-gray-400 dark:text-gray-500">{subtext}</p>}
      </div>
    </div>
  );
}

import React from "react";

type BadgeColor = "success" | "error" | "warning" | "info" | "brand" | "default";

interface BadgeProps {
  color?: BadgeColor;
  children: React.ReactNode;
}

const colorStyles: Record<BadgeColor, string> = {
  success: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400",
  error: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400",
  warning: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400",
  info: "bg-blue-light-50 text-blue-light-700 dark:bg-blue-light-500/10 dark:text-blue-light-400",
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400",
  default: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export default function Badge({ color = "default", children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorStyles[color]}`}
    >
      {children}
    </span>
  );
}

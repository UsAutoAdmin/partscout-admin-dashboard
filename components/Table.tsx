import React, { ReactNode } from "react";

interface BaseProps {
  children: ReactNode;
  className?: string;
}

interface TableCellProps extends BaseProps {
  isHeader?: boolean;
}

export function Table({ children, className }: BaseProps) {
  return <table className={`min-w-full ${className ?? ""}`}>{children}</table>;
}

export function TableHeader({ children, className }: BaseProps) {
  return <thead className={`border-y border-gray-200 dark:border-gray-800 ${className ?? ""}`}>{children}</thead>;
}

export function TableBody({ children, className }: BaseProps) {
  return <tbody className={`divide-y divide-gray-200 dark:divide-gray-800 ${className ?? ""}`}>{children}</tbody>;
}

export function TableRow({ children, className }: BaseProps) {
  return <tr className={className ?? ""}>{children}</tr>;
}

export function TableCell({ children, isHeader = false, className }: TableCellProps) {
  const Tag = isHeader ? "th" : "td";
  return <Tag className={className ?? ""}>{children}</Tag>;
}

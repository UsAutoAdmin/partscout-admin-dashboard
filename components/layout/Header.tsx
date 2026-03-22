"use client";

import ThemeToggle from "./ThemeToggle";

interface HeaderProps {
  onMenuClick: () => void;
  lastUpdated?: string;
  title?: string;
}

export default function Header({ onMenuClick, lastUpdated, title }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-[#0a0a0a]/80 px-4 backdrop-blur-sm lg:px-6">
      <button
        onClick={onMenuClick}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 lg:hidden"
        aria-label="Toggle Sidebar"
      >
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M0.583 1C0.583.586.919.25 1.333.25h13.334c.414 0 .75.336.75.75s-.336.75-.75.75H1.333A.75.75 0 010.583 1zm0 10c0-.414.336-.75.75-.75h13.334c.414 0 .75.336.75.75s-.336.75-.75.75H1.333a.75.75 0 01-.75-.75zm.75-5.75A.75.75 0 00.583 6c0 .414.336.75.75.75h6.667a.75.75 0 000-1.5H1.333z"
            fill="currentColor"
          />
        </svg>
      </button>

      <div className="hidden lg:block">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">{title ?? "Dashboard"}</h2>
      </div>

      <div className="flex items-center gap-3">
        {lastUpdated && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400 dark:text-gray-500">Updated</span>
            <span className="text-gray-600 dark:text-gray-300 font-medium">{lastUpdated}</span>
          </div>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}

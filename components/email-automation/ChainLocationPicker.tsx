"use client";

import { useEffect } from "react";
import type { MultiLocationChain } from "@/lib/multi-location-chains";

/**
 * Generic location picker modal for multi-location junkyard chains.
 *
 * Renders any chain config from `MULTI_LOCATION_CHAINS`. Adding a new chain
 * does NOT require touching this component — extend the registry instead.
 *
 * Behavior notes:
 * - Closes on Escape key and on overlay click for keyboard / mouse parity.
 * - When `chain` is `null` the component renders nothing (controlled-display
 *   pattern that lets callers keep a single piece of state).
 */
export interface ChainLocationPickerProps {
  chain: MultiLocationChain | null;
  onSelect: (slug: string) => void;
  onClose: () => void;
}

export default function ChainLocationPicker({
  chain,
  onSelect,
  onClose,
}: ChainLocationPickerProps) {
  useEffect(() => {
    if (!chain) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [chain, onClose]);

  if (!chain) return null;

  const titleId = `chain-location-title-${chain.id}`;
  const isLong = chain.locations.length > 8;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-6"
      >
        <div className="mb-4 flex items-center gap-2">
          <svg
            className="w-5 h-5 text-blue-600 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <h3
            id={titleId}
            className="text-lg font-semibold text-gray-900 dark:text-white/90"
          >
            Select {chain.displayName} Location
          </h3>
        </div>

        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          {chain.modalDescription}
        </p>

        <div
          className={`${isLong ? "space-y-1.5 max-h-[60vh] overflow-y-auto" : "space-y-2"}`}
        >
          {chain.locations.map((loc) => (
            <button
              key={loc.slug}
              onClick={() => onSelect(loc.slug)}
              className={`group flex w-full items-center justify-between rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${
                isLong ? "px-4 py-2.5" : "px-4 py-3"
              } text-left text-sm font-medium text-gray-800 dark:text-gray-100 transition-colors hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20`}
            >
              <span>{loc.label}</span>
              <svg
                className="w-4 h-4 text-gray-400 transition-colors group-hover:text-blue-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

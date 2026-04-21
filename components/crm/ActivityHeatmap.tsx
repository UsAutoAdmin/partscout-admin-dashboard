"use client";

interface Props {
  byDay: number[];
  size?: "sm" | "md";
  weeks?: number;
}

const SM_CELL = "h-2 w-2";
const MD_CELL = "h-3 w-3";

function shadeClass(count: number) {
  if (count <= 0) return "bg-gray-200 dark:bg-gray-800/70";
  if (count === 1) return "bg-brand-300 dark:bg-brand-500/30";
  if (count <= 3) return "bg-brand-400 dark:bg-brand-500/55";
  if (count <= 7) return "bg-brand-500 dark:bg-brand-500/80";
  return "bg-brand-600 dark:bg-brand-400";
}

export default function ActivityHeatmap({ byDay, size = "sm", weeks = 12 }: Props) {
  const cells = byDay.slice(-weeks * 7);
  const cellClass = size === "sm" ? SM_CELL : MD_CELL;
  const gapClass = size === "sm" ? "gap-[2px]" : "gap-[3px]";

  // group into columns of 7 (weeks), oldest left, newest right
  const cols: number[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    cols.push(cells.slice(i, i + 7));
  }

  return (
    <div className={`flex ${gapClass}`}>
      {cols.map((col, ci) => (
        <div key={ci} className={`flex flex-col ${gapClass}`}>
          {col.map((count, ri) => (
            <div
              key={ri}
              className={`${cellClass} rounded-[2px] ${shadeClass(count)}`}
              title={count > 0 ? `${count} pick sheet${count === 1 ? "" : "s"}` : ""}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

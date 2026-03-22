"use client";

interface Props {
  data: { label: string; value: number; value2?: number }[];
  color?: string;
  color2?: string;
  height?: number;
  showLabels?: boolean;
}

export function BarChart({ data, color = "#465fff", color2 = "#32d583", height = 80, showLabels = false }: Props) {
  const maxVal = Math.max(...data.map((d) => (d.value ?? 0) + (d.value2 ?? 0)), 1);
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {data.map((d, i) => {
        const total = (d.value ?? 0) + (d.value2 ?? 0);
        const chartH = height - (showLabels ? 18 : 0);
        const totalH = (total / maxVal) * chartH;
        const v1H = total > 0 ? (d.value / total) * totalH : 0;
        const v2H = total > 0 ? ((d.value2 ?? 0) / total) * totalH : 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end">
            <div className="w-full flex flex-col justify-end" style={{ height: chartH }}>
              {v2H > 0 && <div className="w-full rounded-t-[2px]" style={{ height: v2H, background: color2, opacity: 0.7 }} />}
              {v1H > 0 && <div className="w-full" style={{ height: v1H, background: color }} />}
            </div>
            {showLabels && <span className="text-[9px] text-gray-500 mt-0.5 truncate w-full text-center">{d.label.slice(5)}</span>}
          </div>
        );
      })}
    </div>
  );
}

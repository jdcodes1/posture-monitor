interface WeeklyChartProps {
  data: Array<{
    date: string;
    total_checks: number;
    good_checks: number;
    avg_score: number;
  }>;
}

function getBarColor(score: number): string {
  if (score > 70) return "#3ee8a5";
  if (score >= 40) return "#f5c842";
  return "#f5564a";
}

function getDayName(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

export default function WeeklyChart({ data }: WeeklyChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-[#252b38] bg-[#141820] p-6">
        <h2 className="mb-4 font-mono text-sm font-semibold uppercase tracking-wider text-[#5c6370]">
          Weekly Overview
        </h2>
        <p className="py-8 text-center text-sm text-[#5c6370]">
          No data yet. Start a monitoring session to see your weekly trend.
        </p>
      </div>
    );
  }

  // Reverse so oldest is on the left
  const sorted = [...data].reverse().slice(-7);
  const maxScore = 100;

  return (
    <div className="rounded-xl border border-[#252b38] bg-[#141820] p-6">
      <h2 className="mb-6 font-mono text-sm font-semibold uppercase tracking-wider text-[#5c6370]">
        Weekly Overview
      </h2>
      <div className="flex items-end justify-between gap-2" style={{ height: 160 }}>
        {sorted.map((day) => {
          const score = Math.round(day.avg_score);
          const height = Math.max((score / maxScore) * 100, 4);
          return (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              <span className="font-mono text-xs text-[#5c6370]">{score}%</span>
              <div
                className="w-full max-w-[40px] rounded-t"
                style={{
                  height: `${height}%`,
                  backgroundColor: getBarColor(score),
                }}
              />
              <span className="text-xs text-[#5c6370]">{getDayName(day.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

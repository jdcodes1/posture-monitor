interface HourlyHeatmapProps {
  data: Array<{
    hour: number;
    total_checks: number;
    good_checks: number;
  }>;
}

function formatHour(hour: number): string {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

function getCellColor(score: number | null): string {
  if (score === null) return "#1a1f2b";
  if (score > 70) return "#3ee8a5";
  if (score >= 40) return "#f5c842";
  return "#f5564a";
}

function getCellOpacity(score: number | null): number {
  if (score === null) return 0.3;
  // Scale opacity from 0.5 to 1 based on how far from 50% the score is
  return 0.5 + Math.abs(score - 50) / 100;
}

export default function HourlyHeatmap({ data }: HourlyHeatmapProps) {
  // Build a map of hour -> score
  const hourMap = new Map<number, number>();
  for (const entry of data) {
    const score =
      entry.total_checks > 0
        ? Math.round((entry.good_checks / entry.total_checks) * 100)
        : 0;
    hourMap.set(entry.hour, score);
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="rounded-xl border border-[#252b38] bg-[#141820] p-6">
      <h2 className="mb-4 font-mono text-sm font-semibold uppercase tracking-wider text-[#5c6370]">
        Today by Hour
      </h2>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-12">
        {hours.map((hour) => {
          const score = hourMap.has(hour) ? hourMap.get(hour)! : null;
          return (
            <div
              key={hour}
              className="flex flex-col items-center justify-center rounded-lg p-2"
              style={{
                backgroundColor: getCellColor(score),
                opacity: getCellOpacity(score),
              }}
            >
              <span className="font-mono text-xs font-medium text-white">
                {formatHour(hour)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface StatCardsProps {
  totalChecks: number;
  totalGood: number;
  bestStreak: number;
  totalDays: number;
  totalHours: number;
}

export default function StatCards({
  totalChecks,
  totalGood,
  bestStreak,
  totalDays,
  totalHours,
}: StatCardsProps) {
  const score = totalChecks > 0 ? Math.round((totalGood / totalChecks) * 100) : 0;

  const cards = [
    { label: "Current Score", value: `${score}%` },
    { label: "Best Streak", value: `${bestStreak}` },
    { label: "Hours Monitored", value: `${totalHours.toFixed(1)}` },
    { label: "Days Tracked", value: `${totalDays}` },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-[#252b38] bg-[#141820] p-5"
        >
          <p className="font-mono text-2xl font-bold text-white">
            {card.value}
          </p>
          <p className="mt-1 text-xs text-[#5c6370]">{card.label}</p>
        </div>
      ))}
    </div>
  );
}

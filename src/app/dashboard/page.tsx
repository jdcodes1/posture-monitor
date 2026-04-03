import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDailyStats, getHourlyStats, getLifetimeStats } from "@/lib/db/queries";
import StatCards from "@/components/dashboard/stat-cards";
import WeeklyChart from "@/components/dashboard/weekly-chart";
import HourlyHeatmap from "@/components/dashboard/hourly-heatmap";

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const today = new Date().toISOString().split("T")[0];

  let dailyData: Awaited<ReturnType<typeof getDailyStats>> = [];
  let hourlyData: Awaited<ReturnType<typeof getHourlyStats>> = [];
  let lifetime = {
    totalChecks: 0,
    totalGood: 0,
    bestStreak: 0,
    totalDays: 0,
    totalHours: 0,
  };

  try {
    const [daily, hourly, stats] = await Promise.all([
      getDailyStats(userId, 7),
      getHourlyStats(userId, today),
      getLifetimeStats(userId),
    ]);
    dailyData = daily;
    hourlyData = hourly;
    lifetime = stats;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("DATABASE_URL") || message.includes("connect")) {
      return (
        <main className="min-h-screen bg-[#0b0e14] text-[#c8cfd8]">
          <div className="mx-auto max-w-4xl px-6 py-16">
            <h1 className="font-mono text-3xl font-bold text-white">Dashboard</h1>
            <p className="mt-4 text-sm text-[#5c6370]">
              Database is not configured. Set DATABASE_URL to enable stats tracking.
            </p>
          </div>
        </main>
      );
    }
    throw e;
  }

  const hasData = lifetime.totalChecks > 0;

  return (
    <main className="min-h-screen bg-[#0b0e14] text-[#c8cfd8]">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="font-mono text-3xl font-bold text-white">Dashboard</h1>

        {!hasData ? (
          <div className="mt-12 rounded-xl border border-[#252b38] bg-[#141820] p-10 text-center">
            <p className="text-[#5c6370]">
              Start monitoring to see your stats here.
            </p>
            <Link
              href="/monitor"
              className="mt-4 inline-block rounded-lg bg-[#3ee8a5] px-5 py-2 text-sm font-semibold text-[#0b0e14] transition hover:brightness-110"
            >
              Go to Monitor
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            <StatCards {...lifetime} />
            <WeeklyChart
              data={dailyData.map((d: Record<string, unknown>) => ({
                date: String(d.date),
                total_checks: Number(d.total_checks),
                good_checks: Number(d.good_checks),
                avg_score: Number(d.avg_score),
              }))}
            />
            <HourlyHeatmap
              data={hourlyData.map((d: Record<string, unknown>) => ({
                hour: Number(d.hour),
                total_checks: Number(d.total_checks),
                good_checks: Number(d.good_checks),
              }))}
            />
          </div>
        )}
      </div>
    </main>
  );
}

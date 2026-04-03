import { getDb } from './index';

export async function createSession(userId: string): Promise<string> {
  const sql = getDb();
  const result = await sql`
    INSERT INTO sessions (user_id) VALUES (${userId})
    RETURNING id
  `;
  return result[0].id;
}

export async function endSession(
  sessionId: string,
  totalChecks: number,
  goodChecks: number,
  score: number
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE sessions SET
      ended_at = NOW(),
      total_checks = ${totalChecks},
      good_checks = ${goodChecks},
      score = ${score}
    WHERE id = ${sessionId}
  `;
}

export async function upsertDailyStats(
  userId: string,
  date: string,
  checks: number,
  goodChecks: number,
  avgScore: number,
  bestStreak: number
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO daily_stats (user_id, date, total_checks, good_checks, avg_score, best_streak)
    VALUES (${userId}, ${date}, ${checks}, ${goodChecks}, ${avgScore}, ${bestStreak})
    ON CONFLICT (user_id, date)
    DO UPDATE SET
      total_checks = daily_stats.total_checks + EXCLUDED.total_checks,
      good_checks = daily_stats.good_checks + EXCLUDED.good_checks,
      avg_score = EXCLUDED.avg_score,
      best_streak = GREATEST(daily_stats.best_streak, EXCLUDED.best_streak)
  `;
}

export async function upsertHourlyStats(
  userId: string,
  date: string,
  hour: number,
  checks: number,
  goodChecks: number
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO hourly_stats (user_id, date, hour, total_checks, good_checks)
    VALUES (${userId}, ${date}, ${hour}, ${checks}, ${goodChecks})
    ON CONFLICT (user_id, date, hour)
    DO UPDATE SET
      total_checks = hourly_stats.total_checks + EXCLUDED.total_checks,
      good_checks = hourly_stats.good_checks + EXCLUDED.good_checks
  `;
}

export async function getDailyStats(userId: string, days: number = 7) {
  const sql = getDb();
  return sql`
    SELECT date, total_checks, good_checks, avg_score, best_streak
    FROM daily_stats
    WHERE user_id = ${userId}
    ORDER BY date DESC
    LIMIT ${days}
  `;
}

export async function getHourlyStats(userId: string, date: string) {
  const sql = getDb();
  return sql`
    SELECT hour, total_checks, good_checks
    FROM hourly_stats
    WHERE user_id = ${userId} AND date = ${date}
    ORDER BY hour
  `;
}

export async function getLifetimeStats(userId: string) {
  const sql = getDb();
  const result = await sql`
    SELECT
      COALESCE(SUM(total_checks), 0) as total_checks,
      COALESCE(SUM(good_checks), 0) as total_good,
      COALESCE(MAX(best_streak), 0) as best_streak,
      COUNT(*) as total_days,
      COALESCE(
        EXTRACT(EPOCH FROM SUM(ended_at - started_at)) / 3600.0,
        0
      ) as total_hours
    FROM (
      SELECT total_checks, good_checks, best_streak, NULL::timestamp as started_at, NULL::timestamp as ended_at
      FROM daily_stats WHERE user_id = ${userId}
    ) d
  `;

  // Get total hours from sessions table separately
  const sessions = await sql`
    SELECT COALESCE(
      EXTRACT(EPOCH FROM SUM(ended_at - started_at)) / 3600.0,
      0
    ) as total_hours
    FROM sessions
    WHERE user_id = ${userId} AND ended_at IS NOT NULL
  `;

  return {
    totalChecks: Number(result[0].total_checks),
    totalGood: Number(result[0].total_good),
    bestStreak: Number(result[0].best_streak),
    totalDays: Number(result[0].total_days),
    totalHours: Number(sessions[0].total_hours),
  };
}

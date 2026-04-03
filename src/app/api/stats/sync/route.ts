import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  createSession,
  endSession,
  upsertDailyStats,
  upsertHourlyStats,
} from '@/lib/db/queries';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    let sessionId = body.sessionId;

    if (!sessionId) {
      sessionId = await createSession(userId);
    }

    if (body.daily) {
      const { date, checks, goodChecks, avgScore, bestStreak } = body.daily;
      await upsertDailyStats(userId, date, checks, goodChecks, avgScore, bestStreak);
    }

    if (body.hourly) {
      const { date, hour, checks, goodChecks } = body.hourly;
      await upsertHourlyStats(userId, date, hour, checks, goodChecks);
    }

    if (body.endSession) {
      const { sessionId: sid, totalChecks, goodChecks, score } = body.endSession;
      await endSession(sid, totalChecks, goodChecks, score);
    }

    return NextResponse.json({ ok: true, sessionId });
  } catch (error) {
    console.error('Stats sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

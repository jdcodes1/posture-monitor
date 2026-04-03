import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDailyStats, getLifetimeStats } from '@/lib/db/queries';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const days = Number(req.nextUrl.searchParams.get('days') ?? 7);
    const [daily, lifetime] = await Promise.all([
      getDailyStats(userId, days),
      getLifetimeStats(userId),
    ]);

    return NextResponse.json({ daily, lifetime });
  } catch (error) {
    console.error('Stats read error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

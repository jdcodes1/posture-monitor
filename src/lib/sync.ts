import type { PostureStatus } from './pose-engine';

interface SyncBuffer {
  dailyChecks: number;
  dailyGoodChecks: number;
  hourlyChecks: Map<number, { checks: number; goodChecks: number }>;
  bestStreak: number;
}

export class StatSync {
  private buffer: SyncBuffer;
  private sessionId: string | null = null;
  private userId: string | null = null;
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private static FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.buffer = this.emptyBuffer();
  }

  private emptyBuffer(): SyncBuffer {
    return {
      dailyChecks: 0,
      dailyGoodChecks: 0,
      hourlyChecks: new Map(),
      bestStreak: 0,
    };
  }

  /** Call this when user authenticates */
  async start(userId: string): Promise<void> {
    this.userId = userId;

    // Create a session
    const res = await fetch('/api/stats/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    this.sessionId = data.sessionId;

    // Start flush timer
    this.flushInterval = setInterval(() => this.flush(), StatSync.FLUSH_INTERVAL_MS);

    // Flush on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush());
    }
  }

  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush(); // Final flush
  }

  /** Call this after each posture check */
  recordCheck(status: PostureStatus, currentStreak: number): void {
    this.buffer.dailyChecks++;
    if (status === 'good') this.buffer.dailyGoodChecks++;
    if (currentStreak > this.buffer.bestStreak) this.buffer.bestStreak = currentStreak;

    const hour = new Date().getHours();
    const existing = this.buffer.hourlyChecks.get(hour) ?? { checks: 0, goodChecks: 0 };
    existing.checks++;
    if (status === 'good') existing.goodChecks++;
    this.buffer.hourlyChecks.set(hour, existing);
  }

  private async flush(): Promise<void> {
    if (!this.userId || this.buffer.dailyChecks === 0) return;

    const today = new Date().toISOString().split('T')[0];
    const avgScore =
      this.buffer.dailyChecks > 0
        ? Math.round((this.buffer.dailyGoodChecks / this.buffer.dailyChecks) * 100)
        : 0;

    try {
      // Sync daily stats
      await fetch('/api/stats/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          daily: {
            date: today,
            checks: this.buffer.dailyChecks,
            goodChecks: this.buffer.dailyGoodChecks,
            avgScore,
            bestStreak: this.buffer.bestStreak,
          },
        }),
      });

      // Sync hourly stats
      for (const [hour, data] of this.buffer.hourlyChecks) {
        await fetch('/api/stats/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: this.sessionId,
            hourly: { date: today, hour, checks: data.checks, goodChecks: data.goodChecks },
          }),
        });
      }

      // Reset buffer after successful sync
      this.buffer = this.emptyBuffer();
    } catch (e) {
      // Silent fail — will retry on next flush
      console.error('Sync failed:', e);
    }
  }

  /** Migrate localStorage daily scores to DB on first sign-in */
  async migrateLocalStorage(): Promise<void> {
    if (!this.userId) return;

    try {
      const stored = localStorage.getItem('pw:daily-scores');
      if (!stored) return;

      const scores: Array<{ date: string; score: number; checks: number; goodChecks: number }> =
        JSON.parse(stored);
      for (const s of scores) {
        await fetch('/api/stats/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: this.sessionId,
            daily: {
              date: s.date,
              checks: s.checks,
              goodChecks: s.goodChecks,
              avgScore: s.score,
              bestStreak: 0,
            },
          }),
        });
      }
      // Clear localStorage after migration
      localStorage.removeItem('pw:daily-scores');
    } catch (e) {
      console.error('Migration failed:', e);
    }
  }
}

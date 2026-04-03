import type { PoseMetrics, PostureStatus } from './pose-engine';

export interface SessionStats {
  checks: number;
  good: number;
  streak: number;
  bestStreak: number;
  startedAt: number;
}

export class MonitorState {
  status: 'idle' | 'calibrated' | 'monitoring' = 'idle';
  baseline: PoseMetrics | null = null;
  isAway = false;
  postureStatus: PostureStatus = 'good';
  stats: SessionStats = { checks: 0, good: 0, streak: 0, bestStreak: 0, startedAt: 0 };

  private missCount = 0;
  private static AWAY_THRESHOLD = 3;

  calibrate(baseline: PoseMetrics): void {
    this.baseline = baseline;
    this.status = 'calibrated';
  }

  start(): void {
    if (!this.baseline) throw new Error('Must calibrate before starting');
    this.status = 'monitoring';
    this.stats = { checks: 0, good: 0, streak: 0, bestStreak: 0, startedAt: Date.now() };
    this.missCount = 0;
    this.isAway = false;
  }

  stop(): void {
    this.status = 'calibrated';
  }

  recordMiss(): void {
    this.missCount++;
    if (this.missCount >= MonitorState.AWAY_THRESHOLD) {
      this.isAway = true;
    }
  }

  recordHit(status: PostureStatus): void {
    this.missCount = 0;
    this.isAway = false;
    this.postureStatus = status;
    this.stats.checks++;

    if (status === 'good') {
      this.stats.good++;
      this.stats.streak++;
      if (this.stats.streak > this.stats.bestStreak) {
        this.stats.bestStreak = this.stats.streak;
      }
    } else {
      this.stats.streak = 0;
    }
  }

  get score(): number {
    if (this.stats.checks === 0) return 100;
    return Math.round((this.stats.good / this.stats.checks) * 100);
  }

  getEffectiveInterval(baseInterval: number, lowBattery: boolean): number {
    let interval = baseInterval;
    if (this.isAway) interval *= 2;
    if (lowBattery) interval *= 2;
    return interval;
  }
}

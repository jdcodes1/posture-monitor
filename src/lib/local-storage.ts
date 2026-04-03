import type { PoseMetrics } from './pose-engine';

const KEYS = {
  baseline: 'pw:baseline',
  settings: 'pw:settings',
  dailyScores: 'pw:daily-scores',
} as const;

export interface Settings {
  interval: number;
  sensitivity: number;
  notificationsEnabled: boolean;
}

export interface DailyScore {
  date: string;
  score: number;
  checks: number;
  goodChecks: number;
}

const DEFAULT_SETTINGS: Settings = {
  interval: 30,
  sensitivity: 0.5,
  notificationsEnabled: false,
};

function get<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

function set(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function getBaseline(): PoseMetrics | null {
  return get<PoseMetrics>(KEYS.baseline);
}

export function saveBaseline(baseline: PoseMetrics): void {
  set(KEYS.baseline, baseline);
}

export function getSettings(): Settings {
  return get<Settings>(KEYS.settings) ?? DEFAULT_SETTINGS;
}

export function saveSettings(settings: Settings): void {
  set(KEYS.settings, settings);
}

export function getDailyScores(): DailyScore[] {
  return get<DailyScore[]>(KEYS.dailyScores) ?? [];
}

export function saveDailyScore(score: DailyScore): void {
  const scores = getDailyScores();
  const existing = scores.findIndex((s) => s.date === score.date);
  if (existing >= 0) {
    scores[existing] = score;
  } else {
    scores.push(score);
  }
  const trimmed = scores.slice(-7);
  set(KEYS.dailyScores, trimmed);
}

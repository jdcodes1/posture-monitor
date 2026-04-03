# posture//watch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a battery-efficient, privacy-first browser posture monitor with guest and authenticated modes.

**Architecture:** Next.js 16 App Router. Pose detection is entirely client-side via MediaPipe BlazePose Lite. Server handles auth (Clerk) and stat persistence (Neon Postgres) only. Two operating modes: background (favicon/title, single-frame checks) and foreground (live camera preview).

**Tech Stack:** Next.js 16, Clerk, Neon Postgres, MediaPipe BlazePose Lite, Tailwind CSS, Vercel

**Reference:** Design doc at `docs/plans/2026-04-02-posture-watch-design.md`

**Original HTML prototype:** `/Users/joey/Downloads/posture-monitor.html` — port pose detection logic from this file.

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `app/layout.tsx`, `app/page.tsx`, `.gitignore`, `.env.local.example`

**Step 1: Scaffold Next.js 16 project**

Run:
```bash
cd /Users/joey/Documents/programming/posture-monitor
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --turbopack
```

Answer "Yes" to overwrite if prompted. This creates the standard Next.js 16 structure.

**Step 2: Verify dev server starts**

Run:
```bash
cd /Users/joey/Documents/programming/posture-monitor
npm run dev
```
Expected: Dev server at http://localhost:3000, default Next.js page renders.

**Step 3: Clean up defaults**

- Replace `app/page.tsx` with a minimal placeholder:
```tsx
export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b0e14] text-[#c8cfd8] flex items-center justify-center">
      <h1 className="font-mono text-2xl">posture//watch</h1>
    </main>
  );
}
```

- Update `app/layout.tsx`:
  - Set metadata title to "posture//watch"
  - Set metadata description to "Browser-based posture monitor. All processing stays local."
  - Add Geist Sans + Geist Mono fonts via `next/font/google` (or `next/font/local` if bundled)
  - Set `<html className="dark">` and body background to `#0b0e14`

- Create `.env.local.example`:
```
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Neon
DATABASE_URL=
```

- Update `.gitignore` to include `.env*.local`

**Step 4: Verify**

Run: `npm run dev`
Expected: Dark page with "posture//watch" centered.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 16 project with dark theme"
```

---

## Task 2: Pose Detection Engine (Client-Side)

**Files:**
- Create: `lib/pose-engine.ts`
- Create: `lib/pose-engine.test.ts`

This is the core engine — ported from the original HTML file's `analyzePose()`, `compareToBaseline()`, and calibration logic. It must be a pure module with no DOM/React dependencies (except MediaPipe imports).

**Step 1: Write tests for pose scoring**

Create `lib/pose-engine.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { compareToBaseline, averageSamples, type PoseMetrics } from './pose-engine';

const baseline: PoseMetrics = {
  earShoulderDist: 0.15,
  forwardLean: -0.15,
  headHeight: 0.3,
  shoulderTilt: 0.01,
  noseShoulderDist: 0.18,
};

describe('compareToBaseline', () => {
  it('returns good when current matches baseline', () => {
    expect(compareToBaseline(baseline, baseline, 0.5)).toBe('good');
  });

  it('returns bad when head drops significantly', () => {
    const slouched: PoseMetrics = {
      ...baseline,
      headHeight: baseline.headHeight + 0.08,
      earShoulderDist: baseline.earShoulderDist - 0.06,
      noseShoulderDist: baseline.noseShoulderDist - 0.06,
    };
    expect(compareToBaseline(slouched, baseline, 0.5)).toBe('bad');
  });

  it('returns warn for moderate deviation', () => {
    const slipping: PoseMetrics = {
      ...baseline,
      headHeight: baseline.headHeight + 0.03,
      earShoulderDist: baseline.earShoulderDist - 0.02,
      noseShoulderDist: baseline.noseShoulderDist - 0.02,
    };
    expect(compareToBaseline(slipping, baseline, 0.5)).toBe('warn');
  });

  it('relaxed sensitivity is more tolerant', () => {
    const slipping: PoseMetrics = {
      ...baseline,
      headHeight: baseline.headHeight + 0.03,
      earShoulderDist: baseline.earShoulderDist - 0.02,
      noseShoulderDist: baseline.noseShoulderDist - 0.02,
    };
    expect(compareToBaseline(slipping, baseline, 0.3)).toBe('good');
  });
});

describe('averageSamples', () => {
  it('averages multiple pose samples', () => {
    const samples: PoseMetrics[] = [
      { earShoulderDist: 0.1, forwardLean: -0.1, headHeight: 0.3, shoulderTilt: 0.01, noseShoulderDist: 0.2 },
      { earShoulderDist: 0.2, forwardLean: -0.2, headHeight: 0.4, shoulderTilt: 0.03, noseShoulderDist: 0.3 },
    ];
    const avg = averageSamples(samples);
    expect(avg.earShoulderDist).toBeCloseTo(0.15);
    expect(avg.headHeight).toBeCloseTo(0.35);
  });
});
```

**Step 2: Install vitest and run test to verify it fails**

Run:
```bash
cd /Users/joey/Documents/programming/posture-monitor
npm install -D vitest
npx vitest run lib/pose-engine.test.ts
```
Expected: FAIL — module not found.

**Step 3: Implement pose-engine.ts**

Create `lib/pose-engine.ts`:
```typescript
export type PostureStatus = 'good' | 'warn' | 'bad';

export interface PoseMetrics {
  earShoulderDist: number;
  forwardLean: number;
  headHeight: number;
  shoulderTilt: number;
  noseShoulderDist: number;
}

export interface PoseResult extends PoseMetrics {
  landmarks: Array<{ x: number; y: number; z: number; visibility?: number }>;
}

/**
 * Extract pose metrics from MediaPipe landmarks.
 * Landmarks: 0=nose, 7=leftEar, 8=rightEar, 11=leftShoulder, 12=rightShoulder
 */
export function extractMetrics(
  landmarks: Array<{ x: number; y: number; z: number }>
): PoseResult {
  const nose = landmarks[0];
  const leftEar = landmarks[7];
  const rightEar = landmarks[8];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  const earMidY = (leftEar.y + rightEar.y) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;

  return {
    earShoulderDist: shoulderMidY - earMidY,
    forwardLean: earMidY - shoulderMidY,
    headHeight: nose.y,
    shoulderTilt: Math.abs(leftShoulder.y - rightShoulder.y),
    noseShoulderDist: shoulderMidY - nose.y,
    landmarks,
  };
}

/**
 * Compare current pose to calibrated baseline.
 * Returns 'good', 'warn', or 'bad'.
 */
export function compareToBaseline(
  current: PoseMetrics,
  baseline: PoseMetrics,
  sensitivity: number // 0.3 = relaxed, 0.5 = normal, 0.7 = strict
): PostureStatus {
  const thresholdMult = 1.3 - sensitivity * 0.6;

  let score = 0;
  let factors = 0;

  // Head dropped (headHeight increased = lower in frame)
  const headDrop = current.headHeight - baseline.headHeight;
  if (headDrop > 0.04 * thresholdMult) score += 2;
  else if (headDrop > 0.02 * thresholdMult) score += 1;
  factors += 2;

  // Ear-shoulder distance decreased (slouching compresses this)
  const distDiff = baseline.earShoulderDist - current.earShoulderDist;
  if (distDiff > 0.03 * thresholdMult) score += 2;
  else if (distDiff > 0.015 * thresholdMult) score += 1;
  factors += 2;

  // Nose-shoulder distance decreased
  const noseDiff = baseline.noseShoulderDist - current.noseShoulderDist;
  if (noseDiff > 0.03 * thresholdMult) score += 2;
  else if (noseDiff > 0.015 * thresholdMult) score += 1;
  factors += 2;

  // Shoulder tilt increased
  const tiltDiff = current.shoulderTilt - baseline.shoulderTilt;
  if (tiltDiff > 0.03 * thresholdMult) score += 1;
  factors += 1;

  const ratio = score / factors;
  if (ratio >= 0.5) return 'bad';
  if (ratio >= 0.25) return 'warn';
  return 'good';
}

/**
 * Average multiple pose samples into a single baseline.
 */
export function averageSamples(samples: PoseMetrics[]): PoseMetrics {
  const n = samples.length;
  return {
    earShoulderDist: samples.reduce((s, p) => s + p.earShoulderDist, 0) / n,
    forwardLean: samples.reduce((s, p) => s + p.forwardLean, 0) / n,
    headHeight: samples.reduce((s, p) => s + p.headHeight, 0) / n,
    shoulderTilt: samples.reduce((s, p) => s + p.shoulderTilt, 0) / n,
    noseShoulderDist: samples.reduce((s, p) => s + p.noseShoulderDist, 0) / n,
  };
}
```

**Step 4: Run tests**

Run: `npx vitest run lib/pose-engine.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add lib/pose-engine.ts lib/pose-engine.test.ts vitest.config.ts package.json package-lock.json
git commit -m "feat: add pose detection engine with scoring and calibration"
```

---

## Task 3: Camera Manager (Client-Side)

**Files:**
- Create: `lib/camera-manager.ts`

Handles camera acquire/release cycle for battery efficiency. No tests needed — this wraps browser APIs.

**Step 1: Implement camera-manager.ts**

```typescript
export class CameraManager {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;

  async acquire(): Promise<HTMLVideoElement> {
    if (this.stream && this.video) return this.video;

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
    });

    this.video = document.createElement('video');
    this.video.srcObject = this.stream;
    this.video.playsInline = true;
    this.video.muted = true;
    await this.video.play();

    // Wait for video to have dimensions
    await new Promise<void>((resolve) => {
      if (this.video!.videoWidth > 0) return resolve();
      this.video!.addEventListener('loadeddata', () => resolve(), { once: true });
    });

    return this.video;
  }

  release(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  isActive(): boolean {
    return this.stream !== null;
  }
}
```

**Step 2: Commit**

```bash
git add lib/camera-manager.ts
git commit -m "feat: add camera manager with acquire/release for battery efficiency"
```

---

## Task 4: Monitor Controller (Client-Side State Machine)

**Files:**
- Create: `lib/monitor-controller.ts`
- Create: `lib/monitor-controller.test.ts`
- Create: `lib/favicon.ts`
- Create: `lib/local-storage.ts`

The monitor controller orchestrates the check loop, presence detection, battery awareness, and foreground/background switching.

**Step 1: Write tests for the monitor state machine**

Create `lib/monitor-controller.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorState } from './monitor-controller';

describe('MonitorState', () => {
  it('starts in idle state', () => {
    const state = new MonitorState();
    expect(state.status).toBe('idle');
  });

  it('transitions to monitoring after calibration', () => {
    const state = new MonitorState();
    state.calibrate({ earShoulderDist: 0.15, forwardLean: -0.15, headHeight: 0.3, shoulderTilt: 0.01, noseShoulderDist: 0.18 });
    expect(state.status).toBe('calibrated');
    state.start();
    expect(state.status).toBe('monitoring');
  });

  it('tracks away state after 3 missed detections', () => {
    const state = new MonitorState();
    state.calibrate({ earShoulderDist: 0.15, forwardLean: -0.15, headHeight: 0.3, shoulderTilt: 0.01, noseShoulderDist: 0.18 });
    state.start();
    state.recordMiss();
    state.recordMiss();
    expect(state.isAway).toBe(false);
    state.recordMiss();
    expect(state.isAway).toBe(true);
  });

  it('resets away state on successful detection', () => {
    const state = new MonitorState();
    state.calibrate({ earShoulderDist: 0.15, forwardLean: -0.15, headHeight: 0.3, shoulderTilt: 0.01, noseShoulderDist: 0.18 });
    state.start();
    state.recordMiss();
    state.recordMiss();
    state.recordMiss();
    expect(state.isAway).toBe(true);
    state.recordHit('good');
    expect(state.isAway).toBe(false);
  });

  it('tracks session stats correctly', () => {
    const state = new MonitorState();
    state.calibrate({ earShoulderDist: 0.15, forwardLean: -0.15, headHeight: 0.3, shoulderTilt: 0.01, noseShoulderDist: 0.18 });
    state.start();
    state.recordHit('good');
    state.recordHit('good');
    state.recordHit('bad');
    expect(state.stats.checks).toBe(3);
    expect(state.stats.good).toBe(2);
    expect(state.stats.streak).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run lib/monitor-controller.test.ts`
Expected: FAIL.

**Step 3: Implement MonitorState class**

Create `lib/monitor-controller.ts`:
```typescript
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
```

**Step 4: Implement favicon.ts**

Create `lib/favicon.ts`:
```typescript
import type { PostureStatus } from './pose-engine';

const COLORS: Record<PostureStatus | 'away', string> = {
  good: '#3ee8a5',
  warn: '#f5c842',
  bad: '#f5564a',
  away: '#5c6370',
};

const TITLES: Record<PostureStatus | 'away', string> = {
  good: '✓ posture//watch',
  warn: '⚠ posture//watch',
  bad: '✗ Fix posture!',
  away: 'posture//watch',
};

let canvas: HTMLCanvasElement | null = null;

export function updateFavicon(status: PostureStatus | 'away'): void {
  if (typeof document === 'undefined') return;

  // Update title
  document.title = TITLES[status];

  // Draw favicon
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
  }

  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 32, 32);
  ctx.beginPath();
  ctx.arc(16, 16, 12, 0, Math.PI * 2);
  ctx.fillStyle = COLORS[status];
  ctx.fill();

  // Update or create link element
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = canvas.toDataURL('image/png');
}
```

**Step 5: Implement local-storage.ts**

Create `lib/local-storage.ts`:
```typescript
import type { PoseMetrics } from './pose-engine';

const KEYS = {
  baseline: 'pw:baseline',
  settings: 'pw:settings',
  dailyScores: 'pw:daily-scores',
} as const;

export interface Settings {
  interval: number; // seconds
  sensitivity: number; // 0.3, 0.5, 0.7
  notificationsEnabled: boolean;
}

export interface DailyScore {
  date: string; // YYYY-MM-DD
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
  // Keep last 7 days only
  const trimmed = scores.slice(-7);
  set(KEYS.dailyScores, trimmed);
}
```

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

**Step 7: Commit**

```bash
git add lib/monitor-controller.ts lib/monitor-controller.test.ts lib/favicon.ts lib/local-storage.ts
git commit -m "feat: add monitor state machine, favicon indicator, and localStorage persistence"
```

---

## Task 5: Monitor Page — Core UI

**Files:**
- Create: `app/monitor/page.tsx`
- Create: `components/monitor/calibration-view.tsx`
- Create: `components/monitor/live-preview.tsx`
- Create: `components/monitor/settings-panel.tsx`
- Create: `components/monitor/pose-overlay.tsx`
- Create: `hooks/use-posture-monitor.ts`
- Create: `hooks/use-mediapipe.ts`
- Create: `hooks/use-battery.ts`

**Step 1: Create the MediaPipe hook**

Create `hooks/use-mediapipe.ts`:
- Dynamically import MediaPipe vision bundle from CDN
- Initialize PoseLandmarker with BlazePose Lite
- Try GPU delegate, catch and fall back to CPU
- Expose: `{ landmarker, loading, error }`

**Step 2: Create the battery hook**

Create `hooks/use-battery.ts`:
- Use `navigator.getBattery()` API
- Track charging state and level
- Expose: `{ isLowBattery }` (true when level < 0.2 and not charging)
- Gracefully handle unsupported browsers (return `{ isLowBattery: false }`)

**Step 3: Create the main posture monitor hook**

Create `hooks/use-posture-monitor.ts`:
- Combines: MonitorState, CameraManager, MediaPipe hook, battery hook, favicon updates
- Foreground mode: continuous camera + rAF pose detection loop
- Background mode: setTimeout chain, acquire camera → single frame → release
- Presence detection: track misses, adjust interval
- Exposes: `{ state, calibrate, start, stop, recalibrate, settings, updateSettings }`

**Step 4: Create CalibrationView component**

Create `components/monitor/calibration-view.tsx`:
- Camera preview with pose overlay
- "Calibrate" button → takes 5 samples over 3s
- Shows "hold still..." during calibration
- On success → shows "Start monitoring" button
- Settings panel (interval, sensitivity, notifications toggle)
- Port UI patterns from original HTML file's setup-view

**Step 5: Create LivePreview component**

Create `components/monitor/live-preview.tsx`:
- Full camera feed with real-time pose overlay
- Status indicator (good/warn/bad with color)
- Session stats (checks, score, streak)
- Only renders when tab is foregrounded
- "Recalibrate" and "Stop" buttons

**Step 6: Create PoseOverlay component**

Create `components/monitor/pose-overlay.tsx`:
- Canvas overlay that draws pose landmarks and connections
- Port drawing logic from original HTML file's `drawPose()`
- Key points: nose, ears, shoulders
- Connections: nose-ears, ears, shoulders, shoulders-elbows, shoulders-hips

**Step 7: Create SettingsPanel component**

Create `components/monitor/settings-panel.tsx`:
- Check interval selector (15s, 30s, 60s, 2min)
- Sensitivity selector (relaxed, normal, strict)
- Notifications toggle (requests permission)
- Persists to localStorage via `lib/local-storage.ts`

**Step 8: Wire up the monitor page**

Create `app/monitor/page.tsx`:
- `'use client'` (needs camera, MediaPipe)
- Loading state while MediaPipe initializes
- Shows CalibrationView when not calibrated
- Shows LivePreview when foregrounded and monitoring
- Runs background check loop when backgrounded
- Uses `document.addEventListener('visibilitychange')` to switch modes

**Step 9: Verify manually**

Run: `npm run dev`, navigate to `/monitor`
Expected:
- MediaPipe loads (loading spinner then camera preview)
- Can calibrate (sit still for 3s)
- Can start monitoring
- Favicon changes color based on posture
- Tab title updates
- Switching tabs → background mode (favicon only)
- Switching back → live preview resumes

**Step 10: Commit**

```bash
git add app/monitor/ components/monitor/ hooks/
git commit -m "feat: add monitor page with calibration, live preview, and background mode"
```

---

## Task 6: Landing Page

**Files:**
- Create: `app/page.tsx` (overwrite placeholder)
- Create: `components/landing/hero.tsx`

**Step 1: Build landing page**

Update `app/page.tsx`:
- Hero section: "posture//watch" title, subtitle "Your posture, monitored. Nothing leaves your browser."
- "Try it free →" button linking to `/monitor`
- 3 feature cards:
  - Privacy-first: "All processing stays on your device. No video uploaded. Ever."
  - Battery-efficient: "Camera activates for milliseconds, then sleeps. Runs all day."
  - Free: "No account needed. Sign up only to save your history."
- Secondary CTA: "Sign up to save your stats across devices"
- Dark theme, minimal, clean typography
- Responsive (works on mobile but primary target is desktop)

**Step 2: Verify**

Run: `npm run dev`, navigate to `/`
Expected: Landing page renders with hero, features, CTAs.

**Step 3: Commit**

```bash
git add app/page.tsx components/landing/
git commit -m "feat: add landing page with hero and feature highlights"
```

---

## Task 7: Auth Setup (Clerk)

**Files:**
- Create: `app/sign-in/[[...sign-in]]/page.tsx`
- Create: `app/sign-up/[[...sign-up]]/page.tsx`
- Create: `proxy.ts`
- Modify: `app/layout.tsx` (wrap with ClerkProvider)

**Prerequisites:** User must run `vercel integration add clerk` in terminal and complete Vercel Dashboard setup. Then `vercel env pull` to get keys.

**Step 1: Install Clerk**

Run:
```bash
cd /Users/joey/Documents/programming/posture-monitor
npm install @clerk/nextjs
```

**Step 2: Create proxy.ts (Next.js 16 middleware replacement)**

Create `proxy.ts` at project root:
```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

**Step 3: Wrap layout with ClerkProvider**

Modify `app/layout.tsx` — wrap `{children}` with `<ClerkProvider>`.

**Step 4: Create auth pages**

Create `app/sign-in/[[...sign-in]]/page.tsx`:
```tsx
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center">
      <SignIn />
    </div>
  );
}
```

Create `app/sign-up/[[...sign-up]]/page.tsx`:
```tsx
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center">
      <SignUp />
    </div>
  );
}
```

**Step 5: Add nav with auth state**

Create a simple nav component showing "Sign in" for guests or user button for authed users. Add to layout.

**Step 6: Verify**

Run: `npm run dev`
Expected:
- `/sign-in` shows Clerk sign-in form
- `/sign-up` shows Clerk sign-up form
- `/dashboard` redirects to sign-in
- `/monitor` works without auth
- Nav shows appropriate auth state

**Step 7: Commit**

```bash
git add app/sign-in/ app/sign-up/ proxy.ts app/layout.tsx components/nav.tsx
git commit -m "feat: add Clerk auth with protected dashboard route"
```

---

## Task 8: Database Setup (Neon)

**Files:**
- Create: `lib/db/schema.sql`
- Create: `lib/db/index.ts`
- Create: `lib/db/queries.ts`

**Prerequisites:** User must add Neon via Vercel Marketplace (`vercel integration add neon`) and `vercel env pull` to get `DATABASE_URL`.

**Step 1: Install Neon driver**

Run:
```bash
npm install @neondatabase/serverless
```

**Step 2: Create schema**

Create `lib/db/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP,
  total_checks INT DEFAULT 0,
  good_checks INT DEFAULT 0,
  score FLOAT
);

CREATE TABLE IF NOT EXISTS daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  total_checks INT DEFAULT 0,
  good_checks INT DEFAULT 0,
  avg_score FLOAT,
  best_streak INT DEFAULT 0,
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS hourly_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  hour INT NOT NULL,
  total_checks INT DEFAULT 0,
  good_checks INT DEFAULT 0,
  UNIQUE(user_id, date, hour)
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_daily_user_date ON daily_stats(user_id, date);
CREATE INDEX idx_hourly_user_date ON hourly_stats(user_id, date);
```

**Step 3: Create db client**

Create `lib/db/index.ts`:
```typescript
import { neon } from '@neondatabase/serverless';

export function getDb() {
  return neon(process.env.DATABASE_URL!);
}
```

**Step 4: Create query helpers**

Create `lib/db/queries.ts` with functions:
- `upsertDailyStats(userId, date, checks, goodChecks, avgScore, bestStreak)`
- `upsertHourlyStats(userId, date, hour, checks, goodChecks)`
- `createSession(userId)` → returns session id
- `endSession(sessionId, totalChecks, goodChecks, score)`
- `getDailyStats(userId, days)` → last N days
- `getHourlyStats(userId, date)` → heatmap for a day
- `getLifetimeStats(userId)` → total hours, checks, best streak

All use UPSERT (ON CONFLICT DO UPDATE) for idempotent syncing.

**Step 5: Commit**

```bash
git add lib/db/
git commit -m "feat: add Neon database schema and query helpers"
```

---

## Task 9: API Routes for Stat Syncing

**Files:**
- Create: `app/api/stats/sync/route.ts`
- Create: `app/api/stats/route.ts`

**Step 1: Create sync endpoint**

Create `app/api/stats/sync/route.ts`:
- POST endpoint, requires auth (Clerk)
- Accepts batch of check results: `{ sessionId, checks: [{ timestamp, status }], daily: { date, checks, good, score, bestStreak }, hourly: { date, hour, checks, good } }`
- Upserts daily and hourly stats
- Updates session record
- Returns `{ ok: true }`

**Step 2: Create stats read endpoint**

Create `app/api/stats/route.ts`:
- GET endpoint, requires auth
- Query params: `?range=7d|30d|all`
- Returns: `{ daily: DailyStats[], lifetime: { totalHours, totalChecks, bestStreak } }`

**Step 3: Verify with curl or browser**

Expected: 401 when not authed, 200 with valid Clerk session.

**Step 4: Commit**

```bash
git add app/api/stats/
git commit -m "feat: add stat sync and read API routes"
```

---

## Task 10: Client-Side Sync Logic

**Files:**
- Create: `lib/sync.ts`
- Modify: `hooks/use-posture-monitor.ts`

**Step 1: Create sync module**

Create `lib/sync.ts`:
- Buffers check results in memory
- Every 5 minutes (or on page unload via `beforeunload`), flushes to `/api/stats/sync`
- Only syncs if user is authenticated (check Clerk `useAuth`)
- On first auth after guest usage, migrates localStorage daily scores to DB

**Step 2: Integrate sync into monitor hook**

Modify `hooks/use-posture-monitor.ts`:
- After each `recordHit`, push to sync buffer
- On stop/unload, flush sync
- Save daily score to localStorage regardless of auth (guest fallback)

**Step 3: Verify**

- Monitor as guest → stats in localStorage only, no API calls
- Sign in → monitor → check Network tab for sync calls every 5min
- Stop monitoring → immediate flush

**Step 4: Commit**

```bash
git add lib/sync.ts hooks/use-posture-monitor.ts
git commit -m "feat: add background stat syncing for authenticated users"
```

---

## Task 11: Dashboard Page

**Files:**
- Create: `app/dashboard/page.tsx`
- Create: `components/dashboard/weekly-chart.tsx`
- Create: `components/dashboard/hourly-heatmap.tsx`
- Create: `components/dashboard/stat-cards.tsx`

**Step 1: Create stat cards**

Create `components/dashboard/stat-cards.tsx`:
- Current streak
- Personal best streak
- Total hours monitored
- Overall score (lifetime)
- Simple grid layout, dark cards

**Step 2: Create weekly chart**

Create `components/dashboard/weekly-chart.tsx`:
- Bar chart showing daily posture scores for last 7 days
- Pure CSS/SVG bars (no charting library needed for 7 bars)
- Color-coded: green >70%, yellow 40-70%, red <40%
- X-axis: day names, Y-axis: 0-100%

**Step 3: Create hourly heatmap**

Create `components/dashboard/hourly-heatmap.tsx`:
- Grid of 24 cells (hours 0-23)
- Color intensity based on posture score for each hour
- Shows "Your posture drops after 3pm" type insights
- Only show hours where data exists

**Step 4: Create dashboard page**

Create `app/dashboard/page.tsx`:
- Server component, fetches stats via db queries (direct, not API)
- Uses `auth()` from Clerk to get userId
- Renders stat cards, weekly chart, hourly heatmap
- Empty state if no data yet: "Start monitoring to see your stats here"

**Step 5: Verify**

Run: `npm run dev`, sign in, navigate to `/dashboard`
Expected: Dashboard renders with stats (or empty state if no monitoring done yet).

**Step 6: Commit**

```bash
git add app/dashboard/ components/dashboard/
git commit -m "feat: add dashboard with weekly chart, heatmap, and stat cards"
```

---

## Task 12: Notifications

**Files:**
- Modify: `hooks/use-posture-monitor.ts`

**Step 1: Add browser notification on bad posture**

In the monitor hook, when a check returns 'bad':
- If notifications are enabled and permission is granted, fire `new Notification('posture//watch', { body: 'Sit up straight! Your posture needs attention.', silent: false })`
- Only fire once per bad streak (don't spam on consecutive bad checks)

**Step 2: Verify**

- Enable notifications in settings
- Slouch → get notification
- Stay slouched → no repeat notification until posture was good then bad again

**Step 3: Commit**

```bash
git add hooks/use-posture-monitor.ts
git commit -m "feat: add browser notifications on bad posture detection"
```

---

## Task 13: Polish & Deploy

**Files:**
- Create: `context.md`
- Modify: various for polish

**Step 1: Create context.md**

Create `context.md` at project root with architecture summary, key decisions, and file structure.

**Step 2: Responsive polish**

- Ensure monitor page works on mobile (camera permissioning differs)
- Ensure landing page is responsive
- Ensure dashboard is readable on narrow screens

**Step 3: Deploy to Vercel**

Run:
```bash
cd /Users/joey/Documents/programming/posture-monitor
vercel link
vercel env pull
vercel deploy
```

Verify preview deployment works. Then:
```bash
vercel --prod
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: polish and deploy configuration"
```

---

## Task Order & Dependencies

```
Task 1 (scaffold) → Task 2 (pose engine) → Task 3 (camera manager)
                                                      ↓
Task 4 (monitor controller) → Task 5 (monitor page UI) → Task 6 (landing page)
                                                      ↓
Task 7 (auth) → Task 8 (database) → Task 9 (API routes) → Task 10 (sync)
                                                                    ↓
Task 11 (dashboard) → Task 12 (notifications) → Task 13 (polish & deploy)
```

Tasks 2-4 can be parallelized. Tasks 6-7 can be parallelized after Task 5.

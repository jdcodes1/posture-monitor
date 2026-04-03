# posture//watch — Design Document

## Overview
A browser-based posture monitor that uses your webcam + MediaPipe to detect slouching. All pose detection runs client-side — no video ever leaves the browser. Guest users can try it immediately; authenticated users get persistent stats and historical trends.

## Tech Stack
- Next.js 16 (App Router, Server Components)
- Clerk (auth, via Vercel Marketplace)
- Neon Postgres (persistent stats for authed users)
- MediaPipe BlazePose Lite (client-side pose detection, ~3MB)
- Vercel (deployment)

## Architecture
Server handles auth and stat persistence only. All pose detection is client-side.

## Two Operating Modes

### Background (normal use — tab is not focused)
- Camera OFF between checks, wakes for 1 frame every 30s
- Single model inference per check (IMAGE mode)
- Status shown via dynamic favicon (green/yellow/red dot) + page title
- Browser notification fires on red (bad posture)

### Foreground (tab is focused)
- Continuous camera stream
- Continuous pose inference via requestAnimationFrame
- Live camera preview with pose overlay and real-time status

## Performance & Battery
- Camera tracks released between checks (hardware off)
- setTimeout chains, not setInterval
- Presence detection: 0 landmarks = away, after 3 misses double the interval silently, resume on return (no UI message)
- GPU delegate with CPU fallback (try/catch)
- navigator.getBattery() < 20% → auto 2x check interval, subtle icon only
- BlazePose Lite, IMAGE mode, 1 pose — smallest viable model

## Status Indicator (Favicon + Title)
| State | Favicon | Title |
|-------|---------|-------|
| Good | Green dot | ✓ posture//watch |
| Warning | Yellow dot | ⚠ posture//watch |
| Bad | Red dot | ✗ Fix posture! |
| Away | Gray dot | posture//watch |

Browser notification fires on bad status.

## Pose Detection
- Landmarks: nose, left/right ear, left/right shoulder
- Metrics: head height, ear-shoulder distance, nose-shoulder distance, shoulder tilt
- Calibration: 5 samples over 3 seconds, averaged as baseline
- Scoring: weighted ratio of deviations from baseline, configurable sensitivity (relaxed/normal/strict)
- Status thresholds: ratio >= 0.5 = bad, >= 0.25 = warn, else good

## Auth & Data Tiers

### Guest (localStorage)
- Calibration baseline
- Settings (interval, sensitivity)
- Current session stats (checks, good count, streak)
- Last 7 daily scores (mini trend)

### Authenticated (Neon Postgres)
- Everything guest has, synced to DB
- Full session history
- Daily and weekly aggregates
- Hourly heatmap data (which hours have worst posture)
- Lifetime stats (total hours, total checks)
- Personal best streak
- Batch-synced every ~5 minutes (not every check)
- localStorage data migrated to DB on sign-up

## DB Schema
```sql
-- sessions
id          UUID PRIMARY KEY
user_id     TEXT NOT NULL (clerk_id)
started_at  TIMESTAMP NOT NULL
ended_at    TIMESTAMP
total_checks INT DEFAULT 0
good_checks  INT DEFAULT 0
score        FLOAT

-- daily_stats
id          UUID PRIMARY KEY
user_id     TEXT NOT NULL
date        DATE NOT NULL
total_checks INT DEFAULT 0
good_checks  INT DEFAULT 0
avg_score    FLOAT
best_streak  INT DEFAULT 0

-- hourly_stats
id          UUID PRIMARY KEY
user_id     TEXT NOT NULL
date        DATE NOT NULL
hour        INT NOT NULL (0-23)
total_checks INT DEFAULT 0
good_checks  INT DEFAULT 0
```

## Pages
| Route | Auth | Purpose |
|-------|------|---------|
| `/` | No | Landing page — pitch, "Try it now" CTA |
| `/monitor` | No | Core posture monitor (guest or authed) |
| `/dashboard` | Yes | Stats, charts, trends, streaks |
| `/sign-in` | No | Clerk sign-in |
| `/sign-up` | No | Clerk sign-up |

### Landing Page (`/`)
- Hero: one-liner + "Try it free" button → /monitor
- 3 feature bullets (privacy-first, battery-efficient, free)
- "Sign up to save your stats" secondary CTA

### Monitor Page (`/monitor`)
- Foreground: live camera + pose overlay + settings
- Background: favicon/title indicator + notifications
- Minimal dark UI, non-invasive
- Settings: check interval, sensitivity, notifications toggle

### Dashboard Page (`/dashboard`)
- Weekly score chart
- Hourly heatmap (worst posture hours)
- Current streak + personal best
- Total hours monitored
- Clean, not overloaded

## Privacy
- No video/images stored or transmitted
- No pose landmark data stored
- Only derived numerical scores persisted
- All processing local to the browser

## Design Principles
- Minimal and non-invasive — the app should disappear into the background
- Battery-conscious — off when not needed
- Privacy-first — nothing leaves the browser except scores
- Silent adaptation — no unnecessary messages or toasts

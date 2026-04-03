# posture//watch

Real-time posture monitoring web app. All pose detection runs client-side for privacy; server handles auth and stats persistence.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Auth**: Clerk
- **Database**: Neon (serverless Postgres)
- **Styling**: Tailwind CSS 4
- **Pose Detection**: MoveNet (TensorFlow.js) via `@anthropic/pose-engine` patterns
- **Testing**: Vitest

## Architecture

```
Browser (client-side)          Server (Next.js API routes)
├── Camera capture             ├── /api/stats (GET daily/hourly/lifetime)
├── MoveNet pose detection     ├── /api/stats/sync (POST session data)
├── Posture scoring            └── Clerk auth middleware
├── Notifications (Web API)
└── LocalStorage (offline)
```

Two operating modes:
1. **Calibration mode** — continuous camera for baseline capture
2. **Monitoring mode** — periodic snapshot (default 30s interval), camera sleeps between checks for battery efficiency

## Key Directories

- `src/app/` — Pages: landing, monitor, dashboard, auth (sign-in/sign-up), API routes
- `src/components/monitor/` — CalibrationView, LivePreview, PoseOverlay, SettingsPanel
- `src/components/dashboard/` — StatCards, WeeklyChart, HourlyHeatmap
- `src/components/nav.tsx` — Shared navigation
- `src/lib/` — Core logic: pose-engine, camera-manager, monitor-controller, local-storage, sync
- `src/lib/db/` — Neon client, queries, schema
- `src/hooks/` — Custom React hooks

## Running Locally

```bash
npm install
npm run dev
```

Required env vars (`.env.local`):
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — from Clerk dashboard
- `CLERK_SECRET_KEY` — from Clerk dashboard
- `DATABASE_URL` — Neon connection string

The app works without env vars for local-only monitoring (no auth, no stats persistence).

## Key Design Decisions

- **Privacy-first**: Video never leaves the browser. No frames uploaded.
- **Battery efficiency**: Camera activates briefly for each check, then releases. Configurable interval.
- **Offline-capable**: All monitoring works without an account. LocalStorage stores baseline, settings, and 7 days of scores.
- **Server sync**: Authenticated users sync session summaries (score, checks, streaks) to Neon for cross-device dashboard.
- **Sensitivity setting**: User-configurable threshold (0-1) for posture deviation tolerance.

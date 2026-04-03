# posture//watch Native macOS — Design Document

## Overview
Native Swift menu bar app using Apple Vision framework for posture detection. Runs as a colored dot in the menu bar with zero screen real estate. Camera activates for ~50ms per check, off the rest of the time.

## Tech
- Swift, AppKit (no SwiftUI needed for menu bar app)
- Apple Vision framework (`VNDetectHumanBodyPoseRequest`) — runs on Neural Engine
- AVFoundation for camera capture
- SQLite (via Swift's built-in SQLite3) for stats
- UserDefaults for settings and calibration baseline

## Menu Bar States
| State | Icon | Behavior |
|-------|------|----------|
| Good | Green dot | Silent |
| Warning | Yellow dot | Silent |
| Bad | Red dot | macOS notification (once per bad streak) |
| Away | Gray dot | Silent, doubled check interval |
| Paused | Hollow dot | No checks |

## Menu Bar Dropdown
- Status text ("Good posture" / "Fix posture!")
- Session stats: checks, score %, streak
- Sensitivity selector (relaxed/normal/strict)
- Check interval selector (15s/30s/60s/2min)
- "Recalibrate" button
- "Pause/Resume" toggle
- "Quit"

## Detection Flow
1. Calibrate: 5 samples over 3 seconds, averaged as baseline
2. Check loop: Timer fires every N seconds → capture single camera frame → run VNDetectHumanBodyPoseRequest → compare to baseline → update menu bar icon
3. Camera only active for single frame (~50ms), off the rest of the time
4. Presence detection: 3 consecutive misses = away, double interval
5. Battery: if battery < 20% and not charging, double interval

## Pose Detection
- VNDetectHumanBodyPoseRequest provides body landmarks natively
- Landmarks used: nose, left/right ear, left/right shoulder
- Metrics: head height, ear-shoulder distance, nose-shoulder distance, shoulder tilt
- Same scoring algorithm as web version:
  - thresholdMult = 2.0 - sensitivity * 2.0
  - Weighted ratio of deviations from baseline
  - ratio >= 0.5 = bad, >= 0.25 = warn, else good

## Data Storage
- **UserDefaults**: calibration baseline (as JSON), settings (interval, sensitivity)
- **SQLite**: sessions table, daily_stats table (same schema as web)
- Future: optional sync to web API `/api/stats/sync`

## App Properties
- LSUIElement = true (no dock icon)
- Launch at login option (via SMAppService)
- ~2MB app size
- ~20-30MB memory footprint
- Minimal CPU: one Vision request every 30s
- No model download — Vision framework is part of macOS

## Project Structure
```
PostureWatch/
├── PostureWatch.xcodeproj
├── PostureWatch/
│   ├── AppDelegate.swift          — App entry, NSStatusItem setup
│   ├── StatusBarController.swift  — Menu bar icon + dropdown menu
│   ├── PostureMonitor.swift       — Detection loop, camera capture, state machine
│   ├── PoseAnalyzer.swift         — Vision framework pose detection + scoring
│   ├── CalibrationManager.swift   — Calibration flow (5 samples, averaging)
│   ├── BatteryMonitor.swift       — Battery level monitoring
│   ├── Storage.swift              — UserDefaults + SQLite helpers
│   ├── Info.plist
│   └── Assets.xcassets
└── docs/
```

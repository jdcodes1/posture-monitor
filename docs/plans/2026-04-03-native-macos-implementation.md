# posture//watch Native macOS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a native Swift menu bar app that monitors posture using Apple's Vision framework, running as a colored dot with ~2MB size and ~20MB memory.

**Architecture:** Swift AppKit menu bar app (no SwiftUI). AVFoundation captures single camera frames on a timer. Vision framework's VNDetectHumanBodyPoseRequest detects pose landmarks. Same scoring algorithm as the web version compares against a calibrated baseline. SQLite stores stats locally.

**Tech Stack:** Swift, AppKit, AVFoundation, Vision framework, SQLite3, UserNotifications

**Reference:** Design doc at `docs/plans/2026-04-03-native-macos-design.md`

**Important:** This is a native Xcode project. Create it inside `native/` subdirectory of the existing repo. No CocoaPods/SPM dependencies — everything uses Apple frameworks.

---

## Task 1: Xcode Project Setup

**Files:**
- Create: `native/PostureWatch/` (Xcode project)

**Step 1: Create Xcode project**

```bash
cd /Users/joey/Documents/programming/posture-monitor
mkdir -p native
cd native
# Create Xcode project via command line
mkdir -p PostureWatch/PostureWatch
```

Create `native/PostureWatch/PostureWatch/main.swift`:
```swift
import Cocoa

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
```

Create `native/PostureWatch/PostureWatch/Info.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>PostureWatch</string>
    <key>CFBundleIdentifier</key>
    <string>com.posturewatch.app</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>CFBundleExecutable</key>
    <string>PostureWatch</string>
    <key>NSCameraUsageDescription</key>
    <string>PostureWatch needs camera access to monitor your posture. All processing happens locally on your device.</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
</dict>
</plist>
```

Create `native/PostureWatch/PostureWatch/AppDelegate.swift`:
```swift
import Cocoa

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusBarController: StatusBarController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusBarController = StatusBarController()
    }
}
```

Create `native/PostureWatch/PostureWatch/StatusBarController.swift` (stub):
```swift
import Cocoa

class StatusBarController {
    private let statusItem: NSStatusItem

    init() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "circle.fill", accessibilityDescription: "Posture")
            button.image?.isTemplate = false
            // Tint green by default
            button.contentTintColor = NSColor(red: 62/255, green: 232/255, blue: 165/255, alpha: 1)
        }

        setupMenu()
    }

    private func setupMenu() {
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "posture//watch", action: nil, keyEquivalent: ""))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Status: Initializing...", action: nil, keyEquivalent: ""))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        statusItem.menu = menu
    }
}
```

**Step 2: Create build script**

Create `native/build.sh`:
```bash
#!/bin/bash
set -e
cd "$(dirname "$0")/PostureWatch"

# Compile all Swift files into an app bundle
swiftc \
    -o PostureWatch \
    -framework Cocoa \
    -framework AVFoundation \
    -framework Vision \
    -framework UserNotifications \
    -framework IOKit \
    -import-objc-header /dev/null \
    PostureWatch/*.swift

# Create app bundle
APP_DIR="PostureWatch.app/Contents/MacOS"
mkdir -p "$APP_DIR"
mkdir -p "PostureWatch.app/Contents"
mv PostureWatch "$APP_DIR/"
cp PostureWatch/Info.plist "PostureWatch.app/Contents/"

echo "Built: $(pwd)/PostureWatch.app"
echo "Run: open $(pwd)/PostureWatch.app"
```

```bash
chmod +x native/build.sh
```

**Step 3: Build and verify**

Run:
```bash
cd /Users/joey/Documents/programming/posture-monitor
./native/build.sh
open native/PostureWatch/PostureWatch.app
```

Expected: App launches with a green dot in the menu bar. Click it to see the dropdown menu with "Quit". No dock icon.

**Step 4: Commit**

```bash
git add native/
git commit -m "feat: scaffold native macOS menu bar app"
```

---

## Task 2: Pose Analyzer (Vision Framework)

**Files:**
- Create: `native/PostureWatch/PostureWatch/PoseAnalyzer.swift`

**Step 1: Implement PoseAnalyzer**

```swift
import Vision
import CoreImage

enum PostureStatus: String {
    case good, warn, bad
}

struct PoseMetrics {
    let earShoulderDist: CGFloat
    let headHeight: CGFloat
    let shoulderTilt: CGFloat
    let noseShoulderDist: CGFloat
}

class PoseAnalyzer {

    /// Extract pose metrics from a pixel buffer using Vision framework.
    /// Returns nil if no person detected.
    func analyze(pixelBuffer: CVPixelBuffer) -> PoseMetrics? {
        let request = VNDetectHumanBodyPoseRequest()
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])

        do {
            try handler.perform([request])
        } catch {
            return nil
        }

        guard let observation = request.results?.first else { return nil }

        do {
            // Get key landmark points
            let nose = try observation.recognizedPoint(.nose)
            let leftEar = try observation.recognizedPoint(.leftEar)
            let rightEar = try observation.recognizedPoint(.rightEar)
            let leftShoulder = try observation.recognizedPoint(.leftShoulder)
            let rightShoulder = try observation.recognizedPoint(.rightShoulder)

            // Only use points with sufficient confidence
            let minConfidence: Float = 0.3
            guard nose.confidence > minConfidence,
                  leftEar.confidence > minConfidence || rightEar.confidence > minConfidence,
                  leftShoulder.confidence > minConfidence,
                  rightShoulder.confidence > minConfidence else {
                return nil
            }

            let earMidY = (leftEar.location.y + rightEar.location.y) / 2
            let shoulderMidY = (leftShoulder.location.y + rightShoulder.location.y) / 2

            return PoseMetrics(
                earShoulderDist: shoulderMidY - earMidY,
                headHeight: nose.location.y,
                shoulderTilt: abs(leftShoulder.location.y - rightShoulder.location.y),
                noseShoulderDist: shoulderMidY - nose.location.y
            )
        } catch {
            return nil
        }
    }

    /// Compare current pose to baseline. Returns posture status.
    func compare(current: PoseMetrics, baseline: PoseMetrics, sensitivity: CGFloat) -> PostureStatus {
        let thresholdMult = 2.0 - sensitivity * 2.0

        var score: CGFloat = 0
        var factors: CGFloat = 0

        // Head dropped
        let headDrop = current.headHeight - baseline.headHeight
        if headDrop > 0.04 * thresholdMult { score += 2 }
        else if headDrop > 0.02 * thresholdMult { score += 1 }
        factors += 2

        // Ear-shoulder distance decreased
        let distDiff = baseline.earShoulderDist - current.earShoulderDist
        if distDiff > 0.03 * thresholdMult { score += 2 }
        else if distDiff > 0.015 * thresholdMult { score += 1 }
        factors += 2

        // Nose-shoulder distance decreased
        let noseDiff = baseline.noseShoulderDist - current.noseShoulderDist
        if noseDiff > 0.03 * thresholdMult { score += 2 }
        else if noseDiff > 0.015 * thresholdMult { score += 1 }
        factors += 2

        // Shoulder tilt increased
        let tiltDiff = current.shoulderTilt - baseline.shoulderTilt
        if tiltDiff > 0.03 * thresholdMult { score += 1 }
        factors += 1

        let ratio = score / factors
        if ratio >= 0.5 { return .bad }
        if ratio >= 0.25 { return .warn }
        return .good
    }

    /// Average multiple pose samples into a baseline.
    func average(samples: [PoseMetrics]) -> PoseMetrics {
        let n = CGFloat(samples.count)
        return PoseMetrics(
            earShoulderDist: samples.map(\.earShoulderDist).reduce(0, +) / n,
            headHeight: samples.map(\.headHeight).reduce(0, +) / n,
            shoulderTilt: samples.map(\.shoulderTilt).reduce(0, +) / n,
            noseShoulderDist: samples.map(\.noseShoulderDist).reduce(0, +) / n
        )
    }
}
```

**Step 2: Build and verify**

Run: `./native/build.sh`
Expected: Compiles without errors.

**Step 3: Commit**

```bash
git add native/PostureWatch/PostureWatch/PoseAnalyzer.swift
git commit -m "feat: add Vision framework pose analyzer with scoring"
```

---

## Task 3: Camera Capture

**Files:**
- Create: `native/PostureWatch/PostureWatch/CameraCapture.swift`

**Step 1: Implement single-frame camera capture**

```swift
import AVFoundation
import CoreVideo

class CameraCapture: NSObject {
    private var captureSession: AVCaptureSession?
    private var videoOutput: AVCaptureVideoDataOutput?
    private let queue = DispatchQueue(label: "com.posturewatch.camera")
    private var frameCallback: ((CVPixelBuffer) -> Void)?
    private var capturedFrame: CVPixelBuffer?
    private var frameSemaphore = DispatchSemaphore(value: 0)

    /// Check if camera access is authorized, request if needed.
    static func requestAccess(completion: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            completion(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async { completion(granted) }
            }
        default:
            completion(false)
        }
    }

    /// Capture a single frame. Starts camera, grabs one frame, stops camera.
    /// Returns nil if camera unavailable.
    func captureFrame() -> CVPixelBuffer? {
        // Setup session if needed
        if captureSession == nil {
            guard setupSession() else { return nil }
        }

        capturedFrame = nil

        // Start capturing
        captureSession?.startRunning()

        // Wait for a frame (timeout after 3 seconds)
        let result = frameSemaphore.wait(timeout: .now() + 3.0)

        // Stop capturing immediately
        captureSession?.stopRunning()

        if result == .timedOut { return nil }
        return capturedFrame
    }

    private func setupSession() -> Bool {
        let session = AVCaptureSession()
        session.sessionPreset = .medium // 480p is enough

        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) ?? AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device) else {
            return false
        }

        let output = AVCaptureVideoDataOutput()
        output.setSampleBufferDelegate(self, queue: queue)
        output.alwaysDiscardsLateVideoFrames = true

        guard session.canAddInput(input), session.canAddOutput(output) else {
            return false
        }

        session.addInput(input)
        session.addOutput(output)

        captureSession = session
        videoOutput = output
        return true
    }
}

extension CameraCapture: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard capturedFrame == nil,
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        capturedFrame = pixelBuffer
        frameSemaphore.signal()
    }
}
```

**Step 2: Build and verify**

Run: `./native/build.sh`
Expected: Compiles without errors.

**Step 3: Commit**

```bash
git add native/PostureWatch/PostureWatch/CameraCapture.swift
git commit -m "feat: add single-frame camera capture for battery efficiency"
```

---

## Task 4: Battery Monitor

**Files:**
- Create: `native/PostureWatch/PostureWatch/BatteryMonitor.swift`

**Step 1: Implement battery monitor**

```swift
import IOKit.ps

class BatteryMonitor {
    /// Returns true if battery is below 20% and not charging.
    var isLowBattery: Bool {
        guard let snapshot = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let sources = IOPSCopyPowerSourcesList(snapshot)?.takeRetainedValue() as? [CFTypeRef],
              let source = sources.first,
              let info = IOPSGetPowerSourceDescription(snapshot, source)?.takeUnretainedValue() as? [String: Any] else {
            return false
        }

        let currentCapacity = info[kIOPSCurrentCapacityKey] as? Int ?? 100
        let maxCapacity = info[kIOPSMaxCapacityKey] as? Int ?? 100
        let isCharging = info[kIOPSIsChargingKey] as? Bool ?? true

        let level = Double(currentCapacity) / Double(maxCapacity)
        return level < 0.2 && !isCharging
    }
}
```

**Step 2: Build and verify**

Run: `./native/build.sh`
Expected: Compiles without errors.

**Step 3: Commit**

```bash
git add native/PostureWatch/PostureWatch/BatteryMonitor.swift
git commit -m "feat: add battery monitor for low-battery interval adjustment"
```

---

## Task 5: Storage (UserDefaults + SQLite)

**Files:**
- Create: `native/PostureWatch/PostureWatch/Storage.swift`

**Step 1: Implement storage**

```swift
import Foundation
import SQLite3

// MARK: - Settings & Baseline (UserDefaults)

struct Settings: Codable {
    var interval: Int = 30          // seconds
    var sensitivity: Double = 0.5   // 0.3 relaxed, 0.5 normal, 0.7 strict
    var launchAtLogin: Bool = false
}

class SettingsStore {
    private let defaults = UserDefaults.standard
    private let settingsKey = "pw:settings"
    private let baselineKey = "pw:baseline"

    func loadSettings() -> Settings {
        guard let data = defaults.data(forKey: settingsKey),
              let settings = try? JSONDecoder().decode(Settings.self, from: data) else {
            return Settings()
        }
        return settings
    }

    func saveSettings(_ settings: Settings) {
        if let data = try? JSONEncoder().encode(settings) {
            defaults.set(data, forKey: settingsKey)
        }
    }

    func loadBaseline() -> PoseMetrics? {
        guard let data = defaults.data(forKey: baselineKey),
              let values = try? JSONDecoder().decode([CGFloat].self, from: data),
              values.count == 4 else {
            return nil
        }
        return PoseMetrics(
            earShoulderDist: values[0],
            headHeight: values[1],
            shoulderTilt: values[2],
            noseShoulderDist: values[3]
        )
    }

    func saveBaseline(_ baseline: PoseMetrics) {
        let values = [baseline.earShoulderDist, baseline.headHeight, baseline.shoulderTilt, baseline.noseShoulderDist]
        if let data = try? JSONEncoder().encode(values) {
            defaults.set(data, forKey: baselineKey)
        }
    }
}

// MARK: - Stats (SQLite)

class StatsStore {
    private var db: OpaquePointer?

    init() {
        let path = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("PostureWatch", isDirectory: true)

        try? FileManager.default.createDirectory(at: path, withIntermediateDirectories: true)

        let dbPath = path.appendingPathComponent("stats.db").path

        if sqlite3_open(dbPath, &db) == SQLITE_OK {
            createTables()
        }
    }

    deinit {
        sqlite3_close(db)
    }

    private func createTables() {
        let sql = """
        CREATE TABLE IF NOT EXISTS daily_stats (
            date TEXT NOT NULL,
            total_checks INTEGER DEFAULT 0,
            good_checks INTEGER DEFAULT 0,
            avg_score REAL DEFAULT 0,
            best_streak INTEGER DEFAULT 0,
            PRIMARY KEY (date)
        );
        """
        sqlite3_exec(db, sql, nil, nil, nil)
    }

    func upsertDaily(date: String, checks: Int, goodChecks: Int, score: Double, bestStreak: Int) {
        let sql = """
        INSERT INTO daily_stats (date, total_checks, good_checks, avg_score, best_streak)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
            total_checks = total_checks + excluded.total_checks,
            good_checks = good_checks + excluded.good_checks,
            avg_score = excluded.avg_score,
            best_streak = MAX(best_streak, excluded.best_streak);
        """
        var stmt: OpaquePointer?
        if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
            sqlite3_bind_text(stmt, 1, (date as NSString).utf8String, -1, nil)
            sqlite3_bind_int(stmt, 2, Int32(checks))
            sqlite3_bind_int(stmt, 3, Int32(goodChecks))
            sqlite3_bind_double(stmt, 4, score)
            sqlite3_bind_int(stmt, 5, Int32(bestStreak))
            sqlite3_step(stmt)
        }
        sqlite3_finalize(stmt)
    }
}
```

**Step 2: Build and verify**

Run: `./native/build.sh`
Expected: Compiles without errors.

**Step 3: Commit**

```bash
git add native/PostureWatch/PostureWatch/Storage.swift
git commit -m "feat: add UserDefaults + SQLite storage for settings and stats"
```

---

## Task 6: Posture Monitor (Main Loop)

**Files:**
- Create: `native/PostureWatch/PostureWatch/PostureMonitor.swift`

**Step 1: Implement the monitoring state machine**

```swift
import Foundation
import UserNotifications

protocol PostureMonitorDelegate: AnyObject {
    func postureDidChange(status: PostureStatus, stats: MonitorStats)
}

struct MonitorStats {
    var checks: Int = 0
    var good: Int = 0
    var streak: Int = 0
    var bestStreak: Int = 0

    var score: Int {
        guard checks > 0 else { return 100 }
        return Int(round(Double(good) / Double(checks) * 100))
    }
}

class PostureMonitor {
    weak var delegate: PostureMonitorDelegate?

    private let analyzer = PoseAnalyzer()
    private let camera = CameraCapture()
    private let battery = BatteryMonitor()
    private let settingsStore = SettingsStore()
    private let statsStore = StatsStore()

    private var baseline: PoseMetrics?
    private var settings: Settings
    private var stats = MonitorStats()
    private var timer: Timer?
    private var missCount = 0
    private var isAway = false
    private var lastNotifiedBad = false
    private var isPaused = false
    private var currentStatus: PostureStatus = .good

    init() {
        settings = settingsStore.loadSettings()
        baseline = settingsStore.loadBaseline()

        // Request notification permission
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    var isCalibrated: Bool { baseline != nil }
    var currentSettings: Settings { settings }

    // MARK: - Calibration

    func calibrate(completion: @escaping (Bool) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }

            var samples: [PoseMetrics] = []
            for _ in 0..<5 {
                if let frame = self.camera.captureFrame(),
                   let metrics = self.analyzer.analyze(pixelBuffer: frame) {
                    samples.append(metrics)
                }
                Thread.sleep(forTimeInterval: 0.6)
            }

            DispatchQueue.main.async {
                if samples.count >= 3 {
                    self.baseline = self.analyzer.average(samples: samples)
                    self.settingsStore.saveBaseline(self.baseline!)
                    completion(true)
                } else {
                    completion(false)
                }
            }
        }
    }

    // MARK: - Monitoring

    func startMonitoring() {
        guard baseline != nil else { return }
        isPaused = false
        stats = MonitorStats()
        scheduleNextCheck()
    }

    func stopMonitoring() {
        timer?.invalidate()
        timer = nil
        isPaused = true
    }

    func togglePause() {
        if isPaused {
            startMonitoring()
        } else {
            stopMonitoring()
        }
    }

    func updateSettings(_ newSettings: Settings) {
        settings = newSettings
        settingsStore.saveSettings(settings)
        // Restart timer with new interval if monitoring
        if !isPaused && timer != nil {
            timer?.invalidate()
            scheduleNextCheck()
        }
    }

    private func scheduleNextCheck() {
        var interval = TimeInterval(settings.interval)
        if isAway { interval *= 2 }
        if battery.isLowBattery { interval *= 2 }

        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
            self?.performCheck()
        }
    }

    private func performCheck() {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self, let baseline = self.baseline else { return }

            guard let frame = self.camera.captureFrame(),
                  let metrics = self.analyzer.analyze(pixelBuffer: frame) else {
                // No person detected
                DispatchQueue.main.async {
                    self.missCount += 1
                    if self.missCount >= 3 {
                        self.isAway = true
                    }
                    self.scheduleNextCheck()
                }
                return
            }

            let status = self.analyzer.compare(
                current: metrics,
                baseline: baseline,
                sensitivity: CGFloat(self.settings.sensitivity)
            )

            DispatchQueue.main.async {
                self.missCount = 0
                self.isAway = false
                self.currentStatus = status
                self.stats.checks += 1

                if status == .good {
                    self.stats.good += 1
                    self.stats.streak += 1
                    if self.stats.streak > self.stats.bestStreak {
                        self.stats.bestStreak = self.stats.streak
                    }
                } else {
                    self.stats.streak = 0
                }

                // Notification on transition to bad
                if status == .bad && !self.lastNotifiedBad {
                    self.sendNotification()
                }
                self.lastNotifiedBad = (status == .bad)

                // Save daily stats
                let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
                self.statsStore.upsertDaily(
                    date: String(today),
                    checks: 1,
                    goodChecks: status == .good ? 1 : 0,
                    score: Double(self.stats.score),
                    bestStreak: self.stats.bestStreak
                )

                self.delegate?.postureDidChange(status: status, stats: self.stats)
                self.scheduleNextCheck()
            }
        }
    }

    private func sendNotification() {
        let content = UNMutableNotificationContent()
        content.title = "posture//watch"
        content.body = "Sit up straight! Your posture needs attention."
        content.sound = .default

        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}
```

**Step 2: Build and verify**

Run: `./native/build.sh`
Expected: Compiles without errors.

**Step 3: Commit**

```bash
git add native/PostureWatch/PostureWatch/PostureMonitor.swift
git commit -m "feat: add posture monitor with detection loop, calibration, and notifications"
```

---

## Task 7: Status Bar Controller (Full UI)

**Files:**
- Modify: `native/PostureWatch/PostureWatch/StatusBarController.swift`

**Step 1: Implement the full menu bar UI**

Replace the entire file:

```swift
import Cocoa

class StatusBarController: PostureMonitorDelegate {
    private let statusItem: NSStatusItem
    private let monitor = PostureMonitor()

    // Menu items that get updated
    private var statusMenuItem: NSMenuItem!
    private var statsMenuItem: NSMenuItem!
    private var pauseMenuItem: NSMenuItem!
    private var calibrateMenuItem: NSMenuItem!
    private var sensitivityMenu: NSMenu!
    private var intervalMenu: NSMenu!

    private let colors: [PostureStatus: NSColor] = [
        .good: NSColor(red: 62/255, green: 232/255, blue: 165/255, alpha: 1),
        .warn: NSColor(red: 245/255, green: 200/255, blue: 66/255, alpha: 1),
        .bad: NSColor(red: 245/255, green: 86/255, blue: 74/255, alpha: 1),
    ]
    private let grayColor = NSColor(red: 92/255, green: 99/255, blue: 112/255, alpha: 1)

    init() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        monitor.delegate = self

        updateIcon(.good)
        setupMenu()

        // Request camera access then auto-calibrate if no saved baseline
        CameraCapture.requestAccess { [weak self] granted in
            guard granted, let self else { return }
            if self.monitor.isCalibrated {
                self.monitor.startMonitoring()
                self.updateStatus("Monitoring — Good posture", stats: nil)
            } else {
                self.startCalibration()
            }
        }
    }

    // MARK: - Menu Setup

    private func setupMenu() {
        let menu = NSMenu()

        // Title
        let titleItem = NSMenuItem(title: "posture//watch", action: nil, keyEquivalent: "")
        titleItem.attributedTitle = NSAttributedString(
            string: "posture//watch",
            attributes: [.font: NSFont.monospacedSystemFont(ofSize: 12, weight: .semibold)]
        )
        menu.addItem(titleItem)
        menu.addItem(NSMenuItem.separator())

        // Status
        statusMenuItem = NSMenuItem(title: "Initializing...", action: nil, keyEquivalent: "")
        menu.addItem(statusMenuItem)

        // Stats
        statsMenuItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
        statsMenuItem.isHidden = true
        menu.addItem(statsMenuItem)

        menu.addItem(NSMenuItem.separator())

        // Sensitivity submenu
        let sensitivityItem = NSMenuItem(title: "Sensitivity", action: nil, keyEquivalent: "")
        sensitivityMenu = NSMenu()
        for (title, value) in [("Relaxed", 0.3), ("Normal", 0.5), ("Strict", 0.7)] {
            let item = NSMenuItem(title: title, action: #selector(changeSensitivity(_:)), keyEquivalent: "")
            item.target = self
            item.tag = Int(value * 10)
            if value == monitor.currentSettings.sensitivity { item.state = .on }
            sensitivityMenu.addItem(item)
        }
        sensitivityItem.submenu = sensitivityMenu
        menu.addItem(sensitivityItem)

        // Interval submenu
        let intervalItem = NSMenuItem(title: "Check Every", action: nil, keyEquivalent: "")
        intervalMenu = NSMenu()
        for (title, value) in [("15 seconds", 15), ("30 seconds", 30), ("60 seconds", 60), ("2 minutes", 120)] {
            let item = NSMenuItem(title: title, action: #selector(changeInterval(_:)), keyEquivalent: "")
            item.target = self
            item.tag = value
            if value == monitor.currentSettings.interval { item.state = .on }
            intervalMenu.addItem(item)
        }
        intervalItem.submenu = intervalMenu
        menu.addItem(intervalItem)

        menu.addItem(NSMenuItem.separator())

        // Calibrate
        calibrateMenuItem = NSMenuItem(title: "Recalibrate", action: #selector(recalibrate), keyEquivalent: "r")
        calibrateMenuItem.target = self
        menu.addItem(calibrateMenuItem)

        // Pause
        pauseMenuItem = NSMenuItem(title: "Pause", action: #selector(togglePause), keyEquivalent: "p")
        pauseMenuItem.target = self
        menu.addItem(pauseMenuItem)

        menu.addItem(NSMenuItem.separator())

        // Quit
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))

        statusItem.menu = menu
    }

    // MARK: - Actions

    @objc private func changeSensitivity(_ sender: NSMenuItem) {
        let value = Double(sender.tag) / 10.0
        var settings = monitor.currentSettings
        settings.sensitivity = value
        monitor.updateSettings(settings)
        // Update checkmarks
        sensitivityMenu.items.forEach { $0.state = $0.tag == sender.tag ? .on : .off }
    }

    @objc private func changeInterval(_ sender: NSMenuItem) {
        var settings = monitor.currentSettings
        settings.interval = sender.tag
        monitor.updateSettings(settings)
        // Update checkmarks
        intervalMenu.items.forEach { $0.state = $0.tag == sender.tag ? .on : .off }
    }

    @objc private func recalibrate() {
        monitor.stopMonitoring()
        startCalibration()
    }

    @objc private func togglePause() {
        monitor.togglePause()
        pauseMenuItem.title = pauseMenuItem.title == "Pause" ? "Resume" : "Pause"
        if pauseMenuItem.title == "Pause" {
            // Resumed
        } else {
            updateIcon(nil)
            statusMenuItem.title = "Paused"
        }
    }

    // MARK: - Calibration

    private func startCalibration() {
        statusMenuItem.title = "Calibrating... sit up straight"
        updateIcon(nil) // gray during calibration

        monitor.calibrate { [weak self] success in
            if success {
                self?.monitor.startMonitoring()
                self?.updateStatus("Monitoring — Good posture", stats: nil)
            } else {
                self?.statusMenuItem.title = "Calibration failed — try Recalibrate"
            }
        }
    }

    // MARK: - Delegate

    func postureDidChange(status: PostureStatus, stats: MonitorStats) {
        let labels: [PostureStatus: String] = [
            .good: "Good posture",
            .warn: "Check your posture",
            .bad: "Fix your posture!",
        ]

        updateIcon(status)
        updateStatus("Monitoring — \(labels[status] ?? "")", stats: stats)
    }

    // MARK: - UI Updates

    private func updateIcon(_ status: PostureStatus?) {
        guard let button = statusItem.button else { return }
        button.image = NSImage(systemSymbolName: "circle.fill", accessibilityDescription: "Posture")
        button.image?.isTemplate = false
        button.contentTintColor = status.flatMap { colors[$0] } ?? grayColor
    }

    private func updateStatus(_ text: String, stats: MonitorStats?) {
        statusMenuItem.title = text
        if let stats {
            statsMenuItem.title = "Checks: \(stats.checks)  Score: \(stats.score)%  Streak: \(stats.streak)"
            statsMenuItem.isHidden = false
        }
    }
}
```

**Step 2: Build and verify**

Run:
```bash
./native/build.sh
open native/PostureWatch/PostureWatch.app
```

Expected: App launches in menu bar. Auto-calibrates (camera activates briefly). Then starts monitoring — icon changes color based on posture.

**Step 3: Commit**

```bash
git add native/PostureWatch/PostureWatch/StatusBarController.swift
git commit -m "feat: complete menu bar UI with settings, calibration, and stats"
```

---

## Task 8: Polish & Final Build

**Files:**
- Modify: various for polish

**Step 1: Add .gitignore for build artifacts**

Add to `native/.gitignore`:
```
*.app
.DS_Store
```

**Step 2: Final build and test**

```bash
./native/build.sh
open native/PostureWatch/PostureWatch.app
```

Full test:
- App appears in menu bar as green dot (no dock icon)
- Click dot → dropdown shows title, status, stats
- Sensitivity/interval submenus work
- Slouch → icon turns yellow/red, notification fires
- Sit up → icon returns to green
- Recalibrate works
- Pause/Resume works
- Quit works

**Step 3: Commit**

```bash
git add native/
git commit -m "chore: polish native app and add gitignore"
```

---

## Task Order

```
Task 1 (scaffold) → Task 2 (pose analyzer) → Task 3 (camera)
                                                    ↓
Task 4 (battery) → Task 5 (storage) → Task 6 (monitor loop) → Task 7 (full UI) → Task 8 (polish)
```

Tasks 2-5 can be parallelized since they're independent modules.

import Foundation
import CoreVideo
import UserNotifications

protocol PostureMonitorDelegate: AnyObject {
    func postureDidChange(status: PostureStatus, stats: MonitorStats)
    func calibrationDidUpdate(message: String)
    func liveAnalysisResult(_ result: PoseAnalysisResult?)
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

    let analyzer = PoseAnalyzer()
    let camera = CameraCapture()
    private let battery = BatteryMonitor()
    private let settingsStore = SettingsStore()
    private let statsStore = StatsStore()
    private let dateFormatter = ISO8601DateFormatter()

    private var baseline: PoseMetrics?
    private(set) var settings: Settings
    private var stats = MonitorStats()
    private var timer: Timer?
    private var missCount = 0
    private var isAway = false
    private var lastNotifiedBad = false
    private(set) var isPaused = false

    /// Enable live analysis (sends every frame result to delegate)
    var liveAnalysisEnabled = false

    /// Used to throttle live analysis
    private var lastLiveAnalysisTime: TimeInterval = 0
    private let liveAnalysisInterval: TimeInterval = 0.15 // ~7fps

    /// Semaphore + result storage for synchronous single-frame capture
    private var captureResult: PoseAnalysisResult?
    private var captureWaiting = false
    private var captureSemaphore = DispatchSemaphore(value: 0)

    init() {
        settings = settingsStore.loadSettings()
        baseline = settingsStore.loadBaseline()

        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }

        // Set up frame handler — this runs on the camera's background queue
        camera.onFrame = { [weak self] pixelBuffer in
            self?.handleFrame(pixelBuffer)
        }
    }

    var isCalibrated: Bool { baseline != nil }

    // MARK: - Frame Handling (runs on camera queue — pixelBuffer is valid here)

    private var frameCount = 0
    private func handleFrame(_ pixelBuffer: CVPixelBuffer) {
        frameCount += 1
        if frameCount <= 3 || frameCount % 30 == 0 {
            pwLog("handleFrame called (frame #\(frameCount), captureWaiting=\(captureWaiting))")
        }
        let now = ProcessInfo.processInfo.systemUptime

        // Live analysis for overlay (throttled)
        if liveAnalysisEnabled && (now - lastLiveAnalysisTime) >= liveAnalysisInterval {
            lastLiveAnalysisTime = now
            let result = analyzer.analyze(pixelBuffer: pixelBuffer)
            DispatchQueue.main.async { [weak self] in
                self?.delegate?.liveAnalysisResult(result)
            }
        }

        // Single-frame capture (for calibration / background checks)
        if captureWaiting {
            captureResult = analyzer.analyze(pixelBuffer: pixelBuffer)
            captureWaiting = false
            captureSemaphore.signal()
        }
    }

    /// Capture and analyze a single frame. Blocks until result is ready.
    /// Must NOT be called from the camera queue.
    private func captureAndAnalyze(timeout: TimeInterval = 3.0) -> PoseAnalysisResult? {
        captureResult = nil
        captureWaiting = true
        let result = captureSemaphore.wait(timeout: .now() + timeout)
        captureWaiting = false
        if result == .timedOut { return nil }
        return captureResult
    }

    // MARK: - Calibration

    func calibrate(completion: @escaping (Bool) -> Void) {
        pwLog("calibrate() called")
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { pwLog("self is nil in calibrate"); return }
            pwLog("calibrate async block started")

            // Start camera
            let startSemaphore = DispatchSemaphore(value: 0)
            self.camera.start { success in
                pwLog("Camera started for calibration: \(success)")
                startSemaphore.signal()
            }
            startSemaphore.wait()

            guard self.camera.isRunning else {
                pwLog(" Camera failed to start")
                DispatchQueue.main.async {
                    self.delegate?.calibrationDidUpdate(message: "Camera failed to start")
                    completion(false)
                }
                return
            }

            // Wait for camera warmup
            DispatchQueue.main.async {
                self.delegate?.calibrationDidUpdate(message: "Starting camera...")
            }
            Thread.sleep(forTimeInterval: 2.0)

            // First, verify we can get ANY frame
            DispatchQueue.main.async {
                self.delegate?.calibrationDidUpdate(message: "Detecting pose...")
            }

            var samples: [PoseMetrics] = []
            var attempts = 0

            while samples.count < 5 && attempts < 25 {
                attempts += 1

                if let result = self.captureAndAnalyze(timeout: 2.0) {
                    samples.append(result.metrics)
                    pwLog(" Calibration sample \(samples.count)/5 (attempt \(attempts))")
                    DispatchQueue.main.async {
                        self.delegate?.calibrationDidUpdate(message: "Capturing... \(samples.count)/5")
                    }
                } else {
                    pwLog(" Calibration attempt \(attempts): no pose detected")
                }

                Thread.sleep(forTimeInterval: 0.4)
            }

            DispatchQueue.main.async {
                if samples.count >= 2 {
                    self.baseline = self.analyzer.average(samples: samples)
                    self.settingsStore.saveBaseline(self.baseline!)
                    pwLog(" Calibration succeeded with \(samples.count) samples")
                    completion(true)
                } else {
                    pwLog(" Calibration failed: only \(samples.count) samples from \(attempts) attempts")
                    self.delegate?.calibrationDidUpdate(message: "Failed — \(samples.count) poses detected in \(attempts) attempts")
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

            // Start camera, capture one frame with analysis, stop camera
            let startSemaphore = DispatchSemaphore(value: 0)
            self.camera.start { _ in startSemaphore.signal() }
            startSemaphore.wait()

            // Wait for camera warmup
            Thread.sleep(forTimeInterval: 0.5)

            let result = self.captureAndAnalyze(timeout: 3.0)

            self.camera.stop()

            guard let result else {
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
                current: result.metrics,
                baseline: baseline,
                sensitivity: CGFloat(self.settings.sensitivity)
            )

            DispatchQueue.main.async {
                self.missCount = 0
                self.isAway = false
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

                if status == .bad && !self.lastNotifiedBad {
                    self.sendNotification()
                }
                self.lastNotifiedBad = (status == .bad)

                let today = self.dateFormatter.string(from: Date()).prefix(10)
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

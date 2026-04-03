import Foundation
import UserNotifications

protocol PostureMonitorDelegate: AnyObject {
    func postureDidChange(status: PostureStatus, stats: MonitorStats)
    func calibrationDidUpdate(message: String)
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

    init() {
        settings = settingsStore.loadSettings()
        baseline = settingsStore.loadBaseline()

        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    var isCalibrated: Bool { baseline != nil }

    // MARK: - Calibration

    func calibrate(completion: @escaping (Bool) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }

            // Start camera and wait for it to be running
            let semaphore = DispatchSemaphore(value: 0)
            self.camera.start { _ in semaphore.signal() }
            semaphore.wait()

            // Wait for camera warmup — first few frames are often black/blurry
            DispatchQueue.main.async {
                self.delegate?.calibrationDidUpdate(message: "Starting camera...")
            }
            Thread.sleep(forTimeInterval: 1.5)

            // Wait for first valid frame
            guard self.camera.waitForFrame(timeout: 5.0) != nil else {
                NSLog("[PostureWatch] No frames received from camera")
                DispatchQueue.main.async {
                    self.delegate?.calibrationDidUpdate(message: "Camera not responding")
                    completion(false)
                }
                return
            }

            DispatchQueue.main.async {
                self.delegate?.calibrationDidUpdate(message: "Sit up straight... detecting pose")
            }

            var samples: [PoseMetrics] = []
            var attempts = 0

            while samples.count < 5 && attempts < 20 {
                attempts += 1
                Thread.sleep(forTimeInterval: 0.5)

                guard let frame = self.camera.latestFrame else {
                    NSLog("[PostureWatch] Calibration attempt \(attempts): no frame")
                    continue
                }

                if let metrics = self.analyzer.analyze(pixelBuffer: frame) {
                    samples.append(metrics)
                    NSLog("[PostureWatch] Calibration sample \(samples.count)/5 captured")
                    DispatchQueue.main.async {
                        self.delegate?.calibrationDidUpdate(message: "Capturing... \(samples.count)/5")
                    }
                } else {
                    NSLog("[PostureWatch] Calibration attempt \(attempts): pose not detected")
                }
            }

            DispatchQueue.main.async {
                if samples.count >= 2 {
                    self.baseline = self.analyzer.average(samples: samples)
                    self.settingsStore.saveBaseline(self.baseline!)
                    NSLog("[PostureWatch] Calibration succeeded with \(samples.count) samples")
                    completion(true)
                } else {
                    NSLog("[PostureWatch] Calibration failed: only \(samples.count) samples")
                    self.delegate?.calibrationDidUpdate(message: "Failed — could not detect pose (\(samples.count)/2 needed)")
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

            // Start camera, get a frame, stop camera
            let semaphore = DispatchSemaphore(value: 0)
            self.camera.start { _ in semaphore.signal() }
            semaphore.wait()

            // Wait for a fresh frame
            Thread.sleep(forTimeInterval: 0.3)

            guard let frame = self.camera.latestFrame,
                  let metrics = self.analyzer.analyze(pixelBuffer: frame) else {
                self.camera.stop()
                DispatchQueue.main.async {
                    self.missCount += 1
                    if self.missCount >= 3 {
                        self.isAway = true
                    }
                    self.scheduleNextCheck()
                }
                return
            }

            self.camera.stop()

            let status = self.analyzer.compare(
                current: metrics,
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

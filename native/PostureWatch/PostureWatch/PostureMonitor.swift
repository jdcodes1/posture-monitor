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
    private(set) var settings: Settings
    private var stats = MonitorStats()
    private var timer: Timer?
    private var missCount = 0
    private var isAway = false
    private var lastNotifiedBad = false
    private(set) var isPaused = false
    private var currentStatus: PostureStatus = .good

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

                if status == .bad && !self.lastNotifiedBad {
                    self.sendNotification()
                }
                self.lastNotifiedBad = (status == .bad)

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

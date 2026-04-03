import Cocoa

class StatusBarController: PostureMonitorDelegate {
    private let statusItem: NSStatusItem
    private let monitor = PostureMonitor()

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

        let titleItem = NSMenuItem(title: "posture//watch", action: nil, keyEquivalent: "")
        titleItem.attributedTitle = NSAttributedString(
            string: "posture//watch",
            attributes: [.font: NSFont.monospacedSystemFont(ofSize: 12, weight: .semibold)]
        )
        menu.addItem(titleItem)
        menu.addItem(NSMenuItem.separator())

        statusMenuItem = NSMenuItem(title: "Initializing...", action: nil, keyEquivalent: "")
        menu.addItem(statusMenuItem)

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
            if value == monitor.settings.sensitivity { item.state = .on }
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
            if value == monitor.settings.interval { item.state = .on }
            intervalMenu.addItem(item)
        }
        intervalItem.submenu = intervalMenu
        menu.addItem(intervalItem)

        menu.addItem(NSMenuItem.separator())

        calibrateMenuItem = NSMenuItem(title: "Recalibrate", action: #selector(recalibrate), keyEquivalent: "r")
        calibrateMenuItem.target = self
        menu.addItem(calibrateMenuItem)

        pauseMenuItem = NSMenuItem(title: "Pause", action: #selector(togglePause), keyEquivalent: "p")
        pauseMenuItem.target = self
        menu.addItem(pauseMenuItem)

        menu.addItem(NSMenuItem.separator())

        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))

        statusItem.menu = menu
    }

    // MARK: - Actions

    @objc private func changeSensitivity(_ sender: NSMenuItem) {
        let value = Double(sender.tag) / 10.0
        var s = monitor.settings
        s.sensitivity = value
        monitor.updateSettings(s)
        sensitivityMenu.items.forEach { $0.state = $0.tag == sender.tag ? .on : .off }
    }

    @objc private func changeInterval(_ sender: NSMenuItem) {
        var s = monitor.settings
        s.interval = sender.tag
        monitor.updateSettings(s)
        intervalMenu.items.forEach { $0.state = $0.tag == sender.tag ? .on : .off }
    }

    @objc private func recalibrate() {
        monitor.stopMonitoring()
        startCalibration()
    }

    @objc private func togglePause() {
        monitor.togglePause()
        if monitor.isPaused {
            pauseMenuItem.title = "Resume"
            updateIcon(nil)
            statusMenuItem.title = "Paused"
        } else {
            pauseMenuItem.title = "Pause"
        }
    }

    // MARK: - Calibration

    private func startCalibration() {
        statusMenuItem.title = "Calibrating... sit up straight"
        updateIcon(nil)

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

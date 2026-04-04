import Cocoa
import AVFoundation

class StatusBarController: NSObject, PostureMonitorDelegate {
    private let statusItem: NSStatusItem
    private let monitor = PostureMonitor()

    private var statusMenuItem: NSMenuItem!
    private var statsMenuItem: NSMenuItem!
    private var pauseMenuItem: NSMenuItem!
    private var previewMenuItem: NSMenuItem!
    private var sensitivityMenu: NSMenu!
    private var intervalMenu: NSMenu!
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var overlayView: PoseOverlayView?

    private let colors: [PostureStatus: NSColor] = [
        .good: NSColor(red: 62/255, green: 232/255, blue: 165/255, alpha: 1),
        .warn: NSColor(red: 245/255, green: 200/255, blue: 66/255, alpha: 1),
        .bad: NSColor(red: 245/255, green: 86/255, blue: 74/255, alpha: 1),
    ]
    private let grayColor = NSColor(red: 92/255, green: 99/255, blue: 112/255, alpha: 1)

    override init() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        super.init()
        monitor.delegate = self

        updateIcon(nil)
        setupMenu()

        CameraCapture.requestAccess { [weak self] granted in
            guard granted, let self else {
                pwLog(" Camera access denied")
                return
            }
            pwLog(" Camera access granted")
            if self.monitor.isCalibrated {
                self.monitor.startMonitoring()
                self.updateStatus("Monitoring — Good posture", stats: nil)
                self.updateIcon(.good)
            } else {
                self.startCalibration()
            }
        }
    }

    // MARK: - Menu Setup

    private func setupMenu() {
        let menu = NSMenu()
        menu.delegate = self

        let titleItem = NSMenuItem(title: "posture//watch", action: nil, keyEquivalent: "")
        titleItem.attributedTitle = NSAttributedString(
            string: "posture//watch",
            attributes: [.font: NSFont.monospacedSystemFont(ofSize: 12, weight: .semibold)]
        )
        menu.addItem(titleItem)
        menu.addItem(NSMenuItem.separator())

        // Camera preview + pose overlay
        previewMenuItem = NSMenuItem()
        let previewContainer = NSView(frame: NSRect(x: 0, y: 0, width: 240, height: 180))
        previewContainer.wantsLayer = true
        previewContainer.layer?.backgroundColor = NSColor(red: 20/255, green: 24/255, blue: 32/255, alpha: 1).cgColor
        previewContainer.layer?.cornerRadius = 8
        previewContainer.layer?.masksToBounds = true

        let overlay = PoseOverlayView(frame: previewContainer.bounds)
        overlay.wantsLayer = true
        overlay.autoresizingMask = [.width, .height]
        previewContainer.addSubview(overlay)
        overlayView = overlay

        previewMenuItem.view = previewContainer
        menu.addItem(previewMenuItem)

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

        // Recalibrate — custom view so menu stays open
        let calibrateItem = NSMenuItem()
        calibrateItem.view = makeMenuButton(title: "Recalibrate", action: #selector(recalibrate))
        menu.addItem(calibrateItem)

        // Pause — custom view so menu stays open
        pauseMenuItem = NSMenuItem()
        pauseMenuItem.view = makeMenuButton(title: "Pause", action: #selector(togglePause))
        menu.addItem(pauseMenuItem)

        menu.addItem(NSMenuItem.separator())

        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))

        statusItem.menu = menu
    }

    private func makeMenuButton(title: String, action: Selector) -> NSView {
        let container = NSView(frame: NSRect(x: 0, y: 0, width: 240, height: 28))
        let button = NSButton(frame: NSRect(x: 16, y: 2, width: 208, height: 24))
        button.title = title
        button.bezelStyle = .inline
        button.target = self
        button.action = action
        button.font = NSFont.systemFont(ofSize: 13)
        container.addSubview(button)
        return container
    }

    // MARK: - Camera Preview

    private func startPreview() {
        monitor.camera.start { [weak self] success in
            guard success, let self else { return }
            pwLog(" Camera started for preview")

            DispatchQueue.main.async {
                self.attachPreviewLayer()
                // Enable live analysis — results come via delegate
                self.monitor.liveAnalysisEnabled = true
            }
        }
    }

    private func attachPreviewLayer() {
        guard let session = monitor.camera.captureSession,
              let view = previewMenuItem.view,
              previewLayer == nil else { return }

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds

        if let connection = layer.connection {
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = true
        }

        view.layer?.insertSublayer(layer, at: 0)
        previewLayer = layer
        pwLog(" Preview layer attached")
    }

    private func stopPreview() {
        monitor.liveAnalysisEnabled = false
        previewLayer?.removeFromSuperlayer()
        previewLayer = nil
        overlayView?.landmarks = nil
        overlayView?.display()
        if monitor.isPaused || !monitor.isCalibrated {
            monitor.camera.stop()
        }
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
            if let button = pauseMenuItem.view?.subviews.first as? NSButton {
                button.title = "Resume"
            }
            updateIcon(nil)
            statusMenuItem.title = "Paused"
        } else {
            if let button = pauseMenuItem.view?.subviews.first as? NSButton {
                button.title = "Pause"
            }
        }
    }

    // MARK: - Calibration

    private func startCalibration() {
        pwLog("startCalibration called")
        statusMenuItem.title = "Calibrating... sit up straight"
        updateIcon(nil)

        monitor.calibrate { [weak self] success in
            pwLog("Calibration completion: \(success)")
            if success {
                self?.monitor.startMonitoring()
                self?.updateStatus("Monitoring — Good posture", stats: nil)
                self?.updateIcon(.good)
            } else {
                self?.statusMenuItem.title = "Calibration failed — click Recalibrate"
                self?.updateIcon(nil)
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
        overlayView?.postureStatus = status
    }

    func calibrationDidUpdate(message: String) {
        statusMenuItem.title = message
    }

    func liveAnalysisResult(_ result: PoseAnalysisResult?, status: PostureStatus?) {
        // Called on main thread from PostureMonitor
        overlayView?.landmarks = result?.landmarks
        if let status {
            overlayView?.postureStatus = status
            // Color the preview border to show status
            let color = colors[status] ?? grayColor
            previewMenuItem.view?.layer?.borderColor = color.cgColor
            previewMenuItem.view?.layer?.borderWidth = 3
        } else {
            previewMenuItem.view?.layer?.borderWidth = 0
        }
        overlayView?.display() // Force redraw in NSMenu context
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

// MARK: - NSMenuDelegate

extension StatusBarController: NSMenuDelegate {
    func menuWillOpen(_ menu: NSMenu) {
        startPreview()
    }

    func menuDidClose(_ menu: NSMenu) {
        stopPreview()
    }
}

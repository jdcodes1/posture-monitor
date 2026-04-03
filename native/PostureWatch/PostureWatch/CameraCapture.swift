import AVFoundation

class CameraCapture: NSObject {
    private(set) var captureSession: AVCaptureSession?
    private let queue = DispatchQueue(label: "com.posturewatch.camera")
    private var _latestFrame: CVPixelBuffer?
    private let lock = NSLock()
    private(set) var isRunning = false

    /// Thread-safe access to the latest frame
    var latestFrame: CVPixelBuffer? {
        lock.lock()
        defer { lock.unlock() }
        return _latestFrame
    }

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

    /// Start the camera. Can be called from any thread.
    func start(completion: ((Bool) -> Void)? = nil) {
        if isRunning {
            completion?(true)
            return
        }
        if captureSession == nil {
            guard setupSession() else {
                completion?(false)
                return
            }
        }
        // startRunning blocks, so do it off main thread
        queue.async { [weak self] in
            self?.captureSession?.startRunning()
            DispatchQueue.main.async {
                self?.isRunning = true
                completion?(true)
            }
        }
    }

    /// Stop the camera.
    func stop() {
        queue.async { [weak self] in
            self?.captureSession?.stopRunning()
            DispatchQueue.main.async {
                self?.isRunning = false
            }
        }
    }

    /// Wait up to `timeout` seconds for a valid frame. Camera must be started.
    func waitForFrame(timeout: TimeInterval = 3.0) -> CVPixelBuffer? {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let frame = latestFrame {
                return frame
            }
            Thread.sleep(forTimeInterval: 0.05)
        }
        return nil
    }

    private func setupSession() -> Bool {
        let session = AVCaptureSession()
        session.sessionPreset = .medium

        // Try front camera first, then any camera
        let device: AVCaptureDevice?
        if let front = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) {
            device = front
        } else {
            device = AVCaptureDevice.default(for: .video)
        }

        guard let device, let input = try? AVCaptureDeviceInput(device: device) else {
            NSLog("[PostureWatch] No camera device found")
            return false
        }

        let output = AVCaptureVideoDataOutput()
        output.setSampleBufferDelegate(self, queue: queue)
        output.alwaysDiscardsLateVideoFrames = true

        guard session.canAddInput(input), session.canAddOutput(output) else {
            NSLog("[PostureWatch] Cannot configure capture session")
            return false
        }

        session.addInput(input)
        session.addOutput(output)

        captureSession = session
        NSLog("[PostureWatch] Camera session configured")
        return true
    }
}

extension CameraCapture: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lock.lock()
        _latestFrame = pixelBuffer
        lock.unlock()
    }
}

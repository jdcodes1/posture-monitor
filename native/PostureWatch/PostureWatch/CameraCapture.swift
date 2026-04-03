import AVFoundation

class CameraCapture: NSObject {
    private var captureSession: AVCaptureSession?
    private let queue = DispatchQueue(label: "com.posturewatch.camera")
    private var latestFrame: CVPixelBuffer?
    private var frameSemaphore = DispatchSemaphore(value: 0)
    private var isRunning = false

    /// The capture session, for attaching a preview layer
    var session: AVCaptureSession? { captureSession }

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

    /// Start the camera session (keeps running for preview + frame capture)
    func start() -> Bool {
        if isRunning { return true }
        if captureSession == nil {
            guard setupSession() else { return false }
        }
        captureSession?.startRunning()
        isRunning = true
        return true
    }

    /// Stop the camera session
    func stop() {
        captureSession?.stopRunning()
        isRunning = false
    }

    /// Get the most recent frame (camera must be started first)
    func getLatestFrame() -> CVPixelBuffer? {
        guard isRunning else { return nil }
        // Wait briefly for a fresh frame
        latestFrame = nil
        let result = frameSemaphore.wait(timeout: .now() + 2.0)
        if result == .timedOut { return nil }
        return latestFrame
    }

    /// Capture a single frame (starts camera, grabs frame, stops camera)
    func captureFrame() -> CVPixelBuffer? {
        let wasRunning = isRunning
        if !wasRunning {
            guard start() else { return nil }
            // Wait for camera to warm up
            Thread.sleep(forTimeInterval: 0.3)
        }

        let frame = getLatestFrame()

        if !wasRunning {
            stop()
        }
        return frame
    }

    private func setupSession() -> Bool {
        let session = AVCaptureSession()
        session.sessionPreset = .medium

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
        return true
    }
}

extension CameraCapture: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        latestFrame = pixelBuffer
        frameSemaphore.signal()
    }
}

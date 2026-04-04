import AVFoundation

class CameraCapture: NSObject {
    private(set) var captureSession: AVCaptureSession?
    private let captureQueue = DispatchQueue(label: "com.posturewatch.camera")
    private(set) var isRunning = false

    /// Called on every frame with the pixel buffer. Set this to process frames.
    /// Called on captureQueue (background thread). Buffer is only valid during the call.
    var onFrame: ((CVPixelBuffer) -> Void)?

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

    func start(completion: ((Bool) -> Void)? = nil) {
        if isRunning {
            completion?(true)
            return
        }
        if captureSession == nil {
            guard setupSession() else {
                pwLog(" Failed to setup camera session")
                completion?(false)
                return
            }
        }
        captureQueue.async { [weak self] in
            self?.captureSession?.startRunning()
            let running = self?.captureSession?.isRunning ?? false
            pwLog(" Camera startRunning completed, isRunning: \(running)")
            DispatchQueue.main.async {
                self?.isRunning = running
                completion?(running)
            }
        }
    }

    func stop() {
        captureQueue.async { [weak self] in
            self?.captureSession?.stopRunning()
            DispatchQueue.main.async {
                self?.isRunning = false
            }
        }
    }

    private func setupSession() -> Bool {
        let session = AVCaptureSession()
        session.sessionPreset = .high // Higher quality for better pose detection

        // Try front camera first, then any camera
        let device: AVCaptureDevice?
        if let front = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) {
            device = front
            pwLog(" Using front camera")
        } else if let any = AVCaptureDevice.default(for: .video) {
            device = any
            pwLog(" Using default camera")
        } else {
            device = nil
        }

        guard let device, let input = try? AVCaptureDeviceInput(device: device) else {
            pwLog(" No camera device found")
            return false
        }

        let output = AVCaptureVideoDataOutput()
        output.setSampleBufferDelegate(self, queue: captureQueue)
        output.alwaysDiscardsLateVideoFrames = true
        // Use 32BGRA format which Vision framework prefers
        output.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]

        guard session.canAddInput(input), session.canAddOutput(output) else {
            pwLog(" Cannot add input/output to session")
            return false
        }

        session.addInput(input)
        session.addOutput(output)

        captureSession = session
        pwLog(" Camera session configured successfully")
        return true
    }
}

extension CameraCapture: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        // Call the frame handler — buffer is valid only during this callback
        onFrame?(pixelBuffer)
    }
}

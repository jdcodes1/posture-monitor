import AVFoundation

class CameraCapture: NSObject {
    private var captureSession: AVCaptureSession?
    private let queue = DispatchQueue(label: "com.posturewatch.camera")
    private var capturedFrame: CVPixelBuffer?
    private var frameSemaphore = DispatchSemaphore(value: 0)

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

    func captureFrame() -> CVPixelBuffer? {
        if captureSession == nil {
            guard setupSession() else { return nil }
        }

        capturedFrame = nil
        captureSession?.startRunning()

        let result = frameSemaphore.wait(timeout: .now() + 3.0)
        captureSession?.stopRunning()

        if result == .timedOut { return nil }
        return capturedFrame
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
        guard capturedFrame == nil,
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        capturedFrame = pixelBuffer
        frameSemaphore.signal()
    }
}

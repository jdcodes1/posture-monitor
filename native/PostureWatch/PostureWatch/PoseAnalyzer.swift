import Vision
import AppKit

enum PostureStatus: String {
    case good, warn, bad
}

struct PoseMetrics {
    let earShoulderDist: CGFloat
    let headHeight: CGFloat
    let shoulderTilt: CGFloat
    let noseShoulderDist: CGFloat
}

/// Detected landmark positions in normalized coordinates (0-1, origin bottom-left)
struct PoseLandmarks {
    let nose: CGPoint
    let leftEar: CGPoint
    let rightEar: CGPoint
    let leftShoulder: CGPoint
    let rightShoulder: CGPoint
    let leftElbow: CGPoint?
    let rightElbow: CGPoint?
    let leftHip: CGPoint?
    let rightHip: CGPoint?
}

struct PoseAnalysisResult {
    let metrics: PoseMetrics
    let landmarks: PoseLandmarks
}

class PoseAnalyzer {

    func analyze(pixelBuffer: CVPixelBuffer) -> PoseAnalysisResult? {
        let w = CVPixelBufferGetWidth(pixelBuffer)
        let h = CVPixelBufferGetHeight(pixelBuffer)

        let request = VNDetectHumanBodyPoseRequest()
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])

        do {
            try handler.perform([request])
        } catch {
            pwLog("Vision perform failed: \(error)")
            return nil
        }

        let count = request.results?.count ?? 0
        if count == 0 {
            // Fallback: try face detection for basic posture tracking
            return analyzeFallback(pixelBuffer: pixelBuffer, width: w, height: h)
        }

        guard let observation = request.results?.first else { return nil }

        do {
            let nose = try observation.recognizedPoint(.nose)
            let leftEar = try observation.recognizedPoint(.leftEar)
            let rightEar = try observation.recognizedPoint(.rightEar)
            let leftShoulder = try observation.recognizedPoint(.leftShoulder)
            let rightShoulder = try observation.recognizedPoint(.rightShoulder)

            let minConfidence: Float = 0.3
            guard nose.confidence > minConfidence,
                  leftEar.confidence > minConfidence || rightEar.confidence > minConfidence,
                  leftShoulder.confidence > minConfidence,
                  rightShoulder.confidence > minConfidence else {
                return nil
            }

            let earMidY = (leftEar.location.y + rightEar.location.y) / 2
            let shoulderMidY = (leftShoulder.location.y + rightShoulder.location.y) / 2

            let metrics = PoseMetrics(
                earShoulderDist: shoulderMidY - earMidY,
                headHeight: nose.location.y,
                shoulderTilt: abs(leftShoulder.location.y - rightShoulder.location.y),
                noseShoulderDist: shoulderMidY - nose.location.y
            )

            // Optional landmarks for visualization
            let leftElbow = try? observation.recognizedPoint(.leftElbow)
            let rightElbow = try? observation.recognizedPoint(.rightElbow)
            let leftHip = try? observation.recognizedPoint(.leftHip)
            let rightHip = try? observation.recognizedPoint(.rightHip)

            let landmarks = PoseLandmarks(
                nose: nose.location,
                leftEar: leftEar.location,
                rightEar: rightEar.location,
                leftShoulder: leftShoulder.location,
                rightShoulder: rightShoulder.location,
                leftElbow: leftElbow?.confidence ?? 0 > minConfidence ? leftElbow?.location : nil,
                rightElbow: rightElbow?.confidence ?? 0 > minConfidence ? rightElbow?.location : nil,
                leftHip: leftHip?.confidence ?? 0 > minConfidence ? leftHip?.location : nil,
                rightHip: rightHip?.confidence ?? 0 > minConfidence ? rightHip?.location : nil
            )

            return PoseAnalysisResult(metrics: metrics, landmarks: landmarks)
        } catch {
            return nil
        }
    }

    /// Fallback: use face detection to estimate posture from face position/size
    private func analyzeFallback(pixelBuffer: CVPixelBuffer, width: Int, height: Int) -> PoseAnalysisResult? {
        let faceRequest = VNDetectFaceRectanglesRequest()
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])

        do {
            try handler.perform([faceRequest])
        } catch {
            return nil
        }

        guard let face = faceRequest.results?.first else {
            pwLog("Vision fallback: no face detected (frame \(width)x\(height))")
            return nil
        }

        let bbox = face.boundingBox
        // Use face position as proxy for posture:
        // - headHeight: face center Y (lower = slouching)
        // - earShoulderDist: face height (smaller = further away / slouching)
        // - shoulderTilt: 0 (can't measure from face alone)
        // - noseShoulderDist: face center Y (same as headHeight for fallback)
        let faceCenterY = bbox.origin.y + bbox.height / 2
        let faceHeight = bbox.height

        let metrics = PoseMetrics(
            earShoulderDist: faceHeight,
            headHeight: faceCenterY,
            shoulderTilt: 0,
            noseShoulderDist: faceCenterY
        )

        // Approximate landmark positions from face bbox for visualization
        let landmarks = PoseLandmarks(
            nose: CGPoint(x: bbox.midX, y: bbox.origin.y + bbox.height * 0.35),
            leftEar: CGPoint(x: bbox.origin.x, y: bbox.midY),
            rightEar: CGPoint(x: bbox.maxX, y: bbox.midY),
            leftShoulder: CGPoint(x: bbox.origin.x - bbox.width * 0.3, y: bbox.origin.y - bbox.height * 0.5),
            rightShoulder: CGPoint(x: bbox.maxX + bbox.width * 0.3, y: bbox.origin.y - bbox.height * 0.5),
            leftElbow: nil,
            rightElbow: nil,
            leftHip: nil,
            rightHip: nil
        )

        pwLog("Vision fallback: face detected at y=\(String(format: "%.3f", faceCenterY)) h=\(String(format: "%.3f", faceHeight))")

        return PoseAnalysisResult(metrics: metrics, landmarks: landmarks)
    }

    func compare(current: PoseMetrics, baseline: PoseMetrics, sensitivity: CGFloat) -> PostureStatus {
        let thresholdMult = 2.0 - sensitivity * 2.0

        var score: CGFloat = 0
        var factors: CGFloat = 0

        let headDrop = current.headHeight - baseline.headHeight
        if headDrop > 0.04 * thresholdMult { score += 2 }
        else if headDrop > 0.02 * thresholdMult { score += 1 }
        factors += 2

        let distDiff = baseline.earShoulderDist - current.earShoulderDist
        if distDiff > 0.03 * thresholdMult { score += 2 }
        else if distDiff > 0.015 * thresholdMult { score += 1 }
        factors += 2

        let noseDiff = baseline.noseShoulderDist - current.noseShoulderDist
        if noseDiff > 0.03 * thresholdMult { score += 2 }
        else if noseDiff > 0.015 * thresholdMult { score += 1 }
        factors += 2

        let tiltDiff = current.shoulderTilt - baseline.shoulderTilt
        if tiltDiff > 0.03 * thresholdMult { score += 1 }
        factors += 1

        let ratio = score / factors
        if ratio >= 0.5 { return .bad }
        if ratio >= 0.25 { return .warn }
        return .good
    }

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

import Vision
import CoreImage

enum PostureStatus: String {
    case good, warn, bad
}

struct PoseMetrics {
    let earShoulderDist: CGFloat
    let headHeight: CGFloat
    let shoulderTilt: CGFloat
    let noseShoulderDist: CGFloat
}

class PoseAnalyzer {

    func analyze(pixelBuffer: CVPixelBuffer) -> PoseMetrics? {
        let request = VNDetectHumanBodyPoseRequest()
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])

        do {
            try handler.perform([request])
        } catch {
            return nil
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

            return PoseMetrics(
                earShoulderDist: shoulderMidY - earMidY,
                headHeight: nose.location.y,
                shoulderTilt: abs(leftShoulder.location.y - rightShoulder.location.y),
                noseShoulderDist: shoulderMidY - nose.location.y
            )
        } catch {
            return nil
        }
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

import Cocoa

/// Draws pose landmarks and connections on top of the camera preview.
class PoseOverlayView: NSView {
    var landmarks: PoseLandmarks? {
        didSet { needsDisplay = true }
    }
    var postureStatus: PostureStatus = .good {
        didSet { needsDisplay = true }
    }

    private let statusColors: [PostureStatus: NSColor] = [
        .good: NSColor(red: 62/255, green: 232/255, blue: 165/255, alpha: 1),
        .warn: NSColor(red: 245/255, green: 200/255, blue: 66/255, alpha: 1),
        .bad: NSColor(red: 245/255, green: 86/255, blue: 74/255, alpha: 1),
    ]

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        guard let landmarks, let ctx = NSGraphicsContext.current?.cgContext else { return }

        let color = statusColors[postureStatus] ?? statusColors[.good]!
        let w = bounds.width
        let h = bounds.height

        // Vision coordinates: origin bottom-left, 0-1 normalized
        // NSView coordinates: origin bottom-left (same!)
        // But camera is mirrored, so flip X: x -> (1 - x)
        func pt(_ p: CGPoint) -> CGPoint {
            CGPoint(x: (1 - p.x) * w, y: p.y * h)
        }

        // Draw connections
        ctx.setStrokeColor(color.withAlphaComponent(0.6).cgColor)
        ctx.setLineWidth(2)

        let connections: [(CGPoint, CGPoint?)] = [
            // Head
            (landmarks.nose, landmarks.leftEar),
            (landmarks.nose, landmarks.rightEar),
            (landmarks.leftEar, landmarks.rightEar),
            // Shoulders
            (landmarks.leftShoulder, landmarks.rightShoulder),
            // Arms (optional)
            (landmarks.leftShoulder, landmarks.leftElbow),
            (landmarks.rightShoulder, landmarks.rightElbow),
            // Torso (optional)
            (landmarks.leftShoulder, landmarks.leftHip),
            (landmarks.rightShoulder, landmarks.rightHip),
        ]

        for (from, to) in connections {
            guard let to else { continue }
            let a = pt(from)
            let b = pt(to)
            ctx.move(to: a)
            ctx.addLine(to: b)
        }
        // Hip connection
        if let lh = landmarks.leftHip, let rh = landmarks.rightHip {
            ctx.move(to: pt(lh))
            ctx.addLine(to: pt(rh))
        }
        ctx.strokePath()

        // Draw key points
        let keyPoints: [CGPoint?] = [
            landmarks.nose,
            landmarks.leftEar,
            landmarks.rightEar,
            landmarks.leftShoulder,
            landmarks.rightShoulder,
            landmarks.leftElbow,
            landmarks.rightElbow,
            landmarks.leftHip,
            landmarks.rightHip,
        ]

        ctx.setFillColor(color.cgColor)
        for point in keyPoints {
            guard let point else { continue }
            let p = pt(point)
            ctx.fillEllipse(in: CGRect(x: p.x - 4, y: p.y - 4, width: 8, height: 8))
        }
    }
}

export type PostureStatus = 'good' | 'warn' | 'bad';

export interface PoseMetrics {
  earShoulderDist: number;
  forwardLean: number;
  headHeight: number;
  shoulderTilt: number;
  noseShoulderDist: number;
}

export interface PoseResult extends PoseMetrics {
  landmarks: Array<{ x: number; y: number; z: number; visibility?: number }>;
}

/**
 * Extract pose metrics from MediaPipe landmarks.
 * Landmarks: 0=nose, 7=leftEar, 8=rightEar, 11=leftShoulder, 12=rightShoulder
 */
export function extractMetrics(
  landmarks: Array<{ x: number; y: number; z: number }>
): PoseResult {
  const nose = landmarks[0];
  const leftEar = landmarks[7];
  const rightEar = landmarks[8];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  const earMidY = (leftEar.y + rightEar.y) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;

  return {
    earShoulderDist: shoulderMidY - earMidY,
    forwardLean: earMidY - shoulderMidY,
    headHeight: nose.y,
    shoulderTilt: Math.abs(leftShoulder.y - rightShoulder.y),
    noseShoulderDist: shoulderMidY - nose.y,
    landmarks,
  };
}

/**
 * Compare current pose to calibrated baseline.
 * Returns 'good', 'warn', or 'bad'.
 */
export function compareToBaseline(
  current: PoseMetrics,
  baseline: PoseMetrics,
  sensitivity: number // 0.3 = relaxed, 0.5 = normal, 0.7 = strict
): PostureStatus {
  const thresholdMult = 2.0 - sensitivity * 2.0;

  let score = 0;
  let factors = 0;

  // Head dropped (headHeight increased = lower in frame)
  const headDrop = current.headHeight - baseline.headHeight;
  if (headDrop > 0.04 * thresholdMult) score += 2;
  else if (headDrop > 0.02 * thresholdMult) score += 1;
  factors += 2;

  // Ear-shoulder distance decreased (slouching compresses this)
  const distDiff = baseline.earShoulderDist - current.earShoulderDist;
  if (distDiff > 0.03 * thresholdMult) score += 2;
  else if (distDiff > 0.015 * thresholdMult) score += 1;
  factors += 2;

  // Nose-shoulder distance decreased
  const noseDiff = baseline.noseShoulderDist - current.noseShoulderDist;
  if (noseDiff > 0.03 * thresholdMult) score += 2;
  else if (noseDiff > 0.015 * thresholdMult) score += 1;
  factors += 2;

  // Shoulder tilt increased
  const tiltDiff = current.shoulderTilt - baseline.shoulderTilt;
  if (tiltDiff > 0.03 * thresholdMult) score += 1;
  factors += 1;

  const ratio = score / factors;
  if (ratio >= 0.5) return 'bad';
  if (ratio >= 0.25) return 'warn';
  return 'good';
}

/**
 * Average multiple pose samples into a single baseline.
 */
export function averageSamples(samples: PoseMetrics[]): PoseMetrics {
  const n = samples.length;
  return {
    earShoulderDist: samples.reduce((s, p) => s + p.earShoulderDist, 0) / n,
    forwardLean: samples.reduce((s, p) => s + p.forwardLean, 0) / n,
    headHeight: samples.reduce((s, p) => s + p.headHeight, 0) / n,
    shoulderTilt: samples.reduce((s, p) => s + p.shoulderTilt, 0) / n,
    noseShoulderDist: samples.reduce((s, p) => s + p.noseShoulderDist, 0) / n,
  };
}

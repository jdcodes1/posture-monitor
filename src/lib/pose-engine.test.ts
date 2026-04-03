import { describe, it, expect } from 'vitest';
import { compareToBaseline, averageSamples, type PoseMetrics } from './pose-engine';

const baseline: PoseMetrics = {
  earShoulderDist: 0.15,
  headHeight: 0.3,
  shoulderTilt: 0.01,
  noseShoulderDist: 0.18,
};

describe('compareToBaseline', () => {
  it('returns good when current matches baseline', () => {
    expect(compareToBaseline(baseline, baseline, 0.5)).toBe('good');
  });

  it('returns bad when head drops significantly', () => {
    const slouched: PoseMetrics = {
      ...baseline,
      headHeight: baseline.headHeight + 0.08,
      earShoulderDist: baseline.earShoulderDist - 0.06,
      noseShoulderDist: baseline.noseShoulderDist - 0.06,
    };
    expect(compareToBaseline(slouched, baseline, 0.5)).toBe('bad');
  });

  it('returns warn for moderate deviation', () => {
    const slipping: PoseMetrics = {
      ...baseline,
      headHeight: baseline.headHeight + 0.03,
      earShoulderDist: baseline.earShoulderDist - 0.02,
      noseShoulderDist: baseline.noseShoulderDist - 0.02,
    };
    expect(compareToBaseline(slipping, baseline, 0.5)).toBe('warn');
  });

  it('relaxed sensitivity is more tolerant', () => {
    const slipping: PoseMetrics = {
      ...baseline,
      headHeight: baseline.headHeight + 0.03,
      earShoulderDist: baseline.earShoulderDist - 0.02,
      noseShoulderDist: baseline.noseShoulderDist - 0.02,
    };
    expect(compareToBaseline(slipping, baseline, 0.3)).toBe('good');
  });
});

describe('averageSamples', () => {
  it('averages multiple pose samples', () => {
    const samples: PoseMetrics[] = [
      { earShoulderDist: 0.1, headHeight: 0.3, shoulderTilt: 0.01, noseShoulderDist: 0.2 },
      { earShoulderDist: 0.2, headHeight: 0.4, shoulderTilt: 0.03, noseShoulderDist: 0.3 },
    ];
    const avg = averageSamples(samples);
    expect(avg.earShoulderDist).toBeCloseTo(0.15);
    expect(avg.headHeight).toBeCloseTo(0.35);
  });
});

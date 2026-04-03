import { describe, it, expect } from 'vitest';
import { MonitorState } from './monitor-controller';

describe('MonitorState', () => {
  it('starts in idle state', () => {
    const state = new MonitorState();
    expect(state.status).toBe('idle');
  });

  it('transitions to monitoring after calibration', () => {
    const state = new MonitorState();
    state.calibrate({ earShoulderDist: 0.15, forwardLean: -0.15, headHeight: 0.3, shoulderTilt: 0.01, noseShoulderDist: 0.18 });
    expect(state.status).toBe('calibrated');
    state.start();
    expect(state.status).toBe('monitoring');
  });

  it('tracks away state after 3 missed detections', () => {
    const state = new MonitorState();
    state.calibrate({ earShoulderDist: 0.15, forwardLean: -0.15, headHeight: 0.3, shoulderTilt: 0.01, noseShoulderDist: 0.18 });
    state.start();
    state.recordMiss();
    state.recordMiss();
    expect(state.isAway).toBe(false);
    state.recordMiss();
    expect(state.isAway).toBe(true);
  });

  it('resets away state on successful detection', () => {
    const state = new MonitorState();
    state.calibrate({ earShoulderDist: 0.15, forwardLean: -0.15, headHeight: 0.3, shoulderTilt: 0.01, noseShoulderDist: 0.18 });
    state.start();
    state.recordMiss();
    state.recordMiss();
    state.recordMiss();
    expect(state.isAway).toBe(true);
    state.recordHit('good');
    expect(state.isAway).toBe(false);
  });

  it('tracks session stats correctly', () => {
    const state = new MonitorState();
    state.calibrate({ earShoulderDist: 0.15, forwardLean: -0.15, headHeight: 0.3, shoulderTilt: 0.01, noseShoulderDist: 0.18 });
    state.start();
    state.recordHit('good');
    state.recordHit('good');
    state.recordHit('bad');
    expect(state.stats.checks).toBe(3);
    expect(state.stats.good).toBe(2);
    expect(state.stats.streak).toBe(0);
  });

  it('calculates score correctly', () => {
    const state = new MonitorState();
    state.calibrate({ earShoulderDist: 0.15, forwardLean: -0.15, headHeight: 0.3, shoulderTilt: 0.01, noseShoulderDist: 0.18 });
    state.start();
    state.recordHit('good');
    state.recordHit('good');
    state.recordHit('bad');
    expect(state.score).toBe(67);
  });

  it('calculates effective interval with away and low battery', () => {
    const state = new MonitorState();
    state.calibrate({ earShoulderDist: 0.15, forwardLean: -0.15, headHeight: 0.3, shoulderTilt: 0.01, noseShoulderDist: 0.18 });
    state.start();
    expect(state.getEffectiveInterval(30, false)).toBe(30);
    state.recordMiss(); state.recordMiss(); state.recordMiss();
    expect(state.getEffectiveInterval(30, false)).toBe(60); // away doubles
    expect(state.getEffectiveInterval(30, true)).toBe(120); // away + low battery quadruples
  });
});

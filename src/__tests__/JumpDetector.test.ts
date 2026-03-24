import { describe, it, expect, beforeEach } from 'vitest';
import { JumpDetector } from '../core/filters/JumpDetector.js';

const DT = 0.01; // 100 Hz sensor

// Normal riding: magnitude ≈ 9.81 m/s²
const GROUNDED = { x: 0, y: 9.81, z: 0 };

// Free-fall: magnitude ≈ 0.5 m/s²
const FREE_FALL = { x: 0, y: 0.3, z: 0 };

// Pop spike before ollie: magnitude >> 9.81
const POP_SPIKE = { x: 0, y: 20.0, z: 0 };

describe('JumpDetector', () => {
  let detector: JumpDetector;

  beforeEach(() => {
    // threshold=3.0 m/s², require 2 consecutive frames
    detector = new JumpDetector(3.0, 2);
  });

  // ---------------------------------------------------------------------------
  // Grounded state
  // ---------------------------------------------------------------------------

  describe('grounded state', () => {
    it('is not airborne at rest', () => {
      const r = detector.detect(GROUNDED, DT);
      expect(r.airborne).toBe(false);
      expect(r.justLaunched).toBe(false);
    });

    it('is not airborne during normal riding vibration', () => {
      const vibration = { x: 0.5, y: 9.5, z: 0.3 }; // still above threshold
      expect(detector.detect(vibration, DT).airborne).toBe(false);
    });

    it('single free-fall frame does not trigger airborne', () => {
      expect(detector.detect(FREE_FALL, DT).airborne).toBe(false);
      // Back to ground resets counter
      expect(detector.detect(GROUNDED, DT).airborne).toBe(false);
    });

    it('non-consecutive free-fall frames do not trigger', () => {
      detector.detect(FREE_FALL, DT);  // frame 1: counter=1
      detector.detect(GROUNDED, DT);  // resets counter
      detector.detect(FREE_FALL, DT); // counter=1 again, not 2
      expect(detector.detect(GROUNDED, DT).airborne).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Jump detection
  // ---------------------------------------------------------------------------

  describe('jump detection', () => {
    it('becomes airborne after N consecutive free-fall frames', () => {
      detector.detect(FREE_FALL, DT); // frame 1
      const r = detector.detect(FREE_FALL, DT); // frame 2 → confirmed
      expect(r.airborne).toBe(true);
    });

    it('justLaunched is true only on the first airborne frame', () => {
      detector.detect(FREE_FALL, DT);
      const launch = detector.detect(FREE_FALL, DT);
      expect(launch.justLaunched).toBe(true);

      // Subsequent airborne frames: still airborne, not justLaunched
      const cont = detector.detect(FREE_FALL, DT);
      expect(cont.airborne).toBe(true);
      expect(cont.justLaunched).toBe(false);
    });

    it('stays airborne across multiple free-fall frames', () => {
      detector.detect(FREE_FALL, DT);
      detector.detect(FREE_FALL, DT); // confirmed
      for (let i = 0; i < 10; i++) {
        expect(detector.detect(FREE_FALL, DT).airborne).toBe(true);
      }
    });

    it('with requiredFrames=1 triggers immediately on first free-fall', () => {
      const d = new JumpDetector(3.0, 1);
      expect(d.detect(FREE_FALL, DT).airborne).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Landing detection
  // ---------------------------------------------------------------------------

  describe('landing detection', () => {
    function getAirborne(): JumpDetector {
      detector.detect(FREE_FALL, DT);
      detector.detect(FREE_FALL, DT);
      expect(detector.detect(FREE_FALL, DT).airborne).toBe(true);
      return detector;
    }

    it('transitions back to grounded on impact', () => {
      getAirborne();
      const r = detector.detect(GROUNDED, DT);
      expect(r.airborne).toBe(false);
    });

    it('can detect a second jump after landing', () => {
      getAirborne();
      detector.detect(GROUNDED, DT); // land
      // New jump
      detector.detect(FREE_FALL, DT);
      const r = detector.detect(FREE_FALL, DT);
      expect(r.airborne).toBe(true);
      expect(r.justLaunched).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Height estimation
  // ---------------------------------------------------------------------------

  describe('height estimation', () => {
    it('estimatedHeight is positive when jump is detected', () => {
      detector.detect(FREE_FALL, DT);
      const r = detector.detect(FREE_FALL, DT);
      expect(r.estimatedHeight).toBeGreaterThan(0);
    });

    it('estimatedHeight is within clamped range [0.1, 2.0]', () => {
      detector.detect(FREE_FALL, DT);
      const r = detector.detect(FREE_FALL, DT);
      expect(r.estimatedHeight).toBeGreaterThanOrEqual(0.1);
      expect(r.estimatedHeight).toBeLessThanOrEqual(2.0);
    });

    it('higher pop spike produces larger estimated height', () => {
      // The estimator uses: h = ((peakAccel - g) * dt)² / (2g) * scale
      // With tiny dt (0.01s) both values clamp to minimum — use a larger dt
      // that represents a longer-duration pop impulse (realistic: 0.1–0.3s).
      const DT_POP = 0.3;
      const dLow  = new JumpDetector(3.0, 1);
      const dHigh = new JumpDetector(3.0, 1);

      dLow.detect(  { x: 0, y: 12, z: 0 }, DT_POP);
      const rLow  = dLow.detect(FREE_FALL, DT_POP);

      dHigh.detect( { x: 0, y: 22, z: 0 }, DT_POP);
      const rHigh = dHigh.detect(FREE_FALL, DT_POP);

      expect(rHigh.estimatedHeight).toBeGreaterThan(rLow.estimatedHeight);
    });
  });

  // ---------------------------------------------------------------------------
  // reset()
  // ---------------------------------------------------------------------------

  describe('reset()', () => {
    it('clears airborne state', () => {
      detector.detect(FREE_FALL, DT);
      detector.detect(FREE_FALL, DT); // airborne
      detector.reset();
      expect(detector.detect(FREE_FALL, DT).airborne).toBe(false);
    });

    it('clears consecutive frame counter', () => {
      detector.detect(FREE_FALL, DT); // counter = 1
      detector.reset();
      // After reset, 1 frame should not be enough
      expect(detector.detect(FREE_FALL, DT).airborne).toBe(false);
    });

    it('clears peak accel tracking', () => {
      // Prime with a high pop spike
      detector.detect(POP_SPIKE, DT);
      detector.reset();
      // Now jump without a spike — height should be minimal
      detector.detect(FREE_FALL, DT);
      const r = detector.detect(FREE_FALL, DT);
      expect(r.estimatedHeight).toBe(0.1); // clamped to minimum
    });
  });
});

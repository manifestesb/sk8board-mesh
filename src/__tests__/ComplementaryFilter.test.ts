import { describe, it, expect, beforeEach } from 'vitest';
import { ComplementaryFilter } from '../filters/ComplementaryFilter.js';

const G = 9.81; // gravity m/s²

// Flat board at rest: all gravity on Y axis
const REST = { x: 0, y: G, z: 0 };
const ZERO_GYRO = { x: 0, y: 0, z: 0 };

describe('ComplementaryFilter', () => {
  let filter: ComplementaryFilter;

  beforeEach(() => {
    filter = new ComplementaryFilter();
  });

  // ---------------------------------------------------------------------------
  // At rest
  // ---------------------------------------------------------------------------

  describe('at rest (flat board, no motion)', () => {
    it('returns zero roll when board is level', () => {
      const r = filter.update(REST, ZERO_GYRO, 0.01);
      expect(r.roll).toBeCloseTo(0, 4);
    });

    it('returns zero pitch when board is level', () => {
      const r = filter.update(REST, ZERO_GYRO, 0.01);
      expect(r.pitch).toBeCloseTo(0, 4);
    });

    it('returns zero yaw at start', () => {
      const r = filter.update(REST, ZERO_GYRO, 0.01);
      expect(r.yaw).toBeCloseTo(0, 4);
    });
  });

  // ---------------------------------------------------------------------------
  // Accelerometer-driven angles (alpha = 0 → trust accel 100%)
  // ---------------------------------------------------------------------------

  describe('accelerometer tilt detection (alpha=0)', () => {
    beforeEach(() => {
      filter = new ComplementaryFilter(0); // trust accel only
    });

    it('detects lateral roll from accel.x', () => {
      const angle = Math.PI / 6; // 30°
      const r = filter.update(
        { x: Math.sin(angle) * G, y: Math.cos(angle) * G, z: 0 },
        ZERO_GYRO,
        0.01,
      );
      expect(r.roll).toBeCloseTo(angle, 3);
    });

    it('detects pitch from accel.z', () => {
      const angle = Math.PI / 8; // 22.5°
      const r = filter.update(
        { x: 0, y: Math.cos(angle) * G, z: Math.sin(angle) * G },
        ZERO_GYRO,
        0.01,
      );
      expect(r.pitch).toBeCloseTo(angle, 3);
    });

    it('negative roll for tilt in opposite direction', () => {
      const angle = Math.PI / 6;
      const r = filter.update(
        { x: -Math.sin(angle) * G, y: Math.cos(angle) * G, z: 0 },
        ZERO_GYRO,
        0.01,
      );
      expect(r.roll).toBeCloseTo(-angle, 3);
    });
  });

  // ---------------------------------------------------------------------------
  // Gyroscope integration (alpha = 1 → trust gyro 100%)
  // ---------------------------------------------------------------------------

  describe('gyroscope integration (alpha=1)', () => {
    beforeEach(() => {
      filter = new ComplementaryFilter(1); // trust gyro only
    });

    it('integrates roll from gyro.x over dt', () => {
      // 2 rad/s roll for 0.5s = 1 rad
      const r = filter.update(REST, { x: 2, y: 0, z: 0 }, 0.5);
      expect(r.roll).toBeCloseTo(1.0, 4);
    });

    it('integrates pitch from gyro.z over dt', () => {
      const r = filter.update(REST, { x: 0, y: 0, z: 3 }, 1.0);
      expect(r.pitch).toBeCloseTo(3.0, 4);
    });

    it('integrates yaw from gyro.y over dt', () => {
      const r = filter.update(REST, { x: 0, y: 1, z: 0 }, 1.0);
      expect(r.yaw).toBeCloseTo(1.0, 4);
    });

    it('accumulates yaw across multiple frames', () => {
      filter.update(REST, { x: 0, y: 1, z: 0 }, 1.0); // +1 rad
      const r = filter.update(REST, { x: 0, y: 1, z: 0 }, 1.0); // +1 rad
      expect(r.yaw).toBeCloseTo(2.0, 4);
    });
  });

  // ---------------------------------------------------------------------------
  // Complementary blend
  // ---------------------------------------------------------------------------

  describe('complementary blend (default alpha=0.96)', () => {
    it('result is between gyro-only and accel-only estimates', () => {
      const angle = Math.PI / 4;
      // Gyro says 0 (no rotation), accel says angle
      const r = filter.update(
        { x: Math.sin(angle) * G, y: Math.cos(angle) * G, z: 0 },
        ZERO_GYRO,
        0.01,
      );
      // With alpha=0.96: result = 0.96*gyro_estimate + 0.04*accel_estimate
      // gyro_estimate ≈ 0 (from previous state 0 + 0*dt)
      // accel_estimate = angle
      const expected = 0.96 * 0 + 0.04 * angle;
      expect(r.roll).toBeCloseTo(expected, 3);
    });

    it('converges toward accel angle over many frames (drift correction)', () => {
      const targetAngle = Math.PI / 6;
      const accel = { x: Math.sin(targetAngle) * G, y: Math.cos(targetAngle) * G, z: 0 };

      let result = { roll: 0, pitch: 0, yaw: 0 };
      for (let i = 0; i < 500; i++) {
        result = filter.update(accel, ZERO_GYRO, 0.01);
      }
      // After many frames with zero gyro, should converge close to accel angle
      expect(result.roll).toBeCloseTo(targetAngle, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // reset()
  // ---------------------------------------------------------------------------

  describe('reset()', () => {
    it('clears accumulated roll', () => {
      filter = new ComplementaryFilter(1);
      filter.update(REST, { x: 5, y: 0, z: 0 }, 1.0); // accumulate roll
      filter.reset();
      const r = filter.update(REST, ZERO_GYRO, 0.01);
      expect(r.roll).toBeCloseTo(0, 4);
    });

    it('clears accumulated yaw', () => {
      filter = new ComplementaryFilter(1);
      filter.update(REST, { x: 0, y: 2, z: 0 }, 1.0);
      filter.reset();
      const r = filter.update(REST, ZERO_GYRO, 0.01);
      expect(r.yaw).toBeCloseTo(0, 4);
    });
  });

  // ---------------------------------------------------------------------------
  // setAlpha()
  // ---------------------------------------------------------------------------

  describe('setAlpha()', () => {
    it('clamps alpha to [0, 1]', () => {
      filter.setAlpha(2.0);
      // With alpha=1 (clamped), gyro dominates — zero gyro means no change
      const r = filter.update(
        { x: Math.sin(Math.PI / 4) * G, y: Math.cos(Math.PI / 4) * G, z: 0 },
        ZERO_GYRO,
        0.01,
      );
      expect(r.roll).toBeCloseTo(0, 3); // gyro-only: stays at 0
    });

    it('alpha=0 makes filter fully trust accelerometer', () => {
      filter.setAlpha(0);
      const angle = Math.PI / 5;
      const r = filter.update(
        { x: Math.sin(angle) * G, y: Math.cos(angle) * G, z: 0 },
        ZERO_GYRO,
        0.01,
      );
      expect(r.roll).toBeCloseTo(angle, 3);
    });
  });
});

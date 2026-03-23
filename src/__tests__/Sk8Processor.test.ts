import { describe, it, expect, beforeEach } from 'vitest';
import { Sk8Processor } from '../Sk8Packet.js';
import type { RawSensorData } from '../types.js';

const G = 9.81;

/** Flat board at rest, no movement */
function makeRaw(overrides: Partial<RawSensorData & { speed: number }> = {}): RawSensorData & { speed: number } {
  return {
    accel: { x: 0, y: G, z: 0 },
    gyro:  { x: 0, y: 0, z: 0 },
    dt: 0.01,
    speed: 0,
    ...overrides,
  };
}

describe('Sk8Processor', () => {
  let proc: Sk8Processor;

  beforeEach(() => {
    proc = new Sk8Processor();
  });

  // ---------------------------------------------------------------------------
  // Output shape
  // ---------------------------------------------------------------------------

  describe('output shape', () => {
    it('returns all required SkateboardTick fields', () => {
      const tick = proc.process(makeRaw());
      expect(tick).toHaveProperty('roll');
      expect(tick).toHaveProperty('pitch');
      expect(tick).toHaveProperty('yaw');
      expect(tick).toHaveProperty('speed');
      expect(tick).toHaveProperty('airborne');
    });

    it('all numeric fields are finite numbers', () => {
      const tick = proc.process(makeRaw());
      expect(Number.isFinite(tick.roll)).toBe(true);
      expect(Number.isFinite(tick.pitch)).toBe(true);
      expect(Number.isFinite(tick.yaw)).toBe(true);
      expect(Number.isFinite(tick.speed)).toBe(true);
    });

    it('airborne is a boolean', () => {
      const tick = proc.process(makeRaw());
      expect(typeof tick.airborne).toBe('boolean');
    });
  });

  // ---------------------------------------------------------------------------
  // Gyro unit conversion
  // ---------------------------------------------------------------------------

  describe('gyroUnit conversion', () => {
    it('treats gyro as rad/s by default', () => {
      const proc = new Sk8Processor({ filterAlpha: 1 });
      const tick = proc.process(makeRaw({ gyro: { x: 0, y: 1, z: 0 }, dt: 1.0 }));
      expect(tick.yaw).toBeCloseTo(1.0, 3); // 1 rad/s × 1s = 1 rad
    });

    it('converts deg/s to rad/s when gyroUnit="deg/s"', () => {
      const proc = new Sk8Processor({ gyroUnit: 'deg/s', filterAlpha: 1 });
      // 180 deg/s × 1s = π rad
      const tick = proc.process(makeRaw({ gyro: { x: 0, y: 180, z: 0 }, dt: 1.0 }));
      expect(tick.yaw).toBeCloseTo(Math.PI, 3);
    });

    it('deg/s and rad/s give different outputs for same raw value', () => {
      const procRad = new Sk8Processor({ gyroUnit: 'rad/s',  filterAlpha: 1 });
      const procDeg = new Sk8Processor({ gyroUnit: 'deg/s',  filterAlpha: 1 });
      const raw = makeRaw({ gyro: { x: 0, y: 90, z: 0 }, dt: 1.0 });
      expect(procRad.process(raw).yaw).not.toBeCloseTo(procDeg.process(raw).yaw, 2);
    });
  });

  // ---------------------------------------------------------------------------
  // Tilt clamping
  // ---------------------------------------------------------------------------

  describe('maxTiltAngle clamping', () => {
    it('clamps roll to ±maxTiltAngle', () => {
      const max = Math.PI / 6; // 30°
      const proc = new Sk8Processor({ maxTiltAngle: max, filterAlpha: 0 });
      // Extreme lateral accel → extreme accel angle
      const tick = proc.process(makeRaw({ accel: { x: 100, y: 0.01, z: 0 } }));
      expect(tick.roll).toBeLessThanOrEqual(max + 1e-9);
      expect(tick.roll).toBeGreaterThanOrEqual(-max - 1e-9);
    });

    it('clamps pitch to ±maxTiltAngle', () => {
      const max = Math.PI / 6;
      const proc = new Sk8Processor({ maxTiltAngle: max, filterAlpha: 0 });
      const tick = proc.process(makeRaw({ accel: { x: 0, y: 0.01, z: 100 } }));
      expect(tick.pitch).toBeLessThanOrEqual(max + 1e-9);
    });

    it('does not clamp values within range', () => {
      const max = Math.PI / 4;
      const proc = new Sk8Processor({ maxTiltAngle: max, filterAlpha: 0 });
      const smallAngle = Math.PI / 8;
      const tick = proc.process(makeRaw({
        accel: { x: Math.sin(smallAngle) * G, y: Math.cos(smallAngle) * G, z: 0 },
      }));
      expect(Math.abs(tick.roll)).toBeLessThan(max);
    });
  });

  // ---------------------------------------------------------------------------
  // Speed passthrough
  // ---------------------------------------------------------------------------

  describe('speed passthrough', () => {
    it('passes speed from raw data extension', () => {
      const tick = proc.process(makeRaw({ speed: 7.3 }));
      expect(tick.speed).toBe(7.3);
    });

    it('defaults speed to 0 when not provided', () => {
      const raw: RawSensorData = { accel: { x: 0, y: G, z: 0 }, gyro: { x: 0, y: 0, z: 0 }, dt: 0.01 };
      const tick = proc.process(raw);
      expect(tick.speed).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Airborne detection
  // ---------------------------------------------------------------------------

  describe('airborne detection', () => {
    it('is not airborne during normal riding', () => {
      const tick = proc.process(makeRaw());
      expect(tick.airborne).toBe(false);
    });

    it('becomes airborne after N consecutive free-fall frames', () => {
      const proc = new Sk8Processor({ freeFallThreshold: 3.0, freeFallFrames: 2 });
      const freeFall = makeRaw({ accel: { x: 0, y: 0.3, z: 0 } });
      proc.process(freeFall);
      const tick = proc.process(freeFall);
      expect(tick.airborne).toBe(true);
    });

    it('jumpHeight is set on the first airborne frame', () => {
      const proc = new Sk8Processor({ freeFallThreshold: 3.0, freeFallFrames: 2 });
      const freeFall = makeRaw({ accel: { x: 0, y: 0.3, z: 0 } });
      proc.process(freeFall);
      const tick = proc.process(freeFall);
      expect(tick.jumpHeight).toBeDefined();
      expect(tick.jumpHeight!).toBeGreaterThan(0);
    });

    it('jumpHeight is undefined on subsequent airborne frames', () => {
      const proc = new Sk8Processor({ freeFallThreshold: 3.0, freeFallFrames: 2 });
      const freeFall = makeRaw({ accel: { x: 0, y: 0.3, z: 0 } });
      proc.process(freeFall);
      proc.process(freeFall); // justLaunched frame
      const tick = proc.process(freeFall); // still airborne, not justLaunched
      expect(tick.jumpHeight).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // State accumulation
  // ---------------------------------------------------------------------------

  describe('state accumulation across frames', () => {
    it('yaw accumulates across multiple frames', () => {
      const proc = new Sk8Processor({ filterAlpha: 1 });
      proc.process(makeRaw({ gyro: { x: 0, y: 1, z: 0 }, dt: 1.0 }));
      const tick = proc.process(makeRaw({ gyro: { x: 0, y: 1, z: 0 }, dt: 1.0 }));
      expect(tick.yaw).toBeCloseTo(2.0, 3);
    });
  });

  // ---------------------------------------------------------------------------
  // reset()
  // ---------------------------------------------------------------------------

  describe('reset()', () => {
    it('clears accumulated orientation', () => {
      const proc = new Sk8Processor({ filterAlpha: 1 });
      proc.process(makeRaw({ gyro: { x: 0, y: 5, z: 0 }, dt: 1.0 }));
      proc.reset();
      const tick = proc.process(makeRaw());
      expect(tick.yaw).toBeCloseTo(0, 3);
    });

    it('clears airborne state', () => {
      const proc = new Sk8Processor({ freeFallThreshold: 3.0, freeFallFrames: 2 });
      const freeFall = makeRaw({ accel: { x: 0, y: 0.3, z: 0 } });
      proc.process(freeFall);
      proc.process(freeFall); // airborne
      proc.reset();
      proc.process(freeFall); // 1 frame after reset
      expect(proc.process(makeRaw()).airborne).toBe(false);
    });
  });
});

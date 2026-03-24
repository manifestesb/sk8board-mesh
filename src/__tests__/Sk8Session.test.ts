import { describe, it, expect, beforeEach } from 'vitest';
import { Sk8Session } from '../core/Sk8Packet.js';
import type { RawSensorData } from '../core/types.js';

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

describe('Sk8Session', () => {
  let session: Sk8Session;

  beforeEach(() => {
    session = new Sk8Session();
  });

  // ---------------------------------------------------------------------------
  // Static factory
  // ---------------------------------------------------------------------------

  describe('Sk8Session.start()', () => {
    it('creates a new session with default config', () => {
      const s = Sk8Session.start();
      expect(s).toBeInstanceOf(Sk8Session);
    });

    it('creates a new session with provided config', () => {
      const s = Sk8Session.start({ gyroUnit: 'deg/s' });
      expect(s).toBeInstanceOf(Sk8Session);
    });
  });

  // ---------------------------------------------------------------------------
  // Output shape
  // ---------------------------------------------------------------------------

  describe('output shape', () => {
    it('returns all required SkateboardTick fields', () => {
      const tick = session.process(makeRaw());
      expect(tick).toHaveProperty('roll');
      expect(tick).toHaveProperty('pitch');
      expect(tick).toHaveProperty('yaw');
      expect(tick).toHaveProperty('speed');
      expect(tick).toHaveProperty('airborne');
    });

    it('all numeric fields are finite numbers', () => {
      const tick = session.process(makeRaw());
      expect(Number.isFinite(tick.roll)).toBe(true);
      expect(Number.isFinite(tick.pitch)).toBe(true);
      expect(Number.isFinite(tick.yaw)).toBe(true);
      expect(Number.isFinite(tick.speed)).toBe(true);
    });

    it('airborne is a boolean', () => {
      const tick = session.process(makeRaw());
      expect(typeof tick.airborne).toBe('boolean');
    });
  });

  // ---------------------------------------------------------------------------
  // Gyro unit conversion
  // ---------------------------------------------------------------------------

  describe('gyroUnit conversion', () => {
    it('treats gyro as rad/s by default', () => {
      const s = new Sk8Session({ filterAlpha: 1 });
      const tick = s.process(makeRaw({ gyro: { x: 0, y: 1, z: 0 }, dt: 1.0 }));
      expect(tick.yaw).toBeCloseTo(1.0, 3); // 1 rad/s × 1s = 1 rad
    });

    it('converts deg/s to rad/s when gyroUnit="deg/s"', () => {
      const s = new Sk8Session({ gyroUnit: 'deg/s', filterAlpha: 1 });
      // 180 deg/s × 1s = π rad
      const tick = s.process(makeRaw({ gyro: { x: 0, y: 180, z: 0 }, dt: 1.0 }));
      expect(tick.yaw).toBeCloseTo(Math.PI, 3);
    });

    it('deg/s and rad/s give different outputs for same raw value', () => {
      const sRad = new Sk8Session({ gyroUnit: 'rad/s',  filterAlpha: 1 });
      const sDeg = new Sk8Session({ gyroUnit: 'deg/s',  filterAlpha: 1 });
      const raw = makeRaw({ gyro: { x: 0, y: 90, z: 0 }, dt: 1.0 });
      expect(sRad.process(raw).yaw).not.toBeCloseTo(sDeg.process(raw).yaw, 2);
    });
  });

  // ---------------------------------------------------------------------------
  // Tilt clamping
  // ---------------------------------------------------------------------------

  describe('maxTiltAngle clamping', () => {
    it('clamps roll to ±maxTiltAngle', () => {
      const max = Math.PI / 6; // 30°
      const s = new Sk8Session({ maxTiltAngle: max, filterAlpha: 0 });
      // Extreme lateral accel → extreme accel angle
      const tick = s.process(makeRaw({ accel: { x: 100, y: 0.01, z: 0 } }));
      expect(tick.roll).toBeLessThanOrEqual(max + 1e-9);
      expect(tick.roll).toBeGreaterThanOrEqual(-max - 1e-9);
    });

    it('clamps pitch to ±maxTiltAngle', () => {
      const max = Math.PI / 6;
      const s = new Sk8Session({ maxTiltAngle: max, filterAlpha: 0 });
      const tick = s.process(makeRaw({ accel: { x: 0, y: 0.01, z: 100 } }));
      expect(tick.pitch).toBeLessThanOrEqual(max + 1e-9);
    });

    it('does not clamp values within range', () => {
      const max = Math.PI / 4;
      const s = new Sk8Session({ maxTiltAngle: max, filterAlpha: 0 });
      const smallAngle = Math.PI / 8;
      const tick = s.process(makeRaw({
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
      const tick = session.process(makeRaw({ speed: 7.3 }));
      expect(tick.speed).toBe(7.3);
    });

    it('defaults speed to 0 when not provided', () => {
      const raw: RawSensorData = { accel: { x: 0, y: G, z: 0 }, gyro: { x: 0, y: 0, z: 0 }, dt: 0.01 };
      const tick = session.process(raw);
      expect(tick.speed).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Airborne detection
  // ---------------------------------------------------------------------------

  describe('airborne detection', () => {
    it('is not airborne during normal riding', () => {
      const tick = session.process(makeRaw());
      expect(tick.airborne).toBe(false);
    });

    it('becomes airborne after N consecutive free-fall frames', () => {
      const s = new Sk8Session({ freeFallThreshold: 3.0, freeFallFrames: 2 });
      const freeFall = makeRaw({ accel: { x: 0, y: 0.3, z: 0 } });
      s.process(freeFall);
      const tick = s.process(freeFall);
      expect(tick.airborne).toBe(true);
    });

    it('jumpHeight is set on the first airborne frame', () => {
      const s = new Sk8Session({ freeFallThreshold: 3.0, freeFallFrames: 2 });
      const freeFall = makeRaw({ accel: { x: 0, y: 0.3, z: 0 } });
      s.process(freeFall);
      const tick = s.process(freeFall);
      expect(tick.jumpHeight).toBeDefined();
      expect(tick.jumpHeight!).toBeGreaterThan(0);
    });

    it('jumpHeight is undefined on subsequent airborne frames', () => {
      const s = new Sk8Session({ freeFallThreshold: 3.0, freeFallFrames: 2 });
      const freeFall = makeRaw({ accel: { x: 0, y: 0.3, z: 0 } });
      s.process(freeFall);
      s.process(freeFall); // justLaunched frame
      const tick = s.process(freeFall); // still airborne, not justLaunched
      expect(tick.jumpHeight).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // State accumulation
  // ---------------------------------------------------------------------------

  describe('state accumulation across frames', () => {
    it('yaw accumulates across multiple frames', () => {
      const s = new Sk8Session({ filterAlpha: 1 });
      s.process(makeRaw({ gyro: { x: 0, y: 1, z: 0 }, dt: 1.0 }));
      const tick = s.process(makeRaw({ gyro: { x: 0, y: 1, z: 0 }, dt: 1.0 }));
      expect(tick.yaw).toBeCloseTo(2.0, 3);
    });
  });

  // ---------------------------------------------------------------------------
  // reset()
  // ---------------------------------------------------------------------------

  describe('reset()', () => {
    it('clears accumulated orientation', () => {
      const s = new Sk8Session({ filterAlpha: 1 });
      s.process(makeRaw({ gyro: { x: 0, y: 5, z: 0 }, dt: 1.0 }));
      s.reset();
      const tick = s.process(makeRaw());
      expect(tick.yaw).toBeCloseTo(0, 3);
    });

    it('clears airborne state', () => {
      const s = new Sk8Session({ freeFallThreshold: 3.0, freeFallFrames: 2 });
      const freeFall = makeRaw({ accel: { x: 0, y: 0.3, z: 0 } });
      s.process(freeFall);
      s.process(freeFall); // airborne
      s.reset();
      s.process(freeFall); // 1 frame after reset
      expect(s.process(makeRaw()).airborne).toBe(false);
    });
  });
});

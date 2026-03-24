import { describe, it, expect, beforeEach } from 'vitest';
import type { SkateboardTick } from '../core/types.js';

import { PhysicsRig } from '../adapters/PhysicsRig.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTick(overrides: Partial<SkateboardTick> = {}): SkateboardTick {
  return { roll: 0, pitch: 0, yaw: 0, speed: 0, airborne: false, ...overrides };
}

const REAL_WHEEL_RADIUS     = 0.026;
const IDLE_SPEED            = 0.3;
const MAX_TRUCK_COMPRESSION = 0.20;

describe('PhysicsRig', () => {
  let rig: PhysicsRig;

  beforeEach(() => {
    rig = new PhysicsRig();
  });

  // ---------------------------------------------------------------------------
  // Stage 1 — Wheel spin
  // ---------------------------------------------------------------------------

  describe('Stage 1 — wheel spin', () => {
    it('spins wheels at idle speed when stationary and grounded', () => {
      const { wheelAngularVelocity } = rig.simulate(makeTick({ speed: 0 }), 0.016);
      expect(wheelAngularVelocity).toBeCloseTo(IDLE_SPEED / REAL_WHEEL_RADIUS, 3);
    });

    it('spins wheels at idle speed when speed is below idle threshold', () => {
      const { wheelAngularVelocity } = rig.simulate(makeTick({ speed: 0.1 }), 0.016);
      expect(wheelAngularVelocity).toBeCloseTo(IDLE_SPEED / REAL_WHEEL_RADIUS, 3);
    });

    it('spins wheels at actual speed when speed exceeds idle threshold', () => {
      const speed = 2.0;
      const { wheelAngularVelocity } = rig.simulate(makeTick({ speed }), 0.016);
      expect(wheelAngularVelocity).toBeCloseTo(speed / REAL_WHEEL_RADIUS, 3);
    });

    it('angular velocity scales linearly with speed above idle', () => {
      const slow = rig.simulate(makeTick({ speed: 1.0 }), 0.016).wheelAngularVelocity;
      const fast = rig.simulate(makeTick({ speed: 2.0 }), 0.016).wheelAngularVelocity;
      expect(fast).toBeCloseTo(slow * 2, 3);
    });

    it('stops wheels when airborne regardless of speed', () => {
      const { wheelAngularVelocity } = rig.simulate(makeTick({ speed: 5.0, airborne: true }), 0.016);
      expect(wheelAngularVelocity).toBe(0);
    });

    it('stops wheels at idle when airborne and speed is zero', () => {
      const { wheelAngularVelocity } = rig.simulate(makeTick({ speed: 0, airborne: true }), 0.016);
      expect(wheelAngularVelocity).toBe(0);
    });

    it('resumes idle spin immediately when grounded after airborne', () => {
      rig.simulate(makeTick({ speed: 0, airborne: true }), 0.016);
      const { wheelAngularVelocity } = rig.simulate(makeTick({ speed: 0, airborne: false }), 0.016);
      expect(wheelAngularVelocity).toBeCloseTo(IDLE_SPEED / REAL_WHEEL_RADIUS, 3);
    });

    it('reset() does not throw', () => {
      expect(() => rig.reset()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Stage 2 — Carving
  // ---------------------------------------------------------------------------

  describe('Stage 2 — carving', () => {
    it('zero carve outputs when roll is zero', () => {
      const { truckCompression, carveAngle } = rig.simulate(makeTick({ roll: 0 }), 0.016);
      expect(truckCompression).toBe(0);
      expect(carveAngle).toBe(0);
    });

    it('positive roll → positive truckCompression and carveAngle', () => {
      const { truckCompression, carveAngle } = rig.simulate(makeTick({ roll: 0.3 }), 0.016);
      expect(truckCompression).toBeGreaterThan(0);
      expect(carveAngle).toBeGreaterThan(0);
    });

    it('negative roll → negative truckCompression and carveAngle', () => {
      const { truckCompression, carveAngle } = rig.simulate(makeTick({ roll: -0.3 }), 0.016);
      expect(truckCompression).toBeLessThan(0);
      expect(carveAngle).toBeLessThan(0);
    });

    it('truckCompression clamps at MAX_TRUCK_COMPRESSION for extreme positive roll', () => {
      const { truckCompression } = rig.simulate(makeTick({ roll: 10 }), 0.016);
      expect(truckCompression).toBeCloseTo(MAX_TRUCK_COMPRESSION, 5);
    });

    it('truckCompression clamps at -MAX_TRUCK_COMPRESSION for extreme negative roll', () => {
      const { truckCompression } = rig.simulate(makeTick({ roll: -10 }), 0.016);
      expect(truckCompression).toBeCloseTo(-MAX_TRUCK_COMPRESSION, 5);
    });

    it('carveAngle is proportional to roll within normal range', () => {
      const a = rig.simulate(makeTick({ roll: 0.2 }), 0.016).carveAngle;
      const b = rig.simulate(makeTick({ roll: 0.4 }), 0.016).carveAngle;
      expect(b).toBeCloseTo(a * 2, 5);
    });

  });
});

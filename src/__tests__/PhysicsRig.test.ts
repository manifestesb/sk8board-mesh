import { describe, it, expect, beforeEach } from 'vitest';
import type { SkateboardTick } from '../core/types.js';

import { PhysicsRig } from '../adapters/PhysicsRig.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTick(overrides: Partial<SkateboardTick> = {}): SkateboardTick {
  return { roll: 0, pitch: 0, yaw: 0, speed: 0, airborne: false, ...overrides };
}

const REAL_WHEEL_RADIUS = 0.026;
const IDLE_SPEED        = 0.3;

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
    it('zero carve output when roll is zero', () => {
      const { carveAngle } = rig.simulate(makeTick({ roll: 0 }), 0.016);
      expect(carveAngle).toBe(0);
    });

    it('positive roll → positive carveAngle', () => {
      const { carveAngle } = rig.simulate(makeTick({ roll: 0.2 }), 0.016);
      expect(carveAngle).toBeGreaterThan(0);
    });

    it('negative roll → negative carveAngle', () => {
      const { carveAngle } = rig.simulate(makeTick({ roll: -0.2 }), 0.016);
      expect(carveAngle).toBeLessThan(0);
    });

    it('carveAngle is proportional to roll', () => {
      const a = rig.simulate(makeTick({ roll: 0.1 }), 0.016).carveAngle;
      const b = rig.simulate(makeTick({ roll: 0.2 }), 0.016).carveAngle;
      expect(b).toBeCloseTo(a * 2, 5);
    });
  });

  // ---------------------------------------------------------------------------
  // Stage 3 — Truck steering
  // ---------------------------------------------------------------------------

  describe('Stage 3 — truck steering', () => {
    it('steerAngle is zero when roll is zero', () => {
      const { steerAngle } = rig.simulate(makeTick({ roll: 0 }), 0.016);
      expect(steerAngle).toBe(0);
    });

    it('positive roll → positive steerAngle', () => {
      const { steerAngle } = rig.simulate(makeTick({ roll: 0.2 }), 0.016);
      expect(steerAngle).toBeGreaterThan(0);
    });

    it('negative roll → negative steerAngle', () => {
      const { steerAngle } = rig.simulate(makeTick({ roll: -0.2 }), 0.016);
      expect(steerAngle).toBeLessThan(0);
    });
  });
});

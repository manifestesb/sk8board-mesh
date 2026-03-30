import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { TruckAnimation } from '../adapters/TruckAnimation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRig() {
  return {
    rearTruck:  new THREE.Group(),
    frontTruck: new THREE.Group(),
  };
}

// ---------------------------------------------------------------------------
// TruckAnimation
// ---------------------------------------------------------------------------

describe('TruckAnimation', () => {
  let rig: ReturnType<typeof makeRig>;
  let anim: TruckAnimation;

  beforeEach(() => {
    rig  = makeRig();
    anim = new TruckAnimation(rig.rearTruck, rig.frontTruck, 0.1);
  });

  // -------------------------------------------------------------------------
  // animate(_, 0) — neutral lean: no drift
  // -------------------------------------------------------------------------

  describe('animate with zero leanAngle', () => {
    it('leaves rearTruck.position.x at 0', () => {
      anim.animate(0.3, 0);
      expect(rig.rearTruck.position.x).toBeCloseTo(0);
    });

    it('leaves frontTruck.position.x at 0', () => {
      anim.animate(0.3, 0);
      expect(rig.frontTruck.position.x).toBeCloseTo(0);
    });
  });

  // -------------------------------------------------------------------------
  // animate(_, +θ) — positive lean drives drift
  // -------------------------------------------------------------------------

  describe('animate with positive leanAngle', () => {
    const θ = 0.3;

    it('shifts rearTruck leftward (position.x < 0)', () => {
      anim.animate(0, θ);
      expect(rig.rearTruck.position.x).toBeLessThan(0);
    });

    it('shifts frontTruck rightward (position.x > 0)', () => {
      anim.animate(0, θ);
      expect(rig.frontTruck.position.x).toBeGreaterThan(0);
    });

    it('rearTruck and frontTruck displace symmetrically', () => {
      anim.animate(0, θ);
      expect(rig.rearTruck.position.x).toBeCloseTo(-rig.frontTruck.position.x, 10);
    });
  });

  // -------------------------------------------------------------------------
  // symmetry — negative leanAngle mirrors positive
  // -------------------------------------------------------------------------

  describe('symmetry', () => {
    const θ = 0.3;

    it('rearTruck.position.x(−θ) === −rearTruck.position.x(+θ)', () => {
      anim.animate(0, θ);
      const pos = rig.rearTruck.position.x;
      anim.animate(0, -θ);
      expect(rig.rearTruck.position.x).toBeCloseTo(-pos, 10);
    });
  });

  // -------------------------------------------------------------------------
  // reset — leanAngle back to 0 restores neutral drift
  // -------------------------------------------------------------------------

  describe('reset after lean', () => {
    it('rearTruck.position.x returns to 0', () => {
      anim.animate(0, 0.5);
      anim.animate(0, 0);
      expect(rig.rearTruck.position.x).toBeCloseTo(0);
    });

    it('frontTruck.position.x returns to 0', () => {
      anim.animate(0, 0.5);
      anim.animate(0, 0);
      expect(rig.frontTruck.position.x).toBeCloseTo(0);
    });
  });
});

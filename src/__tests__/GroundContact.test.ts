import { describe, it, expect } from 'vitest';
import { GroundContact } from '../core/GroundContact.js';

// ---------------------------------------------------------------------------
// Known geometry — SkateboardAsset
// ---------------------------------------------------------------------------

const REAR_TRUCK_Y = 0.101;
const REAR_TRUCK_Z = -0.617;
const TAIL_TIP_Y   = 0.220;
const TAIL_TIP_Z   = -1.163;

const FRONT_TRUCK_Y = 0.101;
const FRONT_TRUCK_Z = 0.617;
const NOSE_TIP_Y    = 0.220;
const NOSE_TIP_Z    = 1.163;

describe('GroundContact', () => {
  const gc = new GroundContact();

  // -------------------------------------------------------------------------
  // contactAngle
  // -------------------------------------------------------------------------

  describe('contactAngle', () => {
    it('returns ~0.40 rad for SkateboardAsset tail geometry', () => {
      const angle = gc.contactAngle(REAR_TRUCK_Y, REAR_TRUCK_Z, TAIL_TIP_Y, TAIL_TIP_Z);
      expect(angle).toBeGreaterThan(0.35);
      expect(angle).toBeLessThan(0.45);
    });

    it('returns a positive angle', () => {
      const angle = gc.contactAngle(REAR_TRUCK_Y, REAR_TRUCK_Z, TAIL_TIP_Y, TAIL_TIP_Z);
      expect(angle).toBeGreaterThan(0);
    });

    it('is symmetric for nose geometry (mirrored Z)', () => {
      const tailAngle = gc.contactAngle(REAR_TRUCK_Y, REAR_TRUCK_Z, TAIL_TIP_Y, TAIL_TIP_Z);
      const noseAngle = gc.contactAngle(FRONT_TRUCK_Y, FRONT_TRUCK_Z, NOSE_TIP_Y, NOSE_TIP_Z);
      expect(noseAngle).toBeCloseTo(tailAngle, 3);
    });

    it('verifies the tail reaches Y=0 at the computed angle', () => {
      const angle = gc.contactAngle(REAR_TRUCK_Y, REAR_TRUCK_Z, TAIL_TIP_Y, TAIL_TIP_Z);
      const dy  = TAIL_TIP_Y - REAR_TRUCK_Y;
      const adz = -Math.abs(TAIL_TIP_Z - REAR_TRUCK_Z);
      const tailY = REAR_TRUCK_Y + dy * Math.cos(angle) + adz * Math.sin(angle);
      expect(tailY).toBeCloseTo(0, 5);
    });

    it('verifies the nose reaches Y=0 at the computed angle', () => {
      const angle = gc.contactAngle(FRONT_TRUCK_Y, FRONT_TRUCK_Z, NOSE_TIP_Y, NOSE_TIP_Z);
      const dy  = NOSE_TIP_Y - FRONT_TRUCK_Y;
      const adz = -Math.abs(NOSE_TIP_Z - FRONT_TRUCK_Z);
      const noseY = FRONT_TRUCK_Y + dy * Math.cos(angle) + adz * Math.sin(angle);
      expect(noseY).toBeCloseTo(0, 5);
    });
  });

  // -------------------------------------------------------------------------
  // constrain
  // -------------------------------------------------------------------------

  describe('constrain', () => {
    const angle = 0.4;

    it('returns [pitch, 0] when pitch is below contact angle', () => {
      expect(gc.constrain(0.2, angle)).toEqual([0.2, 0]);
    });

    it('returns [contactAngle, overflow] when pitch exceeds contact angle', () => {
      const [pivot, contact] = gc.constrain(0.6, angle);
      expect(pivot).toBe(angle);
      expect(contact).toBeCloseTo(0.2, 10);
    });

    it('returns [0, 0] when pitch is zero', () => {
      expect(gc.constrain(0, angle)).toEqual([0, 0]);
    });

    it('returns [contactAngle, 0] when pitch equals contact angle exactly', () => {
      expect(gc.constrain(angle, angle)).toEqual([angle, 0]);
    });
  });
});

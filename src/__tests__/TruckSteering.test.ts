import { describe, it, expect } from 'vitest';
import { TruckSteering } from '../core/TruckSteering.js';

const DEG = Math.PI / 180;

describe('TruckSteering', () => {
  it('steer(0) is zero regardless of truck angle', () => {
    const ts = new TruckSteering({ truckAngle: 50 });
    expect(ts.steer(0)).toBe(0);
  });

  it('positive lean → positive steer angle', () => {
    const ts = new TruckSteering({ truckAngle: 50 });
    expect(ts.steer(0.3)).toBeGreaterThan(0);
  });

  it('negative lean → negative steer angle', () => {
    const ts = new TruckSteering({ truckAngle: 50 });
    expect(ts.steer(-0.3)).toBeLessThan(0);
  });

  it('is antisymmetric: steer(-x) === -steer(x)', () => {
    const ts = new TruckSteering({ truckAngle: 50 });
    expect(ts.steer(-0.3)).toBeCloseTo(-ts.steer(0.3), 10);
  });

  it('matches lean-to-steer formula for known values (lean=10°, α=50° → θ≈11.9°)', () => {
    const ts = new TruckSteering({ truckAngle: 50 });
    const lean = 10 * DEG;
    const expected = Math.atan(Math.tan(lean) * Math.tan(50 * DEG));
    expect(ts.steer(lean)).toBeCloseTo(expected, 10);
    // ~11.9° in radians
    expect(ts.steer(lean) / DEG).toBeCloseTo(11.9, 0);
  });

  it('higher truck angle produces more steer for the same lean', () => {
    const lean = 0.2;
    const street  = new TruckSteering({ truckAngle: 50 });
    const downhill = new TruckSteering({ truckAngle: 20 });
    expect(street.steer(lean)).toBeGreaterThan(downhill.steer(lean));
  });

  it('steer scales with lean (monotonically increasing)', () => {
    const ts = new TruckSteering({ truckAngle: 50 });
    expect(ts.steer(0.1)).toBeLessThan(ts.steer(0.2));
    expect(ts.steer(0.2)).toBeLessThan(ts.steer(0.3));
  });
});

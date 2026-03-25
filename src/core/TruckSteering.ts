// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export interface TruckConfig {
  /** Truck angle in degrees — baseplate angle relative to ground.
   *  Typical values: 50° street, 45° cruiser, 20–25° downhill. */
  truckAngle: number;
}

export interface Steerable {
  steer(leanRad: number): number;
}

// ---------------------------------------------------------------------------
// TruckSteering
// ---------------------------------------------------------------------------

/**
 * Computes hanger steer angle from deck lean using the lean-to-steer formula:
 *
 *   θ = arctan( tan(β) × tan(α) )
 *
 * where β = lean angle (roll) and α = truck angle (baseplate angle).
 *
 * Reference: docs/truck-steering.md §3
 */
export class TruckSteering implements Steerable {
  private readonly alpha: number; // truck angle in radians

  constructor(config: TruckConfig) {
    this.alpha = (config.truckAngle * Math.PI) / 180;
  }

  steer(leanRad: number): number {
    return Math.atan(Math.tan(leanRad) * Math.tan(this.alpha));
  }
}

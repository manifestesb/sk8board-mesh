// ---------------------------------------------------------------------------
// Constrainable — ground contact capability
// ---------------------------------------------------------------------------

export interface Constrainable {
  contactAngle(pivotY: number, pivotZ: number, tipY: number, tipZ: number): number;
  constrain(pitch: number, contactAngle: number): [number, number];
}

// ---------------------------------------------------------------------------
// GroundContact
// ---------------------------------------------------------------------------

/**
 * Pure-math module that computes pitch constraints when a deck extremity
 * (tail or nose) touches the ground plane at Y = 0.
 *
 * Given the pitch pivot (truck axle) and the deck tip position, it finds
 * the contact angle threshold and splits any excess pitch into a secondary
 * rotation around the ground contact point.
 */
export class GroundContact implements Constrainable {

  /**
   * Computes the smallest positive pitch angle at which the tip reaches Y = 0
   * when rotated around the pivot.
   *
   * Solves:  0 = pivotY + dy·cos(θ) − |dz|·sin(θ)
   *
   * The absolute value of dz makes the formula work for both tail (dz < 0)
   * and nose (dz > 0), since the rotation direction differs but the contact
   * geometry is symmetric.
   */
  contactAngle(pivotY: number, pivotZ: number, tipY: number, tipZ: number): number {
    const dy  = tipY - pivotY;
    const adz = -Math.abs(tipZ - pivotZ);
    const R   = Math.sqrt(dy * dy + adz * adz);
    return Math.atan2(adz, dy) + Math.acos(-pivotY / R);
  }

  /**
   * Splits pitch into pivot rotation (capped at contactAngle) and overflow
   * contact rotation.
   */
  constrain(pitch: number, contactAngle: number): [number, number] {
    if (pitch <= contactAngle) return [pitch, 0];
    return [contactAngle, pitch - contactAngle];
  }
}

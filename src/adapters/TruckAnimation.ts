import * as THREE from 'three';
import type { TruckAnimatable } from './Mountable.js';

// ---------------------------------------------------------------------------
// Constants — visual tuning
// ---------------------------------------------------------------------------

/** Lateral drift of the hanger on the X axis per radian of lean angle.
 *  Simulates the hanger following the kingpin/bushing block position. */
const DEFAULT_HANGER_DRIFT = 0.0;

// ---------------------------------------------------------------------------
// TruckAnimation
// ---------------------------------------------------------------------------

/**
 * Drives the per-frame visual response of truck accessories during steering.
 *
 * - Hangers shift laterally to stay visually aligned with the fixed kingpin
 *   and bushing block.
 * - Bushings remain fixed (centered on the kingpin) — no rotation applied.
 */
export class TruckAnimation implements TruckAnimatable {
  constructor(
    private readonly rearTruck:   THREE.Group,
    private readonly frontTruck:  THREE.Group,
    private readonly hangerDrift: number = DEFAULT_HANGER_DRIFT,
  ) {}

  animate(steerAngle: number, leanAngle: number): void {
    const drift = Math.sin(leanAngle) * this.hangerDrift;
    this.rearTruck.position.x  = -drift;
    this.frontTruck.position.x = drift;
  }
}

import type { Vector3 } from '../types.js';

export interface JumpResult {
  /** True during the entire airborne phase */
  airborne: boolean;
  /** True only on the first frame of a new jump (rising edge) */
  justLaunched: boolean;
  /** Estimated peak height in Three.js units based on launch accel impulse */
  estimatedHeight: number;
}

/**
 * Jump detector based on free-fall detection.
 *
 * Physics: when the board leaves the ground, the only force acting on the
 * sensor is inertia — gravity is no longer "felt" by the IMU. The total
 * acceleration magnitude drops from ~9.81 m/s² toward 0.
 *
 * Detection: require N consecutive frames below freeFallThreshold to
 * confirm airborne (avoids false positives from bumps/vibration).
 *
 * Height estimation: uses the vertical impulse immediately before free-fall
 * (the "pop" spike in accel.y) to approximate peak height via kinematics:
 *   h = v₀² / (2g)   where v₀ = (accelPeak - g) * dt_pop
 */
export class JumpDetector {
  private airborne = false;
  private consecutiveFreeFallFrames = 0;
  private peakAccelY = 0;       // max accel.y seen before this jump (pop spike)
  private estimatedHeight = 0;
  private prevAccelY = 9.81;

  constructor(
    private freeFallThreshold = 3.0, // m/s² — total magnitude below this = free-fall
    private requiredFrames = 2,      // consecutive frames needed to confirm jump
  ) {}

  /**
   * Process one accelerometer sample.
   * @param accel  Accelerometer in m/s²
   * @param dt     Time delta in seconds
   */
  update(accel: Vector3, dt: number): JumpResult {
    const magnitude = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);
    const wasAirborne = this.airborne;

    if (magnitude < this.freeFallThreshold) {
      this.consecutiveFreeFallFrames++;

      if (this.consecutiveFreeFallFrames >= this.requiredFrames && !this.airborne) {
        // Transition: grounded → airborne
        this.airborne = true;
        this.estimatedHeight = this.estimateHeight(this.peakAccelY, dt);
        this.peakAccelY = 0;
      }
    } else {
      this.consecutiveFreeFallFrames = 0;

      if (this.airborne) {
        // Transition: airborne → grounded (impact detected)
        this.airborne = false;
      }

      // Track accel.y peak before the jump (pop impulse)
      if (accel.y > this.peakAccelY) {
        this.peakAccelY = accel.y;
      }
    }

    this.prevAccelY = accel.y;

    return {
      airborne: this.airborne,
      justLaunched: this.airborne && !wasAirborne,
      estimatedHeight: this.estimatedHeight,
    };
  }

  reset(): void {
    this.airborne = false;
    this.consecutiveFreeFallFrames = 0;
    this.peakAccelY = 0;
    this.estimatedHeight = 0;
    this.prevAccelY = 9.81;
  }

  /**
   * Estimate peak height from the pop acceleration spike.
   * v₀ = (peakAccel - g) * dt  →  h = v₀² / (2g)
   * Clamped to [0.1, 2.0] for visual plausibility.
   */
  private estimateHeight(peakAccelY: number, dt: number): number {
    const g = 9.81;
    const extraAccel = Math.max(0, peakAccelY - g);
    const v0 = extraAccel * dt;
    const height = (v0 * v0) / (2 * g);
    // Convert real meters to Three.js units (model scale ~3.3x real)
    // and clamp for visual plausibility
    return Math.max(0.1, Math.min(2.0, height * 3.3));
  }
}

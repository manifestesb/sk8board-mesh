import type { Vector3 } from '../types.js';

/**
 * Complementary filter — fuses accelerometer and gyroscope to estimate
 * board orientation without drift.
 *
 * Problem:
 *   - Gyroscope integrates accurately short-term but accumulates drift over time.
 *   - Accelerometer gives absolute tilt but is noisy during dynamic movement.
 *
 * Solution:
 *   angle = alpha * (angle + gyro * dt) + (1 - alpha) * accel_angle
 *
 *   alpha close to 1 → trusts gyro (responsive, may drift)
 *   alpha close to 0 → trusts accel (stable, noisy during motion)
 *   Typical value: 0.96
 *
 * Sensor mounting assumed: flat on rear truck, nose pointing +Z.
 *   accel.x → lateral tilt  (used for roll)
 *   accel.z → fore/aft tilt (used for pitch)
 *   accel.y → vertical      (gravity reference, ≈ 9.81 at rest)
 *   gyro.x  → roll rate
 *   gyro.y  → yaw rate (integrated, no absolute reference)
 *   gyro.z  → pitch rate
 */
export class ComplementaryFilter {
  private roll = 0;   // radians
  private pitch = 0;  // radians
  private yaw = 0;    // radians (gyro-only, drifts over time)

  constructor(private alpha = 0.96) {}

  /**
   * Process one sensor sample.
   * @param accel  Accelerometer readings in m/s²
   * @param gyro   Gyroscope readings in rad/s
   * @param dt     Time delta in seconds since last sample
   * @returns Estimated { roll, pitch, yaw } in radians
   */
  update(accel: Vector3, gyro: Vector3, dt: number): { roll: number; pitch: number; yaw: number } {
    // --- Accel-derived angles (absolute reference, noisy during motion) ---
    // Roll: board tilting left/right around Z (long) axis
    const accelRoll = Math.atan2(accel.x, accel.y);
    // Pitch: nose up/down around X (truck) axis
    const accelPitch = Math.atan2(accel.z, accel.y);

    // --- Integrate gyro (responsive, drifts) ---
    const gyroRoll  = this.roll  + gyro.x * dt;
    const gyroPitch = this.pitch + gyro.z * dt;
    const gyroYaw   = this.yaw   + gyro.y * dt;

    // --- Complementary blend ---
    this.roll  = this.alpha * gyroRoll  + (1 - this.alpha) * accelRoll;
    this.pitch = this.alpha * gyroPitch + (1 - this.alpha) * accelPitch;
    // Yaw has no accel reference — pure gyro integration
    this.yaw   = gyroYaw;

    return { roll: this.roll, pitch: this.pitch, yaw: this.yaw };
  }

  /** Reset accumulated state (e.g. on sensor reconnect) */
  reset(): void {
    this.roll = 0;
    this.pitch = 0;
    this.yaw = 0;
  }

  /** Manually set alpha without creating a new instance */
  setAlpha(alpha: number): void {
    this.alpha = Math.max(0, Math.min(1, alpha));
  }
}

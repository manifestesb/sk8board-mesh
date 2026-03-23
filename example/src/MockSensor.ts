import type { RawSensorData } from '@manifeste/sk8board';

/**
 * MockSensor — generates realistic-looking IMU data without hardware.
 *
 * Simulates a skate session:
 *   0–4s   : cruising straight, gentle speed ramp-up
 *   4–8s   : carving left/right (sinusoidal roll)
 *   8–9s   : ollie (free-fall spike)
 *   9–13s  : carving again
 *   13–14s : kickflip-style (roll during airborne)
 *   14–18s : slow stop
 *   loops
 */
export class MockSensor {
  private t = 0;
  private prevTime = performance.now();
  private prevAccelY = 9.81;

  /** Returns the next synthetic RawSensorData frame */
  next(): RawSensorData {
    const now = performance.now();
    const dt  = Math.min((now - this.prevTime) / 1000, 0.1); // cap at 100ms
    this.prevTime = now;
    this.t += dt;

    const loop = 18; // session loop duration in seconds
    const phase = this.t % loop;

    // -----------------------------------------------------------------------
    // Speed profile  (m/s)
    // -----------------------------------------------------------------------
    let speed = 0;
    if (phase < 4)        speed = lerp(0, 4, phase / 4);
    else if (phase < 14)  speed = 4;
    else                  speed = lerp(4, 0, (phase - 14) / 4);

    // -----------------------------------------------------------------------
    // Roll  (lateral carve, rad)
    // -----------------------------------------------------------------------
    let rollRate = 0;
    if (phase >= 4 && phase < 8) {
      // carving — sinusoidal roll rate
      rollRate = Math.sin((phase - 4) * Math.PI) * 0.8;
    } else if (phase >= 9 && phase < 13) {
      rollRate = Math.sin((phase - 9) * Math.PI) * 0.6;
    }

    // -----------------------------------------------------------------------
    // Pitch (nose up/down, rad/s)
    // -----------------------------------------------------------------------
    let pitchRate = 0;
    if (phase >= 7.8 && phase < 8.0) {
      // tail pop before ollie
      pitchRate = -3.0;
    } else if (phase >= 8.0 && phase < 8.5) {
      pitchRate = 1.5;
    }

    // -----------------------------------------------------------------------
    // Jump simulation — free-fall window
    // Ollie:    8.0–8.7s
    // Kickflip: 13.0–13.7s
    // -----------------------------------------------------------------------
    const inFreeFall =
      (phase >= 8.05 && phase < 8.65) ||
      (phase >= 13.05 && phase < 13.65);

    const inPopSpike =
      (phase >= 7.85 && phase < 8.05) ||
      (phase >= 12.85 && phase < 13.05);

    // -----------------------------------------------------------------------
    // Build acceleration vector (m/s²)
    // -----------------------------------------------------------------------
    let accelY: number;

    if (inFreeFall) {
      // Free-fall: magnitude drops toward 0 (board airborne)
      accelY = 0.5 + noise() * 0.3;
    } else if (inPopSpike) {
      // Pop impulse: momentary spike above 1g
      accelY = 18 + noise() * 2;
    } else {
      // Normal riding: gravity + vibration
      accelY = 9.81 + noise() * 0.4;
    }

    // Lateral tilt component (from carving)
    const tiltAngle = Math.sin((phase - 4) * Math.PI * 0.5) * 0.3;
    const accelX = Math.sin(tiltAngle) * 9.81 + noise() * 0.3;
    const accelZ = noise() * 0.2 + (speed > 0 ? 0.1 : 0); // slight fore/aft from speed

    // -----------------------------------------------------------------------
    // Gyroscope (rad/s)  — roll/pitch as computed above, yaw from carving
    // -----------------------------------------------------------------------
    const gyroX = rollRate + noise() * 0.05;
    const gyroY = rollRate * 0.3 + noise() * 0.02; // yaw follows carve
    const gyroZ = pitchRate + noise() * 0.05;

    this.prevAccelY = accelY;

    return {
      accel: { x: accelX, y: accelY, z: accelZ },
      gyro:  { x: gyroX,  y: gyroY,  z: gyroZ  },
      dt,
      speed, // extension read by Sk8Processor
    } as RawSensorData & { speed: number };
  }

  /** Current session time in seconds (within the loop) */
  get sessionTime(): number {
    return this.t % 18;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** Small white noise */
function noise(): number {
  return (Math.random() - 0.5) * 2;
}

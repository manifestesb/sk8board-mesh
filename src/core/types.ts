// ---------------------------------------------------------------------------
// Raw data from the IMU sensor (accel + gyro, no fusion)
// ---------------------------------------------------------------------------

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Raw sensor frame as received from the hardware.
 * Sensor is mounted on the rear truck of the skateboard.
 *
 * Axis convention (sensor mounted flat on truck, nose pointing +Z):
 *   accel.x — lateral (left/right)
 *   accel.y — vertical (≈ +9.81 m/s² at rest, drops during free-fall)
 *   accel.z — fore/aft (along board length)
 *
 *   gyro.x  — roll rate  (rotation around board long axis)
 *   gyro.y  — yaw rate   (heading change)
 *   gyro.z  — pitch rate (nose up/down)
 */
export interface RawSensorData {
  accel: Vector3; // m/s²
  gyro: Vector3;  // rad/s  (set gyroUnit in SensorConfig if deg/s)
  dt: number;     // seconds elapsed since previous sample
}

// ---------------------------------------------------------------------------
// Normalized tick consumed by Skateboard.tick()
// ---------------------------------------------------------------------------

/**
 * Fully processed, ready-to-render state derived from one sensor sample.
 * This is the contract between Sk8Packet.toTick() and Skateboard.tick().
 */
export interface SkateboardTick {
  /** Lateral tilt — radians, positive = lean right */
  roll: number;
  /** Nose up/down — radians, positive = nose up */
  pitch: number;
  /** Heading change — radians, accumulated yaw */
  yaw: number;
  /** Board speed in m/s (drives wheel rotation) */
  speed: number;
  /** True while board is airborne (free-fall detected) */
  airborne: boolean;
  /** Estimated peak jump height in Three.js units (optional) */
  jumpHeight?: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SensorConfig {
  /** Input unit for gyroscope data (default: 'rad/s') */
  gyroUnit?: 'rad/s' | 'deg/s';
  /** Maximum visual tilt clamped before passing to model (default: Math.PI/5) */
  maxTiltAngle?: number;
  /**
   * Total acceleration magnitude threshold below which free-fall is assumed.
   * At rest ≈ 9.81 m/s². Default: 3.0 m/s².
   */
  freeFallThreshold?: number;
  /**
   * Number of consecutive frames below freeFallThreshold required to confirm jump.
   * Default: 2
   */
  freeFallFrames?: number;
  /**
   * Complementary filter alpha — gyro trust ratio (0–1).
   * Higher = more responsive, less drift correction. Default: 0.96
   */
  filterAlpha?: number;
}

export interface SkateboardOptions {
  /**
   * Path to the Draco WASM decoder directory served by the host app.
   * Default: '/draco/'
   */
  dracoPath?: string;
  /** Truck color hex string. Default: '#888888' */
  truckColor?: string;
  /**
   * Peak jump height in Three.js units when jumpHeight is not in the tick.
   * Default: 0.8
   */
  defaultJumpHeight?: number;
}

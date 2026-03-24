import { ComplementaryFilter } from './filters/ComplementaryFilter.js';
import { JumpDetector } from './filters/JumpDetector.js';
import type { RawSensorData, SkateboardTick, SensorConfig } from './types.js';

const DEG_TO_RAD = Math.PI / 180;

/**
 * Sk8Packet wraps a single raw sensor frame and converts it to a
 * SkateboardTick ready for Skateboard.tick().
 *
 * Each instance shares a persistent ComplementaryFilter and JumpDetector
 * so that state (orientation, airborne phase) is correctly accumulated
 * across packets.
 *
 * Usage:
 *   const packet = new Sk8Packet(filter, detector, rawData, config);
 *   skateboard.tick(packet.toTick());
 *
 * Or via Sk8Session for continuous streams:
 *   const session = Sk8Session.start(config);
 *   skateboard.tick(session.process(rawData));
 */
export class Sk8Packet {
  constructor(
    private readonly filter: ComplementaryFilter,
    private readonly detector: JumpDetector,
    private readonly raw: RawSensorData,
    private readonly config: Required<SensorConfig>,
  ) {}

  toTick(): SkateboardTick {
    const { accel, gyro, dt } = this.raw;

    // Convert gyro to rad/s if needed
    const gyroRad = this.config.gyroUnit === 'deg/s'
      ? { x: gyro.x * DEG_TO_RAD, y: gyro.y * DEG_TO_RAD, z: gyro.z * DEG_TO_RAD }
      : gyro;

    // Fuse accel + gyro into orientation
    const orientation = this.filter.fuse(accel, gyroRad, dt);

    // Detect jump
    const jump = this.detector.detect(accel, dt);

    // Clamp tilt angles for visual sanity
    const clamp = (v: number) =>
      Math.max(-this.config.maxTiltAngle, Math.min(this.config.maxTiltAngle, v));

    // Speed is not derivable from IMU alone — caller must set it via
    // the rawData extension or provide 0. See RawSensorData.
    const speed = (this.raw as RawSensorData & { speed?: number }).speed ?? 0;

    return {
      roll:        clamp(orientation.roll),
      pitch:       clamp(orientation.pitch),
      yaw:         orientation.yaw,
      speed,
      airborne:    jump.airborne,
      jumpHeight:  jump.justLaunched ? jump.estimatedHeight : undefined,
    };
  }
}

// ---------------------------------------------------------------------------
// Sk8Session — stateful wrapper for continuous sensor streams
// ---------------------------------------------------------------------------

/**
 * Stateful session that keeps the filter and detector alive across packets.
 * This is the recommended entry point for continuous sensor streams.
 *
 * Usage:
 *   const session = Sk8Session.start({ gyroUnit: 'deg/s' });
 *
 *   function listener(pkt: SensorEvent) {
 *     skateboard.tick(session.process(pkt.toRaw()));
 *     renderer.render(scene, camera);
 *   }
 */
export class Sk8Session {
  private readonly filter: ComplementaryFilter;
  private readonly detector: JumpDetector;
  private readonly config: Required<SensorConfig>;

  constructor(config: SensorConfig = {}) {
    this.config = resolveConfig(config);
    this.filter = new ComplementaryFilter(this.config.filterAlpha);
    this.detector = new JumpDetector(
      this.config.freeFallThreshold,
      this.config.freeFallFrames,
    );
  }

  /** Factory — creates a new session with optional sensor config. */
  static start(config?: SensorConfig): Sk8Session {
    return new Sk8Session(config);
  }

  process(raw: RawSensorData): SkateboardTick {
    const packet = new Sk8Packet(this.filter, this.detector, raw, this.config);
    return packet.toTick();
  }

  reset(): void {
    this.filter.reset();
    this.detector.reset();
  }
}

function resolveConfig(config: SensorConfig): Required<SensorConfig> {
  return {
    gyroUnit:          config.gyroUnit          ?? 'rad/s',
    maxTiltAngle:      config.maxTiltAngle       ?? Math.PI / 5,
    freeFallThreshold: config.freeFallThreshold  ?? 3.0,
    freeFallFrames:    config.freeFallFrames     ?? 2,
    filterAlpha:       config.filterAlpha        ?? 0.96,
  };
}

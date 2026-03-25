import type { SkateboardTick } from '../core/types.js';
import { TruckSteering } from '../core/TruckSteering.js';

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export interface RigState {
  wheelAngularVelocity: number; // rad/s — uniform for all 4 wheels
  carveAngle:           number; // radians — modelGroup Y nudge toward lean
  steerAngle:           number; // radians — hanger Y rotation from lean-to-steer formula
}

export interface Simulatable {
  simulate(tick: SkateboardTick, dt: number): RigState;
  reset(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Real skateboard wheel radius in metres (52mm wheel) */
const REAL_WHEEL_RADIUS = 0.026;

/** Minimum visual roll speed at rest — keeps wheels alive when speed = 0 */
const IDLE_SPEED = 0.3; // m/s

const CARVE_SCALE = 0.08;

/** Visual damping for steer angle — the model pivot is not at the kingpin,
 *  so the raw lean-to-steer output looks exaggerated. */
const STEER_SCALE = 0.3;

/** Default truck angle for street skateboard (degrees) */
const DEFAULT_TRUCK_ANGLE = 50;

// ---------------------------------------------------------------------------
// PhysicsRig
// ---------------------------------------------------------------------------

export class PhysicsRig implements Simulatable {
  private readonly truckSteering = new TruckSteering({ truckAngle: DEFAULT_TRUCK_ANGLE });

  simulate(tick: SkateboardTick, _dt: number): RigState {
    const wheelAngularVelocity = tick.airborne
      ? 0
      : Math.max(tick.speed, IDLE_SPEED) / REAL_WHEEL_RADIUS;

    const carveAngle = tick.roll * CARVE_SCALE;
    const steerAngle = this.truckSteering.steer(tick.roll) * STEER_SCALE;

    return { wheelAngularVelocity, carveAngle, steerAngle };
  }

  reset(): void {}
}

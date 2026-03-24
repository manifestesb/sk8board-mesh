import type { SkateboardTick } from '../core/types.js';

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export interface RigState {
  wheelAngularVelocity: number; // rad/s — uniform for all 4 wheels
  truckCompression:     number; // radians — truck group Z rotation (wheels follow)
  carveAngle:           number; // radians — modelGroup Y nudge toward lean
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

const TRUCK_COMPRESSION_SCALE = 0.15;
const MAX_TRUCK_COMPRESSION   = 0.20; // rad (~11.5°)
const CARVE_SCALE             = 0.08;

// ---------------------------------------------------------------------------
// PhysicsRig
// ---------------------------------------------------------------------------

export class PhysicsRig implements Simulatable {
  simulate(tick: SkateboardTick, _dt: number): RigState {
    const wheelAngularVelocity = tick.airborne
      ? 0
      : Math.max(tick.speed, IDLE_SPEED) / REAL_WHEEL_RADIUS;

    const roll             = tick.roll;
    const truckCompression = Math.max(-MAX_TRUCK_COMPRESSION,
                             Math.min( MAX_TRUCK_COMPRESSION, roll * TRUCK_COMPRESSION_SCALE));
    const carveAngle       = roll * CARVE_SCALE;

    return { wheelAngularVelocity, truckCompression, carveAngle };
  }

  reset(): void {}
}
